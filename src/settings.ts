/**
 * Player settings (pure logic, no three.js): sound, readability, comfort and difficulty helpers. Saved to
 * localStorage through guarded calls, so a blocked or full storage never breaks the game.
 */
export interface Settings {
  /** 0 off, 1 low, 2 medium, 3 high */
  volume: number;
  music: boolean;
  /** bigger pop-up text (round banners, the Training Day coach card) */
  popupLarge: boolean;
  /** black buttons with bright yellow outlines and text */
  contrast: boolean;
  /** slower teacher, smaller vision cone and 50% more time */
  relaxed: boolean;
  /** no bouncy pop-ins or slow zooms */
  calm: boolean;
  /** 0 off, 1 normal, 2 strong: how much a thrown snack bends toward the nearest front corner */
  assist: number;
  /** 0..2: how high your eyes sit above the desk. Your head can never drop below this (ducking does nothing) */
  height: number;
}

export const DEFAULTS: Readonly<Settings> = {
  volume: 2,
  music: true,
  popupLarge: false,
  contrast: false,
  relaxed: false,
  calm: false,
  assist: 1,
  height: 0,
};

export const SETTINGS: Settings = { ...DEFAULTS };

export const VOLUME_GAIN = [0, 0.2, 0.5, 0.9] as const;
export const VOLUME_NAMES = ['OFF', 'LOW', 'MEDIUM', 'HIGH'] as const;
export const ASSIST_NAMES = ['OFF', 'NORMAL', 'STRONG'] as const;
export const HEIGHT_NAMES = ['NORMAL', 'HIGH', 'HIGHER'] as const;
const HEIGHT_EYE_Y = [1.3, 1.4, 1.5] as const;
const ASSIST_MULT = [0, 1, 1.6] as const;

const KEY = 'popquiz.settings.v1';
const listeners: Array<() => void> = [];

export function onSettingsChange(fn: () => void): void {
  listeners.push(fn);
}

function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

const clampInt = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** read saved settings (anything missing or broken falls back to the default) */
export function loadSettings(raw?: string | null): void {
  let text = raw;
  if (text === undefined) {
    try {
      text = store()?.getItem(KEY) ?? null;
    } catch {
      text = null;
    }
  }
  let o: Record<string, unknown> = {};
  try {
    if (text) o = JSON.parse(text) as Record<string, unknown>;
  } catch {
    o = {};
  }
  SETTINGS.volume = clampInt(o.volume, 0, 3, DEFAULTS.volume);
  SETTINGS.music = bool(o.music, DEFAULTS.music);
  SETTINGS.popupLarge = bool(o.popupLarge, DEFAULTS.popupLarge);
  SETTINGS.contrast = bool(o.contrast, DEFAULTS.contrast);
  SETTINGS.relaxed = bool(o.relaxed, DEFAULTS.relaxed);
  SETTINGS.calm = bool(o.calm, DEFAULTS.calm);
  SETTINGS.assist = clampInt(o.assist, 0, 2, DEFAULTS.assist);
  SETTINGS.height = clampInt(o.height, 0, 2, DEFAULTS.height);
}

export function saveSettings(): void {
  try {
    store()?.setItem(KEY, JSON.stringify(SETTINGS));
  } catch {
    /* storage blocked or full: the settings just last for this visit */
  }
}

/** apply a change, save it and tell everyone who cares */
export function changeSettings(patch: Partial<Settings>): void {
  Object.assign(SETTINGS, patch);
  saveSettings();
  for (const fn of listeners) fn();
}

export const popupScale = (): number => (SETTINGS.popupLarge ? 1.3 : 1);
export const assistFactor = (): number => ASSIST_MULT[SETTINGS.assist] ?? 1;
/** extra exam time in relaxed mode */
export const timeFactor = (): number => (SETTINGS.relaxed ? 1.5 : 1);

/** eye height above the floor of the classroom (desk top is 0.775), from the seat-height setting */
export const eyeHeight = (): number => HEIGHT_EYE_Y[SETTINGS.height] ?? 1.3;
