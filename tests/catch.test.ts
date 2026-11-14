import { TeacherAI } from '../src/teacher-ai.ts';
import { PATROL } from '../src/teacher-brain.ts';
import { EASY } from '../src/tuning.ts';
import { ExamModel } from '../src/exam.ts';
import { QUESTIONS } from '../src/questions.ts';
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
const DT = 1 / 60;
const inBounds = (ai: TeacherAI) => ai.x >= -0.76 && ai.x <= 0.76 && ai.z >= -3.91 && ai.z <= -0.34;

// 1) no evidence: never spots anything, over several laps
{
  const ai = new TeacherAI(PATROL, EASY); let spotted = 0;
  for (let t = 0; t < 200 * 60; t++) { if (ai.update(DT, { headX: 0, headZ: 0, playing: true, evidence: false }).spotted) spotted++; }
  ok(spotted === 0, 'no evidence -> no spot');
}
// 2) evidence but exam not running: ignored
{
  const ai = new TeacherAI(PATROL, EASY); let spotted = 0;
  for (let t = 0; t < 100 * 60; t++) { if (ai.update(DT, { headX: 0, headZ: 0, playing: false, evidence: true }).spotted) spotted++; }
  ok(spotted === 0, 'not playing -> ignored');
}
// 3) constant evidence: spot -> rush -> warned; check bounds, timing and the grace period
{
  const ai = new TeacherAI(PATROL, EASY);
  const log: { t: number; ev: string }[] = [];
  let spotT = -1, firstWarn = -1;
  for (let t = 0; t < 120 * 60; t++) {
    const e = ai.update(DT, { headX: 0, headZ: 0, playing: true, evidence: true });
    if (e.spotted) { log.push({ t: t * DT, ev: 'spot' }); if (spotT < 0) spotT = t * DT; }
    if (e.warned) { log.push({ t: t * DT, ev: 'warn' }); if (firstWarn < 0) firstWarn = t * DT; }
    ok(inBounds(ai) || t < 2, `rush stays on the walkway at t=${(t * DT).toFixed(2)} (${ai.x.toFixed(2)},${ai.z.toFixed(2)})`);
    ok(Number.isFinite(ai.x + ai.z + ai.yaw), 'finite');
  }
  const warns = log.filter((l) => l.ev === 'warn');
  ok(spotT >= 0 && spotT < 6, 'spots quickly once evidence is out, t=' + spotT);
  ok(warns.length >= 3, 'repeated evidence gives repeated warnings, got ' + warns.length);
  for (let i = 1; i < warns.length; i++) ok(warns[i].t - warns[i - 1].t >= EASY.lectureSeconds + EASY.graceSeconds - 0.01, 'grace between warnings');
  ok(Math.abs(log.filter((l) => l.ev === 'spot').length - warns.length) <= 1, 'every spot ends in exactly one warning (evidence never hidden)');
  console.log('spot at', spotT.toFixed(1) + 's, first warning at', firstWarn.toFixed(1) + 's, warnings in 120s:', warns.length, 'rush time', (firstWarn - spotT).toFixed(1) + 's');
}
// 4) hide the evidence once she starts rushing: forgiven, no warning
{
  const ai = new TeacherAI(PATROL, EASY); let evidence = true, warned = 0, forgave = 0;
  for (let t = 0; t < 60 * 60; t++) {
    const e = ai.update(DT, { headX: 0, headZ: 0, playing: true, evidence });
    if (e.spotted) evidence = false; // player panics and puts the cheat away
    if (e.warned) warned++; if (e.forgave) forgave++;
  }
  ok(warned === 0 && forgave === 1, `hidden in time -> forgiven (warned=${warned}, forgave=${forgave})`);
}
// 5) hiding it too late (re-pull out right before arrival) still counts
{
  const ai = new TeacherAI(PATROL, EASY); let evidence = true, warned = 0;
  for (let t = 0; t < 60 * 60; t++) {
    const e = ai.update(DT, { headX: 0, headZ: 0, playing: true, evidence });
    if (e.spotted) evidence = false;
    if (ai.mode === 'rush' && ai.path.length === 1 && Math.hypot(ai.x - 0.75, ai.z + 0.35) < 0.3) evidence = true; // cheat again right before she arrives
    if (e.warned) warned++;
  }
  ok(warned >= 1, 'cheating again as she arrives is caught');
}
// 6) after a lecture she resumes the patrol and keeps walking (not stuck)
{
  const ai = new TeacherAI(PATROL, EASY); let evidence = true; let t = 0; let sawWalkAfter = false, warnedYet = false;
  for (; t < 80 * 60; t++) {
    const e = ai.update(DT, { headX: 0, headZ: 0, playing: true, evidence });
    if (e.warned) { warnedYet = true; evidence = false; }
    if (warnedYet && ai.mode === 'patrol' && ai.walking) sawWalkAfter = true;
  }
  ok(sawWalkAfter, 'resumes patrol after lecture');
}
// 7) exam model: warnings, fail by 3rd, reset on restart
{
  const m = new ExamModel(QUESTIONS, { passMark: 7, seconds: 180, maxWarnings: 3 });
  ok(m.addWarning() === false && m.warnings === 0, 'no warning before start');
  m.start();
  ok(m.addWarning() === false && m.warnings === 1 && m.phase === 'playing', 'warning 1');
  ok(m.addWarning() === false && m.warnings === 2, 'warning 2');
  m.evidence.set('phone', true); ok(m.evidence.active, 'evidence on');
  ok(m.addWarning() === true && m.phase === 'done' && m.endedBy === 'caught', 'third warning = caught');
  ok(!m.evidence.active, 'evidence cleared when exam ends');
  ok(!m.passed(), 'caught can never pass');
  m.start(); ok(m.warnings === 0 && m.endedBy === null && m.phase === 'playing', 'restart resets');
  for (let i = 0; i < 10; i++) m.answer(m.correctSlot()); ok(m.endedBy === 'finished' && m.passed(), 'finish sets reason');
  m.start(); m.tick(181); ok(m.endedBy === 'time', 'timeout reason');
}
console.log('catch logic tests OK');
