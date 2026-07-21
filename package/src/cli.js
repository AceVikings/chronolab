import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Docker } from './docker.js';
import { ChargebeeTimeMachine } from './chargebee.js';
import { loadChronoConfig } from './config.js';
import { addDuration, normalizeTime, parseDuration } from './duration.js';
import { asChronoError, ChronoError } from './errors.js';
import { atomicWrite, readJson, withLock, writeJson } from './files.js';
import { serveMcp } from './mcp.js';
import { PaddleSimulator } from './paddle.js';
import { clearActive, createRun, event, loadRun, paths, saveState, writeClock } from './state.js';
import { StripeTestClocks } from './stripe.js';
import { listenWebhooks, releaseBuffered } from './webhook.js';
import { renderWrapperDockerfile } from './wrapper.js';

const HELP = `ChronoLab — deterministic wall-clock testing for Docker

Usage:
  chrono build -f Dockerfile -t IMAGE [CONTEXT]
  chrono run IMAGE --at TIMESTAMP [-- COMMAND...]
  chrono compose build|up -f compose.yaml [--config .chronolab.yaml]
  chrono now
  chrono set TIMESTAMP
  chrono advance DURATION
  chrono warp SPEED
  chrono exec COMMAND...
  chrono doctor [IMAGE]
  chrono reset
  chrono destroy
  chrono stripe create|attach|status|detach|delete|listen
  chrono chargebee start|attach|status|detach
  chrono paddle simulate|status|listen|detach
  chrono events
  chrono export [--output FILE]
  chrono mcp serve

Global options: --json, --root PATH, --run RUN_ID, --help, --version`;

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  const aliases = { '-f': 'file', '-t': 'tag', '-h': 'help' };
  const booleans = new Set(['json', 'help', 'version', 'no-verify', 'confirm']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') return { options, positionals, passthrough: argv.slice(index + 1) };
    if (!token.startsWith('-')) { positionals.push(token); continue; }
    const [rawName, inline] = token.split('=', 2);
    const name = aliases[rawName] || rawName.replace(/^--/, '');
    if (booleans.has(name)) { options[name] = true; continue; }
    const value = inline ?? argv[++index];
    if (value === undefined || value.startsWith('--')) throw new ChronoError('INVALID_ARGUMENT', `Option ${rawName} requires a value.`);
    options[name] = value;
  }
  return { options, positionals, passthrough: [] };
}

function parseExecArgs(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') return { options, positionals, passthrough: argv.slice(index + 1) };
    if (token === '--json') { options.json = true; continue; }
    if (token === '--root' || token === '--run') { options[token.slice(2)] = requireValue(argv[++index], `Option ${token} requires a value.`); continue; }
    if (token.startsWith('--root=')) { options.root = token.slice(7); continue; }
    if (token.startsWith('--run=')) { options.run = token.slice(6); continue; }
    positionals.push(token);
  }
  return { options, positionals, passthrough: [] };
}

function output(value, { json = false } = {}) {
  if (json) console.log(JSON.stringify({ ok: true, ...value }));
  else console.log(value.message || JSON.stringify(value, null, 2));
}

function requireValue(value, message) {
  if (!value) throw new ChronoError('INVALID_ARGUMENT', message);
  return value;
}

function controlledServices(state) {
  const entries = Object.entries(state.services).filter(([, service]) => service.control === 'wall-clock' && service.containerId);
  const order = state.advanceOrder || [];
  return entries.sort(([a], [b]) => {
    const ai = order.indexOf(a); const bi = order.indexOf(b);
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
  });
}

async function probe(docker, containerId, expected, toleranceSeconds = 2) {
  const observedRaw = await docker.exec(containerId, ['/bin/date', '+%s']);
  const observed = Number(observedRaw);
  const target = Math.floor(new Date(expected).valueOf() / 1000);
  if (!Number.isFinite(observed) || Math.abs(observed - target) > toleranceSeconds) {
    throw new ChronoError('CLOCK_VERIFICATION_FAILED', `Expected ${expected}, observed ${observedRaw}.`, { expected, observed: observedRaw });
  }
  return new Date(observed * 1000).toISOString();
}

function parseSpeed(input) {
  const match = /^(\d+(?:\.\d+)?)x?$/.exec(String(input || ''));
  const speed = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(speed) || speed <= 0 || speed > 1_000_000) throw new ChronoError('INVALID_SPEED', 'Speed must be greater than 0 and no more than 1000000x.');
  return speed;
}

async function commandBuild(args, docker, root) {
  const file = path.resolve(root, args.options.file || 'Dockerfile');
  const tag = requireValue(args.options.tag, '`chrono build` requires -t/--tag.');
  const context = path.resolve(root, args.positionals[0] || '.');
  let source;
  try { source = await readFile(file); }
  catch (error) { if (error.code === 'ENOENT') throw new ChronoError('DOCKERFILE_NOT_FOUND', `Dockerfile not found: ${file}`); throw error; }
  const buildArg = args.options['build-arg'];
  const hash = createHash('sha256').update(source).update('\0').update(context).update('\0').update(buildArg || '').digest('hex').slice(0, 12);
  const baseImage = `chronolab-base:${hash}`;
  await docker.build(['-f', file, '-t', baseImage, ...(buildArg ? ['--build-arg', buildArg] : []), context]);
  const platform = await docker.inspect(baseImage, '{{.Os}}/{{.Architecture}}');
  if (!platform.startsWith('linux/')) throw new ChronoError('UNSUPPORTED_PLATFORM', `Only Linux images are supported; found ${platform}.`);
  const generated = paths(root).generated;
  await mkdir(generated, { recursive: true });
  const wrapper = path.join(generated, `${hash}.Dockerfile`);
  let shimImage = args.options['shim-image'] || process.env.CHRONOLAB_SHIM_IMAGE;
  if (!shimImage) {
    shimImage = `chronolab-shim:glibc-${platform.split('/')[1]}`;
    const shimContext = path.join(PACKAGE_ROOT, 'shim');
    const shimBuildImage = process.env.CHRONOLAB_SHIM_BUILD_IMAGE;
    await docker.build(['--platform', platform, '-f', path.join(shimContext, 'Dockerfile'), '-t', shimImage, ...(shimBuildImage ? ['--build-arg', `BUILD_IMAGE=${shimBuildImage}`] : []), shimContext]);
  }
  await atomicWrite(wrapper, renderWrapperDockerfile({ baseImage, shimImage }));
  await docker.build(['-f', wrapper, '-t', tag, generated]);
  return { message: `Built ${tag} (${platform})`, image: tag, baseImage, platform, wrapper };
}

async function commandRun(args, docker, root) {
  const image = requireValue(args.positionals[0], '`chrono run` requires an image.');
  const logicalTime = normalizeTime(requireValue(args.options.at, '`chrono run` requires --at TIMESTAMP.'));
  const speed = args.options.speed ? parseSpeed(args.options.speed) : 1;
  const run = await createRun(root, logicalTime, image, { speed });
  const name = args.options.name || `chronolab-${run.state.runId}`;
  try {
    const containerId = await docker.run(['run', '-d', '--name', name, '--label', `dev.chronolab.run=${run.state.runId}`, '--label', 'dev.chronolab.control=wall-clock', '--mount', `type=bind,src=${run.dir},dst=/run/chronolab,readonly`, ...(args.options.volume ? ['--volume', args.options.volume] : []), image, ...args.passthrough]);
    run.state.services.main = { containerId, control: 'wall-clock', name };
    await saveState(run.dir, run.state);
    const observed = args.options['no-verify'] ? null : await probe(docker, containerId, logicalTime, Math.max(2, speed * 5));
    await event(run.dir, 'run.started', { generation: 1, logicalTime, containerId, mode: run.state.mode, speed });
    return { message: `Started ${run.state.runId} at ${logicalTime}${speed !== 1 ? ` (${speed}x)` : ''}`, runId: run.state.runId, logicalTime, mode: run.state.mode, speed, containerId, observed };
  } catch (error) {
    run.state.status = 'failed';
    run.state.error = error.message;
    await saveState(run.dir, run.state);
    throw error;
  }
}

async function mutateClock({
  root,
  docker,
  target,
  source,
  allowBackward = false,
  stripeFactory = options => new StripeTestClocks(options),
  chargebeeFactory = options => new ChargebeeTimeMachine(options),
  fetchImpl = globalThis.fetch,
}) {
  const run = await loadRun(root);
  return withLock(path.join(run.dir, 'lock'), async () => {
    const previous = run.state.logicalTime;
    if (!allowBackward && new Date(target) < new Date(previous)) throw new ChronoError('BACKWARD_TIME_REFUSED', 'Backward time travel is not supported in v0.');
    const generation = run.state.generation + 1;
    run.state.status = 'advancing';
    run.state.pendingTime = target;
    await saveState(run.dir, run.state);
    await event(run.dir, 'advance.started', { generation, previous, target, source });
    const services = controlledServices(run.state);
    try {
      for (const [, service] of services) await docker.stop(service.containerId);
      const stripe = run.state.providers.stripe;
      if (stripe?.clockId) {
        await event(run.dir, 'stripe.advancing', { generation, clockId: stripe.clockId, target });
        const clock = await stripeFactory().advance(stripe.clockId, target);
        stripe.status = clock.status;
        stripe.frozenTime = clock.frozen_time;
        await event(run.dir, 'stripe.ready', { generation, clockId: stripe.clockId });
      }
      const chargebee = run.state.providers.chargebee;
      if (chargebee?.attached) {
        await event(run.dir, 'chargebee.advancing', { generation, site: chargebee.site, target });
        const machine = await chargebeeFactory({ site: chargebee.site }).travelForward(target);
        chargebee.status = machine.time_travel_status;
        chargebee.destinationTime = machine.destination_time;
        await event(run.dir, 'chargebee.ready', { generation, site: chargebee.site, destinationTime: machine.destination_time });
      }
      await writeClock(run.dir, target);
      run.state.logicalTime = target;
      run.state.mode = 'jump';
      run.state.speed = 1;
      run.state.wallClockAnchor = new Date().toISOString();
      run.state.generation = generation;
      await saveState(run.dir, run.state);
      const observed = {};
      for (const [name, service] of services) {
        await docker.start(service.containerId);
        observed[name] = await probe(docker, service.containerId, target);
        await event(run.dir, 'container.verified', { generation, service: name, observed: observed[name] });
      }
      run.state.status = 'ready';
      run.state.lastSuccessfulTime = target;
      delete run.state.pendingTime;
      delete run.state.error;
      await saveState(run.dir, run.state);
      if (stripe?.webhook?.forwardTo) {
        const released = await releaseBuffered({ dir: run.dir, runId: run.state.runId, forwardTo: stripe.webhook.forwardTo, fetchImpl });
        if (released) await event(run.dir, 'webhooks.released', { generation, count: released });
      }
      const paddle = run.state.providers.paddle;
      if (paddle?.webhook?.forwardTo) {
        const released = await releaseBuffered({ dir: run.dir, runId: run.state.runId, provider: 'paddle', signatureHeader: 'paddle-signature', forwardTo: paddle.webhook.forwardTo, fetchImpl });
        if (released) await event(run.dir, 'paddle.webhooks.released', { generation, count: released });
      }
      await event(run.dir, 'advance.completed', { generation, target });
      return { message: `Advanced ${run.state.runId}: ${previous} → ${target}`, runId: run.state.runId, previous, logicalTime: target, generation, observed };
    } catch (error) {
      run.state.status = 'failed';
      run.state.error = error.message;
      await saveState(run.dir, run.state);
      await event(run.dir, 'advance.failed', { generation, target, code: asChronoError(error).code });
      throw error;
    }
  });
}

function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-|-$/g, '') || 'chronolab'; }

async function commandCompose(args, docker, root) {
  const action = requireValue(args.positionals[0], '`chrono compose` requires build or up.');
  const composeFile = path.resolve(root, args.options.file || 'compose.yaml');
  const loaded = await loadChronoConfig(root, args.options.config || '.chronolab.yaml');
  const project = slug(args.options.project || path.basename(root));
  const manifestFile = path.join(paths(root).generated, 'compose-build.json');
  if (action === 'build') {
    const images = {};
    for (const [name, service] of Object.entries(loaded.config.services)) {
      if (service.control !== 'wall-clock') continue;
      const tag = service.image || `chronolab-${project}-${slug(name)}:latest`;
      const result = await commandBuild({
        options: { file: service.dockerfile || path.join(service.context || '.', 'Dockerfile'), tag, ...(args.options['shim-image'] ? { 'shim-image': args.options['shim-image'] } : {}), ...(service.buildArg ? { 'build-arg': service.buildArg } : {}) },
        positionals: [service.context || '.'], passthrough: [],
      }, docker, root);
      images[name] = { image: result.image, wrapper: result.wrapper, control: service.control };
    }
    const manifest = { schemaVersion: 1, composeFile, configFile: loaded.file, project, images, advanceOrder: loaded.config.advance?.order || Object.keys(images) };
    await writeJson(manifestFile, manifest);
    return { message: `Built ${Object.keys(images).length} controlled Compose service(s).`, manifest: manifestFile, images };
  }
  if (action === 'up') {
    const manifest = await readJson(manifestFile, 'COMPOSE_NOT_BUILT');
    const logicalTime = normalizeTime(requireValue(args.options.at, '`chrono compose up` requires --at TIMESTAMP.'));
    const speed = args.options.speed ? parseSpeed(args.options.speed) : 1;
    const run = await createRun(root, logicalTime, null, { speed });
    run.state.compose = { file: composeFile, project };
    run.state.advanceOrder = manifest.advanceOrder;
    const override = { services: {} };
    for (const [name, service] of Object.entries(loaded.config.services)) {
      const controlled = service.control === 'wall-clock';
      override.services[name] = {
        labels: { 'dev.chronolab.run': run.state.runId, 'dev.chronolab.control': service.control },
        ...(controlled ? {
          image: requireValue(manifest.images[name]?.image, `No wrapped image exists for controlled service ${name}; run \`chrono compose build\`.`),
          volumes: [`${run.dir}:/run/chronolab:ro`],
          environment: { CHRONOLAB_RUN_ID: run.state.runId },
        } : {}),
      };
    }
    const overrideFile = path.join(paths(root).generated, `${run.state.runId}.compose.json`);
    await writeJson(overrideFile, override);
    run.state.compose.overrideFile = overrideFile;
    try {
      await docker.run(['compose', '-f', composeFile, '-f', overrideFile, '-p', project, 'up', '-d']);
      for (const [name, service] of Object.entries(loaded.config.services)) {
        const containerId = await docker.run(['compose', '-f', composeFile, '-f', overrideFile, '-p', project, 'ps', '-q', name]);
        if (!containerId) throw new ChronoError('COMPOSE_SERVICE_MISSING', `Compose did not return a container for ${name}.`);
        run.state.services[name] = { containerId, control: service.control, name };
      }
      await saveState(run.dir, run.state);
      const observed = {};
      for (const [name, service] of controlledServices(run.state)) observed[name] = await probe(docker, service.containerId, logicalTime, Math.max(2, speed * 5));
      await event(run.dir, 'compose.started', { logicalTime, project, services: Object.keys(run.state.services) });
      return { message: `Started Compose run ${run.state.runId} at ${logicalTime}`, runId: run.state.runId, logicalTime, mode: run.state.mode, services: run.state.services, observed, override: overrideFile };
    } catch (error) {
      run.state.status = 'failed'; run.state.error = error.message; await saveState(run.dir, run.state); throw error;
    }
  }
  throw new ChronoError('UNKNOWN_COMMAND', `Unknown compose command: ${action}`);
}

async function commandDoctor(args, docker, root) {
  const image = args.positionals[0];
  if (!image) {
    const run = await loadRun(root, args.options.run);
    if (run.state.mode === 'accelerated') {
      const observed = calculatedNow(run.state);
      return { message: `Run ${run.state.runId} accelerates wall clock at ${run.state.speed}x (${observed})`, supportLevel: 'WALL_CLOCK_ACCELERATED', logicalTime: observed, speed: run.state.speed };
    }
    const results = {};
    for (const [name, service] of controlledServices(run.state)) results[name] = await probe(docker, service.containerId, run.state.logicalTime);
    return { message: `Run ${run.state.runId} controls wall clock at ${run.state.logicalTime}`, supportLevel: 'WALL_CLOCK_JUMP', results };
  }
  const platform = await docker.inspect(image, '{{.Os}}/{{.Architecture}}');
  if (!platform.startsWith('linux/')) throw new ChronoError('UNSUPPORTED_PLATFORM', `Only Linux images are supported; found ${platform}.`);
  const wrapped = await docker.inspect(image, '{{index .Config.Labels "dev.chronolab.wrapped"}}');
  if (wrapped !== 'true') throw new ChronoError('IMAGE_NOT_WRAPPED', `${image} is not a ChronoLab wrapped image.`);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'chronolab-doctor-'));
  try {
    const target = '2030-01-02T03:04:05.000Z';
    await atomicWrite(path.join(dir, 'faketimerc'), '@2030-01-02 03:04:05\n');
    await chmod(path.join(dir, 'faketimerc'), 0o644);
    let observedRaw;
    try {
      observedRaw = await docker.run(['run', '--rm', '--mount', `type=bind,src=${dir},dst=/run/chronolab,readonly`, '--entrypoint', '/bin/date', image, '+%s']);
    } catch (error) {
      if (/GLIBC_[\d.]+.*not found/i.test(error.message)) throw new ChronoError('SHIM_GLIBC_INCOMPATIBLE', `The shim requires a newer glibc than ${image}. Rebuild it against an older compatible base.`, { cause: error.message });
      throw error;
    }
    const expected = Math.floor(new Date(target).valueOf() / 1000);
    if (Number(observedRaw) !== expected) throw new ChronoError('CLOCK_VERIFICATION_FAILED', `Image returned ${observedRaw}; expected ${expected}.`);
    return { message: `${image}: wall-clock jump supported (${platform})`, image, platform, supportLevel: 'WALL_CLOCK_JUMP' };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

async function observedNow(run, docker) {
  const service = controlledServices(run.state)[0]?.[1];
  if (!service) return run.state.logicalTime;
  const raw = await docker.exec(service.containerId, ['/bin/date', '+%s']);
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) throw new ChronoError('CLOCK_VERIFICATION_FAILED', `Container returned an invalid clock value: ${raw}`);
  return new Date(seconds * 1000).toISOString();
}

function calculatedNow(state) {
  if (state.mode !== 'accelerated') return state.logicalTime;
  const wallAnchor = new Date(state.wallClockAnchor || state.createdAt).valueOf();
  const elapsed = Math.max(0, Date.now() - wallAnchor);
  return new Date(new Date(state.logicalTime).valueOf() + elapsed * state.speed).toISOString();
}

async function commandWarp(args, docker, root) {
  const speed = parseSpeed(requireValue(args.positionals[0], '`chrono warp` requires a speed such as 3600x.'));
  const run = await loadRun(root, args.options.run);
  return withLock(path.join(run.dir, 'lock'), async () => {
    const logicalTime = calculatedNow(run.state);
    const services = controlledServices(run.state);
    for (const [, service] of services) await docker.stop(service.containerId);
    await writeClock(run.dir, logicalTime, speed);
    run.state.logicalTime = logicalTime;
    run.state.lastSuccessfulTime = logicalTime;
    run.state.mode = 'accelerated';
    run.state.speed = speed;
    run.state.wallClockAnchor = new Date().toISOString();
    run.state.generation += 1;
    for (const [, service] of services) await docker.start(service.containerId);
    const observed = {};
    for (const [name, service] of services) observed[name] = await probe(docker, service.containerId, logicalTime, Math.max(2, speed * 5));
    await saveState(run.dir, run.state);
    await event(run.dir, 'warp.started', { generation: run.state.generation, logicalTime, speed });
    return { message: `Accelerating ${run.state.runId} at ${speed}x from ${logicalTime}`, runId: run.state.runId, logicalTime, speed, generation: run.state.generation, observed };
  });
}

async function commandStripe(args, root, dependencies) {
  const action = requireValue(args.positionals[0], '`chrono stripe` requires create, attach, status, detach, delete, or listen.');
  const run = await loadRun(root, args.options.run);
  const factory = dependencies.stripeFactory || (options => new StripeTestClocks(options));
  if (action === 'detach') {
    const clockId = run.state.providers.stripe?.clockId;
    delete run.state.providers.stripe;
    await saveState(run.dir, run.state);
    await event(run.dir, 'stripe.detached', { clockId });
    return { message: `Detached Stripe Test Clock ${clockId || '(none)'}.`, clockId };
  }
  if (action === 'listen') {
    const forwardTo = requireValue(args.options['forward-to'], '`chrono stripe listen` requires --forward-to URL.');
    const port = Number(args.options.port || 4243);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ChronoError('INVALID_ARGUMENT', 'Webhook port must be between 1 and 65535.');
    run.state.providers.stripe ||= {};
    run.state.providers.stripe.webhook = { forwardTo, host: '127.0.0.1', port };
    await saveState(run.dir, run.state);
    const controller = new AbortController();
    const server = await listenWebhooks({ run, port, forwardTo, fetchImpl: dependencies.fetchImpl, signal: controller.signal });
    process.once('SIGINT', () => controller.abort());
    process.stderr.write(`ChronoLab Stripe webhook buffer listening on http://127.0.0.1:${port}\n`);
    await new Promise(resolve => server.once('close', resolve));
    return { message: 'Webhook listener stopped.' };
  }
  const client = factory();
  if (action === 'create') {
    const at = normalizeTime(args.options.at || run.state.logicalTime);
    const clock = await client.create(at, args.options.name || `ChronoLab ${run.state.runId}`);
    run.state.providers.stripe = { clockId: clock.id, status: clock.status, frozenTime: clock.frozen_time };
    await saveState(run.dir, run.state);
    await event(run.dir, 'stripe.created', { clockId: clock.id, at });
    return { message: `Created and attached Stripe Test Clock ${clock.id}`, clockId: clock.id, environment: `STRIPE_TEST_CLOCK_ID=${clock.id}`, status: clock.status };
  }
  if (action === 'attach') {
    const clockId = requireValue(args.positionals[1], '`chrono stripe attach` requires a clock ID.');
    if (!clockId.startsWith('clock_')) throw new ChronoError('INVALID_STRIPE_CLOCK', 'Stripe Test Clock IDs must start with clock_.');
    const clock = await client.retrieve(clockId);
    run.state.providers.stripe = { clockId: clock.id, status: clock.status, frozenTime: clock.frozen_time };
    await saveState(run.dir, run.state);
    await event(run.dir, 'stripe.attached', { clockId: clock.id });
    return { message: `Attached Stripe Test Clock ${clock.id}`, clockId: clock.id, status: clock.status };
  }
  const provider = run.state.providers.stripe;
  if (!provider?.clockId) throw new ChronoError('STRIPE_NOT_ATTACHED', 'No Stripe Test Clock is attached to the active run.');
  if (action === 'status') {
    const clock = await client.retrieve(provider.clockId);
    Object.assign(provider, { status: clock.status, frozenTime: clock.frozen_time });
    await saveState(run.dir, run.state);
    return { message: `${clock.id}: ${clock.status}`, clockId: clock.id, status: clock.status, frozenTime: clock.frozen_time };
  }
  if (action === 'delete') {
    if (!args.options.confirm) throw new ChronoError('CONFIRMATION_REQUIRED', '`chrono stripe delete` requires --confirm.');
    const clock = await client.delete(provider.clockId);
    delete run.state.providers.stripe;
    await saveState(run.dir, run.state);
    await event(run.dir, 'stripe.deleted', { clockId: provider.clockId });
    return { message: `Deleted Stripe Test Clock ${provider.clockId}`, clockId: provider.clockId, deleted: clock.deleted ?? true };
  }
  throw new ChronoError('UNKNOWN_COMMAND', `Unknown stripe command: ${action}`);
}

async function commandChargebee(args, root, dependencies) {
  const action = requireValue(args.positionals[0], '`chrono chargebee` requires start, attach, status, or detach.');
  const run = await loadRun(root, args.options.run);
  if (action === 'detach') {
    const site = run.state.providers.chargebee?.site;
    delete run.state.providers.chargebee;
    await saveState(run.dir, run.state);
    await event(run.dir, 'chargebee.detached', { site });
    return { message: `Detached Chargebee Time Machine ${site || '(none)'}.`, site };
  }
  const site = args.options.site || run.state.providers.chargebee?.site || process.env.CHARGEBEE_TEST_SITE;
  const factory = dependencies.chargebeeFactory || (options => new ChargebeeTimeMachine(options));
  const client = factory({ site });
  if (action === 'start') {
    if (!args.options.confirm) throw new ChronoError('CONFIRMATION_REQUIRED', '`chrono chargebee start` clears customer data in the test site and requires --confirm.');
    const at = normalizeTime(args.options.at || run.state.logicalTime);
    const machine = await client.startAfresh(at);
    run.state.providers.chargebee = { attached: true, site: client.site || site, name: machine.name || 'delorean', status: machine.time_travel_status, genesisTime: machine.genesis_time, destinationTime: machine.destination_time };
    await saveState(run.dir, run.state);
    await event(run.dir, 'chargebee.started', { site: client.site || site, at });
    return { message: `Started and attached Chargebee Time Machine for ${client.site || site}`, site: client.site || site, status: machine.time_travel_status, destinationTime: machine.destination_time };
  }
  if (action === 'attach') {
    const machine = await client.retrieve();
    if (machine.time_travel_status !== 'succeeded') throw new ChronoError('CHARGEBEE_NOT_READY', `Chargebee Time Machine is ${machine.time_travel_status}; wait for succeeded before attaching.`);
    run.state.providers.chargebee = { attached: true, site: client.site || site, name: machine.name || 'delorean', status: machine.time_travel_status, genesisTime: machine.genesis_time, destinationTime: machine.destination_time };
    await saveState(run.dir, run.state);
    await event(run.dir, 'chargebee.attached', { site: client.site || site });
    return { message: `Attached Chargebee Time Machine for ${client.site || site}`, site: client.site || site, status: machine.time_travel_status, destinationTime: machine.destination_time };
  }
  if (action === 'status') {
    if (!run.state.providers.chargebee?.attached) throw new ChronoError('CHARGEBEE_NOT_ATTACHED', 'No Chargebee Time Machine is attached to the active run.');
    const machine = await client.retrieve();
    Object.assign(run.state.providers.chargebee, { status: machine.time_travel_status, genesisTime: machine.genesis_time, destinationTime: machine.destination_time });
    await saveState(run.dir, run.state);
    return { message: `${client.site || site}: ${machine.time_travel_status}`, site: client.site || site, status: machine.time_travel_status, destinationTime: machine.destination_time };
  }
  throw new ChronoError('UNKNOWN_COMMAND', `Unknown chargebee command: ${action}`);
}

async function commandPaddle(args, root, dependencies) {
  const action = requireValue(args.positionals[0], '`chrono paddle` requires simulate, status, listen, or detach.');
  const run = await loadRun(root, args.options.run);
  if (action === 'detach') {
    const simulationId = run.state.providers.paddle?.simulationId;
    delete run.state.providers.paddle;
    await saveState(run.dir, run.state);
    await event(run.dir, 'paddle.detached', { simulationId });
    return { message: `Detached Paddle simulation metadata ${simulationId || '(none)'}.`, simulationId };
  }
  if (action === 'listen') {
    const forwardTo = requireValue(args.options['forward-to'], '`chrono paddle listen` requires --forward-to URL.');
    const port = Number(args.options.port || 4244);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ChronoError('INVALID_ARGUMENT', 'Webhook port must be between 1 and 65535.');
    run.state.providers.paddle ||= {};
    run.state.providers.paddle.webhook = { forwardTo, host: '127.0.0.1', port };
    await saveState(run.dir, run.state);
    const controller = new AbortController();
    const server = await listenWebhooks({ run, port, forwardTo, provider: 'paddle', signatureHeader: 'paddle-signature', fetchImpl: dependencies.fetchImpl, signal: controller.signal });
    process.once('SIGINT', () => controller.abort());
    process.stderr.write(`ChronoLab Paddle webhook buffer listening on http://127.0.0.1:${port}\n`);
    await new Promise(resolve => server.once('close', resolve));
    return { message: 'Webhook listener stopped.' };
  }
  const factory = dependencies.paddleFactory || (options => new PaddleSimulator(options));
  const client = factory();
  if (action === 'simulate') {
    const type = requireValue(args.positionals[1] || args.options.type, '`chrono paddle simulate` requires a scenario type.').replace(/-/g, '_');
    const notificationSettingId = requireValue(args.options['notification-setting'], '`chrono paddle simulate` requires --notification-setting ntfset_...');
    const result = await client.simulate({
      notificationSettingId,
      type,
      name: args.options.name || `ChronoLab ${run.state.runId} ${type}`,
      subscriptionId: args.options.subscription,
      paymentOutcome: args.options['payment-outcome'],
      dunningAction: args.options['dunning-action'],
      effectiveFrom: args.options['effective-from'],
    });
    run.state.providers.paddle = { ...(run.state.providers.paddle || {}), simulationId: result.simulation.id, runId: result.run.id, type, status: result.run.status, events: (result.run.events || []).map(item => ({ id: item.id, eventType: item.event_type, status: item.status })) };
    await saveState(run.dir, run.state);
    await event(run.dir, 'paddle.simulation.completed', { simulationId: result.simulation.id, simulationRunId: result.run.id, type, eventCount: result.run.events?.length || 0 });
    return { message: `Paddle ${type} simulation completed`, simulationId: result.simulation.id, simulationRunId: result.run.id, status: result.run.status, events: result.run.events || [] };
  }
  if (action === 'status') {
    const simulationId = args.positionals[1] || run.state.providers.paddle?.simulationId;
    const simulationRunId = args.positionals[2] || run.state.providers.paddle?.runId;
    const result = await client.retrieveRun(requireValue(simulationId, 'Provide a Paddle simulation ID.'), requireValue(simulationRunId, 'Provide a Paddle simulation run ID.'));
    run.state.providers.paddle = { ...(run.state.providers.paddle || {}), simulationId, runId: simulationRunId, type: result.type, status: result.status, events: (result.events || []).map(item => ({ id: item.id, eventType: item.event_type, status: item.status })) };
    await saveState(run.dir, run.state);
    return { message: `${simulationRunId}: ${result.status}`, simulationId, simulationRunId, status: result.status, events: result.events || [] };
  }
  throw new ChronoError('UNKNOWN_COMMAND', `Unknown paddle command: ${action}`);
}

async function commandEvents(root, runId) {
  const run = await loadRun(root, runId);
  let text = '';
  try { text = await readFile(path.join(run.dir, 'events.jsonl'), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const events = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  return { message: JSON.stringify(events, null, 2), runId: run.state.runId, events };
}

async function commandExport(args, root) {
  const run = await loadRun(root, args.options.run);
  const events = (await commandEvents(root, run.state.runId)).events;
  const bundle = { exportedAt: new Date().toISOString(), state: run.state, events };
  if (args.options.output) {
    const file = path.resolve(root, args.options.output);
    await writeJson(file, bundle);
    return { message: `Exported ${run.state.runId} to ${file}`, runId: run.state.runId, file };
  }
  return { message: JSON.stringify(bundle, null, 2), ...bundle };
}

export async function dispatch(argv, dependencies = {}) {
  const docker = dependencies.docker || new Docker();
  const command = argv[0];
  const args = command === 'exec' ? parseExecArgs(argv.slice(1)) : parseArgs(argv.slice(1));
  const root = path.resolve(args.options.root || process.cwd());
  if (!command || command === 'help' || command === '--help' || command === '-h' || args.options.help) return { value: { message: HELP }, json: false };
  if (command === '--version' || args.options.version) return { value: { message: '0.3.0', version: '0.3.0' }, json: args.options.json };
  let value;
  if (command === 'build') value = await commandBuild(args, docker, root);
  else if (command === 'run') value = await commandRun(args, docker, root);
  else if (command === 'compose') value = await commandCompose(args, docker, root);
  else if (command === 'now') { const run = await loadRun(root, args.options.run); const logicalTime = calculatedNow(run.state); value = { message: logicalTime, runId: run.state.runId, logicalTime, generation: run.state.generation, status: run.state.status, mode: run.state.mode, speed: run.state.speed }; }
  else if (command === 'advance') { const duration = parseDuration(requireValue(args.positionals[0], '`chrono advance` requires a duration.')); const run = await loadRun(root, args.options.run); const current = calculatedNow(run.state); value = await mutateClock({ root, docker, target: addDuration(current, duration), source: args.positionals[0], stripeFactory: dependencies.stripeFactory, chargebeeFactory: dependencies.chargebeeFactory, fetchImpl: dependencies.fetchImpl }); }
  else if (command === 'set') value = await mutateClock({ root, docker, target: normalizeTime(requireValue(args.positionals[0], '`chrono set` requires a timestamp.')), source: 'set', stripeFactory: dependencies.stripeFactory, chargebeeFactory: dependencies.chargebeeFactory, fetchImpl: dependencies.fetchImpl });
  else if (command === 'warp') value = await commandWarp(args, docker, root);
  else if (command === 'exec') { const run = await loadRun(root, args.options.run); const service = run.state.services.main || Object.values(run.state.services).find(item => item.control === 'wall-clock'); const execArgs = [...args.positionals, ...args.passthrough]; requireValue(execArgs[0], '`chrono exec` requires a command.'); value = { message: await docker.exec(requireValue(service?.containerId, 'The run has no controlled container.'), execArgs) }; }
  else if (command === 'doctor') value = await commandDoctor(args, docker, root);
  else if (command === 'reset') { const run = await loadRun(root, args.options.run); if (run.state.providers.stripe?.clockId || run.state.providers.chargebee?.attached) throw new ChronoError('RESET_EXTERNAL_SIDE_EFFECTS_REFUSED', 'Reset cannot roll back an attached external provider clock. Detach it first if a local-only reset is safe.'); value = await mutateClock({ root, docker, target: run.state.lastSuccessfulTime, source: 'reset', allowBackward: true, stripeFactory: dependencies.stripeFactory, chargebeeFactory: dependencies.chargebeeFactory, fetchImpl: dependencies.fetchImpl }); }
  else if (command === 'stripe') value = await commandStripe(args, root, dependencies);
  else if (command === 'chargebee') value = await commandChargebee(args, root, dependencies);
  else if (command === 'paddle') value = await commandPaddle(args, root, dependencies);
  else if (command === 'events') value = await commandEvents(root, args.options.run);
  else if (command === 'export') value = await commandExport(args, root);
  else if (command === 'mcp' && args.positionals[0] === 'serve') {
    await serveMcp({ input: dependencies.input, output: dependencies.output, invoke: async toolArgs => (await dispatch([...toolArgs, '--root', root], dependencies)).value });
    return { silent: true };
  }
  else if (command === 'destroy') {
    const run = await loadRun(root, args.options.run);
    if (run.state.compose) await docker.run(['compose', '-f', run.state.compose.file, '-f', run.state.compose.overrideFile, '-p', run.state.compose.project, 'down']);
    else for (const [, service] of controlledServices(run.state)) await docker.remove(service.containerId);
    await clearActive(run.paths, run.state.runId); run.state.status = 'destroyed'; await saveState(run.dir, run.state); await event(run.dir, 'run.destroyed'); value = { message: `Destroyed containers for ${run.state.runId}; diagnostic state was retained.`, runId: run.state.runId };
  }
  else throw new ChronoError('UNKNOWN_COMMAND', `Unknown command: ${command}`);
  return { value, json: args.options.json };
}

export async function main(argv, dependencies = {}) {
  try {
    const result = await dispatch(argv, dependencies);
    if (result.silent) return 0;
    output(result.value, { json: result.json });
    return 0;
  } catch (caught) {
    const error = asChronoError(caught);
    const json = argv.includes('--json');
    if (json) console.error(JSON.stringify({ ok: false, code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }));
    else console.error(`error [${error.code}]: ${error.message}`);
    return 1;
  }
}
