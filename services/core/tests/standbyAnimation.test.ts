// Standby choice is geometry-critical: special back/doll/skill tracks can hide the whole normal body.
import test from 'node:test';
import assert from 'node:assert/strict';
import {standbyAnimationName} from '../src/desktopPolicy.js';
test('ordinary standby wins regardless of authored back, doll and skill ordering',()=>{
 for(const names of [['B_Idle','Idle'],['Doll_Idle','Idle'],['Skill_Idle','Relax'],['B_Skill_Idle','rest_2']]){
  assert.equal(standbyAnimationName(names),names[1]);
 }
 assert.equal(standbyAnimationName(['Default','Attack','Die']),undefined);
 assert.equal(standbyAnimationName(['Move','Stand']), 'Stand');
});
