/**
 * The browser emulator turns raw mouse movement straight into head turning. Chrome on Windows sometimes
 * reports one giant bogus movement (a "spike") for a single event, which makes the view snap. This caps
 * each movement event, so a spike becomes a normal-sized nudge. ?rawmouse in the URL turns it off.
 */
const MAX_STEP = 70; // px per event; a hard flick is usually spread over many events
export const mouseStats = { rawMax: 0, capped: 0 };

export function guardMouse(): void {
  let redispatching = false;
  window.addEventListener(
    'mousemove',
    (e) => {
      if (redispatching) return;
      const ax = Math.abs(e.movementX);
      const ay = Math.abs(e.movementY);
      mouseStats.rawMax = Math.max(mouseStats.rawMax, ax, ay);
      if (ax <= MAX_STEP && ay <= MAX_STEP) return;
      e.stopImmediatePropagation();
      mouseStats.capped += 1;
      const clamp = (v: number) => Math.max(-MAX_STEP, Math.min(MAX_STEP, v));
      const c = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        buttons: e.buttons,
        movementX: clamp(e.movementX),
        movementY: clamp(e.movementY),
      });
      redispatching = true;
      (e.target ?? window).dispatchEvent(c);
      redispatching = false;
    },
    true,
  );
}
