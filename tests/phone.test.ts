import { PhoneModel } from '../src/phone.ts';
let fail = 0; const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } };
const R = { bufferMin: 2, bufferMax: 4, cooldown: 20, dodgeSeconds: 1.5, hideSlots: 5 };
const p = new PhoneModel(R);
ok(!p.ask() && !p.evidence, 'cannot ask from pocket, no evidence');
ok(p.raise() && p.evidence, 'raise gives evidence');
ok(p.ask() && p.buffering, 'ask starts buffering');
ok(!p.ask(), 'cannot ask twice');
ok(p.bufferLeft >= 2 && p.bufferLeft <= 4, 'buffer 2-4s');
for (let t = 0; t < 1.9; t += 0.1) p.update(0.1, 2, false);
ok(p.buffering && p.answer === -1, 'still buffering at 1.9s');
for (let t = 0; t < 2.2; t += 0.1) p.update(0.1, 2, false);
ok(!p.buffering && p.answer === 2, 'answer is the correct slot');
ok(p.cooldownLeft > 17 && p.cooldownLeft <= 20, 'cooldown started');
ok(!p.canAsk, 'cannot ask with answer showing/cooldown');
p.newQuestion(); ok(p.answer === -1 && !p.canAsk, 'stale answer cleared but still cooling down');
for (let t = 0; t < 20.5; t += 0.1) p.update(0.1, 0, false);
ok(p.canAsk, 'ask again after cooldown');
// hide mid-buffer wastes it
p.ask(); p.update(0.5, 1, false); ok(p.hide() && p.cooldownLeft === 20 && p.answer === -1 && !p.evidence, 'hide mid-buffer: cooldown, no answer');
// confiscate
const q = new PhoneModel(R); q.raise(); q.ask(); q.confiscate();
ok(q.state === 'gone' && !q.evidence && !q.raise() && !q.ask() && !q.hide(), 'confiscated phone is dead');
// dodge ~every 1s only while rushing & up
const d = new PhoneModel(R); d.raise(); let moves = 0, last = d.hideSlot;
for (let t = 0; t < 5; t += 0.05) { d.update(0.05, 0, false); if (d.hideSlot !== last) moves++; }
ok(moves === 0, 'no dodge when calm');
for (let t = 0; t < 5; t += 0.05) { d.update(0.05, 0, true); if (d.hideSlot !== last) { moves++; last = d.hideSlot; } }
console.log('dodges in 5s', moves); ok(moves >= 3 && moves <= 4, "dodge ~1.5s");
console.log(fail ? 'FAILED' : 'ALL OK');
