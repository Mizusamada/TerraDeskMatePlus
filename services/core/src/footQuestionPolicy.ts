/** Upgrade only the exact old generated foot default. Custom actions/voice pools,
 * explicit silence and revision-3 choices remain unchanged; no audio ownership moves.
 */
export function migrateFootQuestionDefault<T extends {defaultsRevision:number;clickBindings:Record<string,{action:string;voiceId:string;actionIds?:string[];voiceIds?:string[]}>}>(behaviour:T):T{
 // Pre-revision-2 settings still need the existing head/body/idle migration.
 if(behaviour.defaultsRevision<2||behaviour.defaultsRevision>=3)return behaviour;
 const next=structuredClone(behaviour),foot=next.clickBindings.foot_poke;
 if(foot&&foot.action===''&&foot.voiceId==='__random__'&&!foot.actionIds?.length&&!foot.voiceIds?.length)foot.voiceId='__question__';
 next.defaultsRevision=3;return next;
}
