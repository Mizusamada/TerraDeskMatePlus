import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {AssetLibrary} from '../src/assets.js';import {defaults} from '../src/config.js';
import {stoneBugActions,stoneBugChaseStep,chaseAttackAction,enemyDisplayFrame} from '../src/stoneBug.js';

test('enemy display frame expands to contain the full audited animation envelope',()=>{
 const frame=enemyDisplayFrame({envelope:{left:1.1974,right:1.3599,top:1.7327,bottom:0}},110);
 assert.deepEqual(frame,{width:306,height:215,targetBodyHeight:110});
});
test('enemy display frame keeps a safe minimum for incomplete custom metadata',()=>{
 assert.deepEqual(enemyDisplayFrame({},110),{width:244,height:140,targetBodyHeight:110});
});
test('stonebug event has current-role actions for every bundled operator skin',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'terra-events-'));
 try{const library=new AssetLibrary(path.resolve('assets/builtin'),dir).scan();
  const operators=[...new Set(library.bundles.map(b=>b.operatorId))];assert.ok(operators.length>=41, 'bundled role catalog must retain the original 41 roles and may include extensions');
  // A back-only catalog entry is preserved for reference but cannot be deployed or chased; validate only skins with a usable front/build bundle.
 for(const op of operators)for(const skin of new Set(library.bundles.filter(b=>b.operatorId===op&&b.view!=='背面').map(b=>b.skin))){
   const config=defaults();config.assets.customId=op==='Amiya'?'':'operator:'+op;config.ui.selectedSkin=skin;
   const selected=library.selected(config);assert.equal(selected.operatorId,op);assert.equal(selected.skin,skin);
   const plan=stoneBugActions(library.actions(config));assert.ok(plan.attack,op+' / '+skin+' lacks event action');
   const bundle=library.bundles.find(b=>b.id===plan.attack!.bundleId);assert.equal(bundle.operatorId,op);assert.equal(bundle.skin,skin);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('stonebug attack fallbacks never select static, death or entrance tracks',()=>{
 const a=stoneBugActions([{name:'Default',duration:0,group:'战斗'},{name:'Die',duration:1,group:'战斗'},{name:'Start',duration:2,group:'战斗'},{name:'Interact',duration:2,group:'基建'}]);assert.equal(a.attack?.name,'Interact');
 assert.equal(stoneBugActions([{name:'Skill',group:'战斗'},{name:'Attack',group:'战斗'}]).attack?.name,'Skill');
 assert.equal(stoneBugActions([{name:'Default',duration:0}]).attack,undefined);
});
test('chase reuses the current role battle action instead of a daily or setup clip',()=>{
 const actions=[{name:'Interact',duration:2,group:'基建'},{name:'Attack',duration:1.2,group:'战斗'},{name:'Attack_Begin',duration:0.2,group:'战斗'},{name:'Skill_1_Attack',duration:1,group:'战斗'},{name:'Idle',duration:2,group:'战斗'}];
 assert.equal(chaseAttackAction(actions)?.name,'Attack');
 assert.equal(chaseAttackAction([{name:'Interact',duration:2,group:'基建'}]),undefined);
});

test('chase advances the operator left/right without mutating bug or window dimensions',()=>{
 const area={x:0,y:0,width:1707,height:1019},bug={x:30,y:879,width:180,height:140},pet={x:900,y:529,width:652,height:490};const before={...bug};
 const left=stoneBugChaseStep(pet,bug,area);assert.ok(left.x<pet.x);assert.equal(left.direction,-1);assert.deepEqual(bug,before);
 const right=stoneBugChaseStep({...pet,x:0},{...bug,x:1200},area);assert.ok(right.x>0);assert.equal(right.direction,1);
 const edge=stoneBugChaseStep({...pet,x:0},{...bug,x:700},area);assert.ok(edge.x>0);assert.ok(!edge.reached);
 const near=stoneBugChaseStep(pet,{...bug,x:1000},area);assert.ok(near.reached);
});

test('all skins with multiple entrance animations prefer the first exact Start only',()=>{const dir=mkdtempSync(path.join(tmpdir(),'terra-start-'));try{const library=new AssetLibrary(path.resolve('assets/builtin'),dir).scan();for(const role of Object.keys(library.profiles))for(const skin of new Set(library.bundles.filter(b=>b.operatorId===role).map(b=>b.skin))){const c=defaults();c.assets.customId=role==='Amiya'?'':'operator:'+role;c.ui.selectedSkin=skin;const all=library.actions(c);const entry=all.find(a=>/^start$/i.test(a.name))||all.find(a=>/^(appear|spawn|entrance)$/i.test(a.name));if(all.some(a=>/^start$/i.test(a.name)))assert.equal(entry?.name,'Start');assert.ok(!entry||!/_2$|_3$/.test(entry.name));}}finally{rmSync(dir,{recursive:true,force:true});}});

test('stonebug chase has a movement fallback when a role only authors standby clips',()=>{const plan=stoneBugActions([{name:'Idle',duration:2,group:'战斗'},{name:'Attack',duration:2,group:'战斗'}]);assert.equal(plan.move?.name,'Idle');assert.equal(plan.attack?.name,'Attack');});






