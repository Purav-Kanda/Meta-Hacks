import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  LinearFilter,
  SRGBColorSpace,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { PhoneButton } from './exam-components.js';
import { PhoneModel } from './phone.js';
import { TeacherSystem } from './teacher-system.js';
import { ACTIVE_TUNING, onTuningChange } from './tuning.js';
import { roundStats } from './progress.js';
import { ROUND } from './modes.js';

const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
const LETTERS = ['A', 'B', 'C'];
const PHONE_POS = new Vector3(-0.45, 1.0, -0.45); // raised, floating at the left of your paper
const EYE = new Vector3(0, 1.3, 0.2);
// where HIDE can sit around the raised phone (phone-local meters); it jumps between these while she rushes
const HIDE_SPOTS: Array<[number, number]> = [
  [0, -0.15],
  [0.115, 0.06],
  [-0.115, 0.0],
  [0.11, -0.1],
  [-0.11, 0.11],
];

function canvasTex(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const tex = new CanvasTexture(cv);
  tex.anisotropy = 16; // three.js clamps to what the GPU supports; keeps tilted text crisp
  tex.colorSpace = SRGBColorSpace;
  // these get repainted while you play and are always close to your eyes: skip the mip-map rebuild on every upload
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  return { g, tex };
}

function glowTexture(): CanvasTexture {
  const c = canvasTex(256, 256);
  const grad = c.g.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0, 'rgba(120,230,255,0.95)');
  grad.addColorStop(0.45, 'rgba(70,170,255,0.45)');
  grad.addColorStop(1, 'rgba(70,170,255,0)');
  c.g.fillStyle = grad;
  c.g.fillRect(0, 0, 256, 256);
  c.tex.needsUpdate = true;
  return c.tex;
}

/**
 * The phone: lies on your desk. Tap to raise it (it glows: evidence, and she sees farther),
 * press ASK, wait out the buffering, read the correct answer, then it cools down.
 * If she warns you while it is out she confiscates it for good.
 */
export class PhoneSystem extends createSystem({
  pressed: { required: [PhoneButton, Pressed] },
}) {
  model = new PhoneModel(
    {
      bufferMin: ACTIVE_TUNING.phoneBufferMin,
      bufferMax: ACTIVE_TUNING.phoneBufferMax,
      cooldown: ACTIVE_TUNING.phoneCooldown,
      dodgeSeconds: ACTIVE_TUNING.hideDodgeSeconds,
      hideSlots: HIDE_SPOTS.length,
    },
    Math.random,
  );

  private exam!: ExamSystem;
  private teacher!: TeacherSystem;
  private deskPhone!: Mesh;
  private tape!: Mesh;
  private raised!: Group;
  private halo!: Mesh;
  private haloMat!: MeshBasicMaterial;
  private screenG!: CanvasRenderingContext2D;
  private screenTex!: CanvasTexture;
  private askG!: CanvasRenderingContext2D;
  private askTex!: CanvasTexture;
  private hideMesh!: Mesh;
  private clock = 0;
  private wasPlaying = false;
  private lastCursor = -1;
  private shownScreen = '';
  private shownAsk = '';

  init(): void {
    onTuningChange(() => {
      const r = this.model.rules;
      r.bufferMin = ACTIVE_TUNING.phoneBufferMin;
      r.bufferMax = ACTIVE_TUNING.phoneBufferMax;
      r.cooldown = ACTIVE_TUNING.phoneCooldown;
      r.dodgeSeconds = ACTIVE_TUNING.hideDodgeSeconds;
    });
    const classroom = this.world.getSystem(ClassroomSystem);
    const exam = this.world.getSystem(ExamSystem);
    const teacher = this.world.getSystem(TeacherSystem);
    if (!classroom || !exam || !teacher) throw new Error('Classroom, Exam and Teacher systems must be registered before PhoneSystem');
    this.exam = exam;
    this.teacher = teacher;

    // phone lying on the desk (dark until you pick it up)
    const d = canvasTex(200, 360);
    this.paintDeskPhone(d.g);
    d.tex.needsUpdate = true;
    this.deskPhone = new Mesh(new PlaneGeometry(0.1, 0.18), new MeshBasicMaterial({ map: d.tex, transparent: true, depthWrite: false }));
    this.deskPhone.renderOrder = 1;
    this.deskPhone.rotation.x = -Math.PI / 2;
    this.deskPhone.rotation.z = 0.35;
    this.deskPhone.position.set(-0.42, 0.784, -0.28);
    const de = this.world.createTransformEntity(this.deskPhone, classroom.seatEntity);
    de.addComponent(PhoneButton, { kind: 0 });
    de.addComponent(RayInteractable);

    // "CONFISCATED" tape where the phone used to be
    const t = canvasTex(320, 120);
    t.g.fillStyle = '#d62839';
    t.g.beginPath();
    t.g.roundRect(4, 4, 312, 112, 20);
    t.g.fill();
    t.g.fillStyle = '#fff';
    t.g.textAlign = 'center';
    t.g.textBaseline = 'middle';
    t.g.font = `bold 46px ${FONT}`;
    t.g.fillText('CONFISCATED', 160, 62);
    t.tex.needsUpdate = true;
    this.tape = new Mesh(new PlaneGeometry(0.16, 0.06), new MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false }));
    this.tape.renderOrder = 2;
    this.tape.rotation.x = -Math.PI / 2;
    this.tape.rotation.z = 0.35;
    this.tape.position.set(-0.42, 0.785, -0.28);
    this.tape.visible = false;
    this.world.createTransformEntity(this.tape, classroom.seatEntity);

    // the raised, glowing phone
    this.raised = new Group();
    this.raised.position.copy(PHONE_POS);
    this.raised.rotation.y = Math.atan2(EYE.x - PHONE_POS.x, EYE.z - PHONE_POS.z);
    this.raised.visible = false;
    const body = new Mesh(new BoxGeometry(0.15, 0.27, 0.01), new MeshStandardMaterial({ color: 0x1b1b2b, roughness: 0.4 }));
    body.position.z = -0.007;
    this.raised.add(body);
    const s = canvasTex(280, 520);
    this.screenG = s.g;
    this.screenTex = s.tex;
    const screen = new Mesh(new PlaneGeometry(0.14, 0.26), new MeshBasicMaterial({ map: s.tex }));
    this.raised.add(screen);
    this.haloMat = new MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false });
    this.halo = new Mesh(new PlaneGeometry(0.5, 0.5), this.haloMat);
    this.halo.position.z = -0.03;
    this.halo.renderOrder = 3;
    this.raised.add(this.halo);
    const phoneEntity = this.world.createTransformEntity(this.raised, classroom.seatEntity);

    const a = canvasTex(300, 135);
    this.askG = a.g;
    this.askTex = a.tex;
    const ask = new Mesh(new PlaneGeometry(0.1, 0.045), new MeshBasicMaterial({ map: a.tex, transparent: true, depthWrite: false }));
    ask.position.set(0, -0.075, 0.008);
    ask.renderOrder = 6;
    const ae = this.world.createTransformEntity(ask, phoneEntity);
    ae.addComponent(PhoneButton, { kind: 1 });
    ae.addComponent(RayInteractable);

    const h = canvasTex(240, 136);
    h.g.fillStyle = '#d62839';
    h.g.strokeStyle = '#fff';
    h.g.lineWidth = 8;
    h.g.beginPath();
    h.g.roundRect(6, 6, 228, 124, 34);
    h.g.fill();
    h.g.stroke();
    h.g.fillStyle = '#fff';
    h.g.textAlign = 'center';
    h.g.textBaseline = 'middle';
    h.g.font = `bold 62px ${FONT}`;
    h.g.fillText('HIDE!', 120, 70);
    h.tex.needsUpdate = true;
    this.hideMesh = new Mesh(new PlaneGeometry(0.11, 0.063), new MeshBasicMaterial({ map: h.tex, transparent: true, depthWrite: false }));
    this.hideMesh.position.set(HIDE_SPOTS[0][0], HIDE_SPOTS[0][1], 0.012);
    this.hideMesh.renderOrder = 7;
    const he = this.world.createTransformEntity(this.hideMesh, phoneEntity);
    he.addComponent(PhoneButton, { kind: 2 });
    he.addComponent(RayInteractable);

    this.queries.pressed.subscribe('qualify', (e: Entity) => {
      if (this.exam.exam.phase !== 'playing') return;
      const kind = e.getValue(PhoneButton, 'kind') as number;
      if (kind === 0) {
        if (ROUND.allows('phone')) this.model.raise();
      }
      else if (kind === 1) {
        if (this.model.ask()) roundStats.phoneAsks += 1;
      }
      else this.model.hide();
    });
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.1);
    this.clock += dt;
    const ex = this.exam.exam;
    if (ex.phase !== 'playing') {
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
      this.model.newQuestion();
    }
    // she just handed out a warning while the phone was out: she takes it
    if (this.teacher.anyWarned && this.model.state === 'up') this.model.confiscate();

    this.model.update(dt, ex.correctSlot(), this.teacher.anyRush);
    ex.evidence.set('phone', this.model.evidence);
    this.teacher.rangeScale = this.model.evidence ? ACTIVE_TUNING.phoneGlowScale : 1;
    this.syncView();
  }

  private clearAll(): void {
    this.model.reset();
    this.exam.exam.evidence.set('phone', false);
    this.teacher.rangeScale = 1;
    this.syncView();
  }

  private syncView(): void {
    const m = this.model;
    this.deskPhone.visible = m.state === 'pocket' && ROUND.allows('phone');
    this.tape.visible = m.state === 'gone';
    this.raised.visible = m.state === 'up';
    if (m.state !== 'up') return;
    this.haloMat.opacity = 0.5 + 0.08 * Math.sin(this.clock * 3); // a calm glow: a big fast pulse right in front of your eyes reads as flicker
    const spot = HIDE_SPOTS[m.hideSlot];
    this.hideMesh.position.x = spot[0];
    this.hideMesh.position.y = spot[1];

    const mode = m.buffering ? 'buffer' : m.answer >= 0 ? 'answer' : m.cooldownLeft > 0 ? 'cool' : 'ready';
    const tick = mode === 'buffer' ? Math.floor(this.clock * 10) : mode === 'cool' ? Math.ceil(m.cooldownLeft) : m.answer;
    const key = `${mode}|${tick}`;
    if (key !== this.shownScreen) {
      this.shownScreen = key;
      this.paintScreen(mode);
    }
    const askKey = m.canAsk ? 'on' : 'off';
    if (askKey !== this.shownAsk) {
      this.shownAsk = askKey;
      this.paintAsk(m.canAsk);
    }
  }

  private paintDeskPhone(g: CanvasRenderingContext2D): void {
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#1b1b2b';
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 36);
    g.fill();
    g.fillStyle = '#2d3a5a';
    g.beginPath();
    g.roundRect(18, 18, w - 36, h - 36, 24);
    g.fill();
    g.fillStyle = '#5ee1ff';
    g.beginPath();
    g.arc(w / 2, h / 2 - 20, 34, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 34px ${FONT}`;
    g.fillText('pinch', w / 2, h / 2 + 60);
  }

  private paintScreen(mode: string): void {
    const g = this.screenG;
    const w = g.canvas.width;
    const h = g.canvas.height;
    const m = this.model;
    g.fillStyle = '#0f1630';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#12b5cb';
    g.fillRect(0, 0, w, 70);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 40px ${FONT}`;
    g.fillText('HELPBOT', w / 2, 38);

    if (mode === 'buffer') {
      const a0 = this.clock * 8;
      g.strokeStyle = '#5ee1ff';
      g.lineWidth = 16;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(w / 2, 220, 56, a0, a0 + 4.2);
      g.stroke();
      g.fillStyle = '#cfe9ff';
      g.font = `bold 34px ${FONT}`;
      g.fillText('searching...', w / 2, 330);
      g.font = `26px ${FONT}`;
      g.fillStyle = '#7a8fb8';
      g.fillText('(bad wifi)', w / 2, 372);
    } else if (mode === 'answer') {
      g.fillStyle = '#9fb4e0';
      g.font = `bold 32px ${FONT}`;
      g.fillText('the answer is', w / 2, 120);
      g.fillStyle = '#7dff9e';
      g.font = `bold 230px ${FONT}`;
      g.fillText(LETTERS[m.answer], w / 2, 260);
      g.fillStyle = '#7a8fb8';
      g.font = `italic 28px ${FONT}`;
      g.fillText('(100% legit)', w / 2, 372);
    } else if (mode === 'cool') {
      g.fillStyle = '#ff6b6b';
      g.font = `bold 44px ${FONT}`;
      g.fillText('NO SIGNAL', w / 2, 170);
      g.fillStyle = '#cfe9ff';
      g.font = `bold 110px ${FONT}`;
      g.fillText(`${Math.ceil(m.cooldownLeft)}s`, w / 2, 270);
      g.fillStyle = '#7a8fb8';
      g.font = `26px ${FONT}`;
      g.fillText('recharging brain', w / 2, 360);
    } else {
      g.fillStyle = '#1d2a55';
      g.beginPath();
      g.roundRect(24, 110, w - 48, 120, 30);
      g.fill();
      g.fillStyle = '#cfe9ff';
      g.font = `bold 28px ${FONT}`;
      g.fillText('Ask me anything!', w / 2, 170);
    }
    this.screenTex.needsUpdate = true;
  }

  private paintAsk(enabled: boolean): void {
    const g = this.askG;
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = enabled ? '#06b57f' : '#4a5470';
    g.strokeStyle = '#fff';
    g.lineWidth = 8;
    g.beginPath();
    g.roundRect(6, 6, w - 12, h - 12, 40);
    g.fill();
    g.stroke();
    g.fillStyle = enabled ? '#fff' : '#9aa5c4';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 68px ${FONT}`;
    g.fillText('ASK', w / 2, h / 2 + 4);
    this.askTex.needsUpdate = true;
  }
}
