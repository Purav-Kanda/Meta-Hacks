/**
 * Pure peek logic (no three.js). Two neighbors, index 0 = left kid, 1 = right kid.
 * You tap a neighbor's shoulder: after a short beat they either share their paper (it counts as
 * evidence while it is out) or refuse and sulk. Each neighbor's answer for the current question is
 * rolled once per question: right with probability `accuracy`, otherwise a random wrong option.
 */
export interface PeekRules {
  accuracy: number;
  refuseChance: number; // chance a tap gets "NOPE"
  askSeconds: number; // how long they take to find the same question on their paper (about, +-20%)
  decideSeconds: number; // they decide to help or refuse this soon after your tap
  refuseSeconds: number; // how long the NOPE shows
  shareSeconds: number; // the paper pulls itself back after this long
  panicSeconds: number; // ...or after this long of the teacher charging
  sulkSeconds: number; // a kid who refused ignores you this long
  maxTaps: number; // shoulder taps you get per round (99 = no limit)
}

export type Side = 0 | 1;
export type KidState = 'idle' | 'asking' | 'sharing' | 'refusing' | 'sulking';
export type TapResult = 'asking' | 'retract' | 'ignored' | 'empty';

export class PeekModel {
  /** answer each neighbor has for the current question (0-2), -1 = none yet */
  readonly shown: [number, number] = [-1, -1];
  readonly state: [KidState, KidState] = ['idle', 'idle'];
  /** event counters so other systems can react once per event */
  shareSeq = 0;
  refuseSeq = 0;
  retractSeq = 0;
  lastRefuseSide: Side = 0;
  /** shoulder taps left this round (a tap that starts an ask costs one, even if they refuse) */
  tapsLeft = 0;

  private readonly timer: [number, number] = [0, 0];
  private readonly panic: [number, number] = [0, 0];
  private readonly askTarget: [number, number] = [0, 0];
  private readonly decided: [boolean, boolean] = [false, false];

  constructor(
    readonly rules: PeekRules,
    private readonly rng: () => number = Math.random,
  ) {
    this.tapsLeft = rules.maxTaps;
  }

  /** call whenever the question on screen changes (or the exam starts) */
  newQuestion(correct: number): void {
    for (let s = 0; s < 2; s++) {
      if (this.rng() < this.rules.accuracy) {
        this.shown[s] = correct;
      } else {
        const wrong = [0, 1, 2].filter((i) => i !== correct);
        this.shown[s] = wrong[Math.min(1, Math.floor(this.rng() * 2))];
      }
      // an out paper goes back (it belongs to the old question); a pending ask is dropped
      if (this.state[s] === 'sharing') {
        this.retractSeq += 1;
        this.state[s] = 'idle';
      } else if (this.state[s] === 'asking') {
        this.state[s] = 'idle';
      }
    }
  }

  reset(): void {
    this.tapsLeft = this.rules.maxTaps;
    this.shown[0] = this.shown[1] = -1;
    this.state[0] = this.state[1] = 'idle';
    this.timer[0] = this.timer[1] = 0;
    this.panic[0] = this.panic[1] = 0;
  }

  /** is a neighbor's paper out? (feeds the teacher's evidence) */
  get evidence(): boolean {
    return this.state[0] === 'sharing' || this.state[1] === 'sharing';
  }

  /** the side whose paper is out, or -1 */
  get sharingSide(): -1 | Side {
    return this.state[0] === 'sharing' ? 0 : this.state[1] === 'sharing' ? 1 : -1;
  }

  /** the player tapped a neighbor's shoulder */
  tap(side: Side): TapResult {
    const st = this.state[side];
    if (st === 'idle') {
      if (this.tapsLeft <= 0) return 'empty';
      this.tapsLeft -= 1;
      this.state[side] = 'asking';
      this.timer[side] = 0;
      this.decided[side] = false;
      this.askTarget[side] = this.rules.askSeconds * (0.8 + 0.4 * this.rng());
      return 'asking';
    }
    if (st === 'sharing') {
      this.state[side] = 'idle';
      this.retractSeq += 1;
      return 'retract';
    }
    return 'ignored';
  }

  update(dt: number, rushing: boolean): void {
    for (let s = 0; s < 2; s++) {
      const side = s as Side;
      const st = this.state[s];
      if (st === 'idle') continue;
      this.timer[s] += dt;
      if (st === 'asking') {
        if (!this.decided[s] && this.timer[s] >= this.rules.decideSeconds) {
          this.decided[s] = true;
          if (this.rng() < this.rules.refuseChance) {
            this.state[s] = 'refusing';
            this.timer[s] = 0;
            this.refuseSeq += 1;
            this.lastRefuseSide = side;
          }
        } else if (this.decided[s] && this.timer[s] >= this.askTarget[s]) {
          // found the matching question: the paper comes over
          this.timer[s] = 0;
          this.panic[s] = 0;
          this.state[s] = 'sharing';
          this.shareSeq += 1;
        }
      } else if (st === 'sharing') {
        this.panic[s] = rushing ? this.panic[s] + dt : 0;
        if (this.timer[s] >= this.rules.shareSeconds || this.panic[s] >= this.rules.panicSeconds) {
          this.state[s] = 'idle';
          this.retractSeq += 1;
        }
      } else if (st === 'refusing') {
        if (this.timer[s] >= this.rules.refuseSeconds) {
          this.state[s] = 'sulking';
          this.timer[s] = 0;
        }
      } else if (this.timer[s] >= this.rules.sulkSeconds) {
        this.state[s] = 'idle';
      }
    }
  }
}
