import { FruitModel } from '../src/fruit.ts';
import { TeacherAI } from '../src/teacher-ai.ts';
import { PATROL } from '../src/teacher-brain.ts';
import { ACTIVE_TUNING as T } from '../src/tuning.ts';
let fail = 0; const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } };
// model
const f = new FruitModel({ stock: 2, flightSeconds: 0.9, kinds: 5 });
ok(!f.throwTo(0), 'cannot throw empty-handed');
ok(f.pick() && f.state === 'carrying', 'pick');
ok(f.pick() && f.state === 'idle' && f.stock === 2, 'put back costs nothing');
f.pick(); ok(f.throwTo(1) && f.stock === 1 && f.state === 'flying', 'throw spends one');
ok(!f.pick(), 'cannot pick while flying');
for (let i = 0; i < 8; i++) f.update(0.1); ok(f.takeLanded() === null, 'not landed yet');
f.update(0.2); const l = f.takeLanded(); ok(!!l && l.zone === 1, 'landed in zone 1'); ok(f.takeLanded() === null, 'event once');
f.pick(); f.throwTo(0); ok(f.stock === 0, 'stock 0'); f.update(1); f.takeLanded(); ok(!f.pick(), 'cannot pick with no stock');
f.reset(); ok(f.stock === 2 && f.pick(), 'reset restores stock');
const kinds = new Set<number>(); for (let i = 0; i < 200; i++) { const g = new FruitModel({ stock: 1, flightSeconds: 1, kinds: 5 }); g.pick(); kinds.add(g.kind); } ok(kinds.size === 5, 'all fruit kinds appear');
// teacher distraction from many starting points
function run(startSteps: number, zone: number, evidence: boolean) {
  const ai = new TeacherAI(PATROL, T); const sx = zone === 0 ? -2.2 : 2.2; const zx = zone === 0 ? -3.1 : 3.1;
  for (let i = 0; i < startSteps; i++) ai.update(0.05, { headX: 0, headZ: 0.2, playing: true, evidence: false });
  if (ai.mode !== 'patrol') return null;
  ok(ai.distract(sx, -3.5, zx, -3.4), 'distract accepted');
  let t = 0, minX = 9, maxX = -9, maxZ = -9, spotted = false, atSpot = 0, resumed = -1;
  for (; t < 40; t += 0.05) {
    const ev = ai.update(0.05, { headX: 0, headZ: 0.2, playing: true, evidence });
    if ((ev.spotted || ev.warned) && resumed < 0) spotted = true;
    if (resumed < 0) { minX = Math.min(minX, ai.x); maxX = Math.max(maxX, ai.x); maxZ = Math.max(maxZ, ai.z); }
    if (ai.mode === 'distracted' && Math.hypot(ai.x - sx, ai.z + 3.5) < 0.05) atSpot += 0.05;
    if (ai.mode === 'patrol' && resumed < 0) resumed = t;
  }
  return { spotted, atSpot: +atSpot.toFixed(1), resumed: +resumed.toFixed(1), minX: +minX.toFixed(2), maxX: +maxX.toFixed(2), maxZ: +maxZ.toFixed(2), mode: ai.mode };
}
let worstSpot = 0;
for (let steps = 0; steps < 1400; steps += 37) for (const z of [0, 1]) {
  const r = run(steps, z, true); if (!r) continue;
  ok(!r.spotted, 'never spots while distracted (steps ' + steps + ')');
  ok(r.atSpot >= 4.0 && r.atSpot <= 5.0, 'stares ~4.5s, got ' + r.atSpot);
  ok(r.resumed > 0 && r.mode !== 'distracted', 'goes back to patrol');
  ok(r.minX >= -2.3 && r.maxX <= 2.3, 'stays within x range ' + r.minX + ' ' + r.maxX);
}
console.log('sample', JSON.stringify(run(0, 0, true)), JSON.stringify(run(300, 1, true)));
// cannot distract mid-rush
const ai2 = new TeacherAI(PATROL, T); for (let i = 0; i < 3; i++) ai2.update(0.05, { headX: 0, headZ: 0.2, playing: true, evidence: true });
let spottedNow = ai2.mode === 'rush'; ok(!ai2.distract(2.2, -3.5, 3.1, -3.4) || !spottedNow, 'no distract during rush');
console.log(fail ? 'FAILED' : 'ALL OK');
