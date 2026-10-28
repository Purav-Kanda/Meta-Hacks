/**
 * Pure peek logic (no three.js). Two neighbors, index 0 = left kid, 1 = right kid.
 * Each neighbor's answer for the current question is rolled once per question:
 * right with probability `accuracy`, otherwise a random wrong option.
 */
export interface PeekRules {
  accuracy: number;
  glanceSeconds: number;
  dodgeSeconds: number;
  hideSlots: number; // how many spots the HIDE button can jump between
}

export type Side = 0 | 1;

export class PeekModel {
  /** answer each neighbor has for the current question (0-2), -1 = none yet */
  readonly shown: [number, number] = [-1, -1];
  /** side whose PEEK bubble is showing, or -1 */
  bubble: -1 | Side = -1;
  /** side whose note is open (you are holding a peek out = evidence), or -1 */
  note: -1 | Side = -1;
  /** false right after a new question: the note is still open but must be re-read */
  noteRead = false;
  hideSlot = 0;

  private glanceTimer = 0;
  private glanceSide = -1;
  private dodgeTimer = 0;

  constructor(
    private readonly rules: PeekRules,
    private readonly rng: () => number = Math.random,
  ) {}

  /** call whenever the question on screen changes (or the exam starts) */
  newQuestion(correct: number): void {
    for (let s = 0; s < 2; s++) {
      if (this.rng() < this.rules.accuracy) {
        this.shown[s] = correct;
      } else {
        const wrong = [0, 1, 2].filter((i) => i !== correct);
        this.shown[s] = wrong[Math.min(1, Math.floor(this.rng() * 2))];
      }
    }
    this.noteRead = false;
  }

  reset(): void {
    this.shown[0] = this.shown[1] = -1;
    this.bubble = -1;
    this.note = -1;
    this.noteRead = false;
    this.hideSlot = 0;
    this.glanceTimer = 0;
    this.glanceSide = -1;
    this.dodgeTimer = 0;
  }

  /** is a cheat out? (feeds the teacher's evidence) */
  get evidence(): boolean {
    return this.note !== -1;
  }

  /** the letter index on the note, or -1 when it has not been read for this question */
  get noteAnswer(): number {
    return this.note !== -1 && this.noteRead ? this.shown[this.note] : -1;
  }

  /**
   * lookSide: which neighbor the head is turned toward (-1 none).
   * rushing: the teacher is charging at you, so HIDE starts dodging.
   */
  update(dt: number, lookSide: -1 | Side, rushing: boolean): void {
    if (lookSide === -1) {
      this.glanceTimer = 0;
      this.glanceSide = -1;
      this.bubble = -1;
    } else {
      if (lookSide !== this.glanceSide) {
        this.glanceSide = lookSide;
        this.glanceTimer = 0;
        this.bubble = -1;
      }
      this.glanceTimer += dt;
      if (this.glanceTimer >= this.rules.glanceSeconds) this.bubble = lookSide;
    }

    if (this.note !== -1 && rushing) {
      this.dodgeTimer += dt;
      if (this.dodgeTimer >= this.rules.dodgeSeconds) {
        this.dodgeTimer = 0;
        const n = this.rules.hideSlots;
        this.hideSlot = (this.hideSlot + 1 + Math.floor(this.rng() * (n - 1))) % n;
      }
    } else {
      this.dodgeTimer = 0;
      if (this.note === -1 || !rushing) this.hideSlot = 0;
    }
  }

  /** player pressed the PEEK bubble on `side`. Returns true if it worked. */
  peek(side: Side): boolean {
    if (this.bubble !== side) return false;
    this.note = side;
    this.noteRead = true;
    return true;
  }

  /** player pressed HIDE. */
  hide(): boolean {
    if (this.note === -1) return false;
    this.note = -1;
    this.noteRead = false;
    this.hideSlot = 0;
    this.dodgeTimer = 0;
    return true;
  }
}
