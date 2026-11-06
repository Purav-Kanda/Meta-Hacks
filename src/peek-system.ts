import {
  CanvasTexture,
  Entity,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Pressed,
  SRGBColorSpace,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { ToyButton } from './exam-components.js';
import { PeekModel, type Side } from './peek.js';
import { TeacherSystem } from './teacher-system.js';
import { ACTIVE_TUNING, onTuningChange } from './tuning.js';
import { roundStats } from './progress.js';
import { ROUND } from './modes.js';
import { sfx } from './sfx.js';

const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
const LETTERS = ['A', 'B', 'C'];
const SIDE_COLOR = ['#ffb703', '#06d6a0'];
const SIDE_NAME = ['LEFT KID', 'RIGHT KID'];
const NOPE_WORDS = ['NOPE!', 'NO WAY!', 'GET YOUR OWN!', 'EYES FRONT!'];
// the shared paper slides from the neighbor's desk to here (room-local meters)
const DESK: Array<[number, number, number]> = [
  [-1.5, 0.82, -0.45],
  [1.5, 0.82, -0.45],
];
const HOLD: Array<[number, number, number]> = [
  [-0.52, 1.0, -0.42],
  [0.52, 1.0, -0.42],
];
const NOPE_POS: Array<[number, number, number]> = [
  [-1.5, 1.55, -0.45],
  [1.5, 1.55, -0.45],
];
const EYE = new Vector3(0, 1.1, 0.2);

function canvasTex(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const tex = new CanvasTexture(cv);
  tex.anisotropy = 16;
  tex.colorSpace = SRGBColorSpace;
  return { g, tex };
}

function faceYaw(x: number, z: number): number {
  return Math.atan2(EYE.x - x, EYE.z - z);
}

/**
 * Peek: tap a neighbor's shoulder. After a beat they either slide their paper over (a card with their
 * answer; it is evidence while it is out) or shake their head and refuse. Only the shared paper counts.
 */
export class PeekSystem extends createSystem({
  toys: { required: [ToyButton, Pressed] },
}) {
  /** exposed for ?debug and the demo bot */
  model = new PeekModel(
    {
      accuracy: ACTIVE_TUNING.peekAccuracy,
      refuseChance: ACTIVE_TUNING.peekRefuseChance,
      askSeconds: ACTIVE_TUNING.peekFindSeconds,
      decideSeconds: 0.5,
      refuseSeconds: 1.3,
      shareSeconds: ACTIVE_TUNING.peekShareSeconds,
      panicSeconds: ACTIVE_TUNING.peekPanicSeconds,
      sulkSeconds: ACTIVE_TUNING.peekSulkSeconds,
      maxTaps: ACTIVE_TUNING.peekTaps,
    },
    Math.random,
  );

  private cards: Mesh[] = [];
  private cardG: CanvasRenderingContext2D[] = [];
  private cardTex: CanvasTexture[] = [];
  private nopes: Mesh[] = [];
  private hmms: Mesh[] = [];
  private nopeG: CanvasRenderingContext2D[] = [];
  private nopeTex: CanvasTexture[] = [];
  private slide = [0, 0];
  private shownAnswer = [-2, -2];
  private shownWord = [-1, -1];
  private wasPlaying = false;
  private clock = 0;
  private lastCursor = -1;
  private seenShare = 0;
  private seenRefuse = 0;
  private seenRetract = 0;
  /** bumps when you tap with no taps left (the desk tag flashes) */
  noTapsSeq = 0;
  private exam!: ExamSystem;
  private teacher!: TeacherSystem;
  private kids: Object3D[] = [];
  private adjacent: [number, number] = [-1, -1];

  init(): void {
    onTuningChange(() => {
      const r = this.model.rules;
      r.accuracy = ACTIVE_TUNING.peekAccuracy;
      r.refuseChance = ACTIVE_TUNING.peekRefuseChance;
      r.askSeconds = ACTIVE_TUNING.peekFindSeconds;
      r.shareSeconds = ACTIVE_TUNING.peekShareSeconds;
      r.panicSeconds = ACTIVE_TUNING.peekPanicSeconds;
      r.sulkSeconds = ACTIVE_TUNING.peekSulkSeconds;
      r.maxTaps = ACTIVE_TUNING.peekTaps;
    });
    const classroom = this.world.getSystem(ClassroomSystem);
    const exam = this.world.getSystem(ExamSystem);
    const teacher = this.world.getSystem(TeacherSystem);
    if (!classroom || !exam || !teacher) throw new Error('Classroom, Exam and Teacher systems must be registered before PeekSystem');
    this.exam = exam;
    this.teacher = teacher;
    this.kids = classroom.kids;
    this.adjacent = classroom.adjacent;

    for (let s = 0; s < 2; s++) {
      const c = canvasTex(300, 390);
      this.cardG.push(c.g);
      this.cardTex.push(c.tex);
      const card = new Mesh(new PlaneGeometry(0.2, 0.26), new MeshBasicMaterial({ map: c.tex, transparent: true }));
      card.position.set(...DESK[s]);
      card.rotation.y = faceYaw(HOLD[s][0], HOLD[s][2]);
      card.renderOrder = 5;
      card.visible = false;
      this.cards.push(card);
      this.world.createTransformEntity(card, classroom.seatEntity);

      const n = canvasTex(440, 240);
      this.nopeG.push(n.g);
      this.nopeTex.push(n.tex);
      const bub = new Mesh(new PlaneGeometry(0.4, 0.218), new MeshBasicMaterial({ map: n.tex, transparent: true }));
      bub.position.set(...NOPE_POS[s]);
      bub.rotation.y = faceYaw(NOPE_POS[s][0], NOPE_POS[s][2]);
      bub.renderOrder = 5;
      bub.visible = false;
      this.nopes.push(bub);
      this.world.createTransformEntity(bub, classroom.seatEntity);

      // "hmm..." bubble while they hunt for the same question
      const hm = canvasTex(440, 240);
      this.paintBubbleText(hm.g, 'FINDING IT...', '#8ecae6', '#1d3557', 56);
      hm.tex.needsUpdate = true;
      const hb = new Mesh(new PlaneGeometry(0.4, 0.218), new MeshBasicMaterial({ map: hm.tex, transparent: true }));
      hb.position.set(...NOPE_POS[s]);
      hb.rotation.y = faceYaw(NOPE_POS[s][0], NOPE_POS[s][2]);
      hb.renderOrder = 5;
      hb.visible = false;
      this.hmms.push(hb);
      this.world.createTransformEntity(hb, classroom.seatEntity);
    }

    // the classmates' tap balls belong to LivingSystem (ToyButton kinds 1 = left kid, 2 = right kid)
    this.queries.toys.subscribe('qualify', (e: Entity) => {
      const kind = e.getValue(ToyButton, 'kind') as number;
      if (kind < 1 || kind > this.kids.length) return; // another toy (bell, seat card...)
      if (this.exam.exam.phase !== 'playing' || !ROUND.allows('peek')) return;
      // only the classmates sitting next to you can be asked; which kid that is changes with your seat
      const side = this.adjacent[0] === kind - 1 ? 0 : this.adjacent[1] === kind - 1 ? 1 : -1;
      if (side < 0) return;
      if (this.model.tap(side as Side) === 'empty') {
        this.noTapsSeq += 1;
        sfx.buzzer();
      }
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
      this.seenShare = this.model.shareSeq;
      this.seenRefuse = this.model.refuseSeq;
      this.seenRetract = this.model.retractSeq;
      this.wasPlaying = true;
    }
    if (ex.cursor !== this.lastCursor) {
      this.lastCursor = ex.cursor;
      this.model.newQuestion(ex.correctSlot());
    }
    const dt = Math.min(delta, 0.1);
    this.clock += dt;
    this.model.update(dt, this.teacher.anyRush);
    this.playEvents();
    ex.evidence.set('peek', this.model.evidence);
    this.syncView(dt);
  }

  private playEvents(): void {
    const m = this.model;
    if (m.shareSeq !== this.seenShare) {
      this.seenShare = m.shareSeq;
      roundStats.peeks += 1;
      sfx.pop();
      sfx.rustle();
    }
    if (m.refuseSeq !== this.seenRefuse) {
      this.seenRefuse = m.refuseSeq;
      sfx.nope();
    }
    if (m.retractSeq !== this.seenRetract) {
      this.seenRetract = m.retractSeq;
      sfx.rustle();
    }
  }

  private clearAll(): void {
    this.model.reset();
    this.exam.exam.evidence.set('peek', false);
    this.syncView(1);
  }

  private syncView(dt: number): void {
    const m = this.model;
    for (let s = 0; s < 2; s++) {
      const sharing = m.state[s] === 'sharing';
      this.slide[s] += ((sharing ? 1 : 0) - this.slide[s]) * Math.min(1, dt * 9);
      const p = this.slide[s];
      const card = this.cards[s];
      card.visible = p > 0.02;
      if (card.visible) {
        card.position.set(
          DESK[s][0] + (HOLD[s][0] - DESK[s][0]) * p,
          DESK[s][1] + (HOLD[s][1] - DESK[s][1]) * p,
          DESK[s][2] + (HOLD[s][2] - DESK[s][2]) * p,
        );
        card.scale.setScalar(0.4 + 0.6 * p);
        const ans = m.shown[s];
        if (ans !== this.shownAnswer[s]) {
          this.shownAnswer[s] = ans;
          this.paintCard(s, ans);
        }
      }
      const searching = m.state[s] === 'asking';
      this.hmms[s].visible = searching;
      if (searching) {
        this.hmms[s].scale.setScalar(1 + Math.sin(this.clock * 6) * 0.05);
        this.hmms[s].position.y = NOPE_POS[s][1] + Math.sin(this.clock * 3) * 0.015;
      }
      const refusing = m.state[s] === 'refusing';
      this.nopes[s].visible = refusing;
      if (refusing && this.shownWord[s] === -1) {
        this.shownWord[s] = Math.floor(Math.random() * NOPE_WORDS.length);
        this.paintNope(s, NOPE_WORDS[this.shownWord[s]]);
      } else if (!refusing) {
        this.shownWord[s] = -1;
      }
    }
  }

  private paintCard(side: number, answer: number): void {
    const g = this.cardG[side];
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fffdf2';
    g.strokeStyle = SIDE_COLOR[side];
    g.lineWidth = 16;
    g.beginPath();
    g.roundRect(8, 8, w - 16, h - 16, 30);
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#444';
    g.font = `bold 46px ${FONT}`;
    g.fillText(SIDE_NAME[side], w / 2, 56);
    g.font = `bold 30px ${FONT}`;
    g.fillText('says:', w / 2, 98);
    g.fillStyle = '#d6335a';
    g.font = `bold 210px ${FONT}`;
    g.fillText(answer >= 0 ? LETTERS[answer] : '?', w / 2, 220);
    g.fillStyle = '#6a4cff';
    g.font = `italic 28px ${FONT}`;
    g.fillText('pinch kid to hide it', w / 2, 340);
    this.cardTex[side].needsUpdate = true;
  }

  private paintNope(side: number, word: string): void {
    this.paintBubbleText(this.nopeG[side], word, '#ff5d5d', '#ffffff', 84);
    this.nopeTex[side].needsUpdate = true;
  }

  private paintBubbleText(g: CanvasRenderingContext2D, word: string, fill: string, ink: string, size: number): void {
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = fill;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 10;
    g.beginPath();
    g.roundRect(8, 8, w - 16, h - 64, 50);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(w / 2 - 30, h - 58);
    g.lineTo(w / 2, h - 6);
    g.lineTo(w / 2 + 30, h - 58);
    g.closePath();
    g.fill();
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let px = size;
    g.font = `bold ${px}px ${FONT}`;
    while (g.measureText(word).width > w - 70 && px > 30) {
      px -= 4;
      g.font = `bold ${px}px ${FONT}`;
    }
    g.fillText(word, w / 2, (h - 64) / 2 + 8);
  }
}
