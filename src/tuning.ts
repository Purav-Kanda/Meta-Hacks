/**
 * Every number that makes a mode feel easier or harder lives here, so
 * "Easy" vs "Not Easy" (piece 9) is just a different object.
 */
export interface Tuning {
  teacherSpeed: number; // m/s while walking
  teacherTurnRate: number; // rad/s
  visionRange: number; // m
  visionHalfAngle: number; // radians, half of the cone width
  pauseScale: number; // multiplies waypoint pause times
  rushSpeed: number; // m/s when she charges at a cheater
  rushTurnRate: number; // rad/s
  glareSeconds: number; // she stares you down after a false alarm
  lectureSeconds: number; // she scolds you after handing out a warning
  graceSeconds: number; // after a warning she cannot hand out another for this long
  respotDelay: number; // after glaring she ignores evidence this long before spotting again
  peekAccuracy: number; // chance a neighbor's answer is the right one
  peekRefuseChance: number; // chance a shoulder tap gets a head shake instead of the paper
  peekFindSeconds: number; // after a tap, how long they take to find the same question on their paper
  peekShareSeconds: number; // a shared paper pulls itself back after this long
  peekPanicSeconds: number; // ...or after the teacher has been charging this long
  peekSulkSeconds: number; // a kid who refused ignores you this long
  peekTaps: number; // how many shoulder taps you get per round (99 = no limit)
  hideDodgeSeconds: number; // while she rushes, the HIDE button jumps to a new spot this often
  phoneBufferMin: number; // the phone buffers (lags) at least this long after you press ASK
  phoneBufferMax: number; // ... and at most this long
  phoneCooldown: number; // after it gives an answer it is useless for this long
  phoneGlowScale: number; // while the phone is out her vision range is multiplied by this
  fruitPerRound: number; // how many fruit you can throw per exam
  distractSeconds: number; // how long a thrown fruit holds her attention once she reaches it
  teacherCount: number; // 1 = Easy, 2 = Not Easy (a second teacher patrols the outer lanes)
  aimAssist: number; // 0..1, how strongly a throw bends toward the nearest front corner
  cribCount: number; // how many of the 10 answers are on your crib sheet
  cribReadSeconds: number; // how long you must stare down at it before the writing is readable
}

export const EASY: Tuning = {
  teacherSpeed: 0.6,
  teacherTurnRate: 2.5,
  visionRange: 4.5,
  visionHalfAngle: (30 * Math.PI) / 180,
  pauseScale: 1,
  rushSpeed: 1.3,
  rushTurnRate: 7,
  glareSeconds: 1.2,
  lectureSeconds: 2,
  graceSeconds: 4,
  respotDelay: 1,
  peekAccuracy: 0.7,
  peekRefuseChance: 0.2,
  peekFindSeconds: 2.8,
  peekShareSeconds: 4,
  peekPanicSeconds: 1.5,
  peekSulkSeconds: 5,
  peekTaps: 4,
  hideDodgeSeconds: 1.5,
  phoneBufferMin: 2,
  phoneBufferMax: 4,
  phoneCooldown: 20,
  phoneGlowScale: 1.4,
  fruitPerRound: 4,
  distractSeconds: 4.5,
  aimAssist: 0.6,
  cribCount: 6,
  cribReadSeconds: 0.3,
  teacherCount: 1,
};

export const NOT_EASY: Tuning = {
  teacherSpeed: 0.75,
  teacherTurnRate: 3,
  visionRange: 5.0,
  visionHalfAngle: (30 * Math.PI) / 180, // same width: the cone mesh is only scaled, never rebuilt
  pauseScale: 0.8,
  rushSpeed: 1.55,
  rushTurnRate: 8,
  glareSeconds: 1.0,
  lectureSeconds: 2,
  graceSeconds: 3,
  respotDelay: 0.6,
  peekAccuracy: 0.55,
  peekRefuseChance: 0.35,
  peekFindSeconds: 3.8,
  peekShareSeconds: 3,
  peekPanicSeconds: 0.8,
  peekSulkSeconds: 7,
  peekTaps: 3,
  hideDodgeSeconds: 0.9,
  phoneBufferMin: 3,
  phoneBufferMax: 6,
  phoneCooldown: 30,
  phoneGlowScale: 1.6,
  fruitPerRound: 3,
  distractSeconds: 3.5,
  aimAssist: 0.35,
  cribCount: 4,
  cribReadSeconds: 0.45,
  teacherCount: 2,
};

export type Difficulty = 'easy' | 'notEasy';

/** the live numbers every system reads. Changed only through setDifficulty(). */
export const ACTIVE_TUNING: Tuning = { ...EASY };
export const BUILT_VISION_RANGE = EASY.visionRange; // the teacher cone mesh is built at this range, then scaled

let current: Difficulty = 'easy';
const listeners: Array<() => void> = [];

export function getDifficulty(): Difficulty {
  return current;
}

/** systems call this in init() to be told when the numbers change */
export function onTuningChange(fn: () => void): void {
  listeners.push(fn);
}

/**
 * Apply a base difficulty, scale how fast/sharp the teachers are by `intensity` (1 = as written), then apply
 * any per-round overrides (for example a second teacher or no fruit). Systems that copy tuning numbers are told.
 */
/** where you sit nudges the teacher's eyesight and how good the neighbors' answers are (set by the seat draw) */
export const SEAT_MODS = { vision: 1, peek: 1 };

export function applyTuning(d: Difficulty, intensity = 1, overrides: Partial<Tuning> = {}): void {
  current = d;
  Object.assign(ACTIVE_TUNING, d === 'easy' ? EASY : NOT_EASY);
  const f = intensity;
  ACTIVE_TUNING.teacherSpeed *= f;
  ACTIVE_TUNING.rushSpeed *= f;
  ACTIVE_TUNING.teacherTurnRate *= f;
  ACTIVE_TUNING.rushTurnRate *= f;
  ACTIVE_TUNING.pauseScale /= f;
  ACTIVE_TUNING.visionRange *= 1 + (f - 1) * 0.5;
  Object.assign(ACTIVE_TUNING, overrides);
  ACTIVE_TUNING.visionRange *= SEAT_MODS.vision;
  ACTIVE_TUNING.peekAccuracy = Math.min(0.95, ACTIVE_TUNING.peekAccuracy * SEAT_MODS.peek);
  for (const fn of listeners) fn();
}

export function setDifficulty(d: Difficulty): void {
  applyTuning(d);
}
