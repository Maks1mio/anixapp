export const MONTAGE_TOTAL_SEC = 30;
export const MONTAGE_CLIP_COUNT = 5;
export const MONTAGE_CROSSFADE_SEC = 0.75;
/** Два видео-буфера (ping-pong) вместо отдельного элемента на каждый момент */
export const MONTAGE_BUFFER_COUNT = 2;
export const MONTAGE_PREPARE_AHEAD_SEC = 4;

export interface MontageBeat {
  seekSec: number;
  /** Сколько секунд играть с этой позиции (с запасом под кроссфейд) */
  playDurationSec: number;
}

export interface RandomMontageOptions {
  count?: number;
  minClipSec?: number;
  maxClipSec?: number;
}

export function buildMontageBeats(
  episodeDuration: number,
  options: RandomMontageOptions = {},
): MontageBeat[] {
  const count = Math.max(1, Math.min(15, Math.floor(options.count ?? MONTAGE_CLIP_COUNT)));
  const defaultClip = MONTAGE_TOTAL_SEC / MONTAGE_CLIP_COUNT;
  const minClip = Math.max(0.25, options.minClipSec ?? defaultClip);
  const maxClip = Math.max(minClip, options.maxClipSec ?? defaultClip + MONTAGE_CROSSFADE_SEC * 0.5);

  const minStart = Math.min(75, Math.max(15, episodeDuration * 0.06));
  const maxStart = Math.max(
    minStart + maxClip,
    episodeDuration - Math.min(100, episodeDuration * 0.1) - maxClip,
  );

  const usedBuckets = new Set<number>();
  const beats: MontageBeat[] = [];

  for (let i = 0; i < count; i++) {
    let seekSec = minStart;
    let guard = 0;
    while (guard++ < 32) {
      const candidate = maxStart <= minStart
        ? minStart
        : minStart + Math.random() * (maxStart - minStart);
      const bucket = Math.floor(candidate / 14);
      if (!usedBuckets.has(bucket) || guard > 24) {
        usedBuckets.add(bucket);
        seekSec = Math.floor(candidate);
        break;
      }
    }
    const playDurationSec = minClip + Math.random() * (maxClip - minClip);
    beats.push({ seekSec, playDurationSec });
  }

  return beats;
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Opacity per pool slot at elapsed wall-clock seconds. */
export function montageOpacitiesAt(elapsed: number): number[] {
  const count = MONTAGE_CLIP_COUNT;
  const slot = MONTAGE_TOTAL_SEC / count;
  const fade = MONTAGE_CROSSFADE_SEC;
  const opacities = Array(count).fill(0);

  for (let i = 0; i < count; i++) {
    const enterStart = i === 0 ? 0 : i * slot - fade;
    const exitStart = (i + 1) * slot - fade;
    const exitEnd = (i + 1) * slot;

    if (elapsed < enterStart) continue;
    if (i < count - 1 && elapsed > exitEnd) continue;

    let o = 1;

    if (i > 0 && elapsed < i * slot) {
      o = smoothstep((elapsed - enterStart) / fade);
    }

    if (i < count - 1 && elapsed > exitStart) {
      o = Math.min(o, 1 - smoothstep((elapsed - exitStart) / fade));
    }

    opacities[i] = o;
  }

  return opacities;
}

/** Готовим beat N, когда предыдущий уже на экране (или сразу для 0). */
export function beatPrepareAtSec(beatIndex: number): number {
  const slot = MONTAGE_TOTAL_SEC / MONTAGE_CLIP_COUNT;
  if (beatIndex <= 0) return 0;
  // Старт предыдущего слота — сразу крутим следующий момент на standby-буфере
  return (beatIndex - 1) * slot;
}

/** Сводит opacity 5 моментов к двум ping-pong буферам. */
export function bufferOpacitiesFromBeats(beatOpacities: number[]): number[] {
  let o0 = 0;
  let o1 = 0;
  for (let b = 0; b < beatOpacities.length; b++) {
    const o = beatOpacities[b] ?? 0;
    if (b % 2 === 0) o0 = Math.max(o0, o);
    else o1 = Math.max(o1, o);
  }
  return [o0, o1];
}

export function applyMontageAudiovisual(
  videos: HTMLVideoElement[],
  opacities: number[],
  muted: boolean,
  masterVolume = 0.85,
  allowPlay = true,
): void {
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const o = opacities[i] ?? 0;
    if (!v) continue;

    v.style.opacity = String(o);
    v.style.zIndex = o > 0.02 ? String(1 + Math.round(o * 4)) : '0';

    if (muted) {
      v.muted = true;
      v.volume = 0;
    } else {
      v.muted = o < 0.03;
      v.volume = Math.min(1, o * masterVolume);
    }

    // Не паузим скрытые буферы — они должны уже играть до кроссфейда
    if (allowPlay && v.paused) {
      void v.play().catch(() => {});
    }
  }
}
