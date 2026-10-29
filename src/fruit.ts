/**
 * Pure fruit-throw logic (no three.js).
 *
 *   idle --pick()--> carrying --throwTo(zone)--> flying --(flight seconds)--> landed (event) --> idle
 *   carrying --pick()--> idle (put it back, nothing spent)
 * Each throw spends one fruit from the round's stock.
 */
export type FruitState = 'idle' | 'carrying' | 'flying';

export interface FruitRules {
  stock: number;
  flightSeconds: number;
  kinds: number; // how many different fruit shapes exist
}

export class FruitModel {
  state: FruitState = 'idle';
  stock: number;
  /** which fruit is in hand / in the air */
  kind = 0;
  /** zone being thrown at (0 left, 1 right) */
  zone = 0;
  /** 0..1 progress of the current flight */
  progress = 0;
  private landedZone = -1;
  private landedKind = 0;

  constructor(
    private readonly rules: FruitRules,
    private readonly rng: () => number = Math.random,
  ) {
    this.stock = rules.stock;
  }

  reset(): void {
    this.state = 'idle';
    this.stock = this.rules.stock;
    this.progress = 0;
    this.landedZone = -1;
  }

  /** press the bowl: grab a random fruit, or put the one in hand back */
  pick(): boolean {
    if (this.state === 'carrying') {
      this.state = 'idle';
      return true;
    }
    if (this.state !== 'idle' || this.stock <= 0) return false;
    this.kind = Math.floor(this.rng() * this.rules.kinds) % this.rules.kinds;
    this.state = 'carrying';
    return true;
  }

  throwTo(zone: 0 | 1): boolean {
    if (this.state !== 'carrying') return false;
    this.stock -= 1;
    this.zone = zone;
    this.progress = 0;
    this.state = 'flying';
    return true;
  }

  update(dt: number): void {
    if (this.state !== 'flying') return;
    this.progress = Math.min(1, this.progress + dt / this.rules.flightSeconds);
    if (this.progress >= 1) {
      this.landedZone = this.zone;
      this.landedKind = this.kind;
      this.state = 'idle';
    }
  }

  /** returns the zone a fruit just landed in (once), or -1 */
  takeLanded(): { zone: number; kind: number } | null {
    if (this.landedZone < 0) return null;
    const out = { zone: this.landedZone, kind: this.landedKind };
    this.landedZone = -1;
    return out;
  }
}
