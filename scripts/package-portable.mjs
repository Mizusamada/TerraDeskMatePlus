import {cp,mkdir,writeFile,stat,link} from 'node:fs/promises';import path from 'node:path';import {electronPath,root} from './launch.mjs';
const out=path.join(root,'release','Amiya-MVP');await mkdir(out,{recursive:true});
const runtimeExists=await stat(path.join(out,'TerraDeskMate.exe')).then(()=>true).catch(()=>false);if(!runtimeExists)await cp(path.dirname(electronPath()),out,{recursive:true});
// Identical compatibility launchers share bytes only inside the release directory; never link to the source runtime.
if(!runtimeExists)for(const alias of ['Amiya.exe','TerraDeskMate.exe']){try{await link(path.join(out,'electron.exe'),path.join(out,alias));}catch{await cp(path.join(out,'electron.exe'),path.join(out,alias));}}
const app=path.join(out,'resources','app');await mkdir(app,{recursive:true});
await cp(path.join(root,'dist'),path.join(app,'dist'),{recursive:true});
await mkdir(path.join(app,'node_modules'),{recursive:true});await cp(path.join(root,'node_modules','ws'),path.join(app,'node_modules','ws'),{recursive:true});
await writeFile(path.join(app,'package.json'),JSON.stringify({name:'amiya-desktop-pet',version:'0.3.0',productName:'泰拉桌伴 Terra DeskMate',type:'module',main:'dist/apps/desktop/main/main.js'},null,2));
await mkdir(path.join(app,'docs'),{recursive:true});await cp(path.join(root,'docs','ARKPETS-WEB-LICENSE.txt'),path.join(app,'docs','ARKPETS-WEB-LICENSE.txt'));
await cp(path.join(root,'docs','sources','README.md'),path.join(app,'docs','sources.md'));
await cp(path.join(root,'docs','CHARACTER_TEMPLATE_SPEC.md'),path.join(app,'docs','CHARACTER_TEMPLATE_SPEC.md'));
await cp(path.join(root,'docs','VOICE_CONVERSION.md'),path.join(app,'docs','VOICE_CONVERSION.md'));
await cp(path.join(root,'docs','REQUIREMENTS_MASTER.md'),path.join(app,'docs','REQUIREMENTS_MASTER.md'));
await writeFile(path.join(out,'启动泰拉桌伴.cmd'),'@echo off\r\ncd /d "%~dp0"\r\nstart "" "%~dp0TerraDeskMate.exe"\r\n');
await writeFile(path.join(out,'使用说明.txt'),'双击启动泰拉桌伴.cmd，或TerraDeskMate.exe（Amiya.exe仅保留为兼容入口）。无需Node与个人D:\\ak路径。软件内置教程。密钥、记忆和设置保存在当前Windows用户数据目录，不打包进软件。此包仅供Mizu个人本机测试，未公开发行。角色资源与第三方许可证仍需在公开发布前核查。','utf8');
console.log('本机便携测试包：'+out);
