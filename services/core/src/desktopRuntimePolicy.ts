export interface AutonomousCycleState {
  visible: boolean;
  ready: boolean;
  idleEnabled: boolean;
  pauseMovement: boolean;
  dragging: boolean;
  hovering: boolean;
  manualAction: boolean;
  deploymentLocked: boolean;
  chasing: boolean;
  falling: boolean;
}

/**
 * 自主动作只由“闲置陪伴”开关和当前生命周期状态控制；manualMode 仅表示允许方向键，
 * 不能再意外关闭定时自主动作，否则用户同时开启两项设置时桌宠会永远不走。
 */
export function shouldRunAutonomousCycle(state: AutonomousCycleState): boolean {
  return state.visible && state.ready && state.idleEnabled && !state.pauseMovement
    && !state.dragging && !state.hovering && !state.manualAction
    && !state.deploymentLocked && !state.chasing && !state.falling;
}

/** 自主行走是自主动作循环的后半段，单独保持同一生命周期门槛以避免卡在边缘或拖拽中。 */
export function shouldAdvanceAutonomousMovement(state: AutonomousCycleState & { moving: boolean }): boolean {
  // Explicit manual loops are not autonomous selections. Sharing the selection gate broke
  // manual Move and disabled it when idle companionship was off.
  return state.visible && state.ready && state.moving && !state.pauseMovement
    && !state.dragging && !state.hovering && !state.deploymentLocked
    && !state.chasing && !state.falling && (state.manualAction || state.idleEnabled);
}

/**
 * Electron 的置顶级别必须随实例配置重复施加；仅在创建时设置会被 Windows 的窗口管理器
 * 或显示/隐藏切换重置。返回值用于主进程测试，不依赖 Electron 对象。
 */
export function windowTopmostLevel(enabled: boolean): 'floating' | 'normal' {
  return enabled ? 'floating' : 'normal';
}

/** Start deadlines when the renderer acknowledges a ready model; loading time must never consume a walk or slow gesture. */
export function playbackDeadlines(action:{duration?:number},speed:number,loop:boolean,manual:boolean,moving:boolean,now:number,delay:number){
  const duration=Math.max(0,Number(action.duration)||0)*1000/Math.max(.25,speed||1);
  const hold=Math.max(1500,duration||2000);
  return {holdUntil:now+hold,moveUntil:moving?(loop&&manual?Infinity:now+Math.max(1200,loop?4000:duration)):0,nextAction:now+hold+delay};
}
