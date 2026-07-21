import { createServer } from 'node:http';
import { readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { appendJsonLine } from './files.js';
import { ChronoError } from './errors.js';

function bufferedFile(dir, provider) {
  return path.join(dir, provider === 'stripe' ? 'buffered-webhooks.jsonl' : `buffered-${provider}-webhooks.jsonl`);
}

async function bodyOf(request, limit = 1_048_576) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new ChronoError('WEBHOOK_TOO_LARGE', `Webhook exceeds ${limit} bytes.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function forwardWebhook({ forwardTo, body, headers, runId, provider = 'stripe', signatureHeader = 'stripe-signature', fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(forwardTo, {
    method: 'POST', body,
    headers: {
      'content-type': headers['content-type'] || 'application/json',
      [signatureHeader]: headers[signatureHeader] || '',
      'x-chronolab-run-id': runId,
      'x-chronolab-provider': provider,
    },
  });
  if (!response.ok) throw new ChronoError('WEBHOOK_FORWARD_FAILED', `Webhook target returned HTTP ${response.status}.`);
}

export async function releaseBuffered({ dir, forwardTo, runId, provider = 'stripe', signatureHeader = 'stripe-signature', fetchImpl = globalThis.fetch }) {
  const file = bufferedFile(dir, provider);
  let total = 0;
  for (let batchNumber = 0; batchNumber < 100; batchNumber += 1) {
    const batch = `${file}.releasing-${process.pid}-${batchNumber}`;
    try { await rename(file, batch); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
    const text = await readFile(batch, 'utf8');
    const entries = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    try {
      for (const entry of entries) await forwardWebhook({ forwardTo, runId, provider, signatureHeader, fetchImpl, headers: entry.headers, body: Buffer.from(entry.body, 'base64') });
      total += entries.length;
      await rm(batch, { force: true });
    } catch (error) {
      throw new ChronoError('WEBHOOK_RELEASE_FAILED', `${error.message} Buffered payloads remain at ${batch}.`);
    }
  }
  return total;
}

export async function listenWebhooks({ run, port = 4243, host = '127.0.0.1', forwardTo, provider = 'stripe', signatureHeader = 'stripe-signature', fetchImpl = globalThis.fetch, signal }) {
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'POST') { response.writeHead(405).end(); return; }
      const body = await bodyOf(request);
      const current = JSON.parse(await readFile(path.join(run.dir, 'state.json'), 'utf8'));
      if (current.status === 'advancing') {
        await appendJsonLine(bufferedFile(run.dir, provider), { receivedAt: new Date().toISOString(), provider, headers: { 'content-type': request.headers['content-type'], [signatureHeader]: request.headers[signatureHeader] }, body: body.toString('base64') });
      } else await forwardWebhook({ forwardTo, body, headers: request.headers, runId: run.state.runId, provider, signatureHeader, fetchImpl });
      response.writeHead(202).end('accepted');
    } catch (error) { response.writeHead(502).end(error.message); }
  });
  if (signal) signal.addEventListener('abort', () => server.close(), { once: true });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return server;
}
