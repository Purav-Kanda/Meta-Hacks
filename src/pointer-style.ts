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

/** cartoon glove for filming (?demo): pointing hand normally, pinching hand while pressed. The fingertip is the texture center. */
function makeGloveTexture(pinch: boolean): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.translate(128, 128);
  g.scale(0.62, 0.62);
  g.rotate(-0.4);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const glove = (draw: () => void): void => {
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#2a2a3a';
    g.lineWidth = 9;
    draw();
    g.fill();
    g.stroke();
  };
  // cuff
  glove(() => {
    g.beginPath();
    g.roundRect(-44, 150, 88, 34, 10);
  });
  // palm
  glove(() => {
    g.beginPath();
    g.roundRect(-52, 70, 104, 92, 30);
  });
  if (!pinch) {
    // index finger pointing at the dot, curled-in fingers drawn as a bumpy row
    glove(() => {
      g.beginPath();
      g.roundRect(-15, 6, 30, 100, 15);
    });
    for (const x of [20, 38]) {
      glove(() => {
        g.beginPath();
        g.roundRect(x - 2, 62, 26, 46, 13);
      });
    }
    glove(() => {
      g.beginPath();
      g.ellipse(-48, 96, 14, 28, -0.5, 0, Math.PI * 2);
    });
  } else {
    // thumb and index meet at the dot
    glove(() => {
      g.beginPath();
      g.roundRect(-4, 4, 28, 82, 14);
    });
    glove(() => {
      g.beginPath();
      g.ellipse(-26, 62, 15, 42, 0.55, 0, Math.PI * 2);
    });
    // squeeze sparkle
    g.strokeStyle = '#ffd400';
    g.lineWidth = 9;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
      g.lineTo(Math.cos(a) * 46, Math.sin(a) * 46);
      g.stroke();
    }
  }
  const tex = new CanvasTexture(cv);
  tex.anisotropy = 16;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function stylePointers(world: World, glove = false): () => boolean {
  const done = new Set<string>();
  let dot: CanvasTexture | null = null;
  const gloveUp = glove ? makeGloveTexture(false) : null;
  const gloveDown = glove ? makeGloveTexture(true) : null;
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
          const pressed = src.getHex() === SDK_PRESSED_HEX;
          if (gloveDown && gloveUp && cursor) {
            cursor.material.map = pressed ? gloveDown : gloveUp;
            cursor.material.needsUpdate = true;
          }
          // setHex, not set(Color): Color.set(color) calls copy() again and would loop forever
          return this.setHex(pressed ? RAY_PRESSED : RAY_COLOR);
        } as typeof col.copy;
        rayMesh.scale.set(glove ? 3 : RAY_THICKNESS, glove ? 3 : RAY_THICKNESS, 1);
        if (cursor) {
          dot ??= makeDotTexture();
          cursor.material.map = gloveUp ?? dot;
          cursor.material.transparent = true;
          cursor.material.needsUpdate = true;
          cursor.scale.setScalar(glove ? Number(new URLSearchParams(window.location.search).get('glove')) || 3.4 : 1.6);
        }
        done.add(hand);
      }
    } catch {
      return true; // internals changed: give up, default look is fine
    }
    return done.size === 2;
  };
}
