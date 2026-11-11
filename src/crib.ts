/**
 * Pure crib-sheet logic (no three.js). A scrap of study NOTES lives in a tray under your desk.
 * Grab it (pinch / trigger) and it is in your hand. Hold it UP above the desk and look at it to read the
 * notes, but the teacher can see it up there. Tuck it back under the desk to hide it. If you let go
 * anywhere else it drops (onto the desk or the floor) and sits there in plain sight until you grab it again.
 *
 *   tray --grab--> held --release under the desk--> tray
 *                  held --release anywhere else--> falling --lands--> rest --grab--> held
 *   held above the desk, falling or resting = evidence; confiscate() while evidence --> gone
 */
export interface CribRules {
  /** how many of the questions are on the sheet */
  count: number;
  /** how long you must keep looking at it (held up) before the writing is readable */
  readSeconds: number;
}

export type CribState = 'tray' | 'held' | 'falling' | 'rest' | 'gone';

/** room-local meters. The desk top surface is y 0.775; its footprint is x +-0.5, z -0.85..-0.25 */
export const DESK_TOP_Y = 0.775;
export const EVIDENCE_Y = 0.75; // held at or above this height = the teacher can see it
export const READ_Y = 0.9; // held at or above this height you can read it (you have to lift it up)
export const FLOOR_Y = 0.03;
const TUCK_Y = 0.74; // let go below this, inside the tuck zone, and it goes back in the tray
const TUCK = { x: 0.55, z0: -0.85, z1: 0.25 };
const DESK = { x: 0.5, z0: -0.85, z1: -0.25 };
const ROOM_REACH = { x: 0.95, z0: -0.95, z1: 0.5 }; // a dropped sheet lands inside this box (so it can be reached)

// Around the desk the held sheet is either UNDER it (flat, below the underside at y 0.725) or OVER all the clutter on it
// (the exam easel reaches y 1.02, the lunchbox lid about 0.95), never through any of it. The zone is the desk widened by
// the sheet's own half size (0.13 x 0.17). Which side it is on is decided when it is outside the zone, so to bring a
// sheet from the tray onto the desk you lift it before you reach over, and to hide it you lower it before reaching in.
const DESK_ZONE = { x: DESK.x + 0.13, z0: DESK.z0 - 0.17, z1: DESK.z1 + 0.17 };
export const UNDER_MAX_Y = 0.7;
export const OVER_MIN_Y = 1.12;
export const inDeskZone = (x: number, z: number): boolean => Math.abs(x) < DESK_ZONE.x && z > DESK_ZONE.z0 && z < DESK_ZONE.z1;

// your chair seat (0.42 x 0.42, top at y 0.475): a sheet dropped over it lands on it, not under it
const SEAT = { x: 0.23, z0: -0.02, z1: 0.42, top: 0.475 };
/** the height a sheet let go at (x, z) comes to rest at */
export const groundAt = (x: number, z: number): number =>
  Math.abs(x) < SEAT.x && z > SEAT.z0 && z < SEAT.z1 ? SEAT.top + 0.012 : FLOOR_Y;

/** let go over the desk: it floats up over the clutter, drifts off the desk edge toward you, then drops */
const GLIDE = { speed: 1.4, rise: 1.4, y: 1.12, z: -0.04, xMax: 0.3 };

export const overDesk = (x: number, z: number): boolean => Math.abs(x) < DESK.x && z > DESK.z0 && z < DESK.z1;
export const inTuckZone = (x: number, y: number, z: number): boolean => y < TUCK_Y && Math.abs(x) < TUCK.x && z > TUCK.z0 && z < TUCK.z1;

export class CribModel {
  state: CribState = 'tray';
  /** the study notes on the sheet, in a scrambled order (they are not tied to question numbers) */
  notes: string[] = [];
  looking = false;
  lookTimer = 0;
  /** number of separate times the sheet was read this round (for stats) */
  reads = 0;
  /** where the sheet is while held / falling / resting */
  x = 0;
  y = 0;
  z = 0;
  private vy = 0;
  private groundY = FLOOR_Y;
  /** drifting off the desk toward (tx, tz) before it drops */
  private gliding = false;
  private tx = 0;
  private tz = 0;
  /** held under the desk (true) or over it (false); only changes while the sheet is outside the desk zone */
  under = true;
  /** event counters so other systems can play a sound once per event */
  dropSeq = 0;
  landSeq = 0;
  tuckSeq = 0;
  private wasReading = false;

  constructor(
    readonly rules: CribRules,
    private readonly rng: () => number = Math.random,
  ) {}

  /** called when a round starts: copy down notes for SOME of this exam's questions, in random order */
  deal(allNotes: ReadonlyArray<string | undefined>): void {
    const have = allNotes.filter((n): n is string => !!n);
    for (let i = have.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [have[i], have[j]] = [have[j], have[i]];
    }
    this.notes = have.slice(0, Math.min(this.rules.count, have.length));
    this.reset();
  }

  reset(): void {
    this.state = 'tray';
    this.looking = false;
    this.lookTimer = 0;
    this.reads = 0;
    this.vy = 0;
    this.gliding = false;
    this.under = true;
    this.wasReading = false;
  }

  /** the player grabbed it (from the tray, the desk or the floor). Only works if it is not already moving or gone. */
  grab(): boolean {
    if (this.state !== 'tray' && this.state !== 'rest') return false;
    this.under = this.state === 'tray';
    this.state = 'held';
    this.lookTimer = 0;
    return true;
  }

  /** the height the held sheet may really have: never through the desk slab or the things standing on it */
  constrainHeld(x: number, y: number, z: number): number {
    if (!inDeskZone(x, z)) {
      this.under = y < TUCK_Y;
      return y;
    }
    return this.under ? Math.min(y, UNDER_MAX_Y) : Math.max(y, OVER_MIN_Y);
  }

  /** while held, the system tells us where the hand has it */
  setHeld(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /** the player let go. Returns where it went: 'tray' (tucked away) or 'falling'. */
  release(x: number, y: number, z: number): 'tray' | 'falling' | null {
    if (this.state !== 'held') return null;
    this.looking = false;
    this.lookTimer = 0;
    this.wasReading = false;
    if (inTuckZone(x, y, z)) {
      this.state = 'tray';
      this.tuckSeq += 1;
      return 'tray';
    }
    this.x = Math.max(-ROOM_REACH.x, Math.min(ROOM_REACH.x, x));
    this.z = Math.max(ROOM_REACH.z0, Math.min(ROOM_REACH.z1, z));
    this.y = y;
    this.vy = 0;
    if (inDeskZone(this.x, this.z) && y >= TUCK_Y) {
      // above the desk: it must not drop onto the lunchbox, the easel or the phone, so it drifts off the edge first
      this.gliding = true;
      this.tx = Math.max(-GLIDE.xMax, Math.min(GLIDE.xMax, this.x));
      this.tz = GLIDE.z;
      this.groundY = groundAt(this.tx, this.tz);
    } else {
      this.gliding = false;
      this.groundY = groundAt(this.x, this.z);
    }
    this.state = 'falling';
    this.dropSeq += 1;
    return 'falling';
  }

  /** is the writing readable right now? */
  get reading(): boolean {
    return this.state === 'held' && this.y >= READ_Y && this.looking && this.lookTimer >= this.rules.readSeconds;
  }

  /** the teacher can see it: held up above the desk, falling, or lying around */
  get evidence(): boolean {
    if (this.state === 'held') return this.y >= EVIDENCE_Y;
    return this.state === 'falling' || this.state === 'rest';
  }

  /** returns true on the frame a new read starts (so the caller can play a sound / count it) */
  update(dt: number, gazeOnSheet: boolean): boolean {
    if (this.state === 'falling' && this.gliding) {
      // first up over everything on the desk, then sideways off the edge
      if (this.y < GLIDE.y) this.y = Math.min(GLIDE.y, this.y + GLIDE.rise * dt);
      else {
        const dx = this.tx - this.x;
        const dz = this.tz - this.z;
        const d = Math.hypot(dx, dz);
        const step = GLIDE.speed * dt;
        if (d <= step) {
          this.x = this.tx;
          this.z = this.tz;
          this.gliding = false;
        } else {
          this.x += (dx / d) * step;
          this.z += (dz / d) * step;
        }
      }
    } else if (this.state === 'falling') {
      // paper drifts down slowly (air drag caps the fall speed)
      this.vy = Math.max(this.vy - 7 * dt, -1.5);
      this.y += this.vy * dt;
      if (this.y <= this.groundY) {
        this.y = this.groundY;
        this.vy = 0;
        this.state = 'rest';
        this.landSeq += 1;
      }
    }
    this.looking = gazeOnSheet && this.state === 'held' && this.y >= READ_Y;
    if (this.looking) this.lookTimer += dt;
    else this.lookTimer = 0;
    const r = this.reading;
    const started = r && !this.wasReading;
    if (started) this.reads += 1;
    this.wasReading = r;
    return started;
  }

  /** the teacher caught you with it out */
  confiscate(): boolean {
    if (!this.evidence) return false;
    this.state = 'gone';
    this.looking = false;
    this.lookTimer = 0;
    this.wasReading = false;
    return true;
  }
}
