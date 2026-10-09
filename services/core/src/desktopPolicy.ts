/** Centralize the deployment limit so tray, IPC and UI cannot disagree. Hidden windows also own GPU resources. */
export const MAX_DESKTOP_PETS = 20;
export const canCreatePet = (count: number) => Number.isInteger(count) && count >= 0 && count < MAX_DESKTOP_PETS;
/** Movement clips are authored with different names; centralize recognition so autonomous movement, edge traversal, and chase use one contract. */
export function isStandbyActionName(name: string): boolean { return /^(?:idle|relax|stand|rest)(?:[_\s-]*\d+)?$/i.test(name.trim()); }
export function isMovementActionName(name: string): boolean {
  const value = name.trim();
  // Authored begin/end are short transition clips, not locomotion cycles. Choosing
  // them by a loose Move substring made the enemy slide while replaying its setup.
  if(/(?:^|[_\s-])(?:begin|end|start|stop)(?:$|[_\s-])/i.test(value))return false;
  return /^(?:move|walk|run)(?:[_\s-]*(?:loop|cycle|forward|backward|left|right|\d+))?$/i.test(value)
    || /(?:^|[_\s-])(?:move|walk|run)(?:[_\s-]*(?:loop|cycle))?(?:$|[_\s-])/i.test(value);
}
/** Dragging must not tear down the current WebGL model just to borrow an Interact animation. */
export function pickupAction<T extends {bundleId: string; name: string}>(actions: T[], bundleId: string): T | undefined {
  return actions.find(a => a.bundleId === bundleId && /^interact$/i.test(a.name));
}
/** A bundle/scale resize changes the window origin, not the pointer's world-space anchor. */
export function rebaseDrag<T extends {x: number; y: number}>(drag: T, dx: number, dy: number): T {
  return {...drag, x: drag.x + dx, y: drag.y + dy};
}

/** A deployment's autonomous pool must be shared by random gestures and walking, or unchecked Move leaks into custom mode. */
export function autonomousActions<T extends {id: string; group: string}>(actions: T[], group: string, ids: string[]): T[] {
  if (group === '全部') return actions;
  if (group === '自定义') return actions.filter(a => ids.includes(a.id));
  // Locomotion is infrastructure even when an author classified a movement clip under battle.
  // Custom mode stays an explicit allow-list so user curation is never broadened there.
  return actions.filter(a => a.group === group || (group === '基建' && a.group === '自定义') || isMovementActionName((a as any).name || '') || (group === '基建' && isStandbyActionName((a as any).name || '')));
}


/** Choose ordinary standby first: substring matches select B_Idle/Doll_Idle and hide normal skins. */
export function standbyAnimationName(names:string[]):string|undefined {
 return names.find(name=>/^relax$/i.test(name))
  ||names.find(name=>/^idle$/i.test(name))
  ||names.find(isStandbyActionName);
}
