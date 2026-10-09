/**
 * Cross-page favorites are stored by stable IDs instead of display text.
 * Role-scoped entries use "roleId::itemId" so two characters can both have an
 * action/voice with the same local ID without leaking one character's choice.
 */
export type FavoriteKind = 'role' | 'voice' | 'action' | 'resource';
export interface FavoritesConfig { roles: string[]; voices: string[]; actions: string[]; resources: string[]; }
export const emptyFavorites = (): FavoritesConfig => ({ roles: [], voices: [], actions: [], resources: [] });
export function normalizeFavorites(value: Partial<FavoritesConfig> | undefined): FavoritesConfig {
  const clean=(items:unknown)=>Array.isArray(items)?[...new Set(items.filter((x):x is string=>typeof x==='string'&&!!x.trim()).map(x=>x.trim()))].slice(0,2000):[];
  return {roles:clean(value?.roles),voices:clean(value?.voices),actions:clean(value?.actions),resources:clean(value?.resources)};
}
export function favoriteBucket(kind: FavoriteKind): keyof FavoritesConfig {
  return kind==='role'?'roles':kind==='voice'?'voices':kind==='action'?'actions':'resources';
}
/** Stable storage key; roles are global, other resources belong to a role. */
export function favoriteStorageId(kind: FavoriteKind, id: string, roleId=''): string {
  const cleanId=String(id||'').trim();
  const cleanRole=String(roleId||'').trim();
  return kind==='role'||!cleanRole||cleanId.includes('::')?cleanId:cleanRole+'::'+cleanId;
}
/**
 * Toggle is backward-compatible with the first implementation, which stored
 * unscoped voice/action/resource IDs. A legacy ID is removed on first toggle
 * instead of leaving a duplicate that looks impossible to cancel in the UI.
 */
export function toggleFavorite(favorites: FavoritesConfig, kind: FavoriteKind, id: string, roleId=''): FavoritesConfig {
  const next=normalizeFavorites(favorites),bucket=favoriteBucket(kind),items=next[bucket];
  const storageId=favoriteStorageId(kind,id,roleId),legacy=String(id||'').trim();
  if(items.includes(storageId)) next[bucket]=items.filter(x=>x!==storageId);
  else if(storageId!==legacy&&items.includes(legacy)) next[bucket]=items.filter(x=>x!==legacy);
  else next[bucket]=[storageId,...items.filter(x=>x!==storageId)];
  return next;
}
export function isFavorite(favorites: FavoritesConfig|undefined, kind: FavoriteKind, id: string, roleId=''): boolean {
  const items=favorites?.[favoriteBucket(kind)]||[];
  const storageId=favoriteStorageId(kind,id,roleId);
  return items.includes(storageId)||(storageId!==id&&items.includes(String(id||'').trim()));
}
/** Current selection wins over ordinary favorites, then stable ID order preserves predictable lists. */
export function favoriteRank(favorites: FavoritesConfig|undefined, kind: FavoriteKind, id: string, currentId='', roleId=''): number {
  if(id===currentId)return 0;
  return isFavorite(favorites,kind,id,roleId)?1:2;
}
