/** Public release files are selected by policy, never by copying the developer
 * workspace recursively. In particular, caches/logs/private profiles cannot be
 * made public simply because they happen to be under docs or a speech runtime. */
import path from 'node:path';
export const editionPolicy = {
 full: {speech:true,trained:true,bundledRoles:'all'},
 light: {speech:false,trained:false,bundledRoles:['Amiya']},
 plus: {speech:true,trained:false,bundledRoles:'all'},
 standard: {speech:false,trained:false,bundledRoles:'all'},
};
export function allowedReleaseFile(relative,edition) {
 const policy=editionPolicy[edition];if(!policy)throw Error('unknown edition '+edition);
 const p=relative.replaceAll('\\','/');
 if(path.isAbsolute(relative)||p.split('/').includes('..'))return false;
 if(/(?:^|\/)(?:\.git|\.build|\.test-data|__pycache__|user-data|userdata|logs|training-cache|recordings|chat-history|memories)(?:\/|$)/i.test(p))return false;
 if(/(?:^|\/)(?:\.env(?:\..*)?|secrets[^/]*\.json)$|\.(?:log|pyc|tmp|sqlite(?:3)?|db)$/i.test(p))return false;
 if(!policy.trained&&/(?:^|\/)trained-voices(?:\/|$)/.test(p))return false;
 if(!policy.speech&&/(?:^|\/)speech-runtime(?:\/|$)/.test(p))return false;
 return true;
}
