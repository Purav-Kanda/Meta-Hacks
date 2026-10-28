import type { Question } from './questions.js';

export type ExamPhase = 'ready' | 'playing' | 'done';
export type ExamEnd = 'finished' | 'time' | 'caught';

/** Which cheats are currently "out" (visible evidence). Cheats set/clear their own name. */
export class EvidenceState {
  private readonly on = new Set<string>();
  set(source: string, active: boolean): void {
    if (active) this.on.add(source);
    else this.on.delete(source);
  }
  has(source: string): boolean {
    return this.on.has(source);
  }
  get active(): boolean {
    return this.on.size > 0;
  }
  clear(): void {
    this.on.clear();
  }
}

export interface ExamRules {
  passMark: number;
  seconds: number;
  maxWarnings: number;
}

/**
 * Pure exam state: no rendering, no input, no three.js. The VR layer in
 * exam-system.ts just reads this and calls start() / answer() / tick().
 */
export class ExamModel {
  phase: ExamPhase = 'ready';
  endedBy: ExamEnd | null = null;
  warnings = 0;
  readonly evidence = new EvidenceState();
  cursor = 0;
  secondsLeft: number;
  /** picked option per question, -1 = unanswered */
  picks: number[];

  constructor(
    readonly questions: readonly Question[],
    readonly rules: ExamRules,
  ) {
    this.secondsLeft = rules.seconds;
    this.picks = questions.map(() => -1);
  }

  start(): void {
    this.phase = 'playing';
    this.endedBy = null;
    this.warnings = 0;
    this.evidence.clear();
    this.cursor = 0;
    this.secondsLeft = this.rules.seconds;
    this.picks.fill(-1);
  }

  current(): Question {
    return this.questions[Math.min(this.cursor, this.questions.length - 1)];
  }

  /** the option index that is right for the question on screen (peek/phone will use this) */
  correctSlot(): number {
    return this.current().correct;
  }

  answer(slot: number): boolean {
    if (this.phase !== 'playing' || slot < 0 || slot > 2) return false;
    this.picks[this.cursor] = slot;
    this.cursor += 1;
    if (this.cursor >= this.questions.length) this.finish('finished');
    return true;
  }

  tick(dt: number): void {
    if (this.phase !== 'playing') return;
    this.secondsLeft = Math.max(0, this.secondsLeft - dt);
    if (this.secondsLeft === 0) this.finish('time');
  }

  /** the teacher caught you. Returns true if this warning ended the exam. */
  addWarning(): boolean {
    if (this.phase !== 'playing') return false;
    this.warnings += 1;
    if (this.warnings >= this.rules.maxWarnings) {
      this.finish('caught');
      return true;
    }
    return false;
  }

  private finish(reason: ExamEnd): void {
    this.phase = 'done';
    this.endedBy = reason;
    this.evidence.clear();
  }

  score(): number {
    let n = 0;
    for (let i = 0; i < this.questions.length; i++) {
      if (this.picks[i] === this.questions[i].correct) n += 1;
    }
    return n;
  }

  passed(): boolean {
    return this.endedBy !== 'caught' && this.score() >= this.rules.passMark;
  }

  answeredCount(): number {
    return this.picks.filter((p) => p >= 0).length;
  }
}
