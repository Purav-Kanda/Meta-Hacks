import assert from 'node:assert';
import { SEATS, pickSeat, neighborCount } from '../src/seat.ts';
assert.equal(SEATS.length, 6);
let last = ''; const counts: Record<string, number> = {};
for (let i = 0; i < 3000; i++) { const s = pickSeat(Math.random, last); assert.notEqual(s.id, last); last = s.id; counts[s.id] = (counts[s.id] ?? 0) + 1; }
assert.equal(neighborCount(SEATS[0]), 1); assert.equal(neighborCount(SEATS[1]), 2);
console.log('seat ok', JSON.stringify(counts));
