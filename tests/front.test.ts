import { PatrolBrain, PATROL, PATROL_OUTER } from '../src/teacher-brain.ts';
import { SEATING } from '../src/seating.ts';
import { EASY } from '../src/tuning.ts';
for (const [name, route] of [['inner', PATROL], ['outer', PATROL_OUTER]] as const) {
  for (const row of [0, 1]) {
    SEATING.set(row, 1);
    const b = new PatrolBrain(route, EASY);
    let maxZ = -9;
    for (let i = 0; i < 200 * 20; i++) { b.update(0.05); if (b.z > maxZ) maxZ = b.z; }
    console.log(name, 'row', row, 'maxZ', maxZ.toFixed(2));
    if (row === 0 && maxZ < 1.0 - (name === 'outer' ? 0.65 : 0) - 0.05) throw new Error('front row: does not reach aisle end');
  }
}
console.log('front ok');
