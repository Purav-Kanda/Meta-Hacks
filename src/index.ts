import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { FruitSystem } from './fruit-system.js';
import { PeekSystem } from './peek-system.js';
import { PhoneSystem } from './phone-system.js';
import { SEAT } from './seat.js';
import { TITLE } from './title.js';
import { SeatSystem } from './seat-system.js';
import { TutorialSystem } from './tutorial-system.js';
import { TitleSystem } from './title-system.js';
import { DemoSystem } from './demo-system.js';
import { CribSystem } from './crib-system.js';
import { LivingSystem } from './living-system.js';
import { SoundSystem } from './sound-system.js';
import { sfx } from './sfx.js';
import { guardMouse, mouseStats } from './mouse-guard.js';
import { SettingsSystem } from './settings-system.js';
import { SCARE } from './scare.js';
import { loadSettings } from './settings.js';
import { stylePointers } from './pointer-style.js';
import { TeacherSystem } from './teacher-system.js';

loadSettings();

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(ClassroomSystem);
  world.registerSystem(ExamSystem);
  world.registerSystem(TeacherSystem);
  world.registerSystem(PeekSystem);
  world.registerSystem(PhoneSystem);
  world.registerSystem(CribSystem);
  world.registerSystem(FruitSystem);
  world.registerSystem(LivingSystem);
  world.registerSystem(SeatSystem);
  world.registerSystem(SettingsSystem);
  world.registerSystem(TutorialSystem);
  world.registerSystem(TitleSystem);
  world.registerSystem(SoundSystem);
  world.registerSystem(DemoSystem);

  // render resolution: 1.0 is the headset's native size. ?scale=1.3 renders sharper but costs ~70% more pixels
  // (try it only if the frame rate has room). ?fps shows a frame-rate readout in the flat browser view.
  const qp = new URLSearchParams(window.location.search);
  const scale = Math.min(2, Math.max(0.5, Number(qp.get('scale')) || 1.0));
  world.renderer.xr.setFramebufferScaleFactor(scale);
  world.renderer.xr.setFoveation(0.3);
  if (!qp.has('rawmouse')) guardMouse();
  if (qp.has('fps')) showFps(world.renderer.info, scale);
  if (qp.has('clicklog')) showClickLog(world);

  // controller rays are created lazily by the SDK, so keep trying until both hands are styled
  const style = stylePointers(world, new URLSearchParams(window.location.search).has('glove'));
  const timer = window.setInterval(() => {
    if (style()) window.clearInterval(timer);
  }, 500);

  // Dev helpers, only active with ?debug in the URL (ignored in normal play).
  //   ?debug            exposes window.__game for console poking
  //   ?debug&view=top   overhead camera so you can watch the teacher's route (flat browser view only)
  const params = new URLSearchParams(window.location.search);
  if (params.has('debug')) {
    (window as unknown as Record<string, unknown>).__game = {
      exam: world.getSystem(ExamSystem),
      teacher: world.getSystem(TeacherSystem),
      peek: world.getSystem(PeekSystem),
      phone: world.getSystem(PhoneSystem),
      crib: world.getSystem(CribSystem),
      seat: SEAT,
      classroom: world.getSystem(ClassroomSystem),
      title: TITLE,
      fruit: world.getSystem(FruitSystem),
      settings: world.getSystem(SettingsSystem),
      scare: SCARE,
      sfx,
      world,
    };
    if (params.get('view') === 'top') {
      world.camera.position.set(0, 8.5, -1.6);
      world.camera.lookAt(0, 0, -1.9);
    }
  }
});

/** a tiny frame-rate readout (top-left of the page). Updates once a second, so it costs nothing per frame. */
function showFps(info: { render: { calls: number; triangles: number } }, scale: number): void {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99999;padding:4px 8px;background:rgba(0,0,0,.7);color:#7dff9e;font:12px monospace;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  let frames = 0;
  let worst = 0;
  let last = performance.now();
  let acc = 0;
  const tick = (now: number): void => {
    const dt = now - last;
    last = now;
    frames += 1;
    acc += dt;
    worst = Math.max(worst, dt);
    if (acc >= 1000) {
      el.textContent = `fps ${Math.round((frames * 1000) / acc)}   worst frame ${Math.round(worst)} ms\nmouse jump max ${Math.round(mouseStats.rawMax)} px (capped ${mouseStats.capped})   scale ${scale}\ndraw calls ${info.render.calls}`;
      frames = 0;
      acc = 0;
      worst = 0;
      mouseStats.rawMax = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * ?clicklog: an on-screen list of every real input event that could click something (mouse / touch / pen
 * presses on the page, and select-start/end from the VR session). Use it to find out what is triggering a click.
 */
function showClickLog(world: World) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;padding:6px 8px;background:rgba(0,0,0,.75);color:#ffd166;font:12px monospace;pointer-events:none;white-space:pre;max-width:60vw';
  document.body.appendChild(el);
  const lines: string[] = [];
  const log = (msg: string): void => {
    lines.push(`${(performance.now() / 1000).toFixed(1)}s ${msg}`);
    if (lines.length > 10) lines.shift();
    el.textContent = 'clicklog\n' + lines.join('\n');
  };
  log('waiting for input...');
  for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown']) {
    window.addEventListener(type, (e) => {
      const pe = e as PointerEvent;
      log(`${type}${pe.pointerType ? ' (' + pe.pointerType + ')' : ''}${type === 'keydown' ? ' ' + (e as KeyboardEvent).key : ''} isTrusted=${e.isTrusted}`);
    }, true);
  }
  const hookSession = (): void => {
    const sess = world.renderer.xr.getSession();
    if (!sess) return;
    log('vr session started');
    for (const t of ['selectstart', 'selectend', 'squeezestart', 'squeezeend']) {
      sess.addEventListener(t, (e) => {
        const xe = e as Event & { inputSource?: { handedness?: string; hand?: unknown } };
        log(`${t} ${xe.inputSource?.handedness ?? ''}${xe.inputSource?.hand ? ' (hand)' : ' (controller)'}`);
      });
    }
  };
  world.renderer.xr.addEventListener('sessionstart', hookSession);
  hookSession();
}
