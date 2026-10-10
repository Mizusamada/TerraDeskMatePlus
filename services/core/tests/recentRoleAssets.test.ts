import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { inspectModel } from '../src/assets.js';

// Design reason: recent role/skin support is a resource-contract change, so the
// regression test validates the same Spine triplet and parser path used by the app.
// This prevents a metadata-only entry or static preview image from masquerading as
// an interactive action model.
test('recent PRTS roles and Sightseer IV skins expose complete Spine resources', () => {
  const root = path.resolve('assets/builtin');
  const expected = [
    ['克莱门莎', '克莱门莎-原皮'],
    ['德·托莱多', '德·托莱多-原皮'],
    ['旅骨', '旅骨-原皮'],
    ['Tragodia', 'Tragodia-真我自扼'],
    ['Mantra', 'Mantra-万籁俱寂'],
    ['Лето', 'Лето-来日欢歌'],
  ];
  for (const [role, skin] of expected) {
    for (const view of ['基建', '正面', '背面']) {
      const dir = path.join(root, '干员模型', role, skin, view);
      assert.ok(fs.existsSync(dir), `${role}/${skin}/${view} directory missing`);
      const skeleton = fs.readdirSync(dir).find((name) => name.endsWith('.skel'));
      const atlas = fs.readdirSync(dir).find((name) => name.endsWith('.atlas'));
      assert.ok(skeleton && atlas, `${role}/${skin}/${view} Spine pair missing`);
      const model = inspectModel(path.join(dir, skeleton), true);
      assert.equal(model.version, '3.8.99', `${role}/${skin}/${view} Spine version`);
      assert.ok(model.animations.length > 0, `${role}/${skin}/${view} has no animations`);
      for (const image of model.images) assert.ok(fs.existsSync(path.join(dir, image)), `${role}/${skin}/${view} missing ${image}`);
    }
  }
});
