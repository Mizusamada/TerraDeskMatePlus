/** Fresh single-entry portable package. Existing releases are never overwritten.
 * Source assets/weights keep their bytes; the light app only copies assets/builtin, never optional role folders.
 */
import {cp,mkdir,writeFile,stat,readdir} from 'node:fs/promises';import {existsSync} from 'node:fs';import path from 'node:path';import {electronPath,root} from './launch.mjs';
const name=process.env.TERRA_NEW_DELIVERY_NAME||'TerraDeskMat-'+new Date().toISOString().replace(/[:.]/g,'-');
if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/.test(name))throw Error('输出名称必须是安全单层名称');
const release=path.resolve(root,'release'),out=path.join(release,name);if(existsSync(out))throw Error('输出已存在，不覆盖旧包');await mkdir(out,{recursive:true});
const runtime=path.dirname(electronPath());await cp(runtime,out,{recursive:true,filter:p=>path.basename(p)!=='electron.exe'});await cp(path.join(runtime,'electron.exe'),path.join(out,'TerraDeskMate.exe'));
const app=path.join(out,'resources/app');await mkdir(app,{recursive:true});await cp(path.join(root,'dist'),path.join(app,'dist'),{recursive:true});
await mkdir(path.join(app,'node_modules'),{recursive:true});await cp(path.join(root,'node_modules/ws'),path.join(app,'node_modules/ws'),{recursive:true});
for(const dir of ['docs','third_party','speech-runtime'])if(existsSync(path.join(root,dir)))await cp(path.join(root,dir),path.join(app,dir),{recursive:true});
for(const file of ['default-template.json','distribution.json'])if(existsSync(path.join(root,file)))await cp(path.join(root,file),path.join(app,file));
await writeFile(path.join(app,'package.json'),JSON.stringify({name:'terra-desk-mate',version:'0.3.0',type:'module',main:'dist/apps/desktop/main/main.js'}));
await writeFile(path.join(out,'启动泰拉桌伴.cmd'),'@echo off\r\ncd /d "%~dp0"\r\nstart "" "%~dp0TerraDeskMate.exe"\r\n');
await writeFile(path.join(out,'使用说明.txt'),'请复制整个目录。启动TerraDeskMate.exe；完整说明在resources/app/docs/使用说明书。轻量版其他角色需单独导入基础文件夹与可选音色包。用户密钥和个人存档不在应用目录中。\r\n');
console.log('新便携目录：'+out);
