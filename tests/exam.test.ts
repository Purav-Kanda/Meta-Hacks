import { ExamModel } from '../src/exam.ts';
import { QUESTIONS } from '../src/questions.ts';
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) { console.error('FAIL', m, a, b); process.exit(1); } };
const m = new ExamModel(QUESTIONS, { passMark: 7, seconds: 180 });
eq(m.answer(0), false, 'cannot answer before start');
m.start();
for (let i = 0; i < 10; i++) { eq(m.answer(i < 7 ? m.correctSlot() : (m.correctSlot() + 1) % 3), true, 'answer ' + i); }
eq(m.phase, 'done', 'done after 10');
eq(m.score(), 7, 'score 7'); eq(m.passed(), true, 'pass at 7');
eq(m.answer(0), false, 'no answers after done');
m.start(); m.answer(m.correctSlot()); m.tick(179.5); eq(m.phase, 'playing', 'still playing'); m.tick(1);
eq(m.phase, 'done', 'timeout ends'); eq(m.secondsLeft, 0, 'clamped'); eq(m.score(), 1, 'timeout score'); eq(m.passed(), false, 'fail');
eq(m.answeredCount(), 1, 'answered count');
for (const q of QUESTIONS) eq(q.options.length, 3, 'three options');
console.log('exam model tests OK');
