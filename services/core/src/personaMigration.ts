import type {Config} from './config.js';
/** Preserve user edits: only refresh a card that exactly matches the previous generated source. */
export function migrateBuiltinPersonas(c:Config,profiles:Record<string,any>):Config{
 const next=structuredClone(c);
 const refresh=(persona:any,key:string)=>{const role=key.startsWith('operator:')?key.slice(9):'';const p=profiles[role];if(p?.legacyPersonality&&persona?.personality===p.legacyPersonality)persona.personality=p.personality;};
 refresh(next.persona,next.assets.customId||'amiya_caster');
 for(const [key,saved]of Object.entries(next.profiles))refresh(saved?.persona,key);
 return next;
}
