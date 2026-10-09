/**
 * 角色资源包管理的纯文件层。
 *
 * 设计原因：下载/导入/删除属于高风险边界，集中做角色归属、包类型、路径越界、
 * SHA256 与原子替换检查，避免 Electron IPC 和渲染器各自实现不一致。
 * 本模块不启动训练、不改变当前角色配置，也不触碰 D:\\ak 原始目录。
 */
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type ResourcePackageKind = 'base' | 'voice-model';
export type ResourcePackageSource = 'builtin' | 'managed' | 'user-training';
export type ResourcePackageStatus = 'installed' | 'available' | 'source-unconfigured' | 'blocked' | 'error';

export interface ResourcePackageManifest {
  schemaVersion: 1;
  roleId: string;
  displayName: string;
  kind: ResourcePackageKind;
  version: string;
  source: ResourcePackageSource;
  installSizeBytes: number;
  downloadSizeBytes: number;
  sha256: string;
  files: Array<{ path: string; sizeBytes: number; sha256: string }>;
  includes: string[];
  excludes: string[];
  installedAt?: string;
  sourceUrl?: string;
}
export interface ResourcePackageRecord extends ResourcePackageManifest { id: string; status: ResourcePackageStatus; installPath: string; error?: string; }
export interface ResourceRoleSummary { roleId: string; displayName: string; base: ResourcePackageRecord; voiceModel: ResourcePackageRecord; }

const PACKAGE_SCHEMA = 1 as const;
const PACKAGE_DIR = 'resource-packages';

function assertRoleId(roleId: string): string {
  // Real role IDs include Chinese, accents, apostrophes and parentheses; only path/control characters are unsafe.
  if (!roleId || roleId.length > 160 || roleId === '.' || roleId === '..' || path.isAbsolute(roleId) || /[\\/:*?"<>|\u0000-\u001f]/.test(roleId)) throw new Error('角色ID包含不安全路径字符');
  return roleId;
}
function assertRelative(relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error('资源清单必须使用相对路径');
  const normalized = path.normalize(relativePath);
  if (normalized === '..' || normalized.startsWith('..' + path.sep) || normalized.includes('..' + path.posix.sep)) throw new Error('资源清单路径越界');
  return normalized;
}
function inside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
export function resourcePackageRoot(dataDir: string): string { return path.join(dataDir, PACKAGE_DIR); }
export function resourceInstallPath(dataDir: string, roleId: string, kind: ResourcePackageKind): string { assertRoleId(roleId); return path.join(resourcePackageRoot(dataDir), kind === 'base' ? 'base' : 'voice-model', roleId); }
export function sha256File(filePath: string): string { return createHash('sha256').update(readFileSync(filePath)).digest('hex'); }

async function walkFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true }); const result: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error('资源包拒绝符号链接：' + absolute);
    if (entry.isDirectory()) result.push(...await walkFiles(root, absolute)); else if (entry.isFile()) result.push(path.relative(root, absolute));
  }
  return result.sort();
}
async function digestManifestFiles(root: string, relativeFiles: string[]) {
  const files: ResourcePackageManifest['files'] = [];
  for (const relativePath of relativeFiles) {
    const safe = assertRelative(relativePath); const absolute = path.resolve(root, safe);
    if (!inside(root, absolute) || !existsSync(absolute) || !lstatSync(absolute).isFile()) throw new Error('资源包文件不存在：' + safe);
    const info = await stat(absolute); files.push({path: safe, sizeBytes: info.size, sha256: sha256File(absolute)});
  }
  return files;
}

/** 读取并严格校验 manifest；失败不会降级成“可用”。 */
export async function readResourceManifest(installPath: string): Promise<ResourcePackageManifest> {
  const manifestPath = path.join(installPath, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error('资源包缺少 manifest.json');
  const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as Partial<ResourcePackageManifest>;
  if (raw.schemaVersion !== PACKAGE_SCHEMA || !raw.roleId || !raw.kind || !raw.version || !Array.isArray(raw.files)) throw new Error('资源包 manifest 版本或字段无效');
  assertRoleId(raw.roleId); if (raw.kind !== 'base' && raw.kind !== 'voice-model') throw new Error('资源包类型无效');
  const declaredPaths = raw.files.map(file => assertRelative(String(file.path)));
  if(new Set(declaredPaths).size!==declaredPaths.length||declaredPaths.includes('manifest.json')) throw new Error('资源清单文件列表重复或包含manifest.json');
  const files = await digestManifestFiles(installPath, declaredPaths);
  const manifest: ResourcePackageManifest = {
    schemaVersion: PACKAGE_SCHEMA, roleId: raw.roleId, displayName: String(raw.displayName || raw.roleId), kind: raw.kind,
    version: String(raw.version), source: raw.source === 'user-training' ? 'user-training' : 'managed', installSizeBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
    downloadSizeBytes: Number(raw.downloadSizeBytes || 0), sha256: String(raw.sha256 || ''), files,
    includes: Array.isArray(raw.includes) ? raw.includes.map(String) : [], excludes: Array.isArray(raw.excludes) ? raw.excludes.map(String) : [], installedAt: raw.installedAt, sourceUrl: raw.sourceUrl,
  };
  if (!manifest.downloadSizeBytes) manifest.downloadSizeBytes = manifest.installSizeBytes;
  const calculated = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  if (manifest.sha256 && manifest.sha256 !== calculated) throw new Error('资源包文件指纹不匹配');
  manifest.sha256 = calculated; return manifest;
}

export async function installOfflineResourcePackage(dataDir: string, sourceDir: string, options:{installedBaseRoleIds?:ReadonlySet<string>}={}): Promise<ResourcePackageRecord> {
  if (!path.isAbsolute(sourceDir) || !existsSync(sourceDir) || !lstatSync(sourceDir).isDirectory()) throw new Error('离线资源包必须是已解压的文件夹');
  const incoming = await readResourceManifest(sourceDir);
  // Voice weights are an extension only; refusing a missing base prevents a package that cannot deploy from looking installed.
  if(incoming.kind==='voice-model'){
    const base=resourceInstallPath(dataDir,incoming.roleId,'base');
    if(existsSync(path.join(base,'manifest.json')))await readResourceManifest(base);
    // The application owns this set, not the package/renderer: builtin resources
    // already satisfy the SAME-role dependency and must not be installed twice.
    else if(!options.installedBaseRoleIds?.has(incoming.roleId))throw new Error('请先安装该角色基础包，再安装音色扩展包');
  }
  const declared=new Set(['manifest.json',...incoming.files.map(file=>assertRelative(file.path))]);
  const actual=new Set(await walkFiles(sourceDir));for(const file of actual)if(!declared.has(file))throw new Error('资源包包含清单外文件：'+file);for(const file of declared)if(!actual.has(file))throw new Error('资源包缺少清单文件：'+file);
  const target = resourceInstallPath(dataDir, incoming.roleId, incoming.kind), root = resourcePackageRoot(dataDir);
  if (!inside(root, target)) throw new Error('资源包安装路径越界'); await mkdir(path.dirname(target), {recursive: true});
  const temporary = target + '.incoming-' + randomUUID(), backup = target + '.backup-' + randomUUID();
  await rm(temporary, {recursive: true, force: true}); await cp(sourceDir, temporary, {recursive: true, errorOnExist: true, force: false});
  try { await readResourceManifest(temporary); if(existsSync(target))await rename(target,backup); await rename(temporary,target); await rm(backup,{recursive:true,force:true}); }
  catch (error) { await rm(temporary, {recursive: true, force: true}); if(existsSync(backup)&&!existsSync(target))await rename(backup,target); throw error; }
  const manifest = await readResourceManifest(target); return {...manifest, id: manifest.roleId + ':' + manifest.kind, status: 'installed', installPath: target};
}
export async function removeManagedResourcePackage(dataDir: string, roleId: string, kind: ResourcePackageKind, options: {activeRoleId?: string; trainingRoleIds?: string[]} = {}): Promise<void> {
  assertRoleId(roleId); if (options.activeRoleId === roleId && kind === 'base') throw new Error('当前正在使用该角色，先停止或切换桌宠后再删除基础包');
  if ((options.trainingRoleIds || []).includes(roleId)) throw new Error('该角色正在训练或合成，任务结束后才能删除资源');
  const target = resourceInstallPath(dataDir, roleId, kind); if (!inside(resourcePackageRoot(dataDir), target)) throw new Error('删除路径越界'); if (!existsSync(target)) return;
  const manifest = await readResourceManifest(target); if (manifest.source === 'builtin') throw new Error('内置基础资源不能从安装目录删除'); await rm(target, {recursive: true, force: false});
}
function unavailableRecord(roleId: string, displayName: string, kind: ResourcePackageKind, sourceUrl = ''): ResourcePackageRecord {
  const source: ResourcePackageSource = kind === 'base' ? 'builtin' : 'managed'; return {schemaVersion: PACKAGE_SCHEMA, id: roleId + ':' + kind, roleId, displayName, kind, version: '未安装', source, installSizeBytes: 0, downloadSizeBytes: 0, sha256: '', files: [], includes: [], excludes: [], status: kind === 'voice-model' && !sourceUrl ? 'source-unconfigured' : 'available', installPath: '', ...(sourceUrl ? {sourceUrl} : {})};
}
function packageSize(paths: string[]): number { let total = 0; for (const file of paths) { try { if (existsSync(file) && lstatSync(file).isFile()) total += lstatSync(file).size; } catch {} } return total; }

/** 将内置角色映射成资源管理目录；基础包统计包含模型、动作关联文件、原声与参考文件，但不含独立训练权重。 */
export async function listResourceRoles(options: {dataDir: string; profiles: Record<string, {name?: string}>; bundles: Array<{operatorId?: string; customId?: string; view?: string; files?: string[]; source?: {skeleton?: string; textures?: string[]}}>; voices: Array<{operatorId?: string; audioPath?: string; audioPaths?: Record<string, string>}>; trainedRoles?: Set<string>; sourceUrls?: Partial<Record<ResourcePackageKind, string>>;}): Promise<ResourceRoleSummary[]> {
  const roleIds = new Set(Object.keys(options.profiles)); for (const bundle of options.bundles) if (bundle.operatorId) roleIds.add(bundle.operatorId); const roles: ResourceRoleSummary[] = [];
  for (const roleId of [...roleIds].sort((a,b)=>a.localeCompare(b))) {
    const displayName = options.profiles[roleId]?.name || (roleId === 'Amiya' ? '阿米娅' : roleId);
    const paths = options.bundles.filter(bundle => bundle.operatorId === roleId && bundle.view !== '背面').flatMap(bundle => [bundle.source?.skeleton, ...(bundle.source?.textures || []), ...(bundle.files || [])]).filter(Boolean) as string[];
    const voicePaths = options.voices.filter(voice => voice.operatorId === roleId).flatMap(voice => [voice.audioPath, ...Object.values(voice.audioPaths || {})]).filter(Boolean) as string[];
    const baseBytes = packageSize([...paths, ...voicePaths]);
    const managedBase = resourceInstallPath(options.dataDir, roleId, 'base');
    let base: ResourcePackageRecord;
    if (existsSync(path.join(managedBase, 'manifest.json'))) {
      try { const manifest = await readResourceManifest(managedBase); base = {...manifest, id: roleId + ':base', status: 'installed', installPath: managedBase}; }
      catch (error) { base = {...unavailableRecord(roleId, displayName, 'base'), status: 'error', installPath: managedBase, error: String(error)}; }
    } else base = {...unavailableRecord(roleId, displayName, 'base'), version: 'builtin-1', source: 'builtin', status: baseBytes ? 'installed' : 'error', installSizeBytes: baseBytes, installPath: 'dist/assets/builtin', includes: ['外观','皮肤','动作','原声','逐字原文','角色卡','参考配置'], excludes: ['独立GPT/SoVITS训练权重','训练缓存','优化器检查点','私人数据'], error: baseBytes ? undefined : '未发现该角色的基础资源文件'};
    const voiceTarget = resourceInstallPath(options.dataDir, roleId, 'voice-model'); let voiceModel: ResourcePackageRecord;
    if (existsSync(path.join(voiceTarget, 'manifest.json'))) { try { const manifest = await readResourceManifest(voiceTarget); voiceModel = {...manifest, id: roleId + ':voice-model', status: 'installed', installPath: voiceTarget}; } catch (error) { voiceModel = {...unavailableRecord(roleId, displayName, 'voice-model', options.sourceUrls?.['voice-model'] || ''), status: 'error', installPath: voiceTarget, error: String(error)}; } }
    else { voiceModel = unavailableRecord(roleId, displayName, 'voice-model', options.sourceUrls?.['voice-model'] || ''); if (options.trainedRoles?.has(roleId)) voiceModel.status = 'available'; voiceModel.includes = ['本角色最终GPT权重','本角色最终SoVITS权重','必要推理配置','真实训练状态']; voiceModel.excludes = ['训练缓存','优化器检查点','原始私人录音','私人配置']; }
    roles.push({roleId, displayName, base, voiceModel});
  }
  return roles;
}

