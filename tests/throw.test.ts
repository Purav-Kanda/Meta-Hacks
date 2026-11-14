import { VelocityTracker, assistVelocity, Projectile, classifyLanding, standPoint, GRAVITY, FLOOR_Y } from '../src/throw.ts';
let fail = 0; const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } };
// velocity tracker: hand moving 3 m/s toward -z, sampled at 72 Hz
const tr = new VelocityTracker(); const v = { x: 0, y: 0, z: 0 };
for (let i = 0; i < 20; i++) tr.push(i / 72, 0.4, 1.0, -0.4 - 3 * (i / 72));
const sp = tr.velocity(v); ok(Math.abs(v.z + 3) < 0.05 && Math.abs(sp - 3) < 0.05, 'tracker 3 m/s, got ' + sp);
const tr2 = new VelocityTracker(); for (let i = 0; i < 10; i++) tr2.push(i / 72, 0, 1, 0); ok(tr2.velocity(v) < 0.01, 'still hand = 0');
const tr3 = new VelocityTracker(); for (let i = 0; i < 10; i++) tr3.push(i / 72, 50 * i / 72, 1, 0); ok(tr3.velocity(v) <= 8.0001, 'speed clamped');
// flight lands where physics says
const pr = new Projectile(); pr.launch({ x: 0.4, y: 1.1, z: -0.4 }, { x: 0, y: 2, z: -4 });
let t = 0, landed = false; while (!landed && t < 5) { landed = pr.step(1 / 72); t += 1 / 72; }
const T = (2 + Math.sqrt(4 + 2 * GRAVITY * (1.1 - FLOOR_Y))) / GRAVITY; ok(landed && Math.abs(t - T) < 0.03, 'flight time ' + t + ' vs ' + T);
ok(Math.abs(pr.z - (-0.4 - 4 * T)) < 0.2 || pr.z <= -5.8, 'z consistent');
// assist: noisy throws roughly toward the right zone
const targets: Array<[number, number]> = [[-3.1, -3.4], [3.1, -3.4], [0, -4.6]];
function throwTo(angleOffset: number, speed: number, strength: number) {
  const p = { x: 0.4, y: 1.1, z: -0.4 };
  const dx = 3.1 - p.x, dz = -3.4 - p.z; const a = Math.atan2(dx, -dz) + angleOffset;
  const vel = { x: Math.sin(a) * speed * 0.9, y: speed * 0.4, z: -Math.cos(a) * speed * 0.9 };
  const out = { x: 0, y: 0, z: 0 }; assistVelocity(p, vel, targets, strength, out);
  const q = new Projectile(); q.launch(p, out); let n = 0; while (q.active && n < 800) { q.step(1 / 72); n++; }
  return Math.hypot(q.x - 3.1, q.z + 3.4);
}
let noAssist = 0, withAssist = 0, N = 0;
for (let off = -0.3; off <= 0.3; off += 0.05) for (const sp2 of [4, 5, 6, 7]) { noAssist += throwTo(off, sp2, 0); withAssist += throwTo(off, sp2, 0.8); N++; }
console.log('mean miss distance  no assist', (noAssist / N).toFixed(2), ' assist 0.8', (withAssist / N).toFixed(2));
ok(withAssist < noAssist * 0.6, 'assist helps');
// throws aimed away are untouched
const far = { x: 0, y: 0, z: 0 }; assistVelocity({ x: 0, y: 1, z: 0 }, { x: 4, y: 1, z: 2 }, targets, 1, far); ok(far.x === 4 && far.z === 2, 'throws pointed away are left alone');
// classification
ok(classifyLanding(-3.1, -3.4) === 'front' && classifyLanding(3.1, -3.4) === 'front' && classifyLanding(0, -4.5) === 'front', 'front ok');
ok(classifyLanding(0, -1.5) === 'wasted' && classifyLanding(0, 0.5) === 'wasted' && classifyLanding(2.4, -4.8) === 'wasted', 'desks and teacher desk wasted');
const sp3: [number, number] = [0, 0]; standPoint(-3.1, -3.4, sp3); ok(sp3[1] <= -3.4 && sp3[0] > -3.1, 'stand toward middle: ' + sp3.join(','));
standPoint(0, -4.3, sp3); ok(Math.abs(sp3[0]) < 0.01, 'stand near centre');
console.log(fail ? 'FAILED' : 'ALL OK');
