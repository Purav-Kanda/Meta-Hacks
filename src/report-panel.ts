import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { STICKERS, type Progress, type RoundResult, type RoundStats } from './progress.js';

const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
const W = 960;
const H = 640;
const GRADE_COLOR: Record<string, string> = { 'A+': '#06b57f', A: '#06b57f', B: '#3a86ff', C: '#f2b01e', D: '#ff8c00', F: '#d62839' };

/**
 * A floating card above the exam sheet. Before an exam it shows the sticker book and best scores (a
 * reason to come back); after an exam it shows the report card: grade, score and any new stickers.
 */
export class ReportPanel {
  readonly mesh: Mesh;
  private readonly g: CanvasRenderingContext2D;
  private readonly tex: CanvasTexture;

  constructor() {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    this.g = cv.getContext('2d')!;
    this.tex = new CanvasTexture(cv);
    this.tex.anisotropy = 16;
    this.tex.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(new PlaneGeometry(0.85, 0.5667), new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  private card(title: string, color: string): void {
    const g = this.g;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fffdf2';
    g.strokeStyle = color;
    g.lineWidth = 14;
    g.beginPath();
    g.roundRect(10, 10, W - 20, H - 20, 44);
    g.fill();
    g.stroke();
    g.fillStyle = color;
    g.font = `bold 62px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText(title, W / 2, 86);
  }

  /** before an exam: best scores and the sticker book */
  paintBook(p: Progress): void {
    this.card('STICKER BOOK', '#6a4cff');
    const g = this.g;
    const b = p.data.best;
    const e = b.easy;
    const n = b.notEasy;
    const r = b.rush;
    const en = b.endless;
    g.fillStyle = '#222';
    g.font = `bold 28px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(
      `BEST  EASY ${e ? e.grade : '-'}   NOT EASY ${n ? n.grade : '-'}   RUSH ${r ? r.grade : '-'}   ENDLESS ${en ? en.score : '-'}   WEEK DAY ${p.data.weekDay + 1}`,
      W / 2,
      130,
    );
    const cols = 3;
    const cw = (W - 80) / cols;
    const ch = 100;
    STICKERS.forEach((s, i) => {
      const x = 40 + (i % cols) * cw;
      const y = 148 + Math.floor(i / cols) * (ch + 7);
      const got = p.has(s.id);
      g.fillStyle = got ? '#ffe9a8' : '#e7e3d3';
      g.beginPath();
      g.roundRect(x + 6, y, cw - 12, ch, 26);
      g.fill();
      g.textAlign = 'center';
      g.fillStyle = got ? '#7a4b00' : '#8a8676';
      g.font = `bold 32px ${FONT}`;
      this.fitText(got ? s.name : '?  ?  ?', x + cw / 2, y + 36, cw - 30);
      g.font = `26px ${FONT}`;
      g.fillStyle = got ? '#7a4b00' : '#6b6757';
      const [l1, l2] = this.twoLines(s.hint);
      this.fitText(l1, x + cw / 2, y + 66, cw - 30);
      if (l2) this.fitText(l2, x + cw / 2, y + 92, cw - 30);
    });
    this.tex.needsUpdate = true;
    this.mesh.visible = true;
  }

  /** after an exam: the report card */
  paintResult(r: RoundResult, s: RoundStats, p: Progress): void {
    const color = GRADE_COLOR[r.grade] ?? '#d62839';
    this.card('REPORT CARD', color);
    const g = this.g;
    // grade stamp
    g.save();
    g.translate(220, 330);
    g.rotate(-0.12);
    g.fillStyle = color;
    g.beginPath();
    g.arc(0, 0, 130, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = `bold ${r.grade.length > 1 ? 150 : 180}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(r.grade, 0, 12);
    g.restore();
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillStyle = '#222';
    g.font = `bold 84px ${FONT}`;
    const endless = s.mode === 'endless';
    g.fillText(endless ? `${r.score} right` : `${r.score} / ${r.total}`, 420, 290);
    g.font = `bold 40px ${FONT}`;
    g.fillStyle = endless ? '#6a4cff' : s.mode === 'tutorial' ? '#06b57f' : s.caught ? '#d62839' : s.passed ? '#06b57f' : '#d62839';
    g.fillText(endless ? 'ENDLESS' : s.mode === 'tutorial' ? 'TRAINING DONE' : s.caught ? 'CAUGHT CHEATING' : s.passed ? 'PASSED' : 'FAILED', 420, 345);
    g.fillStyle = '#6a4cff';
    g.font = `bold 34px ${FONT}`;
    g.fillText(r.newBest ? 'NEW BEST!' : '', 420, 392);
    if (s.note) {
      g.fillStyle = s.goalMet ? '#06b57f' : '#d62839';
      g.font = `bold 30px ${FONT}`;
      this.fitText(s.note, 420, 438, W - 460);
    }
    // new stickers
    g.textAlign = 'center';
    if (r.newStickers.length > 0) {
      g.fillStyle = '#ffe9a8';
      g.beginPath();
      g.roundRect(60, 480, W - 120, 104, 26);
      g.fill();
      g.fillStyle = '#7a4b00';
      g.font = `bold 38px ${FONT}`;
      g.fillText(`NEW STICKER${r.newStickers.length > 1 ? 'S' : ''}!`, W / 2, 522);
      g.font = `bold 34px ${FONT}`;
      this.fitText(r.newStickers.map((x) => x.name).join('  -  '), W / 2, 566, W - 160);
    } else {
      g.fillStyle = '#6b6757';
      g.font = `30px ${FONT}`;
      g.fillText(`${p.data.stickers.length} / ${STICKERS.length} stickers collected`, W / 2, 540);
    }
    this.tex.needsUpdate = true;
    this.mesh.visible = true;
  }

  /** split a short sentence into two lines of similar length */
  private twoLines(text: string): [string, string] {
    const w = text.split(' ');
    if (w.length < 4) return [text, ''];
    let best = 1;
    let bestDiff = 1e9;
    for (let i = 1; i < w.length; i++) {
      const d = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length);
      if (d < bestDiff) {
        bestDiff = d;
        best = i;
      }
    }
    return [w.slice(0, best).join(' '), w.slice(best).join(' ')];
  }

  /** draw text, shrinking the font until it fits in maxW */
  private fitText(text: string, x: number, y: number, maxW: number): void {
    const g = this.g;
    let size = parseInt(/(\d+)px/.exec(g.font)?.[1] ?? '26', 10);
    const weight = g.font.includes('bold') ? 'bold ' : '';
    while (size > 16 && g.measureText(text).width > maxW) {
      size -= 2;
      g.font = `${weight}${size}px ${FONT}`;
    }
    g.fillText(text, x, y);
  }
}
