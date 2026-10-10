// These policies isolate input/limit behavior from audio, persistence and permission modules.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {MAX_DESKTOP_PETS,canCreatePet,pickupAction,rebaseDrag,isMovementActionName,isStandbyActionName} from '../src/desktopPolicy.js';
test('20 windows allowed, the 21st rejected including hidden windows',()=>{assert.equal(MAX_DESKTOP_PETS,20);assert.ok(canCreatePet(19));assert.equal(canCreatePet(20),false);assert.equal(canCreatePet(-1),false);});
test('pickup never switches away from a battle model without Interact',()=>{const a=[{bundleId:'daily',name:'Interact'},{bundleId:'battle',name:'Idle'}];assert.equal(pickupAction(a,'battle'),undefined);assert.equal(pickupAction(a,'daily'),a[0]);});
test('geometry change rebases the drag snapshot without mutating its input',()=>{const d={x:100,y:200,cursor:{x:50,y:60}};assert.deepEqual(rebaseDrag(d,-80,40),{...d,x:20,y:240});assert.equal(d.x,100);});

import {autonomousActions} from '../src/desktopPolicy.js';
test('custom and battle deployment pools cannot leak daily Move into autonomous behavior',()=>{const a=[{id:'daily:Move',group:'基建'},{id:'battle:Attack',group:'战斗'},{id:'daily:Sit',group:'基建'}];assert.deepEqual(autonomousActions(a,'自定义',['daily:Sit']),[a[2]]);assert.deepEqual(autonomousActions(a,'战斗',[]),[a[1]]);assert.deepEqual(autonomousActions(a,'全部',[]),a);assert.deepEqual(autonomousActions(a,'自定义',[]),[]);});

test('movement and standby aliases are recognized across authored role naming',()=>{assert.equal(isMovementActionName('Move_Loop'),true);assert.equal(isMovementActionName('walk cycle'),true);assert.equal(isMovementActionName('RunForward'),true);assert.equal(isMovementActionName('Attack'),false);assert.equal(isStandbyActionName('Idle'),true);assert.equal(isStandbyActionName('rest_2'),true);});
