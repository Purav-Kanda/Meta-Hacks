import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Object3D,
  type Quaternion,
} from '@iwsdk/core';

function puffTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(235,232,225,0.6)');
  grad.addColorStop(1, 'rgba(225,220,212,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * A tiny pool of billboarded dust/smoke puffs. Everything is allocated up front,
 * emit() just recycles the oldest slot, so nothing is created while the game runs.
 */
export class PuffPool {
  private readonly meshes: Mesh[] = [];
  private readonly mats: MeshBasicMaterial[] = [];
  private readonly age: number[] = [];
  private readonly life: number[] = [];
  private readonly size: number[] = [];
  private readonly rise: number[] = [];
  private readonly vx: number[] = [];
  private readonly vz: number[] = [];
  private next = 0;

  constructor(parent: Object3D, private readonly count = 32) {
    const tex = puffTexture();
    const geo = new PlaneGeometry(1, 1);
    for (let i = 0; i < count; i++) {
      const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
      const mesh = new Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      parent.add(mesh);
      this.meshes.push(mesh);
      this.mats.push(mat);
      this.age.push(1);
      this.life.push(1);
      this.size.push(0.1);
      this.rise.push(0.2);
      this.vx.push(0);
      this.vz.push(0);
    }
  }

  /** start a puff at a room-space point. size in meters, life in seconds */
  emit(x: number, y: number, z: number, size: number, life: number, vx = 0, vz = 0, rise = 0.25): void {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.meshes[i].position.set(x, y, z);
    this.meshes[i].visible = true;
    this.age[i] = 0;
    this.life[i] = life;
    this.size[i] = size;
    this.rise[i] = rise;
    this.vx[i] = vx;
    this.vz[i] = vz;
  }

  /** a ring of puffs flying outward (start of a charge, a fruit landing) */
  burst(x: number, z: number, n: number, size: number, speed: number): void {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.5;
      this.emit(x, 0.07, z, size, 0.8, Math.cos(a) * speed, Math.sin(a) * speed, 0.2);
    }
  }

  update(dt: number, camQuat: Quaternion): void {
    for (let i = 0; i < this.count; i++) {
      const mesh = this.meshes[i];
      if (!mesh.visible) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        mesh.visible = false;
        continue;
      }
      mesh.position.x += this.vx[i] * dt;
      mesh.position.z += this.vz[i] * dt;
      mesh.position.y += this.rise[i] * dt;
      mesh.scale.setScalar(this.size[i] * (1 + 1.8 * t));
      mesh.quaternion.copy(camQuat);
      this.mats[i].opacity = 0.8 * (1 - t) * (1 - t);
    }
  }
}
