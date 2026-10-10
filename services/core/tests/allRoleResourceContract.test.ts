// Resource/contract gate spans every bundled skeleton; silently skipping a bad role
// was previously indistinguishable from a successful library scan.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {tmpdir}from'node:os';
import {AssetLibrary}from'../src/assets.js';import {loadBundledVoiceTraining}from'../src/bundledVoiceTraining.js';import {defaults}from'../src/config.js';
test('all 2853 bundled skeletons are exposed without omitted battle folders or corrupt model skips',()=>{
 const root=path.resolve('assets/builtin'),dir=fs.mkdtempSync(path.join(tmpdir(),'terra-all-model-contract-'));
 try{
  const expected=fs.readdirSync(path.join(root,'干员模型'),{recursive:true,encoding:'utf8'}).filter(name=>name.endsWith('.skel')).map(name=>'干员模型/'+name.replaceAll('\\','/'));
  const library=new AssetLibrary(root,dir).scan(),present=new Set(library.bundles.map((b:any)=>b.assetKey));
  assert.equal(expected.length,2853);assert.deepEqual(expected.filter(key=>!present.has(key)),[],'a complete resource must never be silently skipped');
  assert.equal(Object.keys(library.profiles).length,434);
  for(const b of library.bundles){assert.ok(b.animations.length>0,b.assetKey);assert.ok(b.source.textures.length>0,b.assetKey);for(const name of [b.source.skeleton,b.source.atlas,...b.source.textures])assert.ok(fs.existsSync(library.files.get(b.id+'/'+name)!),b.assetKey+' missing '+name);}
  const training=loadBundledVoiceTraining(defaults(),root);
  for(const id of Object.keys(library.profiles)){const own=training.voiceTraining[id];assert.ok(own,id+' missing training entry');assert.equal(own.roleId,id);if(!own.trainedGptModelPath){assert.equal(own.status,'not_started');assert.equal(own.validation.status,'not_run');}}
 }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(tmpdir()),'cleanup must stay inside temporary root');fs.rmSync(dir,{recursive:true,force:true});}
});

