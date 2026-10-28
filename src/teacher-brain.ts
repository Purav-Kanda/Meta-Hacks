import type { Tuning } from './tuning.js';
import { wrapAngle, yawToward } from './vision.js';

export interface Waypoint {
  x: number;
  z: number;
  /** seconds to stand here (scaled by tuning.pauseScale) */
  pause?: number;
  /** while standing here, look at this floor point */
  lookAt?: [number, number];
}

// Floor plan: desks sit at x = -1.3, 0, 1.3. Aisles run at x = +-0.65.
// She never walks behind the player's chair, where a seated player cannot see her.
export const PATROL: Waypoint[] = [
  { x: 0, z: -3.9, pause: 2, lookAt: [0, 0] },
  { x: 0.65, z: -3.3 },
  { x: 0.65, z: -0.35, pause: 1.6, lookAt: [0, 0.05] },
  { x: 0.65, z: -3.3 },
  { x: 0, z: -3.9, pause: 1, lookAt: [0, 0] },
  { x: -0.65, z: -3.3 },
  { x: -0.65, z: -0.35, pause: 1.6, lookAt: [0, 0.05] },
  { x: -0.65, z: -3.3 },
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
