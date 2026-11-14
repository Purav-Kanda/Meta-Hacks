import assert from 'node:assert/strict';
import { SCARE_DISTANCE, scareDuration, scarePose, scareTarget } from '../src/scare.ts';
for (const calm of [false, true]) {
  const d = scareDuration(calm);
  const a = scarePose(0, calm), b = scarePose(d, calm);
  assert.ok(a.move === 0 && Math.abs(a.lean) < 1e-9 && a.scale === 1, 'starts neutral');
  assert.ok(Math.abs(b.move) < 1e-6 && Math.abs(b.lean) < 1e-6 && Math.abs(b.scale - 1) < 1e-6 || calm, 'ends neutral');
  // no jumps between frames
  let prev = scarePose(0, calm);
  for (let t = 0.01; t <= d; t += 0.01) { const p = scarePose(t, calm); assert.ok(Math.abs(p.move - prev.move) < 0.12 && Math.abs(p.lean - prev.lean) < 0.14 && Math.abs(p.scale - prev.scale) < 0.05, `smooth at ${t.toFixed(2)}`); prev = p; }
}
assert.ok(scarePose(1, false).move === 1 && scarePose(1, false).shake === 1, 'hold');
assert.equal(scarePose(1, true).move, 0, 'calm never leaves her spot');
const q = scareTarget(1.5, -0.2); assert.ok(q.x === 1.5 && Math.abs(q.z - (-0.2 - SCARE_DISTANCE)) < 1e-9);
console.log('scare ok');
