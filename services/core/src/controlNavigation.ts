/** Nine primary destinations group original pages without removing their business logic or IPC contracts. */
export const primaryPages = ['overview','chat','character','role-settings','settings','resources','appearance','favorites','memory','resource-manager'] as const;
// Keep reminder/enemy behavior in one user-facing category so the homepage has a single discoverable entry.
export const childPages: Record<string,string[]> = {overview:['fun'],'role-settings':['persona','actions','bubble','voicechanger'],settings:['llm','speech','asr','permissions','saves','tutorial'],resources:['voices','workshop'],favorites:['favorite-roles','favorite-chats','favorite-voices','favorite-actions','favorite-resources']};
// Keep old deep links alive without exposing a duplicate legacy navigation card.
const legacyAliases: Record<string,string> = {alerts:'fun'};
export function primaryFor(tab: string): string { return legacyAliases[tab] || Object.entries(childPages).find(([,children])=>children.includes(tab))?.[0] || tab; }

