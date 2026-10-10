import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {AssetLibrary} from '../src/assets.js';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
const root=path.resolve('assets/builtin');
// Metadata is source provenance, not a display-only label. Keep nested file fields
// structured so later role packs can retrieve the same skin without string parsing.
test('recent role metadata preserves structured view paths and original skins',()=>{
 for(const role of ['克莱门莎','德·托莱多','旅骨','Tragodia','Mantra','Лето']){
  const meta=JSON.parse(fs.readFileSync(path.join(root,'干员模型',role,'_meta.json'),'utf8'));
  assert.ok(meta.skin['默认'],role+' original skin');
  for(const skin of Object.values(meta.skin) as any[])for(const view of Object.values(skin) as any[])assert.equal(typeof view.file,'string');
 }
});
test('recent roles own archives and both verified-language original recording pools',()=>{
 const refs=JSON.parse(fs.readFileSync(path.join(root,'role-reference-catalog.json'),'utf8'));
 for(const role of ['克莱门莎','德·托莱多','旅骨']){
  const archive=path.join(root,'干员档案',role,'档案.txt');assert.ok(fs.existsSync(archive),role+' archive');
  assert.ok(fs.readFileSync(archive,'utf8').includes(role));
  for(const lang of ['ja','zh']){
   const pool=refs.roles[role]?.languages[lang];assert.ok(pool?.samples?.length>=30,role+'/'+lang+' original voice pool');
   assert.ok(pool.duration>=3&&pool.duration<=10,role+'/'+lang+' reference duration');
   for(const s of pool.samples){assert.equal(s.language,lang);assert.ok(s.audio.startsWith('干员语音/'+role+'/'));assert.ok(fs.existsSync(path.join(root,s.audio)));}
  }
 }
});
test('resource scan exposes recent skin, own persona and own original voices together',()=>{
 const temp=mkdtempSync(path.join(tmpdir(),'terra-recent-contract-'));
 try{const lib=new AssetLibrary(root,temp).scan();for(const role of ['克莱门莎','德·托莱多','旅骨']){
  assert.equal(lib.bundles.filter(b=>b.operatorId===role).length,3);assert.ok(lib.profiles[role].personality.includes(role));
  const voices=lib.voices.filter(v=>v.operatorId===role);assert.ok(voices.length>=30);assert.ok(voices.every(v=>v.audioPaths.ja&&v.audioPaths.zh));
 }}finally{assert.equal(path.dirname(temp),path.resolve(tmpdir()));fs.rmSync(temp,{recursive:true,force:true});}
});
