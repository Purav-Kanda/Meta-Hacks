import { popupScale } from './settings.js';
import { CanvasTexture, ConeGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3, createSystem } from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { ROUND } from './modes.js';
import { roundStats } from './progress.js';
import { LESSONS, TUTORIAL } from './tutorial.js';
import { applyTuning } from './tuning.js';

const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
const EYE = new Vector3(0, 1.1, 0.2);
const CARD_POS = new Vector3(0, 1.38, -0.78);

/**
 * Training Day's coach: a card above your paper says what to do, a bobbing arrow points at it, and the
 * lesson ticks over when you have done it. (The rules live in tutorial.ts; the exam blocks answering early.)
 */
export class TutorialSystem extends createSystem({}) {
  private card!: Mesh;
  private g!: CanvasRenderingContext2D;
  private tex!: CanvasTexture;
  private arrows: Mesh[] = [];
  private exam!: ExamSystem;
  private clock = 0;
  private shown = '';
  private lastNudge = 0;
  private shake = 0;
  private freed = false;

  init(): void {
    const classroom = this.world.getSystem(ClassroomSystem);
    const exam = this.world.getSystem(ExamSystem);
    if (!classroom || !exam) throw new Error('Classroom and Exam systems must be registered before TutorialSystem');
    this.exam = exam;
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 400;
    this.g = cv.getContext('2d')!;
    this.tex = new CanvasTexture(cv);
    this.tex.anisotropy = 16;
    this.tex.colorSpace = SRGBColorSpace;
    this.card = new Mesh(new PlaneGeometry(0.64, 0.25), new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.card.position.copy(CARD_POS);
    this.card.rotation.y = Math.atan2(EYE.x - CARD_POS.x, EYE.z - CARD_POS.z);
    this.card.renderOrder = 7;
    this.card.visible = false;
    this.world.createTransformEntity(this.card, classroom.seatEntity);
    for (let i = 0; i < 2; i++) {
      const a = new Mesh(new ConeGeometry(0.035, 0.08, 10), new MeshBasicMaterial({ color: 0xffd23f }));
      a.rotation.x = Math.PI; // point down
      a.renderOrder = 7;
      a.visible = false;
      this.arrows.push(a);
      this.world.createTransformEntity(a, classroom.seatEntity);
    }
  }

  update(delta: number): void {
    const ex = this.exam.exam;
    const on = ROUND.mode === 'tutorial' && ex.phase === 'playing';
    if (!on) {
      this.card.visible = false;
      for (const a of this.arrows) a.visible = false;
      this.freed = false;
      this.shown = '';
      return;
    }
    this.clock += Math.min(delta, 0.1);
    const cur = ex.cursor;
    const lesson = TUTORIAL.lesson(cur);
    const done = TUTORIAL.isDone(cur, roundStats);
    const lessonDone = done && lesson.done !== null; // lessons with no cheat to try never show the praise

    // the last lesson: she can see you now
    if (lesson.id === 'free' && !this.freed) {
      this.freed = true;
      applyTuning('easy', 1, { fruitPerRound: 999 });
    }
    if (TUTORIAL.nudgeSeq !== this.lastNudge) {
      this.lastNudge = TUTORIAL.nudgeSeq;
      this.shake = 1;
      this.shown = '';
    }
    const key = `${cur}|${lessonDone}|${this.shake > 0}`;
    if (key !== this.shown) {
      this.shown = key;
      this.paint(cur, lesson.title, lesson.text, lesson.praise, lessonDone);
    }
    this.card.visible = true;
    this.card.scale.setScalar(popupScale());
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - delta * 2);
      this.card.position.x = CARD_POS.x + Math.sin(this.clock * 50) * 0.012 * this.shake;
      if (this.shake === 0) this.shown = '';
    } else {
      this.card.position.x = CARD_POS.x;
    }
    this.card.position.y = CARD_POS.y + Math.sin(this.clock * 2) * 0.004;

    for (let i = 0; i < this.arrows.length; i++) {
      const spot = lesson.arrow[i];
      const a = this.arrows[i];
      a.visible = !!spot && !lessonDone;
      if (spot && a.visible) a.position.set(spot[0], spot[1] + Math.abs(Math.sin(this.clock * 4)) * 0.06, spot[2]);
    }
  }

  private paint(cur: number, title: string, text: string, praise: string, done: boolean): void {
    const g = this.g;
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    const nudged = this.shake > 0 && !done;
    g.fillStyle = done ? '#e6fff3' : '#fff7d6';
    g.strokeStyle = nudged ? '#d62839' : done ? '#06b57f' : '#ffb703';
    g.lineWidth = 14;
    g.beginPath();
    g.roundRect(10, 10, w - 20, h - 20, 44);
    g.fill();
    g.stroke();
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = '#6a4cff';
    g.font = `bold 48px ${FONT}`;
    g.fillText(`LESSON ${cur + 1}/${LESSONS.length}: ${title}`, 50, 68);
    g.fillStyle = '#222';
    this.wrap(done && praise ? praise : text, 50, 126, w - 100, 58, 4);
    g.fillStyle = nudged ? '#d62839' : done ? '#06b57f' : '#8a8a8a';
    g.font = `italic bold 36px ${FONT}`;
    g.fillText(nudged ? 'Try the cheat first!' : done ? (cur < LESSONS.length - 1 ? 'Now answer to go on' : '') : '', 50, h - 44);
    this.tex.needsUpdate = true;
  }

  private wrap(text: string, x: number, y: number, maxW: number, lh: number, maxLines: number): void {
    const g = this.g;
    g.font = `bold 48px ${FONT}`;
    const words = text.split(' ');
    let line = '';
    let n = 0;
    for (const word of words) {
      const t = line ? `${line} ${word}` : word;
      if (g.measureText(t).width > maxW && line) {
        g.fillText(line, x, y + n * lh);
        n += 1;
        line = word;
        if (n >= maxLines) return;
      } else line = t;
    }
    if (line) g.fillText(line, x, y + n * lh);
  }
}
