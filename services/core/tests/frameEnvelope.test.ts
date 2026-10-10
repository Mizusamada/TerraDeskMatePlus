import test from 'node:test';import assert from 'node:assert/strict';import {extendFrameEnvelope}from'../src/displayGeometry.js';
test('invisible transition measurements cannot poison a valid fixed camera envelope',()=>{
 const e={left:100,right:120,top:300,bottom:0},before={...e};
 assert.equal(extendFrameEnvelope(e,{left:Infinity,right:-Infinity},{x:Infinity,y:Infinity,width:-Infinity,height:-Infinity},0),false);assert.deepEqual(e,before);
 assert.equal(extendFrameEnvelope(e,{left:-20,right:20},{x:NaN,y:0,width:10,height:10},0),false);assert.deepEqual(e,before);
 assert.equal(extendFrameEnvelope(e,{left:-20,right:20},{x:0,y:0,width:0,height:0},0),false);
 assert.equal(extendFrameEnvelope(e,{left:-20,right:20},{x:-140,y:-12,width:300,height:380},0),true);
 assert.deepEqual(e,{left:140,right:160,top:368,bottom:12});
});
