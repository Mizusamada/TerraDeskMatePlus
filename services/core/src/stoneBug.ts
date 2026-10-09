import type {Rect} from './physics.js';
import {isMovementActionName,isStandbyActionName} from './desktopPolicy.js';

export interface EventAction {name:string;duration?:number;group?:string}
export interface EnemyDefinition {
 id:string; name:string; source:any; width:number; height:number; speed:number;
 moveNames?:string[]; deathNames?:string[]; attackNames?:string[]; fallbackGroups?:string[];
 spawnMessage:string; chaseMessage:string; defeatMessage:string;
}
export interface EnemyRuntime {definition:EnemyDefinition; x:number; y:number; direction:number; clicked:boolean; deadAt:number; target:number|null}

/**
 * 敌人窗口必须容纳所有已审计动画的可见范围，而不是沿用旧的固定小窗口。
 * 原石虫的攻击/移动帧比待机本体更宽更高；如果仍使用 180×140，渲染器会
 * 为了避免裁切把本体缩到很小。这里仅计算承载窗口，不改骨骼、atlas 或动作。
 */
export interface EnemyDisplayFrame {width:number;height:number;targetBodyHeight:number}
export function enemyDisplayFrame(camera:any,targetBodyHeight=110,padding=12):EnemyDisplayFrame {
 const envelope=camera?.envelope||{};
 const left=Number.isFinite(Number(envelope.left))?Math.max(0,Number(envelope.left)):1;
 const right=Number.isFinite(Number(envelope.right))?Math.max(0,Number(envelope.right)):1;
 const top=Number.isFinite(Number(envelope.top))?Math.max(0,Number(envelope.top)):1;
 const bottom=Number.isFinite(Number(envelope.bottom))?Math.max(0,Number(envelope.bottom)):0;
 const body=Math.max(1,targetBodyHeight);
 return {
  width:Math.max(180,Math.ceil((left+right)*body+padding*2)),
  height:Math.max(140,Math.ceil((top+bottom)*body+padding*2)),
  targetBodyHeight:body,
 };
}

function findFromAll<T extends EventAction>(actions:T[],names:string[]|undefined,matcher:RegExp|((name:string)=>boolean)){return names?.map(n=>actions.find(a=>a.name===n)).find(Boolean)||actions.find(a=>(a.duration??1)>0&&(matcher instanceof RegExp?matcher.test(a.name):matcher(a.name)));}

export function enemyActions<T extends EventAction>(actions:T[], definition:Pick<EnemyDefinition,'moveNames'|'deathNames'|'attackNames'|'fallbackGroups'>){
 const usable=actions.filter(a=>(a.duration??1)>0&&!/^default$|^die$|^start$|death|_begin$|_end$/i.test(a.name));
 const find=(names:string[]|undefined,regex:RegExp)=>names?.map(n=>usable.find(a=>a.name===n)).find(Boolean)||usable.find(a=>regex.test(a.name));
 const death=findFromAll(actions,definition.deathNames,/^die$|death|defeat/i);
 const attack=find(definition.attackNames,/attack|skill|hit|combat/i)||usable.find(a=>definition.fallbackGroups?.includes(a.group||''))||usable.find(a=>/interact|touch|poke/i.test(a.name))||usable[0];
 const move=findFromAll(actions,definition.moveNames,(name:string)=>isMovementActionName(name)) || actions.find(a=>(a.duration??1)>0&&isStandbyActionName(a.name));
 return {attack,move,death};
}

export function stoneBugActions<T extends EventAction>(actions:T[]){return enemyActions(actions,{attackNames:[],moveNames:['Move','move','move_loop','walk','walk_loop'],deathNames:['Die','die'],fallbackGroups:['战斗']});}

/** Reuse an actual strike from the current role/skin action catalog.
 * Attack_Loop is a playable strike cycle for segmented-only roles such as Closure.
 * Skill_Idle/Begin/End are states, not attacks; selecting them made pursuit look motionless.
 * This only selects an existing action object, preserving its bundle/id and normal playback.
 */
export function chaseAttackAction<T extends EventAction & {group?: string}>(actions:T[]): T | undefined {
 const battle=actions.filter(a=>a.group==='战斗'&&(a.duration??1)>0&&!/^default$|^die$|^start$|death|(?:^|_)(?:idle|begin|end)$|^idle$|^relax$/i.test(a.name));
 return battle.find(a=>/^attack$/i.test(a.name))
  ||battle.find(a=>/attack/i.test(a.name)&&!/_loop$/i.test(a.name))
  ||battle.find(a=>/^attack_loop$/i.test(a.name))
  ||battle.find(a=>/^attack(?:_down)?_loop$/i.test(a.name))
  ||battle.find(a=>/skill|hit|combat/i.test(a.name)&&!/_idle$|_begin$|_end$/i.test(a.name))
  ||battle.find(a=>/interact|touch|poke/i.test(a.name));
}

export function enemyChaseStep(pet:Rect,enemy:Rect,area:Rect,anchorOffset=pet.width*.35,speed=7){
 const rawTarget=enemy.x+enemy.width/2-anchorOffset;
 const target=Math.max(area.x,Math.min(area.x+area.width-pet.width,rawTarget));
 const gap=target-pet.x;
 const x=Math.max(area.x,Math.min(Math.max(area.x,area.x+area.width-pet.width),pet.x+Math.sign(gap)*Math.min(Math.abs(gap),speed)));
 const reach=Math.max(65,Math.min(160,pet.width*.22));
 return {x,direction:gap<0?-1:1,reached:Math.abs(target-x)<=reach};
}
export const stoneBugChaseStep=enemyChaseStep;



