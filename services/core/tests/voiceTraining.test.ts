import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaults } from '../src/config.js';
import { exportTrainingDataset } from '../src/speech.js';
import { emptyVoiceTrainingProfile, isVerifiedVoiceTraining, validateVoiceTrainingProfile, voiceTrainingReadiness, canTransitionVoiceTraining, transitionVoiceTraining } from '../src/voiceTraining.js';
import { inspectVoiceTrainingEnvironment } from '../src/voiceTrainingRunner.js';
import { applyRoleVoiceWeightDefaults } from '../src/roleSpeech.js';

test('voice training remains locked until both weights and independent validation exist', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'voice-training-gate-'));
  try {
    const gpt = path.join(dir, 'role.ckpt');
    const sovits = path.join(dir, 'role.pth');
    const list = path.join(dir, 'role.list');
    writeFileSync(gpt, 'gpt'); writeFileSync(sovits, 'sovits'); writeFileSync(list, '');
    const profile = emptyVoiceTrainingProfile('operator:Test', 'Test');
    profile.status = 'trained_unverified'; profile.datasetListPath = list; profile.trainedGptModelPath = gpt; profile.trainedSovitsModelPath = sovits;
    assert.equal(isVerifiedVoiceTraining(profile), false);
    assert.equal(voiceTrainingReadiness(profile).ready, false);
    profile.status = 'verified'; profile.validation = { status: 'passed', checkedAt: new Date().toISOString(), notes: ['独立验证句通过'], sampleIds: ['holdout-1'] };
    assert.equal(isVerifiedVoiceTraining(profile), true, '权重和验证状态本身可识别，但运行时还会由数据完整性门禁拦截');
    assert.equal(voiceTrainingReadiness(profile).ready, false, '没有训练样本时不能绕过数据完整性门禁');
    profile.samples = [{ audioPath: path.join(dir, 'a.wav'), text: '验证', language: 'zh' }]; writeFileSync(profile.samples[0].audioPath, 'wav');
    assert.equal(isVerifiedVoiceTraining(profile), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('training export uses copied user-data audio and independent role labels', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'voice-training-export-'));
  try {
    const c = defaults(); c.assets.customId = 'operator:TestRole';
    const source = path.join(dir, 'source.wav'); writeFileSync(source, 'wav');
    c.speech.gptSovits.trainingReferences = [{ audioPath: source, text: '测试', language: 'zh' }];
    const result = exportTrainingDataset(c, dir);
    assert.equal(result.roleId, 'TestRole');
    assert.notEqual(result.samples[0].audioPath, source);
    const listText = readFileSync(result.list, 'utf8');
    assert.match(listText, /TestRole/);
    assert.match(listText, /\\|TestRole\\|ZH\\|测试/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('training environment preflight reports missing dependencies without downloading or mutating files', async () => {
  const c = defaults();
  c.speech.gptSovits.installPath = path.join(tmpdir(), 'does-not-exist-gpt-sovits');
  const result = await inspectVoiceTrainingEnvironment(c);
  assert.equal(result.ready, false);
  assert.ok(result.missing.length >= 1);
  assert.match(result.message, /尚未就绪/);
});

test('invalid training manifest rows are visible as validation errors', () => {
  const profile = emptyVoiceTrainingProfile('role', 'Role');
  profile.samples = [{ audioPath: '', text: 'a|b', language: 'zh' }];
  assert.ok(validateVoiceTrainingProfile(profile).some(message => message.includes('不存在')));
  assert.ok(validateVoiceTrainingProfile(profile).some(message => message.includes('竖线')));
});





test('voice training state transitions cannot skip training or verification', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'voice-training-transition-'));
  try {
    const profile = emptyVoiceTrainingProfile('role', 'Role');
    assert.equal(canTransitionVoiceTraining('not_started', 'verified'), false);
    assert.throws(() => transitionVoiceTraining(profile, 'verified', { validation: 'passed' }), /不能从/);
    const list = path.join(dir, 'role.list'); writeFileSync(list, '');
    const sample = path.join(dir, 'a.wav'); writeFileSync(sample, 'wav');
    profile.datasetListPath = list; profile.samples = [{ audioPath: sample, text: '验证', language: 'zh' }]; profile.status = 'dataset_ready';
    const training = transitionVoiceTraining(profile, 'training'); assert.equal(training.status, 'training');
    const gpt = path.join(dir, 'role.ckpt'); const sovits = path.join(dir, 'role.pth'); writeFileSync(gpt, 'gpt'); writeFileSync(sovits, 'sovits');
    training.trainedGptModelPath = gpt; training.trainedSovitsModelPath = sovits;
    const pending = transitionVoiceTraining(training, 'trained_unverified'); assert.equal(pending.status, 'trained_unverified');
    assert.throws(() => transitionVoiceTraining(pending, 'verified'), /独立验证尚未/);
    const verified = transitionVoiceTraining(pending, 'verified', { validation: 'passed', notes: ['holdout-1通过'], sampleIds: ['holdout-1'] });
    assert.equal(verified.status, 'verified'); assert.equal(verified.validation.status, 'passed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('role switch applies only the target role verified weights and never leaks the previous role pair', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'role-weight-isolation-'));
  try {
    const oldGpt=path.join(dir,'amiya.ckpt'), oldSovits=path.join(dir,'amiya.pth');
    const newGpt=path.join(dir,'other.ckpt'), newSovits=path.join(dir,'other.pth');
    const sample=path.join(dir,'holdout.wav');
    for (const file of [oldGpt,oldSovits,newGpt,newSovits,sample]) writeFileSync(file,'model');
    const previous:any=defaults(); previous.speech.gptSovits.gptModelPath=oldGpt; previous.speech.gptSovits.sovitsModelPath=oldSovits;
    previous.voiceTraining.Amiya={...emptyVoiceTrainingProfile('Amiya','阿米娅'),roleId:'Amiya',status:'verified',samples:[{audioPath:sample,text:'验证',language:'zh'}],datasetListPath:path.join(dir,'amiya.list'),baseGptModelPath:'',baseSovitsModelPath:'',trainedGptModelPath:oldGpt,trainedSovitsModelPath:oldSovits,validation:{status:'passed',checkedAt:new Date().toISOString(),notes:['holdout'],sampleIds:['holdout-1']}};
    const next:any=defaults(); next.assets.customId='operator:Other'; next.speech.gptSovits.gptModelPath=oldGpt; next.speech.gptSovits.sovitsModelPath=oldSovits;
    next.voiceTraining.Other={...emptyVoiceTrainingProfile('Other','Other'),roleId:'Other',status:'verified',samples:[{audioPath:sample,text:'验证',language:'zh'}],datasetListPath:path.join(dir,'other.list'),baseGptModelPath:'',baseSovitsModelPath:'',trainedGptModelPath:newGpt,trainedSovitsModelPath:newSovits,validation:{status:'passed',checkedAt:new Date().toISOString(),notes:['holdout'],sampleIds:['holdout-1']}};
    const resolved=applyRoleVoiceWeightDefaults(next,previous);
    assert.equal(resolved.speech.gptSovits.gptModelPath,newGpt); assert.equal(resolved.speech.gptSovits.sovitsModelPath,newSovits);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('an explicit new training run clears previous verification instead of carrying approval to new weights',()=>{const dir=mkdtempSync(path.join(tmpdir(),'terra-retraining-'));try{const c=emptyVoiceTrainingProfile('role','role');const list=path.join(dir,'set.list'),audio=path.join(dir,'voice.wav');writeFileSync(list,'');writeFileSync(audio,'fixture');c.status='verified';c.datasetListPath=list;c.samples=[{audioPath:audio,text:'test',language:'en'}];c.validation={status:'passed',checkedAt:'previous',notes:['old approval'],sampleIds:['old']};const next=transitionVoiceTraining(c,'training');assert.equal(next.status,'training');assert.equal(next.validation.status,'not_run');assert.equal(c.validation.status,'passed');assert.deepEqual(next.validation.sampleIds,[]);}finally{rmSync(dir,{recursive:true,force:true});}});
