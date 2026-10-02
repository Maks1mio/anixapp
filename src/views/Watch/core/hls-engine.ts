import Hls from 'hls.js';
import { isHlsUrl } from '../_utils';
import { buildHlsConfig } from './hls-media-context';

type VideoWithHls = HTMLVideoElement & {
  _hls?: Hls;
  _hlsGen?: number;
  _hlsReady?: () => void;
  _hlsError?: (event: string, data: { fatal: boolean; type: string; details?: string }) => void;
  _hlsFragLoaded?: () => void;
  _hlsNetTimers?: ReturnType<typeof setTimeout>[];
  _hlsLastKickAt?: number;
};

export type HlsFatalKind = 'recover' | 'reresolve' | 'fallback';

export interface SwapMediaHandlers {
  onReady?: () => void;
  onFatal?: (kind: HlsFatalKind) => void;
  /** Soft reconnect in progress (network backoff / stall kick). */
  onReconnect?: (active: boolean) => void;
  /** Полностью пересоздать HLS — иначе старый кадр остаётся в <video> и Anime4K «залипает». */
  forceNew?: boolean;
  /** Resume VOD from this time so we don't load seg-1 then seek (black/OP flash). */
  startPosition?: number;
}

/** Quiet soft kicks — no UI. Escalate only if still stuck after these. */
const NET_BACKOFF_MS = [0, 1200, 2800] as const;
const NET_ESCALATE_AFTER_MS = 12_000;
const MAX_SOFT_NET_ROUNDS = 2;
const KICK_MIN_INTERVAL_MS = 2_000;

const NUDGE_DETAILS = new Set<string>([
  Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL,
  Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE,
]);

export function getAttachedHls(video: HTMLVideoElement): Hls | undefined {
  return (video as VideoWithHls)._hls;
}

export function detachHls(video: HTMLVideoElement): void {
  const el = video as VideoWithHls;
  clearNetBackoffTimers(el);
  if (el._hls) {
    unbindHlsHandlers(el);
    try { el._hls.destroy(); } catch { /* ignore */ }
    el._hls = undefined;
  }
}

function clearNetBackoffTimers(el: VideoWithHls): void {
  const timers = el._hlsNetTimers;
  if (!timers?.length) return;
  for (const t of timers) clearTimeout(t);
  el._hlsNetTimers = [];
}

function unbindHlsHandlers(el: VideoWithHls): void {
  const hls = el._hls;
  if (!hls) return;
  if (el._hlsReady) hls.off(Hls.Events.MANIFEST_PARSED, el._hlsReady);
  if (el._hlsError) hls.off(Hls.Events.ERROR, el._hlsError);
  if (el._hlsFragLoaded) hls.off(Hls.Events.FRAG_LOADED, el._hlsFragLoaded);
  el._hlsReady = undefined;
  el._hlsError = undefined;
  el._hlsFragLoaded = undefined;
}

/** Forward buffer at the playhead (not the last TimeRanges end — ignores holes). */
export function bufferAheadAtPlayhead(video: HTMLVideoElement, minSec = 1): boolean {
  try {
    const t = video.currentTime;
    const buf = video.buffered;
    if (!buf.length || !Number.isFinite(t)) return false;
    for (let i = 0; i < buf.length; i++) {
      const start = buf.start(i);
      const end = buf.end(i);
      if (t >= start - 0.25 && t < end) {
        return end - t > minSec;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function playbackLooksHealthy(video: HTMLVideoElement): boolean {
  if (video.ended) return true;
  if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && bufferAheadAtPlayhead(video, 0.75)) {
    return true;
  }
  if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && bufferAheadAtPlayhead(video, 0.4)) {
    return true;
  }
  return false;
}

function bindHlsHandlers(hls: Hls, video: HTMLVideoElement, handlers: SwapMediaHandlers): void {
  const el = video as VideoWithHls;
  unbindHlsHandlers(el);
  clearNetBackoffTimers(el);
  const gen = (el._hlsGen ?? 0) + 1;
  el._hlsGen = gen;
  el._hlsNetTimers = [];

  const onReady = () => {
    if (el._hlsGen !== gen) return;
    handlers.onReconnect?.(false);
    handlers.onReady?.();
  };

  let mediaAttempts = 0;
  let softNetRounds = 0;
  let reResolveAttempts = 0;
  let netBackoffActive = false;

  const resetSoftCounters = () => {
    mediaAttempts = 0;
    softNetRounds = 0;
    netBackoffActive = false;
    clearNetBackoffTimers(el);
    handlers.onReconnect?.(false);
  };

  const onFragLoaded = () => {
    if (el._hlsGen !== gen) return;
    // Successful fragment → forget prior soft failures so one drop doesn't stack.
    resetSoftCounters();
  };

  const kickStartLoad = (atTime?: number) => {
    const now = performance.now();
    if (el._hlsLastKickAt != null && now - el._hlsLastKickAt < KICK_MIN_INTERVAL_MS) return;
    el._hlsLastKickAt = now;
    try {
      // skipSeekToStartPosition: resume loading without jumping the playhead.
      const t = typeof atTime === 'number' && Number.isFinite(atTime) && atTime > 0.25 ? atTime : -1;
      hls.startLoad(t, true);
    } catch { /* ignore */ }
  };

  const scheduleNetworkBackoff = () => {
    if (netBackoffActive) return;
    netBackoffActive = true;
    softNetRounds += 1;
    // Soft recovery stays silent — last frame stays on screen, no overlay.
    handlers.onFatal?.('recover');

    for (const delay of NET_BACKOFF_MS) {
      const timer = setTimeout(() => {
        if (el._hlsGen !== gen || el._hls !== hls) return;
        if (playbackLooksHealthy(video)) {
          resetSoftCounters();
          return;
        }
        const ct = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        kickStartLoad(ct);
      }, delay);
      el._hlsNetTimers!.push(timer);
    }

    const escalateTimer = setTimeout(() => {
      if (el._hlsGen !== gen || el._hls !== hls) return;
      if (!netBackoffActive) return;
      if (playbackLooksHealthy(video)) {
        resetSoftCounters();
        return;
      }
      netBackoffActive = false;
      clearNetBackoffTimers(el);

      if (softNetRounds < MAX_SOFT_NET_ROUNDS) {
        // Another quiet soft round before reresolve.
        scheduleNetworkBackoff();
        return;
      }

      if (reResolveAttempts++ < 2) {
        handlers.onReconnect?.(true);
        handlers.onFatal?.('reresolve');
      } else {
        handlers.onReconnect?.(false);
        handlers.onFatal?.('fallback');
      }
    }, NET_ESCALATE_AFTER_MS);
    el._hlsNetTimers!.push(escalateTimer);
  };

  const onError = (_evt: string, data: { fatal: boolean; type: string; details?: string }) => {
    if (el._hlsGen !== gen) return;
    if (!data.fatal) {
      // Gap nudges are non-fatal by design — recoverMediaError flushes MSE and
      // often reloads from the wrong place (black screen / OP flash / seg-1).
      if (data.details && NUDGE_DETAILS.has(data.details)) return;
      // Other non-fatal MEDIA/NETWORK: let hls.js retry on its own.
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaAttempts++ < 4) {
      try { hls.recoverMediaError(); } catch { /* ignore */ }
      handlers.onFatal?.('recover');
      return;
    }
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      scheduleNetworkBackoff();
      return;
    }
    if (reResolveAttempts++ < 2) {
      handlers.onReconnect?.(true);
      handlers.onFatal?.('reresolve');
    } else {
      handlers.onReconnect?.(false);
      handlers.onFatal?.('fallback');
    }
  };

  el._hlsReady = onReady;
  el._hlsError = onError;
  el._hlsFragLoaded = onFragLoaded;
  hls.on(Hls.Events.MANIFEST_PARSED, onReady);
  hls.on(Hls.Events.ERROR, onError);
  hls.on(Hls.Events.FRAG_LOADED, onFragLoaded);
}

function preferNativeHls(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
    return true;
  }
  // Chromium (Electron, Chrome, Edge) умеет и MSE, и нативный HLS — начиная с Chromium ~151
  // canPlayType('application/vnd.apple.mpegurl') возвращает 'maybe'. Нативный путь обходит hls.js
  // (мягкое восстановление, nudge, буфер) и при долгом ожидании сегмента ломается пересозданием
  // video.src (сброс таймкода, потеря MediaSession). На десктопе остаёмся на hls.js, как в 0.1.55.
  if (/(?:Chrome|Chromium|CriOS|Edg)\//.test(navigator.userAgent)) return false;
  const el = document.createElement('video');
  return !!el.canPlayType('application/vnd.apple.mpegurl');
}

export function swapMediaSource(
  video: HTMLVideoElement,
  url: string,
  handlers: SwapMediaHandlers = {},
): { reused: boolean; isHls: boolean } {
  // Android TV WebView: MSE/hls.js часто даёт чёрный кадр при живом currentTime.
  // Нативный HLS в <video src> — тот же путь, что у старого Anixholy APK.
  const wantHls = isHlsUrl(url) && Hls.isSupported() && !preferNativeHls();
  const existing = getAttachedHls(video);

  if (wantHls) {
    if (existing && !handlers.forceNew) {
      bindHlsHandlers(existing, video, handlers);
      existing.loadSource(url);
      const sp = handlers.startPosition;
      if (typeof sp === 'number' && Number.isFinite(sp) && sp > 0.25) {
        existing.startLoad(sp);
      } else {
        existing.startLoad(-1);
      }
      return { reused: true, isHls: true };
    }
    detachHls(video);
    const cfg = { ...buildHlsConfig() } as ReturnType<typeof buildHlsConfig> & { startPosition?: number };
    const sp = handlers.startPosition;
    if (typeof sp === 'number' && Number.isFinite(sp) && sp > 0.25) {
      cfg.startPosition = sp;
    }
    const hls = new Hls(cfg);
    bindHlsHandlers(hls, video, handlers);
    hls.loadSource(url);
    hls.attachMedia(video);
    (video as VideoWithHls)._hls = hls;
    return { reused: false, isHls: true };
  }

  detachHls(video);
  video.src = url;
  return { reused: false, isHls: false };
}

export function startHlsFromTime(video: HTMLVideoElement, time: number): void {
  const hls = getAttachedHls(video);
  if (!hls) return;
  const el = video as VideoWithHls;
  const now = performance.now();
  if (el._hlsLastKickAt != null && now - el._hlsLastKickAt < KICK_MIN_INTERVAL_MS) return;
  el._hlsLastKickAt = now;
  try {
    const t = Number.isFinite(time) && time > 0.25 ? time : -1;
    // Soft stall kick: keep playhead where it is, only resume fragment loading.
    hls.startLoad(t, true);
  } catch { /* ignore */ }
}
