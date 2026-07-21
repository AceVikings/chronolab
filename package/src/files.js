import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ChronoError } from './errors.js';

export async function atomicWrite(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, file);
}

export async function writeJson(file, value) {
  await atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson(file, code = 'STATE_NOT_FOUND') {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new ChronoError(code, `File not found: ${file}`);
    if (error instanceof SyntaxError) throw new ChronoError('INVALID_STATE', `Invalid JSON in ${file}`);
    throw error;
  }
}

export async function withLock(file, action) {
  await mkdir(path.dirname(file), { recursive: true });
  let handle;
  try {
    handle = await open(file, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') throw new ChronoError('RUN_LOCKED', 'Another clock mutation is already in progress.');
    throw error;
  }
  try {
    await handle.writeFile(`${process.pid}\n`);
    return await action();
  } finally {
    await handle.close();
    await rm(file, { force: true });
  }
}

export async function appendJsonLine(file, event) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(event)}\n`, { flag: 'a', mode: 0o600 });
}
