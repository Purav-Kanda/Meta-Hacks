import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { PeekSystem } from './peek-system.js';
import { TeacherSystem } from './teacher-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(ClassroomSystem);
  world.registerSystem(ExamSystem);
  world.registerSystem(TeacherSystem);
  world.registerSystem(PeekSystem);

  // Dev helpers, only active with ?debug in the URL (ignored in normal play).
  //   ?debug            exposes window.__game for console poking
  //   ?debug&view=top   overhead camera so you can watch the teacher's route (flat browser view only)
  const params = new URLSearchParams(window.location.search);
  if (params.has('debug')) {
    (window as unknown as Record<string, unknown>).__game = {
      exam: world.getSystem(ExamSystem),
      teacher: world.getSystem(TeacherSystem),
      peek: world.getSystem(PeekSystem),
      world,
    };
    if (params.get('view') === 'top') {
      world.camera.position.set(0, 8.5, -1.6);
      world.camera.lookAt(0, 0, -1.9);
    }
  }
});
