import {
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PokeInteractable,
  Pressed,
  RayInteractable,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { FruitButton } from './exam-components.js';
import { FruitModel } from './fruit.js';
import { TeacherSystem } from './teacher-system.js';
import { ACTIVE_TUNING } from './tuning.js';

const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
const KINDS = 5; // banana, apple, orange, watermelon, pineapple
const BONKS = ['BONK!', 'SPLAT!', 'THUD!', 'PLOP!', 'BOING!'];
const FLIGHT_SECONDS = 0.9;
// bowl on the desk, the spot a picked fruit hovers at, and the two throw zones on the floor
const BOWL = { x: 0.46, y: 0.79, z: -0.5 };
const HAND = { x: 0.4, y: 1.14, z: -0.4 };
const ZONE_X = [-3.1, 3.1];
const ZONE_Z = -3.4;
// where she stands to stare at a fruit, in front of each zone
const STAND_X = [-2.2, 2.2];
const STAND_Z = -3.5;
const LANDED_SLOTS = 2; // resting copies per fruit kind (stock is small, so this is plenty)

const flat = (hex: number) => new MeshStandardMaterial({ color: hex, roughness: 0.8 });

function makeFruit(kind: number): Group {
  const g = new Group();
  if (kind === 0) {
    // banana: a yellow arc with dark tips
    const arc = new Mesh(new TorusGeometry(0.085, 0.02, 8, 14, Math.PI * 0.8), flat(0xffd60a));
    arc.rotation.z = Math.PI * 0.1 + Math.PI / 2 + 0.0;
    arc.position.y = -0.05;
    g.add(arc);
    for (const s of [-1, 1]) {
      const tip = new Mesh(new SphereGeometry(0.014, 6, 5), flat(0x4a3b1d));
      const a = Math.PI * 0.4 * s + Math.PI / 2 + Math.PI * 0.1 - Math.PI * 0.1;
      tip.position.set(Math.cos(a) * 0.085, Math.sin(a) * 0.085 - 0.05, 0);
      g.add(tip);
    }
  } else if (kind === 1) {
    g.add(new Mesh(new SphereGeometry(0.055, 14, 12), flat(0xe63946)));
    const stem = new Mesh(new CylinderGeometry(0.004, 0.004, 0.03, 5), flat(0x5a3a1a));
    stem.position.y = 0.06;
    g.add(stem);
    const leaf = new Mesh(new SphereGeometry(0.017, 6, 5), flat(0x38b000));
    leaf.scale.set(1.6, 0.4, 1);
    leaf.position.set(0.016, 0.066, 0);
    g.add(leaf);
  } else if (kind === 2) {
    g.add(new Mesh(new SphereGeometry(0.055, 14, 12), flat(0xff8c00)));
    const nub = new Mesh(new SphereGeometry(0.01, 6, 5), flat(0x2d6a1f));
    nub.position.y = 0.054;
    g.add(nub);
  } else if (kind === 3) {
    const body = new Mesh(new SphereGeometry(0.075, 16, 12), flat(0x2e9e4a));
    body.scale.set(1.35, 1, 1);
    g.add(body);
    for (const x of [-0.06, -0.02, 0.02, 0.06]) {
      const stripe = new Mesh(new TorusGeometry(0.075 * Math.sqrt(1 - (x / 0.101) ** 2), 0.005, 5, 18), flat(0x145a28));
      stripe.rotation.y = Math.PI / 2;
      stripe.position.x = x;
      g.add(stripe);
    }
  } else {
    const body = new Mesh(new SphereGeometry(0.055, 12, 10), flat(0xf2b01e));
    body.scale.set(1, 1.35, 1);
    g.add(body);
    for (let k = 0; k < 4; k++) {
      const leaf = new Mesh(new ConeGeometry(0.014, 0.07, 5), flat(0x2f9e44));
      leaf.position.set(Math.cos(k * 1.57) * 0.012, 0.1, Math.sin(k * 1.57) * 0.012);
      leaf.rotation.z = Math.cos(k * 1.57) * 0.3;
      leaf.rotation.x = Math.sin(k * 1.57) * 0.3;
      g.add(leaf);
    }
  }
  return g;
}

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

/**
 * Fruit throw: press the bowl for a random fruit, then press a THROW bubble over one of the two
 * far corners. The fruit flies there, lands with a BONK, and the teacher walks over to stare at
 * it for a few seconds, which is a window to cheat in. Only works while she is calmly patrolling.
 */
export class FruitSystem extends createSystem({
  pressed: { required: [FruitButton, Pressed] },
}) {
  model = new FruitModel({ stock: ACTIVE_TUNING.fruitPerRound, flightSeconds: FLIGHT_SECONDS, kinds: KINDS }, Math.random);

  private exam!: ExamSystem;
  private teacher!: TeacherSystem;
  private hand: Group[] = [];
  private landed: Group[][] = [];
  private landedAge: number[][] = [];
  private landedUsed: number[] = [];
  private bowlLabelG!: CanvasRenderingContext2D;
  private bowlLabelTex!: CanvasTexture;
  private zoneRings: Mesh[] = [];
  private zoneBubbles: Mesh[] = [];
  private popMesh!: Mesh;
  private popG!: CanvasRenderingContext2D;
  private popTex!: CanvasTexture;
  private popAge = 99;
  private clock = 0;
  private wasPlaying = false;
  private shownStock = -1;
  private lastKind = 0;

  init(): void {
    const classroom = this.world.getSystem(ClassroomSystem);
    const exam = this.world.getSystem(ExamSystem);
    const teacher = this.world.getSystem(TeacherSystem);
    if (!classroom || !exam || !teacher) throw new Error('Classroom, Exam and Teacher systems must be registered before FruitSystem');
    this.exam = exam;
    this.teacher = teacher;
    const room = classroom.roomEntity;

    // the bowl (this mesh is the thing you press)
    const bowl = new Mesh(
      new SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new MeshStandardMaterial({ color: 0xb5651d, roughness: 0.9, side: 2 }),
    );
    bowl.position.set(BOWL.x, BOWL.y + 0.06, BOWL.z);
    bowl.scale.setScalar(0.8);
    const bowlEntity = this.world.createTransformEntity(bowl, room);
    bowlEntity.addComponent(FruitButton, { kind: 0 });
    bowlEntity.addComponent(RayInteractable);
    bowlEntity.addComponent(PokeInteractable);
    // a few decorative fruit peeking out of the bowl
    for (let k = 0; k < 3; k++) {
      const f = makeFruit([1, 2, 0][k]);
      f.scale.setScalar(0.6);
      f.position.set((k - 1) * 0.05, -0.02, (k % 2) * 0.03);
      bowl.add(f);
    }
    // little label above the bowl: how many fruit are left
    const lab = canvasTex(320, 120);
    this.bowlLabelG = lab.g;
    this.bowlLabelTex = lab.tex;
    const label = new Mesh(new PlaneGeometry(0.16, 0.06), new MeshBasicMaterial({ map: lab.tex, transparent: true }));
    label.position.set(BOWL.x, BOWL.y + 0.13, BOWL.z + 0.1);
    label.rotation.y = Math.atan2(-BOWL.x, 0.2 - BOWL.z);
    this.world.createTransformEntity(label, room);

    // the fruit in hand (one per kind; only the picked one shows) and the resting ones on the floor
    for (let k = 0; k < KINDS; k++) {
      const h = makeFruit(k);
      h.scale.setScalar(1.0);
      h.visible = false;
      this.hand.push(h);
      this.world.createTransformEntity(h, room);
      const row: Group[] = [];
      for (let s = 0; s < LANDED_SLOTS; s++) {
        const l = makeFruit(k);
        l.scale.setScalar(1.6);
        l.visible = false;
        row.push(l);
        this.world.createTransformEntity(l, room);
      }
      this.landed.push(row);
      this.landedAge.push(row.map(() => 99));
      this.landedUsed.push(0);
    }

    // throw zones: a glowing ring on the floor and a THROW bubble above it
    for (let z = 0; z < 2; z++) {
      const ring = new Mesh(
        new RingGeometry(0.38, 0.55, 32),
        new MeshBasicMaterial({ color: 0xff9f1c, transparent: true, opacity: 0.8, depthWrite: false, side: 2 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(ZONE_X[z], 0.03, ZONE_Z);
      ring.visible = false;
      this.zoneRings.push(ring);
      this.world.createTransformEntity(ring, room);

      const b = canvasTex(360, 216);
      b.g.fillStyle = '#ff9f1c';
      b.g.strokeStyle = '#ffffff';
      b.g.lineWidth = 10;
      b.g.beginPath();
      b.g.roundRect(8, 8, 344, 160, 50);
      b.g.fill();
      b.g.stroke();
      b.g.beginPath();
      b.g.moveTo(150, 166);
      b.g.lineTo(180, 210);
      b.g.lineTo(210, 166);
      b.g.closePath();
      b.g.fill();
      b.g.fillStyle = '#222';
      b.g.textAlign = 'center';
      b.g.textBaseline = 'middle';
      b.g.font = `bold 84px ${FONT}`;
      b.g.fillText('THROW!', 180, 92);
      b.tex.needsUpdate = true;
      const bubble = new Mesh(new PlaneGeometry(0.75, 0.45), new MeshBasicMaterial({ map: b.tex, transparent: true }));
      bubble.position.set(ZONE_X[z], 1.75, ZONE_Z);
      bubble.rotation.y = Math.atan2(-ZONE_X[z], 0.2 - ZONE_Z);
      bubble.renderOrder = 4;
      bubble.visible = false;
      this.zoneBubbles.push(bubble);
      const be = this.world.createTransformEntity(bubble, room);
      be.addComponent(FruitButton, { kind: 1 + z });
      be.addComponent(RayInteractable);
      be.addComponent(PokeInteractable);
    }

    // comic text popup ("BONK!") that pops where a fruit lands
    const pop = canvasTex(384, 160);
    this.popG = pop.g;
    this.popTex = pop.tex;
    this.popMesh = new Mesh(new PlaneGeometry(0.9, 0.375), new MeshBasicMaterial({ map: pop.tex, transparent: true, depthWrite: false }));
    this.popMesh.renderOrder = 6;
    this.popMesh.visible = false;
    this.world.createTransformEntity(this.popMesh, room);

    this.paintLabel();

    this.queries.pressed.subscribe('qualify', (e: Entity) => {
      if (this.exam.exam.phase !== 'playing') return;
      const kind = e.getValue(FruitButton, 'kind') as number;
      if (kind === 0) this.model.pick();
      else this.model.throwTo((kind - 1) as 0 | 1);
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
      this.clearAll();
      this.wasPlaying = true;
    }
    this.model.update(dt);
    const landed = this.model.takeLanded();
    if (landed) this.onLanded(landed.zone, landed.kind);

    // fruit in hand / in the air
    const m = this.model;
    for (let k = 0; k < KINDS; k++) this.hand[k].visible = false;
    if (m.state === 'carrying') {
      const h = this.hand[m.kind];
      h.visible = true;
      h.position.set(HAND.x, HAND.y + Math.sin(this.clock * 3) * 0.015, HAND.z);
      h.rotation.y = this.clock * 1.5;
      h.rotation.z = 0.25;
    } else if (m.state === 'flying') {
      const t = m.progress;
      const h = this.hand[m.kind];
      h.visible = true;
      const ex1 = ZONE_X[m.zone];
      h.position.set(HAND.x + (ex1 - HAND.x) * t, HAND.y + (0.12 - HAND.y) * t + 1.3 * 4 * t * (1 - t), HAND.z + (ZONE_Z - HAND.z) * t);
      h.rotation.x = t * 14;
      h.rotation.z = t * 9;
    }
    const carrying = m.state === 'carrying';
    for (let z = 0; z < 2; z++) {
      this.zoneBubbles[z].visible = carrying;
      this.zoneRings[z].visible = carrying;
      if (carrying) {
        const s = 1 + Math.sin(this.clock * 5) * 0.06;
        this.zoneBubbles[z].scale.setScalar(s);
        this.zoneRings[z].scale.setScalar(1 + Math.sin(this.clock * 5 + 1) * 0.08);
      }
    }
    if (m.stock !== this.shownStock) {
      this.shownStock = m.stock;
      this.paintLabel();
    }
    this.animateLanded(dt);
    this.animatePop(dt);
  }

  private onLanded(zone: number, kind: number): void {
    const x = ZONE_X[zone] + (Math.random() - 0.5) * 0.3;
    const z = ZONE_Z + (Math.random() - 0.5) * 0.3;
    const slot = this.landedUsed[kind] % LANDED_SLOTS;
    this.landedUsed[kind] += 1;
    const g = this.landed[kind][slot];
    g.visible = true;
    g.position.set(x, 0.3, z);
    g.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3);
    this.landedAge[kind][slot] = 0;
    this.lastKind = kind;
    // dust + comic text
    this.teacher.puffs.burst(x, z, 7, 0.16, 0.7);
    this.showPop(BONKS[Math.floor(Math.random() * BONKS.length)], x, 0.75, z, zone);
    // she goes to see what the noise was (only if she is calmly patrolling)
    if (this.exam.exam.phase === 'playing') {
      this.teacher.ai.distract(STAND_X[zone], STAND_Z, ZONE_X[zone], ZONE_Z);
    }
  }

  private animateLanded(dt: number): void {
    for (let k = 0; k < KINDS; k++) {
      for (let s = 0; s < LANDED_SLOTS; s++) {
        const g = this.landed[k][s];
        if (!g.visible) continue;
        this.landedAge[k][s] += dt;
        const a = this.landedAge[k][s];
        // two decaying bounces, then rest on the floor
        const y = a < 1.2 ? 0.05 + 0.35 * Math.exp(-3.2 * a) * Math.abs(Math.cos(a * 9)) : 0.05;
        g.position.y = y;
        if (a < 1.2) g.rotation.x += dt * 5 * Math.exp(-2 * a);
      }
    }
  }

  private showPop(text: string, x: number, y: number, z: number, zone: number): void {
    const g = this.popG;
    g.clearRect(0, 0, 384, 160);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 100px ${FONT}`;
    g.lineWidth = 16;
    g.strokeStyle = '#ffffff';
    g.strokeText(text, 192, 84);
    g.fillStyle = '#d6335a';
    g.fillText(text, 192, 84);
    this.popTex.needsUpdate = true;
    this.popMesh.position.set(x, y, z);
    this.popMesh.rotation.y = Math.atan2(-ZONE_X[zone], 0.2 - ZONE_Z);
    this.popMesh.visible = true;
    this.popAge = 0;
  }

  private animatePop(dt: number): void {
    if (!this.popMesh.visible) return;
    this.popAge += dt;
    const a = this.popAge;
    if (a > 1.1) {
      this.popMesh.visible = false;
      return;
    }
    // quick overshoot pop-in, hang, then float up and shrink away
    const grow = a < 0.2 ? 1.25 * Math.sin((a / 0.2) * (Math.PI / 2)) : a < 0.35 ? 1.25 - 0.25 * ((a - 0.2) / 0.15) : 1;
    const fade = a > 0.8 ? 1 - (a - 0.8) / 0.3 : 1;
    this.popMesh.scale.setScalar(Math.max(0.01, grow * fade));
    this.popMesh.position.y += dt * 0.25;
  }

  private paintLabel(): void {
    const g = this.bowlLabelG;
    g.clearRect(0, 0, 320, 120);
    g.fillStyle = this.model.stock > 0 ? '#2e9e4a' : '#6b6b7a';
    g.beginPath();
    g.roundRect(4, 4, 312, 112, 30);
    g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 56px ${FONT}`;
    g.fillText(this.model.stock > 0 ? `FRUIT x${this.model.stock}` : 'NO FRUIT', 160, 64);
    this.bowlLabelTex.needsUpdate = true;
  }

  private clearAll(): void {
    this.model.reset();
    this.shownStock = -1;
    this.popMesh.visible = false;
    for (let k = 0; k < KINDS; k++) {
      this.hand[k].visible = false;
      for (let s = 0; s < LANDED_SLOTS; s++) this.landed[k][s].visible = false;
    }
    for (let z = 0; z < 2; z++) {
      this.zoneBubbles[z].visible = false;
      this.zoneRings[z].visible = false;
    }
    this.paintLabel();
    this.shownStock = this.model.stock;
  }
}
