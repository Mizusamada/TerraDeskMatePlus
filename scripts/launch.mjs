import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function electronPath() {
  const candidates = [process.env.AMIYA_ELECTRON_PATH, path.join(root,'node_modules/electron/dist/electron.exe')];
  const exe = candidates.find(p=>p && existsSync(p));
  if(!exe) throw new Error('找不到 Electron。请安装项目依赖或设置 AMIYA_ELECTRON_PATH。');
  return exe;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if(!existsSync(path.join(root,'dist/apps/desktop/main/main.js'))) throw new Error('请先运行 npm run build');
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronPath(),[root,...process.argv.slice(2)],{cwd:root,env,stdio:'inherit',windowsHide:true});
  child.on('error',e=>{console.error(e.message);process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code??1;});
}
