import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { appendJsonLine, writeJson } from '../src/files.js';
import { listenWebhooks, releaseBuffered } from '../src/webhook.js';

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

test('listener forwards exact Stripe bytes when ready and buffers them while advancing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'chronolab-listener-'));
  const controller = new AbortController();
  const forwarded = [];
  const run = { dir, state: { runId: 'run_listener' } };
  let server;
  try {
    await writeJson(path.join(dir, 'state.json'), { runId: 'run_listener', status: 'ready' });
    server = await listenWebhooks({
      run,
      port: 0,
      forwardTo: 'http://target.test/stripe',
      signal: controller.signal,
      fetchImpl: async (url, options) => {
        forwarded.push({ url, body: Buffer.from(options.body).toString(), headers: options.headers });
        return new Response(null, { status: 204 });
      },
    });
    const port = server.address().port;
    const headers = { 'content-type': 'application/json', 'stripe-signature': 't=123,v1=test' };

    const readyResponse = await fetch(`http://127.0.0.1:${port}`, { method: 'POST', headers, body: '{"id":"evt_ready"}' });
    assert.equal(readyResponse.status, 202);
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].body, '{"id":"evt_ready"}');
    assert.equal(forwarded[0].headers['stripe-signature'], 't=123,v1=test');
    assert.equal(forwarded[0].headers['x-chronolab-run-id'], 'run_listener');

    await writeJson(path.join(dir, 'state.json'), { runId: 'run_listener', status: 'advancing' });
    const advancingResponse = await fetch(`http://127.0.0.1:${port}`, { method: 'POST', headers, body: '{"id":"evt_buffered"}' });
    assert.equal(advancingResponse.status, 202);
    assert.equal(forwarded.length, 1);
    const [buffered] = (await readFile(path.join(dir, 'buffered-webhooks.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(Buffer.from(buffered.body, 'base64').toString(), '{"id":"evt_buffered"}');
    assert.equal(buffered.headers['stripe-signature'], 't=123,v1=test');
  } finally {
    controller.abort();
    if (server?.listening) await new Promise(resolve => server.once('close', resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
