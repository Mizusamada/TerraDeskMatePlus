import test from 'node:test';
import assert from 'node:assert/strict';
import {enemyActions} from '../src/stoneBug.js';
import {defaults,validateConfig} from '../src/config.js';

test('generic enemy action resolver respects selected action group and avoids death/setup tracks',()=>{
 const actions=[
  {name:'Move',duration:1,group:'战斗'},
  {name:'Interact',duration:1,group:'基建'},
  {name:'Attack',duration:1,group:'战斗'},
  {name:'Die',duration:1,group:'战斗'},
  {name:'Start',duration:1,group:'战斗'}
 ];
 const selected=enemyActions(actions,{moveNames:['Move'],attackNames:['Attack'],deathNames:['Die'],fallbackGroups:['战斗']});
 assert.equal(selected.move?.name,'Move');
 assert.equal(selected.attack?.name,'Attack');
 assert.equal(selected.death?.name,'Die');
});

test('bubble geometry and enemy selection are bounded and persisted by config validation',()=>{
 const c=defaults();
 c.ui.bubble={...c.ui.bubble,width:420,height:640,maxWidth:480,minWidth:160};
 c.alerts.enemyId='stonebug';
 c.alerts.enemyActionGroup='战斗';
 validateConfig(c);
 assert.equal(c.ui.bubble.width,420);
 assert.equal(c.ui.bubble.height,640);
 assert.equal(c.alerts.enemyActionGroup,'战斗');
 c.speech.externalRealtime={...c.speech.externalRealtime,enabled:true,endpoint:'ws://127.0.0.1:8765',providerLabel:'本地自定义适配器'};
 validateConfig(c);
 assert.equal(c.speech.externalRealtime.providerLabel,'本地自定义适配器');
 assert.throws(()=>validateConfig({...c,ui:{...c.ui,bubble:{...c.ui.bubble,width:600}}}),/气泡当前宽/);
});
