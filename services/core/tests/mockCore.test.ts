import test from 'node:test';
import assert from 'node:assert/strict';
import { MockCore } from '../src/mockCore.js';

test('mock reply keeps Japanese for speech and Chinese for subtitles', () => {
  const core = new MockCore();
  const reply = core.sendMessage('今天有点累');
  assert.match(reply.textJa, /ドクター/);
  assert.match(reply.textZh, /博士/);
  assert.equal(reply.emotion, 'care');
  assert.equal(reply.action, 'thinking');
});

test('memory requires explicit non-empty content and can be edited/deleted', () => {
  const core = new MockCore();
  assert.throws(() => core.addMemory('   '), /不能为空/);
  const memory = core.addMemory('喜欢晚上听轻音乐');
  assert.equal(core.listMemories().length, 1);
  core.updateMemory(memory.id, '喜欢晚上听轻音乐和白噪音');
  assert.equal(core.listMemories()[0].content, '喜欢晚上听轻音乐和白噪音');
  core.pauseMemory(memory.id, true);
  assert.equal(core.listMemories().length, 0);
  core.deleteMemory(memory.id);
  assert.equal(core.getConfig().memories.length, 0);
});
