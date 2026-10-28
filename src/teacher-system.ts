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
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { PATROL } from './teacher-brain.js';
import { TeacherAI } from './teacher-ai.js';
import { ACTIVE_TUNING } from './tuning.js';
import { inCone } from './vision.js';

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

function buildTeacherBody(): TeacherParts {
  const body = new Group();
  const suit = paint(0x118ab2);

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
    const eye = new Mesh(new SphereGeometry(0.075, 12, 10), white);
    eye.position.set(sx * 0.09, 1.4, -0.17);
    body.add(eye);
    const pupil = new Mesh(new SphereGeometry(0.035, 10, 8), black);
    pupil.position.set(sx * 0.09, 1.4, -0.235);
    body.add(pupil);
    const rim = new Mesh(new TorusGeometry(0.09, 0.012, 8, 20), frame);
    rim.position.set(sx * 0.09, 1.4, -0.205);
    body.add(rim);
  }
  const mouth = new Mesh(new TorusGeometry(0.05, 0.01, 6, 12, Math.PI), black);
  mouth.position.set(0, 1.3, -0.21);
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

function buildExclaim(): Mesh {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#d62839';
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
  g.fillText('!', 64, 70);
  const tex = new CanvasTexture(cv);
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

export class TeacherSystem extends createSystem({}) {
  /** later pieces read these (peek, phone, fruit, fake email) */
  ai = new TeacherAI(PATROL, ACTIVE_TUNING);
  seesPlayer = false;

  private root!: Group;
  private body!: Group;
  private skin!: MeshStandardMaterial;
  private brows!: Group;
  private exclaim!: Mesh;
  private coneMat!: MeshBasicMaterial;
  private rimMat!: LineBasicMaterial;
  private head = new Vector3();
  private clock = 0;
  private shownMode = '';
  private shownSees = false;

  init(): void {
    const classroom = this.world.getSystem(ClassroomSystem);
    if (!classroom) throw new Error('ClassroomSystem must be registered before TeacherSystem');
    if (!this.world.getSystem(ExamSystem)) throw new Error('ExamSystem must be registered before TeacherSystem');

    this.root = new Group();
    this.root.name = 'Teacher';
    const parts = buildTeacherBody();
    this.body = parts.body;
    this.skin = parts.skin;
    this.brows = parts.brows;
    this.root.add(this.body);
    const cone = buildCone(ACTIVE_TUNING.visionRange, ACTIVE_TUNING.visionHalfAngle);
    this.coneMat = cone.material as MeshBasicMaterial;
    this.rimMat = (cone.children[0] as LineLoop).material as LineBasicMaterial;
    this.root.add(cone);
    this.exclaim = buildExclaim();
    this.root.add(this.exclaim);

    this.root.position.set(this.ai.x, 0, this.ai.z);
    this.root.rotation.y = this.ai.yaw;
    this.world.createTransformEntity(this.root, classroom.roomEntity);
  }

  update(delta: number): void {
    // clamp so a tab switch (huge delta) cannot teleport her across the room
    const dt = Math.min(delta, 0.1);
    this.clock += dt;
    const exam = this.world.getSystem(ExamSystem)!.exam;

    this.world.camera.getWorldPosition(this.head);
    const events = this.ai.update(dt, {
      headX: this.head.x,
      headZ: this.head.z,
      playing: exam.phase === 'playing',
      evidence: exam.evidence.active,
    });
    if (events.warned) exam.addWarning();

    this.root.position.x = this.ai.x;
    this.root.position.z = this.ai.z;
    this.root.rotation.y = this.ai.yaw;
    // little waddle while walking, a much angrier one while charging
    const fast = this.ai.mode === 'rush';
    const rate = fast ? 13 : 7;
    this.body.position.y = this.ai.walking ? Math.abs(Math.sin(this.clock * rate)) * (fast ? 0.06 : 0.035) : 0;
    this.body.rotation.z = this.ai.walking ? Math.sin(this.clock * rate) * (fast ? 0.1 : 0.05) : 0;

    const sees = inCone(
      this.ai.x,
      this.ai.z,
      this.ai.yaw,
      this.head.x,
      this.head.z,
      ACTIVE_TUNING.visionRange,
      ACTIVE_TUNING.visionHalfAngle,
    );
    this.seesPlayer = sees;
    if (this.ai.mode !== this.shownMode || sees !== this.shownSees) {
      this.shownMode = this.ai.mode;
      this.shownSees = sees;
      this.applyLook(this.ai.mode, sees);
    }
    if (this.exclaim.visible) this.exclaim.lookAt(this.head); // "!" always faces the player
  }

  private applyLook(mode: string, sees: boolean): void {
    const angry = mode === 'rush' || mode === 'lecture';
    const glare = mode === 'glare';
    this.skin.color.setHex(angry ? SKIN_ANGRY : glare ? SKIN_GLARE : SKIN_NORMAL);
    this.brows.visible = angry || glare;
    this.exclaim.visible = angry;
    const cone = angry ? CONE_ANGRY : glare || sees ? CONE_ALERT : CONE_CALM;
    this.coneMat.color.setHex(cone);
    this.coneMat.opacity = angry ? 0.5 : sees || glare ? 0.45 : 0.38;
    this.rimMat.color.setHex(angry ? 0xffb3ad : 0xfff7b0);
  }
}
