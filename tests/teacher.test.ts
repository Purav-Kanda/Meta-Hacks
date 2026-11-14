import { PatrolBrain, PATROL } from '../src/teacher-brain.ts';
import { inCone, yawToward } from '../src/vision.ts';
import { EASY } from '../src/tuning.ts';
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
// --- vision ---
ok(inCone(0, 0, 0, 0, -2, 3.5, 0.5), 'dead ahead in range');
ok(!inCone(0, 0, 0, 0, -4, 3.5, 0.5), 'out of range');
ok(!inCone(0, 0, 0, 0, 2, 3.5, 0.5), 'behind');
ok(!inCone(0, 0, 0, 2, -1, 3.5, 0.5), 'too far to the side');
ok(inCone(0, 0, 0, 0.5, -2, 3.5, 0.5), 'slightly off axis');
ok(Math.abs(yawToward(0, 0, 1, 0) - -Math.PI / 2) < 1e-9, 'facing +x is yaw -90deg');
ok(inCone(0, 0, yawToward(0, 0, 1, 0), 2, 0, 3.5, 0.5), 'cone follows yaw');
// --- patrol ---
const b = new PatrolBrain(PATROL, EASY);
const visited = new Set<number>();
let minX = 99, maxX = -99, minZ = 99, maxZ = -99, sawWalk = false, sawPause = false, laps = 0, last = b.headingTo;
for (let t = 0; t < 200 * 60; t++) {
  b.update(1 / 60);
  visited.add(b.headingTo);
  minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x); minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z);
  if (b.walking) sawWalk = true; else sawPause = true;
  if (b.headingTo === 1 && last !== 1) laps++;
  last = b.headingTo;
  ok(Number.isFinite(b.x) && Number.isFinite(b.z) && Number.isFinite(b.yaw), 'finite');
}
ok(visited.size === PATROL.length, 'visits every waypoint: ' + [...visited]);
ok(minX >= -0.76 && maxX <= 0.76, `stays in aisles x [${minX},${maxX}]`);
ok(minZ >= -3.91 && maxZ <= -0.34, `never behind player row z [${minZ},${maxZ}]`);
ok(sawWalk && sawPause, 'walks and pauses');
ok(laps >= 2, 'loops repeatedly, laps=' + laps);
// at the aisle end she ends up looking at the player's desk
const c = new PatrolBrain(PATROL, EASY);
let seenPlayer = false;
for (let t = 0; t < 40 * 60; t++) { c.update(1 / 60); if (!c.walking && c.headingTo === 3 && inCone(c.x, c.z, c.yaw, 0, 0, 3.5, EASY.visionHalfAngle)) seenPlayer = true; }
ok(seenPlayer, 'she looks at the player while paused at the aisle end');
// both the real seated head (z~0) and the desktop preview camera (z=0.2) must be seen at the aisle end
for (const headZ of [0, 0.2]) {
  const d = new PatrolBrain(PATROL, EASY); let seen = false;
  for (let t = 0; t < 40 * 60; t++) { d.update(1 / 60); if (!d.walking && d.headingTo === 3 && inCone(d.x, d.z, d.yaw, 0, headZ, 3.5, EASY.visionHalfAngle)) seen = true; }
  ok(seen, 'sees head at z=' + headZ);
}
console.log('teacher logic tests OK, laps in 200s:', laps, 'x', minX.toFixed(2), maxX.toFixed(2), 'z', minZ.toFixed(2), maxZ.toFixed(2));
