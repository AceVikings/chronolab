import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { appendJsonLine } from '../src/files.js';
import { releaseBuffered } from '../src/webhook.js';

test('releases buffered webhooks in order without modifying payloads', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'chronolab-webhooks-'));
  const seen = [];
  try {
    for (const body of ['{"id":1}', '{"id":2}']) await appendJsonLine(path.join(dir, 'buffered-webhooks.jsonl'), { headers: { 'content-type': 'application/json', 'stripe-signature': 'sig' }, body: Buffer.from(body).toString('base64') });
    const count = await releaseBuffered({ dir, runId: 'run_test', forwardTo: 'http://example.test', fetchImpl: async (url, options) => { seen.push({ url, body: options.body.toString(), runId: options.headers['x-chronolab-run-id'] }); return new Response('', { status: 200 }); } });
    assert.equal(count, 2);
    assert.deepEqual(seen.map(item => item.body), ['{"id":1}', '{"id":2}']);
    assert.equal(seen[0].runId, 'run_test');
    await assert.rejects(readFile(path.join(dir, 'buffered-webhooks.jsonl'), 'utf8'), error => error.code === 'ENOENT');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
