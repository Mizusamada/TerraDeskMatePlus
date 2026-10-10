import test from 'node:test';import assert from 'node:assert/strict';import {chaseAttackAction} from '../src/stoneBug.js';
// Keep this test independent of whole-library scanning: it targets the event selector,
// not any role's textures, window geometry or personal settings.
test('segmented-only attacks choose a real cycle instead of a skill standby',()=>{const clips=['Attack_Begin','Attack_Loop','Attack_End','Skill_2_Idle','Idle'].map(name=>({name,duration:1,group:'战斗',bundleId:'closure-own-skin'}));const selected=chaseAttackAction(clips);assert.equal(selected,clips[1]);assert.equal(selected?.bundleId,'closure-own-skin');});
test('complete authored attacks outrank segmented loops',()=>{const clips=[{name:'Attack_Loop',duration:1,group:'战斗'},{name:'Attack_1',duration:1,group:'战斗'},{name:'Attack',duration:1,group:'战斗'}];assert.equal(chaseAttackAction(clips),clips[2]);});
test('setup, death, entrance and skill idle are never attack substitutes',()=>{const clips=['Default','Die','Start','Skill_2_Idle','Skill_2_Begin','Skill_2_End','Idle','Relax'].map(name=>({name,duration:1,group:'战斗'}));assert.equal(chaseAttackAction(clips),undefined);});
test('daily clips remain outside battle-only replacement',()=>{assert.equal(chaseAttackAction([{name:'Attack',duration:1,group:'基建'}]),undefined);});

test('normal attack loop outranks directional down loop regardless of catalog order',()=>{const clips=[{name:'Attack_Down_Loop',duration:1,group:'战斗'},{name:'Attack_Loop',duration:1,group:'战斗'}];assert.equal(chaseAttackAction(clips),clips[1]);});
