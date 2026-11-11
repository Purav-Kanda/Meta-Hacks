import { SETTINGS, VOLUME_GAIN, onSettingsChange } from './settings.js';

const MUSIC_VOLUME = 0.22;
const STEP_SECONDS = 60 / 112 / 2; // 112 BPM, eighth notes
const CHORD_ROOTS = [0, -3, -7, -5]; // C, Am, F, G (semitones from C)
const CHORD_TONES = [[0, 4, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7]];
const BASS_STEPS = [0, 3, 6, 8, 11, 14];
const MELODY: number[][] = [
  [0, -1, 4, -1, 7, -1, 4, -1, 9, -1, 7, -1, 4, -1, 2, -1],
  [0, -1, 4, -1, 9, -1, 7, -1, 4, -1, 0, -1, 2, -1, -1, -1],
  [5, -1, 9, -1, 12, -1, 9, -1, 7, -1, 5, -1, 4, -1, -1, -1],
  [7, -1, 11, -1, 14, -1, 11, -1, 9, -1, 7, -1, 2, -1, 4, -1],
];

/** Procedural sound effects (WebAudio, no files). Browsers only allow audio after a user gesture, so the context is made lazily. */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  /** call from a user gesture or XR session start */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        // when the browser wakes the audio again, restart the music clock so it doesn't try to catch up
        this.ctx.onstatechange = () => {
          if (this.ctx && this.ctx.state === 'running') this.musicNext = this.ctx.currentTime + 0.1;
        };
        this.master = this.ctx.createGain();
        this.master.gain.value = VOLUME_GAIN[SETTINGS.volume];
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    } catch {
      /* no audio, the game still works */
    }
  }

  private lastNudge = 0;

  /** call every frame: if the browser paused our audio (headset menu, tab switch, no gesture yet), try to wake it about once a second */
  keepAlive(nowMs: number): void {
    const c = this.ctx;
    if (!c || c.state === 'running' || c.state === 'closed' || nowMs - this.lastNudge < 1000) return;
    this.lastNudge = nowMs;
    void c.resume().catch(() => undefined);
  }

  /** the volume setting changed */
  applyVolume(): void {
    if (this.master) this.master.gain.value = VOLUME_GAIN[SETTINGS.volume];
  }

  private ready(): boolean {
    return !this.muted && !!this.ctx && !!this.master && this.ctx.state === 'running';
  }

  /** a tone that can slide from f0 to f1 */
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, dest?: AudioNode): void {
    if (!this.ready()) return;
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** filtered noise burst, filter sweeps from q0 to q1 Hz */
  private noise(kind: BiquadFilterType, q0: number, q1: number, dur: number, vol: number, delay = 0, dest?: AudioNode): void {
    if (!this.ready()) return;
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = kind;
    f.frequency.setValueAtTime(q0, t);
    f.frequency.exponentialRampToValueAtTime(q1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest ?? this.master!);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  /** a held note with a slow fade in and out (the tone() envelope dies away at once); trem > 0 wobbles its volume at that many Hz */
  private swell(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, trem = 0): void {
    if (!this.ready()) return;
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.3, dur * 0.3));
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
    if (trem > 0) {
      const l = c.createOscillator();
      const lg = c.createGain();
      lg.gain.value = vol * 0.6;
      l.frequency.value = trem;
      l.connect(lg).connect(g.gain);
      l.start(t);
      l.stop(t + dur + 0.02);
    }
  }

  // ---- background music: a friendly funky loop (C - Am - F - G), made of plucks, bass, kick and hats ----
  private musicGain: GainNode | null = null;
  private musicWanted = false;
  private musicTimer = 0;
  private musicNext = 0;
  private musicStep = 0;
  private musicResume = false;

  /** true = music should be playing (fades in), false = silent (fades out, pauses in place) */
  music(on: boolean): void {
    if (on === this.musicWanted && (!on || this.musicGain)) return;
    this.musicWanted = on;
    if (!this.ctx || !this.master) return;
    if (!this.musicGain) {
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
    }
    const c = this.ctx;
    const g = this.musicGain.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setValueAtTime(g.value, c.currentTime);
    g.linearRampToValueAtTime(on ? MUSIC_VOLUME : 0, c.currentTime + (on ? 0.6 : 0.15));
    if (on) {
      this.musicNext = c.currentTime + 0.1;
      if (!this.musicTimer) this.musicTimer = window.setInterval(() => this.musicTick(), 50);
    }
  }

  private musicTick(): void {
    const c = this.ctx;
    if (!c || !this.musicGain || !this.musicWanted || c.state !== 'running') return;
    while (this.musicNext < c.currentTime + 0.25) {
      this.musicPlayStep(this.musicStep, this.musicNext - c.currentTime);
      this.musicStep = (this.musicStep + 1) % 64;
      this.musicNext += STEP_SECONDS;
    }
  }

  private musicPlayStep(step: number, delay: number): void {
    const d = this.musicGain!;
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const root = CHORD_ROOTS[bar];
    const hz = (semi: number, base: number) => base * Math.pow(2, semi / 12);
    if (i === 0 || i === 8 || i === 11) this.tone('sine', 130, 45, 0.16, 0.9, delay, d); // kick
    if (i % 2 === 1) this.noise('highpass', 7000, 7000, 0.04, 0.25, delay, d); // hat
    if (i === 4 || i === 12) this.noise('bandpass', 1800, 1800, 0.09, 0.35, delay, d); // snare-ish clap
    if (BASS_STEPS.includes(i)) this.tone('triangle', hz(root - 12, 130.81), hz(root - 12, 130.81), 0.2, 0.8, delay, d);
    if (i === 2 || i === 6 || i === 10 || i === 14) {
      for (const t of CHORD_TONES[bar]) this.tone('square', hz(root + t, 261.63), hz(root + t, 261.63), 0.09, 0.1, delay, d); // short stabs
    }
    const m = MELODY[bar][i];
    if (m >= 0) this.tone('triangle', hz(m, 261.63 * 2), hz(m, 261.63 * 2), 0.28, 0.45, delay, d); // plucky lead
  }

  click(): void {
    this.tone('square', 760, 420, 0.05, 0.12);
  }
  pop(): void {
    this.tone('sine', 520, 980, 0.09, 0.25);
  }
  whoosh(): void {
    this.noise('bandpass', 400, 2200, 0.3, 0.5);
  }
  bonk(): void {
    this.tone('sine', 240, 70, 0.22, 0.6);
    this.noise('lowpass', 900, 150, 0.12, 0.4);
  }
  splat(): void {
    this.noise('lowpass', 1800, 200, 0.2, 0.5);
    this.tone('sine', 160, 60, 0.15, 0.3);
  }
  ow(): void {
    this.tone('sawtooth', 420, 180, 0.3, 0.3);
    this.bonk();
  }
  ding(): void {
    this.tone('sine', 1320, 1320, 0.35, 0.25);
    this.tone('sine', 1760, 1760, 0.35, 0.18, 0.12);
  }
  buzzer(): void {
    this.tone('sawtooth', 120, 110, 0.18, 0.4);
    this.tone('sawtooth', 120, 100, 0.25, 0.4, 0.24);
  }
  screech(): void {
    this.tone('sawtooth', 1000, 380, 0.45, 0.22);
    this.noise('highpass', 2500, 1200, 0.4, 0.25);
  }
  /** the busted shout: a loud, silly "HEY!" honk (softer in calm mode) */
  hey(calm = false): void {
    const v = calm ? 0.25 : 0.5;
    this.tone('sawtooth', 420, 150, 0.42, v);
    this.tone('square', 210, 85, 0.4, v * 0.6, 0.02);
    if (!calm) {
      this.noise('bandpass', 1500, 600, 0.18, 0.35);
      this.tone('sine', 300, 700, 0.12, 0.3, 0.45); // little squeak after
    }
  }
  /**
   * the busted scare music: a low drone and a rising screech while she winds up, a huge hit when she lunges,
   * then shrieking strings and stabs while she shakes in your face. Calm Motion gets a short, quiet version.
   */
  scare(calm = false): void {
    const v = calm ? 0.35 : 1;
    const total = calm ? 1.0 : 1.9;
    this.swell('sawtooth', 55, 42, total, 0.2 * v, 0, 5); // dread drone
    this.swell('sine', 110, 82, total, 0.15 * v, 0);
    this.noise('highpass', 800, 5200, calm ? 0.2 : 0.35, 0.3 * v, 0); // wind-up riser
    this.tone('sine', 95, 32, 0.6, 0.6 * v, calm ? 0.1 : 0.3); // the hit
    this.noise('lowpass', 1600, 90, 0.45, 0.35 * v, calm ? 0.1 : 0.3);
    // a clashing cluster of high strings (minor seconds) that slides up into the lunge and shivers
    for (const f of [1318, 1397, 1865]) this.swell('sawtooth', f * 0.82, f, total - 0.25, 0.07 * v, 0.25, 13);
    if (!calm) {
      // short shrieking stabs while she shakes at you
      for (let i = 0; i < 9; i++) this.tone('sawtooth', i % 2 ? 1568 : 1480, i % 2 ? 1500 : 1400, 0.08, 0.16, 0.65 + i * 0.09);
    }
  }
  huh(): void {
    this.tone('triangle', 400, 400, 0.1, 0.3);
    this.tone('triangle', 620, 620, 0.16, 0.3, 0.11);
  }
  /** paper rustle: a short burst of filtered noise */
  rustle(): void {
    this.noise('bandpass', 2200, 3800, 0.16, 0.22);
    this.noise('bandpass', 3000, 2000, 0.12, 0.18, 0.11);
  }

  giggle(): void {
    [0, 1, 2, 3].forEach((i) => this.tone('triangle', 900 + (i % 2) * 320, 1250 + (i % 2) * 200, 0.07, 0.18, i * 0.085));
  }
  /** a kid refuses: two grumpy low notes */
  nope(): void {
    this.tone('sawtooth', 220, 180, 0.14, 0.2);
    this.tone('sawtooth', 180, 130, 0.2, 0.2, 0.16);
  }
  oooh(): void {
    this.tone('sine', 300, 460, 0.45, 0.2);
    this.tone('sine', 380, 300, 0.4, 0.15, 0.4);
  }
  bell(): void {
    this.tone('sine', 1568, 1568, 0.9, 0.3);
    this.tone('sine', 2349, 2349, 0.6, 0.15);
  }
  /** a new sticker: sparkly arpeggio, after the pass/fail jingle */
  sticker(): void {
    [1047, 1319, 1568, 2093].forEach((f, i) => this.tone('sine', f, f, 0.18, 0.25, 1.2 + i * 0.09));
  }
  pass(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.35, i * 0.12));
  }
  fail(): void {
    [392, 370, 349, 311].forEach((f, i) => this.tone('sawtooth', f, f * 0.96, i === 3 ? 0.6 : 0.25, 0.25, i * 0.25));
  }
}

export const sfx = new Sfx();
onSettingsChange(() => sfx.applyVolume());
