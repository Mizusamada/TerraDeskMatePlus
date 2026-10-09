export function selectableActions(actions:any[]){
 const usable=actions.filter(a=>a.duration>0&&!/^default$/i.test(a.name));
 const dailyIdle=usable.find(a=>a.group==='基建'&&/^relax$|^idle$/i.test(a.name))||usable.find(a=>/^relax$|^idle$/i.test(a.name));
 return usable.filter(a=>!/^relax$|^idle$/i.test(a.name)||a.id===dailyIdle?.id).map(a=>({...a,displayName:a.id===dailyIdle?.id?'待机':a.name}));
}
