import { CanvasTexture, type Color, SRGBColorSpace, type World } from '@iwsdk/core';

/**
 * Makes the controller ray and its hit-dot easy to see against the classroom:
 * thick hot-pink ray (turns yellow while you pinch/trigger) and a pink dot with a white rim.
 * The SDK keeps its ray/cursor objects private, so we reach in through `any` and just
 * skip quietly if the internals ever change.
 */
const RAY_COLOR = 0xff2e93; // hot pink
const RAY_PRESSED = 0xffe500; // yellow
const SDK_PRESSED_HEX = 0x3383e6; // the SDK's own "pressed" blue, swapped out on copy
const RAY_THICKNESS = 7; // times the SDK's 1 mm radius

function makeDotTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ff2e93';
  g.beginPath();
  g.arc(128, 128, 112, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 18;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(128, 128, 26, 0, Math.PI * 2);
  g.fill();
  const tex = new CanvasTexture(cv);
  tex.anisotropy = 16; // three.js clamps to what the GPU supports; keeps tilted text crisp
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function stylePointers(world: World): () => boolean {
  const done = new Set<string>();
  let dot: CanvasTexture | null = null;
  // returns true once both hands are styled so the caller can stop retrying
  return () => {
    try {
      const mp = (world.input as any).xr.multiPointers as Record<string, any>;
      for (const hand of ['left', 'right']) {
        if (done.has(hand)) continue;
        const rayMesh = mp[hand]?.ray?.visual?.ray;
        const cursor = mp[hand]?.cursorVisual?.cursor;
        if (!rayMesh) continue;
        const col: Color = rayMesh.material.uniforms.color.value;
        col.setHex(RAY_COLOR);
        // the SDK calls color.copy(white|blue) on select start/end; remap those to our colors
        col.copy = function (this: Color, src: Color) {
          // setHex, not set(Color): Color.set(color) calls copy() again and would loop forever
          return this.setHex(src.getHex() === SDK_PRESSED_HEX ? RAY_PRESSED : RAY_COLOR);
        } as typeof col.copy;
        rayMesh.scale.set(RAY_THICKNESS, RAY_THICKNESS, 1);
        if (cursor) {
          dot ??= makeDotTexture();
          cursor.material.map = dot;
          cursor.material.needsUpdate = true;
          cursor.scale.setScalar(1.6);
        }
        done.add(hand);
      }
    } catch {
      return true; // internals changed: give up, default look is fine
    }
    return done.size === 2;
  };
}
