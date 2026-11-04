import {
  BackSide,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PokeInteractable,
  Pressed,
  RayInteractable,
  SphereGeometry,
  SRGBColorSpace,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ToyButton } from './exam-components.js';
import { sfx } from './sfx.js';
import { TITLE } from './title.js';
import { FRAME_H, FRAME_W, SCENE_H, SCENE_W, STAMPS, WINDOW, paintCaption, paintFrame, paintPrompt, paintScene, paintStamp } from './title-art.js';

const M_PER_PX = 1.3 / FRAME_W; // the poster is 1.3 m wide
const ROOT_POS = { x: 0, y: 1.2, z: -1.35 };
const SCENE_COUNT = STAMPS.length;
const SCENE_SECONDS = 3.4;
const FADE_SECONDS = 0.7;
const ZOOM = 0.1; // slow push-in per scene
const LEAVE_SECONDS = 0.45;
const CONFETTI = 36;
const CONFETTI_COLORS = [0xff4d6d, 0x3a86ff, 0x06b57f, 0xffd166, 0x6a4cff];

function tex(cv: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(cv);
  t.anisotropy = 16;
  t.colorSpace = SRGBColorSpace;
  return t;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * The start screen: a cartoon poster floating in front of your desk. It cycles through four goofy scenes
 * (peeking, getting busted, a snack throw, a crib sheet falling) with crossfades, a slow push-in, a stamp that
 * pops on and a caption that slides up. Click it and it shrinks away, then the exam menu is usable.
 * Shows once per page load. `?notitle` skips it (headless tests, the demo bot).
 */
export class TitleSystem extends createSystem({
  pressed: { required: [ToyButton, Pressed] },
}) {
  private root!: Group;
  private hit!: Mesh;
  private sceneTex: CanvasTexture[] = [];
  private under!: Mesh;
  private over!: Mesh;
  private underMat!: MeshBasicMaterial;
  private overMat!: MeshBasicMaterial;
  private stamp!: Mesh;
  private stampG!: CanvasRenderingContext2D;
  private stampTex!: CanvasTexture;
  private caption!: Mesh;
  private capG!: CanvasRenderingContext2D;
  private capTex!: CanvasTexture;
  private prompt!: Mesh;
  private t = 0;
  private leave = 0;
  private shown = -1;
  private classroom!: ClassroomSystem;
  private bg!: Group;
  private bgMat!: MeshBasicMaterial;
  private confetti: Mesh[] = [];
  private confettiMats: MeshBasicMaterial[] = [];

  init(): void {
    const classroom = this.world.getSystem(ClassroomSystem);
    if (!classroom) throw new Error('Classroom system must be registered before TitleSystem');
    const qp = new URLSearchParams(window.location.search);

    this.classroom = classroom;
    this.root = new Group();
    this.root.position.set(ROOT_POS.x, ROOT_POS.y, ROOT_POS.z);
    // the start screen lives in its own backdrop at the scene level; the classroom stays hidden until START
    const rootEntity = this.world.createTransformEntity(this.root);

    // backdrop: a big soft gradient dome plus drifting confetti
    const bcv = canvas(8, 256);
    const bg2 = bcv.getContext('2d')!;
    const grad = bg2.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#2a1b6e');
    grad.addColorStop(0.5, '#5a3fd1');
    grad.addColorStop(1, '#e2639a');
    bg2.fillStyle = grad;
    bg2.fillRect(0, 0, 8, 256);
    this.bgMat = new MeshBasicMaterial({ map: tex(bcv), side: BackSide, transparent: true, depthWrite: false });
    const dome = new Mesh(new SphereGeometry(9, 24, 16), this.bgMat);
    dome.renderOrder = -10;
    this.bg = new Group();
    this.bg.add(dome);
    const confGeo = new PlaneGeometry(0.05, 0.08);
    for (let i = 0; i < CONFETTI; i++) {
      const m = new MeshBasicMaterial({ color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], transparent: true, side: 2 });
      const c = new Mesh(confGeo, m);
      this.confetti.push(c);
      this.confettiMats.push(m);
      this.bg.add(c);
    }
    this.world.createTransformEntity(this.bg);

    // scenes (drawn once)
    for (let i = 0; i < SCENE_COUNT; i++) {
      const cv = canvas(SCENE_W, SCENE_H);
      paintScene(cv.getContext('2d')!, i);
      this.sceneTex.push(tex(cv));
    }
    const wW = WINDOW.w * M_PER_PX;
    const wH = WINDOW.h * M_PER_PX;
    const wY = -((WINDOW.y + WINDOW.h / 2) - FRAME_H / 2) * M_PER_PX;
    const wX = ((WINDOW.x + WINDOW.w / 2) - FRAME_W / 2) * M_PER_PX;
    const mk = (z: number, order: number): [Mesh, MeshBasicMaterial] => {
      const m = new MeshBasicMaterial({ map: this.sceneTex[0], transparent: true, depthTest: false, depthWrite: false });
      const mesh = new Mesh(new PlaneGeometry(wW, wH), m);
      mesh.position.set(wX, wY, z);
      mesh.renderOrder = order;
      this.root.add(mesh);
      return [mesh, m];
    };
    [this.under, this.underMat] = mk(0.0, 20);
    [this.over, this.overMat] = mk(0.001, 21);

    // frame with a hole, on top of the scenes
    const fcv = canvas(FRAME_W, FRAME_H);
    paintFrame(fcv.getContext('2d')!);
    const frame = new Mesh(
      new PlaneGeometry(FRAME_W * M_PER_PX, FRAME_H * M_PER_PX),
      new MeshBasicMaterial({ map: tex(fcv), transparent: true, depthTest: false, depthWrite: false }),
    );
    frame.position.z = 0.002;
    frame.renderOrder = 22;
    this.root.add(frame);

    // stamp (repainted per scene)
    const scv = canvas(420, 200);
    this.stampG = scv.getContext('2d')!;
    this.stampTex = tex(scv);
    this.stamp = new Mesh(new PlaneGeometry(0.42, 0.2), new MeshBasicMaterial({ map: this.stampTex, transparent: true, depthTest: false, depthWrite: false }));
    this.stamp.position.set(wX + wW / 2 - 0.26, wY + wH / 2 - 0.16, 0.003);
    this.stamp.renderOrder = 23;
    this.root.add(this.stamp);

    // caption strip (repainted per scene)
    const ccv = canvas(1000, 100);
    this.capG = ccv.getContext('2d')!;
    this.capTex = tex(ccv);
    this.caption = new Mesh(new PlaneGeometry(1.0, 0.1), new MeshBasicMaterial({ map: this.capTex, transparent: true, depthTest: false, depthWrite: false }));
    this.caption.renderOrder = 23;
    this.root.add(this.caption);

    // click prompt under the picture
    const pcv = canvas(900, 110);
    paintPrompt(pcv.getContext('2d')!);
    this.prompt = new Mesh(new PlaneGeometry(0.9, 0.11), new MeshBasicMaterial({ map: tex(pcv), transparent: true, depthTest: false, depthWrite: false }));
    this.prompt.position.set(0, -((FRAME_H / 2 - 62) * M_PER_PX) + 0.02, 0.003);
    this.prompt.renderOrder = 23;
    this.root.add(this.prompt);

    // invisible click target over the whole poster
    this.hit = new Mesh(
      new PlaneGeometry(FRAME_W * M_PER_PX, FRAME_H * M_PER_PX),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false }),
    );
    this.hit.position.z = 0.004;
    const hitEntity = this.world.createTransformEntity(this.hit, rootEntity);
    hitEntity.addComponent(ToyButton, { kind: 21 });
    hitEntity.addComponent(RayInteractable);
    hitEntity.addComponent(PokeInteractable);
    this.queries.pressed.subscribe('qualify', (en) => {
      if (en.getValue(ToyButton, 'kind') !== 21 || !TITLE.active || TITLE.leaving) return;
      sfx.unlock();
      sfx.bell();
      TITLE.start();
    });

    if (qp.has('notitle') || qp.has('bot') || qp.has('cam')) {
      TITLE.active = false;
      this.root.visible = false;
      this.hit.visible = false;
      this.bg.visible = false;
    } else {
      this.classroom.setHidden(true);
    }
  }

  update(delta: number): void {
    if (!TITLE.active) {
      if (this.root.visible || this.bg.visible) {
        this.root.visible = false;
        this.hit.visible = false;
        this.bg.visible = false;
        this.classroom.setHidden(false);
      }
      return;
    }
    const dt = Math.min(delta, 0.1);
    // follow your calibrated head height so the poster sits at eye level
    const fy = this.classroom.floorY;
    this.bg.position.y = fy + 1.1;
    this.drift(this.t);
    if (TITLE.jump >= 0) {
      this.t = TITLE.jump;
      TITLE.jump = -1;
    }
    this.t += dt;

    // leaving: shrink + rise, then hand over to the exam menu
    if (TITLE.leaving) {
      this.leave += dt / LEAVE_SECONDS;
      const u = Math.min(1, this.leave);
      this.root.scale.setScalar(Math.max(0.001, 1 - u * u));
      this.root.position.y = fy + ROOT_POS.y + u * 0.25;
      this.bgMat.opacity = 1 - u;
      this.classroom.setHidden(false);
      for (let i = 0; i < CONFETTI; i++) this.confettiMats[i].opacity = 1 - u;
      if (u >= 1) {
        TITLE.active = false;
        TITLE.leaving = false;
        this.root.visible = false;
        this.hit.visible = false;
        this.bg.visible = false;
      }
      return;
    }
    this.root.position.y = fy + ROOT_POS.y;

    const idx = Math.floor(this.t / SCENE_SECONDS);
    const local = this.t - idx * SCENE_SECONDS;
    const cur = idx % SCENE_COUNT;
    const prev = (idx + SCENE_COUNT - 1) % SCENE_COUNT;

    if (idx !== this.shown) {
      this.shown = idx;
      paintStamp(this.stampG, cur);
      this.stampTex.needsUpdate = true;
      this.capG.clearRect(0, 0, 1000, 100);
      paintCaption(this.capG, cur);
      this.capTex.needsUpdate = true;
      this.overMat.map = this.sceneTex[cur];
      this.underMat.map = this.sceneTex[prev];
      this.stamp.rotation.z = STAMPS[cur].rot;
      if (idx > 0) sfx.whoosh();
    }

    // crossfade with a slow push-in on both layers
    const fade = idx === 0 ? 1 : Math.min(1, local / FADE_SECONDS);
    this.overMat.opacity = fade;
    this.underMat.opacity = 1;
    this.zoom(this.sceneTex[cur], local / SCENE_SECONDS, cur);
    this.zoom(this.sceneTex[prev], 1 + local / SCENE_SECONDS, prev);

    // stamp pops on with an overshoot a little after the scene appears, shrinks away before the next fade
    const sT = (local - 0.55) / 0.35;
    let s = 0;
    if (sT > 0) s = sT >= 1 ? 1 : 1 + Math.sin(sT * Math.PI) * 0.35 - (1 - sT) * 0.0 + (sT - 1) * 0;
    if (local > SCENE_SECONDS - 0.35) s *= Math.max(0, (SCENE_SECONDS - local) / 0.35);
    this.stamp.scale.setScalar(Math.max(0.0001, s));
    this.stamp.visible = s > 0.01;

    // caption slides up from the bottom of the picture
    const cT = Math.min(1, Math.max(0, (local - 0.25) / 0.4));
    const ease = 1 - (1 - cT) * (1 - cT);
    const wH = WINDOW.h * M_PER_PX;
    const wY = -((WINDOW.y + WINDOW.h / 2) - FRAME_H / 2) * M_PER_PX;
    const wX = ((WINDOW.x + WINDOW.w / 2) - FRAME_W / 2) * M_PER_PX;
    this.caption.position.set(wX, wY - wH / 2 + 0.07 - (1 - ease) * 0.12, 0.003);
    this.caption.visible = cT > 0.01;

    this.prompt.scale.setScalar(1 + Math.sin(this.t * 4) * 0.035);
  }

  /** confetti slowly falling in a ring around you (local to the backdrop group, centred on the player) */
  private drift(t: number): void {
    for (let i = 0; i < CONFETTI; i++) {
      const a = (i / CONFETTI) * Math.PI * 2 + i * 0.7;
      const r = 1.6 + (i % 5) * 0.35;
      const fall = ((t * (0.12 + (i % 4) * 0.03) + i * 0.37) % 2.4) / 2.4;
      const c = this.confetti[i];
      c.position.set(Math.sin(a) * r, 1.4 - fall * 2.8, -Math.cos(a) * r);
      c.rotation.set(t * (1 + (i % 3)), a + t * 0.6, t * 0.8);
    }
  }

  /** slow push-in toward a point, by scene progress p (0..2: second half is the outgoing layer) */
  private zoom(t: CanvasTexture, p: number, scene: number): void {
    const z = 1 + ZOOM * Math.min(2, p) * 0.5;
    const r = 1 / z;
    // drift toward a different corner each scene
    const fx = scene % 2 === 0 ? 0.35 : 0.65;
    const fy = scene < 2 ? 0.4 : 0.6;
    t.repeat.set(r, r);
    t.offset.set((1 - r) * fx, (1 - r) * (1 - fy));
  }
}
