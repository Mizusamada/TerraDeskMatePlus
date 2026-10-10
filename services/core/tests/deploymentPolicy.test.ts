import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,normalizeConfig} from '../src/config.js';
import {normalizeCharacterTemplate} from '../src/characterTemplate.js';

// Deployment is a new binding, not a migration that rewrites existing touch, greet, speed or private role settings.
test('all default characters expose an independent automatic deployment action and voice binding',()=>{
 assert.deepEqual(defaults().behaviour.clickBindings.deployment,{action:'__default__',voiceId:'__deployment__',actionIds:[],voiceIds:[]});
});
test('legacy config gains deployment defaults without altering previously customized interactions',()=>{
 const before=defaults();delete before.behaviour.clickBindings.deployment;
 before.behaviour.clickBindings.greet={action:'custom:greet',voiceId:'user-private'};
 before.behaviour.clickBindings.head_touch={action:'__pool__',voiceId:'__pool__',actionIds:['head-a'],voiceIds:['head-v']};
 before.behaviour.actionSpeeds={'head-a':.75};
 const c=normalizeConfig(before);
 assert.deepEqual(c.behaviour.clickBindings.greet,{...before.behaviour.clickBindings.greet,actionIds:[],voiceIds:[]});
 assert.deepEqual(c.behaviour.clickBindings.head_touch,before.behaviour.clickBindings.head_touch);
 assert.deepEqual(c.behaviour.actionSpeeds,before.behaviour.actionSpeeds);
 assert.equal(c.behaviour.clickBindings.deployment.action,'__default__');
 assert.equal(c.behaviour.clickBindings.deployment.voiceId,'__deployment__');
});
test('explicit disabled deployment settings survive normalization instead of reverting to defaults',()=>{
 const c=normalizeConfig({behaviour:{clickBindings:{deployment:{action:'',voiceId:'',actionIds:[],voiceIds:[]}}}});
 assert.deepEqual(c.behaviour.clickBindings.deployment,{action:'',voiceId:'',actionIds:[],voiceIds:[]});
});
test('new user-imported characters inherit deployment policy without an Amiya action or voice id',()=>{
 const t=normalizeCharacterTemplate({id:'user-next-role',displayName:'未来角色',kind:'custom',bundleIds:['next'],actionNames:['Start','Start_2','Relax','Sit']});
 assert.deepEqual(t.behaviour.deployment,{action:'__default__',voiceId:'__deployment__',actionIds:[],voiceIds:[]});
 assert.deepEqual(t.model.interactionAnimationNames.deployment,['Start']);
 assert.equal(t.persona.profileId,'user-next-role');
});

import {defaultDeploymentBinding,firstDeploymentAction,selectDeploymentAction,selectDeploymentVoice,deploymentReturnDelay} from '../src/deploymentPolicy.js';
import {AssetLibrary} from '../src/assets.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const actions=[
 {id:'daily:Start',bundleId:'daily',group:'基建',name:'Start',duration:2},
 {id:'daily:Start_2',bundleId:'daily',group:'基建',name:'Start_2',duration:3},
 {id:'daily:Sit',bundleId:'daily',group:'基建',name:'Sit',duration:4},
 {id:'battle:Attack',bundleId:'battle',group:'战斗',name:'Attack',duration:1},
 {id:'daily:Default',bundleId:'daily',group:'基建',name:'Default',duration:0}
];
const bind=(action:string,actionIds:string[]=[])=>({...defaultDeploymentBinding(),action,actionIds});
test('default entrance retains first exact Start and does not borrow another bundle or chain a second one',()=>{
 assert.equal(firstDeploymentAction(actions,'daily')?.id,'daily:Start');
 assert.equal(firstDeploymentAction(actions,'battle'),undefined);
 assert.equal(firstDeploymentAction([{...actions[1],name:'Start_2'}],'daily'),undefined);
 assert.equal(selectDeploymentAction(bind('__default__'),actions,'daily')?.name,'Start');
});
test('explicit deployment choices allow another own-skin group or the second entrance, never another role inventory',()=>{
 assert.equal(selectDeploymentAction(bind('battle:Attack'),actions,'daily')?.id,'battle:Attack');
 assert.equal(selectDeploymentAction(bind('daily:Start_2'),actions,'daily')?.id,'daily:Start_2');
 assert.equal(selectDeploymentAction(bind('Interact'),actions,'daily')?.id,'daily:Start');
 assert.equal(selectDeploymentAction(bind('foreign:Attack'),actions,'daily')?.id,'daily:Start');
 assert.equal(selectDeploymentAction(bind(''),actions,'daily'),undefined);
});
test('deployment action pool chooses one non-repeating available item; empty pool stays silent',()=>{
 const b=bind('__pool__',['daily:Sit','battle:Attack','foreign:Attack','daily:Default']);
 assert.equal(selectDeploymentAction(b,actions,'daily','daily:Sit',()=>0)?.id,'battle:Attack');
 assert.equal(selectDeploymentAction(bind('__pool__'),actions,'daily'),undefined);
 assert.equal(selectDeploymentAction(bind('random'),actions,'daily','',()=>0)?.id,'daily:Sit');
});
test('default deployment voice prefers own deployment1 rather than greet, obeying locale and missing recording',()=>{
 const c=defaults(),b=defaultDeploymentBinding();
 const voices=[{id:'Future_cn_042',title:'未来 · 问候',languages:['ja','zh']},{id:'Future_cn_024',title:'未来 · 部署2',languages:['ja','zh']},{id:'Future_cn_023',title:'未来 · 部署1',languages:['ja','zh']}];
 assert.equal(selectDeploymentVoice(c,voices,b,'ja')?.id,'Future_cn_023');
 assert.equal(selectDeploymentVoice(c,voices,b,'zh')?.id,'Future_cn_023');
 assert.equal(selectDeploymentVoice(c,[voices[0]],b,'ja'),undefined);
 assert.equal(selectDeploymentVoice(c,[{...voices[2],languages:['ja']}],b,'zh'),undefined);
 assert.equal(selectDeploymentVoice(c,[{id:'user-voice',title:'新角色出场',language:'unknown'}],b,'ja')?.id,'user-voice');
});
test('deployment voice selectors retain fixed, pool, random, trust and explicit disabled semantics',()=>{
 const c=defaults(),voices=[{id:'one',title:'部署1',languages:['ja','zh']},{id:'two',title:'信赖触摸',languages:['ja','zh']}];
 const b=defaultDeploymentBinding();
 assert.equal(selectDeploymentVoice(c,voices,{...b,voiceId:''},'ja'),undefined);
 assert.equal(selectDeploymentVoice(c,voices,{...b,voiceId:'two'},'ja')?.id,'two');
 assert.equal(selectDeploymentVoice(c,voices,{...b,voiceId:'__trust__'},'ja')?.id,'two');
 assert.equal(selectDeploymentVoice(c,voices,{...b,voiceId:'__pool__',voiceIds:['one','two']},'ja','one',()=>0)?.id,'two');
 assert.equal(selectDeploymentVoice(c,voices,{...b,voiceId:'__random__'},'ja','one',()=>0)?.id,'two');
 assert.equal(selectDeploymentVoice(c,voices,{...b,voiceId:'foreign'},'ja'),undefined);
});
test('deployment completion respects per-action speed before global speed',()=>{
 const c=defaults();assert.equal(deploymentReturnDelay(actions[0],c),2250);
 c.behaviour.animationSpeed=.5;assert.equal(deploymentReturnDelay(actions[0],c),4250);
 c.behaviour.actionSpeeds[actions[0].id]=2;assert.equal(deploymentReturnDelay(actions[0],c),1250);
});
test('all bundled role skins inherit the same deployment rule with their own actions and recordings',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'terra-deploy-policy-'));
 try{
  const library=new AssetLibrary(path.resolve('assets/builtin'),dir).scan();
  for(const role of Object.keys(library.profiles))for(const skin of new Set(library.bundles.filter(b=>b.operatorId===role&&b.view!=='背面').map(b=>b.skin))){
   const c=defaults();c.assets.customId=role==='Amiya'?'':'operator:'+role;c.ui.selectedSkin=skin;
   const all=library.actions(c),current=library.selected(c),b=c.behaviour.clickBindings.deployment;
   const chosen=selectDeploymentAction(b,all,current.id);
   const expected=all.find(a=>a.bundleId===current.id&&/^start$/i.test(a.name))||all.find(a=>a.bundleId===current.id&&/^(appear|spawn|entrance)$/i.test(a.name));
   assert.equal(chosen?.id,expected?.id,role+' / '+skin);
   const own=library.voices.filter(v=>v.operatorId===role);
   for(const locale of ['ja','zh']as const){const v=selectDeploymentVoice(c,own,b,locale);if(v){assert.equal(v.operatorId,role);assert.ok(v.languages.includes(locale));assert.ok(!/(?:^|_)cn_042$/.test(v.id));}}
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
// Skill/doll tracks contain "Idle" but are not the character's ordinary standing rest; never auto-chain them after deployment.
import {deploymentStandbyAction} from '../src/deploymentPolicy.js';
test('deployment completion chooses exact normal standby instead of the first skill or doll Idle substring',()=>{
 const skill={id:'battle:Doll_Skill_1_Idle',bundleId:'battle',group:'战斗',name:'Doll_Skill_1_Idle',duration:8};
 const idle={...skill,id:'battle:Idle',name:'Idle'};
 const rest={...skill,id:'daily:Relax',bundleId:'daily',name:'Relax',group:'基建'};
 assert.equal(deploymentStandbyAction([skill,idle,rest],'battle')?.id,idle.id);
 assert.equal(deploymentStandbyAction([skill,idle,rest],'daily')?.id,rest.id);
 assert.equal(deploymentStandbyAction([skill],'battle'),undefined);
});
