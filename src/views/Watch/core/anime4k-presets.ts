/**
 * Anime4K пресеты как в AnixPlayer (тип × нагрузка S/M/L).
 *
 * APK: Mode A/B/C/A+/B+/C+ × Quality FAST(S)/BALANCED(M)/HIGH(L).
 * PC: те же цепочки на anime4k-webgpu (M/VL/UL — ближайшие к S/M/L).
 */

import {
  encodeAnixPlayerMode,
  decodeAnixPlayerMode,
  isAnixPlayerMode,
  type AnixPlayerType,
} from '../../../utils/anime4k-anixplayer';

export type Anime4kType = 'off' | AnixPlayerType;
export type Anime4kIntensity = 'easy' | 'optimal' | 'max';
/** Целевая высота буфера апскейла; auto = под размер окна. */
export type Anime4kTargetRes = 'auto' | '1080' | '1440' | '2160';

export interface Anime4kPreset {
  type: Anime4kType;
  intensity: Anime4kIntensity;
}

export interface Anime4kTypeOption {
  id: Anime4kType;
  label: string;
  hint: string;
  recommended?: boolean;
}

export interface Anime4kIntensityOption {
  id: Anime4kIntensity;
  label: string;
}

export interface Anime4kTargetResOption {
  id: Anime4kTargetRes;
  label: string;
  /** Целевая высота в пикселях; null = авто под контейнер */
  height: number | null;
}

export const ANIME4K_TYPES: Anime4kTypeOption[] = [
  { id: 'off', label: 'Выкл', hint: 'Без фильтра' },
  { id: 'sharp', label: 'Чёткость', hint: 'Restore' },
  { id: 'balance', label: 'Баланс', hint: 'Restore Soft', recommended: true },
  { id: 'clean', label: 'Очистка', hint: 'Denoise' },
  { id: 'sharpPlus', label: 'Чёткость+', hint: 'Двойной Restore' },
  { id: 'balancePlus', label: 'Баланс+', hint: 'Двойной Soft' },
  { id: 'cleanPlus', label: 'Очистка+', hint: 'Denoise + Restore' },
];

export const ANIME4K_INTENSITIES: Anime4kIntensityOption[] = [
  { id: 'easy', label: 'Легко' },       // S ≈ M в webgpu
  { id: 'optimal', label: 'Оптимально' }, // M ≈ VL
  { id: 'max', label: 'Максимум' },     // L ≈ UL
];

export const ANIME4K_TARGET_RES: Anime4kTargetResOption[] = [
  { id: 'auto', label: 'Авто', height: null },
  { id: '1080', label: '1080p', height: 1080 },
  { id: '1440', label: '2K', height: 1440 },
  { id: '2160', label: '4K', height: 2160 },
];

/** Подпись пункта в меню. */
export function anime4kTargetResMenuLabel(id: Anime4kTargetRes): string {
  if (id === 'auto') return 'Авто · под окно';
  return ANIME4K_TARGET_RES.find((t) => t.id === id)?.label ?? '1080p';
}

export const DEFAULT_ANIME4K_PRESET: Anime4kPreset = {
  type: 'off',
  intensity: 'optimal',
};

export const DEFAULT_ANIME4K_TARGET_RES: Anime4kTargetRes = '1080';

/** Legacy ModeA–CA → базовый тип (без учёта S/M/L). */
const LEGACY_MODE_TYPE: Record<number, AnixPlayerType> = {
  14: 'sharp',
  15: 'balance',
  16: 'clean',
  17: 'sharpPlus',
  18: 'balancePlus',
  19: 'cleanPlus',
};

export function mapAnime4kPreset(preset: Anime4kPreset): { enabled: boolean; mode: number } {
  if (preset.type === 'off') return { enabled: false, mode: encodeAnixPlayerMode('balance', 'optimal') };
  return {
    enabled: true,
    mode: encodeAnixPlayerMode(preset.type, preset.intensity),
  };
}

export function presetFromLegacy(upscaleEnabled: boolean, upscaleMode: number): Anime4kPreset {
  if (!upscaleEnabled) return { ...DEFAULT_ANIME4K_PRESET };

  const decoded = decodeAnixPlayerMode(upscaleMode);
  if (decoded) return decoded;

  const type = LEGACY_MODE_TYPE[upscaleMode];
  if (type) {
    return { type, intensity: 'optimal' };
  }

  return { type: 'balance', intensity: 'optimal' };
}

export function isAnime4kType(value: unknown): value is Anime4kType {
  return ANIME4K_TYPES.some((t) => t.id === value);
}

export function isAnime4kIntensity(value: unknown): value is Anime4kIntensity {
  return ANIME4K_INTENSITIES.some((t) => t.id === value);
}

export function isAnime4kTargetRes(value: unknown): value is Anime4kTargetRes {
  return ANIME4K_TARGET_RES.some((t) => t.id === value);
}

export function normalizeAnime4kTargetRes(value: unknown): Anime4kTargetRes {
  // Старый «8K» (4320) реально упирался в 4K-буфер — мигрируем.
  if (value === '4320' || value === 4320) return '2160';
  return isAnime4kTargetRes(value) ? value : DEFAULT_ANIME4K_TARGET_RES;
}

export function anime4kTargetHeight(target: Anime4kTargetRes): number | null {
  return ANIME4K_TARGET_RES.find((t) => t.id === target)?.height ?? null;
}

export function normalizeAnime4kPreset(
  raw: { upscaleType?: unknown; upscaleIntensity?: unknown; upscaleEnabled?: boolean; upscaleMode?: number },
): Anime4kPreset {
  if (isAnime4kType(raw.upscaleType)) {
    return {
      type: raw.upscaleType,
      intensity: isAnime4kIntensity(raw.upscaleIntensity) ? raw.upscaleIntensity : 'optimal',
    };
  }
  return presetFromLegacy(raw.upscaleEnabled === true, typeof raw.upscaleMode === 'number' ? raw.upscaleMode : 15);
}

export { isAnixPlayerMode, decodeAnixPlayerMode };
