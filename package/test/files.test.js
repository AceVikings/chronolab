import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { atomicWrite, withLock } from '../src/files.js';

test('atomically replaces a file', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'chronolab-files-'));
  try {
    const file = path.join(dir, 'state');
    await atomicWrite(file, 'first');
    await atomicWrite(file, 'second');
    assert.equal(await readFile(file, 'utf8'), 'second');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rejects concurrent lock acquisition', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'chronolab-lock-'));
  try {
    const lock = path.join(dir, 'lock');
    await withLock(lock, async () => {
      await assert.rejects(withLock(lock, async () => {}), error => error.code === 'RUN_LOCKED');
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
