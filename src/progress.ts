/**
 * Progression (pure logic, no three.js): the letter grade, per-round stats, stickers (achievements)
 * and the best scores. Saving goes through a tiny storage interface so it can be tested and so a blocked
 * localStorage (private window, thumbnail capture) never breaks the game.
 */
export type Mode = 'tutorial' | 'easy' | 'notEasy' | 'rush' | 'endless' | 'challenge' | 'week';

export interface RoundStats {
  mode: Mode;
  score: number;
  total: number;
  warnings: number;
  caught: boolean;
  passed: boolean;
  peeks: number; // PEEK taps that worked
  phoneAsks: number; // ASK taps that worked
  cribReads: number; // times you read the crib sheet
  fruitThrown: number;
  fruitHitTeacher: number;
  hidInTime: number; // times she arrived and found nothing
  day: number; // School Week day (1-5), else 0
  challengeId: string;
  goalMet: boolean; // challenge goal reached / week day cleared
  note: string; // a line for the report card ("CHALLENGE COMPLETE", "DAY 2 CLEARED")
}

export function emptyStats(mode: Mode = 'easy'): RoundStats {
  return { mode, score: 0, total: 10, warnings: 0, caught: false, passed: false, peeks: 0, phoneAsks: 0, cribReads: 0, fruitThrown: 0, fruitHitTeacher: 0, hidInTime: 0, day: 0, challengeId: '', goalMet: false, note: '' };
}

/** the live counters for the round being played; systems add to these, the exam resets them on start */
export const roundStats: RoundStats = emptyStats();

export function resetRound(mode: Mode): void {
  Object.assign(roundStats, emptyStats(mode));
}

export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

/** grade from the share of right answers; being caught is always an F */
export function gradeFor(score: number, total: number, caught: boolean): Grade {
  if (caught || total <= 0) return 'F';
  const p = score / total;
  if (p >= 1) return 'A+';
  if (p >= 0.9) return 'A';
  if (p >= 0.8) return 'B';
  if (p >= 0.7) return 'C';
  if (p >= 0.6) return 'D';
  return 'F';
}

const GRADE_RANK: Record<Grade, number> = { F: 0, D: 1, C: 2, B: 3, A: 4, 'A+': 5 };
export const betterGrade = (a: Grade, b: Grade): boolean => GRADE_RANK[a] > GRADE_RANK[b];

export interface Sticker {
  id: string;
  name: string;
  hint: string;
  test: (s: RoundStats) => boolean;
}

const cheatsUsed = (s: RoundStats): number => (s.peeks > 0 ? 1 : 0) + (s.phoneAsks > 0 ? 1 : 0) + (s.cribReads > 0 ? 1 : 0) + (s.fruitThrown > 0 ? 1 : 0);

export const STICKERS: readonly Sticker[] = [
  { id: 'honest', name: 'Honest Student', hint: 'Pass without cheating at all', test: (s) => s.passed && cheatsUsed(s) === 0 },
  { id: 'smooth', name: 'Smooth Operator', hint: 'Pass with no warnings after cheating', test: (s) => s.passed && s.warnings === 0 && cheatsUsed(s) > 0 },
  { id: 'triple', name: 'Triple Threat', hint: 'Use 3 different cheats in one exam', test: (s) => s.passed && cheatsUsed(s) >= 3 },
  { id: 'bullseye', name: 'Bullseye', hint: 'Hit the teacher with fruit', test: (s) => s.fruitHitTeacher > 0 },
  { id: 'foodfight', name: 'Food Fight', hint: 'Throw every fruit in one exam', test: (s) => s.fruitThrown >= 3 },
  { id: 'phew', name: 'Phew!', hint: 'Hide the evidence before she arrives', test: (s) => s.hidInTime > 0 },
  { id: 'rush', name: 'Speed Demon', hint: 'Pass the 60-Second Rush', test: (s) => s.mode === 'rush' && s.passed },
  { id: 'marathon', name: 'Marathoner', hint: 'Answer 15 right in Endless', test: (s) => s.mode === 'endless' && s.score >= 15 },
  { id: 'challenger', name: 'Challenge Accepted', hint: 'Beat a Cheat Challenge', test: (s) => s.mode === 'challenge' && s.goalMet },
  { id: 'weekdone', name: 'Straight A Week', hint: 'Clear all 5 days of School Week', test: (s) => s.mode === 'week' && s.day === 5 && s.goalMet },
  { id: 'perfect', name: 'Teacher’s Pet', hint: 'Score 10 out of 10', test: (s) => !s.caught && s.score === s.total },
  { id: 'notEasy', name: 'Not Easy Ace', hint: 'Pass on Not Easy', test: (s) => s.passed && s.mode === 'notEasy' },
];

export interface SaveData {
  best: Partial<Record<Mode, { score: number; grade: Grade }>>;
  stickers: string[];
  /** cheat challenges beaten (ids) */
  challenges: string[];
  /** next School Week day to play, 0-4 */
  weekDay: number;
  /** has finished Training Day once (the start menu stops saying START HERE) */
  tutorialDone: boolean;
}

export interface Store {
  get(): string | null;
  set(v: string): void;
}

/** localStorage, guarded: every access may throw */
export function browserStore(key = 'popquiz.v1'): Store {
  return {
    get() {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(v: string) {
      try {
        window.localStorage.setItem(key, v);
      } catch {
        /* progress just will not persist */
      }
    },
  };
}

export interface RoundResult {
  grade: Grade;
  score: number;
  total: number;
  newBest: boolean;
  newStickers: Sticker[];
}

export class Progress {
  data: SaveData = { best: {}, stickers: [], challenges: [], weekDay: 0, tutorialDone: false };

  constructor(private readonly store: Store) {
    this.load();
  }

  private load(): void {
    const raw = this.store.get();
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as Partial<SaveData>;
      this.data = {
        best: typeof d.best === 'object' && d.best ? d.best : {},
        stickers: Array.isArray(d.stickers) ? d.stickers.filter((x) => typeof x === 'string') : [],
        challenges: Array.isArray(d.challenges) ? d.challenges.filter((x) => typeof x === 'string') : [],
        weekDay: typeof d.weekDay === 'number' && d.weekDay >= 0 && d.weekDay < 5 ? Math.floor(d.weekDay) : 0,
        tutorialDone: d.tutorialDone === true,
      };
    } catch {
      /* corrupt save: start fresh */
    }
  }

  has(id: string): boolean {
    return this.data.stickers.includes(id);
  }

  /** score a finished round, update the best, award stickers, save */
  record(s: RoundStats): RoundResult {
    // Training Day is not scored: it just marks the lesson as done
    if (s.mode === 'tutorial') {
      if (!s.caught) this.data.tutorialDone = true;
      this.store.set(JSON.stringify(this.data));
      return { grade: 'A', score: s.score, total: s.total, newBest: false, newStickers: [] };
    }
    // endless has no "caught = fail": it always ends that way. Grade it on how far you got (20 right = A+).
    const endless = s.mode === 'endless';
    const grade = endless ? gradeFor(s.score, 20, false) : gradeFor(s.score, s.total, s.caught);
    const old = this.data.best[s.mode];
    const newBest = !old || s.score > old.score || (s.score === old.score && betterGrade(grade, old.grade));
    if (newBest && (endless || !s.caught)) this.data.best[s.mode] = { score: s.score, grade };
    const newStickers: Sticker[] = [];
    for (const st of STICKERS) {
      if (!this.has(st.id) && st.test(s)) {
        this.data.stickers.push(st.id);
        newStickers.push(st);
      }
    }
    if (s.mode === 'challenge' && s.goalMet && s.challengeId && !this.data.challenges.includes(s.challengeId)) this.data.challenges.push(s.challengeId);
    if (s.mode === 'week' && s.goalMet) this.data.weekDay = s.day >= 5 ? 0 : s.day;
    this.store.set(JSON.stringify(this.data));
    return { grade, score: s.score, total: s.total, newBest: newBest && (endless || !s.caught), newStickers };
  }
}
