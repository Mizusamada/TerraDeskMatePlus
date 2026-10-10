import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {defaults} from '../src/config.js';
import {loadBundledVoiceTraining} from '../src/bundledVoiceTraining.js';
import {emptyVoiceTrainingProfile,isVerifiedVoiceTraining} from '../src/voiceTraining.js';

// These small files test only the catalog/config contract. Real checkpoint loading
// and voice generation are verified separately against actual trained artifacts.
function fixture(roles=['Future','Future(variant)']){
 const dir=mkdtempSync(path.join(tmpdir(),'terra-bundle-training-'));
 const rows=roles.map((roleId,i)=>{const slug='trained-voices/role-'+i;mkdirSync(path.join(dir,slug),{recursive:true});for(const name of ['gpt.ckpt','sovits.pth','dataset.json','sample.wav'])writeFileSync(path.join(dir,slug,name),'contract fixture');return {roleId,displayName:roleId,status:'trained_unverified',gpt:slug+'/gpt.ckpt',sovits:slug+'/sovits.pth',dataset:slug+'/dataset.json',samples:[{audio:slug+'/sample.wav',text:'test',language:'en'}]};});
 const save=()=>writeFileSync(path.join(dir,'trained-voices/index.json'),JSON.stringify({schemaVersion:1,roles:rows}));save();return {dir,rows,save};
}

test('bundled training fills isolated current and future role profiles without fake listening approval',()=>{
 const f=fixture();try{const original=defaults(),loaded=loadBundledVoiceTraining(original,f.dir);
  assert.equal(original.voiceTraining.Future,undefined,'load never mutates the caller config');
  for(const row of f.rows){const p=loaded.voiceTraining[row.roleId];assert.equal(p.roleId,row.roleId);assert.equal(p.status,'trained_unverified');assert.equal(p.validation.status,'not_run');assert.equal(isVerifiedVoiceTraining(p),false);assert.equal(p.samples[0].audioPath,path.join(f.dir,row.samples[0].audio));}
  assert.notEqual(loaded.voiceTraining.Future.trainedGptModelPath,loaded.voiceTraining['Future(variant)'].trainedGptModelPath);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('bundled training never replaces a user verified custom weight pair',()=>{
 const f=fixture();try{const c=defaults();c.voiceTraining.Future={...emptyVoiceTrainingProfile('Future','Future'),status:'verified',trainedGptModelPath:'user-chosen.ckpt',trainedSovitsModelPath:'user-chosen.pth',validation:{status:'passed',checkedAt:'human',notes:['explicit approval'],sampleIds:['custom']}};
 const loaded=loadBundledVoiceTraining(c,f.dir);assert.deepEqual(loaded.voiceTraining.Future,c.voiceTraining.Future);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('bundled training rejects weight and audio paths that escape its asset root',()=>{
 const f=fixture();try{f.rows[0].gpt='../outside.ckpt';f.save();assert.throws(()=>loadBundledVoiceTraining(defaults(),f.dir),/越界/);f.rows[0].gpt='trained-voices/role-0/gpt.ckpt';f.rows[0].samples[0].audio='../outside.wav';f.save();assert.throws(()=>loadBundledVoiceTraining(defaults(),f.dir),/越界/);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('bundled training does not treat a missing pair as a successfully deployed voice',()=>{
 const f=fixture();try{f.rows[0].sovits='trained-voices/role-0/missing.pth';f.save();const loaded=loadBundledVoiceTraining(defaults(),f.dir);assert.equal(loaded.voiceTraining.Future,undefined);assert.ok(loaded.voiceTraining['Future(variant)']);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});

// A base-only installation still offers one independent training entry for every role.
test('reference catalog seeds independent untrained profiles without optional weights',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'terra-base-role-profiles-'));
 try{writeFileSync(path.join(dir,'role-reference-catalog.json'),JSON.stringify({roles:{A:{},B:{}}}));
 const source=defaults(),c=loadBundledVoiceTraining(source,dir);
 assert.equal(c.voiceTraining.A.status,'not_started');assert.equal(c.voiceTraining.B.status,'not_started');
 assert.equal(source.voiceTraining.A,undefined);assert.notEqual(c.voiceTraining.A,c.voiceTraining.B);
 c.voiceTraining.A.validation.notes.push('A only');assert.deepEqual(c.voiceTraining.B.validation.notes,[]);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
