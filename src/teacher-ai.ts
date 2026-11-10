import { SEATING } from './seating.js';
import { PatrolBrain, PATROL, type Waypoint } from './teacher-brain.js';
import type { Tuning } from './tuning.js';
import { inCone, wrapAngle, yawToward } from './vision.js';

export type TeacherMode = 'patrol' | 'rush' | 'glare' | 'lecture' | 'distracted';

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
const AISLE_X = 0.75;
const AISLE_TOP_Z = -3.3;
const FRONT_ZONE_Z = -3.35;
const ARRIVE_EPS = 0.02;
const OUTER_LANE_X = 2.1;
const OUTER_FRONT_Z = -3.7;

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
  private moving = false;
  private look: [number, number] = [0, 0];

  constructor(
    route: readonly Waypoint[] = PATROL,
    private readonly tuning: Tuning,
    /** route index to carry on from after a catch at the right / left aisle end, and after a fruit distraction */
    private readonly resumeIdx: { right: number; left: number; distract: number } = { right: 4, left: 9, distract: 0 },
  ) {
    this.patrol = new PatrolBrain(route, tuning);
  }

  /** back to the start, calmly patrolling */
  reset(): void {
    this.patrol.reset();
    this.mode = 'patrol';
    this.path.length = 0;
    this.immune = 0;
    this.rushing = false;
    this.moving = false;
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
    if (this.mode === 'rush') return this.rushing;
    if (this.mode === 'distracted') return this.moving;
    return this.mode === 'patrol' ? this.patrol.walking : false;
  }
  /** true while she is in angry mode (red, with the "!") */
  get angry(): boolean {
    return this.mode === 'rush' || this.mode === 'glare' || this.mode === 'lecture';
  }

  /**
   * A thrown fruit landed: walk (by the aisles) to the stand point, stare at the fruit for a while,
   * then go back to patrol. Only works while she is calmly patrolling. While she is distracted she
   * cannot spot anything.
   */
  distract(standX: number, standZ: number, lookX: number, lookZ: number): boolean {
    if (this.mode !== 'patrol') return false;
    this.path.length = 0;
    // inside the desk rows she first goes up her aisle to the open front area
    if (this.z > FRONT_ZONE_Z) this.path.push([this.x, AISLE_TOP_Z]);
    this.path.push([standX, standZ]);
    this.look[0] = lookX;
    this.look[1] = lookZ;
    this.patrol.walking = false;
    this.moving = false;
    this.mode = 'distracted';
    return true;
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
      case 'distracted':
        this.stepDistracted(dt);
        break;
      default: // glare / lecture: stand and stare at the player's head
        this.turnTo(yawToward(this.x, this.z, ctx.headX, ctx.headZ), dt);
        this.timer -= dt;
        if (this.timer <= 0) this.resume();
    }
    return ev;
  }

  private stepDistracted(dt: number): void {
    const turnRate = this.tuning.teacherTurnRate * 2;
    if (this.path.length > 0) {
      const goal = this.path[0];
      const dx = goal[0] - this.x;
      const dz = goal[1] - this.z;
      const dist = Math.hypot(dx, dz);
      const step = this.tuning.teacherSpeed * 1.5 * dt;
      const wanted = yawToward(this.x, this.z, goal[0], goal[1]);
      this.turnBy(wanted, dt, turnRate);
      if (dist <= step + ARRIVE_EPS) {
        this.patrol.x = goal[0];
        this.patrol.z = goal[1];
        this.path.shift();
        this.moving = false;
        if (this.path.length === 0) this.timer = this.tuning.distractSeconds;
      } else if (Math.abs(wrapAngle(wanted - this.patrol.yaw)) <= 0.35) {
        this.moving = true;
        this.patrol.x += (dx / dist) * step;
        this.patrol.z += (dz / dist) * step;
      } else {
        this.moving = false; // turn on the spot first
      }
      return;
    }
    this.moving = false;
    this.turnBy(yawToward(this.x, this.z, this.look[0], this.look[1]), dt, turnRate);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.mode = 'patrol';
      this.immune = 0.6;
      this.patrol.resumeAt(this.resumeIdx.distract);
    }
  }

  private startRush(): void {
    const cur = this.x >= 0 ? AISLE_X : -AISLE_X; // the aisle (or lane side) she is on now
    const tx = SEATING.aisleX(cur > 0 ? 1 : -1); // the aisle next to your desk
    this.side = tx > 0 ? 1 : -1;
    this.path.length = 0;
    const outer = Math.abs(this.x) > OUTER_LANE_X;
    const front = this.z < FRONT_ZONE_Z;
    // from an outer lane (x beyond the neighbours' desks) go up that lane first, never through the desks
    if (outer && this.z > OUTER_FRONT_Z) this.path.push([this.x, OUTER_FRONT_Z]);
    if (outer) this.path.push([cur, AISLE_TOP_Z]);
    // inside the desk rows and in the wrong aisle: back out to the top first
    else if (!front && cur !== tx) this.path.push([this.x, AISLE_TOP_Z]);
    if (outer || front || cur !== tx) this.path.push([tx, AISLE_TOP_Z]);
    this.path.push([tx, SEATING.standZ]);
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
    this.patrol.resumeAt(this.side === 1 ? this.resumeIdx.right : this.resumeIdx.left);
  }

  private turnTo(desired: number, dt: number): void {
    this.turnBy(desired, dt, this.tuning.rushTurnRate);
  }

  private turnBy(desired: number, dt: number, rate: number): void {
    const diff = wrapAngle(desired - this.patrol.yaw);
    const step = rate * dt;
    this.patrol.yaw = wrapAngle(Math.abs(diff) <= step ? desired : this.patrol.yaw + Math.sign(diff) * step);
  }
}
