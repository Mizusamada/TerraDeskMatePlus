import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {AssetLibrary} from '../src/assets.js';

test('Stonebug pursuit overlays stay inside the original role catalog and use copied role fixtures',()=>{
  const root=path.resolve('assets/builtin');
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'role-reference-catalog.json'),'utf8'));
  const overrides=JSON.parse(fs.readFileSync(path.join(root,'battle-texture-overrides','index.json'),'utf8')).entries;
  const allowed=new Set(Object.keys(catalog.roles));
  assert.ok(Object.keys(overrides).length>0);
  for(const key of Object.keys(overrides))assert.ok(allowed.has(key.split('/')[1]),key);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'terra-overlay-test-'));
  try{
    // Copy one real role into an isolated fixture so the safety test never scans the entire 431-role catalog.
    const key=Object.keys(overrides)[0],role=key.split('/')[1],roleRoot=path.join(temp,'干员模型',role);
    fs.mkdirSync(path.dirname(roleRoot),{recursive:true});fs.cpSync(path.join(root,'干员模型',role),roleRoot,{recursive:true});
    const sourceIndex=JSON.parse(fs.readFileSync(path.join(root,'model-render-index.json'),'utf8'));
    fs.writeFileSync(path.join(temp,'model-render-index.json'),JSON.stringify({models:{[key]:sourceIndex.models[key]}}));
    const overlayIndex=JSON.parse(fs.readFileSync(path.join(root,'battle-texture-overrides','index.json'),'utf8')),entry=overlayIndex.entries[key];
    for(const relative of [entry.atlas,...Object.values(entry.textures)]){const dst=path.join(temp,relative);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,relative),dst);}
    fs.mkdirSync(path.join(temp,'battle-texture-overrides'),{recursive:true});fs.writeFileSync(path.join(temp,'battle-texture-overrides','index.json'),JSON.stringify({entries:{[key]:entry}}));
    const library=new AssetLibrary(temp,path.join(temp,'user-data')).scan();
    const file=path.basename(key),bundle=library.bundles.find(b=>b.operatorId===role&&b.source.skeleton===file&&b.view==='正面');
    assert.ok(bundle,key);
    const pursuit=library.pursuitBundle(bundle),atlasPath=library.files.get(pursuit.id+'/'+pursuit.source.atlas),texturePath=library.files.get(pursuit.id+'/'+pursuit.source.texture);assert.notEqual(pursuit.id,bundle.id);
    assert.ok(atlasPath);assert.ok(texturePath);assert.match(atlasPath,/battle-texture-overrides/);assert.match(texturePath,/battle-texture-overrides/);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});



