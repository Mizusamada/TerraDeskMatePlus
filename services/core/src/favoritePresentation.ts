import {favoriteRank, favoriteStorageId, isFavorite, type FavoriteKind, type FavoritesConfig} from './favorites.js';
/** Resource ownership is derived from stable asset identity, never the currently browsed role. */
export function bundleFavoriteRole(bundle:{customId?:string;operatorId?:string}):string {
  return bundle.customId || (bundle.operatorId==='Amiya'?'builtin':bundle.operatorId?'operator:'+bundle.operatorId:'');
}
/** No saved instance role field exists in legacy IPC. Infer only an unambiguous skin; unknowns must not become Amiya. */
export function instanceFavoriteRole(instance:{id:string;skin:string;roleId?:string},bundles:Array<{skin:string;customId?:string;operatorId?:string}>,activeId:string|null,activeRole:string):string {
  if(typeof instance.roleId==='string'&&instance.roleId)return instance.roleId;
  if(instance.id===activeId)return activeRole;
  const roles=[...new Set(bundles.filter(b=>b.skin===instance.skin).map(bundleFavoriteRole).filter(Boolean))];
  return roles.length===1?roles[0]:'';
}
/** Non-mutating stable sort keeps user selection independent of favorite order. */
export function sortFavoriteEntries<T>(items:T[],favorites:FavoritesConfig,kind:FavoriteKind,id:(item:T)=>string,current='',role:(item:T)=>string=()=> ''):T[] {
  return [...items].sort((a,b)=>favoriteRank(favorites,kind,id(a),current,role(a))-favoriteRank(favorites,kind,id(b),current,role(b)));
}
/** Search includes IDs/ownership as well as labels, so it survives localization and duplicate display names. */
export function favoriteSearchMatches(query:string,...values:unknown[]):boolean {
  const q=String(query||'').trim().toLocaleLowerCase();
  return !q||values.some(v=>String(v??'').toLocaleLowerCase().includes(q));
}
/** Resolve actions across every skin of their owning role. Missing/foreign assets never fall back to a different character. */
export function favoriteActionEntries(favorites:FavoritesConfig,bundles:any[],currentRole:string):any[] {
  const output:any[]=[];
  for(const raw of favorites.actions){
    const split=raw.indexOf('::'),scope=split>0?raw.slice(0,split):currentRole,id=split>0?raw.slice(split+2):raw;
    for(const b of bundles.filter(b=>b.view!=='背面'&&bundleFavoriteRole(b)===scope)){
      const a=(b.animations||[]).find((a:any)=>b.id+':'+a.name===id&&a.name!=='Default'&&(!b.actionOverlay||b.importedActionNames?.includes(a.name)));
      if(a){output.push({...a,id,bundleId:b.id,group:b.group,favoriteRole:scope,favoriteRoleName:b.skin.split(' · ')[0]});break;}
    }
  }
  return output;
}
