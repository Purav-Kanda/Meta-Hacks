/**
 * Pure crib-sheet logic (no three.js). A scrap of study NOTES sticks out of a tray under your desk.
 * No grabbing: look down at it to read the notes. It takes a moment to read, and while you are looking
 * down at it (and for a moment after) the teacher can see you using it. If she warns you then, she takes it.
 *
 *   idle --look down--> looking --long enough--> reading (evidence the whole time)
 *   evidence while looking or for LINGER seconds after; confiscate() while evidence --> gone
 */
export interface CribRules {
  /** how many of the questions are on the sheet */
  count: number;
  /** how long you must keep looking down at it before the writing is readable */
  readSeconds: number;
}

export type CribState = 'tray' | 'gone';

/** the teacher still sees you for this long after you look away from the sheet */
export const LINGER = 1.0;

export class CribModel {
  state: CribState = 'tray';
  /** the study notes on the sheet, in a scrambled order (they are not tied to question numbers) */
  notes: string[] = [];
  looking = false;
  lookTimer = 0;
  /** seconds of "still visible" left after looking away */
  private linger = 0;
  /** number of separate times the sheet was read this round (for stats) */
  reads = 0;
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
    this.linger = 0;
    this.reads = 0;
    this.wasReading = false;
  }

  /** is the writing readable right now? */
  get reading(): boolean {
    return this.state === 'tray' && this.looking && this.lookTimer >= this.rules.readSeconds;
  }

  /** the teacher can see you using it: you are looking down at it, or just were */
  get evidence(): boolean {
    return this.state === 'tray' && (this.looking || this.linger > 0);
  }

  /** returns true on the frame a new read starts (so the caller can play a sound / count it) */
  update(dt: number, gazeOnSheet: boolean): boolean {
    this.looking = gazeOnSheet && this.state === 'tray';
    if (this.looking) {
      this.lookTimer += dt;
      this.linger = LINGER;
    } else {
      this.lookTimer = 0;
      this.linger = Math.max(0, this.linger - dt);
    }
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
    this.linger = 0;
    this.wasReading = false;
    return true;
  }
}
