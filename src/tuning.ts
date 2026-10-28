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
  peekGlanceSeconds: number; // how long you must look at a neighbor before the PEEK bubble pops up
  hideDodgeSeconds: number; // while she rushes, the HIDE button jumps to a new spot this often
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
  peekGlanceSeconds: 0.4,
  hideDodgeSeconds: 0.6,
};

export const ACTIVE_TUNING: Tuning = EASY;
