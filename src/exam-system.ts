import { SETTINGS, onSettingsChange, popupScale, timeFactor } from './settings.js';
import { applyTuning, SEAT_MODS } from './tuning.js';
import { TUTORIAL } from './tutorial.js';
import { SCARE } from './scare.js';
import { SEAT } from './seat.js';
import { TITLE } from './title.js';
import { CHALLENGES, MENU, ROUND, WEEK, endlessStage, planFor, type MenuItem, type RoundPlan } from './modes.js';
import { Progress, browserStore, resetRound, roundStats, type RoundResult } from './progress.js';
import { ReportPanel } from './report-panel.js';
import { sfx } from './sfx.js';
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Entity,
  Group,
  Hovered,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
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
const TIMER_PX_W = 336;
const TIMER_PX_H = 96;
const BTN_W = 0.5;
const BTN_H = 0.07;
const BTN_Y = [-0.045, -0.125, -0.205];
const BTN_COLORS = ['#ff4d6d', '#3a86ff', '#06b57f'];
const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
// tilt (radians) from lying flat; ~29 deg is readable from a seat without the board blocking the room
const SHEET_TILT = 0.5;

// TEMPORARY: a button on the desk that fakes "a cheat is out" so the catch system can be tried
// before the real cheats (peek, phone, fruit, email) exist. Flip to false when they land.
const DEBUG_CHEAT_BUTTON = false;
const BANNER_SECONDS = 1.8;
const CARD_SECONDS = 3.4;
const LOCK_SECONDS = 1.4; // your pick stays lit on the sheet this long after an answer...
const LOCK_SKIP_AFTER = 0.25; // ...unless you tap an answer again (after this short beat, so a double pinch cannot skip it by accident)

function makeCanvasTex(w: number, h: number): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: CanvasTexture } {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const tex = new CanvasTexture(cv);
  tex.anisotropy = 16; // three.js clamps to what the GPU supports; keeps tilted text crisp
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
  /** the countdown is its own little texture over the sheet's header, so each second repaints 0.03 megapixels, not the whole desk */
  private timerCtx!: CanvasRenderingContext2D;
  private timerTex!: CanvasTexture;
  private timerMesh!: Mesh;
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
  readonly progress = new Progress(browserStore());
  private readonly panel = new ReportPanel();
  private lastResult: RoundResult | null = null;
  private menuPage = 0;
  private plan: RoundPlan = planFor('easy');
  private challengeRot = 0;
  private lastLevel = -1;
  private cardLeft = 0;
  private cardMesh!: Mesh;
  private cardCtx!: CanvasRenderingContext2D;
  private cardTex!: CanvasTexture;

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

    // the TIME readout: top right of the header strip (canvas pixels w-336..w, 0..96)
    const tm = makeCanvasTex(TIMER_PX_W, TIMER_PX_H);
    tm.tex.generateMipmaps = false;
    tm.tex.minFilter = LinearFilter;
    this.timerCtx = tm.g;
    this.timerTex = tm.tex;
    this.timerMesh = new Mesh(
      new PlaneGeometry(TIMER_PX_W / PX_PER_M, TIMER_PX_H / PX_PER_M),
      new MeshStandardMaterial({ map: tm.tex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.timerMesh.position.set(SHEET_W / 2 - TIMER_PX_W / PX_PER_M / 2, SHEET_H / 2 - TIMER_PX_H / PX_PER_M / 2, 0.002);
    this.timerMesh.visible = false;
    sheet.add(this.timerMesh);

    // wooden backing board so the sheet reads as a little easel, not a floating card
    const backing = new Mesh(
      new BoxGeometry(SHEET_W + 0.03, SHEET_H + 0.03, 0.016),
      new MeshStandardMaterial({ color: 0x8a4b1f, roughness: 1 }),
    );
    backing.position.z = -0.012;
    sheet.add(backing);

    const sheetEntity = this.world.createTransformEntity(sheet, classroom.seatEntity);

    // two stubby legs propping the back of the board against the desk
    const legMat = new MeshStandardMaterial({ color: 0x6a4cff, roughness: 1 });
    for (const lx of [-0.22, 0.22]) {
      const leg = new Mesh(new CylinderGeometry(0.012, 0.012, 0.26, 8), legMat);
      leg.position.set(lx, 0.8875, -0.775);
      leg.rotation.x = 0.523;
      this.world.createTransformEntity(leg, classroom.seatEntity);
    }

    // three answer buttons, each its own entity so the input system can hover/press them
    const btnGeo = new PlaneGeometry(BTN_W, BTN_H);
    for (let i = 0; i < 3; i++) {
      const b = makeCanvasTex(Math.round(BTN_W * PX_PER_M), Math.round(BTN_H * PX_PER_M));
      this.btnCtx.push(b.g);
      this.btnTex.push(b.tex);
      const mat = new MeshStandardMaterial({ map: b.tex, roughness: 0.7, transparent: true, depthWrite: false });
      const mesh = new Mesh(btnGeo, mat);
      mesh.name = `AnswerButton${i}`;
      mesh.renderOrder = 1;
      mesh.position.set(0, BTN_Y[i], 0.006);
      this.btnMesh.push(mesh);
      const ent = this.world.createTransformEntity(mesh, sheetEntity);
      ent.addComponent(ExamButton, { slot: i });
      ent.addComponent(RayInteractable);
    }

    // "WARNING 1 / 3!" banner that pops up in front of you for a moment
    const bn = makeCanvasTex(640, 160);
    this.bannerCtx = bn.g;
    this.bannerTex = bn.tex;
    this.bannerMesh = new Mesh(
      new PlaneGeometry(0.5, 0.125),
      new MeshBasicMaterial({ map: bn.tex, transparent: true, depthWrite: false }),
    );
    this.bannerMesh.position.set(0, 1.22, -0.8);
    this.bannerMesh.renderOrder = 5;
    this.bannerMesh.visible = false;
    this.world.createTransformEntity(this.bannerMesh, classroom.seatEntity);

    // big title card shown for a few seconds when a round starts ("MONDAY: Easy Start", "LEVEL 3")
    const cd = makeCanvasTex(1024, 384);
    this.cardCtx = cd.g;
    this.cardTex = cd.tex;
    this.cardMesh = new Mesh(new PlaneGeometry(0.8, 0.3), new MeshBasicMaterial({ map: cd.tex, transparent: true, depthWrite: false }));
    this.cardMesh.position.set(0, 1.3, -0.85);
    this.cardMesh.renderOrder = 6;
    this.cardMesh.visible = false;
    this.world.createTransformEntity(this.cardMesh, classroom.seatEntity);

    // sticker book before an exam, report card after it, floating above the exam sheet
    this.panel.mesh.position.set(0, 1.3, -1.0);
    this.world.createTransformEntity(this.panel.mesh, classroom.seatEntity);
    this.exam.onEnd = () => this.onExamEnded();

    if (DEBUG_CHEAT_BUTTON) {
      const dbg = makeCanvasTex(320, 180);
      this.debugCtx = dbg.g;
      this.debugTex = dbg.tex;
      this.debugMesh = new Mesh(
        new PlaneGeometry(0.16, 0.09),
        new MeshStandardMaterial({ map: dbg.tex, roughness: 0.7 }),
      );
      this.debugMesh.rotation.x = -Math.PI / 2;
      this.debugMesh.position.set(0.4, 0.782, -0.2);
      const dEnt = this.world.createTransformEntity(this.debugMesh, classroom.seatEntity);
      dEnt.addComponent(ExamButton, { slot: 3 });
      dEnt.addComponent(RayInteractable);
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

    onSettingsChange(() => this.refresh(true));
    this.refresh(true);
  }

  /** the settings panel hides the sticker book / report card while it is open */
  setBookHidden(hidden: boolean): void {
    if (hidden) this.panel.hide();
    else this.updatePanel();
  }

  private onButtonPressed(slot: number): void {
    if (slot === 3) {
      // temporary test cheat toggle (only while the exam runs)
      if (this.exam.phase === 'playing') {
        this.exam.evidence.set('debug', !this.exam.evidence.has('debug'));
      }
      return;
    }
    TITLE.active = false; // pressing a menu button while the start screen is up just dismisses it
    TITLE.leaving = false;
    if (this.lockLeft > 0) {
      // tapping while your pick is still showing moves on to the next question right away
      if (LOCK_SECONDS - this.lockLeft >= LOCK_SKIP_AFTER) this.lockLeft = 0.0001;
      return;
    }
    if (this.btnLabel[slot] === null) return;
    const phase = this.exam.phase;
    if (phase === 'ready' || phase === 'done') {
      const item = MENU[this.menuPage][slot];
      if (item.kind === 'page') {
        this.menuPage = item.to;
        this.refresh(true);
        return;
      }
      this.beginRound(planFor(item.id, { challengeIdx: this.nextChallenge(), weekDay: this.progress.data.weekDay }));
      return;
    }
    if (SEAT.holding || SCARE.active) return; // the seat draw is still on screen / she is lunging at you
    if (ROUND.mode === 'tutorial' && !TUTORIAL.canAnswer(this.exam.cursor, roundStats)) {
      TUTORIAL.nudgeSeq += 1; // the coach card shakes: try the cheat first
      sfx.click();
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
    if (this.lockLeft <= 0 && !SEAT.holding) {
      this.exam.tick(delta);
    }
    // a new warning pops the banner
    if (this.exam.warnings !== this.shownWarnings) {
      if (this.exam.warnings > this.shownWarnings) this.showBanner();
      this.shownWarnings = this.exam.warnings;
    }
    if (this.bannerLeft > 0) {
      this.bannerLeft -= delta;
      if (this.bannerLeft <= 0) {
        this.bannerMesh.visible = false;
      } else {
        // bouncy pop-in with a little wobble, then shrink away at the end
        const age = BANNER_SECONDS - this.bannerLeft;
        const pop = SETTINGS.calm ? 1 : age < 0.3 ? 1.2 * Math.sin((age / 0.3) * (Math.PI / 2)) : age < 0.45 ? 1.2 - 0.2 * ((age - 0.3) / 0.15) : 1;
        const out = this.bannerLeft < 0.25 ? this.bannerLeft / 0.25 : 1;
        this.bannerMesh.scale.setScalar(Math.max(0.01, pop * out) * popupScale());
        this.bannerMesh.rotation.z = SETTINGS.calm ? 0 : Math.sin(age * 28) * 0.06 * Math.max(0, 1 - age / 0.7);
      }
    }
    this.updateCard(delta);
    this.updateEndless();
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

  /** the first challenge you have not beaten yet (then they rotate) */
  private nextChallenge(): number {
    const done = new Set(this.progress.data.challenges);
    const i = CHALLENGES.findIndex((c) => !done.has(c.id));
    return i >= 0 ? i : this.challengeRot++ % CHALLENGES.length;
  }

  /** set up everything a round plan changes, then start the exam */
  private beginRound(plan: RoundPlan): void {
    this.plan = plan;
    ROUND.set(plan);
    // draw a seat (Training Day always gets the middle seat); it nudges how far she sees and how good the neighbors are
    if (plan.mode === 'tutorial') SEAT.set('backM');
    else SEAT.draw();
    SEAT_MODS.vision = SEAT.current.vision;
    SEAT_MODS.peek = SEAT.current.peek;
    applyTuning(plan.base, plan.intensity, plan.overrides);
    const r = this.exam.rules;
    r.passMark = plan.passMark;
    r.seconds = Math.round(plan.seconds * timeFactor());
    r.maxWarnings = plan.maxWarnings;
    r.questionCount = plan.questions;
    r.endless = plan.endless;
    r.maxWrong = plan.maxWrong;
    resetRound(plan.mode);
    roundStats.day = plan.day;
    roundStats.challengeId = plan.challengeId;
    this.lastResult = null;
    this.lastLevel = -1;
    this.exam.start();
    this.showCard(plan.introTitle, plan.introSub, '#3a86ff');
    this.refresh(true);
  }

  /** endless: every 4 answers she gets faster, and at level 3 a second teacher walks in */
  private updateEndless(): void {
    if (!this.plan.endless || this.exam.phase !== 'playing') return;
    const st = endlessStage(this.exam.answeredCount());
    if (st.level === this.lastLevel) return;
    const first = this.lastLevel === -1;
    this.lastLevel = st.level;
    if (first) return;
    applyTuning(st.base, st.intensity, this.plan.overrides);
    this.showCard(`LEVEL ${st.level + 1}`, st.level === 3 ? 'a second teacher joins!' : 'she is getting faster...', '#ff8c00');
    sfx.ding();
  }

  private showCard(title: string, sub: string, color: string): void {
    const g = this.cardCtx;
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(8, 8, w - 16, h - 16, 60);
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 96;
    g.font = `bold ${size}px ${FONT}`;
    while (g.measureText(title).width > w - 120 && size > 36) {
      size -= 4;
      g.font = `bold ${size}px ${FONT}`;
    }
    g.fillText(title, w / 2, 140);
    size = 54;
    g.font = `${size}px ${FONT}`;
    while (g.measureText(sub).width > w - 120 && size > 26) {
      size -= 2;
      g.font = `${size}px ${FONT}`;
    }
    g.fillText(sub, w / 2, 262);
    this.cardTex.needsUpdate = true;
    this.cardMesh.visible = true;
    this.cardLeft = CARD_SECONDS;
  }

  private updateCard(delta: number): void {
    if (this.cardLeft <= 0) return;
    this.cardLeft -= delta;
    if (this.cardLeft <= 0) {
      this.cardMesh.visible = false;
      return;
    }
    const age = CARD_SECONDS - this.cardLeft;
    const pop = SETTINGS.calm ? 1 : age < 0.3 ? 1.15 * Math.sin((age / 0.3) * (Math.PI / 2)) : age < 0.45 ? 1.15 - 0.15 * ((age - 0.3) / 0.15) : 1;
    const out = this.cardLeft < 0.3 ? this.cardLeft / 0.3 : 1;
    this.cardMesh.scale.setScalar(Math.max(0.01, pop * out) * popupScale());
  }

  private menuLabel(item: MenuItem): string {
    if (item.kind === 'page') return item.label;
    switch (item.id) {
      case 'tutorial':
        return this.progress.data.tutorialDone ? 'TRAINING DAY' : 'START HERE: TRAINING DAY';
      case 'easy':
        return 'EASY  (1 teacher)';
      case 'notEasy':
        return 'NOT EASY  (2 teachers)';
      case 'rush':
        return '60-SECOND RUSH';
      case 'endless':
        return 'ENDLESS SURVIVAL';
      case 'challenge': {
        const done = new Set(this.progress.data.challenges);
        const i = CHALLENGES.findIndex((c) => !done.has(c.id));
        return `CHALLENGE: ${CHALLENGES[i >= 0 ? i : this.challengeRot % CHALLENGES.length].name}`;
      }
      case 'week': {
        const d = WEEK[Math.min(this.progress.data.weekDay, WEEK.length - 1)];
        return `SCHOOL WEEK: ${d.name} - ${d.title}`;
      }
    }
  }

  private onExamEnded(): void {
    const ex = this.exam;
    const st = roundStats;
    st.score = ex.score();
    st.total = ex.questions.length;
    st.warnings = ex.warnings;
    st.caught = ex.endedBy === 'caught';
    st.passed = ex.passed();
    st.goalMet = false;
    st.note = '';
    if (st.mode === 'challenge') {
      const c = CHALLENGES.find((x) => x.id === st.challengeId);
      st.goalMet = !st.caught && !!c && c.test(st);
      st.note = st.goalMet ? 'CHALLENGE COMPLETE!' : 'CHALLENGE FAILED - try again';
    } else if (st.mode === 'week') {
      const d = WEEK[Math.max(0, st.day - 1)];
      st.goalMet = !st.caught && st.passed;
      st.note = st.goalMet
        ? st.day >= WEEK.length
          ? 'WEEK COMPLETE! STRAIGHT As'
          : `${d.name} CLEARED - ${WEEK[st.day].name} next`
        : `${d.name} FAILED - try again`;
    } else if (st.mode === 'tutorial') {
      st.note = 'TRAINING COMPLETE! now try EASY';
      st.goalMet = true;
    } else if (st.mode === 'endless') {
      st.note = `${ex.wrong >= (ex.rules.maxWrong ?? 0) && ex.endedBy === 'strikes' ? '3 wrong answers' : 'caught cheating'}`;
    }
    this.lastResult = this.progress.record(st);
    if (this.lastResult.newStickers.length > 0) sfx.sticker();
  }

  private updatePanel(): void {
    const ex = this.exam;
    if (ex.phase === 'playing') this.panel.hide();
    else if (ex.phase === 'done' && this.lastResult) this.panel.paintResult(this.lastResult, roundStats, this.progress);
    else this.panel.paintBook(this.progress);
  }

  /** repaint only when something visible changed */
  private refresh(force: boolean): void {
    const ex = this.exam;
    const sec = ex.phase === 'playing' ? Math.ceil(ex.secondsLeft) : -1;
    // the countdown ticks every second; that only repaints its own small texture
    if (sec !== this.shownSecond) {
      this.shownSecond = sec;
      this.paintTimer();
    }
    const changed =
      force ||
      ex.phase !== this.shownPhase ||
      ex.cursor !== this.shownCursor ||
      ex.warnings !== this.shownPaintedWarnings;
    if (!changed) return;
    // while the post-answer lock is running keep the old question on screen
    if (this.lockLeft > 0 && !force) return;
    this.shownPhase = ex.phase;
    this.shownCursor = ex.cursor;
    this.shownPaintedWarnings = ex.warnings;
    this.paintSheet();
    this.paintTimer();
    this.paintButtons();
    this.updatePanel();
  }

  /** the TIME readout in the header (timed rounds only; training and endless show something else there) */
  private paintTimer(): void {
    const ex = this.exam;
    const on = ex.phase === 'playing' && ROUND.mode !== 'tutorial' && !this.plan.endless;
    this.timerMesh.visible = on;
    if (!on) return;
    const g = this.timerCtx;
    g.fillStyle = '#d6335a';
    g.fillRect(0, 0, TIMER_PX_W, TIMER_PX_H);
    g.textBaseline = 'alphabetic';
    g.textAlign = 'right';
    g.font = `bold 54px ${FONT}`;
    g.fillStyle = ex.secondsLeft < 30 ? '#ffe066' : '#fff';
    g.fillText(`TIME ${mmss(ex.secondsLeft)}`, TIMER_PX_W - 36, 68);
    this.timerTex.needsUpdate = true;
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
      g.fillText('POP QUIZ', w / 2, 190);
      g.fillStyle = '#222';
      g.font = `48px ${FONT}`;
      g.fillText(this.progress.data.tutorialDone ? `pick your exam   (page ${this.menuPage + 1} of ${MENU.length})` : 'first time? press START HERE', w / 2, 280);
      g.fillStyle = '#6a4cff';
      g.font = `italic 40px ${FONT}`;
      g.fillText('(eyes on your own paper. totally.)', w / 2, 350);
      return;
    }

    if (ex.phase === 'done' && this.plan.endless) {
      g.textAlign = 'center';
      g.fillStyle = '#d62839';
      g.font = `bold 100px ${FONT}`;
      g.fillText(ex.endedBy === 'caught' ? 'BUSTED!' : 'OUT OF LIVES!', w / 2, 170);
      g.fillStyle = '#d6335a';
      g.font = `bold 190px ${FONT}`;
      g.fillText(`${ex.score()}`, w / 2, 330);
      g.fillStyle = '#222';
      g.font = `bold 50px ${FONT}`;
      g.fillText('right answers in a row of chaos', w / 2, 395);
      return;
    }

    if (ex.phase === 'done' && ex.endedBy === 'caught') {
      g.textAlign = 'center';
      g.fillStyle = '#d62839';
      g.font = `bold 130px ${FONT}`;
      g.fillText('BUSTED!', w / 2, 190);
      g.fillStyle = '#222';
      g.font = `bold 46px ${FONT}`;
      g.fillText(`${ex.rules.maxWarnings} warnings. Off to the principal's office.`, w / 2, 270);
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
    if (this.plan.endless) g.fillText(`SCORE ${ex.score()}`, 36, 68);
    else g.fillText(`Q ${Math.min(ex.cursor + 1, ex.questions.length)} / ${ex.questions.length}`, 36, 68);
    if (ROUND.mode !== 'tutorial') this.drawWarningFaces(g, w / 2, 48, ex.warnings, ex.rules.maxWarnings);
    g.textAlign = 'right';
    if (ROUND.mode === 'tutorial') {
      // no timer or warning faces in training: just a label (the clock and faces would be meaningless)
      g.fillStyle = '#fff';
      g.fillText('TRAINING', w - 36, 68);
    } else if (this.plan.endless) {
      g.fillStyle = ex.wrong >= (ex.rules.maxWrong ?? 3) - 1 ? '#ffe066' : '#fff';
      g.fillText(`MISS ${ex.wrong}/${ex.rules.maxWrong ?? 3}`, w - 36, 68);
    }
    // (timed rounds: the TIME readout is drawn by paintTimer on its own texture)

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
    g.fillText(caught ? 'BUSTED!!!' : ROUND.mode === 'tutorial' ? 'PRACTICE WARNING!' : `WARNING ${ex.warnings} / ${ex.rules.maxWarnings}!`, w / 2, h / 2 + 4);
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
      const page = MENU[this.menuPage];
      this.btnLabel = [this.menuLabel(page[0]), this.menuLabel(page[1]), this.menuLabel(page[2])];
    }
    for (let i = 0; i < 3; i++) {
      const label = this.btnLabel[i];
      this.btnMesh[i].visible = label !== null;
      if (label === null) continue;
      const g = this.btnCtx[i];
      const w = g.canvas.width;
      const h = g.canvas.height;
      g.clearRect(0, 0, w, h);
      g.fillStyle = SETTINGS.contrast ? '#0a0a0a' : BTN_COLORS[i];
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, 36);
      g.fill();
      if (SETTINGS.contrast) {
        g.strokeStyle = '#ffe500';
        g.lineWidth = 10;
        g.stroke();
      }
      g.fillStyle = SETTINGS.contrast ? '#ffe500' : '#fff';
      let fs = 46;
      g.font = `bold ${fs}px ${FONT}`;
      while (g.measureText(label).width > w - 90 && fs > 26) {
        fs -= 2;
        g.font = `bold ${fs}px ${FONT}`;
      }
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
