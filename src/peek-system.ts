import {
  CanvasTexture,
  Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PokeInteractable,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { PeekButton } from './exam-components.js';
import { PeekModel, type Side } from './peek.js';
import { TeacherSystem } from './teacher-system.js';
import { ACTIVE_TUNING } from './tuning.js';

const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
const LOOK_YAW = 0.6; // radians (~34 deg) of head turn that counts as "looking at a neighbor"
const LETTERS = ['A', 'B', 'C'];
const SIDE_COLOR = ['#ffb703', '#06d6a0'];
const SIDE_NAME = ['LEFT KID', 'RIGHT KID'];
// where the HIDE button can sit on the note (note-local meters); it jumps between these while she rushes
const HIDE_SPOTS: Array<[number, number]> = [
  [0, -0.115],
  [0.19, 0.04],
  [-0.19, 0.0],
  [0.12, 0.13],
  [-0.14, -0.12],
];
const NOTE_POS = new Vector3(0.42, 1.02, -0.5);
const BUBBLE_POS: Array<[number, number, number]> = [
  [-1.2, 0.98, -0.45],
  [1.2, 0.98, -0.45],
];
const EYE = new Vector3(0, 1.1, 0.2);

function canvasTex(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  return { g, tex };
}

function faceYaw(from: Vector3): number {
  return Math.atan2(EYE.x - from.x, EYE.z - from.z);
}

/**
 * Peek: turn your head toward a neighbor, a PEEK bubble pops up over their desk,
 * press it to read their answer on a floating note. The note is evidence until you
 * press HIDE, and while the teacher is rushing HIDE keeps jumping around.
 */
export class PeekSystem extends createSystem({
  pressed: { required: [PeekButton, Pressed] },
}) {
  /** exposed for ?debug and later pieces */
  model = new PeekModel(
    {
      accuracy: ACTIVE_TUNING.peekAccuracy,
      glanceSeconds: ACTIVE_TUNING.peekGlanceSeconds,
      dodgeSeconds: ACTIVE_TUNING.hideDodgeSeconds,
      hideSlots: HIDE_SPOTS.length,
    },
    Math.random,
  );

  private bubbles: Mesh[] = [];
  private note!: Group;
  private noteG!: CanvasRenderingContext2D;
  private noteTex!: CanvasTexture;
  private hideMesh!: Mesh;
  private dir = new Vector3();
  private wasPlaying = false;
  private lastCursor = -1;
  private shownNote = -2;
  private shownAnswer = -2;
  private exam!: ExamSystem;
  private teacher!: TeacherSystem;

  init(): void {
    const classroom = this.world.getSystem(ClassroomSystem);
    const exam = this.world.getSystem(ExamSystem);
    const teacher = this.world.getSystem(TeacherSystem);
    if (!classroom || !exam || !teacher) throw new Error('Classroom, Exam and Teacher systems must be registered before PeekSystem');
    this.exam = exam;
    this.teacher = teacher;

    // PEEK bubbles over each neighbor's paper
    for (let s = 0; s < 2; s++) {
      const c = canvasTex(440, 260);
      this.paintBubble(c.g, s);
      c.tex.needsUpdate = true;
      const mesh = new Mesh(new PlaneGeometry(0.3, 0.178), new MeshBasicMaterial({ map: c.tex, transparent: true }));
      mesh.position.set(...BUBBLE_POS[s]);
      mesh.rotation.y = faceYaw(mesh.position);
      mesh.renderOrder = 4;
      mesh.visible = false;
      this.bubbles.push(mesh);
      const e = this.world.createTransformEntity(mesh, classroom.roomEntity);
      e.addComponent(PeekButton, { kind: s });
      e.addComponent(RayInteractable);
      e.addComponent(PokeInteractable);
    }

    // the note + its HIDE button
    this.note = new Group();
    this.note.position.copy(NOTE_POS);
    this.note.rotation.y = faceYaw(NOTE_POS);
    this.note.visible = false;
    const n = canvasTex(520, 320);
    this.noteG = n.g;
    this.noteTex = n.tex;
    const card = new Mesh(new PlaneGeometry(0.26, 0.16), new MeshBasicMaterial({ map: n.tex, transparent: true }));
    this.note.add(card);
    const noteEntity = this.world.createTransformEntity(this.note, classroom.roomEntity);

    const h = canvasTex(330, 170);
    this.paintHide(h.g);
    h.tex.needsUpdate = true;
    this.hideMesh = new Mesh(new PlaneGeometry(0.11, 0.057), new MeshBasicMaterial({ map: h.tex, transparent: true }));
    this.hideMesh.position.set(HIDE_SPOTS[0][0], HIDE_SPOTS[0][1], 0.012);
    this.hideMesh.renderOrder = 6;
    const he = this.world.createTransformEntity(this.hideMesh, noteEntity);
    he.addComponent(PeekButton, { kind: 2 });
    he.addComponent(RayInteractable);
    he.addComponent(PokeInteractable);

    this.queries.pressed.subscribe('qualify', (e: Entity) => {
      const kind = e.getValue(PeekButton, 'kind') as number;
      if (this.exam.exam.phase !== 'playing') return;
      if (kind === 2) this.model.hide();
      else this.model.peek(kind as Side);
    });
  }

  update(delta: number): void {
    const ex = this.exam.exam;
    const playing = ex.phase === 'playing';
    if (!playing) {
      if (this.wasPlaying) this.clearAll();
      this.wasPlaying = false;
      return;
    }
    if (!this.wasPlaying) {
      this.model.reset();
      this.lastCursor = -1;
      this.wasPlaying = true;
    }
    if (ex.cursor !== this.lastCursor) {
      this.lastCursor = ex.cursor;
      this.model.newQuestion(ex.correctSlot());
    }

    this.world.camera.getWorldDirection(this.dir);
    const yaw = Math.atan2(-this.dir.x, -this.dir.z);
    const look: -1 | Side = yaw > LOOK_YAW ? 0 : yaw < -LOOK_YAW ? 1 : -1;
    const rushing = this.teacher.ai.mode === 'rush';
    this.model.update(Math.min(delta, 0.1), look, rushing);
    ex.evidence.set('peek', this.model.evidence);
    this.syncView();
  }

  private clearAll(): void {
    this.model.reset();
    this.exam.exam.evidence.set('peek', false);
    this.syncView();
  }

  private syncView(): void {
    const m = this.model;
    for (let s = 0; s < 2; s++) {
      this.bubbles[s].visible = m.bubble === s && !(m.note === s && m.noteRead);
    }
    this.note.visible = m.note !== -1;
    const spot = HIDE_SPOTS[m.hideSlot];
    this.hideMesh.position.x = spot[0];
    this.hideMesh.position.y = spot[1];
    const ans = m.noteAnswer;
    if (m.note !== this.shownNote || ans !== this.shownAnswer) {
      this.shownNote = m.note;
      this.shownAnswer = ans;
      if (m.note !== -1) this.paintNote(m.note, ans);
    }
  }

  private paintBubble(g: CanvasRenderingContext2D, side: number): void {
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = SIDE_COLOR[side];
    g.strokeStyle = '#ffffff';
    g.lineWidth = 10;
    g.beginPath();
    g.roundRect(8, 8, w - 16, h - 60, 50);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(w / 2 - 30, h - 54);
    g.lineTo(w / 2, h - 6);
    g.lineTo(w / 2 + 30, h - 54);
    g.closePath();
    g.fill();
    g.fillStyle = '#222';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 92px ${FONT}`;
    g.fillText('PEEK!', w / 2, (h - 60) / 2 + 8);
  }

  private paintHide(g: CanvasRenderingContext2D): void {
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#d62839';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.beginPath();
    g.roundRect(6, 6, w - 12, h - 12, 40);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 78px ${FONT}`;
    g.fillText('HIDE!', w / 2, h / 2 + 4);
  }

  private paintNote(side: number, answer: number): void {
    const g = this.noteG;
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fffdf2';
    g.strokeStyle = SIDE_COLOR[side];
    g.lineWidth = 16;
    g.beginPath();
    g.roundRect(8, 8, w - 16, h - 16, 36);
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#444';
    g.font = `bold 42px ${FONT}`;
    g.fillText(`${SIDE_NAME[side]} says`, w / 2, 62);
    g.fillStyle = answer >= 0 ? '#d6335a' : '#999';
    g.font = `bold ${answer >= 0 ? 170 : 120}px ${FONT}`;
    g.fillText(answer >= 0 ? LETTERS[answer] : '?', w / 2, 172);
    g.fillStyle = '#6a4cff';
    g.font = `italic 30px ${FONT}`;
    g.fillText(answer >= 0 ? '(trust them? ...)' : '(peek again for this one)', w / 2, 262);
    this.noteTex.needsUpdate = true;
  }
}
