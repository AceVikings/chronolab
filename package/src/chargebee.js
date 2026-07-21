import { setTimeout as delay } from 'node:timers/promises';
import { ChronoError } from './errors.js';

function epochSeconds(value) {
  const milliseconds = new Date(value).valueOf();
  if (!Number.isFinite(milliseconds)) throw new ChronoError('INVALID_TIMESTAMP', `Invalid timestamp: ${value}`);
  return Math.floor(milliseconds / 1000);
}

export class ChargebeeTimeMachine {
  constructor({
    site = process.env.CHARGEBEE_TEST_SITE,
    key = process.env.CHARGEBEE_API_KEY,
    fetchImpl = globalThis.fetch,
    baseUrl,
    pollMs = 3_000,
    timeoutMs = 120_000,
  } = {}) {
    if (!site) throw new ChronoError('CHARGEBEE_SITE_MISSING', 'Set CHARGEBEE_TEST_SITE to the Chargebee test-site subdomain.');
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(site)) throw new ChronoError('INVALID_CHARGEBEE_SITE', 'Chargebee test-site names may contain only letters, numbers, and hyphens.');
    if (!key) throw new ChronoError('CHARGEBEE_KEY_MISSING', 'Set CHARGEBEE_API_KEY to a Chargebee test-site API key.');
    this.site = site;
    this.key = key;
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl || `https://${site}.chargebee.com/api/v2`;
    this.pollMs = pollMs;
    this.timeoutMs = timeoutMs;
  }

  async request(method, route, body) {
    const response = await this.fetch(`${this.baseUrl}${route}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.key}:`).toString('base64')}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: body ? new URLSearchParams(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ChronoError('CHARGEBEE_API_ERROR', data.message || `Chargebee returned HTTP ${response.status}.`, {
        status: response.status,
        type: data.type,
        apiErrorCode: data.api_error_code,
      });
    }
    const machine = data.time_machine;
    if (!machine) throw new ChronoError('CHARGEBEE_INVALID_RESPONSE', 'Chargebee did not return a time_machine object.');
    return machine;
  }

  retrieve() { return this.request('GET', '/time_machines/delorean'); }

  async waitUntilComplete() {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const machine = await this.retrieve();
      if (machine.time_travel_status === 'succeeded') return machine;
      if (machine.time_travel_status === 'failed') {
        throw new ChronoError('CHARGEBEE_TIME_TRAVEL_FAILED', machine.failure_reason || 'Chargebee Time Machine travel failed.', {
          failureCode: machine.failure_code,
        });
      }
      await delay(this.pollMs);
    }
    throw new ChronoError('CHARGEBEE_TIMEOUT', `Chargebee Time Machine did not complete within ${this.timeoutMs}ms.`);
  }

  async startAfresh(at) {
    await this.request('POST', '/time_machines/delorean/start_afresh', { genesis_time: epochSeconds(at) });
    return this.waitUntilComplete();
  }

  async travelForward(target) {
    await this.request('POST', '/time_machines/delorean/travel_forward', { destination_time: epochSeconds(target) });
    return this.waitUntilComplete();
  }
}
