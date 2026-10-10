import test from 'node:test';import assert from 'node:assert/strict';import {localTtsThreadEnvironment}from'../src/localTtsRuntimePolicy.js';
test('cold checkpoint CPU loading is bounded even when inference uses auto/CUDA',()=>{
 for(const device of ['auto','cuda','cpu'])assert.deepEqual(localTtsThreadEnvironment(device,{}),{OMP_NUM_THREADS:'1',MKL_NUM_THREADS:'1'});
});
test('explicit user native-thread tuning remains intact outside forced CPU fallback',()=>{
 assert.deepEqual(localTtsThreadEnvironment('cuda',{OMP_NUM_THREADS:'2',MKL_NUM_THREADS:'3'}),{OMP_NUM_THREADS:'2',MKL_NUM_THREADS:'3'});
 assert.deepEqual(localTtsThreadEnvironment('cpu',{OMP_NUM_THREADS:'8'}),{OMP_NUM_THREADS:'1',MKL_NUM_THREADS:'1'});
});
