/**
 * Anime4K пресеты как в AnixPlayer (тип × нагрузка), маппинг на anime4k-webgpu.
 *
 * APK использует mpv + GLSL (Restore_CNN_{S,M,L} / Soft / Denoise).
 * В Electron те же ярлыки ведут на ModeA/B/C/AA/BB; S/M/L нет у Mode-пресетов —
 * «Максимум» переключает на двойной пайплайн (AA/BB/CA).
 */

export type Anime4kType = 'off' | 'sharp' | 'balance' | 'clean' | 'sharpPlus' | 'balancePlus';
export type Anime4kIntensity = 'easy' | 'optimal' | 'max';

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

export const ANIME4K_TYPES: Anime4kTypeOption[] = [
  { id: 'off', label: 'Выкл', hint: 'Без фильтра' },
  { id: 'sharp', label: 'Чёткость', hint: 'Restore' },
  { id: 'balance', label: 'Баланс', hint: 'Restore Soft', recommended: true },
  { id: 'clean', label: 'Очистка', hint: 'Denoise' },
  { id: 'sharpPlus', label: 'Чёткость+', hint: 'Двойной Restore' },
  { id: 'balancePlus', label: 'Баланс+', hint: 'Двойной Soft' },
];

export const ANIME4K_INTENSITIES: Anime4kIntensityOption[] = [
  { id: 'easy', label: 'Легко' },
  { id: 'optimal', label: 'Оптимально' },
  { id: 'max', label: 'Максимум' },
];

export const DEFAULT_ANIME4K_PRESET: Anime4kPreset = {
  type: 'off',
  intensity: 'optimal',
};

const BASE_MODE: Record<Exclude<Anime4kType, 'off'>, number> = {
  sharp: 14,       // ModeA
  balance: 15,     // ModeB
  clean: 16,       // ModeC
  sharpPlus: 17,   // ModeAA
  balancePlus: 18, // ModeBB
};

const MAX_MODE: Record<Exclude<Anime4kType, 'off'>, number> = {
  sharp: 17,       // ModeAA
  balance: 18,     // ModeBB
  clean: 19,       // ModeCA
  sharpPlus: 17,
  balancePlus: 18,
};

export function mapAnime4kPreset(preset: Anime4kPreset): { enabled: boolean; mode: number } {
  if (preset.type === 'off') return { enabled: false, mode: 15 };
  const mode = preset.intensity === 'max' ? MAX_MODE[preset.type] : BASE_MODE[preset.type];
  return { enabled: true, mode };
}

export function presetFromLegacy(upscaleEnabled: boolean, upscaleMode: number): Anime4kPreset {
  if (!upscaleEnabled) return { ...DEFAULT_ANIME4K_PRESET };
  const intensity: Anime4kIntensity = upscaleMode === 17 || upscaleMode === 18 || upscaleMode === 19
    ? 'max'
    : 'optimal';
  switch (upscaleMode) {
    case 14: return { type: 'sharp', intensity };
    case 16: return { type: 'clean', intensity };
    case 17: return { type: 'sharpPlus', intensity: 'optimal' };
    case 18: return { type: 'balancePlus', intensity: 'optimal' };
    case 19: return { type: 'clean', intensity: 'max' };
    case 15:
    default:
      return { type: 'balance', intensity: intensity === 'max' ? 'max' : 'optimal' };
  }
}

export function isAnime4kType(value: unknown): value is Anime4kType {
  return ANIME4K_TYPES.some((t) => t.id === value);
}

export function isAnime4kIntensity(value: unknown): value is Anime4kIntensity {
  return ANIME4K_INTENSITIES.some((t) => t.id === value);
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
