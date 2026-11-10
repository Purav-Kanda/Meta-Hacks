import type { Tuning } from './tuning.js';
import { SEATING } from './seating.js';
import { wrapAngle, yawToward } from './vision.js';

export interface Waypoint {
  x: number;
  z: number;
  /** seconds to stand here (scaled by tuning.pauseScale) */
  pause?: number;
  /** while standing here, look at this floor point */
  lookAt?: [number, number];
}

// Front-row seat: after stopping beside you she keeps walking to the end of the aisle (back wall), so she
// ends up behind you and you can cheat. For the back row this waypoint sits on the stand spot (no extra walk).
const endWp = (x: number, off: number): Waypoint => ({
  x,
  get z() { return SEATING.endZ - off; },
  get pause() { return SEATING.endZ === SEATING.standZ ? 0 : 1.2; },
  lookAt: SEATING.look,
});
const END_R = endWp(0.75, 0);
const END_L = endWp(-0.75, 0);
const OUT_END_L = endWp(-2.6, 0.65);
const OUT_END_R = endWp(2.6, 0.65);

// Floor plan: desks sit at x = -1.5, 0, 1.5. Aisles run at x = +-0.75 (0.5 m wide, she fits).
// She never walks behind the player's chair, where a seated player cannot see her.
export const PATROL: Waypoint[] = [
  { x: 0, z: -3.9, pause: 2, lookAt: [0, 0] },
  { x: 0.75, z: -3.3 },
  { x: 0.75, get z() { return SEATING.standZ; }, pause: 1.6, lookAt: SEATING.look },
  END_R,
  { x: 0.75, z: -3.3 },
  { x: 0, z: -3.9, pause: 1, lookAt: [0, 0] },
  { x: -0.75, z: -3.3 },
  { x: -0.75, get z() { return SEATING.standZ; }, pause: 1.6, lookAt: SEATING.look },
  END_L,
  { x: -0.75, z: -3.3 },
];

/**
 * The second teacher (Not Easy). She walks the outer lanes beside the neighbours, so she never shares the
 * aisles with the first teacher, and cuts across the front by the aisle tops. Indexes 4 and 10 are the
 * aisle tops she resumes from after a catch.
 */
export const PATROL_OUTER: Waypoint[] = [
  { x: -2.6, z: -3.8, pause: 1.2, lookAt: [0, 0] },
  { x: -2.6, get z() { return SEATING.standZ - 0.65; }, pause: 1.6, lookAt: SEATING.look },
  OUT_END_L,
  { x: -2.6, z: -3.8 },
  { x: -0.75, z: -3.3 },
  { x: 0.75, z: -3.3 },
  { x: 2.6, z: -3.8, pause: 1.2, lookAt: [0, 0] },
  { x: 2.6, get z() { return SEATING.standZ - 0.65; }, pause: 1.6, lookAt: SEATING.look },
  OUT_END_R,
  { x: 2.6, z: -3.8 },
  { x: 0.75, z: -3.3 },
  { x: -0.75, z: -3.3 },
];

/**
 * Pure patrol logic: walks the waypoint loop, pauses and turns. No rendering.
 * yaw 0 faces -Z (the chalkboard).
 */
export class PatrolBrain {
  x: number;
  z: number;
  yaw: number;
  walking = false;
  private target = 1;
  private waitLeft: number;
  private pausedAt = 0;

  constructor(
    private readonly route: readonly Waypoint[],
    private readonly tuning: Tuning,
  ) {
    this.x = route[0].x;
    this.z = route[0].z;
    this.waitLeft = (route[0].pause ?? 0) * tuning.pauseScale;
    this.pausedAt = 0;
    this.yaw = route[0].lookAt ? yawToward(this.x, this.z, route[0].lookAt[0], route[0].lookAt[1]) : 0;
  }

  /** back to the first waypoint, as at the start */
  reset(): void {
    const w = this.route[0];
    this.x = w.x;
    this.z = w.z;
    this.target = 1;
    this.waitLeft = (w.pause ?? 0) * this.tuning.pauseScale;
    this.pausedAt = 0;
    this.walking = false;
    this.yaw = w.lookAt ? yawToward(this.x, this.z, w.lookAt[0], w.lookAt[1]) : 0;
  }

  /** after being pulled off the route (rush, scolding), carry on toward waypoint `index` */
  resumeAt(index: number): void {
    this.target = index % this.route.length;
    this.waitLeft = 0;
    this.walking = false;
  }

  /** index of the waypoint she is heading to (or standing at while paused) */
  get headingTo(): number {
    return this.target;
  }

  private turnToward(desired: number, dt: number): void {
    const diff = wrapAngle(desired - this.yaw);
    const step = this.tuning.teacherTurnRate * dt;
    this.yaw = Math.abs(diff) <= step ? desired : this.yaw + Math.sign(diff) * step;
    this.yaw = wrapAngle(this.yaw);
  }

  update(dt: number): void {
    if (this.waitLeft > 0) {
      this.walking = false;
      const wp = this.route[this.pausedAt];
      if (wp.lookAt) this.turnToward(yawToward(this.x, this.z, wp.lookAt[0], wp.lookAt[1]), dt);
      this.waitLeft -= dt;
      return;
    }
    const wp = this.route[this.target];
    const dx = wp.x - this.x;
    const dz = wp.z - this.z;
    const dist = Math.hypot(dx, dz);
    const stepLen = this.tuning.teacherSpeed * dt;
    if (dist <= stepLen) {
      this.x = wp.x;
      this.z = wp.z;
      this.pausedAt = this.target;
      this.waitLeft = (wp.pause ?? 0) * this.tuning.pauseScale;
      this.target = (this.target + 1) % this.route.length;
      this.walking = false;
      return;
    }
    const wanted = yawToward(this.x, this.z, wp.x, wp.z);
    this.turnToward(wanted, dt);
    // turn on the spot until roughly facing the next waypoint, then walk the straight line to it
    if (Math.abs(wrapAngle(wanted - this.yaw)) > 0.35) {
      this.walking = false;
      return;
    }
    this.walking = true;
    this.x += (dx / dist) * stepLen;
    this.z += (dz / dist) * stepLen;
  }
}
