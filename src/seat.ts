/**
 * Seat draw (pure logic, no three.js). Each round you are assigned one of the six desks and really move there
 * (see seating.ts for how the classmates shuffle). Where you sit changes your luck a little: corner seats have one
 * less neighbor to copy from, the front row is right under her nose, and the back row is far from her but the
 * kids around you guess more.
 */
export interface Seat {
  id: 'frontL' | 'frontM' | 'frontR' | 'backL' | 'backM' | 'backR';
  name: string;
  /** 0 = front row, 1 = back row; col 0 = left .. 2 = right */
  row: number;
  col: number;
  /** is there a classmate on your left / right? */
  left: boolean;
  right: boolean;
  /** multiplies how far the teacher can see you */
  vision: number;
  /** multiplies how often a neighbor's answer is right */
  peek: number;
  /** 1 good line and 1 bad line for the reveal card */
  good: string;
  bad: string;
  weight: number;
}

const FRONT = { vision: 1.2, peek: 1 };
const BACK = { vision: 0.85, peek: 0.85 };
const CORNER = 0.9; // fewer eyes on a corner seat

export const SEATS: readonly Seat[] = [
  { id: 'frontL', name: 'FRONT LEFT', row: 0, col: 0, left: false, right: true, vision: FRONT.vision * CORNER, peek: FRONT.peek, good: 'a corner: fewer eyes on you', bad: 'only 1 neighbor, and right under her nose', weight: 1.5 },
  { id: 'frontM', name: 'FRONT MIDDLE', row: 0, col: 1, left: true, right: true, vision: FRONT.vision, peek: FRONT.peek, good: 'two neighbors to copy from', bad: 'right under her nose: she sees further', weight: 2 },
  { id: 'frontR', name: 'FRONT RIGHT', row: 0, col: 2, left: true, right: false, vision: FRONT.vision * CORNER, peek: FRONT.peek, good: 'a corner: fewer eyes on you', bad: 'only 1 neighbor, and right under her nose', weight: 1.5 },
  { id: 'backL', name: 'BACK LEFT', row: 1, col: 0, left: false, right: true, vision: BACK.vision * CORNER, peek: BACK.peek, good: 'far corner: she barely sees you', bad: 'only 1 neighbor, and they guess more', weight: 1.5 },
  { id: 'backM', name: 'BACK MIDDLE', row: 1, col: 1, left: true, right: true, vision: BACK.vision, peek: BACK.peek, good: 'two neighbors, she sees you less', bad: 'the kids back here guess more', weight: 2 },
  { id: 'backR', name: 'BACK RIGHT', row: 1, col: 2, left: true, right: false, vision: BACK.vision * CORNER, peek: BACK.peek, good: 'far corner: she barely sees you', bad: 'only 1 neighbor, and they guess more', weight: 1.5 },
];

export function seatById(id: Seat['id']): Seat {
  return SEATS.find((s) => s.id === id) ?? SEATS[4];
}

/** weighted random seat, never the same one twice in a row */
export function pickSeat(rng: () => number, lastId = ''): Seat {
  const pool = SEATS.filter((s) => s.id !== lastId);
  const total = pool.reduce((a, s) => a + s.weight, 0);
  let r = rng() * total;
  for (const s of pool) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return pool[pool.length - 1];
}

/** the live assignment. The exam draws it at the start of a round; SeatSystem plays the draw animation. */
export const SEAT = {
  current: SEATS[4] as Seat,
  /** bumps on every new draw */
  seq: 0,
  /** true while the draw card is up (the exam clock and answers wait) */
  holding: false,
  /** the player clicked to skip the reveal */
  skip: false,
  draw(rng: () => number = Math.random): Seat {
    this.current = pickSeat(rng, this.current.id);
    this.seq += 1;
    this.holding = true;
    this.skip = false;
    return this.current;
  },
  /** a fixed seat without the draw (Training Day) */
  set(id: Seat['id']): void {
    this.current = seatById(id);
    this.seq += 1;
    this.holding = false;
    this.skip = false;
  },
  finish(): void {
    this.holding = false;
  },
};

/** how many classmates sit next to you */
export const neighborCount = (s: Seat): number => (s.left ? 1 : 0) + (s.right ? 1 : 0);
