import {
  CanvasTexture,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
  createSystem,
} from '@iwsdk/core';
import { ClassroomSystem } from './classroom.js';
import { ExamSystem } from './exam-system.js';
import { SettingsButton } from './exam-components.js';
import { ASSIST_NAMES, HEIGHT_NAMES, SETTINGS, VOLUME_NAMES, changeSettings, onSettingsChange } from './settings.js';
import { SEAT } from './seat.js';
import { TITLE } from './title.js';

const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
const PX_PER_M = 1600;
const PANEL_POS = { x: 0, y: 1.42, z: -0.9 };
const PANEL_W = 0.9;
const PANEL_H = 0.725; // one more row than before; the plate grows downward (see PLATE_DY)
const PLATE_DY = -0.0525;
const CELL_W = 0.42;
const CELL_H = 0.095;
const COL_X = [-0.215, 0.215];
const ROW_Y = [0.115, 0.01, -0.095, -0.2, -0.305];
const GEAR_POS = { x: 0.52, y: 1.12, z: -0.9 };

interface Cell {
  id: number;
  col: number;
  row: number;
  label: string;
  desc: string;
  color: string;
  /** centered under both columns */
  center?: boolean;
}

// ids 0-6 and 9 are the settings, 7 is DONE. Left column first, then the right one.
const CELLS: Cell[] = [
  { id: 0, col: 0, row: 0, label: 'SOUND', desc: 'master volume', color: '#3a86ff' },
  { id: 1, col: 0, row: 1, label: 'MUSIC', desc: 'the background beat', color: '#8338ec' },
  { id: 2, col: 0, row: 2, label: 'BIG POP-UP TEXT', desc: 'round cards + coach', color: '#ff7b00' },
  { id: 3, col: 0, row: 3, label: 'HIGH CONTRAST', desc: 'black + yellow buttons', color: '#222222' },
  { id: 4, col: 1, row: 0, label: 'RELAXED MODE', desc: 'slower teacher, +50% time', color: '#06b57f' },
  { id: 5, col: 1, row: 1, label: 'CALM MOTION', desc: 'no bouncy pop-ins', color: '#d6407f' },
  { id: 6, col: 1, row: 2, label: 'THROW ASSIST', desc: 'snacks aim for you', color: '#e07a00' },
  { id: 9, col: 1, row: 3, label: 'SEAT HEIGHT', desc: 'eyes never drop below it', color: '#118ab2' },
  { id: 7, col: 0, row: 4, label: 'DONE', desc: 'close settings', color: '#2ec4b6', center: true },
];

function valueText(id: number): string {
  switch (id) {
    case 0:
      return VOLUME_NAMES[SETTINGS.volume];
    case 1:
      return SETTINGS.music ? 'ON' : 'OFF';
    case 2:
      return SETTINGS.popupLarge ? 'ON' : 'OFF';
    case 3:
      return SETTINGS.contrast ? 'ON' : 'OFF';
    case 4:
      return SETTINGS.relaxed ? 'ON' : 'OFF';
    case 5:
      return SETTINGS.calm ? 'ON' : 'OFF';
    case 6:
      return ASSIST_NAMES[SETTINGS.assist];
    case 9:
      return HEIGHT_NAMES[SETTINGS.height];
    default:
      return '';
  }
}

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
 * The settings panel: a gear on the desk (only between exams) opens a floating panel of big buttons. Each
 * button cycles one setting; everything applies at once and is saved. All of it works with a hand pinch.
 */
export class SettingsSystem extends createSystem({
  buttons: { required: [SettingsButton] },
  pressed: { required: [SettingsButton, Pressed] },
}) {
  private exam!: ExamSystem;
  private panel!: Group;
  private gear!: Mesh;
  private cellMesh = new Map<number, Mesh>();
  private cellCtx = new Map<number, CanvasRenderingContext2D>();
  private cellTex = new Map<number, CanvasTexture>();
  private open = false;

  init(): void {
    const classroom = this.world.getSystem(ClassroomSystem);
    const exam = this.world.getSystem(ExamSystem);
    if (!classroom || !exam) throw new Error('Classroom and Exam systems must be registered before SettingsSystem');
    this.exam = exam;

    this.panel = new Group();
    this.panel.position.set(PANEL_POS.x, PANEL_POS.y, PANEL_POS.z);
    this.panel.visible = false;
    const panelEntity = this.world.createTransformEntity(this.panel, classroom.seatEntity);

    // the plate behind the buttons
    const pcv = canvas(Math.round(PANEL_W * PX_PER_M), Math.round(PANEL_H * PX_PER_M));
    this.paintPlate(pcv.getContext('2d')!);
    const plate = new Mesh(
      new PlaneGeometry(PANEL_W, PANEL_H),
      new MeshBasicMaterial({ map: tex(pcv), transparent: true, depthWrite: false }),
    );
    plate.position.y = PLATE_DY;
    plate.renderOrder = 8;
    this.panel.add(plate);

    // one button per setting (and DONE)
    const geo = new PlaneGeometry(CELL_W, CELL_H);
    for (const c of CELLS) {
      const cv = canvas(Math.round(CELL_W * PX_PER_M), Math.round(CELL_H * PX_PER_M));
      const g = cv.getContext('2d')!;
      const t = tex(cv);
      const mesh = new Mesh(geo, new MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
      mesh.position.set(c.center ? 0 : COL_X[c.col], ROW_Y[c.row], 0.004);
      mesh.renderOrder = 9;
      this.cellMesh.set(c.id, mesh);
      this.cellCtx.set(c.id, g);
      this.cellTex.set(c.id, t);
      const ent = this.world.createTransformEntity(mesh, panelEntity);
      ent.addComponent(SettingsButton, { id: c.id });
      ent.addComponent(RayInteractable);
      this.paintCell(c);
    }

    // the gear on the desk
    const gcv = canvas(224, 272);
    this.paintGear(gcv.getContext('2d')!);
    this.gear = new Mesh(
      new PlaneGeometry(0.14, 0.17),
      new MeshBasicMaterial({ map: tex(gcv), transparent: true, depthWrite: false }),
    );
    this.gear.position.set(GEAR_POS.x, GEAR_POS.y, GEAR_POS.z);
    this.gear.rotation.x = 0;
    this.gear.scale.setScalar(1);
    this.gear.renderOrder = 6;
    this.gear.visible = false;
    const gEnt = this.world.createTransformEntity(this.gear, classroom.seatEntity);
    gEnt.addComponent(SettingsButton, { id: 8 });
    gEnt.addComponent(RayInteractable);

    this.queries.pressed.subscribe('qualify', (e) => this.onPressed(e.getValue(SettingsButton, 'id') as number));
    onSettingsChange(() => {
      for (const c of CELLS) if (c.id !== 7) this.paintCell(c);
    });
  }

  private onPressed(id: number): void {
    const S = SETTINGS;
    switch (id) {
      case 0:
        changeSettings({ volume: (S.volume + 1) % 4 });
        break;
      case 1:
        changeSettings({ music: !S.music });
        break;
      case 2:
        changeSettings({ popupLarge: !S.popupLarge });
        break;
      case 3:
        changeSettings({ contrast: !S.contrast });
        break;
      case 4:
        changeSettings({ relaxed: !S.relaxed });
        break;
      case 5:
        changeSettings({ calm: !S.calm });
        break;
      case 6:
        changeSettings({ assist: (S.assist + 1) % 3 });
        break;
      case 9:
        changeSettings({ height: (S.height + 1) % 3 });
        break;
      case 7:
        this.close();
        break;
      case 8:
        this.openPanel();
        break;
    }
  }

  private openPanel(): void {
    if (this.open) return;
    this.open = true;
    this.panel.visible = true;
    this.gear.visible = false;
    this.exam.setBookHidden(true);
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.panel.visible = false;
    this.exam.setBookHidden(false);
  }

  update(): void {
    const ex = this.exam.exam;
    const idle = !TITLE.active && ex.phase !== 'playing' && !SEAT.holding;
    if (this.open && !idle) this.close();
    this.gear.visible = idle && !this.open;
    // hover tint: lit while the ray is on it
    for (const e of this.queries.buttons.entities) {
      const id = e.getValue(SettingsButton, 'id') as number;
      const mesh = id === 8 ? this.gear : this.cellMesh.get(id);
      if (!mesh) continue;
      (mesh.material as MeshBasicMaterial).color.setHex(e.hasComponent(Hovered) ? 0xfff0a8 : 0xffffff);
    }
  }

  private paintPlate(g: CanvasRenderingContext2D): void {
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.fillStyle = '#fffdf2';
    g.strokeStyle = '#6a4cff';
    g.lineWidth = 16;
    g.beginPath();
    g.roundRect(8, 8, w - 16, h - 16, 48);
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#6a4cff';
    g.font = `bold 96px ${FONT}`;
    g.fillText('SETTINGS', w / 2, 90);
    g.fillStyle = '#555';
    g.font = `34px ${FONT}`;
    g.fillText('pinch a button to change it  •  saved automatically', w / 2, 158);
  }

  private paintCell(c: Cell): void {
    const g = this.cellCtx.get(c.id)!;
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = c.color;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 34);
    g.fill();
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    if (c.id === 7) {
      g.textAlign = 'center';
      g.font = `bold 62px ${FONT}`;
      g.fillText('DONE', w / 2, h / 2 - 8);
      g.font = `26px ${FONT}`;
      g.fillText(c.desc, w / 2, h / 2 + 40);
    } else {
      g.textAlign = 'left';
      let fs = 36;
      g.font = `bold ${fs}px ${FONT}`;
      while (g.measureText(c.label).width > 400 && fs > 24) {
        fs -= 2;
        g.font = `bold ${fs}px ${FONT}`;
      }
      g.fillText(c.label, 26, h / 2 - 20);
      g.font = `26px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText(c.desc, 26, h / 2 + 30);
      // the value, in a white pill on the right
      const v = valueText(c.id);
      g.font = `bold 44px ${FONT}`;
      const pw = Math.max(110, g.measureText(v).width + 44);
      g.fillStyle = '#fff';
      g.beginPath();
      g.roundRect(w - 26 - pw, h / 2 - 34, pw, 68, 34);
      g.fill();
      g.fillStyle = v === 'OFF' ? '#777' : '#1b7a4a';
      g.textAlign = 'center';
      g.fillText(v, w - 26 - pw / 2, h / 2 + 2);
    }
    this.cellTex.get(c.id)!.needsUpdate = true;
  }

  private paintGear(g: CanvasRenderingContext2D): void {
    const w = g.canvas.width;
    g.clearRect(0, 0, w, g.canvas.height);
    g.fillStyle = '#6a4cff';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 10;
    g.beginPath();
    g.roundRect(8, 8, w - 16, g.canvas.height - 16, 44);
    g.fill();
    g.stroke();
    // the gear: teeth around a ring with a hole
    g.save();
    g.translate(w / 2, 108);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) {
      g.save();
      g.rotate((i * Math.PI) / 4);
      g.fillRect(-14, -78, 28, 36);
      g.restore();
    }
    g.beginPath();
    g.arc(0, 0, 58, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(0, 0, 24, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 34px ${FONT}`;
    g.fillText('SETTINGS', w / 2, 232);
  }
}
