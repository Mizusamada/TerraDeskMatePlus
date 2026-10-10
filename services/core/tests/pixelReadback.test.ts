import test from 'node:test';import assert from 'node:assert/strict';import {pixelReadbackRect}from'../../../scripts/pixel-readback.js';
test('pixel readback keeps attachment extents plus rasterization margin without scanning transparent canvas',()=>{
 assert.deepEqual(pixelReadbackRect(8192,8192,{x:4000.2,y:3900.8,width:260,height:350}),{x:3997,y:3897,width:267,height:357});
});
test('pixel readback keeps true viewport edges and falls back for invalid geometry',()=>{
 assert.deepEqual(pixelReadbackRect(100,80,{x:-4,y:77,width:12,height:9}),{x:0,y:74,width:11,height:6});
 assert.deepEqual(pixelReadbackRect(100,80,{x:NaN,y:0,width:12,height:9}),{x:0,y:0,width:100,height:80});
});
