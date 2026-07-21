import assert from 'node:assert/strict';
import test from 'node:test';
import { ChargebeeTimeMachine } from '../src/chargebee.js';

function response(timeMachine, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { time_machine: timeMachine } : timeMachine), { status, headers: { 'content-type': 'application/json' } });
}

test('starts afresh and travels forward on a Chargebee test-site Time Machine', async () => {
  const calls = [];
  const states = [
    { name: 'delorean', time_travel_status: 'in_progress' },
    { name: 'delorean', time_travel_status: 'succeeded', genesis_time: 1767225600, destination_time: 1767225600 },
    { name: 'delorean', time_travel_status: 'in_progress' },
    { name: 'delorean', time_travel_status: 'succeeded', genesis_time: 1767225600, destination_time: 1769904000 },
  ];
  const client = new ChargebeeTimeMachine({
    site: 'chronolab-test',
    key: 'test_key_example',
    baseUrl: 'https://chargebee.test/api/v2',
    pollMs: 0,
    timeoutMs: 1_000,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (options.method === 'GET') return response(states.shift());
      return response({ name: 'delorean', time_travel_status: 'in_progress' });
    },
  });

  const started = await client.startAfresh('2026-01-01T00:00:00Z');
  const advanced = await client.travelForward('2026-02-01T00:00:00Z');

  assert.equal(started.time_travel_status, 'succeeded');
  assert.equal(advanced.destination_time, 1769904000);
  assert.equal(calls[0].url, 'https://chargebee.test/api/v2/time_machines/delorean/start_afresh');
  assert.match(String(calls[0].options.body), /genesis_time=1767225600/);
  assert.match(String(calls.find(call => call.url.endsWith('/travel_forward')).options.body), /destination_time=1769904000/);
  assert.equal(calls[0].options.headers.Authorization, `Basic ${Buffer.from('test_key_example:').toString('base64')}`);
});

test('reports Chargebee failure and API errors without exposing credentials', async () => {
  const failed = new ChargebeeTimeMachine({
    site: 'chronolab-test', key: 'test_key_secret', pollMs: 0, timeoutMs: 100,
    fetchImpl: async (_url, options) => options.method === 'POST'
      ? response({ name: 'delorean', time_travel_status: 'in_progress' })
      : response({ name: 'delorean', time_travel_status: 'failed', failure_code: 'configuration_error', failure_reason: 'Time Machine is not enabled' }),
  });
  await assert.rejects(failed.travelForward('2026-02-01T00:00:00Z'), error => error.code === 'CHARGEBEE_TIME_TRAVEL_FAILED' && !error.message.includes('test_key_secret'));

  const apiError = new ChargebeeTimeMachine({ site: 'chronolab-test', key: 'test_key_secret', fetchImpl: async () => response({ message: 'invalid request', type: 'invalid_request', api_error_code: 'bad_request' }, 400) });
  await assert.rejects(apiError.retrieve(), error => error.code === 'CHARGEBEE_API_ERROR' && !error.message.includes('test_key_secret'));
});

test('validates Chargebee test-site configuration and bounded polling', async () => {
  assert.throws(() => new ChargebeeTimeMachine({ site: 'https://bad.example', key: 'key' }), error => error.code === 'INVALID_CHARGEBEE_SITE');
  const stalled = new ChargebeeTimeMachine({
    site: 'chronolab-test', key: 'key', pollMs: 0, timeoutMs: 1,
    fetchImpl: async () => response({ name: 'delorean', time_travel_status: 'in_progress' }),
  });
  await assert.rejects(stalled.travelForward('2026-02-01T00:00:00Z'), error => error.code === 'CHARGEBEE_TIMEOUT');
});
