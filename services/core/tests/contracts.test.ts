import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ASSET_ROOT, planInteraction, validateLlmConfig, cloneDefaultConfig, canExecuteTool } from '../../../packages/contracts/src/index.js';

test('fixed interactions keep the known voice mapping', () => {
  assert.equal(planInteraction('head_touch').voiceId, 'cn_036');
  assert.equal(planInteraction('face_poke').voiceId, 'cn_034');
  assert.equal(planInteraction('greet').voiceId, 'cn_042');
  assert.match(planInteraction('greet').audioPath ?? '', /干员语音\\Amiya\\cn_042\.mp3$/);
});

test('unknown fixed interactions are rejected', () => {
  assert.throws(() => planInteraction('delete_everything'), /Unknown interaction/);
});

test('llm config validates non-http endpoints for real providers', () => {
  const config = cloneDefaultConfig().llm;
  config.provider = 'openai-compatible';
  config.baseUrl = 'file:///secret';
  assert.ok(validateLlmConfig(config).some((message) => message.includes('Base URL')));
  config.baseUrl = 'http://127.0.0.1:8000/v1';
  assert.equal(validateLlmConfig(config).length, 0);
});

test('computer tools are denied by default', () => {
  const result = canExecuteTool(cloneDefaultConfig().permissions, 'open_allowed_app');
  assert.equal(result.allowed, false);
  assert.match(result.reason, /关闭/);
});

test('asset root stays on the documented read-only path', () => {
  assert.equal(DEFAULT_ASSET_ROOT, 'D:\\ak');
});
