import {cp,mkdir,rm,stat,readdir,writeFile,link} from 'node:fs/promises';
import {existsSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {electronPath,root} from './launch.mjs';

const name=process.env.TERRA_NEW_DELIVERY_NAME||'TerraDeskMate-AllRoles-'+new Date().toISOString().replace(/[:.]/g,'-');
if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/.test(name))throw new Error('交付目录名必须是安全的单层名称');
const releaseRoot=path.resolve(root,'release'),out=path.resolve(releaseRoot,name);
if(path.dirname(out)!==releaseRoot)throw new Error('拒绝写入交付目录之外');
// Mizu requires preserving old portable packs. Fail before any write if this name exists.
if(existsSync(out))throw new Error('交付目录已存在；不会删除或覆盖旧包，请使用一个新名称');
await mkdir(releaseRoot,{recursive:true});await mkdir(out);
await cp(path.dirname(electronPath()),out,{recursive:true});
// Electron ships as electron.exe; expose stable user-facing launch names without changing the runtime binary.
try{await link(path.join(out,'electron.exe'),path.join(out,'TerraDeskMate.exe'));}catch{await cp(path.join(out,'electron.exe'),path.join(out,'TerraDeskMate.exe'));}
const app=path.join(out,'resources','app');await mkdir(app,{recursive:true});// Exclude optional per-role weights BEFORE copying, not after spending time/disk copying 9+ GB.
await cp(path.join(root,'dist'),path.join(app,'dist'),{recursive:true,filter:source=>!path.relative(path.join(root,'dist'),source).split(path.sep).includes('trained-voices')});
// Base delivery intentionally omits trained-voices: these are optional role extensions and are the largest nonessential payload.
// No delete is needed: the source filter never copies this optional folder.
await mkdir(path.join(app,'node_modules'),{recursive:true});await cp(path.join(root,'node_modules','ws'),path.join(app,'node_modules','ws'),{recursive:true});
await writeFile(path.join(app,'package.json'),JSON.stringify({name:'terra-desk-mate-delivery',version:'0.3.0',productName:'泰拉桌伴 Terra DeskMate',type:'module',main:'dist/apps/desktop/main/main.js'},null,2));
await mkdir(path.join(app,'docs'),{recursive:true});
for(const name of ['ARKPETS-WEB-LICENSE.txt','sources/README.md','CHARACTER_TEMPLATE_SPEC.md','VOICE_CONVERSION.md','REQUIREMENTS_MASTER.md']){const src=path.join(root,'docs',name);if(existsSync(src))await cp(src,path.join(app,'docs',path.basename(name)==='README.md'?'sources.md':path.basename(name)));}
await writeFile(path.join(out,'启动泰拉桌伴.cmd'),String.raw`@echo off
cd /d "%~dp0"
start "" "%~dp0TerraDeskMate.exe"
`);
await writeFile(path.join(out,'使用说明.txt'),`这是独立Windows x64便携交付包。请复制整个目录，不要只复制exe。

本包包含基础角色模型、皮肤、动作、原声、档案、参考配置以及源石虫追击高清overlay；不包含训练缓存、测试证据、测试数据、开发源码、用户设置、聊天、记忆、收藏、密钥或独立训练权重。

新电脑不要求D:\\ak或D:\\ai；AI密钥需在目标机重新配置。音色训练权重属于可选扩展包，基础包安装后再导入。
`,'utf8');
async function hash(file){return await new Promise((resolve,reject)=>{const h=createHash('sha256'),s=createReadStream(file);s.on('data',b=>h.update(b));s.on('error',reject);s.on('end',()=>resolve(h.digest('hex')));});}
async function files(dir,base=dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())result.push(...await files(p,base));else if(e.isFile())result.push({path:path.relative(base,p).split(path.sep).join('/'),bytes:(await stat(p)).size,sha256:await hash(p)});}return result;}
const inventory=await files(out),logicalBytes=inventory.reduce((n,x)=>n+x.bytes,0),excluded=['dist/assets/builtin/trained-voices/**','user data (Electron appData)','.test-data/**','docs/verification/**','source D:/ak','source D:/ai'];
const manifest={schemaVersion:1,date:new Date().toISOString(),output:out,logicalBytes,fileCount:inventory.length,excluded,privacy:{includesUserData:false,includesSecrets:false,includesTests:false,includesTrainingCache:false},sourceIntegrity:{sharedRendererModified:true,workingCopySkeletonRecovery:true,sourceDirectoryReadOnly:true,recoveryReport:'docs/verification/2026-10-08/prts-model-recovery/report.json'},files:inventory};
await writeFile(path.join(out,'交付清单.json'),JSON.stringify(manifest,null,2),'utf8');console.log(JSON.stringify({out,logicalBytes,fileCount:inventory.length,excluded}));
