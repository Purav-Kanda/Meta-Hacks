import { PatrolBrain, PATROL, type Waypoint } from './teacher-brain.js';
import type { Tuning } from './tuning.js';
import { inCone, wrapAngle, yawToward } from './vision.js';

export type TeacherMode = 'patrol' | 'rush' | 'glare' | 'lecture';

export interface AIContext {
  headX: number;
  headZ: number;
  /** only spot cheating while the exam is actually running */
  playing: boolean;
  /** is any cheat currently out in the open */
  evidence: boolean;
  /** multiplies her vision range (phone glow). Leave out for 1 */
  rangeScale?: number;
}

/** reused every update, so the per-frame path allocates nothing */
export interface AIEvents {
  spotted: boolean; // she just saw evidence and started rushing
  warned: boolean; // she arrived and the evidence was still out
  forgave: boolean; // she arrived and you had hidden it in time
}

// Aisle layout (same floor plan as the patrol route).
const AISLE_X = 0.65;
const AISLE_TOP_Z = -3.3;
const AISLE_END_Z = -0.35; // standing spot right beside the player's desk
const FRONT_ZONE_Z = -3.35;
const ARRIVE_EPS = 0.02;

/**
 * Wraps the patrol with the catch rules:
 *   patrol -> (sees evidence inside her cone) -> rush to the aisle beside you
 *   arrive: evidence still out -> WARNING, lecture
 *           evidence hidden    -> glare, no warning
 *   then she resumes the patrol from that aisle.
 * Pure logic, no rendering.
 */
export class TeacherAI {
  readonly patrol: PatrolBrain;
  mode: TeacherMode = 'patrol';
  readonly events: AIEvents = { spotted: false, warned: false, forgave: false };

  private rushing = false;
  path: Array<[number, number]> = [];
  private side = 1;
  private timer = 0;
  private immune = 0;

  constructor(
    route: readonly Waypoint[] = PATROL,
    private readonly tuning: Tuning,
  ) {
    this.patrol = new PatrolBrain(route, tuning);
  }

  get x(): number {
    return this.patrol.x;
  }
  get z(): number {
    return this.patrol.z;
  }
  get yaw(): number {
    return this.patrol.yaw;
  }
  get walking(): boolean {
    return this.mode === 'rush' ? this.rushing : this.mode === 'patrol' ? this.patrol.walking : false;
  }
  /** true while she is in angry mode (red, with the "!") */
  get angry(): boolean {
    return this.mode !== 'patrol';
  }

  update(dt: number, ctx: AIContext): AIEvents {
    const ev = this.events;
    ev.spotted = false;
    ev.warned = false;
    ev.forgave = false;
    this.immune = Math.max(0, this.immune - dt);

    switch (this.mode) {
      case 'patrol':
        this.patrol.update(dt);
        if (
          ctx.playing &&
          ctx.evidence &&
          this.immune <= 0 &&
          inCone(this.x, this.z, this.yaw, ctx.headX, ctx.headZ, this.tuning.visionRange * (ctx.rangeScale ?? 1), this.tuning.visionHalfAngle)
        ) {
          this.startRush();
          ev.spotted = true;
        }
        break;
      case 'rush':
        this.stepRush(dt, ctx, ev);
        break;
      default: // glare / lecture: stand and stare at the player's head
        this.turnTo(yawToward(this.x, this.z, ctx.headX, ctx.headZ), dt);
        this.timer -= dt;
        if (this.timer <= 0) this.resume();
    }
    return ev;
  }

  private startRush(): void {
    this.side = this.x >= 0 ? 1 : -1;
    this.path.length = 0;
    if (this.z < FRONT_ZONE_Z) this.path.push([this.side * AISLE_X, AISLE_TOP_Z]);
    this.path.push([this.side * AISLE_X, AISLE_END_Z]);
    this.mode = 'rush';
    this.rushing = true;
  }

  private stepRush(dt: number, ctx: AIContext, ev: AIEvents): void {
    const goal = this.path[0];
    const dx = goal[0] - this.x;
    const dz = goal[1] - this.z;
    const dist = Math.hypot(dx, dz);
    const step = this.tuning.rushSpeed * dt;
    this.turnTo(yawToward(this.x, this.z, goal[0], goal[1]), dt);
    if (dist > step + ARRIVE_EPS) {
      this.patrol.x += (dx / dist) * step;
      this.patrol.z += (dz / dist) * step;
      return;
    }
    this.patrol.x = goal[0];
    this.patrol.z = goal[1];
    this.path.shift();
    if (this.path.length > 0) return;

    // arrived beside the player: judge what is on the desk right now
    this.rushing = false;
    if (ctx.playing && ctx.evidence) {
      ev.warned = true;
      this.mode = 'lecture';
      this.timer = this.tuning.lectureSeconds;
      this.immune = this.tuning.lectureSeconds + this.tuning.graceSeconds;
    } else {
      ev.forgave = true;
      this.mode = 'glare';
      this.timer = this.tuning.glareSeconds;
      this.immune = this.tuning.glareSeconds + this.tuning.respotDelay;
    }
  }

  private resume(): void {
    this.mode = 'patrol';
    // from the right aisle end the next waypoint is index 3 (walk back up), from the left it is 7
    this.patrol.resumeAt(this.side === 1 ? 3 : 7);
  }

  private turnTo(desired: number, dt: number): void {
    const diff = wrapAngle(desired - this.patrol.yaw);
    const step = this.tuning.rushTurnRate * dt;
    this.patrol.yaw = wrapAngle(Math.abs(diff) <= step ? desired : this.patrol.yaw + Math.sign(diff) * step);
  }
}
