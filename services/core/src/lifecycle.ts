// BrowserWindow.closed fires after webContents destruction: callers must capture id before registering callbacks.
export function livePets<T extends {win:{isDestroyed:()=>boolean}}>(pets:Map<number,T>):T[]{
 const live:T[]=[];
 for(const [id,p]of pets){if(p.win.isDestroyed())pets.delete(id);else live.push(p);}
 return live;
}
