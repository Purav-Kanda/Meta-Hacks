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
  { id: 'answer', title: 'ANSWER', text: 'Hold up your hand and point at A, B or C. Pinch your thumb and index finger together to press.', praise: 'Nice! That is the boring way.', done: null, arrow: [] },
  {
    id: 'peek',
    title: 'PEEK',
    text: 'Point at the kid beside you and pinch. Wait a few seconds while they find your question. Pinch the kid again to hide it.',
    praise: 'Got their paper! Pinch the kid again to hide it.',
    done: (s) => s.peeks >= 1,
    arrow: [[-1.5, 1.45, -0.45], [1.5, 1.45, -0.45]],
  },
  {
    id: 'fruit',
    title: 'LUNCHBOX',
    text: 'Pinch the lunchbox to open it. Point at the snack, pinch and HOLD, swing your arm and let go to throw it!',
    praise: 'She goes to check the noise. Free time to cheat!',
    done: (s) => s.fruitThrown >= 1,
    arrow: [[0.46, 1.0, -0.5]],
  },
  {
    id: 'crib',
    title: 'CRIB SHEET',
    text: 'Point at the sheet in the tray under your desk, pinch and hold to grab it. Lift it to read, then tuck it back.',
    praise: 'Notes read. Dropped or held up, she can see it!',
    done: (s) => s.cribReads >= 1,
    arrow: [[0, 0.86, -0.07]],
  },
  {
    id: 'phone',
    title: 'PHONE',
    text: 'Pinch the phone on your desk to pick it up, then pinch ASK. Wait for the answer to load.',
    praise: 'The phone knows everything (when it loads).',
    done: (s) => s.phoneAsks >= 1,
    arrow: [[-0.42, 1.0, -0.28]],
  },
  { id: 'free', title: 'FREE PLAY', text: 'Last one! Use any cheat. She can see you now, so hide the evidence (pinch it away) when she charges.', praise: '', done: null, arrow: [] },
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
