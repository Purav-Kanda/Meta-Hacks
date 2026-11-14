import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { ToyButton } from './exam-components.js';
import { FruitSystem } from './fruit-system.js';
import { PeekSystem } from './peek-system.js';
import { ROUND } from './modes.js';
import { SEATING } from './seating.js';
import { sfx } from './sfx.js';
import { TeacherSystem } from './teacher-system.js';
import { wrapAngle } from './vision.js';

const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
const std = (hex: number, rough = 0.85) => new MeshStandardMaterial({ color: hex, roughness: rough });

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!, w, h);
  const tex = new CanvasTexture(cv);
  tex.anisotropy = 16;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** a flat painted board on a wall. `faceYaw` turns it to face into the room. */
function wallBoard(tex: CanvasTexture, w: number, h: number, x: number, y: number, z: number, faceYaw: number): Group {
  const g = new Group();
  const frame = new Mesh(new BoxGeometry(w + 0.06, h + 0.06, 0.03), std(0x6b4423));
  frame.position.z = -0.036; // front of the frame 2 cm behind the picture (1 mm made them shimmer from across the room)
  g.add(frame);
  const face = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  g.add(face);
  g.position.set(x, y, z);
  g.rotation.y = faceYaw;
  return g;
}

interface Poster {
  title: string;
  lines: string[];
  bg: string;
  fg: string;
}
const POSTERS: Poster[] = [
  { title: 'CHEATING IS BAD', lines: ['Getting caught', 'is worse.'], bg: '#ffe066', fg: '#7a1f1f' },
  { title: 'a2 + b2 = c2', lines: ['(this will not', 'be on the quiz)'], bg: '#9ad1ff', fg: '#10356b' },
  { title: 'BE NICE TO', lines: ['YOUR TEACHER', '(she runs fast)'], bg: '#ffb3c7', fg: '#6b0f3a' },
  { title: 'LUNCH IS', lines: ['IN 3 HOURS', 'hang in there'], bg: '#c8f2c2', fg: '#1f5a1f' },
];

function posterTex(p: Poster): CanvasTexture {
  return canvasTex(512, 640, (g, w, h) => {
    g.fillStyle = p.bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = p.fg;
    g.lineWidth = 12;
    g.strokeRect(20, 20, w - 40, h - 40);
    g.fillStyle = p.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 84;
    g.font = `bold ${size}px ${FONT}`;
    while (g.measureText(p.title).width > w - 90 && size > 30) {
      size -= 4;
      g.font = `bold ${size}px ${FONT}`;
    }
    g.fillText(p.title, w / 2, 170);
    g.font = `bold 58px ${FONT}`;
    p.lines.forEach((ln, i) => g.fillText(ln, w / 2, 330 + i * 80));
    // a little smiley, because every poster needs one
    g.beginPath();
    g.arc(w / 2, 560, 38, 0, Math.PI * 2);
    g.stroke();
    g.fillRect(w / 2 - 14, 548, 6, 8);
    g.fillRect(w / 2 + 8, 548, 6, 8);
    g.beginPath();
    g.arc(w / 2, 562, 18, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  });
}

/**
 * Makes the room feel alive: a wall clock that shows the real exam countdown, windows with drifting
 * clouds, posters, classmates who look around, giggle at flying fruit, gasp at
 * warnings and cower when the teacher charges. Pinch a classmate for a reaction.
 */
export class LivingSystem extends createSystem({
  pressed: { required: [ToyButton, Pressed] },
}) {
  private exam!: ExamSystem;
  private teacher!: TeacherSystem;
  private fruit!: FruitSystem;
  private peek!: PeekSystem;
  private kids: Group[] = [];
  private hitBalls: Mesh[] = [];
  private adjacent: [number, number] = [-1, -1];
  private clouds: CanvasTexture[] = [];
  private clockG!: CanvasRenderingContext2D;
  private clockTex!: CanvasTexture;
  private shownClock = -2;
  private clock = 0;
  private head = new Vector3();

  // per-classmate state
  private lookYaw: number[] = [];
  private giggle: number[] = [];
  private lookPlayer: number[] = [];
  private wander: number[] = [];
  private wanderTarget: number[] = []; // -1 ahead, -2 player, -3 board, >=0 another classmate
  private cower = 0;
  private hurt: number[] = [];
  private lastLand = 0;
  private lastHit = 0;
  private lastKidHit = 0;
  private lastWarnings = 0;
  private giggleCooldown = 0;

  init(): void {
    const classroom = this.world.getSystem(ClassroomSystem);
    const exam = this.world.getSystem(ExamSystem);
    const teacher = this.world.getSystem(TeacherSystem);
    const fruit = this.world.getSystem(FruitSystem);
    const peek = this.world.getSystem(PeekSystem);
    if (!peek) throw new Error('PeekSystem must be registered before LivingSystem');
    this.peek = peek;
    if (!classroom || !exam || !teacher || !fruit) throw new Error('Classroom, Exam, Teacher and Fruit systems must be registered before LivingSystem');
    this.exam = exam;
    this.teacher = teacher;
    this.fruit = fruit;
    const room = classroom.roomEntity.object3D as Group;
    this.kids = classroom.kids;
    this.adjacent = classroom.adjacent;

    // wall decor rides with the walls (the seat draw slides them)
    this.buildClock(classroom.shell);
    this.buildWindows(classroom.shell);
    this.buildPosters(classroom.shell);
    this.buildTeacherDeskProps(room);

    // classmates you can tap: an invisible ball around each one
    this.kids.forEach((kid, i) => {
      this.lookYaw.push(0);
      this.hurt.push(0);
      this.giggle.push(0);
      this.lookPlayer.push(0);
      this.wander.push(1 + Math.random() * 4);
      this.wanderTarget.push(-1);
      const hit = new Mesh(new SphereGeometry(0.3, 8, 6), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.set(kid.position.x, 0.85, kid.position.z);
      this.hitBalls.push(hit);
      const e = this.world.createTransformEntity(hit, classroom.roomEntity);
      e.addComponent(ToyButton, { kind: 1 + i });
      e.addComponent(RayInteractable);
    });

    this.queries.pressed.subscribe('qualify', (e: Entity) => {
      const kind = e.getValue(ToyButton, 'kind') as number;
      if (kind >= 1) {
        const i = kind - 1;
        if (i >= this.kids.length) return; // another toy (seat card)
        // while the exam runs, a tap on the classmate next to you is a PEEK request (PeekSystem handles it)
        if (this.sideOf(i) >= 0 && this.exam.exam.phase === 'playing' && ROUND.allows('peek')) {
          this.lookPlayer[i] = 1.5;
          return;
        }
        this.giggle[i] = 1.2;
        this.lookPlayer[i] = 1.8;
        if (this.giggleCooldown <= 0) {
          sfx.giggle();
          this.giggleCooldown = 0.5;
        }
      }
    });
  }

  // ---------------------------------------------------------------- room dressing

  private buildClock(room: Group): void {
    this.clockTex = canvasTex(256, 256, () => {});
    this.clockG = (this.clockTex.image as HTMLCanvasElement).getContext('2d')!;
    const rim = new Mesh(new CylinderGeometry(0.36, 0.36, 0.04, 28), std(0x2b2b3a));
    rim.rotation.x = Math.PI / 2;
    const face = new Mesh(new CircleGeometry(0.33, 32), new MeshBasicMaterial({ map: this.clockTex }));
    const g = new Group();
    g.add(rim);
    face.position.z = 0.025;
    g.add(face);
    g.position.set(-3.1, 2.35, -5.94);
    room.add(g);
    this.paintClock(180, 180);
  }

  /** a countdown clock: the red wedge is the time left and the hand points at it */
  private paintClock(left: number, total: number): void {
    const g = this.clockG;
    const c = 128;
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#fffdf2';
    g.beginPath();
    g.arc(c, c, 124, 0, Math.PI * 2);
    g.fill();
    const frac = Math.max(0, Math.min(1, left / total));
    g.fillStyle = frac < 0.17 ? '#d62839' : '#ff8fa3';
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, 112, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    g.closePath();
    g.fill();
    g.strokeStyle = '#222';
    g.lineWidth = 8;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c + Math.sin(a) * 100, c - Math.cos(a) * 100);
      g.lineTo(c + Math.sin(a) * 118, c - Math.cos(a) * 118);
      g.stroke();
    }
    const a = frac * Math.PI * 2;
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c + Math.sin(a) * 90, c - Math.cos(a) * 90);
    g.stroke();
    g.fillStyle = '#222';
    g.beginPath();
    g.arc(c, c, 10, 0, Math.PI * 2);
    g.fill();
    this.clockTex.needsUpdate = true;
  }

  private buildWindows(room: Group): void {
    // clouds drift by scrolling a repeating texture
    const sky = canvasTex(256, 384, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#6ec6ff');
      grad.addColorStop(1, '#d8f1ff');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });
    for (const sx of [-1, 1]) {
      const cloud = canvasTex(512, 384, (g, w) => {
        g.fillStyle = 'rgba(255,255,255,0.95)';
        const blobs: Array<[number, number, number]> = [[90, 130, 46], [140, 115, 56], [200, 135, 44], [380, 230, 40], [425, 215, 52], [475, 235, 38]];
        for (const [x, y, r] of blobs) {
          for (const dx of [0, w]) {
            g.beginPath();
            g.arc(x + dx - (dx ? w : 0), y, r, 0, Math.PI * 2);
            g.fill();
          }
        }
      });
      cloud.wrapS = RepeatWrapping;
      this.clouds.push(cloud);
      for (const z of [-1.0, -3.6]) {
        const win = new Group();
        const frame = new Mesh(new BoxGeometry(1.5, 1.2, 0.08), std(0xf4efe4));
        win.add(frame);
        const skyP = new Mesh(new PlaneGeometry(1.36, 1.06), new MeshBasicMaterial({ map: sky, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
        skyP.position.z = 0.07; // well in front of the frame (3 cm), so nothing fights at a distance
        win.add(skyP);
        const cloudP = new Mesh(new PlaneGeometry(1.36, 1.06), new MeshBasicMaterial({ map: cloud, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        cloudP.position.z = 0.085;
        cloudP.renderOrder = 1;
        win.add(cloudP);
        const bar1 = new Mesh(new BoxGeometry(1.4, 0.04, 0.03), std(0xf4efe4));
        bar1.position.z = 0.11;
        win.add(bar1);
        const bar2 = new Mesh(new BoxGeometry(0.04, 1.1, 0.03), std(0xf4efe4));
        bar2.position.z = 0.11;
        win.add(bar2);
        win.position.set(sx * 3.96, 1.75, z);
        win.rotation.y = -sx * (Math.PI / 2);
        room.add(win);
      }
    }
  }

  private buildPosters(room: Group): void {
    const spots: Array<[number, number, number, number]> = [
      [-3.95, 1.7, -2.3, Math.PI / 2], // left wall, between the windows, faces +x
      [3.95, 1.7, -2.3, -Math.PI / 2],
      [3.3, 2.0, -5.93, 0], // front wall, right of the board
      [-3.95, 1.7, -5.0, Math.PI / 2],
    ];
    spots.forEach(([x, y, z, yaw], i) => {
      room.add(wallBoard(posterTex(POSTERS[i % POSTERS.length]), 0.55, 0.69, x, y, z, yaw));
    });
  }

  private buildTeacherDeskProps(room: Group): void {
    const top = 0.8; // teacher desk surface (desk centered at x=2.4, z=-4.8, 1.7 wide, 0.85 deep)
    const apple = new Mesh(new SphereGeometry(0.06, 12, 10), std(0xe63946));
    apple.position.set(1.85, top + 0.058, -4.75);
    room.add(apple);
    const stem = new Mesh(new CylinderGeometry(0.005, 0.005, 0.03, 5), std(0x5a3a1a));
    stem.position.set(1.85, top + 0.125, -4.75);
    room.add(stem);
    for (let i = 0; i < 4; i++) {
      const sheet = new Mesh(new BoxGeometry(0.3, 0.012, 0.22), std(0xfffdf2));
      sheet.position.set(2.5, top + 0.006 + i * 0.012, -4.8);
      sheet.rotation.y = 0.15 * i - 0.2;
      room.add(sheet);
    }
    const mug = new Mesh(new CylinderGeometry(0.05, 0.045, 0.1, 12), std(0x3a86ff));
    mug.position.set(3.0, top + 0.05, -4.9);
    room.add(mug);
  }

  // ---------------------------------------------------------------- per-frame

  update(delta: number): void {
    const dt = Math.min(delta, 0.1);
    this.clock += dt;
    this.giggleCooldown = Math.max(0, this.giggleCooldown - dt);
    for (let i = 0; i < this.clouds.length; i++) this.clouds[i].offset.x = (this.clock * 0.012 * (i ? -1 : 1)) % 1;

    // the clock shows the exam countdown
    const ex = this.exam.exam;
    const left = ex.phase === 'playing' ? Math.ceil(ex.secondsLeft) : ex.phase === 'ready' ? ex.rules.seconds : -1;
    if (left !== this.shownClock) {
      this.shownClock = left;
      this.paintClock(Math.max(0, left), ex.rules.seconds);
    }

    this.reactToEvents();
    this.animateKids(dt);
  }

  private reactToEvents(): void {
    const f = this.fruit;
    if (f.landSeq !== this.lastLand) {
      this.lastLand = f.landSeq;
      for (let i = 0; i < this.kids.length; i++) this.giggle[i] = Math.max(this.giggle[i], 0.6 + Math.random() * 0.6);
      if (this.giggleCooldown <= 0) {
        sfx.giggle();
        this.giggleCooldown = 0.6;
      }
    }
    if (f.hitSeq !== this.lastHit) {
      this.lastHit = f.hitSeq;
      sfx.oooh();
      for (let i = 0; i < this.kids.length; i++) this.giggle[i] = 1.6;
    }
    if (f.kidHitSeq !== this.lastKidHit) {
      this.lastKidHit = f.kidHitSeq;
      const i = f.kidHitIdx;
      if (i >= 0 && i < this.kids.length) {
        this.giggle[i] = 0; // the victim is not laughing
        this.lookPlayer[i] = 3;
        this.hurt[i] = 1;
      }
      for (let j = 0; j < this.kids.length; j++) if (j !== i) this.giggle[j] = 1.8;
      if (this.giggleCooldown <= 0) {
        sfx.giggle();
        this.giggleCooldown = 0.6;
      }
    }
    const w = this.exam.exam.warnings;
    if (w > this.lastWarnings) {
      sfx.oooh();
      for (let i = 0; i < this.kids.length; i++) this.lookPlayer[i] = 1.8;
    }
    this.lastWarnings = w;
  }

  /** 0 / 1 when classmate i sits on your left / right, else -1 */
  private sideOf(i: number): number {
    return this.adjacent[0] === i ? 0 : this.adjacent[1] === i ? 1 : -1;
  }

  private animateKids(dt: number): void {
    // the classmates live in room coordinates, you and your stuff in seat coordinates: add your seat's offset
    this.world.camera.getWorldPosition(this.head);
    this.head.x += SEATING.dx;
    this.head.z += SEATING.dz;
    const proj = this.fruit.projectile;
    // the click balls follow the classmates (they change seats)
    for (let i = 0; i < this.kids.length; i++) this.hitBalls[i].position.set(this.kids[i].position.x, 0.85, this.kids[i].position.z);
    // the nearest charging teacher, if any
    let rushX = 0;
    let rushZ = 0;
    let rushing = false;
    for (const t of this.teacher.ais) {
      if (t.mode === 'rush') {
        rushing = true;
        rushX = t.x;
        rushZ = t.z;
      }
    }
    this.cower += ((rushing ? 1 : 0) - this.cower) * Math.min(1, dt * 5);

    for (let i = 0; i < this.kids.length; i++) {
      const kid = this.kids[i];
      const headG = kid.userData.head as Group;
      const pupils = kid.userData.pupils as Mesh[];
      this.giggle[i] = Math.max(0, this.giggle[i] - dt);
      this.hurt[i] = Math.max(0, this.hurt[i] - dt * 0.7);
      this.lookPlayer[i] = Math.max(0, this.lookPlayer[i] - dt);

      // what is this classmate looking at?
      let tx = 0;
      let tz = 0;
      let has = true;
      if (proj.active) {
        tx = proj.x + SEATING.dx;
        tz = proj.z + SEATING.dz;
      } else if (rushing) {
        tx = rushX;
        tz = rushZ;
      } else if (this.lookPlayer[i] > 0) {
        tx = this.head.x;
        tz = this.head.z;
      } else {
        this.wander[i] -= dt;
        if (this.wander[i] <= 0) {
          this.wander[i] = 2 + Math.random() * 4;
          const r = Math.random();
          this.wanderTarget[i] = r < 0.35 ? -1 : r < 0.55 ? -2 : r < 0.7 ? -3 : Math.floor(Math.random() * this.kids.length);
        }
        const wt = this.wanderTarget[i];
        if (wt === -2) {
          tx = this.head.x;
          tz = this.head.z;
        } else if (wt === -3) {
          tx = 0;
          tz = -5.9;
        } else if (wt >= 0 && wt !== i) {
          tx = this.kids[wt].position.x;
          tz = this.kids[wt].position.z;
        } else {
          has = false;
        }
      }
      let desired = 0;
      if (has) desired = wrapAngle(Math.atan2(-(tx - kid.position.x), -(tz - kid.position.z)));
      desired = Math.max(-1.2, Math.min(1.2, desired));
      const side = this.sideOf(i);
      const pst = side >= 0 ? this.peek.model.state[side] : 'idle';
      if (pst === 'sharing') {
        // turn to face you while deciding / sharing
        desired = wrapAngle(Math.atan2(-(this.head.x - kid.position.x), -(this.head.z - kid.position.z)));
        desired = Math.max(-1.2, Math.min(1.2, desired));
      }
      this.lookYaw[i] += (desired - this.lookYaw[i]) * Math.min(1, dt * 6);
      headG.rotation.y = this.lookYaw[i];
      if (pst === 'refusing') headG.rotation.y += Math.sin(this.clock * 20) * 0.55; // head shake: no way
      const resid = desired - this.lookYaw[i];
      for (const p of pupils) {
        p.position.x = Math.sign(p.position.x || 1) * 0.085 + Math.max(-0.03, Math.min(0.03, resid * 0.08));
      }

      const g = Math.min(1, this.giggle[i]);
      headG.rotation.x = Math.sin(this.clock * 24 + i) * 0.1 * g + 0.3 * this.cower + (pst === 'sulking' ? 0.25 : 0) + (pst === 'asking' ? 0.4 : 0);
      kid.position.y += Math.abs(Math.sin(this.clock * 17 + i)) * 0.035 * g - 0.04 * this.cower;
      kid.rotation.z += Math.sin(this.clock * 21 + i) * 0.07 * g;
      // bonked: a quick jolt backward, then shake it off
      const hu = this.hurt[i];
      if (hu > 0) {
        headG.rotation.x -= Math.sin(Math.min(1, (1 - hu) * 4) * Math.PI) * 0.5;
        kid.rotation.z += Math.sin(this.clock * 30) * 0.12 * hu;
      }
      kid.scale.y = 1 - 0.07 * this.cower;
    }
  }
}
