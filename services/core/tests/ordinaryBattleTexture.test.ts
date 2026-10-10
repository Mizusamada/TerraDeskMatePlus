// The full user request includes ordinary clicks and skills, not only the pursuit-only legacy route.
// @ts-nocheck
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {tmpdir}from'node:os';
import {battleTextureFiles}from'../src/nativeTextures.js';import {AssetLibrary}from'../src/assets.js';
test('ordinary and pursuit battle paths use the same verified own-skin native overlay',()=>{
 const root=path.resolve('assets/builtin'),entries=JSON.parse(fs.readFileSync(path.join(root,'all-role-battle-textures/index.json'))).entries;
 const key=Object.keys(entries).find(k=>k.includes('/Logos/')&&k.includes('Logos-原皮/正面/'));assert.ok(key);
 const temp=fs.mkdtempSync(path.join(tmpdir(),'terra-ordinary-battle-'));
 try{
  const role=key.split('/')[1],entry=entries[key];fs.mkdirSync(path.join(temp,'干员模型'),{recursive:true});fs.cpSync(path.join(root,'干员模型',role),path.join(temp,'干员模型',role),{recursive:true});
  for(const rel of [entry.atlas,...Object.values(entry.textures)]){const dest=path.join(temp,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,rel),dest);}
  fs.mkdirSync(path.join(temp,'all-role-battle-textures'),{recursive:true});fs.writeFileSync(path.join(temp,'all-role-battle-textures/index.json'),JSON.stringify({entries:{[key]:entry}}));
  const library=new AssetLibrary(temp,path.join(temp,'user-data')).scan(),b=library.bundles.find(b=>b.assetKey===key);assert.ok(b.battleTextureOverlay);
  const ordinary=library.files.get(b.id+'/'+b.source.texture),pursuit=library.pursuitBundle(b),chase=library.files.get(pursuit.id+'/'+pursuit.source.texture);
  assert.equal(ordinary,chase);assert.ok(ordinary.includes('all-role-battle-textures'));assert.equal(b.source.textureMetadata[b.source.texture].sha256,entry.replacement.textureSha256);
  const broken=structuredClone(entry);broken.source.skeletonSha256='foreign';assert.equal(battleTextureFiles(temp,key,broken),undefined);
  broken.source.skeletonSha256=entry.source.skeletonSha256;broken.atlas='../escape.atlas';assert.equal(battleTextureFiles(temp,key,broken),undefined);
 }finally{assert.equal(path.dirname(path.resolve(temp)),path.resolve(tmpdir()),'cleanup must stay inside temporary root');fs.rmSync(temp,{recursive:true,force:true});}
});
test('every promoted battle overlay retains its all-animation geometry proof',()=>{const root=path.resolve('assets/builtin'),catalog=JSON.parse(fs.readFileSync(path.join(root,'all-role-battle-textures/index.json'))),proof=JSON.parse(fs.readFileSync('docs/verification/2026-10-08/all-role-battle-repair/geometry.json'));assert.equal(proof.passed,true);assert.equal(Object.keys(catalog.entries).length,proof.models,'every promoted model must have a complete geometry proof');assert.ok(proof.models>=472,'previously repaired models must remain covered');const passed=new Set(proof.results.filter(r=>r.maxDelta===0).map(r=>r.key));for(const [key,entry]of Object.entries(catalog.entries)){assert.ok(passed.has(key),key);assert.ok(battleTextureFiles(root,key,entry),key);assert.ok(entry.nativeParts>0);assert.equal(entry.geometryMaxDelta,0);}});
