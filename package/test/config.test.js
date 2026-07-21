import assert from 'node:assert/strict';
import test from 'node:test';
import { parseConfig } from '../src/config.js';

test('parses the documented ChronoLab YAML subset', () => {
  const config = parseConfig(`version: 1
services:
  api:
    context: ./api
    dockerfile: ./api/Dockerfile
    control: wall-clock
  postgres:
    control: passive
advance:
  strategy: restart
  order: [api]
`);
  assert.equal(config.services.api.control, 'wall-clock');
  assert.equal(config.services.postgres.control, 'passive');
  assert.deepEqual(config.advance.order, ['api']);
});
