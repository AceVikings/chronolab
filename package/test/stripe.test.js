import assert from 'node:assert/strict';
import test from 'node:test';
import { StripeTestClocks } from '../src/stripe.js';

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

test('creates and advances a sandbox Test Clock until ready', async () => {
  const calls = [];
  let retrievals = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/test_helpers/test_clocks')) return response({ id: 'clock_123', livemode: false, status: 'ready', frozen_time: 1 });
    if (url.endsWith('/advance')) return response({ id: 'clock_123', livemode: false, status: 'advancing' });
    retrievals += 1;
    return response({ id: 'clock_123', livemode: false, status: retrievals > 1 ? 'ready' : 'advancing', frozen_time: 2 });
  };
  const stripe = new StripeTestClocks({ key: 'sk_test_example', fetchImpl, baseUrl: 'https://stripe.test/v1', pollMs: 0, timeoutMs: 1000 });
  const created = await stripe.create('2026-01-01T00:00:00Z');
  assert.equal(created.id, 'clock_123');
  const advanced = await stripe.advance('clock_123', '2026-02-01T00:00:00Z');
  assert.equal(advanced.status, 'ready');
  assert.match(calls[0].options.headers.Authorization, /^Bearer sk_test_/);
  assert.match(String(calls.find(call => call.url.endsWith('/advance')).options.body), /frozen_time=/);
});

test('refuses live Stripe keys and sanitizes API errors', async () => {
  assert.throws(() => new StripeTestClocks({ key: 'sk_live_nope' }), error => error.code === 'STRIPE_LIVE_MODE_REFUSED');
  const stripe = new StripeTestClocks({ key: 'sk_test_example', fetchImpl: async () => response({ error: { message: 'invalid clock', type: 'invalid_request_error' } }, 400) });
  await assert.rejects(stripe.retrieve('clock_bad'), error => error.code === 'STRIPE_API_ERROR' && !error.message.includes('sk_test_example'));
});
