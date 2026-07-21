import assert from 'node:assert/strict';
import test from 'node:test';
import { addDuration, parseDuration } from '../src/duration.js';

test('parses fixed durations', () => {
  assert.deepEqual(parseDuration('30d'), { milliseconds: 2_592_000_000, months: 0 });
  assert.deepEqual(parseDuration('1.5h'), { milliseconds: 5_400_000, months: 0 });
});

test('parses calendar and ISO-8601 durations', () => {
  assert.deepEqual(parseDuration('1mo'), { milliseconds: 0, months: 1 });
  assert.deepEqual(parseDuration('P1M2DT3H'), { months: 1, milliseconds: 183_600_000 });
});

test('adds calendar months in UTC', () => {
  assert.equal(addDuration('2026-01-01T00:00:00.000Z', parseDuration('1mo')), '2026-02-01T00:00:00.000Z');
});

test('rejects invalid durations with a stable code', () => {
  assert.throws(() => parseDuration('tomorrow'), error => error.code === 'INVALID_DURATION');
});
