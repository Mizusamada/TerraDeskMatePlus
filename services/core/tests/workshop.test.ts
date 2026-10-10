import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWorkshopProject,type WorkshopProject} from '../src/workshop.js';

const base=():WorkshopProject=>({schemaVersion:2,id:'p1',roleId:'role-1',displayName:'自定义角色工程',sourceFormat:'spine3.8',sourceFolder:'C:/角色',targetBundleId:'bundle-1',actionMappings:{idle:'Relax',deployment:'Start',interact:'Interact',move:'Move'},capabilities:{actions:true,deployment:true,idle:true,collision:true,chase:true,voiceBinding:true},roleProfile:{displayName:'新角色',addressCn:'博士',addressJa:'ドクター',role:'医疗干员',personality:'冷静',tone:'温和',speechHabits:'短句',},voiceBinding:{deploymentVoiceId:'voice-1',idleVoiceIds:['voice-2'],interactionVoiceIds:['voice-3']},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});

test('schema 2 workbench project accepts role card and voice bindings',()=>{assert.deepEqual(validateWorkshopProject(base()),[]);});
test('schema 1 workbench projects remain compatible',()=>{const p:any=base();p.schemaVersion=1;delete p.roleProfile;delete p.voiceBinding;assert.deepEqual(validateWorkshopProject(p),[]);});
test('schema 2 rejects malformed role-card and voice-pool fields',()=>{const p:any=base();p.roleProfile.personality=42;p.voiceBinding.idleVoiceIds='voice-2';const errors=validateWorkshopProject(p);assert.ok(errors.some(x=>x.includes('角色卡字段无效：personality')));assert.ok(errors.some(x=>x.includes('闲置语音绑定无效')));});
test('workbench project payload contains no credentials or chat state',()=>{const p=base();const serialized=JSON.stringify(p);for(const forbidden of ['apiKey','secret','history','memory'])assert.equal(serialized.includes(forbidden),false,forbidden);});
