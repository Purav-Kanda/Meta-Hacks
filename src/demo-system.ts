import { Vector3, createSystem } from '@iwsdk/core';
import { ExamSystem } from './exam-system.js';
import { FruitSystem } from './fruit-system.js';
import { PeekSystem } from './peek-system.js';
import { PhoneSystem } from './phone-system.js';

/**
 * Filming helpers, only active with URL options (normal play never touches this):
 *   ?cam=orbit|top|front|corner   a cinematic camera for the flat browser view (not used inside a headset session)
 *   ?bot                          a scripted "player" that answers questions and uses cheats, so you can record
 *                                 repeatable shots of the teacher reacting (best combined with ?cam=...)
 */
type Shot = (t: number, out: Vector3, look: Vector3) => void;

const SHOTS: Record<string, Shot> = {
  // slow circle around the classroom
  orbit: (t, out, look) => {
    const a = t * 0.12 + 0.6;
    out.set(Math.sin(a) * 3.3, 2.3, -2.1 + Math.cos(a) * 3.3);
    look.set(0, 0.8, -2.2);
  },
  // straight down: shows the teacher's route and vision cone
  top: (_t, out, look) => {
    out.set(0, 8.5, -1.6);
    look.set(0, 0, -1.9);
  },
  // from behind the teacher's desk looking at the class
  front: (t, out, look) => {
    out.set(Math.sin(t * 0.15) * 0.5, 1.7, -5.2);
    look.set(0, 0.9, 0);
  },
  // high corner, slow drift
  corner: (t, out, look) => {
    out.set(3.4 + Math.sin(t * 0.1) * 0.3, 2.5, 1.4);
    look.set(-0.3, 0.9, -2.6);
  },
};

interface Beat {
  at: number; // seconds into the round
  run: (d: DemoSystem) => void;
}

export class DemoSystem extends createSystem({}) {
  private exam!: ExamSystem;
  private peek!: PeekSystem;
  private phone!: PhoneSystem;
  private fruit!: FruitSystem;
  private shot: Shot | null = null;
  private bot = false;
  private clock = 0;
  private pos = new Vector3();
  private look = new Vector3();

  // bot state
  private botT = 0;
  private waitT = 0;
  private nextAnswer = 3;
  private beatIdx = 0;
  private lastPhase = '';

  private readonly beats: Beat[] = [
    { at: 6, run: (d) => d.doPeek(0) },
    { at: 10, run: (d) => d.unpeek(0) },
    { at: 14, run: (d) => d.phone.model.raise() },
    { at: 16, run: (d) => d.phone.model.ask() },
    { at: 23, run: (d) => d.phone.model.hide() },
    { at: 27, run: (d) => d.callFruit('pickOrPut') },
    { at: 28.5, run: (d) => d.callFruit('throwAtZone', 0) },
    { at: 39, run: (d) => d.doPeek(1) },
    { at: 43, run: (d) => d.unpeek(1) },
  ];

  init(): void {
    const p = new URLSearchParams(window.location.search);
    this.shot = SHOTS[p.get('cam') ?? ''] ?? null;
    this.bot = p.has('bot');
    const exam = this.world.getSystem(ExamSystem);
    const peek = this.world.getSystem(PeekSystem);
    const phone = this.world.getSystem(PhoneSystem);
    const fruit = this.world.getSystem(FruitSystem);
    if (!exam || !peek || !phone || !fruit) throw new Error('game systems must be registered before DemoSystem');
    this.exam = exam;
    this.peek = peek;
    this.phone = phone;
    this.fruit = fruit;
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.1);
    this.clock += dt;
    if (this.shot && !this.world.visibilityState.toString().startsWith('visible')) {
      this.shot(this.clock, this.pos, this.look);
      this.world.camera.position.copy(this.pos);
      this.world.camera.lookAt(this.look);
    }
    if (this.bot) this.runBot(dt);
  }

  private runBot(dt: number): void {
    const ex = this.exam.exam;
    const phase = ex.phase;
    const press = (slot: number): void => (this.exam as unknown as { onButtonPressed(s: number): void }).onButtonPressed(slot);
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.waitT = 0;
      this.botT = 0;
      this.nextAnswer = 3;
      this.beatIdx = 0;
    }
    this.waitT += dt;
    if (phase === 'ready' || phase === 'done') {
      // sit on the report card for a few seconds, then start another round
      if (this.waitT > (phase === 'done' ? 7 : 2)) {
        press(0);
        this.waitT = 0;
      }
      return;
    }
    this.botT += dt;
    // answer a question every ~4.5 s, mostly right
    if (this.botT >= this.nextAnswer) {
      this.nextAnswer = this.botT + 4 + Math.random() * 1.5;
      const right = ex.correctSlot();
      press(Math.random() < 0.8 ? right : (right + 1) % 3);
    }
    // scripted cheats
    while (this.beatIdx < this.beats.length && this.botT >= this.beats[this.beatIdx].at) {
      this.beats[this.beatIdx].run(this);
      this.beatIdx += 1;
    }
  }

  private unpeek(side: 0 | 1): void {
    if (this.peek.model.state[side] === 'sharing') this.peek.model.tap(side);
  }

  private doPeek(side: 0 | 1): void {
    const m = this.peek.model;
    // the demo bot is impatient: a quick, sure-thing peek, and it holds off answering while the paper is out
    m.rules.askSeconds = 1.2;
    m.rules.refuseChance = 0;
    m.tap(side);
    this.nextAnswer = this.botT + 5;
  }

  private callFruit(fn: 'pickOrPut' | 'throwAtZone', arg?: number): void {
    const f = this.fruit as unknown as Record<string, (a?: number) => void>;
    f[fn](arg);
  }
}
