import { PeekModel } from '../src/peek.ts';
import assert from 'node:assert';
const rules = { accuracy: 1, refuseChance: 0, askSeconds: 3, decideSeconds: 0.5, refuseSeconds: 1.3, shareSeconds: 4, panicSeconds: 1.5, sulkSeconds: 5 };
let m = new PeekModel(rules, () => 0.5);
m.newQuestion(2);
assert.deepEqual([...m.shown], [2, 2]);
assert.equal(m.tap(0), 'asking'); assert.equal(m.evidence, false);
m.update(0.6, false); assert.equal(m.state[0], 'asking'); assert.equal(m.evidence, false); m.update(3.5, false); assert.equal(m.state[0], 'sharing'); assert.equal(m.evidence, true); assert.equal(m.shareSeq, 1);
assert.equal(m.tap(0), 'retract'); assert.equal(m.evidence, false);
// auto retract
m.tap(1); m.update(0.6, false); m.update(3.6, false); assert.equal(m.state[1], 'sharing'); m.update(4.1, false); assert.equal(m.state[1], 'idle');
// panic retract
m.tap(0); m.update(0.6, false); m.update(3.6, false); m.update(1.6, true); assert.equal(m.state[0], 'idle');
// new question retracts
m.tap(0); m.update(0.6, false); m.update(3.6, false); m.newQuestion(1); assert.equal(m.evidence, false);
// refusal
const r = new PeekModel({ ...rules, refuseChance: 1 }, () => 0.5);
r.newQuestion(0); r.tap(0); r.update(0.5, false);
assert.equal(r.state[0], 'refusing'); assert.equal(r.evidence, false);
assert.equal(r.tap(0), 'ignored');
r.update(1.4, false); assert.equal(r.state[0], 'sulking'); assert.equal(r.tap(0), 'ignored');
r.update(5.1, false); assert.equal(r.state[0], 'idle');
console.log('peek ok');
