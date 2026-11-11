import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { PeekSystem } from './peek-system.js';
import { ROUND } from './modes.js';
import { ACTIVE_TUNING } from './tuning.js';
import { ToyButton } from './exam-components.js';
import { SEAT, SEATS, neighborCount } from './seat.js';
import { SEATING } from './seating.js';
import { sfx } from './sfx.js';

const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
const EYE = new Vector3(0, 1.3, 0.2);
const CARD_POS = new Vector3(0, 1.14, -0.75);
const SPIN_SECONDS = 2.8; // the seating chart flickers between seats, slowing down, then lands
const TOTAL_SECONDS = 11.0; // then the reveal; it ends by itself or when you click
const TAG_POS = new Vector3(0, 0.781, -0.3);

/**
 * Every round starts with a seat draw: a little seating chart flickers through the desks and lands on yours,
 * then says what that seat means (a corner seat has one less neighbor to copy from; the front row is right under
 * her nose). The exam clock and answers wait for it. Click the card to skip the reveal.
 */
export class SeatSystem extends createSystem({
  pressed: { required: [ToyButton, Pressed] },
}) {
  private card!: Mesh;
  private g!: CanvasRenderingContext2D;
  private tex!: CanvasTexture;
  private tag!: Mesh;
  private tagG!: CanvasRenderingContext2D;
  private tagTex!: CanvasTexture;
  private classroom!: ClassroomSystem;
  private exam!: ExamSystem;
  private seenSeq = 0;
  private t = 0;
  private lastFlick = -1;
  private landed = false;
  private clock = 0;
  private peek!: PeekSystem;
  private pendingRoom = false;
  private lastTaps = -99;
  private lastNoTaps = 0;
  private flash = 0;
  private tapGfx: Mesh[] = [];
  private tapG: CanvasRenderingContext2D[] = [];
  private tapTex: CanvasTexture[] = [];

  init(): void {
    const classroom = this.world.getSystem(ClassroomSystem);
    const exam = this.world.getSystem(ExamSystem);
    if (!classroom || !exam) throw new Error('Classroom and Exam systems must be registered before SeatSystem');
    this.classroom = classroom;
    this.exam = exam;
    const peek = this.world.getSystem(PeekSystem);
    if (!peek) throw new Error('PeekSystem must be registered before SeatSystem');
    this.peek = peek;

    const cv = document.createElement('canvas');
    cv.width = 800;
    cv.height = 520;
    this.g = cv.getContext('2d')!;
    this.tex = new CanvasTexture(cv);
    this.tex.anisotropy = 16;
    this.tex.colorSpace = SRGBColorSpace;
    this.card = new Mesh(new PlaneGeometry(0.9, 0.585), new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false }));
    this.card.position.copy(CARD_POS);
    this.card.rotation.y = Math.atan2(EYE.x - CARD_POS.x, EYE.z - CARD_POS.z);
    this.card.renderOrder = 9;
    this.card.visible = false;
    const e = this.world.createTransformEntity(this.card, classroom.seatEntity);
    // click the card to skip (ToyButton kind 20 is ignored by the other systems)
    e.addComponent(ToyButton, { kind: 20 });
    e.addComponent(RayInteractable);
    this.queries.pressed.subscribe('qualify', (en) => {
      if (en.getValue(ToyButton, 'kind') === 20 && SEAT.holding && this.landed && this.t > SPIN_SECONDS + 1.0) SEAT.skip = true;
    });

    // a little name tag on your desk: which seat you drew
    const tv = document.createElement('canvas');
    tv.width = 384;
    tv.height = 128;
    this.tagG = tv.getContext('2d')!;
    this.tagTex = new CanvasTexture(tv);
    this.tagTex.anisotropy = 16;
    this.tagTex.colorSpace = SRGBColorSpace;
    this.tag = new Mesh(new PlaneGeometry(0.15, 0.05), new MeshBasicMaterial({ map: this.tagTex, transparent: true, depthWrite: false }));
    this.tag.rotation.x = -Math.PI / 2 + 0.25;
    this.tag.position.copy(TAG_POS);
    this.world.createTransformEntity(this.tag, classroom.seatEntity);
    this.paintTag();

    // "taps left" pills over the two neighbors' heads
    for (let i = 0; i < 2; i++) {
      const cv2 = document.createElement('canvas');
      cv2.width = 320;
      cv2.height = 110;
      this.tapG.push(cv2.getContext('2d')!);
      const tt = new CanvasTexture(cv2);
      tt.anisotropy = 16;
      tt.colorSpace = SRGBColorSpace;
      this.tapTex.push(tt);
      const m = new Mesh(new PlaneGeometry(0.22, 0.0757), new MeshBasicMaterial({ map: tt, transparent: true, depthWrite: false }));
      m.position.set(i === 0 ? -0.52 : 0.52, 1.24, -0.55);
      m.rotation.y = Math.atan2(EYE.x - m.position.x, EYE.z - m.position.z);
      m.renderOrder = 6;
      m.visible = false;
      this.world.createTransformEntity(m, classroom.seatEntity);
      this.tapGfx.push(m);
    }
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.1);
    this.clock += dt;
    if (SEAT.seq !== this.seenSeq) {
      this.seenSeq = SEAT.seq;
      this.paintTag();
      if (!SEAT.holding) this.applyRoom();
      else this.pendingRoom = true;
      if (SEAT.holding) {
        this.t = 0;
        this.lastFlick = -1;
        this.landed = false;
        this.card.visible = true;
      }
    }
    // the desk tag shows how many shoulder taps are left
    const taps = this.exam.exam.phase === 'playing' ? this.peek.model.tapsLeft : ACTIVE_TUNING.peekTaps;
    if (this.peek.noTapsSeq !== this.lastNoTaps) {
      this.lastNoTaps = this.peek.noTapsSeq;
      this.flash = 0.8;
      this.lastTaps = -98;
    }
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.lastTaps = -98;
    }
    if (taps !== this.lastTaps) {
      this.lastTaps = taps;
      this.paintTaps(0);
      this.paintTaps(1);
    }
    const showTaps = this.exam.exam.phase === 'playing' && !SEAT.holding && ROUND.allows('peek') && ACTIVE_TUNING.peekTaps < 99;
    for (let i = 0; i < 2; i++) this.tapGfx[i].visible = showTaps && this.classroom.adjacent[i] >= 0;
    if (!SEAT.holding) {
      this.card.visible = false;
      return;
    }
    this.t += dt;
    if (this.t < SPIN_SECONDS) {
      // flicker faster at the start, slower at the end
      const rate = 0.07 + 0.22 * (this.t / SPIN_SECONDS) ** 2;
      const idx = Math.floor(this.t / rate);
      if (idx !== this.lastFlick) {
        this.lastFlick = idx;
        this.paintCard(SEATS[Math.floor(Math.random() * SEATS.length)].id, false);
        sfx.click();
      }
    } else if (!this.landed) {
      this.landed = true;
      this.paintCard(SEAT.current.id, true);
      if (this.pendingRoom) this.applyRoom();
      sfx.ding();
    }
    // a little pop when it lands
    const since = this.t - SPIN_SECONDS;
    const pop = this.landed && since < 0.25 ? 1 + Math.sin((since / 0.25) * Math.PI) * 0.08 : 1;
    this.card.scale.setScalar(pop);
    if (this.t >= TOTAL_SECONDS || (SEAT.skip && this.landed)) SEAT.finish();
  }

  /** put the neighbors and the room walls where this seat says */
  private applyRoom(): void {
    this.pendingRoom = false;
    const s = SEAT.current;
    SEATING.set(s.row, s.col);
    this.classroom.applySeating();
  }

  private paintTag(): void {
    const g = this.tagG;
    g.clearRect(0, 0, 384, 128);
    g.fillStyle = '#fffdf2';
    g.strokeStyle = '#6a4cff';
    g.lineWidth = 8;
    g.beginPath();
    g.roundRect(6, 6, 372, 116, 22);
    g.fill();
    g.stroke();
    g.fillStyle = '#6a4cff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 26px ${FONT}`;
    g.fillText('MY SEAT', 192, 34);
    g.fillStyle = '#222';
    let px = 40;
    g.font = `bold ${px}px ${FONT}`;
    while (g.measureText(SEAT.current.name).width > 340 && px > 22) {
      px -= 2;
      g.font = `bold ${px}px ${FONT}`;
    }
    g.fillText(SEAT.current.name, 192, 84);
    this.tagTex.needsUpdate = true;
  }

  /** the "shoulder taps left" pill that floats over a neighbor's head */
  private paintTaps(i: number): void {
    const g = this.tapG[i];
    const max = ACTIVE_TUNING.peekTaps;
    const left = this.exam.exam.phase === 'playing' ? this.peek.model.tapsLeft : max;
    g.clearRect(0, 0, 320, 110);
    g.fillStyle = this.flash > 0 ? '#d62839' : '#fffdf2';
    g.strokeStyle = this.flash > 0 ? '#ffffff' : '#6a4cff';
    g.lineWidth = 8;
    g.beginPath();
    g.roundRect(6, 6, 308, 98, 30);
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = this.flash > 0 ? '#ffffff' : '#6a4cff';
    g.font = `bold 28px ${FONT}`;
    g.fillText(this.flash > 0 ? 'NO TAPS LEFT!' : 'TAPS LEFT', 160, 34);
    const step = max > 6 ? 30 : 42;
    const x0 = 160 - ((max - 1) * step) / 2;
    for (let k = 0; k < max; k++) {
      g.fillStyle = k < left ? '#ff9f1c' : this.flash > 0 ? '#ffb3bb' : '#d9d2b8';
      g.beginPath();
      g.arc(x0 + k * step, 74, 14, 0, Math.PI * 2);
      g.fill();
    }
    this.tapTex[i].needsUpdate = true;
  }

  private paintCard(highlight: string, landed: boolean): void {
    const g = this.g;
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff7d6';
    g.strokeStyle = landed ? '#06b57f' : '#ffb703';
    g.lineWidth = 14;
    g.beginPath();
    g.roundRect(10, 10, w - 20, h - 20, 44);
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#6a4cff';
    g.font = `bold 46px ${FONT}`;
    g.fillText(landed ? 'YOUR SEAT TODAY' : 'ASSIGNING SEATS...', w / 2, 62);

    // seating chart: 2 rows x 3 columns, the teacher's desk up front
    const cx = 210;
    const top = 130;
    const cw = 100;
    const ch = 105;
    g.fillStyle = '#4a7a4a';
    g.beginPath();
    g.roundRect(cx - 150, top - 40, 300, 28, 8);
    g.fill();
    g.fillStyle = '#fff';
    g.font = `bold 20px ${FONT}`;
    g.fillText('TEACHER', cx, top - 26);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const x = cx - cw + c * cw;
        const y = top + 8 + r * ch;
        const seat = SEATS.find((s) => s.row === r && s.col === c);
        const lit = !!seat && seat.id === highlight;
        g.fillStyle = lit ? (landed ? '#06b57f' : '#ff9f1c') : '#e2d9b8';
        g.beginPath();
        g.roundRect(x - 38, y + 6, 76, 70, 12);
        g.fill();
        if (lit) {
          g.strokeStyle = '#fff';
          g.lineWidth = 5;
          g.stroke();
        }
      }
    }

    if (landed) {
      const s = SEAT.current;
      g.textAlign = 'left';
      g.fillStyle = '#222';
      let px = 54;
      g.font = `bold ${px}px ${FONT}`;
      while (g.measureText(s.name).width > 360 && px > 28) {
        px -= 2;
        g.font = `bold ${px}px ${FONT}`;
      }
      g.fillText(s.name, 400, 150);
      g.font = `bold 30px ${FONT}`;
      g.fillStyle = '#06b57f';
      this.wrap(`+ ${s.good}`, 400, 215, 360, 38, 2);
      g.fillStyle = '#d62839';
      this.wrap(`- ${s.bad}`, 400, 305, 360, 38, 2);
      g.fillStyle = '#6a4cff';
      g.font = `bold 28px ${FONT}`;
      g.fillText(`neighbors: ${neighborCount(s)}`, 400, 400);
      g.textAlign = 'center';
      g.fillStyle = '#8a8a8a';
      g.font = `italic 26px ${FONT}`;
      g.fillText('pinch to start', w / 2, h - 52);
    } else {
      g.fillStyle = '#8a8a8a';
      g.font = `italic bold 40px ${FONT}`;
      g.fillText('...', 590, 280);
    }
    this.tex.needsUpdate = true;
  }

  private wrap(text: string, x: number, y: number, maxW: number, lh: number, maxLines: number): void {
    const g = this.g;
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
