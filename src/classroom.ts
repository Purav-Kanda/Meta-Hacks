import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Entity,
  Vector3,
  VisibilityState,
  createSystem,
} from '@iwsdk/core';
import { COL_X, COMFORT, HOME_COL, HOME_ROW, ROW_Z, SEATING, SIT_BEHIND } from './seating.js';

// ---------- tiny helpers (kept allocation-free at runtime, all built once in init) ----------

const flat = (hex: number, rough = 1): MeshStandardMaterial =>
  new MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 });

const slab = (
  w: number,
  h: number,
  d: number,
  mat: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
): Mesh => {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};

function paintTexture(
  w: number,
  h: number,
  paint: (g: CanvasRenderingContext2D, w: number, h: number) => void,
): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  paint(g, w, h);
  const tex = new CanvasTexture(cv);
  tex.anisotropy = 16; // three.js clamps to what the GPU supports; keeps tilted text crisp
  tex.colorSpace = SRGBColorSpace;
  return tex;
}


// Wooden plank floor: a 1 m x 1 m tile (8 boards, staggered joints) repeated over the room.
// Dark and warm on purpose so the yellow vision cone stands out against it.
function makeWoodFloorTexture(): CanvasTexture {
  const SIZE = 512;
  const BOARDS = 8;
  const palette = ['#9a6a3a', '#8a5c31', '#a2723f', '#7f5328', '#936235'];
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const tex = paintTexture(SIZE, SIZE, (g, w, h) => {
    const bh = h / BOARDS;
    for (let row = 0; row < BOARDS; row++) {
      const y = row * bh;
      const joint = Math.floor(rnd() * (w - 160)) + 80; // where this row's two boards meet
      const segments: Array<[number, number]> = [
        [0, joint],
        [joint, w],
      ];
      for (const [x0, x1] of segments) {
        g.fillStyle = palette[Math.floor(rnd() * palette.length)];
        g.fillRect(x0, y, x1 - x0, bh);
        // a few darker grain streaks
        g.fillStyle = 'rgba(60, 30, 10, 0.18)';
        for (let k = 0; k < 4; k++) {
          const gy = y + 6 + rnd() * (bh - 12);
          g.fillRect(x0 + rnd() * 30, gy, (x1 - x0) * (0.4 + rnd() * 0.6), 1.5);
        }
        // butt joint
        g.fillStyle = 'rgba(40, 20, 8, 0.85)';
        g.fillRect(x0, y, 2, bh);
      }
      // seam between rows
      g.fillStyle = 'rgba(40, 20, 8, 0.85)';
      g.fillRect(0, y, w, 2);
    }
  });
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.anisotropy = 16;
  return tex;
}

// ---------- palette: loud on purpose ----------
const COL = {
  floor: 0xffd23f,
  wall: 0x7fdbff,
  wallTrim: 0xff6bb5,
  ceiling: 0xfff4c2,
  board: 0x2f7d4f,
  boardFrame: 0x8a4b1f,
  deskTop: 0xff9f1c,
  deskLeg: 0x6a4cff,
  chair: 0xe63946,
};

// A cartoon kid: capsule body, ball head, giant googly eyes.
function makeKid(shirt: number, skin: number, hair: number): Group {
  const kid = new Group();
  const torso = new Mesh(new CapsuleGeometry(0.17, 0.3, 4, 10), flat(shirt));
  torso.position.y = 0.55;
  kid.add(torso);

  // the head parts live in their own group so a classmate can turn and nod their head without moving the body
  const headG = new Group();
  headG.position.y = 1.0;
  kid.add(headG);
  const head = new Mesh(new SphereGeometry(0.2, 16, 12), flat(skin));
  headG.add(head);

  const hairCap = new Mesh(
    new SphereGeometry(0.21, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    flat(hair),
  );
  hairCap.position.y = 0.03;
  headG.add(hairCap);

  const eyeWhite = flat(0xffffff, 0.3);
  const pupil = flat(0x111111, 0.3);
  const pupils: Mesh[] = [];
  for (const side of [-1, 1]) {
    const ball = new Mesh(new SphereGeometry(0.075, 12, 10), eyeWhite);
    ball.position.set(side * 0.085, 0.02, -0.16);
    headG.add(ball);
    const dot = new Mesh(new SphereGeometry(0.035, 10, 8), pupil);
    dot.position.set(side * 0.085, 0.02, -0.225);
    headG.add(dot);
    pupils.push(dot);
  }
  kid.userData.head = headG;
  kid.userData.pupils = pupils;
  return kid;
}

function makeDesk(): Group {
  const desk = new Group();
  const top = slab(1.0, 0.05, 0.6, flat(COL.deskTop), 0, 0.75, 0);
  desk.add(top);
  const legMat = flat(COL.deskLeg);
  for (const lx of [-0.45, 0.45]) {
    for (const lz of [-0.25, 0.25]) {
      const leg = new Mesh(new CylinderGeometry(0.025, 0.025, 0.75, 8), legMat);
      leg.position.set(lx, 0.375, lz);
      desk.add(leg);
    }
  }
  return desk;
}

// A proper teacher's desk: wide top with overhang, two drawer pedestals, a front panel. Top surface is y=0.8.
function makeTeacherDesk(): Group {
  const d = new Group();
  const wood = flat(0x8a4b1f);
  const dark = flat(0x6b3a17);
  const brass = flat(0xd9b44a, 0.4);
  d.add(slab(1.7, 0.06, 0.85, wood, 0, 0.77, 0)); // top, surface at y=0.8
  for (const sx of [-1, 1]) {
    d.add(slab(0.5, 0.74, 0.75, dark, sx * 0.55, 0.37, 0)); // pedestal
    for (let i = 0; i < 3; i++) {
      const y = 0.15 + i * 0.22;
      d.add(slab(0.44, 0.19, 0.02, wood, sx * 0.55, y + 0.05, 0.385)); // drawer front
      d.add(slab(0.12, 0.02, 0.025, brass, sx * 0.55, y + 0.1, 0.405)); // handle
    }
  }
  d.add(slab(0.6, 0.5, 0.03, dark, 0, 0.5, -0.33)); // modesty panel at the back
  return d;
}

function makeChair(): Group {
  const chair = new Group();
  const m = flat(COL.chair);
  chair.add(slab(0.42, 0.05, 0.42, m, 0, 0.45, 0));
  chair.add(slab(0.42, 0.4, 0.05, m, 0, 0.7, 0.2));
  for (const lx of [-0.17, 0.17]) {
    for (const lz of [-0.17, 0.17]) {
      chair.add(slab(0.04, 0.45, 0.04, m, lx, 0.225, lz));
    }
  }
  return chair;
}

// Seated eye height the room is built around (kids' heads sit near 1.0-1.2 m).
const SEATED_EYE_Y = 1.1;

export class ClassroomSystem extends createSystem({}) {
  roomEntity!: Entity;
  private roomRoot!: Group;
  private headPos!: Vector3;
  private calibrated = false;
  readonly kids: Group[] = [];
  /** floor, walls, board and wall decor; moved by setShell so your seat is really somewhere else in the room */
  shell!: Group;
  /** the two neighbors' exam papers (index 0 = left, 1 = right) */
  readonly neighborPapers: Mesh[] = [];
  /** classmate index sitting left / right of you (-1 = empty seat) */
  readonly adjacent: [number, number] = [-1, -1];
  /** everything that sits on or around your desk; the seat draw moves it */
  seatGroup!: Group;
  seatEntity!: Entity;
  private clock = 0;

  /** world height of the classroom floor (follows your head height calibration) */
  get floorY(): number {
    return this.roomRoot.position.y;
  }

  /** hide or show the whole classroom (the start screen floats in its own backdrop instead) */
  setHidden(hidden: boolean): void {
    this.roomRoot.visible = !hidden;
  }

  init(): void {
    this.headPos = new Vector3();
    const room = new Group();
    this.roomRoot = room;
    room.name = 'Classroom';

    // --- shell: 8m wide, 8m deep, 3m tall. Player sits near the back, facing -Z. ---
    // (floor, walls and board live in one group so the seat draw can slide the room around your desk)
    const shell = new Group();
    this.shell = shell;
    room.add(shell);
    const floor = new Mesh(
      new PlaneGeometry(8, 8),
      new MeshStandardMaterial({ map: makeWoodFloorTexture(), color: 0xc2b2a2, roughness: 0.85, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -2);
    shell.add(floor);

    const ceil = new Mesh(new PlaneGeometry(8, 8), flat(COL.ceiling));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 3, -2);
    shell.add(ceil);

    const wallMat = flat(COL.wall);
    const frontWall = new Mesh(new PlaneGeometry(8, 3), wallMat);
    frontWall.position.set(0, 1.5, -6);
    shell.add(frontWall);

    const backWall = new Mesh(new PlaneGeometry(8, 3), wallMat);
    backWall.position.set(0, 1.5, 2);
    backWall.rotation.y = Math.PI;
    shell.add(backWall);

    for (const sx of [-1, 1]) {
      const sideWall = new Mesh(new PlaneGeometry(8, 3), wallMat);
      sideWall.position.set(sx * 4, 1.5, -2);
      sideWall.rotation.y = -sx * (Math.PI / 2);
      shell.add(sideWall);
    }

    // pink trim stripe so the walls are not just one flat color
    const trimMat = flat(COL.wallTrim);
    shell.add(slab(8, 0.12, 0.02, trimMat, 0, 0.9, -5.99));
    for (const sx of [-1, 1]) {
      const stripe = slab(0.02, 0.12, 8, trimMat, sx * 3.99, 0.9, -2);
      shell.add(stripe);
    }

    // --- chalkboard on the front wall ---
    const boardTex = paintTexture(1024, 384, (g, w, h) => {
      g.fillStyle = '#2f7d4f';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.font = 'bold 120px "Comic Sans MS", "Chalkboard SE", sans-serif';
      g.textAlign = 'center';
      g.fillText('POP QUIZ!!', w / 2, 170);
      g.font = '56px "Comic Sans MS", "Chalkboard SE", sans-serif';
      g.fillText('eyes on your own paper :)', w / 2, 280);
    });
    const boardMat = new MeshStandardMaterial({ map: boardTex, roughness: 1 });
    const board = new Mesh(new PlaneGeometry(4.0, 1.5), boardMat);
    board.position.set(0, 1.7, -5.93);
    shell.add(board);
    shell.add(slab(4.2, 1.7, 0.04, flat(COL.boardFrame), 0, 1.7, -5.97));

    // --- the desks: two rows of three. Whoever sits at the drawn seat is you, and your desk stuff
    // (exam sheet, tray, phone...) lives in `seatGroup`, which the seat draw moves to your seat. ---
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const desk = makeDesk();
        desk.position.set(COL_X[c], 0, ROW_Z[r]);
        room.add(desk);
        const chair = makeChair();
        chair.position.set(COL_X[c], 0, ROW_Z[r] + 0.75);
        room.add(chair);
      }
    }
    const seatGroup = new Group();
    seatGroup.name = 'SeatGroup';
    this.seatGroup = seatGroup;
    room.add(seatGroup);

    // --- exam paper texture (the neighbors' papers use it too) ---
    const paperTex = paintTexture(512, 724, (g, w, h) => {
      g.fillStyle = '#fffdf2';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d6335a';
      g.font = 'bold 54px "Comic Sans MS", sans-serif';
      g.textAlign = 'center';
      g.fillText('FINAL EXAM', w / 2, 80);
      g.fillStyle = '#222';
      g.font = '30px "Comic Sans MS", sans-serif';
      g.textAlign = 'left';
      g.fillText('Name: ____________', 40, 140);
      for (let i = 0; i < 10; i++) {
        const y = 210 + i * 48;
        g.fillText(`${i + 1}.`, 40, y);
        g.fillRect(90, y - 10, 340, 3); // question placeholder line
      }
    });
    // pencil, because why not
    const pencil = new Mesh(
      new CylinderGeometry(0.006, 0.006, 0.18, 6),
      flat(0xfcd116),
    );
    pencil.rotation.z = Math.PI / 2;
    pencil.rotation.y = 0.5;
    pencil.position.set(-0.4, 0.785, -0.4);
    seatGroup.add(pencil);

    // the papers of whoever sits left / right of you (they ride with you; hidden when that seat is empty)
    for (const sx of [-1.3, 1.3]) {
      const theirPaper = new Mesh(
        new PlaneGeometry(0.3, 0.42),
        new MeshStandardMaterial({ map: paperTex, roughness: 0.9 }),
      );
      theirPaper.rotation.x = -Math.PI / 2 + 0.25;
      theirPaper.position.set(sx, 0.78, -0.45);
      seatGroup.add(theirPaper);
      this.neighborPapers.push(theirPaper);
    }

    // the five classmates (their seats come from the seating plan)
    const kidLooks: Array<[number, number, number]> = [
      [0xffb703, 0xf1c27d, 0x3a2a1a],
      [0x06d6a0, 0xc68642, 0x111111],
      [0xe63946, 0xf1c27d, 0xb5651d],
      [0x8338ec, 0xc68642, 0x222222],
      [0x3a86ff, 0xf1c27d, 0xffd166],
    ];
    for (const [shirt, skin, hair] of kidLooks) {
      const kid = makeKid(shirt, skin, hair);
      room.add(kid);
      this.kids.push(kid);
    }

    // teacher's desk at the front: a proper wooden desk with drawer pedestals
    const tDesk = makeTeacherDesk();
    tDesk.position.set(2.4, 0, -4.8);
    room.add(tDesk);

    this.roomEntity = this.world.createTransformEntity(room);
    this.seatEntity = this.world.createTransformEntity(this.seatGroup, this.roomEntity);
    SEATING.set(HOME_ROW, HOME_COL);
    this.applySeating();
  }

  /**
   * Put everyone where the seating plan says: the classmates move to their seats, your desk stuff moves to yours,
   * and the room is shifted the other way so you still sit at the world origin (the room frame is what the
   * teacher and the classmates live in).
   */
  applySeating(): void {
    const plan = SEATING.arrangement;
    plan.kids.forEach((slot, i) => {
      this.kids[i].position.x = COL_X[slot.col];
      this.kids[i].position.z = ROW_Z[slot.row] + SIT_BEHIND[slot.row];
    });
    this.adjacent[0] = plan.adjacent[0];
    this.adjacent[1] = plan.adjacent[1];
    this.neighborPapers[0].visible = plan.adjacent[0] >= 0;
    this.neighborPapers[1].visible = plan.adjacent[1] >= 0;
    this.seatGroup.position.set(SEATING.dx, 0, SEATING.dz);
    this.roomRoot.position.x = -SEATING.dx;
    this.roomRoot.position.z = -SEATING.dz;
  }

  // Headsets report real head height (an emulator stands at ~1.6 m, a seated
  // player is ~1.2 m). Shift the room once per XR session so the player's eyes
  // always land at SEATED_EYE_Y relative to the kids and desks.
  update(delta: number): void {
    // classmates fidget: a slow breathing bob and a little sway, each on its own rhythm
    this.clock += Math.min(delta, 0.1);
    for (let i = 0; i < this.kids.length; i++) {
      const kid = this.kids[i];
      const ph = i * 1.7;
      kid.position.y = Math.sin(this.clock * 1.8 + ph) * 0.006;
      kid.rotation.z = Math.sin(this.clock * 0.9 + ph) * 0.025;
      kid.rotation.y = Math.sin(this.clock * 0.55 + ph * 1.3) * 0.07;
    }
    const immersive =
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (!immersive) {
      this.calibrated = false;
      this.roomRoot.position.y = 0;
      return;
    }
    this.world.camera.getWorldPosition(this.headPos);
    if (this.headPos.y < 0.5) return; // tracking not ready yet
    const target = this.headPos.y - SEATED_EYE_Y;
    if (!this.calibrated) {
      this.roomRoot.position.y = target;
      this.calibrated = true;
      return;
    }
    // keep following your head height (sat down after starting, or put the headset on standing): quick in the
    // menus, very slow during an exam
    const rate = COMFORT.menu ? 1.5 : 0.12;
    this.roomRoot.position.y += (target - this.roomRoot.position.y) * Math.min(1, Math.min(delta, 0.1) * rate);
  }
}
