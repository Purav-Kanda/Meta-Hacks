import {
  BoxGeometry,
  CanvasTexture,
  DistanceGrabbable,
  Entity,
  GrabSystem,
  Grabbed,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MovementMode,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { CribModel } from './crib.js';
import { CribGrab } from './exam-components.js';
import { ExamSystem } from './exam-system.js';
import { roundStats } from './progress.js';
import { ROUND } from './modes.js';
import { sfx } from './sfx.js';
import { TeacherSystem } from './teacher-system.js';
import { ACTIVE_TUNING, onTuningChange } from './tuning.js';

const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
const TRAY_POS = new Vector3(0, 0.655, -0.07); // a tray hanging under the front edge of your desk; the sheet in it sticks out past the edge
const LOOK_COS = Math.cos((30 * Math.PI) / 180); // gaze within 30 degrees of the sheet counts as looking at it
const REGRAB_DELAY = 0.45; // seconds before the sheet can be grabbed again after letting go
const TILT = -Math.atan2(1.3 - TRAY_POS.y, 0.2 - TRAY_POS.z); // face the sheet toward your eyes (seated eye ~ (0,1.3,0.2))

/**
 * The crib sheet: grab it from the tray under your desk (trigger or pinch), lift it above the desk and look
 * at it to read the notes, then tuck it back under the desk. Held up, dropped or lying around = the teacher
 * can see it. If she warns you while it is visible, she takes it.
 */
export class CribSystem extends createSystem({
  held: { required: [CribGrab, Grabbed] },
}) {
  model = new CribModel({ count: ACTIVE_TUNING.cribCount, readSeconds: ACTIVE_TUNING.cribReadSeconds }, Math.random);

  private exam!: ExamSystem;
  private teacher!: TeacherSystem;
  private sheet!: Mesh;
  private sheetEntity!: Entity;
  private g!: CanvasRenderingContext2D;
  private tex!: CanvasTexture;
  private head = new Vector3();
  private dir = new Vector3();
  private to = new Vector3();
  private wasPlaying = false;
  private grabOn = false;
  private shown = '';
  private clock = 0;
  private seenDrop = 0;
  private seenLand = 0;
  private seenTuck = 0;
  private regrabWait = 0;

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
    // an invisible slab just around the sheet (a bit bigger than it, so it is easy to grab but you cannot hit it
    // through the desk: a ball here used to poke up through the desk top)
    this.sheet.add(new Mesh(new BoxGeometry(0.28, 0.32, 0.07), new MeshBasicMaterial({ visible: false })));
    this.sheet.visible = false;
    this.sheetEntity = this.world.createTransformEntity(this.sheet, room);
    this.sheetEntity.addComponent(CribGrab, { id: 0 });
    this.poseInTray();

    // grabbed / let go
    this.queries.held.subscribe('qualify', () => {
      if (this.model.grab()) {
        this.sheet.rotation.set(-Math.PI / 2, 0, 0);
        sfx.rustle();
      } else {
        // the model says no (it is falling or gone): do not let the hand drag it around against the model
        this.world.getSystem(GrabSystem)?.forceRelease(this.sheetEntity);
      }
    });
    this.queries.held.subscribe('disqualify', () => {
      if (!this.wasPlaying) return;
      const p = this.sheet.position;
      const where = this.model.release(p.x, p.y, p.z);
      if (where === 'tray') this.poseInTray();
      // a pinch that flickers (the tracking loses it for a frame) must not grab again at once, drop again, and loop
      this.regrabWait = REGRAB_DELAY;
    });
    this.paint('idle');
  }

  private poseInTray(): void {
    // lying in the tray, leaning slightly toward you (a tilted full-size sheet would poke through the tray floor)
    this.sheet.position.set(TRAY_POS.x, TRAY_POS.y + 0.055, TRAY_POS.z);
    this.sheet.rotation.set(-Math.PI / 2 + 0.25, 0, 0);
  }

  private setGrabbable(on: boolean): void {
    if (on === this.grabOn) return;
    this.grabOn = on;
    if (on) {
      this.sheetEntity.addComponent(DistanceGrabbable, {
        rotate: false,
        scale: false,
        movementMode: MovementMode.MoveTowardsTarget,
        targetPositionOffset: [0, 0, -0.4],
        moveSpeedFactor: 1,
      });
    } else {
      if (this.sheetEntity.hasComponent(Grabbed)) this.world.getSystem(GrabSystem)?.forceRelease(this.sheetEntity);
      if (this.sheetEntity.hasComponent(DistanceGrabbable)) this.sheetEntity.removeComponent(DistanceGrabbable);
    }
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
      this.seenDrop = m.dropSeq;
      this.seenLand = m.landSeq;
      this.seenTuck = m.tuckSeq;
      this.wasPlaying = true;
      this.poseInTray();
      this.sheet.visible = ROUND.allows('crib');
    }
    if (!ROUND.allows('crib')) return;

    // only grabbable while it is in the tray or lying somewhere (not while it falls, not once confiscated)
    this.regrabWait = Math.max(0, this.regrabWait - dt);
    this.setGrabbable((m.state === 'tray' || m.state === 'held' || m.state === 'rest') && (m.state === 'held' || this.regrabWait <= 0));

    if (m.state === 'held') {
      const p = this.sheet.position;
      // never through the desk slab or what stands on it: around the desk it stays under it or over it (see crib.ts)
      p.y = m.constrainHeld(p.x, p.y, p.z);
      // flat while low (so it fits under the desk), tilting toward your eyes as you lift it up to read
      const tilt = Math.min(1, Math.max(0, (p.y - 0.8) / 0.1));
      this.sheet.rotation.set(-Math.PI / 2 + (TILT + Math.PI / 2) * tilt, 0, 0);
      m.setHeld(p.x, p.y, p.z);
    }

    // are you looking at the sheet?
    this.world.camera.getWorldPosition(this.head);
    this.world.camera.getWorldDirection(this.dir);
    this.to.copy(this.sheet.position).sub(this.head).normalize();
    const looking = this.dir.dot(this.to) >= LOOK_COS;

    // she just warned you while it was in sight: she takes it
    if (this.teacher.anyWarned) m.confiscate();

    if (m.update(dt, looking)) {
      roundStats.cribReads += 1;
      sfx.rustle();
    }

    if (m.state === 'falling' || m.state === 'rest') {
      this.sheet.position.set(m.x, m.y, m.z);
      const k = m.state === 'falling' ? 1 : 0;
      // flutter down, then lie flat
      this.sheet.rotation.x += ((m.state === 'rest' ? -Math.PI / 2 : TILT) - this.sheet.rotation.x) * Math.min(1, dt * 6);
      this.sheet.rotation.z = Math.sin(this.clock * 7) * 0.35 * k + (m.state === 'rest' ? this.sheet.rotation.z * (1 - Math.min(1, dt * 6)) : 0);
    }
    this.sheet.visible = m.state !== 'gone';

    if (m.dropSeq !== this.seenDrop) {
      this.seenDrop = m.dropSeq;
      sfx.oooh();
    }
    if (m.landSeq !== this.seenLand) {
      this.seenLand = m.landSeq;
      sfx.rustle();
    }
    if (m.tuckSeq !== this.seenTuck) {
      this.seenTuck = m.tuckSeq;
      sfx.rustle();
    }
    ex.evidence.set('crib', m.evidence);
    this.syncView();
  }

  private clearAll(): void {
    this.setGrabbable(false);
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
      while (g.measureText('(hold me up and look!)').width > w - 70 && px > 18) {
        px -= 2;
        g.font = `bold ${px}px ${FONT}`;
      }
      g.fillText('(hold me up and look!)', w / 2, h / 2);
      g.font = `bold 120px ${FONT}`;
      g.fillText('...', w / 2, h / 2 + 100);
    }
    this.tex.needsUpdate = true;
  }
}
