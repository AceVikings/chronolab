#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const stateFile = process.env.FAKE_DOCKER_STATE;
let state = {};
try { state = JSON.parse(await readFile(stateFile, 'utf8')); } catch {}

async function save() { await writeFile(stateFile, JSON.stringify(state)); }

if (args[0] === 'run') {
  const mountIndex = args.indexOf('--mount');
  const mount = mountIndex >= 0 ? args[mountIndex + 1] : '';
  const source = /(?:^|,)src=([^,]+)/.exec(mount)?.[1];
  state['container-test'] = { source, running: true };
  await save();
  console.log('container-test');
} else if (args[0] === 'exec') {
  const container = state[args[1]];
  if (args.slice(2).join(' ') === '/bin/date +%s') {
    const clock = await readFile(`${container.source}/faketimerc`, 'utf8');
    const anchor = clock.trim().slice(1).split(/\s+x/)[0];
    console.log(Math.floor(new Date(`${anchor.replace(' ', 'T')}Z`).valueOf() / 1000));
  } else console.log(`executed: ${args.slice(2).join(' ')}`);
} else if (args[0] === 'stop') {
  state[args[1]].running = false; await save(); console.log(args[1]);
} else if (args[0] === 'start') {
  state[args[1]].running = true; await save(); console.log(args[1]);
} else if (args[0] === 'rm') {
  delete state[args.at(-1)]; await save(); console.log(args.at(-1));
} else if (args[0] === 'inspect') {
  const format = args[args.indexOf('--format') + 1];
  console.log(format?.includes('wrapped') ? 'true' : 'linux/amd64');
} else if (args[0] === 'build') {
  // Successful no-op for build workflow tests.
} else if (args[0] === 'compose') {
  const action = args.find(item => ['up', 'ps', 'down'].includes(item));
  const project = args[args.indexOf('-p') + 1];
  const files = args.flatMap((item, index) => item === '-f' ? [args[index + 1]] : []);
  const overrideFile = files.at(-1);
  state.compose ||= {};
  if (action === 'up') {
    const override = JSON.parse(await readFile(overrideFile, 'utf8'));
    state.compose[project] = {};
    for (const [name, service] of Object.entries(override.services)) {
      const id = `container-${name}`;
      const source = service.volumes?.[0]?.split(':/run/chronolab')[0];
      state[id] = { source, running: true, control: service.labels?.['dev.chronolab.control'] };
      state.compose[project][name] = id;
    }
    await save();
  } else if (action === 'ps') {
    console.log(state.compose[project]?.[args.at(-1)] || '');
  } else if (action === 'down') {
    for (const id of Object.values(state.compose[project] || {})) delete state[id];
    delete state.compose[project]; await save();
  }
} else {
  console.error(`unsupported fake Docker call: ${args.join(' ')}`);
  process.exitCode = 2;
}
