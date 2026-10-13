/**
 * Anime4K-цепочки как в AnixPlayer (mpv GLSL S/M/L), на примитивах anime4k-webgpu.
 *
 * AnixPlayer Quality: FAST=S, BALANCED=M, HIGH=L.
 * В webgpu нет S/L Soft/Denoise — берём ближайшие M / VL / UL.
 */
import {
  ClampHighlights,
  Downscale,
  CNNM,
  CNNSoftM,
  CNNSoftVL,
  CNNVL,
  CNNUL,
  CNNx2M,
  CNNx2VL,
  CNNx2UL,
  DenoiseCNNx2VL,
} from 'anime4k-webgpu';
import type { Anime4KPipeline } from 'anime4k-webgpu';

export type AnixPlayerType =
  | 'sharp'
  | 'balance'
  | 'clean'
  | 'sharpPlus'
  | 'balancePlus'
  | 'cleanPlus';

export type AnixPlayerIntensity = 'easy' | 'optimal' | 'max';

type NetSize = 'M' | 'VL' | 'UL';

type PipeCtor = new (opts: {
  device: GPUDevice;
  inputTexture: GPUTexture;
}) => Anime4KPipeline;

const TYPE_ORD: Record<AnixPlayerType, number> = {
  sharp: 1,
  balance: 2,
  clean: 3,
  sharpPlus: 4,
  balancePlus: 5,
  cleanPlus: 6,
};

const INT_ORD: Record<AnixPlayerIntensity, number> = {
  easy: 0,
  optimal: 1,
  max: 2,
};

const TYPE_BY_ORD: AnixPlayerType[] = [
  'sharp',
  'balance',
  'clean',
  'sharpPlus',
  'balancePlus',
  'cleanPlus',
];

const INT_BY_ORD: AnixPlayerIntensity[] = ['easy', 'optimal', 'max'];

/** Кастомные режимы AnixPlayer: 110–162. Старые ModeA–CA остаются 14–19. */
export const ANIX_PLAYER_MODE_BASE = 100;

export function isAnixPlayerMode(mode: number): boolean {
  return mode >= ANIX_PLAYER_MODE_BASE && mode < ANIX_PLAYER_MODE_BASE + 70;
}

export function encodeAnixPlayerMode(
  type: AnixPlayerType,
  intensity: AnixPlayerIntensity,
): number {
  return ANIX_PLAYER_MODE_BASE + TYPE_ORD[type] * 10 + INT_ORD[intensity];
}

export function decodeAnixPlayerMode(
  mode: number,
): { type: AnixPlayerType; intensity: AnixPlayerIntensity } | null {
  if (!isAnixPlayerMode(mode)) return null;
  const code = mode - ANIX_PLAYER_MODE_BASE;
  const typeOrd = Math.floor(code / 10);
  const intOrd = code % 10;
  const type = TYPE_BY_ORD[typeOrd - 1];
  const intensity = INT_BY_ORD[intOrd];
  if (!type || !intensity) return null;
  return { type, intensity };
}

function netSize(intensity: AnixPlayerIntensity): NetSize {
  if (intensity === 'easy') return 'M';
  if (intensity === 'max') return 'UL';
  return 'VL';
}

function restoreCtor(size: NetSize, soft: boolean): PipeCtor {
  if (soft) return size === 'M' ? CNNSoftM : CNNSoftVL;
  if (size === 'M') return CNNM;
  if (size === 'UL') return CNNUL;
  return CNNVL;
}

function upscaleCtor(size: NetSize): PipeCtor {
  if (size === 'M') return CNNx2M;
  if (size === 'UL') return CNNx2UL;
  return CNNx2VL;
}

function needsUpscale(
  targetW: number,
  targetH: number,
  curW: number,
  curH: number,
): boolean {
  return targetW > 1.2 * curW && targetH > 1.2 * curH;
}

/**
 * Цепочки как Anime4KManager.applyEnabledAnime4KMode + AutoDownscalePre_x2.
 * Upscale-стадии — только если OUTPUT > 1.2× текущего (как //!WHEN в GLSL).
 */
export function buildAnixPlayerPipeline(opts: {
  device: GPUDevice;
  inputTexture: GPUTexture;
  nativeDimensions: { width: number; height: number };
  targetDimensions: { width: number; height: number };
  type: AnixPlayerType;
  intensity: AnixPlayerIntensity;
}): Anime4KPipeline {
  const { device, inputTexture, nativeDimensions: native, targetDimensions: target, type, intensity } =
    opts;
  const size = netSize(intensity);
  const Upscale = upscaleCtor(size);
  const SoftRestore = restoreCtor(size, true);
  const HardRestore = restoreCtor(size, false);

  const pipelines: Anime4KPipeline[] = [];
  let tex = inputTexture;
  let curW = native.width;
  let curH = native.height;

  const push = (p: Anime4KPipeline) => {
    pipelines.push(p);
    tex = p.getOutputTexture();
  };

  push(new ClampHighlights({ device, inputTexture: tex }));

  const firstUpscale = () => {
    if (!needsUpscale(target.width, target.height, curW, curH)) return;
    push(new Upscale({ device, inputTexture: tex }));
    curW *= 2;
    curH *= 2;
  };

  const autoDownscale = () => {
    // Как ModeA в anime4k-webgpu / AutoDownscalePre_x2: между 1.2× и 2× NATIVE → OUTPUT;
    // между 2.4× и 4× → OUTPUT/2 перед вторым ×2.
    if (
      target.width > 1.2 * native.width &&
      target.height > 1.2 * native.height &&
      target.width < 2 * native.width &&
      target.height < 2 * native.height
    ) {
      push(new Downscale({ device, inputTexture: tex, targetDimensions: target }));
      curW = target.width;
      curH = target.height;
    } else if (
      target.width > 2.4 * native.width &&
      target.height > 2.4 * native.height &&
      target.width < 4 * native.width &&
      target.height < 4 * native.height
    ) {
      const mid = {
        width: Math.ceil(target.width / 2),
        height: Math.ceil(target.height / 2),
      };
      push(new Downscale({ device, inputTexture: tex, targetDimensions: mid }));
      curW = mid.width;
      curH = mid.height;
    }
  };

  const secondUpscale = () => {
    if (!needsUpscale(target.width, target.height, curW, curH)) return;
    push(new Upscale({ device, inputTexture: tex }));
    curW *= 2;
    curH *= 2;
  };

  switch (type) {
    case 'sharp':
      // A: Restore → Upscale → AutoDown → Upscale
      push(new HardRestore({ device, inputTexture: tex }));
      firstUpscale();
      autoDownscale();
      secondUpscale();
      break;
    case 'balance':
      // B: Soft → Upscale → AutoDown → Upscale
      push(new SoftRestore({ device, inputTexture: tex }));
      firstUpscale();
      autoDownscale();
      secondUpscale();
      break;
    case 'clean':
      // C: Denoise×2 → AutoDown → Upscale
      if (needsUpscale(target.width, target.height, curW, curH)) {
        push(new DenoiseCNNx2VL({ device, inputTexture: tex }));
        curW *= 2;
        curH *= 2;
      }
      autoDownscale();
      secondUpscale();
      break;
    case 'sharpPlus':
      // A+: Restore → Upscale → AutoDown → Restore → Upscale
      push(new HardRestore({ device, inputTexture: tex }));
      firstUpscale();
      autoDownscale();
      push(new HardRestore({ device, inputTexture: tex }));
      secondUpscale();
      break;
    case 'balancePlus':
      // B+: Soft → Upscale → AutoDown → Soft → Upscale
      push(new SoftRestore({ device, inputTexture: tex }));
      firstUpscale();
      autoDownscale();
      push(new SoftRestore({ device, inputTexture: tex }));
      secondUpscale();
      break;
    case 'cleanPlus':
      // C+: Denoise×2 → AutoDown → Restore → Upscale
      if (needsUpscale(target.width, target.height, curW, curH)) {
        push(new DenoiseCNNx2VL({ device, inputTexture: tex }));
        curW *= 2;
        curH *= 2;
      }
      autoDownscale();
      push(new HardRestore({ device, inputTexture: tex }));
      secondUpscale();
      break;
  }

  const outputTexture = tex;
  return {
    updateParam() {
      throw new Error('AnixPlayer preset has no param');
    },
    pass(encoder: GPUCommandEncoder) {
      for (const p of pipelines) p.pass(encoder);
    },
    getOutputTexture() {
      return outputTexture;
    },
  };
}
