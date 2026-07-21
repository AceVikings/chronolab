import { setTimeout as delay } from 'node:timers/promises';
import { ChronoError } from './errors.js';

export class StripeTestClocks {
  constructor({ key = process.env.STRIPE_SECRET_KEY, fetchImpl = globalThis.fetch, baseUrl = 'https://api.stripe.com/v1', pollMs = 500, timeoutMs = 60_000 } = {}) {
    if (!key) throw new ChronoError('STRIPE_KEY_MISSING', 'Set STRIPE_SECRET_KEY to a Stripe sandbox secret key.');
    if (!key.startsWith('sk_test_')) throw new ChronoError('STRIPE_LIVE_MODE_REFUSED', 'ChronoLab accepts Stripe test-mode secret keys only.');
    this.key = key;
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
    this.pollMs = pollMs;
    this.timeoutMs = timeoutMs;
  }

  async request(method, route, body) {
    const response = await this.fetch(`${this.baseUrl}${route}`, {
      method,
      headers: { Authorization: `Bearer ${this.key}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: body ? new URLSearchParams(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ChronoError('STRIPE_API_ERROR', data.error?.message || `Stripe returned HTTP ${response.status}.`, { status: response.status, type: data.error?.type, code: data.error?.code });
    if (data.livemode) throw new ChronoError('STRIPE_LIVE_MODE_REFUSED', 'A live-mode Stripe object was refused.');
    return data;
  }

  create(at, name = 'ChronoLab') { return this.request('POST', '/test_helpers/test_clocks', { frozen_time: Math.floor(new Date(at).valueOf() / 1000), name }); }
  retrieve(clockId) { return this.request('GET', `/test_helpers/test_clocks/${encodeURIComponent(clockId)}`); }
  delete(clockId) { return this.request('DELETE', `/test_helpers/test_clocks/${encodeURIComponent(clockId)}`); }
  async advance(clockId, target) {
    await this.request('POST', `/test_helpers/test_clocks/${encodeURIComponent(clockId)}/advance`, { frozen_time: Math.floor(new Date(target).valueOf() / 1000) });
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const clock = await this.retrieve(clockId);
      if (clock.status === 'ready') return clock;
      await delay(this.pollMs);
    }
    throw new ChronoError('STRIPE_TIMEOUT', `Stripe Test Clock ${clockId} did not become ready within ${this.timeoutMs}ms.`);
  }
}
