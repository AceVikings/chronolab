import assert from 'node:assert/strict';
import test from 'node:test';
import { PaddleSimulator } from '../src/paddle.js';

function response(data, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { data } : { error: data }), { status, headers: { 'content-type': 'application/json' } });
}

test('creates and completes a Paddle sandbox renewal simulation', async () => {
  const calls = [];
  let retrievals = 0;
  const client = new PaddleSimulator({
    key: 'pdl_sdbx_apikey_example',
    baseUrl: 'https://paddle.test',
    pollMs: 0,
    timeoutMs: 1_000,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/simulations')) return response({ id: 'ntfsim_example', status: 'active', type: 'subscription_renewal' }, 201);
      if (url.endsWith('/runs') && options.method === 'POST') return response({ id: 'ntfsimrun_example', status: 'pending', type: 'subscription_renewal' }, 201);
      retrievals += 1;
      return response(retrievals > 1
        ? { id: 'ntfsimrun_example', status: 'completed', type: 'subscription_renewal', events: [{ id: 'ntfsimevt_1', event_type: 'subscription.updated', status: 'success', response: { status_code: 200 } }] }
        : { id: 'ntfsimrun_example', status: 'pending', type: 'subscription_renewal' });
    },
  });

  const result = await client.simulate({
    notificationSettingId: 'ntfset_example',
    type: 'subscription_renewal',
    subscriptionId: 'sub_example',
    paymentOutcome: 'failed',
    dunningAction: 'subscription_canceled',
  });

  assert.equal(result.run.status, 'completed');
  const createBody = JSON.parse(calls[0].options.body);
  assert.equal(createBody.notification_setting_id, 'ntfset_example');
  assert.equal(createBody.config.subscription_renewal.entities.subscription_id, 'sub_example');
  assert.equal(createBody.config.subscription_renewal.options.payment_outcome, 'failed');
  assert.equal(createBody.config.subscription_renewal.options.dunning_exhausted_action, 'subscription_canceled');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer pdl_sdbx_apikey_example');
  assert.ok(calls.some(call => call.url.endsWith('/ntfsimrun_example?include=events')));
});

test('refuses Paddle live credentials, endpoints, and invalid scenarios', () => {
  assert.throws(() => new PaddleSimulator({ key: 'pdl_live_apikey_example' }), error => error.code === 'PADDLE_LIVE_MODE_REFUSED');
  assert.throws(() => new PaddleSimulator({ key: 'pdl_sdbx_apikey_example', baseUrl: 'https://api.paddle.com' }), error => error.code === 'PADDLE_LIVE_MODE_REFUSED');
  const client = new PaddleSimulator({ key: 'pdl_sdbx_apikey_example', baseUrl: 'https://paddle.test', fetchImpl: async () => response({}) });
  assert.throws(() => client.createScenario({ notificationSettingId: 'ntfset_example', type: 'unknown' }), error => error.code === 'INVALID_PADDLE_SCENARIO');
  assert.throws(() => client.createScenario({ notificationSettingId: 'bad', type: 'subscription_renewal' }), error => error.code === 'INVALID_PADDLE_NOTIFICATION_SETTING');
});

test('surfaces failed Paddle webhook deliveries and sanitizes API errors', async () => {
  const failed = new PaddleSimulator({
    key: 'pdl_sdbx_apikey_secret', baseUrl: 'https://paddle.test', pollMs: 0, timeoutMs: 100,
    fetchImpl: async (url) => url.endsWith('/simulations')
      ? response({ id: 'ntfsim_example' }, 201)
      : url.endsWith('/runs')
        ? response({ id: 'ntfsimrun_example', status: 'pending' }, 201)
        : response({ id: 'ntfsimrun_example', status: 'completed', events: [{ id: 'ntfsimevt_bad', event_type: 'subscription.updated', status: 'failed', response: { status_code: 500 } }] }),
  });
  await assert.rejects(failed.simulate({ notificationSettingId: 'ntfset_example', type: 'subscription_renewal' }), error => error.code === 'PADDLE_SIMULATION_DELIVERY_FAILED');

  const apiError = new PaddleSimulator({ key: 'pdl_sdbx_apikey_secret', baseUrl: 'https://paddle.test', fetchImpl: async () => response({ type: 'request_error', code: 'bad_request', detail: 'invalid simulation' }, 400) });
  await assert.rejects(apiError.createRun('ntfsim_example'), error => error.code === 'PADDLE_API_ERROR' && !error.message.includes('pdl_sdbx_apikey_secret'));
});
