import type { World } from '@iwsdk/core';

/**
 * A button only counts as clicked if a real press happened a moment ago: a mouse/touch press on the page, or a
 * trigger/pinch ("select") from the VR session. This stops presses that are not backed by a real click (for
 * example, a stuck press state in the emulator that "clicks" every button the ray moves onto).
 * `?noguard` in the URL turns it off. Poking with a finger (no select event) is not counted.
 */
const WINDOW_MS = 500;
let lastDown = -1e9;
let off = false;
let installed = false;
export const PRESS = {
  blocked: 0,
  onBlocked: undefined as ((msg: string) => void) | undefined,
};

/** true if this Pressed tag was caused by a real click; call it at the top of every Pressed handler */
export function realPress(): boolean {
  if (off) return true;
  if (performance.now() - lastDown <= WINDOW_MS) return true;
  PRESS.blocked += 1;
  PRESS.onBlocked?.(`BLOCKED press with no click (#${PRESS.blocked})`);
  return false;
}

export function installPressGuard(world: World): void {
  if (installed) return;
  installed = true;
  off = new URLSearchParams(window.location.search).has('noguard');
  const mark = (): void => {
    lastDown = performance.now();
  };
  for (const type of ['pointerdown', 'mousedown', 'touchstart']) window.addEventListener(type, mark, true);
  const hook = (): void => {
    const sess = world.renderer.xr.getSession();
    if (!sess) return;
    sess.addEventListener('selectstart', mark);
  };
  world.renderer.xr.addEventListener('sessionstart', hook);
  hook();
}
