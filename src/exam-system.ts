import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Entity,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PokeInteractable,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ExamModel } from './exam.js';
import { ExamButton } from './exam-components.js';
import { QUESTIONS } from './questions.js';

// ---- sheet geometry (meters) and canvas resolution (1600 px per meter) ----
const SHEET_W = 0.58;
const SHEET_H = 0.48;
const PX_PER_M = 1600;
const BTN_W = 0.5;
const BTN_H = 0.07;
const BTN_Y = [-0.045, -0.125, -0.205];
const BTN_COLORS = ['#ff4d6d', '#3a86ff', '#06b57f'];
const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
// tilt (radians) from lying flat; ~29 deg is readable from a seat without the board blocking the room
const SHEET_TILT = 0.5;
// TEMPORARY: a button on the desk that fakes "a cheat is out" so the catch system can be tried
// before the real cheats (peek, phone, fruit, email) exist. Flip to false when they land.
const DEBUG_CHEAT_BUTTON = true;
const BANNER_SECONDS = 1.8;
const LOCK_SECONDS = 0.35; // short beat after an answer so a double pinch cannot skip a question

function makeCanvasTex(w: number, h: number): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: CanvasTexture } {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  return { cv, g, tex };
}

function wrapLines(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const tryLine = line ? line + ' ' + w : w;
    if (g.measureText(tryLine).width > maxW && line) {
      out.push(line);
      line = w;
    } else {
      line = tryLine;
    }
  }
  if (line) out.push(line);
  return out;
}

const mmss = (secs: number): string => {
  const s = Math.ceil(secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class ExamSystem extends createSystem({
  buttons: { required: [ExamButton] },
  pressed: { required: [ExamButton, Pressed] },
}) {
  /** read by later pieces (peek, phone, teacher) */
  exam = new ExamModel(QUESTIONS, { passMark: 7, seconds: 180, maxWarnings: 3 });

  private sheetCtx!: CanvasRenderingContext2D;
  private sheetTex!: CanvasTexture;
  private btnCtx: CanvasRenderingContext2D[] = [];
  private btnTex: CanvasTexture[] = [];
  private btnMesh: Mesh[] = [];
  private btnLabel: Array<string | null> = [null, null, null];

  private lockLeft = 0;
  private flashSlot = -1;
  private shownSecond = -1;
  private shownCursor = -1;
  private shownPhase = '';
  private shownWarnings = 0;
  private shownPaintedWarnings = 0;
  private shownEvidence = false;
  private bannerLeft = 0;
  private bannerMesh!: Mesh;
  private bannerCtx!: CanvasRenderingContext2D;
  private bannerTex!: CanvasTexture;
  private debugMesh: Mesh | null = null;
  private debugCtx!: CanvasRenderingContext2D;
  private debugTex!: CanvasTexture;
  private hoverFn!: (e: Entity) => void;

  init(): void {
    const classroom = this.world.getSystem(ClassroomSystem);
    if (!classroom) throw new Error('ClassroomSystem must be registered before ExamSystem');

    // sheet: tilted slightly toward the player, bottom edge resting on the desk
    const sheet = new Group();
    sheet.name = 'ExamSheet';
    sheet.rotation.x = -Math.PI / 2 + SHEET_TILT;
    sheet.position.set(0, 0.9, -0.49);

    const s = makeCanvasTex(Math.round(SHEET_W * PX_PER_M), Math.round(SHEET_H * PX_PER_M));
    this.sheetCtx = s.g;
    this.sheetTex = s.tex;
    const paper = new Mesh(
      new PlaneGeometry(SHEET_W, SHEET_H),
      new MeshStandardMaterial({ map: s.tex, roughness: 0.9 }),
    );
    sheet.add(paper);

    // wooden backing board so the sheet reads as a little easel, not a floating card
    const backing = new Mesh(
      new BoxGeometry(SHEET_W + 0.03, SHEET_H + 0.03, 0.016),
      new MeshStandardMaterial({ color: 0x8a4b1f, roughness: 1 }),
    );
    backing.position.z = -0.012;
    sheet.add(backing);

    const sheetEntity = this.world.createTransformEntity(sheet, classroom.roomEntity);

    // two stubby legs propping the back of the board against the desk
    const legMat = new MeshStandardMaterial({ color: 0x6a4cff, roughness: 1 });
    for (const lx of [-0.22, 0.22]) {
      const leg = new Mesh(new CylinderGeometry(0.012, 0.012, 0.26, 8), legMat);
      leg.position.set(lx, 0.8875, -0.775);
      leg.rotation.x = 0.523;
      this.world.createTransformEntity(leg, classroom.roomEntity);
    }

    // three answer buttons, each its own entity so the input system can hover/press them
    const btnGeo = new PlaneGeometry(BTN_W, BTN_H);
    for (let i = 0; i < 3; i++) {
      const b = makeCanvasTex(Math.round(BTN_W * PX_PER_M), Math.round(BTN_H * PX_PER_M));
      this.btnCtx.push(b.g);
      this.btnTex.push(b.tex);
      const mat = new MeshStandardMaterial({ map: b.tex, roughness: 0.7, transparent: true });
      const mesh = new Mesh(btnGeo, mat);
      mesh.name = `AnswerButton${i}`;
      mesh.position.set(0, BTN_Y[i], 0.006);
      this.btnMesh.push(mesh);
      const ent = this.world.createTransformEntity(mesh, sheetEntity);
      ent.addComponent(ExamButton, { slot: i });
      ent.addComponent(RayInteractable);
      ent.addComponent(PokeInteractable);
    }

    // "WARNING 1 / 3!" banner that pops up in front of you for a moment
    const bn = makeCanvasTex(640, 160);
    this.bannerCtx = bn.g;
    this.bannerTex = bn.tex;
    this.bannerMesh = new Mesh(
      new PlaneGeometry(0.5, 0.125),
      new MeshBasicMaterial({ map: bn.tex, transparent: true }),
    );
    this.bannerMesh.position.set(0, 1.22, -0.8);
    this.bannerMesh.renderOrder = 5;
    this.bannerMesh.visible = false;
    this.world.createTransformEntity(this.bannerMesh, classroom.roomEntity);

    if (DEBUG_CHEAT_BUTTON) {
      const dbg = makeCanvasTex(320, 180);
      this.debugCtx = dbg.g;
      this.debugTex = dbg.tex;
      this.debugMesh = new Mesh(
        new PlaneGeometry(0.16, 0.09),
        new MeshStandardMaterial({ map: dbg.tex, roughness: 0.7 }),
      );
      this.debugMesh.rotation.x = -Math.PI / 2;
      this.debugMesh.position.set(0.41, 0.782, -0.42);
      const dEnt = this.world.createTransformEntity(this.debugMesh, classroom.roomEntity);
      dEnt.addComponent(ExamButton, { slot: 3 });
      dEnt.addComponent(RayInteractable);
      dEnt.addComponent(PokeInteractable);
      this.paintDebugButton();
    }

    this.hoverFn = (e: Entity) => {
      const slot = e.getValue(ExamButton, 'slot') as number;
      if (slot > 2) return;
      const mat = this.btnMesh[slot].material as MeshStandardMaterial;
      const lit = e.hasComponent(Hovered) && this.btnLabel[slot] !== null && this.lockLeft <= 0;
      const flash = this.flashSlot === slot;
      mat.emissive.setHex(flash ? 0x806000 : lit ? 0x444444 : 0x000000);
    };

    this.queries.pressed.subscribe('qualify', (e) => {
      this.onButtonPressed(e.getValue(ExamButton, 'slot') as number);
    });

    this.refresh(true);
  }

  private onButtonPressed(slot: number): void {
    if (slot === 3) {
      // temporary test cheat toggle (only while the exam runs)
      if (this.exam.phase === 'playing') {
        this.exam.evidence.set('debug', !this.exam.evidence.has('debug'));
      }
      return;
    }
    if (this.lockLeft > 0 || this.btnLabel[slot] === null) return;
    const phase = this.exam.phase;
    if (phase === 'ready' || phase === 'done') {
      this.exam.start();
      this.refresh(true);
      return;
    }
    if (this.exam.answer(slot)) {
      this.flashSlot = slot;
      this.lockLeft = LOCK_SECONDS;
    }
  }

  update(delta: number): void {
    if (this.lockLeft > 0) {
      this.lockLeft -= delta;
      if (this.lockLeft <= 0) {
        this.lockLeft = 0;
        this.flashSlot = -1;
        this.refresh(true);
      }
    }
    if (this.lockLeft <= 0) {
      this.exam.tick(delta);
    }
    // a new warning pops the banner
    if (this.exam.warnings !== this.shownWarnings) {
      if (this.exam.warnings > this.shownWarnings) this.showBanner();
      this.shownWarnings = this.exam.warnings;
    }
    if (this.bannerLeft > 0) {
      this.bannerLeft -= delta;
      if (this.bannerLeft <= 0) this.bannerMesh.visible = false;
    }
    if (this.debugMesh) {
      const on = this.exam.evidence.active;
      const show = this.exam.phase === 'playing';
      if (this.debugMesh.visible !== show) this.debugMesh.visible = show;
      if (on !== this.shownEvidence) {
        this.shownEvidence = on;
        this.paintDebugButton();
      }
    }
    this.refresh(false);
    this.queries.buttons.entities.forEach(this.hoverFn);
  }

  /** repaint only when something visible changed */
  private refresh(force: boolean): void {
    const ex = this.exam;
    const sec = ex.phase === 'playing' ? Math.ceil(ex.secondsLeft) : -1;
    const changed =
      force ||
      ex.phase !== this.shownPhase ||
      ex.cursor !== this.shownCursor ||
      sec !== this.shownSecond ||
      ex.warnings !== this.shownPaintedWarnings;
    if (!changed) return;
    // while the post-answer lock is running keep the old question on screen
    if (this.lockLeft > 0 && !force) return;
    this.shownPhase = ex.phase;
    this.shownCursor = ex.cursor;
    this.shownSecond = sec;
    this.shownPaintedWarnings = ex.warnings;
    this.paintSheet();
    this.paintButtons();
  }

  private paintSheet(): void {
    const g = this.sheetCtx;
    const w = g.canvas.width;
    const h = g.canvas.height;
    const ex = this.exam;
    g.fillStyle = '#fffdf2';
    g.fillRect(0, 0, w, h);
    // faint ruled lines
    g.fillStyle = '#e8e3cf';
    for (let y = 150; y < h; y += 60) g.fillRect(0, y, w, 2);
    g.textBaseline = 'alphabetic';

    if (ex.phase === 'ready') {
      g.textAlign = 'center';
      g.fillStyle = '#d6335a';
      g.font = `bold 120px ${FONT}`;
      g.fillText('FINAL EXAM', w / 2, 190);
      g.fillStyle = '#222';
      g.font = `48px ${FONT}`;
      g.fillText(`${ex.questions.length} questions  -  ${mmss(ex.rules.seconds)}  -  pass with ${ex.rules.passMark}`, w / 2, 280);
      g.fillStyle = '#6a4cff';
      g.font = `italic 40px ${FONT}`;
      g.fillText('(eyes on your own paper. totally.)', w / 2, 350);
      return;
    }

    if (ex.phase === 'done' && ex.endedBy === 'caught') {
      g.textAlign = 'center';
      g.fillStyle = '#d62839';
      g.font = `bold 130px ${FONT}`;
      g.fillText('BUSTED!', w / 2, 190);
      g.fillStyle = '#222';
      g.font = `bold 46px ${FONT}`;
      g.fillText("3 warnings. Off to the principal's office.", w / 2, 270);
      g.save();
      g.translate(w / 2, 365);
      g.rotate(-0.08);
      g.fillStyle = '#d62839';
      g.font = `bold 62px ${FONT}`;
      g.fillText('FAILED :(', 0, 0);
      g.restore();
      return;
    }

    if (ex.phase === 'done') {
      g.textAlign = 'center';
      const timeUp = ex.secondsLeft <= 0 && ex.answeredCount() < ex.questions.length;
      g.fillStyle = '#222';
      g.font = `bold 80px ${FONT}`;
      g.fillText(timeUp ? "TIME'S UP!" : 'ALL DONE!', w / 2, 150);
      g.fillStyle = '#d6335a';
      g.font = `bold 170px ${FONT}`;
      g.fillText(`${ex.score()} / ${ex.questions.length}`, w / 2, 305);
      const ok = ex.passed();
      g.save();
      g.translate(w / 2, 372);
      g.rotate(-0.08);
      g.fillStyle = ok ? '#06b57f' : '#d62839';
      g.font = `bold 56px ${FONT}`;
      g.fillText(ok ? 'PASSED :D' : 'FAILED :(', 0, 0);
      g.restore();
      return;
    }

    // playing
    g.fillStyle = '#d6335a';
    g.fillRect(0, 0, w, 96);
    g.fillStyle = '#fff';
    g.font = `bold 54px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(`Q ${Math.min(ex.cursor + 1, ex.questions.length)} / ${ex.questions.length}`, 36, 68);
    this.drawWarningFaces(g, w / 2, 48, ex.warnings, ex.rules.maxWarnings);
    g.textAlign = 'right';
    g.fillStyle = ex.secondsLeft < 30 ? '#ffe066' : '#fff';
    g.fillText(`TIME ${mmss(ex.secondsLeft)}`, w - 36, 68);

    g.fillStyle = '#1b1b1b';
    g.font = `bold 54px ${FONT}`;
    g.textAlign = 'left';
    const lines = wrapLines(g, ex.current().prompt, w - 96);
    lines.forEach((ln, i) => g.fillText(ln, 48, 190 + i * 68));
  }

  /** three little faces: calm and white while unused, angry and dark red once earned */
  private drawWarningFaces(g: CanvasRenderingContext2D, cx: number, cy: number, used: number, total: number): void {
    const gap = 78;
    const r = 30;
    for (let i = 0; i < total; i++) {
      const x = cx + (i - (total - 1) / 2) * gap;
      const angry = i < used;
      g.fillStyle = angry ? '#6b0016' : '#ffffff';
      g.beginPath();
      g.arc(x, cy, r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = angry ? '#ffd6dc' : '#d6335a';
      g.stroke();
      g.fillStyle = angry ? '#ffffff' : '#222222';
      g.beginPath();
      g.arc(x - 10, cy - 4, 4.5, 0, Math.PI * 2);
      g.arc(x + 10, cy - 4, 4.5, 0, Math.PI * 2);
      g.fill();
      g.lineCap = 'round';
      g.lineWidth = 4;
      g.strokeStyle = angry ? '#ffffff' : '#222222';
      g.beginPath();
      if (angry) {
        // furious brows and a frown
        g.moveTo(x - 17, cy - 15);
        g.lineTo(x - 5, cy - 9);
        g.moveTo(x + 17, cy - 15);
        g.lineTo(x + 5, cy - 9);
        g.moveTo(x - 9, cy + 14);
        g.quadraticCurveTo(x, cy + 5, x + 9, cy + 14);
      } else {
        g.moveTo(x - 9, cy + 8);
        g.quadraticCurveTo(x, cy + 16, x + 9, cy + 8);
      }
      g.stroke();
    }
  }

  private showBanner(): void {
    const ex = this.exam;
    const g = this.bannerCtx;
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#d62839';
    g.beginPath();
    g.roundRect(6, 6, w - 12, h - 12, 40);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 78px ${FONT}`;
    const caught = ex.phase === 'done' && ex.endedBy === 'caught';
    g.fillText(caught ? 'BUSTED!!!' : `WARNING ${ex.warnings} / ${ex.rules.maxWarnings}!`, w / 2, h / 2 + 4);
    this.bannerTex.needsUpdate = true;
    this.bannerMesh.visible = true;
    this.bannerLeft = BANNER_SECONDS;
  }

  private paintDebugButton(): void {
    const g = this.debugCtx;
    const on = this.exam.evidence.active;
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = on ? '#d62839' : '#3d3d4d';
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 28);
    g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 44px ${FONT}`;
    g.fillText(on ? 'CHEATING!' : 'CHEAT', w / 2, h / 2 - 16);
    g.font = `26px ${FONT}`;
    g.fillText(on ? '(tap to hide)' : '(test button)', w / 2, h / 2 + 34);
    this.debugTex.needsUpdate = true;
  }

  private paintButtons(): void {
    const ex = this.exam;
    if (ex.phase === 'playing') {
      const q = ex.current();
      this.btnLabel = [
        `A   ${q.options[0]}`,
        `B   ${q.options[1]}`,
        `C   ${q.options[2]}`,
      ];
    } else {
      this.btnLabel = [null, ex.phase === 'ready' ? 'START EXAM' : 'TRY AGAIN', null];
    }
    for (let i = 0; i < 3; i++) {
      const label = this.btnLabel[i];
      this.btnMesh[i].visible = label !== null;
      if (label === null) continue;
      const g = this.btnCtx[i];
      const w = g.canvas.width;
      const h = g.canvas.height;
      g.clearRect(0, 0, w, h);
      g.fillStyle = BTN_COLORS[i];
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, 36);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `bold 46px ${FONT}`;
      g.textBaseline = 'middle';
      if (ex.phase === 'playing') {
        g.textAlign = 'left';
        g.fillText(label, 44, h / 2 + 2);
      } else {
        g.textAlign = 'center';
        g.fillText(label, w / 2, h / 2 + 2);
      }
      this.btnTex[i].needsUpdate = true;
    }
    this.sheetTex.needsUpdate = true;
  }
}
