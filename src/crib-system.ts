import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { CribModel } from './crib.js';
import { ExamSystem } from './exam-system.js';
import { roundStats } from './progress.js';
import { ROUND } from './modes.js';
import { sfx } from './sfx.js';
import { TeacherSystem } from './teacher-system.js';
import { ACTIVE_TUNING, onTuningChange } from './tuning.js';

const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
const TRAY_POS = new Vector3(0, 0.655, -0.07); // a tray hanging under the front edge of your desk; the sheet in it sticks out past the edge
const LOOK_COS = Math.cos((25 * Math.PI) / 180); // gaze within 25 degrees of the sheet counts as looking at it
const DOWN_MAX_Y = -0.82; // ...and only if your head is bent down at least ~55 degrees (look-direction y at or below this): neck bent, chin down

/**
 * The crib sheet: it sticks out of a tray under your desk. No grabbing: look down at it to read the notes.
 * While you look at it (and a moment after) the teacher can see you; if she warns you then, she takes it.
 */
export class CribSystem extends createSystem({}) {
  model = new CribModel({ count: ACTIVE_TUNING.cribCount, readSeconds: ACTIVE_TUNING.cribReadSeconds }, Math.random);

  private exam!: ExamSystem;
  private teacher!: TeacherSystem;
  private sheet!: Mesh;
  private g!: CanvasRenderingContext2D;
  private tex!: CanvasTexture;
  private head = new Vector3();
  private dir = new Vector3();
  private to = new Vector3();
  private wasPlaying = false;
  private shown = '';
  private clock = 0;

  init(): void {
    onTuningChange(() => {
      this.model.rules.count = ACTIVE_TUNING.cribCount;
      this.model.rules.readSeconds = ACTIVE_TUNING.cribReadSeconds;
    });
    const classroom = this.world.getSystem(ClassroomSystem);
    const exam = this.world.getSystem(ExamSystem);
    const teacher = this.world.getSystem(TeacherSystem);
    if (!classroom || !exam || !teacher) throw new Error('Classroom, Exam and Teacher systems must be registered before CribSystem');
    this.exam = exam;
    this.teacher = teacher;
    const room = classroom.seatEntity;

    // the tray: a shelf under the desk edge on two hangers, with a back wall and a front lip
    const wood = new MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
    const tray = new Group();
    const base = new Mesh(new BoxGeometry(0.34, 0.012, 0.4), wood);
    tray.add(base);
    const back = new Mesh(new BoxGeometry(0.34, 0.07, 0.012), wood);
    back.position.set(0, 0.035, -0.194);
    tray.add(back);
    const lip = new Mesh(new BoxGeometry(0.34, 0.025, 0.012), wood);
    lip.position.set(0, 0.0125, 0.194);
    tray.add(lip);
    for (const sx of [-0.15, 0.15]) {
      const hanger = new Mesh(new BoxGeometry(0.012, 0.08, 0.012), wood);
      hanger.position.set(sx, 0.045, -0.194);
      tray.add(hanger);
    }
    tray.position.set(TRAY_POS.x, TRAY_POS.y - 0.012, TRAY_POS.z);
    this.world.createTransformEntity(tray, room);

    const cv = document.createElement('canvas');
    cv.width = 520;
    cv.height = 680;
    this.g = cv.getContext('2d')!;
    this.tex = new CanvasTexture(cv);
    this.tex.anisotropy = 16;
    this.tex.colorSpace = SRGBColorSpace;
    this.sheet = new Mesh(new PlaneGeometry(0.26, 0.34), new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, side: 2 }));
    this.sheet.visible = false;
    this.world.createTransformEntity(this.sheet, room);
    this.poseInTray();

    this.paint('idle');
  }

  private poseInTray(): void {
    // lying in the tray, leaning slightly toward you (a tilted full-size sheet would poke through the tray floor)
    this.sheet.position.set(TRAY_POS.x, TRAY_POS.y + 0.055, TRAY_POS.z);
    this.sheet.rotation.set(-Math.PI / 2 + 0.37, 0, 0);
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
    const m = this.model;
    if (!this.wasPlaying) {
      m.deal(ex.questions.map((q) => q.note));
      this.wasPlaying = true;
      this.poseInTray();
      this.sheet.visible = ROUND.allows('crib');
    }
    if (!ROUND.allows('crib')) return;

    // are you looking at the sheet?
    this.world.camera.getWorldPosition(this.head);
    this.world.camera.getWorldDirection(this.dir);
    this.to.copy(this.sheet.position).sub(this.head).normalize();
    const looking = this.dir.y <= DOWN_MAX_Y && this.dir.dot(this.to) >= LOOK_COS;

    // she just warned you while it was in sight: she takes it
    if (this.teacher.anyWarned) m.confiscate();

    if (m.update(dt, looking)) {
      roundStats.cribReads += 1;
      sfx.rustle();
    }

    this.sheet.visible = m.state !== 'gone';
    ex.evidence.set('crib', m.evidence);
    this.syncView();
  }

  private clearAll(): void {
    this.model.reset();
    this.exam.exam.evidence.set('crib', false);
    this.sheet.visible = false;
    this.poseInTray();
    this.shown = '';
  }

  private syncView(): void {
    const m = this.model;
    const key = m.state === 'gone' ? 'gone' : m.reading ? 'read' : 'idle';
    if (key !== this.shown) {
      this.shown = key;
      this.paint(key);
    }
  }

  private wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      const t = cur ? `${cur} ${word}` : word;
      if (g.measureText(t).width > maxW && cur) {
        lines.push(cur);
        cur = word;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  private paint(mode: 'idle' | 'read' | 'gone'): void {
    const g = this.g;
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    // a crumpled little note
    g.save();
    g.fillStyle = '#fff6c9';
    g.strokeStyle = '#d9c36a';
    g.lineWidth = 8;
    g.beginPath();
    g.roundRect(8, 8, w - 16, h - 16, 18);
    g.fill();
    g.stroke();
    g.restore();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#7a5a12';
    g.font = `bold 44px ${FONT}`;
    g.fillText('CRIB SHEET', w / 2, 52);
    g.font = `italic 24px ${FONT}`;
    g.fillStyle = '#9a8a50';
    g.fillText('(my notes... read them!)', w / 2, 92);
    g.fillStyle = '#7a5a12';
    g.strokeStyle = '#d9c36a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(30, 112);
    g.lineTo(w - 30, 112);
    g.stroke();

    if (mode === 'gone') {
      g.save();
      g.translate(w / 2, h / 2 + 20);
      g.rotate(-0.3);
      g.fillStyle = '#d62839';
      g.beginPath();
      g.roundRect(-170, -48, 340, 96, 16);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `bold 52px ${FONT}`;
      g.fillText('CONFISCATED', 0, 4);
      g.restore();
    } else if (mode === 'read') {
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.font = `bold 33px ${FONT}`;
      let y = 140;
      for (const note of this.model.notes) {
        const lines = this.wrap(g, note, w - 110);
        g.fillStyle = '#d6335a';
        g.fillText('\u2022', 36, y);
        g.fillStyle = '#3a2f12';
        for (const ln of lines) {
          g.fillText(ln, 70, y);
          y += 38;
        }
        y += 22;
      }
      g.textBaseline = 'middle';
    } else {
      g.fillStyle = '#b5a880';
      let px = 34;
      g.font = `bold ${px}px ${FONT}`;
      while (g.measureText('(look down to read!)').width > w - 70 && px > 18) {
        px -= 2;
        g.font = `bold ${px}px ${FONT}`;
      }
      g.fillText('(look down to read!)', w / 2, h / 2);
      g.font = `bold 120px ${FONT}`;
      g.fillText('...', w / 2, h / 2 + 100);
    }
    this.tex.needsUpdate = true;
  }
}
