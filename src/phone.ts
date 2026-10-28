/**
 * Pure phone logic (no three.js).
 *
 *   pocket --raise()--> up --ask()--> buffering --(2-4 s)--> answer shown --> cooldown
 *   up/buffering --hide()--> pocket           (hiding mid-buffer wastes it and starts the cooldown)
 *   up --confiscate()--> gone                 (teacher caught you with it: unusable for the rest of the exam)
 *
 * While the phone is up it glows, which counts as evidence (and the teacher sees farther).
 */
export type PhoneState = 'pocket' | 'up' | 'gone';

export interface PhoneRules {
  bufferMin: number;
  bufferMax: number;
  cooldown: number;
  dodgeSeconds: number;
  hideSlots: number;
}

export class PhoneModel {
  state: PhoneState = 'pocket';
  /** seconds of buffering left, 0 when not buffering */
  bufferLeft = 0;
  /** seconds until it can be asked again */
  cooldownLeft = 0;
  /** answer on screen (0-2) for the current question, -1 none */
  answer = -1;
  hideSlot = 0;
  private dodgeTimer = 0;

  constructor(
    private readonly rules: PhoneRules,
    private readonly rng: () => number = Math.random,
  ) {}

  get buffering(): boolean {
    return this.bufferLeft > 0;
  }
  /** can the ASK button do anything right now? */
  get canAsk(): boolean {
    return this.state === 'up' && !this.buffering && this.cooldownLeft <= 0 && this.answer === -1;
  }
  /** glowing phone = a cheat is out */
  get evidence(): boolean {
    return this.state === 'up';
  }

  reset(): void {
    this.state = 'pocket';
    this.bufferLeft = 0;
    this.cooldownLeft = 0;
    this.answer = -1;
    this.hideSlot = 0;
    this.dodgeTimer = 0;
  }

  /** the question on screen changed: an old answer is stale */
  newQuestion(): void {
    this.answer = -1;
  }

  raise(): boolean {
    if (this.state !== 'pocket') return false;
    this.state = 'up';
    return true;
  }

  ask(): boolean {
    if (!this.canAsk) return false;
    this.bufferLeft = this.rules.bufferMin + this.rng() * (this.rules.bufferMax - this.rules.bufferMin);
    return true;
  }

  hide(): boolean {
    if (this.state !== 'up') return false;
    if (this.buffering) {
      // gave up mid-lag: no answer, but the cooldown still starts
      this.bufferLeft = 0;
      this.cooldownLeft = this.rules.cooldown;
    }
    this.state = 'pocket';
    this.hideSlot = 0;
    this.dodgeTimer = 0;
    return true;
  }

  confiscate(): void {
    if (this.state !== 'up') return;
    this.state = 'gone';
    this.bufferLeft = 0;
    this.answer = -1;
    this.hideSlot = 0;
    this.dodgeTimer = 0;
  }

  /** correct = right option of the question on screen. rushing = teacher charging. */
  update(dt: number, correct: number, rushing: boolean): void {
    if (this.cooldownLeft > 0) this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
    if (this.buffering && this.state === 'up') {
      this.bufferLeft -= dt;
      if (this.bufferLeft <= 0) {
        this.bufferLeft = 0;
        this.answer = correct;
        this.cooldownLeft = this.rules.cooldown;
      }
    }
    if (this.state === 'up' && rushing) {
      this.dodgeTimer += dt;
      if (this.dodgeTimer >= this.rules.dodgeSeconds) {
        this.dodgeTimer = 0;
        const n = this.rules.hideSlots;
        this.hideSlot = (this.hideSlot + 1 + Math.floor(this.rng() * (n - 1))) % n;
      }
    } else {
      this.dodgeTimer = 0;
      this.hideSlot = 0;
    }
  }
}
