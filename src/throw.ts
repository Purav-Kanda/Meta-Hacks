/**
 * Pure throwing maths (no three.js): measure how fast the hand was moving when it let go,
 * nudge that throw toward a sensible target (aim assist), fly it under gravity, and decide
 * what the landing spot means for the teacher. All positions are room-space meters.
 */
export const GRAVITY = 9.8;
export const FLOOR_Y = 0.05;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** keeps the last few hand positions; velocity() is the hand's average velocity over the last ~0.15 s */
export class VelocityTracker {
  private readonly t: number[] = [];
  private readonly x: number[] = [];
  private readonly y: number[] = [];
  private readonly z: number[] = [];
  private n = 0;
  private head = 0;

  constructor(
    private readonly capacity = 16,
    private readonly windowSeconds = 0.15,
    private readonly maxSpeed = 8,
  ) {
    for (let i = 0; i < capacity; i++) {
      this.t.push(0);
      this.x.push(0);
      this.y.push(0);
      this.z.push(0);
    }
  }

  clear(): void {
    this.n = 0;
    this.head = 0;
  }

  push(time: number, x: number, y: number, z: number): void {
    this.t[this.head] = time;
    this.x[this.head] = x;
    this.y[this.head] = y;
    this.z[this.head] = z;
    this.head = (this.head + 1) % this.capacity;
    this.n = Math.min(this.n + 1, this.capacity);
  }

  /** writes the velocity into `out` and returns its speed */
  velocity(out: Vec3): number {
    out.x = out.y = out.z = 0;
    if (this.n < 2) return 0;
    const last = (this.head - 1 + this.capacity) % this.capacity;
    let first = last;
    for (let k = 1; k < this.n; k++) {
      const i = (last - k + this.capacity) % this.capacity;
      if (this.t[last] - this.t[i] > this.windowSeconds) break;
      first = i;
    }
    const dt = this.t[last] - this.t[first];
    if (dt < 0.02) return 0;
    out.x = (this.x[last] - this.x[first]) / dt;
    out.y = (this.y[last] - this.y[first]) / dt;
    out.z = (this.z[last] - this.z[first]) / dt;
    const sp = Math.hypot(out.x, out.y, out.z);
    if (sp > this.maxSpeed) {
      const k = this.maxSpeed / sp;
      out.x *= k;
      out.y *= k;
      out.z *= k;
      return this.maxSpeed;
    }
    return sp;
  }
}

/**
 * Aim assist: if the throw is heading roughly toward one of the targets (floor points), bend the
 * velocity toward the ballistic solution that would land right on it. `strength` 0..1 (0 = none).
 * Throws pointed well away from every target are left alone.
 */
export function assistVelocity(
  pos: Vec3,
  vel: Vec3,
  targets: ReadonlyArray<readonly [number, number]>,
  strength: number,
  out: Vec3,
): Vec3 {
  out.x = vel.x;
  out.y = vel.y;
  out.z = vel.z;
  const vh = Math.hypot(vel.x, vel.z);
  if (strength <= 0 || vh < 1) return out;
  let best = -1;
  let bestAngle = 0.62; // ~35 degrees either side
  for (let i = 0; i < targets.length; i++) {
    const dx = targets[i][0] - pos.x;
    const dz = targets[i][1] - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) continue;
    const cos = (dx * vel.x + dz * vel.z) / (d * vh);
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (ang < bestAngle) {
      bestAngle = ang;
      best = i;
    }
  }
  if (best < 0) return out;
  const tx = targets[best][0];
  const tz = targets[best][1];
  const dist = Math.hypot(tx - pos.x, tz - pos.z);
  const flight = dist / Math.min(7, Math.max(3, vh));
  const sx = (tx - pos.x) / flight;
  const sz = (tz - pos.z) / flight;
  const sy = (FLOOR_Y - pos.y + 0.5 * GRAVITY * flight * flight) / flight;
  const s = Math.min(1, strength) * (1 - bestAngle / 0.62);
  out.x = vel.x + (sx - vel.x) * s;
  out.y = vel.y + (sy - vel.y) * s;
  out.z = vel.z + (sz - vel.z) * s;
  return out;
}

export interface Bounds {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  yMax: number;
}

export const ROOM_BOUNDS: Bounds = { xMin: -3.85, xMax: 3.85, zMin: -5.85, zMax: 1.85, yMax: 2.8 };

/** a fruit in flight. step() returns true the moment it first touches the floor. */
export class Projectile {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  active = false;
  /** speed at the moment of landing */
  impact = 0;

  constructor(private readonly bounds: Bounds = ROOM_BOUNDS) {}

  launch(p: Vec3, v: Vec3): void {
    this.x = p.x;
    this.y = p.y;
    this.z = p.z;
    this.vx = v.x;
    this.vy = v.y;
    this.vz = v.z;
    this.active = true;
    this.impact = 0;
  }

  step(dt: number): boolean {
    if (!this.active) return false;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      this.vy -= GRAVITY * h;
      this.x += this.vx * h;
      this.y += this.vy * h;
      this.z += this.vz * h;
      const b = this.bounds;
      if (this.x < b.xMin || this.x > b.xMax) {
        this.x = Math.max(b.xMin, Math.min(b.xMax, this.x));
        this.vx *= -0.45;
      }
      if (this.z < b.zMin || this.z > b.zMax) {
        this.z = Math.max(b.zMin, Math.min(b.zMax, this.z));
        this.vz *= -0.45;
      }
      if (this.y > b.yMax) {
        this.y = b.yMax;
        this.vy = Math.min(0, this.vy) * 0.4;
      }
      if (this.y <= FLOOR_Y && this.vy < 0) {
        this.y = FLOOR_Y;
        this.impact = Math.hypot(this.vx, this.vy, this.vz);
        this.active = false;
        return true;
      }
    }
    return false;
  }
}

// the teacher's desk blocks the front-right; the desk rows start at z = -2.9
const TEACHER_DESK = { x0: 1.5, x1: 3.3, z0: -5.3, z1: -4.3 };
const FRONT_LIMIT_Z = -3.0;
const FRONT_LIMIT_X = 3.7;

/** 'front' = open floor she can walk to and investigate; 'wasted' = desks/behind you/her desk */
export function classifyLanding(x: number, z: number): 'front' | 'wasted' {
  if (z > FRONT_LIMIT_Z || Math.abs(x) > FRONT_LIMIT_X || z < -5.7) return 'wasted';
  if (x > TEACHER_DESK.x0 && x < TEACHER_DESK.x1 && z > TEACHER_DESK.z0 && z < TEACHER_DESK.z1) return 'wasted';
  return 'front';
}

/** where she stands to look at a fruit: about 1.1 m short of it, toward the middle of the front */
export function standPoint(landX: number, landZ: number, out: [number, number]): [number, number] {
  const hx = 0 - landX;
  const hz = -3.9 - landZ;
  const d = Math.hypot(hx, hz);
  let sx = landX;
  let sz = landZ;
  if (d > 1.1) {
    sx = landX + (hx / d) * 1.1;
    sz = landZ + (hz / d) * 1.1;
  }
  out[0] = Math.max(-3.5, Math.min(3.5, sx));
  out[1] = Math.min(-3.4, sz);
  return out;
}
