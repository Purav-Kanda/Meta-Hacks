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

  const head = new Mesh(new SphereGeometry(0.2, 16, 12), flat(skin));
  head.position.y = 1.0;
  kid.add(head);

  const hairCap = new Mesh(
    new SphereGeometry(0.21, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    flat(hair),
  );
  hairCap.position.y = 1.03;
  kid.add(hairCap);

  const eyeWhite = flat(0xffffff, 0.3);
  const pupil = flat(0x111111, 0.3);
  for (const side of [-1, 1]) {
    const ball = new Mesh(new SphereGeometry(0.075, 12, 10), eyeWhite);
    ball.position.set(side * 0.085, 1.02, -0.16);
    kid.add(ball);
    const dot = new Mesh(new SphereGeometry(0.035, 10, 8), pupil);
    dot.position.set(side * 0.085, 1.02, -0.225);
    kid.add(dot);
  }
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
  private kids: Group[] = [];
  private clock = 0;

  init(): void {
    this.headPos = new Vector3();
    const room = new Group();
    this.roomRoot = room;
    room.name = 'Classroom';

    // --- shell: 8m wide, 8m deep, 3m tall. Player sits near the back, facing -Z. ---
    const floor = new Mesh(
      new PlaneGeometry(8, 8),
      new MeshStandardMaterial({ map: makeWoodFloorTexture(), color: 0xc2b2a2, roughness: 0.85, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -2);
    room.add(floor);

    const ceil = new Mesh(new PlaneGeometry(8, 8), flat(COL.ceiling));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 3, -2);
    room.add(ceil);

    const wallMat = flat(COL.wall);
    const frontWall = new Mesh(new PlaneGeometry(8, 3), wallMat);
    frontWall.position.set(0, 1.5, -6);
    room.add(frontWall);

    const backWall = new Mesh(new PlaneGeometry(8, 3), wallMat);
    backWall.position.set(0, 1.5, 2);
    backWall.rotation.y = Math.PI;
    room.add(backWall);

    for (const sx of [-1, 1]) {
      const sideWall = new Mesh(new PlaneGeometry(8, 3), wallMat);
      sideWall.position.set(sx * 4, 1.5, -2);
      sideWall.rotation.y = -sx * (Math.PI / 2);
      room.add(sideWall);
    }

    // pink trim stripe so the walls are not just one flat color
    const trimMat = flat(COL.wallTrim);
    room.add(slab(8, 0.12, 0.02, trimMat, 0, 0.9, -5.99));
    for (const sx of [-1, 1]) {
      const stripe = slab(0.02, 0.12, 8, trimMat, sx * 3.99, 0.9, -2);
      room.add(stripe);
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
    room.add(board);
    room.add(slab(4.2, 1.7, 0.04, flat(COL.boardFrame), 0, 1.7, -5.97));

    // --- player's desk + chair (seated, the user is at roughly 0,~1.2,0) ---
    const myDesk = makeDesk();
    myDesk.position.set(0, 0, -0.55);
    room.add(myDesk);

    const myChair = makeChair();
    myChair.position.set(0, 0, 0.2);
    room.add(myChair);

    // --- exam paper, lying slightly tilted toward the player ---
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
    room.add(pencil);

    // --- the neighbors: left one is the future "peek" target ---
    const sideSeats: Array<[number, number, number, number]> = [
      [-1.3, 0xffb703, 0xf1c27d, 0x3a2a1a],
      [1.3, 0x06d6a0, 0xc68642, 0x111111],
    ];
    for (const [sx, shirt, skin, hair] of sideSeats) {
      const nDesk = makeDesk();
      nDesk.position.set(sx, 0, -0.55);
      room.add(nDesk);
      const nChair = makeChair();
      nChair.position.set(sx, 0, 0.2);
      room.add(nChair);
      const kid = makeKid(shirt, skin, hair);
      kid.position.set(sx, 0.0, 0.15);
      room.add(kid);
      this.kids.push(kid);
      const theirPaper = new Mesh(
        new PlaneGeometry(0.3, 0.42),
        new MeshStandardMaterial({ map: paperTex, roughness: 0.9 }),
      );
      theirPaper.rotation.x = -Math.PI / 2 + 0.25;
      theirPaper.position.set(sx, 0.78, -0.45);
      room.add(theirPaper);
    }

    // a couple of rows further up so the room feels populated
    const farRows: Array<[number, number, number, number, number]> = [
      [-1.3, -2.2, 0xe63946, 0xf1c27d, 0xb5651d],
      [0, -2.2, 0x8338ec, 0xc68642, 0x222222],
      [1.3, -2.2, 0x3a86ff, 0xf1c27d, 0xffd166],
    ];
    for (const [fx, fz, shirt, skin, hair] of farRows) {
      const d = makeDesk();
      d.position.set(fx, 0, fz);
      room.add(d);
      const kid = makeKid(shirt, skin, hair);
      // these kids sit with their backs to the player, facing the board
      kid.position.set(fx, 0, fz + 0.75);
      room.add(kid);
      this.kids.push(kid);
    }

    // teacher's desk at the front, empty for now (teacher arrives in piece 3)
    const tDesk = makeDesk();
    tDesk.scale.set(1.6, 1, 1.2);
    tDesk.position.set(2.4, 0, -4.8);
    room.add(tDesk);

    this.roomEntity = this.world.createTransformEntity(room);
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
    if (this.calibrated) return;
    this.world.camera.getWorldPosition(this.headPos);
    if (this.headPos.y < 0.5) return; // tracking not ready yet
    this.roomRoot.position.y = this.headPos.y - SEATED_EYE_Y;
    this.calibrated = true;
  }
}
