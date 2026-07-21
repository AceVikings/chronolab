import { chmod, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { appendJsonLine, atomicWrite, readJson, writeJson } from './files.js';
import { ChronoError } from './errors.js';

export function paths(root = process.cwd()) {
  const data = path.resolve(root, '.chronolab');
  return { root: path.resolve(root), data, runs: path.join(data, 'runs'), generated: path.join(data, 'generated'), active: path.join(data, 'active-run') };
}

export async function createRun(root, logicalTime, image, options = {}) {
  const p = paths(root);
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(p.runs, runId);
  await mkdir(dir, { recursive: true });
  const state = {
    schemaVersion: 1, runId, generation: 1, status: 'ready', logicalTime,
    lastSuccessfulTime: logicalTime, mode: options.speed && options.speed !== 1 ? 'accelerated' : 'jump', speed: options.speed || 1, wallClockAnchor: new Date().toISOString(), image, services: {}, providers: {}, createdAt: new Date().toISOString(),
  };
  await writeClock(dir, logicalTime, options.speed);
  await writeJson(path.join(dir, 'state.json'), state);
  await atomicWrite(p.active, `${runId}\n`);
  return { state, dir, paths: p };
}

export async function loadRun(root, explicitRunId) {
  const p = paths(root);
  let runId = explicitRunId;
  if (!runId) {
    try { runId = (await readFile(p.active, 'utf8')).trim(); }
    catch (error) {
      if (error.code === 'ENOENT') throw new ChronoError('NO_ACTIVE_RUN', 'No active ChronoLab run. Start one with `chrono run`.');
      throw error;
    }
  }
  const dir = path.join(p.runs, runId);
  const state = await readJson(path.join(dir, 'state.json'));
  if (state.schemaVersion !== 1 || state.runId !== runId) throw new ChronoError('INVALID_STATE', `Invalid state for ${runId}.`);
  return { state, dir, paths: p };
}

export async function saveState(dir, state) { await writeJson(path.join(dir, 'state.json'), state); }
export async function writeClock(dir, isoTime, speed) {
  const file = path.join(dir, 'faketimerc');
  await atomicWrite(file, `@${isoTime.slice(0, 19).replace('T', ' ')}${speed && speed !== 1 ? ` x${speed}` : ''}\n`);
  await chmod(file, 0o644);
}
export async function event(dir, type, data = {}) { await appendJsonLine(path.join(dir, 'events.jsonl'), { type, at: new Date().toISOString(), ...data }); }
export async function clearActive(p, runId) {
  try {
    if ((await readFile(p.active, 'utf8')).trim() === runId) await rm(p.active, { force: true });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
