import { assistFactor } from './settings.js';
import {
  CanvasTexture,
  CylinderGeometry,
  Entity,
  GrabSystem,
  Grabbed,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  DistanceGrabbable,
  MovementMode,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  createSystem,
} from '@iwsdk/core';
import { BoxGeometry } from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { FruitButton, FruitGrab } from './exam-components.js';
import { FruitModel } from './fruit.js';
import { sfx } from './sfx.js';
import { roundStats } from './progress.js';
import { Projectile, ROOM_BOUNDS, VelocityTracker, assistVelocity, classifyLanding, standPoint, type Bounds, type Vec3 } from './throw.js';
import { SEATING } from './seating.js';
import { TeacherSystem } from './teacher-system.js';
import { ACTIVE_TUNING, onTuningChange } from './tuning.js';

/** the old THROW-bubble backup, only with ?bubbles in the URL (normal play: grab it and flick it) */
const SHOW_BUBBLES = new URLSearchParams(window.location.search).has('bubbles');
const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
const KINDS = 3; // banana, apple, sandwich
const KID_RADIUS = 0.32; // a fruit this close to a seated classmate bonks them
const KID_WORDS = ['HEY!', 'OOF!', 'RUDE!', 'MY HAIR!'];
const BONKS = ['BONK!', 'SPLAT!', 'THUD!', 'PLOP!', 'BOING!'];
const FLIGHT_SECONDS = 0.9; // only used by the THROW-bubble backup (a fixed lob)
// lunchbox on the desk, the spot a picked fruit hovers at, and the two throw zones on the floor
const BOWL = { x: 0.46, y: 0.785, z: -0.5 }; // lunchbox spot
const HAND = { x: 0.4, y: 1.2, z: -0.58 }; // the fruit floats here, in easy reach, waiting to be grabbed
const ZONE_X = [-3.1, 3.1];
const ZONE_Z = -3.4;
const MIN_THROW_SPEED = 0.8; // slower than this on release = you just let go, the fruit floats back
const MIN_LAUNCH_SPEED = 3.2; // a real flick is boosted to at least this, so a mouse flick still reaches the front
const HIT_RADIUS = 0.45; // a fruit passing this close to the teacher (and below her head) hits her
const HIT_HEIGHT = 1.75;
// the throw zones are fixed spots on the room floor; in your own coordinates they move with your seat
const AIM_TARGETS: Array<[number, number]> = [
  [ZONE_X[0], ZONE_Z],
  [ZONE_X[1], ZONE_Z],
];
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
  } else {
    // sandwich: bread, lettuce, cheese, tomato, bread
    const layer = (w: number, h: number, d: number, y: number, hex: number) => {
      const m = new Mesh(new BoxGeometry(w, h, d), flat(hex));
      m.position.y = y;
      g.add(m);
    };
    layer(0.11, 0.022, 0.11, -0.035, 0xe9c46a); // bottom bread
    layer(0.122, 0.008, 0.122, -0.02, 0x57cc99); // lettuce (a bit wider, so it frills out)
    layer(0.112, 0.01, 0.112, -0.012, 0xffd60a); // cheese
    layer(0.1, 0.012, 0.1, -0.002, 0xe63946); // tomato
    layer(0.11, 0.024, 0.11, 0.016, 0xe9c46a); // top bread
    layer(0.112, 0.004, 0.112, 0.03, 0xc98b3a); // golden crust on top
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
  held: { required: [FruitGrab, Grabbed] },
}) {
  model = new FruitModel({ stock: ACTIVE_TUNING.fruitPerRound, flightSeconds: FLIGHT_SECONDS, kinds: KINDS }, Math.random);

  private exam!: ExamSystem;
  private teacher!: TeacherSystem;
  private hand: Group[] = [];
  private grabEntities: Entity[] = [];
  /** the room's walls in your own coordinates (they move with your seat) */
  private bounds: Bounds = { ...ROOM_BOUNDS };
  private proj = new Projectile(this.bounds);
  private seenSeating = -1;
  /** read by the living classroom: the fruit in the air, and counters that change when one lands / hits her */
  get projectile(): Projectile {
    return this.proj;
  }
  landSeq = 0;
  hitSeq = 0;
  /** bumps whenever a fruit bonks a classmate (a joke: no warning); kidHitIdx says which one */
  kidHitSeq = 0;
  kidHitIdx = -1;
  private kids: Group[] = [];
  landX = 0;
  landZ = 0;
  private tracker = new VelocityTracker();
  private flyKind = -1;
  private readonly vel: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly vel2: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly pos: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly stand: [number, number] = [0, 0];
  private landed: Group[][] = [];
  private landedAge: number[][] = [];
  private landedUsed: number[] = [];
  private lunchbox!: Mesh;
  private lid!: Group;
  private boxWiggle = 0;
  private snacks: Group[] = [];
  private lidA = 0; // 0 closed .. 1 open
  private rise = 1; // 0..1: the picked fruit pops out of the box and floats to the waiting spot
  private needGrab = false;
  private hint!: Mesh;
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
    onTuningChange(() => {
      this.model.rules.stock = ACTIVE_TUNING.fruitPerRound;
    });
    const classroom = this.world.getSystem(ClassroomSystem);
    const exam = this.world.getSystem(ExamSystem);
    const teacher = this.world.getSystem(TeacherSystem);
    if (!classroom || !exam || !teacher) throw new Error('Classroom, Exam and Teacher systems must be registered before FruitSystem');
    this.exam = exam;
    this.teacher = teacher;
    const room = classroom.seatEntity;
    this.kids = classroom.kids;

    // the lunchbox (the body is the thing you press): teal box, white stripe, hinged lid propped open, handle, snacks peeking out
    const body = new Mesh(new BoxGeometry(0.24, 0.1, 0.15), flat(0x2ec4b6));
    body.position.set(BOWL.x, BOWL.y + 0.05, BOWL.z);
    this.lunchbox = body;
    const boxEntity = this.world.createTransformEntity(body, room);
    boxEntity.addComponent(FruitButton, { kind: 0 });
    boxEntity.addComponent(RayInteractable);
    const stripe = new Mesh(new BoxGeometry(0.245, 0.02, 0.152), flat(0xffffff));
    stripe.position.y = 0.0;
    body.add(stripe);
    const clasp = new Mesh(new BoxGeometry(0.04, 0.03, 0.01), flat(0xffd23f));
    clasp.position.set(0, 0.03, 0.078);
    body.add(clasp);
    const hinge = new Group(); // lid pivots at the back edge
    hinge.position.set(0, 0.05, -0.075);
    hinge.rotation.x = 0; // closed; opens when you tap the box
    const lid = new Mesh(new BoxGeometry(0.24, 0.025, 0.15), flat(0x2ec4b6));
    lid.position.z = 0.075;
    lid.position.y = 0.0125;
    hinge.add(lid);
    const handle = new Mesh(new TorusGeometry(0.03, 0.006, 6, 12, Math.PI), flat(0xffffff));
    handle.position.set(0, 0.03, 0.075);
    hinge.add(handle);
    // a smiley on the lid, because it is a kid's lunchbox
    const face = new Mesh(new CylinderGeometry(0.028, 0.028, 0.004, 14), flat(0xffd23f));
    face.position.set(0.06, 0.027, 0.075);
    hinge.add(face);
    this.lid = hinge;
    body.add(hinge);
    // a few snacks inside, only visible while the lid is open
    for (let k = 0; k < 3; k++) {
      const f = makeFruit([1, 2, 0][k]);
      f.scale.setScalar(0.6);
      f.position.set((k - 1) * 0.06, 0.07, (k % 2) * 0.02);
      body.add(f);
      this.snacks.push(f);
    }
    // little label above the bowl: how many fruit are left
    const lab = canvasTex(320, 120);
    this.bowlLabelG = lab.g;
    this.bowlLabelTex = lab.tex;
    const label = new Mesh(new PlaneGeometry(0.16, 0.06), new MeshBasicMaterial({ map: lab.tex, transparent: true, depthWrite: false }));
    label.position.set(BOWL.x, BOWL.y + 0.16, BOWL.z + 0.12);
    label.rotation.y = Math.atan2(-BOWL.x, 0.2 - BOWL.z);
    this.world.createTransformEntity(label, room);

    // the fruit in hand (one per kind; only the picked one shows) and the resting ones on the floor
    for (let k = 0; k < KINDS; k++) {
      const h = makeFruit(k);
      h.scale.setScalar(1.15);
      h.visible = false;
      // invisible bigger ball so the fruit is easy to pinch
      const hit = new Mesh(new SphereGeometry(0.1, 8, 6), new MeshBasicMaterial({ visible: false }));
      h.add(hit);
      this.hand.push(h);
      const ge = this.world.createTransformEntity(h, room);
      ge.addComponent(FruitGrab, { kind: k });
      this.grabEntities.push(ge);
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
      const bubble = new Mesh(new PlaneGeometry(0.75, 0.45), new MeshBasicMaterial({ map: b.tex, transparent: true, depthWrite: false }));
      bubble.position.set(ZONE_X[z], 1.75, ZONE_Z);
      bubble.rotation.y = Math.atan2(-ZONE_X[z], 0.2 - ZONE_Z);
      bubble.renderOrder = 4;
      bubble.visible = false;
      this.zoneBubbles.push(bubble);
      const be = this.world.createTransformEntity(bubble, room);
      be.addComponent(FruitButton, { kind: 1 + z });
      be.addComponent(RayInteractable);
    }

    // little prompt that floats by the waiting fruit: tells you what to do (also doubles as onboarding)
    const hn = canvasTex(512, 160);
    hn.g.fillStyle = '#ff9f1c';
    hn.g.strokeStyle = '#ffffff';
    hn.g.lineWidth = 10;
    hn.g.beginPath();
    hn.g.roundRect(8, 8, 496, 144, 50);
    hn.g.fill();
    hn.g.stroke();
    hn.g.fillStyle = '#222';
    hn.g.textAlign = 'center';
    hn.g.textBaseline = 'middle';
    hn.g.font = `bold 64px ${FONT}`;
    hn.g.fillText('GRAB + FLICK!', 256, 84);
    hn.tex.needsUpdate = true;
    this.hint = new Mesh(new PlaneGeometry(0.3, 0.094), new MeshBasicMaterial({ map: hn.tex, transparent: true, depthWrite: false }));
    this.hint.position.set(HAND.x, HAND.y + 0.16, HAND.z);
    this.hint.rotation.y = Math.atan2(-HAND.x, 0.2 - HAND.z);
    this.hint.renderOrder = 5;
    this.hint.visible = false;
    this.world.createTransformEntity(this.hint, room);

    // comic text popup ("BONK!") that pops where a fruit lands
    const pop = canvasTex(384, 160);
    this.popG = pop.g;
    this.popTex = pop.tex;
    this.popMesh = new Mesh(new PlaneGeometry(0.9, 0.375), new MeshBasicMaterial({ map: pop.tex, transparent: true, depthWrite: false }));
    this.popMesh.renderOrder = 6;
    this.popMesh.visible = false;
    this.world.createTransformEntity(this.popMesh, room);

    this.paintLabel();
    this.setLid();

    this.queries.pressed.subscribe('qualify', (e: Entity) => {
      if (this.exam.exam.phase !== 'playing') return;
      const kind = e.getValue(FruitButton, 'kind') as number;
      if (kind === 0) this.pickOrPut();
      else this.throwAtZone(kind - 1);
    });
    // letting go of a grabbed fruit throws it
    this.queries.held.subscribe('disqualify', (e: Entity) => this.onRelease(e.getValue(FruitGrab, 'kind') as number));
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.1);
    this.clock += dt;
    if (this.seenSeating !== SEATING.seq) this.syncSeating();
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
    const m = this.model;
    for (let k = 0; k < KINDS; k++) if (k !== this.flyKind && !(m.state === 'carrying' && k === m.kind)) this.hand[k].visible = false;

    if (m.state === 'carrying') {
      const h = this.hand[m.kind];
      const e = this.grabEntities[m.kind];
      h.visible = true;
      if (e.hasComponent(Grabbed)) {
        // the SDK moves it with the hand; we only watch how fast the hand moves
        this.tracker.push(this.clock, h.position.x, h.position.y, h.position.z);
      } else if (this.rise < 1) {
        // pop out of the box in an arc
        this.rise = Math.min(1, this.rise + dt / 0.5);
        const t = this.rise < 0.25 ? 0 : (this.rise - 0.25) / 0.75;
        const e = 1 - (1 - t) * (1 - t);
        h.position.set(
          BOWL.x + (HAND.x - BOWL.x) * e,
          BOWL.y + 0.1 + (HAND.y - BOWL.y - 0.1) * e + Math.sin(t * Math.PI) * 0.12,
          BOWL.z + (HAND.z - BOWL.z) * e,
        );
        h.scale.setScalar(0.5 + 0.65 * e);
        h.rotation.y = this.clock * 6;
        if (this.rise >= 1 && this.needGrab) {
          this.needGrab = false;
          this.grabEntities[m.kind].addComponent(DistanceGrabbable, {
            rotate: false,
            scale: false,
            movementMode: MovementMode.MoveTowardsTarget,
            targetPositionOffset: [0, 0, -0.45],
            moveSpeedFactor: 1,
          });
        }
      } else {
        h.position.set(HAND.x, HAND.y + Math.sin(this.clock * 3) * 0.015, HAND.z);
        h.rotation.y = this.clock * 1.5;
        h.rotation.z = 0.25;
      }
    }

    if (this.proj.active) {
      const h = this.hand[this.flyKind];
      const hitDone = this.stepFlight(dt);
      h.visible = true;
      h.position.set(this.proj.x, this.proj.y, this.proj.z);
      h.rotation.x += dt * 14;
      h.rotation.z += dt * 9;
      if (hitDone) this.flyKind = -1;
    }
    const carrying = SHOW_BUBBLES && m.state === 'carrying' && !this.grabEntities[m.kind].hasComponent(Grabbed);
    for (let z = 0; z < 2; z++) {
      this.zoneBubbles[z].visible = carrying;
      this.zoneRings[z].visible = carrying;
      if (carrying) {
        const s = 1 + Math.sin(this.clock * 5) * 0.06;
        this.zoneBubbles[z].scale.setScalar(s);
        this.zoneRings[z].scale.setScalar(1 + Math.sin(this.clock * 5 + 1) * 0.08);
      }
    }
    this.hint.visible = m.state === 'carrying' && this.rise >= 1 && !this.grabEntities[m.kind].hasComponent(Grabbed) && !this.proj.active;
    if (this.hint.visible) this.hint.scale.setScalar(1 + Math.sin(this.clock * 6) * 0.05);
    if (this.boxWiggle > 0) {
      this.boxWiggle = Math.max(0, this.boxWiggle - dt * 2.5);
      this.lunchbox.rotation.z = Math.sin(this.clock * 35) * 0.08 * this.boxWiggle;
    }
    // the lid is open while a fruit is out of the box, and snaps shut after the throw / when you put it back
    this.lidA += ((m.state === 'carrying' ? 1 : 0) - this.lidA) * Math.min(1, dt * 12);
    this.setLid();
    if (m.stock !== this.shownStock) {
      this.shownStock = m.stock;
      this.paintLabel();
    }
    this.animateLanded(dt);
    this.animatePop(dt);
  }

  private pickOrPut(): void {
    if (this.proj.active) return; // one fruit in the air at a time
    const m = this.model;
    const wasCarrying = m.state === 'carrying';
    const oldKind = m.kind;
    if (!m.pick()) {
      this.boxWiggle = 1; // empty: the box just wiggles shut
      return;
    }
    this.boxWiggle = 0.6;
    if (wasCarrying) {
      this.needGrab = false;
      this.makeUngrabbable(oldKind);
      this.hand[oldKind].visible = false;
    } else {
      const h = this.hand[m.kind];
      h.position.set(BOWL.x, BOWL.y + 0.1, BOWL.z);
      h.scale.setScalar(0.5);
      h.visible = true;
      this.rise = 0; // it pops out of the opening box, then becomes grabbable (see update)
      this.needGrab = true;
      this.tracker.clear();
    }
  }

  private setLid(): void {
    this.lid.rotation.x = -1.8 * this.lidA;
    const open = this.lidA > 0.35;
    for (const f of this.snacks) f.visible = open;
  }

  private makeUngrabbable(kind: number): void {
    const e = this.grabEntities[kind];
    if (e.hasComponent(Grabbed)) this.world.getSystem(GrabSystem)?.forceRelease(e);
    if (e.hasComponent(DistanceGrabbable)) e.removeComponent(DistanceGrabbable);
  }

  /** hand let go of a grabbed fruit */
  private onRelease(kind: number): void {
    const m = this.model;
    if (this.exam.exam.phase !== 'playing' || m.state !== 'carrying' || m.kind !== kind) return;
    const h = this.hand[kind];
    const speed = this.tracker.velocity(this.vel);
    if (speed < MIN_THROW_SPEED) {
      // just let go: it floats back to the waiting spot
      h.position.set(HAND.x, HAND.y, HAND.z);
      h.scale.setScalar(1.15);
      this.tracker.clear();
      return;
    }
    this.pos.x = h.position.x;
    this.pos.y = h.position.y;
    this.pos.z = h.position.z;
    // a flick is boosted to a usable speed (a mouse flick is slower than an arm), then bent toward the front corners
    if (speed < MIN_LAUNCH_SPEED) {
      const k = MIN_LAUNCH_SPEED / speed;
      this.vel.x *= k;
      this.vel.y *= k;
      this.vel.z *= k;
    }
    assistVelocity(this.pos, this.vel, AIM_TARGETS, Math.min(1, ACTIVE_TUNING.aimAssist * assistFactor()), this.vel2);
    this.launch(kind, this.pos, this.vel2);
  }

  /** THROW-bubble backup (laptop): a fixed lob to the chosen corner */
  private throwAtZone(zone: number): void {
    const m = this.model;
    if (m.state !== 'carrying') return;
    const h = this.hand[m.kind];
    this.pos.x = h.position.x;
    this.pos.y = h.position.y;
    this.pos.z = h.position.z;
    const T = FLIGHT_SECONDS;
    this.vel.x = (AIM_TARGETS[zone][0] - this.pos.x) / T;
    this.vel.z = (AIM_TARGETS[zone][1] - this.pos.z) / T;
    this.vel.y = (0.05 - this.pos.y + 0.5 * 9.8 * T * T) / T;
    this.launch(m.kind, this.pos, this.vel);
  }

  private launch(kind: number, p: Vec3, v: Vec3): void {
    this.makeUngrabbable(kind);
    this.model.spend();
    roundStats.fruitThrown += 1;
    this.flyKind = kind;
    this.proj.launch(p, v);
    sfx.whoosh();
    this.tracker.clear();
  }

  /** advances the thrown fruit; returns true when its flight is over */
  private stepFlight(dt: number): boolean {
    const p = this.proj;
    const touched = p.step(dt);
    let hit = false;
    for (const t of this.teacher.ais) {
      const tdx = p.x + SEATING.dx - t.x;
      const tdz = p.z + SEATING.dz - t.z;
      if (tdx * tdx + tdz * tdz < HIT_RADIUS * HIT_RADIUS) hit = true;
    }
    if (p.y < HIT_HEIGHT && hit && this.exam.exam.phase === 'playing') {
      p.active = false;
      roundStats.fruitHitTeacher += 1;
      this.exam.exam.addWarning();
      this.onLanded(p.x, p.z, this.flyKind, true);
      return true;
    }
    // a classmate in the way: it is a joke, no warning (they yelp, everybody giggles)
    if (p.y > 0.4 && p.y < 1.4 && this.exam.exam.phase === 'playing') {
      for (let i = 0; i < this.kids.length; i++) {
        const k = this.kids[i];
        const dx = p.x + SEATING.dx - k.position.x;
        const dz = p.z + SEATING.dz - k.position.z;
        if (dx * dx + dz * dz < KID_RADIUS * KID_RADIUS) {
          p.active = false;
          this.kidHitIdx = i;
          this.kidHitSeq += 1;
          this.onLanded(p.x, p.z, this.flyKind, false, true);
          return true;
        }
      }
    }
    if (touched) {
      this.onLanded(p.x, p.z, this.flyKind, false);
      return true;
    }
    return false;
  }

  private onLanded(lx: number, lz: number, kind: number, hitTeacher: boolean, hitKid = false): void {
    const x = lx;
    const z = lz;
    this.landSeq += 1;
    this.landX = x;
    this.landZ = z;
    if (hitTeacher) this.hitSeq += 1;
    const slot = this.landedUsed[kind] % LANDED_SLOTS;
    this.landedUsed[kind] += 1;
    const g = this.landed[kind][slot];
    g.visible = true;
    g.position.set(x, 0.3, z);
    g.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3);
    this.landedAge[kind][slot] = 0;
    this.lastKind = kind;
    this.hand[kind].visible = false;
    const rx = x + SEATING.dx; // room coordinates (the teachers' world)
    const rz = z + SEATING.dz;
    this.teacher.puffs.burst(rx, rz, 7, 0.16, 0.7);
    const front = classifyLanding(rx, rz) === 'front';
    const word = hitKid ? KID_WORDS[Math.floor(Math.random() * KID_WORDS.length)] : hitTeacher ? 'OW!' : front ? BONKS[Math.floor(Math.random() * BONKS.length)] : 'MISS!';
    this.showPop(word, x, hitTeacher || hitKid ? 1.5 : 0.75, z);
    if (hitTeacher || hitKid) sfx.ow();
    else if (word === 'SPLAT!') sfx.splat();
    else sfx.bonk();
    // a fruit on the open front floor makes her go and look (only if she is calmly patrolling)
    if (front && !hitTeacher && !hitKid && this.exam.exam.phase === 'playing') {
      standPoint(rx, rz, this.stand);
      // the closest teacher who is calmly patrolling goes to look
      let best: (typeof this.teacher.ais)[number] | null = null;
      let bestD = 1e9;
      for (const t of this.teacher.ais) {
        if (t.mode !== 'patrol') continue;
        const d = (t.x - rx) ** 2 + (t.z - rz) ** 2;
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      best?.distract(this.stand[0], this.stand[1], rx, rz);
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

  private showPop(text: string, x: number, y: number, z: number): void {
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
    this.popMesh.rotation.y = Math.atan2(-x, 0.2 - z);
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

  /** you moved seats: the room's walls, the throw zones and the aim targets shift the other way */
  private syncSeating(): void {
    this.seenSeating = SEATING.seq;
    const b = this.bounds;
    b.xMin = ROOM_BOUNDS.xMin - SEATING.dx;
    b.xMax = ROOM_BOUNDS.xMax - SEATING.dx;
    b.zMin = ROOM_BOUNDS.zMin - SEATING.dz;
    b.zMax = ROOM_BOUNDS.zMax - SEATING.dz;
    for (let z = 0; z < this.zoneRings.length; z++) {
      const x = ZONE_X[z] - SEATING.dx;
      const zz = ZONE_Z - SEATING.dz;
      AIM_TARGETS[z][0] = x;
      AIM_TARGETS[z][1] = zz;
      this.zoneRings[z].position.set(x, 0.03, zz);
      this.zoneBubbles[z].position.set(x, 1.75, zz);
      this.zoneBubbles[z].rotation.y = Math.atan2(-x, 0.2 - zz);
    }
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
    const unlimited = this.model.stock >= 99;
    const txt = this.model.stock > 0 ? (unlimited ? 'SNACKS: UNLIMITED' : `SNACKS x${this.model.stock}`) : 'NO SNACKS';
    let px = 56;
    g.font = `bold ${px}px ${FONT}`;
    while (g.measureText(txt).width > 276 && px > 20) {
      px -= 2;
      g.font = `bold ${px}px ${FONT}`;
    }
    g.fillText(txt, 160, 64);
    this.bowlLabelTex.needsUpdate = true;
  }

  private clearAll(): void {
    for (let k = 0; k < KINDS; k++) this.makeUngrabbable(k);
    this.proj.active = false;
    this.flyKind = -1;
    this.tracker.clear();
    this.model.reset();
    this.shownStock = -1;
    this.lidA = 0;
    this.rise = 1;
    this.needGrab = false;
    this.setLid();
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
