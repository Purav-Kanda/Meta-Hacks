/**
 * Cartoon art for the start screen, drawn with canvas 2D (no image files). Four 1024x576 scenes, plus the
 * stamp ("BUSTED!") and caption strip for each, and the frame around them. Characters match the game's look:
 * round heads, big googly eyes, grey-bun teacher with pink glasses.
 */
const FONT = '"Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
export const SCENE_W = 1024;
export const SCENE_H = 576;

type Ctx = CanvasRenderingContext2D;

function rr(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function backdrop(g: Ctx): void {
  const w = SCENE_W;
  const h = SCENE_H;
  g.fillStyle = '#7fc4d8';
  g.fillRect(0, 0, w, h);
  // window light and a pink stripe where the wall meets the floor
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.moveTo(40, 0);
  g.lineTo(240, 0);
  g.lineTo(420, 400);
  g.lineTo(220, 400);
  g.closePath();
  g.fill();
  g.fillStyle = '#d6407f';
  g.fillRect(0, 392, w, 22);
  const grad = g.createLinearGradient(0, 414, 0, h);
  grad.addColorStop(0, '#c98a4b');
  grad.addColorStop(1, '#8f5a2b');
  g.fillStyle = grad;
  g.fillRect(0, 414, w, h - 414);
  // floor boards
  g.strokeStyle = 'rgba(80,40,10,0.25)';
  g.lineWidth = 3;
  for (let x = -200; x < w + 200; x += 120) {
    g.beginPath();
    g.moveTo(w / 2 + (x - w / 2) * 0.55, 414);
    g.lineTo(w / 2 + (x - w / 2) * 1.6, h);
    g.stroke();
  }
  // a chalkboard on the wall
  g.fillStyle = '#6b4423';
  rr(g, 600, 60, 340, 190, 10);
  g.fill();
  g.fillStyle = '#1f6b4a';
  rr(g, 612, 72, 316, 166, 6);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = `bold 38px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('POP QUIZ!!', 770, 130);
  g.font = `22px ${FONT}`;
  g.fillText('eyes on your own paper :)', 770, 180);
  // a wall clock
  g.fillStyle = '#fffdf2';
  g.strokeStyle = '#2b2b3a';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(470, 100, 44, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.strokeStyle = '#2b2b3a';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(470, 100);
  g.lineTo(470, 68);
  g.moveTo(470, 100);
  g.lineTo(492, 112);
  g.stroke();
}

function desk(g: Ctx, cx: number, top: number, w: number): void {
  g.fillStyle = '#6a4cff';
  g.fillRect(cx - w / 2 + 14, top + 30, 16, 120);
  g.fillRect(cx + w / 2 - 30, top + 30, 16, 120);
  g.fillStyle = '#ff9f1c';
  rr(g, cx - w / 2, top, w, 36, 10);
  g.fill();
  g.fillStyle = '#e08400';
  rr(g, cx - w / 2, top + 26, w, 12, 6);
  g.fill();
}

function paper(g: Ctx, cx: number, y: number, w: number, tilt = 0): void {
  g.save();
  g.translate(cx, y);
  g.rotate(tilt);
  g.fillStyle = '#fffdf2';
  g.strokeStyle = '#cfc9b0';
  g.lineWidth = 3;
  rr(g, -w / 2, -w * 0.32, w, w * 0.64, 6);
  g.fill();
  g.stroke();
  g.fillStyle = '#d6335a';
  g.fillRect(-w / 2 + 10, -w * 0.32 + 10, w - 20, 8);
  g.fillStyle = '#c9c3a8';
  for (let i = 0; i < 3; i++) g.fillRect(-w / 2 + 12, -w * 0.32 + 30 + i * 16, w - 24 - i * 14, 4);
  g.restore();
}

interface KidOpts {
  shirt: string;
  skin: string;
  hair: string;
  look?: number; // -1 left .. 1 right
  mouth?: 'grin' | 'o' | 'flat' | 'worry';
  tilt?: number;
  sweat?: boolean;
}

function eye(g: Ctx, x: number, y: number, s: number, look: number, scared = false): void {
  g.fillStyle = '#fff';
  g.strokeStyle = '#222';
  g.lineWidth = 3 * s;
  g.beginPath();
  g.ellipse(x, y, 17 * s, (scared ? 22 : 19) * s, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#222';
  g.beginPath();
  g.arc(x + look * 7 * s, y + 1 * s, (scared ? 5 : 8) * s, 0, Math.PI * 2);
  g.fill();
}

function kid(g: Ctx, cx: number, headY: number, s: number, o: KidOpts): void {
  g.save();
  g.translate(cx, headY);
  g.rotate(o.tilt ?? 0);
  // shirt / shoulders
  g.fillStyle = o.shirt;
  rr(g, -70 * s, 52 * s, 140 * s, 130 * s, 40 * s);
  g.fill();
  // head
  g.fillStyle = o.skin;
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 4 * s;
  g.beginPath();
  g.arc(0, 0, 62 * s, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // hair
  g.fillStyle = o.hair;
  g.beginPath();
  g.arc(0, -4 * s, 64 * s, Math.PI * 1.02, Math.PI * 1.98);
  g.quadraticCurveTo(30 * s, -34 * s, -2 * s, -30 * s);
  g.quadraticCurveTo(-34 * s, -26 * s, -64 * s, -6 * s);
  g.closePath();
  g.fill();
  const scared = o.mouth === 'o' || o.mouth === 'worry';
  eye(g, -24 * s, 6 * s, s, o.look ?? 0, scared);
  eye(g, 24 * s, 6 * s, s, o.look ?? 0, scared);
  // mouth
  g.strokeStyle = '#7a2a2a';
  g.fillStyle = '#7a2a2a';
  g.lineWidth = 5 * s;
  g.lineCap = 'round';
  const m = o.mouth ?? 'grin';
  if (m === 'grin') {
    g.beginPath();
    g.arc(0, 26 * s, 20 * s, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  } else if (m === 'o') {
    g.beginPath();
    g.ellipse(0, 40 * s, 11 * s, 15 * s, 0, 0, Math.PI * 2);
    g.fill();
  } else if (m === 'flat') {
    g.beginPath();
    g.moveTo(-14 * s, 38 * s);
    g.lineTo(14 * s, 38 * s);
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(-18 * s, 44 * s);
    g.quadraticCurveTo(-8 * s, 30 * s, 0, 40 * s);
    g.quadraticCurveTo(8 * s, 30 * s, 18 * s, 44 * s);
    g.stroke();
  }
  if (o.sweat) {
    g.fillStyle = '#7fd3ff';
    for (const [dx, dy] of [[-72, -10], [74, 8], [-60, 40]]) {
      g.beginPath();
      g.moveTo(dx * s, (dy - 16) * s);
      g.quadraticCurveTo((dx + 12) * s, dy * s, dx * s, (dy + 12) * s);
      g.quadraticCurveTo((dx - 12) * s, dy * s, dx * s, (dy - 16) * s);
      g.fill();
    }
  }
  g.restore();
}

function teacher(g: Ctx, cx: number, headY: number, s: number, mood: 'angry' | 'shock', point = 0): void {
  g.save();
  g.translate(cx, headY);
  // dress
  g.fillStyle = '#1b8fa6';
  rr(g, -86 * s, 60 * s, 172 * s, 230 * s, 50 * s);
  g.fill();
  g.fillStyle = '#e63946'; // red scarf
  rr(g, -44 * s, 54 * s, 88 * s, 26 * s, 12 * s);
  g.fill();
  // pointing arm
  if (point !== 0) {
    g.strokeStyle = '#1b8fa6';
    g.lineWidth = 34 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(point * 70 * s, 110 * s);
    g.lineTo(point * 190 * s, 60 * s);
    g.stroke();
    g.fillStyle = '#f1c27d';
    g.beginPath();
    g.arc(point * 205 * s, 56 * s, 22 * s, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f1c27d';
    g.lineWidth = 12 * s;
    g.beginPath();
    g.moveTo(point * 210 * s, 50 * s);
    g.lineTo(point * 256 * s, 36 * s);
    g.stroke();
  }
  // head + bun
  g.fillStyle = '#b8b8c4';
  g.beginPath();
  g.arc(0, -78 * s, 30 * s, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f1c27d';
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 4 * s;
  g.beginPath();
  g.arc(0, 0, 66 * s, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#b8b8c4';
  g.beginPath();
  g.arc(0, -6 * s, 68 * s, Math.PI * 1.02, Math.PI * 1.98);
  g.quadraticCurveTo(34 * s, -36 * s, 0, -32 * s);
  g.quadraticCurveTo(-34 * s, -36 * s, -68 * s, -8 * s);
  g.closePath();
  g.fill();
  // pink glasses
  g.strokeStyle = '#ff4d8d';
  g.lineWidth = 7 * s;
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(sx * 27 * s, 8 * s, 22 * s, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.beginPath();
  g.moveTo(-5 * s, 8 * s);
  g.lineTo(5 * s, 8 * s);
  g.stroke();
  g.fillStyle = '#222';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(sx * 27 * s, 9 * s, (mood === 'shock' ? 5 : 8) * s, 0, Math.PI * 2);
    g.fill();
  }
  // brows + mouth
  g.strokeStyle = '#555';
  g.lineWidth = 6 * s;
  g.lineCap = 'round';
  g.beginPath();
  if (mood === 'angry') {
    g.moveTo(-50 * s, -22 * s);
    g.lineTo(-10 * s, -8 * s);
    g.moveTo(50 * s, -22 * s);
    g.lineTo(10 * s, -8 * s);
  } else {
    g.moveTo(-48 * s, -26 * s);
    g.lineTo(-10 * s, -26 * s);
    g.moveTo(48 * s, -26 * s);
    g.lineTo(10 * s, -26 * s);
  }
  g.stroke();
  g.fillStyle = '#7a2a2a';
  g.strokeStyle = '#7a2a2a';
  if (mood === 'angry') {
    g.lineWidth = 6 * s;
    g.beginPath();
    g.moveTo(-22 * s, 50 * s);
    g.quadraticCurveTo(0, 36 * s, 22 * s, 50 * s);
    g.stroke();
  } else {
    g.beginPath();
    g.ellipse(0, 46 * s, 12 * s, 17 * s, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function bubble(g: Ctx, x: number, y: number, w: number, h: number, text: string, tailX: number, tailY: number, fill = '#ffffff'): void {
  g.fillStyle = fill;
  g.strokeStyle = '#222';
  g.lineWidth = 5;
  rr(g, x, y, w, h, 34);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(x + w * 0.35, y + h - 2);
  g.lineTo(tailX, tailY);
  g.lineTo(x + w * 0.55, y + h - 2);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = fill;
  g.fillRect(x + w * 0.35 + 3, y + h - 7, w * 0.2 - 6, 9); // hide the seam between bubble and tail
  g.fillStyle = '#222';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.min(46, h * 0.5)}px ${FONT}`;
  g.fillText(text, x + w / 2, y + h / 2 + 3);
}

function star(g: Ctx, x: number, y: number, r: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rad = i % 2 === 0 ? r : r * 0.55;
    g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = '#222';
  g.lineWidth = 4;
  g.stroke();
}

// ---------------------------------------------------------------- the four scenes

export function paintScene(g: Ctx, index: number): void {
  g.clearRect(0, 0, SCENE_W, SCENE_H);
  backdrop(g);
  if (index === 0) {
    // PSST: a kid leans over to read a neighbor's paper
    desk(g, 300, 400, 250);
    desk(g, 700, 400, 250);
    kid(g, 320, 290, 1.3, { shirt: '#ffb703', skin: '#f1c27d', hair: '#3a2a1a', look: 1, mouth: 'flat', tilt: 0.16 });
    kid(g, 700, 300, 1.3, { shirt: '#06d6a0', skin: '#c68642', hair: '#111111', look: 0.2, mouth: 'worry', sweat: true });
    paper(g, 700, 390, 190, -0.05);
    g.fillStyle = '#d6335a';
    g.font = `bold 40px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('B', 700, 400);
    bubble(g, 120, 70, 300, 96, 'psst... #4?', 300, 220);
  } else if (index === 1) {
    // BUSTED: the teacher points at a kid holding a phone
    desk(g, 270, 410, 260);
    teacher(g, 760, 250, 1.55, 'angry', -1);
    kid(g, 270, 320, 1.25, { shirt: '#3a86ff', skin: '#f1c27d', hair: '#ffd166', look: 1, mouth: 'o', sweat: true });
    // the phone in the kid's hand, glowing
    g.save();
    g.translate(370, 360);
    g.rotate(0.3);
    g.fillStyle = 'rgba(255,255,160,0.4)';
    g.beginPath();
    g.arc(0, 0, 64, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1d2433';
    rr(g, -26, -44, 52, 88, 10);
    g.fill();
    g.fillStyle = '#7fd3ff';
    rr(g, -20, -36, 40, 68, 6);
    g.fill();
    g.restore();
    star(g, 760, 70, 52, '#ff4d4d');
    g.fillStyle = '#fff';
    g.font = `bold 72px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', 760, 74);
  } else if (index === 2) {
    // FOOD FIGHT: a banana sails across the room toward the teacher
    teacher(g, 800, 270, 1.15, 'angry', 0);
    desk(g, 200, 430, 300);
    // lunchbox on the desk
    g.fillStyle = '#2ec4b6';
    rr(g, 110, 384, 190, 70, 14);
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(110, 410, 190, 14);
    g.save();
    g.translate(120, 386);
    g.rotate(-1.15);
    g.fillStyle = '#2ec4b6';
    rr(g, 0, -12, 150, 28, 10);
    g.fill();
    g.restore();
    // flight path + banana
    g.setLineDash([16, 14]);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(240, 340);
    g.quadraticCurveTo(480, 60, 690, 200);
    g.stroke();
    g.setLineDash([]);
    g.save();
    g.translate(560, 150);
    g.rotate(0.5);
    g.strokeStyle = '#ffd60a';
    g.lineWidth = 34;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(0, 40, 64, Math.PI * 1.15, Math.PI * 1.95);
    g.stroke();
    g.strokeStyle = '#4a3b1d';
    g.lineWidth = 12;
    g.beginPath();
    g.arc(0, 40, 64, Math.PI * 1.13, Math.PI * 1.17);
    g.stroke();
    g.restore();
    // whoosh lines
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 5;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(430 - i * 24, 130 + i * 28);
      g.lineTo(500 - i * 24, 120 + i * 28);
      g.stroke();
    }
  } else {
    // OOPS: the crib sheet flutters to the floor while the teacher turns around
    desk(g, 360, 410, 280);
    teacher(g, 800, 280, 1.2, 'shock', 0);
    kid(g, 360, 310, 1.3, { shirt: '#e63946', skin: '#f1c27d', hair: '#b5651d', look: 0.8, mouth: 'o', sweat: true });
    // hands up
    g.fillStyle = '#f1c27d';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.arc(360 + sx * 120, 330, 24, 0, Math.PI * 2);
      g.fill();
    }
    // the crib sheet, falling
    g.setLineDash([10, 12]);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(560, 150);
    g.bezierCurveTo(480, 200, 640, 260, 540, 330);
    g.stroke();
    g.setLineDash([]);
    g.save();
    g.translate(560, 380);
    g.rotate(-0.4);
    g.fillStyle = '#fff6c9';
    g.strokeStyle = '#d9c36a';
    g.lineWidth = 4;
    rr(g, -52, -66, 104, 132, 8);
    g.fill();
    g.stroke();
    g.fillStyle = '#7a5a12';
    g.font = `bold 15px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('CRIB SHEET', 0, -42);
    g.fillStyle = '#c9b46a';
    for (let i = 0; i < 5; i++) g.fillRect(-38, -24 + i * 16, 76 - (i % 2) * 18, 4);
    g.restore();
  }
}

// ---------------------------------------------------------------- stamps, captions, frame

export const STAMPS: ReadonlyArray<{ text: string; color: string; rot: number }> = [
  { text: 'PSST...', color: '#3a86ff', rot: -0.1 },
  { text: 'BUSTED!', color: '#d62839', rot: 0.1 },
  { text: 'BONK!', color: '#ff8c00', rot: -0.12 },
  { text: 'OOPS!', color: '#8338ec', rot: 0.08 },
];

export const CAPTIONS: readonly string[] = [
  'Copy off your neighbors...',
  '...but do NOT get caught!',
  'Throw a snack to distract her',
  'Hide the crib sheet. Quick!',
];

export function paintStamp(g: Ctx, index: number): void {
  const w = g.canvas.width;
  const h = g.canvas.height;
  const s = STAMPS[index];
  g.clearRect(0, 0, w, h);
  g.fillStyle = s.color;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 12;
  rr(g, 14, 14, w - 28, h - 28, 40);
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 5;
  rr(g, 34, 34, w - 68, h - 68, 28);
  g.stroke();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let px = 112;
  g.font = `bold ${px}px ${FONT}`;
  while (g.measureText(s.text).width > w - 90 && px > 40) {
    px -= 4;
    g.font = `bold ${px}px ${FONT}`;
  }
  g.fillText(s.text, w / 2, h / 2 + 6);
}

export function paintCaption(g: Ctx, index: number): void {
  const w = g.canvas.width;
  const h = g.canvas.height;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(20,20,40,0.82)';
  rr(g, 6, 6, w - 12, h - 12, 36);
  g.fill();
  g.fillStyle = '#ffe066';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let px = 58;
  g.font = `bold ${px}px ${FONT}`;
  while (g.measureText(CAPTIONS[index]).width > w - 80 && px > 30) {
    px -= 2;
    g.font = `bold ${px}px ${FONT}`;
  }
  g.fillText(CAPTIONS[index], w / 2, h / 2 + 3);
}

export const FRAME_W = 1152;
export const FRAME_H = 860;
export const WINDOW = { x: 64, y: 150, w: SCENE_W, h: SCENE_H };

/** the poster frame: logo header and a hole where the scenes show through */
export function paintFrame(g: Ctx): void {
  const w = FRAME_W;
  const h = FRAME_H;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#fff7d6';
  g.strokeStyle = '#6a4cff';
  g.lineWidth = 16;
  rr(g, 8, 8, w - 16, h - 16, 56);
  g.fill();
  g.stroke();
  // logo
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 92px ${FONT}`;
  g.lineWidth = 16;
  g.strokeStyle = '#ffffff';
  g.strokeText('POP QUIZ PANIC', w / 2, 68);
  g.fillStyle = '#d6335a';
  g.fillText('POP QUIZ PANIC', w / 2, 68);
  // sits fully above the window (which starts at y 150); it used to be cut off by it
  g.font = `bold 28px ${FONT}`;
  g.fillStyle = '#6a4cff';
  g.fillText('a hands-on cheating simulator  \u2022  play seated', w / 2, 126);
  // window hole with a border
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  g.fillRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
  g.restore();
  g.strokeStyle = '#222';
  g.lineWidth = 8;
  g.strokeRect(WINDOW.x - 4, WINDOW.y - 4, WINDOW.w + 8, WINDOW.h + 8);
}

export function paintPrompt(g: Ctx): void {
  const w = g.canvas.width;
  const h = g.canvas.height;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#06b57f';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 10;
  rr(g, 10, 10, w - 20, h - 20, 50);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 62px ${FONT}`;
  g.fillText('POINT + PINCH TO START', w / 2, h / 2 + 4);
}
