import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const packageRoot = path.resolve(import.meta.dirname, '..');
const cli = path.join(packageRoot, 'bin', 'chrono.js');
const fakeDocker = path.join(packageRoot, 'test', 'fixtures', 'fake-docker.js');

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: packageRoot, env });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

test('full CLI lifecycle works across subprocesses', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chronolab-e2e-'));
  const dockerState = path.join(root, 'fake-docker.json');
  await writeFile(dockerState, '{}');
  await chmod(fakeDocker, 0o755);
  const env = { ...process.env, CHRONOLAB_DOCKER: fakeDocker, FAKE_DOCKER_STATE: dockerState };
  try {
    let result = await run(['run', 'demo:chrono', '--at', '2026-01-01T00:00:00Z', '--root', root, '--json'], env);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).logicalTime, '2026-01-01T00:00:00.000Z');

    result = await run(['now', '--root', root, '--json'], env);
    assert.equal(JSON.parse(result.stdout).generation, 1);

    result = await run(['advance', '30d', '--root', root, '--json'], env);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).logicalTime, '2026-01-31T00:00:00.000Z');

    result = await run(['exec', 'date', '-u', '--root', root], env);
    assert.equal(result.stdout, 'executed: date -u');

    result = await run(['doctor', '--root', root, '--json'], env);
    assert.equal(JSON.parse(result.stdout).supportLevel, 'WALL_CLOCK_JUMP');

    const runId = (await readFile(path.join(root, '.chronolab', 'active-run'), 'utf8')).trim();
    const events = await readFile(path.join(root, '.chronolab', 'runs', runId, 'events.jsonl'), 'utf8');
    assert.match(events, /"type":"advance.completed"/);

    result = await run(['events', '--root', root, '--json'], env);
    assert.ok(JSON.parse(result.stdout).events.some(item => item.type === 'advance.completed'));
    result = await run(['export', '--output', 'run-export.json', '--root', root, '--json'], env);
    assert.equal(result.code, 0, result.stderr);
    const exported = JSON.parse(await readFile(path.join(root, 'run-export.json'), 'utf8'));
    assert.equal(exported.state.runId, runId);

    result = await run(['destroy', '--root', root, '--json'], env);
    assert.equal(result.code, 0, result.stderr);
    await assert.rejects(readFile(path.join(root, '.chronolab', 'active-run')), error => error.code === 'ENOENT');
    const saved = JSON.parse(await readFile(path.join(root, '.chronolab', 'runs', runId, 'state.json'), 'utf8'));
    assert.equal(saved.status, 'destroyed');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('backward set returns a stable JSON error', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chronolab-errors-'));
  const dockerState = path.join(root, 'fake-docker.json');
  await writeFile(dockerState, '{}');
  const env = { ...process.env, CHRONOLAB_DOCKER: fakeDocker, FAKE_DOCKER_STATE: dockerState };
  try {
    await run(['run', 'demo:chrono', '--at', '2026-01-01T00:00:00Z', '--root', root], env);
    const result = await run(['set', '2025-01-01T00:00:00Z', '--root', root, '--json'], env);
    assert.equal(result.code, 1);
    assert.equal(JSON.parse(result.stderr).code, 'BACKWARD_TIME_REFUSED');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('build creates an inspectable wrapper Dockerfile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chronolab-build-'));
  const dockerState = path.join(root, 'fake-docker.json');
  await writeFile(dockerState, '{}');
  await writeFile(path.join(root, 'Dockerfile'), 'FROM scratch\n');
  const env = { ...process.env, CHRONOLAB_DOCKER: fakeDocker, FAKE_DOCKER_STATE: dockerState };
  try {
    const result = await run(['build', '-f', path.join(root, 'Dockerfile'), '-t', 'demo:chrono', root, '--root', root, '--shim-image', 'shim:local', '--json'], env);
    assert.equal(result.code, 0, result.stderr);
    const built = JSON.parse(result.stdout);
    assert.equal(built.image, 'demo:chrono');
    const wrapper = await readFile(built.wrapper, 'utf8');
    assert.match(wrapper, /FROM shim:local AS chrono-shim/);
    assert.match(wrapper, /TZ=UTC/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Compose build, up, advance, and destroy preserve passive services during jumps', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chronolab-compose-'));
  const dockerState = path.join(root, 'fake-docker.json');
  await writeFile(dockerState, '{}');
  await mkdir(path.join(root, 'api'));
  await writeFile(path.join(root, 'api', 'Dockerfile'), 'FROM scratch\n');
  await writeFile(path.join(root, 'compose.yaml'), 'services:\n  api:\n    build: ./api\n  db:\n    image: postgres:15\n');
  await writeFile(path.join(root, '.chronolab.yaml'), 'version: 1\nservices:\n  api:\n    context: ./api\n    dockerfile: ./api/Dockerfile\n    control: wall-clock\n  db:\n    control: passive\nadvance:\n  order: [api]\n');
  const env = { ...process.env, CHRONOLAB_DOCKER: fakeDocker, FAKE_DOCKER_STATE: dockerState };
  try {
    let result = await run(['compose', 'build', '-f', 'compose.yaml', '--shim-image', 'shim:local', '--root', root, '--json'], env);
    assert.equal(result.code, 0, result.stderr);
    result = await run(['compose', 'up', '-f', 'compose.yaml', '--at', '2026-01-01T00:00:00Z', '--root', root, '--json'], env);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).services.db.control, 'passive');
    result = await run(['advance', '1d', '--root', root, '--json'], env);
    assert.equal(result.code, 0, result.stderr);
    const fake = JSON.parse(await readFile(dockerState, 'utf8'));
    assert.equal(fake['container-api'].running, true);
    assert.equal(fake['container-db'].running, true);
    result = await run(['destroy', '--root', root, '--json'], env);
    assert.equal(result.code, 0, result.stderr);
    const cleaned = JSON.parse(await readFile(dockerState, 'utf8'));
    assert.equal(cleaned['container-api'], undefined);
    assert.equal(cleaned['container-db'], undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('MCP server exposes and executes ChronoLab tools over stdio', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chronolab-mcp-'));
  const dockerState = path.join(root, 'fake-docker.json');
  await writeFile(dockerState, '{}');
  const env = { ...process.env, CHRONOLAB_DOCKER: fakeDocker, FAKE_DOCKER_STATE: dockerState };
  try {
    await run(['run', 'demo:chrono', '--at', '2026-01-01T00:00:00Z', '--root', root], env);
    const child = spawn(process.execPath, [cli, 'mcp', 'serve', '--root', root], { cwd: packageRoot, env });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
    child.stdin.end([
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'chronolab_now', arguments: {} } }),
    ].join('\n'));
    const code = await new Promise(resolve => child.on('close', resolve));
    assert.equal(code, 0, stderr);
    const replies = stdout.trim().split('\n').map(JSON.parse);
    assert.equal(replies[0].result.serverInfo.name, 'chronolab');
    assert.ok(replies[1].result.tools.some(tool => tool.name === 'chronolab_advance'));
    assert.equal(replies[2].result.structuredContent.logicalTime, '2026-01-01T00:00:00.000Z');
  } finally { await rm(root, { recursive: true, force: true }); }
});
