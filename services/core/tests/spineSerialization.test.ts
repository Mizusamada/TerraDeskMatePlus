// Guard the actual user-reported skipped assets: extension is not sufficient to identify Spine serialization.
import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {inspectModel}from'../src/assets.js';
test('JSON-serialized skel resources are parsed as their actual format',()=>{
 const file=path.resolve('assets/builtin/干员模型/Cutter/Cutter-拭刀/基建/build_char_301_cutter_marthe_8.skel');
 const model=inspectModel(file,true);assert.equal(model.json,true);assert.equal(model.version,'3.8.99');assert.ok(model.animations.some((a:any)=>a.name==='Sit'));
});
test('UTF-8 region names in binary skeletons resolve their exact authored atlas entries',()=>{
 for(const file of ['干员模型/Surfer/Surfer-原皮/基建/build_char_4052_surfer.skel','干员模型/Tsukinogi/Tsukinogi-伦式巫女/正面/char_343_tknogi_epoque_9.skel']){
  const model=inspectModel(path.resolve('assets/builtin',file),true);assert.equal(model.version,'3.8.99');assert.ok(model.animations.length>0);
 }
});

test('a trailing attachment path space resolves only an exact own-atlas trimmed region',()=>{
 const file=path.resolve('assets/builtin/干员模型/Misumi Uika/Misumi Uika-笼中歌者/基建/build_char_4184_dolris_avemujica_1.skel');
 assert.ok(inspectModel(file,true).animations.length>0);
});
