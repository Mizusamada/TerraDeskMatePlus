import test from 'node:test';import assert from 'node:assert/strict';import {chooseRandomAction} from '../src/physics.js';
// Noninteractive setup, death, and second entrances must never be selected by an idle/head random pool.
test('random pools exclude authored terminal aliases and static clips',()=>{
 const aliases=['Default','Default_A','Die_1','Death','Start_2','Appear','Attack_End','Attack_Begin'];
 const actions=[...aliases.map(name=>({name,duration:1})),{name:'StaticPose',duration:0},{name:'Interact',duration:2}];
 for(let i=0;i<actions.length;i++)assert.equal(chooseRandomAction(actions,'',()=>i/actions.length)?.name,'Interact');
});
