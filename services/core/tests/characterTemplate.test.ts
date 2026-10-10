import test from 'node:test';
import assert from 'node:assert/strict';
import {firstDeploymentAnimation,normalizeCharacterTemplate,validateCharacterTemplate} from '../src/characterTemplate.js';

test('character template normalizes one deployment animation and independent character defaults',()=>{
 const t=normalizeCharacterTemplate({id:'operator:test',displayName:'测试角色',kind:'custom',bundleIds:['bundle-1'],skin:'测试皮肤',actionNames:['Start','Appear','Relax','Interact'],actionGroups:{Start:'战斗',Appear:'战斗',Relax:'基建',Interact:'基建'}});
 assert.equal(t.schemaVersion,1);
 assert.equal(t.model.deploymentAnimationNames.length,2);
 assert.equal(t.persona.profileId,'operator:test');
 const chosen=firstDeploymentAnimation({...t,model:{...t.model,deploymentAnimationNames:['Start','Appear'].slice(0,1)},},[{name:'Appear',duration:1},{name:'Start',duration:1}]);
 assert.equal(chosen?.name,'Start');
});

test('character template validator reports missing reusable framework pieces',()=>{
 const t=normalizeCharacterTemplate({id:'x',displayName:'X',bundleIds:[],actionNames:[]});
 assert.ok(validateCharacterTemplate(t).includes('角色模板缺少模型 bundle'));
 assert.ok(validateCharacterTemplate(t).includes('角色模板缺少待机动作'));
});
