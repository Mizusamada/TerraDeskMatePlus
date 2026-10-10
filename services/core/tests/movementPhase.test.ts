// A travel animation must be its sustained cycle, not an entrance/exit phase.
import test from 'node:test';import assert from 'node:assert/strict';
import {isMovementActionName}from'../src/desktopPolicy.js';import {enemyActions}from'../src/stoneBug.js';
test('movement classification excludes begin/end phases even when they precede Move_Loop',()=>{
 for(const name of ['Move_Begin','Move_End','Walk_Start','Run_Stop'])assert.equal(isMovementActionName(name),false,name);
 assert.equal(isMovementActionName('Move_Loop'),true);assert.equal(isMovementActionName('Walk'),true);
 const actions=[{name:'Move_Begin',duration:.3},{name:'Move_End',duration:.3},{name:'Move_Loop',duration:1},{name:'Idle',duration:1}];
 assert.equal(enemyActions(actions,{moveNames:[]}).move?.name,'Move_Loop');
});
