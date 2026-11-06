import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ToyButton } from './exam-components.js';
import { SETTINGS } from './settings.js';
import { sfx } from './sfx.js';
import { TITLE } from './title.js';
import { FRAME_H, FRAME_W, SCENE_H, SCENE_W, STAMPS, WINDOW, paintCaption, paintFrame, paintPrompt, paintScene, paintStamp } from './title-art.js';

const M_PER_PX = 1.3 / FRAME_W; // the poster is 1.3 m wide
const ROOT_POS = { x: 0, y: 1.22, z: -1.3 };
const SCENE_COUNT = STAMPS.length;
const SCENE_SECONDS = 3.4;
const FADE_SECONDS = 0.7;
const ZOOM = 0.1; // slow push-in per scene
const LEAVE_SECONDS = 0.45;


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

  init(): void {
    const classroom = this.world.getSystem(ClassroomSystem);
    if (!classroom) throw new Error('Classroom system must be registered before TitleSystem');
    const qp = new URLSearchParams(window.location.search);

    this.root = new Group();
    this.root.position.set(ROOT_POS.x, ROOT_POS.y, ROOT_POS.z);
    const rootEntity = this.world.createTransformEntity(this.root, classroom.seatEntity);

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
    }
  }

  update(delta: number): void {
    if (!TITLE.active) {
      if (this.root.visible) {
        this.root.visible = false;
        this.hit.visible = false;
      }
      return;
    }
    const dt = Math.min(delta, 0.1);

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
      this.root.position.y = ROOT_POS.y + u * 0.25;
      if (u >= 1) {
        TITLE.active = false;
        TITLE.leaving = false;
        this.root.visible = false;
        this.hit.visible = false;
      }
      return;
    }

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

  /** slow push-in toward a point, by scene progress p (0..2: second half is the outgoing layer) */
  private zoom(t: CanvasTexture, p: number, scene: number): void {
    const z = 1 + (SETTINGS.calm ? 0 : ZOOM) * Math.min(2, p) * 0.5;
    const r = 1 / z;
    // drift toward a different corner each scene
    const fx = scene % 2 === 0 ? 0.35 : 0.65;
    const fy = scene < 2 ? 0.4 : 0.6;
    t.repeat.set(r, r);
    t.offset.set((1 - r) * fx, (1 - r) * (1 - fy));
  }
}
