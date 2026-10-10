// 2026-10-06 Mizu: 统一角色/敌人显示框架的单元测试入口（运行时由SpinePet使用）。
import {targetScale} from '../src/displayGeometry.js';
import assert from 'node:assert/strict';
assert.ok(Math.abs(targetScale(100,200,400,400,{left:50,right:50,top:200,bottom:0})-1.94)<0.01);
assert.ok(targetScale(100,200,100,100,{left:100,right:100,top:100,bottom:100})<1);
console.log('display geometry smoke passed');

