/**
 * Game modes (pure logic, no three.js). A "round plan" says everything that makes one exam different:
 * which teacher numbers, how many questions, how long, which cheats are allowed. The exam system just
 * applies a plan; the rest of the game only asks ROUND.allows('phone') and the like.
 */
import type { Difficulty, Tuning } from './tuning.js';
import type { RoundStats } from './progress.js';

export type ModeId = 'tutorial' | 'easy' | 'notEasy' | 'rush' | 'endless' | 'challenge' | 'week';
export type Cheat = 'peek' | 'phone' | 'crib' | 'fruit';
const ALL_CHEATS: Cheat[] = ['peek', 'phone', 'crib', 'fruit'];

export interface RoundPlan {
  mode: ModeId;
  /** which numbers to start from, then multiplied by `intensity` (1 = as written) */
  base: Difficulty;
  intensity: number;
  overrides: Partial<Tuning>;
  questions: number;
  seconds: number;
  passMark: number;
  maxWarnings: number;
  /** endless only: this many wrong answers ends the round (0 = wrong answers do not end it) */
  maxWrong: number;
  endless: boolean;
  disabled: Cheat[];
  /** the card shown when the round starts */
  introTitle: string;
  introSub: string;
  challengeId: string;
  day: number; // 1-5 in School Week, else 0
}

const plan = (p: Partial<RoundPlan> & Pick<RoundPlan, 'mode'>): RoundPlan => ({
  base: 'easy',
  intensity: 1,
  overrides: {},
  questions: 10,
  seconds: 180,
  passMark: 7,
  maxWarnings: 3,
  maxWrong: 0,
  endless: false,
  disabled: [],
  introTitle: '',
  introSub: '',
  challengeId: '',
  day: 0,
  ...p,
});

// ---------------------------------------------------------------- challenges

export interface Challenge {
  id: string;
  name: string;
  brief: string;
  disabled: Cheat[];
  base: Difficulty;
  test: (s: RoundStats) => boolean;
}

const only = (c: Cheat): Cheat[] => ALL_CHEATS.filter((x) => x !== c);

export const CHALLENGES: readonly Challenge[] = [
  { id: 'fruit', name: 'Fruit Fiend', brief: 'Fruit only. Hit the teacher and pass.', disabled: only('fruit'), base: 'easy', test: (s) => s.passed && s.fruitHitTeacher >= 1 },
  { id: 'phone', name: 'Phone Addict', brief: 'Phone only. Ask it twice and pass.', disabled: only('phone'), base: 'easy', test: (s) => s.passed && s.phoneAsks >= 2 },
  { id: 'crib', name: 'Eagle Eye', brief: 'Crib sheet only. Read it 3 times and pass.', disabled: only('crib'), base: 'easy', test: (s) => s.passed && s.cribReads >= 3 },
  { id: 'peek', name: 'Neighborhood Watch', brief: 'Peeking only. Peek 4 times and pass.', disabled: only('peek'), base: 'easy', test: (s) => s.passed && s.peeks >= 4 },
  { id: 'clean', name: 'Clean Hands', brief: 'No cheats at all. Score 9 or more.', disabled: [...ALL_CHEATS], base: 'notEasy', test: (s) => s.passed && s.score >= 9 },
];

// ---------------------------------------------------------------- school week

export interface WeekDay {
  name: string;
  title: string;
  plan: Partial<RoundPlan>;
}

export const WEEK: readonly WeekDay[] = [
  { name: 'MONDAY', title: 'Easy Start', plan: { questions: 5, seconds: 120, passMark: 3 } },
  { name: 'TUESDAY', title: 'No Phones Day', plan: { questions: 6, seconds: 150, passMark: 4, disabled: ['phone'] } },
  { name: 'WEDNESDAY', title: 'Substitute Teacher!', plan: { questions: 7, seconds: 150, passMark: 5, overrides: { teacherCount: 2 } } },
  { name: 'THURSDAY', title: 'Pop Quiz!', plan: { questions: 8, seconds: 75, passMark: 6, maxWarnings: 2, intensity: 1.25 } },
  { name: 'FRIDAY', title: 'FINAL EXAM', plan: { questions: 10, seconds: 180, passMark: 7, base: 'notEasy' } },
];

// ---------------------------------------------------------------- plan builders

export function planFor(mode: ModeId, opts: { challengeIdx?: number; weekDay?: number } = {}): RoundPlan {
  switch (mode) {
    case 'tutorial':
      return plan({
        mode,
        questions: 6,
        seconds: 900,
        passMark: 0,
        maxWarnings: 99,
        // she cannot see you until the last lesson, and fruit does not run out
        overrides: { visionRange: 0.05, fruitPerRound: 999, peekRefuseChance: 0, peekFindSeconds: 1.8, peekShareSeconds: 1e6, peekTaps: 99 },
        introTitle: 'TRAINING DAY',
        introSub: 'learn every cheat. no timer, she cannot see you yet.',
      });
    case 'easy':
      return plan({ mode, introTitle: 'EASY', introSub: 'one teacher, three warnings' });
    case 'notEasy':
      return plan({ mode, base: 'notEasy', introTitle: 'NOT EASY', introSub: 'two teachers. good luck.' });
    case 'rush':
      return plan({
        mode,
        intensity: 1.3,
        questions: 5,
        seconds: 60,
        passMark: 4,
        maxWarnings: 2,
        overrides: { fruitPerRound: 2 },
        introTitle: '60-SECOND RUSH',
        introSub: '5 questions. 60 seconds. 2 warnings.',
      });
    case 'endless':
      return plan({
        mode,
        endless: true,
        overrides: { peekTaps: 99 },
        seconds: 3600,
        passMark: 10,
        maxWrong: 3,
        introTitle: 'ENDLESS',
        introSub: '3 wrong answers or 3 warnings ends it. she speeds up!',
      });
    case 'challenge': {
      const c = CHALLENGES[(opts.challengeIdx ?? 0) % CHALLENGES.length];
      return plan({
        mode,
        base: c.base,
        disabled: c.disabled,
        overrides: { ...(c.disabled.includes('fruit') ? { fruitPerRound: 0 } : {}), ...(c.id === 'peek' ? { peekTaps: 8 } : {}) },
        challengeId: c.id,
        introTitle: `CHALLENGE: ${c.name.toUpperCase()}`,
        introSub: c.brief,
      });
    }
    case 'week': {
      const day = Math.max(0, Math.min(WEEK.length - 1, opts.weekDay ?? 0));
      const d = WEEK[day];
      const p = plan({ mode, ...d.plan, day: day + 1, introTitle: `${d.name}: ${d.title}`, introSub: `pass with ${d.plan.passMark ?? 7} to move on` });
      if (p.disabled.includes('fruit')) p.overrides = { ...p.overrides, fruitPerRound: 0 };
      return p;
    }
  }
}

/** Endless: how fast she is after `answered` questions. Returns what to apply. */
export function endlessStage(answered: number): { level: number; base: Difficulty; intensity: number } {
  const level = Math.floor(answered / 4);
  if (level < 3) return { level, base: 'easy', intensity: 1 + 0.08 * level };
  return { level, base: 'notEasy', intensity: Math.min(1.6, 1 + 0.06 * (level - 3)) };
}

// ---------------------------------------------------------------- the live round

/** what the rest of the game checks: which cheats this round allows */
export const ROUND = {
  mode: 'easy' as ModeId,
  disabled: new Set<Cheat>(),
  challengeId: '',
  day: 0,
  allows(c: Cheat): boolean {
    return !this.disabled.has(c);
  },
  set(p: RoundPlan): void {
    this.mode = p.mode;
    this.disabled = new Set(p.disabled);
    this.challengeId = p.challengeId;
    this.day = p.day;
  },
};

// ---------------------------------------------------------------- the picker menu

export type MenuItem = { kind: 'mode'; id: ModeId } | { kind: 'page'; to: number; label: string };

/** three buttons per page (the exam sheet has three) */
export const MENU: readonly (readonly [MenuItem, MenuItem, MenuItem])[] = [
  [{ kind: 'mode', id: 'tutorial' }, { kind: 'mode', id: 'easy' }, { kind: 'page', to: 1, label: 'MORE MODES  >' }],
  [{ kind: 'mode', id: 'notEasy' }, { kind: 'mode', id: 'rush' }, { kind: 'page', to: 2, label: 'MORE MODES  >' }],
  [{ kind: 'mode', id: 'endless' }, { kind: 'mode', id: 'challenge' }, { kind: 'page', to: 3, label: 'MORE MODES  >' }],
  [{ kind: 'mode', id: 'week' }, { kind: 'page', to: 0, label: '<  BACK TO START' }, { kind: 'page', to: 1, label: 'MORE MODES  >' }],
];
