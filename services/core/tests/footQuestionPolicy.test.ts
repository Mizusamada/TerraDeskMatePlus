import test from 'node:test';import assert from 'node:assert/strict';import {defaults,normalizeConfig}from'../src/config.js';import {selectRoleVoice}from'../src/roleBehaviour.js';import {migrateFootQuestionDefault}from'../src/footQuestionPolicy.js';
test('foot question chooses only current-catalog questions and retains the requested recording language',()=>{
 const c=defaults(),own=[{id:'role_daily',textZh:'今天也辛苦了。',languages:['ja']},{id:'role_question',textZh:'博士，您需要帮忙吗？',languages:['ja']},{id:'role_zh',textZh:'有什么事吗？',languages:['zh']}];
 assert.equal(selectRoleVoice(c,own,'__question__',[],'ja')?.id,'role_question');assert.equal(selectRoleVoice(c,own,'__question__',[],'zh')?.id,'role_zh');
 assert.equal(selectRoleVoice(c,[own[0]],'__question__',[],'ja'),undefined,'never pretend an unrelated statement is a question');
});
test('old untouched foot random default upgrades, custom mappings and future explicit random remain intact',()=>{
 const c=defaults();c.behaviour.defaultsRevision=2;c.behaviour.clickBindings.foot_poke={action:'',voiceId:'__random__',actionIds:[],voiceIds:[]};
 const next=migrateFootQuestionDefault(c.behaviour);assert.equal(next.clickBindings.foot_poke.voiceId,'__question__');assert.equal(c.behaviour.clickBindings.foot_poke.voiceId,'__random__');
 for(const foot of [{action:'Sit',voiceId:'user-id'},{action:'',voiceId:''},{action:'',voiceId:'__pool__',voiceIds:['own-voice']}]){
 const saved=structuredClone(c.behaviour);saved.clickBindings.foot_poke=foot;assert.deepEqual(migrateFootQuestionDefault(saved).clickBindings.foot_poke,foot);
 }
 next.clickBindings.foot_poke.voiceId='__random__';assert.equal(migrateFootQuestionDefault(next).clickBindings.foot_poke.voiceId,'__random__');
 assert.equal(normalizeConfig(c).behaviour.clickBindings.foot_poke.voiceId,'__question__');
});
