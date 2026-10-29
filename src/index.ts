import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { FruitSystem } from './fruit-system.js';
import { PeekSystem } from './peek-system.js';
import { PhoneSystem } from './phone-system.js';
import { stylePointers } from './pointer-style.js';
import { TeacherSystem } from './teacher-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(ClassroomSystem);
  world.registerSystem(ExamSystem);
  world.registerSystem(TeacherSystem);
  world.registerSystem(PeekSystem);
  world.registerSystem(PhoneSystem);
  world.registerSystem(FruitSystem);

  // sharper picture in the headset: render at 1.3x the default resolution, no foveated blur
  world.renderer.xr.setFramebufferScaleFactor(1.3);
  world.renderer.xr.setFoveation(0);

  // controller rays are created lazily by the SDK, so keep trying until both hands are styled
  const style = stylePointers(world);
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
      fruit: world.getSystem(FruitSystem),
      world,
    };
    if (params.get('view') === 'top') {
      world.camera.position.set(0, 8.5, -1.6);
      world.camera.lookAt(0, 0, -1.9);
    }
  }
});
