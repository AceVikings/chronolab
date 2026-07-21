import assert from 'node:assert/strict';
import test from 'node:test';
import { renderWrapperDockerfile } from '../src/wrapper.js';

test('wrapper preserves the original image as its final base', () => {
  const result = renderWrapperDockerfile({ baseImage: 'chronolab-base:abc', shimImage: 'shim:test' });
  assert.match(result, /FROM shim:test AS chrono-shim/);
  assert.match(result, /FROM chronolab-base:abc/);
  assert.match(result, /FAKETIME_TIMESTAMP_FILE=\/run\/chronolab\/faketimerc/);
  assert.match(result, /TZ=UTC/);
  assert.doesNotMatch(result, /ENTRYPOINT|CMD/);
  assert.match(result, /dev\.chronolab\.wrapped="true"/);
});
