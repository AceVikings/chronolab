import { setTimeout as delay } from 'node:timers/promises';
import { ChronoError } from './errors.js';

const SCENARIOS = new Set(['subscription_creation', 'subscription_renewal', 'subscription_pause', 'subscription_resume', 'subscription_cancellation']);
const PAYMENT_OUTCOMES = new Set(['success', 'recovered_existing_payment_method', 'recovered_updated_payment_method', 'failed']);
const DUNNING_ACTIONS = new Set(['subscription_paused', 'subscription_canceled']);
const EFFECTIVE_FROM = new Set(['immediately', 'next_billing_period']);

function requireId(value, prefix, code, label) {
  if (!value || !String(value).startsWith(prefix)) throw new ChronoError(code, `${label} must start with ${prefix}`);
  return String(value);
}

export class PaddleSimulator {
  constructor({
    key = process.env.PADDLE_SANDBOX_API_KEY,
    fetchImpl = globalThis.fetch,
    baseUrl = 'https://sandbox-api.paddle.com',
    pollMs = 500,
    timeoutMs = 60_000,
  } = {}) {
    if (!key) throw new ChronoError('PADDLE_KEY_MISSING', 'Set PADDLE_SANDBOX_API_KEY to a Paddle sandbox API key.');
    if (!key.includes('_sdbx_')) throw new ChronoError('PADDLE_LIVE_MODE_REFUSED', 'ChronoLab accepts Paddle sandbox API keys only.');
    if (baseUrl !== 'https://sandbox-api.paddle.com' && !baseUrl.startsWith('http://127.0.0.1') && !baseUrl.startsWith('https://paddle.test')) {
      throw new ChronoError('PADDLE_LIVE_MODE_REFUSED', 'ChronoLab refuses non-sandbox Paddle API endpoints.');
    }
    this.key = key;
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.pollMs = pollMs;
    this.timeoutMs = timeoutMs;
  }

  async request(method, route, body) {
    const response = await this.fetch(`${this.baseUrl}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Paddle-Version': '1',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ChronoError('PADDLE_API_ERROR', payload.error?.detail || payload.error?.type || `Paddle returned HTTP ${response.status}.`, {
        status: response.status,
        type: payload.error?.type,
        code: payload.error?.code,
      });
    }
    if (!payload.data) throw new ChronoError('PADDLE_INVALID_RESPONSE', 'Paddle did not return a data object.');
    return payload.data;
  }

  createScenario({ notificationSettingId, type, name = 'ChronoLab simulation', subscriptionId, paymentOutcome, dunningAction, effectiveFrom } = {}) {
    requireId(notificationSettingId, 'ntfset_', 'INVALID_PADDLE_NOTIFICATION_SETTING', 'Paddle notification setting ID');
    if (!SCENARIOS.has(type)) throw new ChronoError('INVALID_PADDLE_SCENARIO', `Unsupported Paddle scenario: ${type}`);
    if (paymentOutcome && !PAYMENT_OUTCOMES.has(paymentOutcome)) throw new ChronoError('INVALID_PADDLE_OPTION', `Unsupported Paddle payment outcome: ${paymentOutcome}`);
    if (dunningAction && !DUNNING_ACTIONS.has(dunningAction)) throw new ChronoError('INVALID_PADDLE_OPTION', `Unsupported Paddle dunning action: ${dunningAction}`);
    if (effectiveFrom && !EFFECTIVE_FROM.has(effectiveFrom)) throw new ChronoError('INVALID_PADDLE_OPTION', `Unsupported Paddle effective-from value: ${effectiveFrom}`);
    if (subscriptionId) requireId(subscriptionId, 'sub_', 'INVALID_PADDLE_SUBSCRIPTION', 'Paddle subscription ID');

    const scenario = {};
    if (subscriptionId) scenario.entities = { subscription_id: subscriptionId };
    const options = {};
    if (paymentOutcome) options.payment_outcome = paymentOutcome;
    if (dunningAction) options.dunning_exhausted_action = dunningAction;
    if (effectiveFrom) options.effective_from = effectiveFrom;
    if (Object.keys(options).length) scenario.options = options;
    const body = { notification_setting_id: notificationSettingId, name, type };
    if (Object.keys(scenario).length) body.config = { [type]: scenario };
    return this.request('POST', '/simulations', body);
  }

  createRun(simulationId) {
    requireId(simulationId, 'ntfsim_', 'INVALID_PADDLE_SIMULATION', 'Paddle simulation ID');
    return this.request('POST', `/simulations/${encodeURIComponent(simulationId)}/runs`);
  }

  retrieveRun(simulationId, runId) {
    requireId(simulationId, 'ntfsim_', 'INVALID_PADDLE_SIMULATION', 'Paddle simulation ID');
    requireId(runId, 'ntfsimrun_', 'INVALID_PADDLE_SIMULATION_RUN', 'Paddle simulation run ID');
    return this.request('GET', `/simulations/${encodeURIComponent(simulationId)}/runs/${encodeURIComponent(runId)}?include=events`);
  }

  async waitForRun(simulationId, runId) {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const run = await this.retrieveRun(simulationId, runId);
      if (run.status === 'canceled') throw new ChronoError('PADDLE_SIMULATION_CANCELED', `Paddle simulation run ${runId} was canceled.`);
      if (run.status === 'completed') {
        const failures = (run.events || []).filter(event => event.status !== 'success');
        if (failures.length) throw new ChronoError('PADDLE_SIMULATION_DELIVERY_FAILED', `${failures.length} Paddle simulation event(s) were not delivered successfully.`, {
          events: failures.map(event => ({ id: event.id, eventType: event.event_type, status: event.status, statusCode: event.response?.status_code })),
        });
        return run;
      }
      await delay(this.pollMs);
    }
    throw new ChronoError('PADDLE_TIMEOUT', `Paddle simulation run ${runId} did not complete within ${this.timeoutMs}ms.`);
  }

  async simulate(options) {
    const simulation = await this.createScenario(options);
    const started = await this.createRun(simulation.id);
    const run = await this.waitForRun(simulation.id, started.id);
    return { simulation, run };
  }
}
