import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyFavorites,toggleFavorite} from '../src/favorites.js';
import {bundleFavoriteRole,instanceFavoriteRole,sortFavoriteEntries,favoriteSearchMatches,favoriteActionEntries} from '../src/favoritePresentation.js';
import {defaults} from '../src/config.js';
import {buildMessages,VISION_INPUT_TOKEN_RESERVE} from '../src/llm.js';
const bundles=[{id:'amiya',operatorId:'Amiya',skin:'阿米娅 原皮',group:'基建',animations:[{name:'Interact',duration:1}]},{id:'a',operatorId:'A',skin:'A 原皮',group:'基建',animations:[{name:'Interact',duration:1}]},{id:'a2',operatorId:'A',skin:'A 皮肤',group:'战斗',animations:[{name:'Attack',duration:1},{name:'Default',duration:0}]},{id:'custom',customId:'local:A',skin:'自定义',group:'自定义',animations:[{name:'Idle',duration:1}]}];
// Unit layer: different owners may use identical local IDs; legacy/unknown identities must not invent a character.
test('resource ownership follows stable bundle identity for builtin, operator and future custom roles',()=>{
 assert.deepEqual(bundles.map(bundleFavoriteRole),['builtin','operator:A','operator:A','local:A']);assert.equal(bundleFavoriteRole({}), '');
});
test('current-control sorting pins favorites without rewriting selection or clone IDs',()=>{
 const input=[{id:'i1',skin:bundles[0].skin},{id:'i2',skin:bundles[1].skin},{id:'i3',skin:bundles[1].skin}],f=toggleFavorite(emptyFavorites(),'role','operator:A');
 const role=(p:typeof input[number])=>instanceFavoriteRole(p,bundles,'i1','builtin');
 assert.deepEqual(sortFavoriteEntries(input,f,'role',role).map(p=>p.id),['i2','i3','i1']);assert.equal(input[0].id,'i1');
 assert.equal(instanceFavoriteRole({id:'unknown',skin:'不存在'},bundles,'i1','builtin'),'');
 assert.equal(instanceFavoriteRole({id:'unknown',skin:'相同'},[{skin:'相同',operatorId:'A'},{skin:'相同',operatorId:'B'}],null,'builtin'),'');
 assert.equal(instanceFavoriteRole(input[0],bundles,'i1','local:future'),'local:future');
});
test('resource sort and cancellation use owner even when another role is controlled',()=>{
 const items=[{id:'one',owner:'operator:B'},{id:'two',owner:'operator:A'}];const f=toggleFavorite(emptyFavorites(),'resource','two','operator:A');
 assert.deepEqual(sortFavoriteEntries(items,f,'resource',x=>x.id,'',x=>x.owner).map(x=>x.id),['two','one']);
 const cleared=toggleFavorite(f,'resource','two','operator:A');assert.deepEqual(cleared.resources,[]);assert.deepEqual(sortFavoriteEntries(items,cleared,'resource',x=>x.id,'',x=>x.owner),items);
});
test('action favorites resolve all skins but reject foreign, deleted and static entries',()=>{
 const f={...emptyFavorites(),actions:['operator:A::a2:Attack','builtin::a:Interact','deleted::a:Interact','operator:A::a2:Default','local:A::custom:Idle','amiya:Interact']};
 assert.deepEqual(favoriteActionEntries(f,bundles,'builtin').map(x=>[x.id,x.favoriteRole]),[['a2:Attack','operator:A'],['custom:Idle','local:A'],['amiya:Interact','builtin']]);
});
test('search is reversible and matches stable IDs, scope and case-insensitive labels',()=>{
 assert.equal(favoriteSearchMatches('operator:A','operator:a::v1'),true);assert.equal(favoriteSearchMatches('no match','阿米娅'),false);assert.equal(favoriteSearchMatches('','阿米娅'),true);assert.equal(favoriteSearchMatches('  test ','TeSt'),true);
});
// Request layer: binary size changes must not alter text context; low detail reserve still enforces an explicit context bound.
test('large image base64 is not billed as text context by the local estimator',()=>{
 const c=defaults();c.llm.visionEnabled=true;c.llm.maxContextTokens=8192;const image={mimeType:'image/png',dataUrl:'data:image/png;base64,'+'A'.repeat(8*1024*1024)};
 const messages:any[]=buildMessages(c,'看图',[{role:'user',text:'之前的对话'}],[],[image]);assert.equal(messages.at(-1).content[1].image_url.url,image.dataUrl);assert.equal(messages.at(-1).content[1].image_url.detail,'low');assert.ok(!JSON.stringify(messages.slice(0,-1)).includes(image.dataUrl));
 c.llm.maxContextTokens=c.llm.maxOutputTokens+VISION_INPUT_TOKEN_RESERVE;assert.throws(()=>buildMessages(c,'看图',[],[],[image]),/上下文预算/);
});

test('new instance payload carries stable role ownership even when imported skins share a name',()=>{const bundles=[{skin:'same name',customId:'role:A'},{skin:'same name',customId:'role:B'}];assert.equal(instanceFavoriteRole({id:'instanceB',skin:'same name',roleId:'role:B'},bundles,null,'builtin'),'role:B');assert.equal(instanceFavoriteRole({id:'legacy',skin:'same name'},bundles,null,'builtin'),'');});
