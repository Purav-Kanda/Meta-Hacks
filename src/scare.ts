/**
 * The "busted" scare (pure logic, no three.js): when the last warning lands the teacher whips round, lunges
 * into your face, wobbles with rage and then goes back, and only then does the BUSTED card appear.
 * Calm Motion swaps the lunge for a short, still glare.
 */
export const SCARE = {
  active: false,
  t: 0,
};

/** how far from your head she stops (the face leans in closer than this) */
export const SCARE_DISTANCE = 1.25;

export function scareDuration(calm: boolean): number {
  return calm ? 1.0 : 1.9;
}

export interface ScarePose {
  /** 0 = where she was, 1 = right beside you */
  move: number;
  /** forward lean in radians (negative = rocking back to wind up) */
  lean: number;
  scale: number;
  /** wobble strength 0..1 */
  shake: number;
  /** size of the "!" over her head */
  mark: number;
  /** how far she has turned to face you, 0..1 */
  turn: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (v: number): number => v * v * (3 - 2 * v);

/** the animation, as a function of time since the scare began */
export function scarePose(t: number, calm: boolean): ScarePose {
  if (calm) {
    const k = clamp01(t / 0.3);
    return { move: 0, lean: 0, scale: 1, shake: 0, mark: 1 + 0.3 * smooth(k), turn: smooth(k) };
  }
  const total = scareDuration(false);
  const turn = smooth(clamp01(t / 0.3));
  // 0..0.3 wind up (rock back), 0.3..0.65 lunge, 0.65..1.45 hold and wobble, 1.45..end retreat
  let move = 0;
  let lean = 0;
  let scale = 1;
  let shake = 0;
  if (t < 0.3) {
    const k = smooth(t / 0.3);
    lean = -0.18 * k;
    scale = 1 + 0.03 * k;
  } else if (t < 0.65) {
    const k = clamp01((t - 0.3) / 0.35);
    const e = k * k * k; // slow start, fast finish
    move = e;
    lean = -0.18 + (0.32 + 0.18) * e;
    scale = 1.03 + 0.05 * e;
  } else if (t < 1.45) {
    move = 1;
    lean = 0.32;
    scale = 1.08;
    shake = 1;
  } else {
    const k = smooth(clamp01((t - 1.45) / (total - 1.45)));
    move = 1 - k;
    lean = 0.32 * (1 - k);
    scale = 1.08 - 0.08 * k;
    shake = 1 - k;
  }
  const mark = t < 0.3 ? 1 + 0.3 * turn : t < 1.45 ? 1.3 + 0.25 * Math.sin(t * 22) : 1.3 * (1 - 0.3 * clamp01((t - 1.45) / (total - 1.45)));
  return { move, lean, scale, shake, mark, turn };
}

/** the spot straight in front of you, over your desk, so the lunge fills your view */
export function scareTarget(headX: number, headZ: number): { x: number; z: number } {
  return { x: headX, z: headZ - SCARE_DISTANCE };
}
