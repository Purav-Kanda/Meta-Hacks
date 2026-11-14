import assert from 'node:assert';
import { arrange, SEATING, COL_X, ROW_Z } from '../src/seating.ts';
const a = arrange(1, 1);
assert.deepEqual(a.adjacent, [0, 1]);
const fm = arrange(0, 1); // front middle: rows swap, same two neighbors
assert.deepEqual(fm.adjacent, [0, 1]); assert.equal(fm.kids[0].row, 0); assert.equal(fm.kids[2].row, 1);
const fl = arrange(0, 0); // front left: rows swap, then you swap with the left kid
assert.deepEqual(fl.adjacent, [-1, 0]); assert.deepEqual(fl.kids[0], { row: 0, col: 1 }); assert.deepEqual(fl.kids[1], { row: 0, col: 2 });
const br = arrange(1, 2);
assert.deepEqual(br.adjacent, [1, -1]); assert.deepEqual(br.kids[1], { row: 1, col: 1 });
// everyone gets a unique seat, never the player's
for (const r of [0, 1]) for (const c of [0, 1, 2]) {
  const p = arrange(r, c); const seen = new Set<string>([`${r},${c}`]);
  for (const k of p.kids) { const key = `${k.row},${k.col}`; assert.ok(!seen.has(key), key); seen.add(key); }
  assert.equal(seen.size, 6);
}
SEATING.set(0, 0); assert.equal(SEATING.dx, COL_X[0]); assert.equal(SEATING.dz, ROW_Z[0] - ROW_Z[1]);
assert.equal(SEATING.aisleX(1), -0.75); SEATING.set(1, 2); assert.equal(SEATING.aisleX(-1), 0.75);
console.log('seating ok');
