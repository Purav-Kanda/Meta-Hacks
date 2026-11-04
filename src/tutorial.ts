/**
 * Training Day (pure logic, no three.js): a guided first round. One lesson per question; the coach
 * card shows the lesson, and you cannot answer past a lesson until you have tried the cheat.
 */
import type { RoundStats } from './progress.js';

export interface Lesson {
  id: string;
  title: string;
  text: string;
  /** shown once the lesson is done */
  praise: string;
  /** the lesson is complete when this is true; null = the question itself is the lesson */
  done: ((s: RoundStats) => boolean) | null;
  /** where the pointing arrow floats (room-local meters) */
  arrow: [number, number, number][];
}

export const LESSONS: readonly Lesson[] = [
  { id: 'answer', title: 'ANSWER', text: 'Point at A, B or C and pull the trigger to answer.', praise: 'Nice! That is the boring way.', done: null, arrow: [] },
  {
    id: 'peek',
    title: 'PEEK',
    text: 'Turn to a classmate and click them. They need a few seconds to find your question.',
    praise: 'Got their paper! Click the kid again to hide it.',
    done: (s) => s.peeks >= 1,
    arrow: [[-1.3, 1.45, -0.45], [1.3, 1.45, -0.45]],
  },
  {
    id: 'fruit',
    title: 'LUNCHBOX',
    text: 'Click the lunchbox, grab a snack and flick it at the front of the room. Throw as many as you like!',
    praise: 'She goes to check the noise. Free time to cheat!',
    done: (s) => s.fruitThrown >= 1,
    arrow: [[0.46, 1.0, -0.5]],
  },
  {
    id: 'crib',
    title: 'CRIB SHEET',
    text: 'Grab the crib sheet from the tray under your desk. Lift it up to read, then tuck it back under the desk!',
    praise: 'Notes read. Dropped or held up, she can see it!',
    done: (s) => s.cribReads >= 1,
    arrow: [[0, 0.86, -0.1]],
  },
  {
    id: 'phone',
    title: 'PHONE',
    text: 'Pick up the phone on your desk, then press ASK.',
    praise: 'The phone knows everything (when it loads).',
    done: (s) => s.phoneAsks >= 1,
    arrow: [[-0.42, 1.0, -0.28]],
  },
  { id: 'free', title: 'FREE PLAY', text: 'Last one! Use any cheat. She can see you now, so hide the evidence when she charges.', praise: '', done: null, arrow: [] },
];

export const TUTORIAL = {
  /** bumps whenever the player tries to answer before finishing a lesson (the coach card shakes) */
  nudgeSeq: 0,
  lesson(cursor: number): Lesson {
    return LESSONS[Math.max(0, Math.min(LESSONS.length - 1, cursor))];
  },
  isDone(cursor: number, s: RoundStats): boolean {
    const l = this.lesson(cursor);
    return l.done === null || l.done(s);
  },
  /** answering is blocked until the lesson's cheat has been tried */
  canAnswer(cursor: number, s: RoundStats): boolean {
    return this.isDone(cursor, s);
  },
};
