import { Entity, Pressed, createSystem } from '@iwsdk/core';
import { ExamSystem } from './exam-system.js';
import { PhoneSystem } from './phone-system.js';
import { sfx } from './sfx.js';
import { SETTINGS } from './settings.js';
import { TeacherSystem } from './teacher-system.js';

/** Watches the other systems and plays a sound when something changes. (Throw/land sounds are played by FruitSystem.) */
export class SoundSystem extends createSystem({
  pressed: { required: [Pressed] },
}) {
  private warnings = 0;
  private phase = 'ready';
  private mode = 'patrol';
  private phoneAnswer = -1;
  private phoneState = 'pocket';

  init(): void {
    const unlock = () => sfx.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock);
    document.addEventListener('visibilitychange', unlock);
    this.world.renderer.xr.addEventListener('sessionstart', () => {
      unlock();
      // hand pinches don't fire normal page events, but XR select events count as a user gesture
      const session = this.world.renderer.xr.getSession();
      if (session) for (const ev of ['selectstart', 'select', 'squeezestart', 'visibilitychange']) session.addEventListener(ev, unlock);
    });
    this.queries.pressed.subscribe('qualify', (_e: Entity) => sfx.click());
  }

  update(): void {
    sfx.keepAlive(performance.now());
    const ex = this.world.getSystem(ExamSystem)!.exam;
    const ts = this.world.getSystem(TeacherSystem)!;
    const ph = this.world.getSystem(PhoneSystem)!.model;

    if (ex.warnings > this.warnings) sfx.buzzer();
    this.warnings = ex.warnings;

    if (ex.phase !== this.phase) {
      if (ex.phase === 'done') ex.passed() ? sfx.pass() : sfx.fail();
      this.phase = ex.phase;
    }

    // one summary mode across all teachers: rush beats distracted beats the rest
    let mode = 'patrol';
    for (const t of ts.ais) {
      if (t.mode === 'rush') mode = 'rush';
      else if (t.mode === 'distracted' && mode !== 'rush') mode = 'distracted';
    }
    // music plays during the exam and pauses while any teacher is angry
    let angry = false;
    for (const t of ts.ais) if (t.mode === 'rush' || t.mode === 'lecture' || t.mode === 'glare') angry = true;
    sfx.music(SETTINGS.music && ex.phase === 'playing' && !angry);

    if (mode !== this.mode) {
      if (mode === 'rush') sfx.screech();
      else if (mode === 'distracted') sfx.huh();
      this.mode = mode;
    }

    if (ph.answer !== this.phoneAnswer) {
      if (ph.answer >= 0) sfx.ding();
      this.phoneAnswer = ph.answer;
    }
    if (ph.state !== this.phoneState) {
      if (ph.state === 'up') sfx.pop();
      this.phoneState = ph.state;
    }
  }
}
