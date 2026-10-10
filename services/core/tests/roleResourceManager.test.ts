import test from 'node:test'; import assert from 'node:assert/strict'; import {createHash} from 'node:crypto'; import {mkdtempSync,rmSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'; import path from 'node:path'; import {resourceInstallPath,installOfflineResourcePackage,readResourceManifest,removeManagedResourcePackage} from '../src/roleResourceManager.js';
test('resource paths accept bundled unicode role IDs but reject traversal separators',()=>{assert.match(resourceInstallPath('C:/data','Amiya(近卫)','base'),/Amiya/); assert.match(resourceInstallPath('C:/data',"Kal'tsit·Esperanta",'base'),/Kal/); assert.throws(()=>resourceInstallPath('C:/data','../escape','base'),/不安全/); assert.throws(()=>resourceInstallPath('C:/data','a/b','base'),/不安全/);});

test('offline package installs atomically and protects active base resources',async()=>{
 const root=mkdtempSync(path.join(process.cwd(),'.tmp-resource-test-'));
 try{
  const source=path.join(root,'source');mkdirSync(source,{recursive:true});writeFileSync(path.join(source,'payload.txt'),'role-owned-resource');
  const files=[{path:'payload.txt',sizeBytes:19,sha256:createHash('sha256').update('role-owned-resource').digest('hex')}];
  writeFileSync(path.join(source,'manifest.json'),JSON.stringify({schemaVersion:1,roleId:'Test角色',displayName:'测试角色',kind:'base',version:'1.0.0',source:'managed',downloadSizeBytes:19,sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files,includes:['模型','档案'],excludes:['训练缓存']}));
  const installed=await installOfflineResourcePackage(root,source);assert.equal(installed.status,'installed');assert.ok(existsSync(path.join(root,'resource-packages','base','Test角色','payload.txt')));assert.equal((await readResourceManifest(installed.installPath)).roleId,'Test角色');
  await assert.rejects(removeManagedResourcePackage(root,'Test角色','base',{activeRoleId:'Test角色'}),/当前正在使用/);
  await removeManagedResourcePackage(root,'Test角色','base');assert.equal(existsSync(installed.installPath),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

 test('offline package rejects unlisted files before touching an existing install',async()=>{
  const root=mkdtempSync(path.join(process.cwd(),'.tmp-resource-extra-'));
  try{
   const source=path.join(root,'source'),data=path.join(root,'data');mkdirSync(source,{recursive:true});writeFileSync(path.join(source,'payload.txt'),'v1');writeFileSync(path.join(source,'unexpected.tmp'),'must reject');
   const files=[{path:'payload.txt',sizeBytes:2,sha256:createHash('sha256').update('v1').digest('hex')}];writeFileSync(path.join(source,'manifest.json'),JSON.stringify({schemaVersion:1,roleId:'Extra角色',displayName:'额外文件测试',kind:'base',version:'1',source:'managed',files,includes:[],excludes:[],sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex')}));
   await assert.rejects(installOfflineResourcePackage(data,source),/清单外文件/);assert.equal(existsSync(resourceInstallPath(data,'Extra角色','base')),false);
  }finally{rmSync(root,{recursive:true,force:true});}
 });
 test('voice-model offline package requires the same role base package first',async()=>{
  const root=mkdtempSync(path.join(process.cwd(),'.tmp-resource-voice-order-'));
  try{
   const source=path.join(root,'voice');mkdirSync(source,{recursive:true});writeFileSync(path.join(source,'weights.bin'),'voice');const files=[{path:'weights.bin',sizeBytes:5,sha256:createHash('sha256').update('voice').digest('hex')}];writeFileSync(path.join(source,'manifest.json'),JSON.stringify({schemaVersion:1,roleId:'Voice角色',displayName:'音色顺序测试',kind:'voice-model',version:'1',source:'managed',files,includes:['GPT'],excludes:['cache'],sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex')}));
   await assert.rejects(installOfflineResourcePackage(path.join(root,'data'),source),/先安装该角色基础包/);
  }finally{rmSync(root,{recursive:true,force:true});}
 });

test('an installed builtin role can accept its own voice extension without duplicating the base',async()=>{
 const root=mkdtempSync(path.join(process.cwd(),'.tmp-resource-builtin-voice-'));
 try{
  const source=path.join(root,'voice');mkdirSync(source);writeFileSync(path.join(source,'weights.bin'),'voice');
  const files=[{path:'weights.bin',sizeBytes:5,sha256:createHash('sha256').update('voice').digest('hex')}];
  writeFileSync(path.join(source,'manifest.json'),JSON.stringify({schemaVersion:1,roleId:'BuiltinRole',kind:'voice-model',version:'1',source:'managed',files,sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex')}));
  const result=await installOfflineResourcePackage(path.join(root,'data'),source,{installedBaseRoleIds:new Set(['BuiltinRole'])});
  assert.equal(result.status,'installed');assert.equal(existsSync(resourceInstallPath(path.join(root,'data'),'BuiltinRole','base')),false,'base must not be duplicated');
  await assert.rejects(installOfflineResourcePackage(path.join(root,'other-data'),source,{installedBaseRoleIds:new Set(['OtherRole'])}),/先安装该角色基础包/);
 }finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(process.cwd()),'test cleanup stays in workspace');rmSync(root,{recursive:true,force:true});}
});
