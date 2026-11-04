/** the start screen: up when the game loads, down after the first click (pure state, no three.js) */
export const TITLE = {
  active: true,
  /** the player clicked START (the title system plays its exit animation, then clears `active`) */
  leaving: false,
  /** debug: set to seconds to jump the animation clock (then reset to -1) */
  jump: -1,
  start(): void {
    this.leaving = true;
  },
};
