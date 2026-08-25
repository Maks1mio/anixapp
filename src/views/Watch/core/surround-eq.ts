/**
 * 10-полосный графический эквалайзер (peaking BiquadFilter) + preamp level.
 */

export type EqBandId =
  | 'eq60'
  | 'eq170'
  | 'eq310'
  | 'eq600'
  | 'eq1k'
  | 'eq3k'
  | 'eq6k'
  | 'eq12k'
  | 'eq14k'
  | 'eq16k';

export type EqBandMeta = {
  id: EqBandId;
  hz: number;
  /** Короткая подпись оси (60, 1k, …) */
  label: string;
};

export const EQ_BANDS: readonly EqBandMeta[] = [
  { id: 'eq60', hz: 60, label: '60' },
  { id: 'eq170', hz: 170, label: '170' },
  { id: 'eq310', hz: 310, label: '310' },
  { id: 'eq600', hz: 600, label: '600' },
  { id: 'eq1k', hz: 1000, label: '1k' },
  { id: 'eq3k', hz: 3000, label: '3k' },
  { id: 'eq6k', hz: 6000, label: '6k' },
  { id: 'eq12k', hz: 12000, label: '12k' },
  { id: 'eq14k', hz: 14000, label: '14k' },
  { id: 'eq16k', hz: 16000, label: '16k' },
] as const;

export type EqGains = Record<EqBandId, number>;

export const EQ_GAIN_MIN = -12;
export const EQ_GAIN_MAX = 12;
export const EQ_GAIN_STEP = 0.5;

/** Старые ключи полос → текущие (миграция настроек). */
const LEGACY_BAND: Record<string, EqBandId> = {
  eq60: 'eq60',
  eq150: 'eq170',
  eq170: 'eq170',
  eq400: 'eq310',
  eq310: 'eq310',
  eq600: 'eq600',
  eq1k: 'eq1k',
  eq2k4: 'eq3k',
  eq3k: 'eq3k',
  eq6k: 'eq6k',
  eq12k: 'eq12k',
  eq14k: 'eq14k',
  eq16k: 'eq16k',
};

export function defaultEqGains(): EqGains {
  return {
    eq60: 0,
    eq170: 0,
    eq310: 0,
    eq600: 0,
    eq1k: 0,
    eq3k: 0,
    eq6k: 0,
    eq12k: 0,
    eq14k: 0,
    eq16k: 0,
  };
}

export function clampEqGain(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(EQ_GAIN_MIN, Math.min(EQ_GAIN_MAX, Math.round(v * 2) / 2));
}

export function normalizeEqGains(raw: unknown): EqGains {
  const base = defaultEqGains();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  for (const [key, val] of Object.entries(src)) {
    const id = LEGACY_BAND[key];
    if (!id) continue;
    const n = Number(val);
    if (Number.isFinite(n)) base[id] = clampEqGain(n);
  }
  return base;
}

/** Общее усиление (preamp), дБ. */
export function normalizeEqLevel(raw: unknown): number {
  return clampEqGain(Number(raw));
}

export function eqLevelToLinear(db: number): number {
  return Math.pow(10, clampEqGain(db) / 20);
}

export function formatEqGain(db: number): string {
  const v = clampEqGain(db);
  if (v > 0) return `+${v.toFixed(1)} дБ`;
  if (v < 0) return `${v.toFixed(1)} дБ`;
  return '0 дБ';
}

/** Компактный бейдж (0.0 dB). */
export function formatEqGainBadge(db: number): string {
  const v = clampEqGain(db);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)} dB`;
}
