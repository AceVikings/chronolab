import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { dispatch } from '../src/cli.js';
import { createRun, saveState } from '../src/state.js';

class MemoryDocker {
  constructor(dir, calls) { this.dir = dir; this.calls = calls; }
  async exec(id, args) {
    this.calls.push(`exec:${id}:${args.join(' ')}`);
    if (args.join(' ') === '/bin/date +%s') {
      const clock = await readFile(path.join(this.dir, 'faketimerc'), 'utf8');
      const anchor = clock.trim().slice(1).split(/\s+x/)[0];
      return String(Math.floor(new Date(`${anchor.replace(' ', 'T')}Z`).valueOf() / 1000));
    }
    return '';
  }
  async stop(id) { this.calls.push(`stop:${id}`); }
  async start(id) { this.calls.push(`start:${id}`); }
}

test('bare help flags return CLI usage', async () => {
  for (const flag of ['--help', '-h']) {
    const result = await dispatch([flag]);
    assert.match(result.value.message, /ChronoLab — deterministic wall-clock testing for Docker/);
    assert.match(result.value.message, /chrono chargebee start/);
    assert.match(result.value.message, /chrono paddle simulate/);
  }
});

test('Stripe commands attach a sandbox clock and advancement coordinates it before restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chronolab-core-stripe-'));
  const calls = [];
  try {
    const run = await createRun(root, '2026-01-01T00:00:00.000Z', 'demo');
    run.state.services.main = { containerId: 'container-1', control: 'wall-clock' };
    await saveState(run.dir, run.state);
    const stripe = {
      async retrieve(id) { calls.push(`stripe:retrieve:${id}`); return { id, status: 'ready', frozen_time: 1, livemode: false }; },
      async advance(id, target) { calls.push(`stripe:advance:${id}:${target}`); return { id, status: 'ready', frozen_time: Math.floor(new Date(target).valueOf() / 1000) }; },
    };
    const dependencies = { docker: new MemoryDocker(run.dir, calls), stripeFactory: () => stripe };
    await dispatch(['stripe', 'attach', 'clock_123', '--root', root], dependencies);
    const result = await dispatch(['advance', '1d', '--root', root], dependencies);
    assert.equal(result.value.logicalTime, '2026-01-02T00:00:00.000Z');
    assert.ok(calls.indexOf('stop:container-1') < calls.findIndex(call => call.startsWith('stripe:advance:')));
    assert.ok(calls.findIndex(call => call.startsWith('stripe:advance:')) < calls.indexOf('start:container-1'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Chargebee Time Machine advancement completes before local services restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chronolab-core-chargebee-'));
  const calls = [];
  try {
    const run = await createRun(root, '2026-01-01T00:00:00.000Z', 'demo');
    run.state.services.main = { containerId: 'container-1', control: 'wall-clock' };
    await saveState(run.dir, run.state);
    const chargebee = {
      site: 'chronolab-test',
      async retrieve() { calls.push('chargebee:retrieve'); return { name: 'delorean', time_travel_status: 'succeeded', genesis_time: 1, destination_time: 1 }; },
      async travelForward(target) { calls.push(`chargebee:advance:${target}`); return { name: 'delorean', time_travel_status: 'succeeded', destination_time: Math.floor(new Date(target).valueOf() / 1000) }; },
    };
    const dependencies = { docker: new MemoryDocker(run.dir, calls), chargebeeFactory: () => chargebee };
    await dispatch(['chargebee', 'attach', '--site', 'chronolab-test', '--root', root], dependencies);
    const result = await dispatch(['advance', '1d', '--root', root], dependencies);
    assert.equal(result.value.logicalTime, '2026-01-02T00:00:00.000Z');
    assert.ok(calls.indexOf('stop:container-1') < calls.findIndex(call => call.startsWith('chargebee:advance:')));
    assert.ok(calls.findIndex(call => call.startsWith('chargebee:advance:')) < calls.indexOf('start:container-1'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Paddle simulation command persists successful sandbox delivery metadata', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chronolab-core-paddle-'));
  try {
    await createRun(root, '2026-01-01T00:00:00.000Z', 'demo');
    const paddle = {
      async simulate(options) {
        assert.equal(options.type, 'subscription_renewal');
        assert.equal(options.notificationSettingId, 'ntfset_example');
        return { simulation: { id: 'ntfsim_example' }, run: { id: 'ntfsimrun_example', status: 'completed', events: [{ id: 'evt_1', event_type: 'subscription.updated', status: 'success' }] } };
      },
    };
    const result = await dispatch(['paddle', 'simulate', 'subscription-renewal', '--notification-setting', 'ntfset_example', '--root', root], { paddleFactory: () => paddle });
    assert.equal(result.value.status, 'completed');
    assert.equal(result.value.simulationId, 'ntfsim_example');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('warp writes an accelerated clock and now reads the controlled process', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chronolab-core-warp-'));
  const calls = [];
  try {
    const run = await createRun(root, '2026-01-01T00:00:00.000Z', 'demo');
    run.state.services.main = { containerId: 'container-1', control: 'wall-clock' };
    await saveState(run.dir, run.state);
    const dependencies = { docker: new MemoryDocker(run.dir, calls) };
    const result = await dispatch(['warp', '3600x', '--root', root], dependencies);
    assert.equal(result.value.speed, 3600);
    assert.match(await readFile(path.join(run.dir, 'faketimerc'), 'utf8'), / x3600\n$/);
    const now = await dispatch(['now', '--root', root], dependencies);
    assert.equal(now.value.mode, 'accelerated');
  } finally { await rm(root, { recursive: true, force: true }); }
});
