import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSettings, encodeSettings } from '../src/settingsCodec.js';
import { cloneDefaultConfig } from '../../../packages/contracts/src/index.js';

test('settings codec round-trips without changing defaults', () => {
  const config = cloneDefaultConfig();
  config.persona.addressCn = '指挥官';
  const decoded = decodeSettings(encodeSettings(config));
  assert.equal(decoded.persona.addressCn, '指挥官');
  assert.equal(decoded.persona.addressJa, 'ドクター');
  assert.equal(decoded.permissions.enabled, false);
});

test('settings codec recovers from malformed content', () => {
  const decoded = decodeSettings('{not json');
  assert.equal(decoded.persona.addressCn, '博士');
  assert.equal(decoded.speech.outputMode, 'text-only');
});
