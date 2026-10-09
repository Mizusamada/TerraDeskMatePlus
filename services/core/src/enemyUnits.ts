import type {EventAction,EnemyDefinition,EnemyRuntime} from './stoneBug.js';

export type EnemyUnit = EnemyDefinition & {source:any; bundled?:boolean; custom?:boolean};

export function enemySummary(enemy:EnemyUnit){return {id:enemy.id,name:enemy.name,width:enemy.width,height:enemy.height,speed:enemy.speed,bundled:!!enemy.bundled,custom:!!enemy.custom,sourceReady:!!enemy.source};}

export function selectEnemyActions<T extends EventAction>(actions:T[],enemy:EnemyUnit,group:'auto'|'基建'|'战斗'|'自定义'='auto'){
 const fallbackGroups=group==='auto'?(enemy.fallbackGroups||[]):[group];
 return { ...enemy, fallbackGroups, actions };
}
