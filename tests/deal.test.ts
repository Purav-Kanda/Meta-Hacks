import { QUESTIONS, dealQuestions } from '../src/questions.ts';
let fail = 0; const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } };
console.log('pool size', QUESTIONS.length);
for (const q of QUESTIONS) {
  ok(new Set(q.options).size === 3, 'distinct options: ' + q.prompt);
  ok(q.options.every(o => o.length <= 22), 'option too long: ' + q.options.join('|'));
  ok(q.prompt.length <= 60, 'prompt long: ' + q.prompt);
}
ok(new Set(QUESTIONS.map(q => q.prompt)).size === QUESTIONS.length, 'duplicate prompts');
const answerText = new Map(QUESTIONS.map(q => [q.prompt, q.options[q.correct]]));
const seen = new Set<string>(); const slots = [0, 0, 0];
for (let n = 0; n < 3000; n++) {
  const d = dealQuestions(QUESTIONS, 10);
  ok(d.length === 10, 'count'); ok(new Set(d.map(q => q.prompt)).size === 10, 'no repeats in a deal');
  for (const q of d) { ok(q.options[q.correct] === answerText.get(q.prompt), 'correct follows option: ' + q.prompt); slots[q.correct]++; seen.add(q.prompt); }
}
ok(seen.size === QUESTIONS.length, 'every question gets dealt');
console.log('correct slot spread', slots.map(s => (s / 30000).toFixed(2)));
console.log(fail ? 'FAILED' : 'ALL OK');
