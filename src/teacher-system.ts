import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { PATROL, PATROL_OUTER } from './teacher-brain.js';
import { TeacherAI } from './teacher-ai.js';
import { ACTIVE_TUNING, BUILT_VISION_RANGE, onTuningChange } from './tuning.js';
import { inCone } from './vision.js';
import { PuffPool } from './effects.js';
import { roundStats } from './progress.js';
import { SEATING } from './seating.js';

const CONE_CALM = 0xffe066; // she has not spotted you
const CONE_ALERT = 0xff9f1c; // you are inside her cone
const CONE_ANGRY = 0xff3b30; // she is charging at you / scolding you
const SKIN_NORMAL = 0xf1c27d;
const SKIN_GLARE = 0xf08a4b;
const SKIN_ANGRY = 0xe63946;
const CONE_SEGMENTS = 20;

const paint = (hex: number): MeshStandardMaterial =>
  new MeshStandardMaterial({ color: hex, roughness: 1 });

interface TeacherParts {
  body: Group;
  skin: MeshStandardMaterial;
  brows: Group;
}

function buildTeacherBody(suitHex = 0x118ab2): TeacherParts {
  const body = new Group();
  const suit = paint(suitHex);

  const torso = new Mesh(new CapsuleGeometry(0.16, 0.55, 4, 10), suit);
  torso.position.y = 0.82;
  body.add(torso);

  const tie = new Mesh(new CapsuleGeometry(0.03, 0.3, 3, 6), paint(0xe63946));
  tie.position.set(0, 0.88, -0.15);
  body.add(tie);

  for (const sx of [-1, 1]) {
    const leg = new Mesh(new CylinderGeometry(0.055, 0.055, 0.3, 8), paint(0x2b2d42));
    leg.position.set(sx * 0.075, 0.15, 0);
    body.add(leg);
    const arm = new Mesh(new CapsuleGeometry(0.05, 0.38, 3, 6), suit);
    arm.position.set(sx * 0.24, 0.82, 0);
    arm.rotation.z = -sx * 0.18;
    body.add(arm);
  }

  const skin = paint(SKIN_NORMAL);
  const head = new Mesh(new SphereGeometry(0.22, 18, 14), skin);
  head.position.y = 1.38;
  body.add(head);

  const hair = new Mesh(
    new SphereGeometry(0.23, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.2),
    paint(0xb8b8c0),
  );
  hair.position.y = 1.4;
  body.add(hair);
  const bun = new Mesh(new SphereGeometry(0.08, 10, 8), paint(0xb8b8c0));
  bun.position.set(0, 1.64, 0.05);
  body.add(bun);

  const white = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const black = new MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
  const frame = paint(0xff6bb5);
  for (const sx of [-1, 1]) {
    const eye = new Mesh(new SphereGeometry(0.065, 12, 10), white);
    eye.position.set(sx * 0.09, 1.4, -0.19);
    body.add(eye);
    const pupil = new Mesh(new SphereGeometry(0.032, 10, 8), black);
    pupil.position.set(sx * 0.09, 1.4, -0.243);
    body.add(pupil);
    // glasses sit clearly in front of the face so they never sink into it
    const rim = new Mesh(new TorusGeometry(0.08, 0.011, 8, 20), frame);
    rim.position.set(sx * 0.09, 1.4, -0.285);
    body.add(rim);
    const arm = new Mesh(new BoxGeometry(0.012, 0.012, 0.23), frame);
    arm.position.set(sx * 0.19, 1.4, -0.175);
    arm.rotation.y = sx * 0.2;
    body.add(arm);
  }
  const bridge = new Mesh(new BoxGeometry(0.04, 0.012, 0.012), frame);
  bridge.position.set(0, 1.405, -0.285);
  body.add(bridge);
  const mouth = new Mesh(new TorusGeometry(0.05, 0.01, 6, 12, Math.PI), black);
  mouth.position.set(0, 1.3, -0.218);
  body.add(mouth); // upside-down arc = permanent frown, she is not fun at parties

  // angry eyebrows, only visible when she is mad
  const brows = new Group();
  const browMat = paint(0x2b2d42);
  for (const sx of [-1, 1]) {
    const brow = new Mesh(new BoxGeometry(0.13, 0.028, 0.03), browMat);
    brow.position.set(sx * 0.09, 1.51, -0.2);
    brow.rotation.z = sx * -0.5; // inner ends dip toward the nose
    brows.add(brow);
  }
  brows.visible = false;
  body.add(brows);
  return { body, skin, brows };
}

function buildExclaim(char = '!', color = '#d62839'): Mesh {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = color;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#fff';
  g.font = 'bold 92px "Comic Sans MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(char, 64, 70);
  const tex = new CanvasTexture(cv);
  tex.anisotropy = 16; // three.js clamps to what the GPU supports; keeps tilted text crisp
  tex.colorSpace = SRGBColorSpace;
  const m = new Mesh(
    new PlaneGeometry(0.34, 0.34),
    new MeshBasicMaterial({ map: tex, transparent: true }),
  );
  m.position.y = 2.0;
  m.visible = false;
  return m;
}

/** flat fan on the floor, apex at the teacher, pointing toward -Z in local space */
function buildCone(range: number, halfAngle: number): Mesh {
  const verts: number[] = [0, 0, 0];
  for (let i = 0; i <= CONE_SEGMENTS; i++) {
    const a = -halfAngle + (2 * halfAngle * i) / CONE_SEGMENTS;
    verts.push(Math.sin(a) * range, 0, -Math.cos(a) * range);
  }
  const idx: number[] = [];
  for (let i = 1; i <= CONE_SEGMENTS; i++) idx.push(0, i + 1, i);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  const mat = new MeshBasicMaterial({
    color: CONE_CALM,
    transparent: true,
    opacity: 0.38,
    side: DoubleSide,
    depthWrite: false,
  });
  const cone = new Mesh(geo, mat);
  cone.position.y = 0.03;
  cone.renderOrder = 2;

  // bright rim so the edge reads clearly on the wood
  const rim: number[] = [0, 0, 0];
  for (let i = 0; i <= CONE_SEGMENTS; i++) {
    const a = -halfAngle + (2 * halfAngle * i) / CONE_SEGMENTS;
    rim.push(Math.sin(a) * range, 0, -Math.cos(a) * range);
  }
  const rimGeo = new BufferGeometry();
  rimGeo.setAttribute('position', new Float32BufferAttribute(rim, 3));
  const outline = new LineLoop(rimGeo, new LineBasicMaterial({ color: 0xfff7b0 }));
  outline.position.y = 0.005;
  outline.renderOrder = 3;
  cone.add(outline);
  return cone;
}

/** One teacher: her brain plus everything drawn for her (body, vision cone, "!" and "?" bubbles). */
class TeacherActor {
  readonly root = new Group();
  readonly body: Group;
  readonly skin: MeshStandardMaterial;
  readonly brows: Group;
  readonly exclaim: Mesh;
  readonly question: Mesh;
  readonly coneMesh: Mesh;
  readonly coneMat: MeshBasicMaterial;
  readonly rimMat: LineBasicMaterial;
  seesPlayer = false;
  private shownScale = 1;
  private shownMode = '';
  private shownSees = false;
  private wasRush = false;
  private puffTimer = 0;

  constructor(
    readonly ai: TeacherAI,
    name: string,
    suitHex: number,
  ) {
    this.root.name = name;
    const parts = buildTeacherBody(suitHex);
    this.body = parts.body;
    this.skin = parts.skin;
    this.brows = parts.brows;
    this.root.add(this.body);
    const cone = buildCone(BUILT_VISION_RANGE, ACTIVE_TUNING.visionHalfAngle);
    this.coneMesh = cone;
    this.coneMat = cone.material as MeshBasicMaterial;
    this.rimMat = (cone.children[0] as LineLoop).material as LineBasicMaterial;
    this.root.add(cone);
    this.exclaim = buildExclaim();
    this.root.add(this.exclaim);
    this.question = buildExclaim('?', '#3a86ff');
    this.root.add(this.question);
    this.root.position.set(ai.x, 0, ai.z);
    this.root.rotation.y = ai.yaw;
  }

  update(dt: number, clock: number, head: Vector3, headWorld: Vector3, rangeScale: number, puffs: PuffPool): void {
    const ai = this.ai;
    this.root.position.x = ai.x;
    this.root.position.z = ai.z;
    this.root.rotation.y = ai.yaw;
    // little waddle while walking, a much angrier one while charging
    const fast = ai.mode === 'rush';
    const rate = fast ? 13 : 7;
    this.body.position.y = ai.walking ? Math.abs(Math.sin(clock * rate)) * (fast ? 0.06 : 0.035) : 0;
    this.body.rotation.z = ai.walking ? Math.sin(clock * rate) * (fast ? 0.1 : 0.05) : 0;

    const sees = inCone(ai.x, ai.z, ai.yaw, head.x, head.z, ACTIVE_TUNING.visionRange * rangeScale, ACTIVE_TUNING.visionHalfAngle);
    this.seesPlayer = sees;
    // ease the drawn cone toward the current range so the glow visibly stretches it
    this.shownScale += (rangeScale - this.shownScale) * Math.min(1, dt * 6);
    const k = this.shownScale * (ACTIVE_TUNING.visionRange / BUILT_VISION_RANGE);
    this.coneMesh.scale.set(k, 1, k);
    if (ai.mode !== this.shownMode || sees !== this.shownSees) {
      this.shownMode = ai.mode;
      this.shownSees = sees;
      this.applyLook(ai.mode, sees, puffs);
    }
    if (this.exclaim.visible) this.exclaim.lookAt(headWorld); // "!" always faces the player
    if (this.question.visible) this.question.lookAt(headWorld);

    // charging: kick up smoke behind her feet, like a car pulling away
    if (ai.mode === 'rush' && ai.walking) {
      this.puffTimer -= dt;
      if (this.puffTimer <= 0) {
        this.puffTimer = 0.06;
        const fx = -Math.sin(ai.yaw);
        const fz = -Math.cos(ai.yaw);
        puffs.emit(
          ai.x - fx * 0.14 + (Math.random() - 0.5) * 0.1,
          0.06,
          ai.z - fz * 0.14 + (Math.random() - 0.5) * 0.1,
          0.2,
          0.9,
          -fx * 0.35,
          -fz * 0.35,
          0.3,
        );
      }
    }
  }

  private applyLook(mode: string, sees: boolean, puffs: PuffPool): void {
    const angry = mode === 'rush' || mode === 'lecture';
    const glare = mode === 'glare';
    this.skin.color.setHex(angry ? SKIN_ANGRY : glare ? SKIN_GLARE : SKIN_NORMAL);
    this.brows.visible = angry || glare;
    this.exclaim.visible = angry;
    this.question.visible = mode === 'distracted';
    if (mode === 'rush' && !this.wasRush) puffs.burst(this.ai.x, this.ai.z, 9, 0.2, 0.9); // the "screech" at the start of a charge
    this.wasRush = mode === 'rush';
    const cone = angry ? CONE_ANGRY : glare || sees ? CONE_ALERT : CONE_CALM;
    this.coneMat.color.setHex(cone);
    this.coneMat.opacity = angry ? 0.5 : sees || glare ? 0.45 : 0.38;
    this.rimMat.color.setHex(angry ? 0xffb3ad : 0xfff7b0);
  }
}

const busy = (a: TeacherAI): boolean => a.mode === 'rush' || a.mode === 'glare' || a.mode === 'lecture';

export class TeacherSystem extends createSystem({}) {
  /** the first teacher; always in the room. Other pieces read this one */
  private readonly first = new TeacherActor(new TeacherAI(PATROL, ACTIVE_TUNING), 'Teacher', 0x118ab2);
  /** the second teacher, only in the room in Not Easy */
  private readonly second = new TeacherActor(
    new TeacherAI(PATROL_OUTER, ACTIVE_TUNING, { right: 8, left: 3, distract: 0 }),
    'Teacher2',
    0x7b2cbf,
  );
  get ai(): TeacherAI {
    return this.first.ai;
  }
  /** every teacher currently in the room (reused array, do not modify) */
  readonly ais: TeacherAI[] = [this.first.ai];
  seesPlayer = false;
  /** any teacher charging at you / handing out a warning this frame */
  anyRush = false;
  anyWarned = false;

  /** dust/smoke puffs (her charge, landing fruit); other systems may emit into it */
  puffs!: PuffPool;
  /** set by other systems (phone glow) to widen how far they see */
  rangeScale = 1;
  private head = new Vector3();
  private headWorld = new Vector3();
  private camQ = new Quaternion();
  private clock = 0;
  private secondIn = false;

  init(): void {
    const classroom = this.world.getSystem(ClassroomSystem);
    if (!classroom) throw new Error('ClassroomSystem must be registered before TeacherSystem');
    if (!this.world.getSystem(ExamSystem)) throw new Error('ExamSystem must be registered before TeacherSystem');
    this.world.createTransformEntity(this.first.root, classroom.roomEntity);
    this.world.createTransformEntity(this.second.root, classroom.roomEntity);
    this.second.root.visible = false;
    // puffs live in room space (not under her) so they stay behind when she moves
    this.puffs = new PuffPool(classroom.roomEntity.object3D!, 32);
    onTuningChange(() => this.syncCount());
  }

  /** put the second teacher in or out of the room to match the difficulty */
  private syncCount(): void {
    const want = ACTIVE_TUNING.teacherCount >= 2;
    if (want === this.secondIn) return;
    this.secondIn = want;
    this.second.root.visible = want;
    this.ais.length = 0;
    this.ais.push(this.first.ai);
    if (want) {
      this.second.ai.reset();
      this.ais.push(this.second.ai);
    }
  }

  update(delta: number): void {
    // clamp so a tab switch (huge delta) cannot teleport her across the room
    const dt = Math.min(delta, 0.1);
    this.clock += dt;
    const exam = this.world.getSystem(ExamSystem)!.exam;

    this.world.camera.getWorldPosition(this.headWorld);
    // she lives in room coordinates; you sit at the world origin, so add your seat's offset
    this.head.copy(this.headWorld);
    this.head.x += SEATING.dx;
    this.head.z += SEATING.dz;
    const ctx = this.ctx;
    ctx.headX = this.head.x;
    ctx.headZ = this.head.z;
    ctx.playing = exam.phase === 'playing';
    ctx.rangeScale = this.rangeScale;
    this.anyWarned = false;
    for (let i = 0; i < this.ais.length; i++) {
      const ai = this.ais[i];
      // only one teacher deals with a cheater at a time: ignore evidence while the other one is busy with it
      let other = false;
      for (let j = 0; j < this.ais.length; j++) if (j !== i && busy(this.ais[j])) other = true;
      ctx.evidence = exam.evidence.active && !other;
      const events = ai.update(dt, ctx);
      if (events.forgave && exam.phase === 'playing') roundStats.hidInTime += 1;
      if (events.warned) {
        exam.addWarning();
        this.anyWarned = true;
      }
    }

    this.first.update(dt, this.clock, this.head, this.headWorld, this.rangeScale, this.puffs);
    if (this.secondIn) this.second.update(dt, this.clock, this.head, this.headWorld, this.rangeScale, this.puffs);
    this.seesPlayer = this.first.seesPlayer || (this.secondIn && this.second.seesPlayer);
    this.anyRush = false;
    for (let i = 0; i < this.ais.length; i++) if (this.ais[i].mode === 'rush') this.anyRush = true;

    this.world.camera.getWorldQuaternion(this.camQ);
    this.puffs.update(dt, this.camQ);
  }

  private readonly ctx = { headX: 0, headZ: 0, playing: false, evidence: false, rangeScale: 1 };
}
