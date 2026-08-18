import Hls from 'hls.js';
import { isHlsUrl } from '../_utils';
import { buildHlsConfig } from './hls-media-context';

type VideoWithHls = HTMLVideoElement & {
  _hls?: Hls;
  _hlsGen?: number;
  _hlsReady?: () => void;
  _hlsError?: (event: string, data: { fatal: boolean; type: string }) => void;
};

export type HlsFatalKind = 'recover' | 'reresolve' | 'fallback';

export interface SwapMediaHandlers {
  onReady?: () => void;
  onFatal?: (kind: HlsFatalKind) => void;
  /** Полностью пересоздать HLS — иначе старый кадр остаётся в <video> и Anime4K «залипает». */
  forceNew?: boolean;
}

export function getAttachedHls(video: HTMLVideoElement): Hls | undefined {
  return (video as VideoWithHls)._hls;
}

export function detachHls(video: HTMLVideoElement): void {
  const el = video as VideoWithHls;
  if (el._hls) {
    unbindHlsHandlers(el);
    try { el._hls.destroy(); } catch { /* ignore */ }
    el._hls = undefined;
  }
}

function unbindHlsHandlers(el: VideoWithHls): void {
  const hls = el._hls;
  if (!hls) return;
  if (el._hlsReady) hls.off(Hls.Events.MANIFEST_PARSED, el._hlsReady);
  if (el._hlsError) hls.off(Hls.Events.ERROR, el._hlsError);
  el._hlsReady = undefined;
  el._hlsError = undefined;
}

function bindHlsHandlers(hls: Hls, video: HTMLVideoElement, handlers: SwapMediaHandlers): void {
  const el = video as VideoWithHls;
  unbindHlsHandlers(el);
  const gen = (el._hlsGen ?? 0) + 1;
  el._hlsGen = gen;

  const onReady = () => {
    if (el._hlsGen !== gen) return;
    handlers.onReady?.();
  };

  let attempts = 0;
  let reResolveAttempts = 0;
  const onError = (_evt: string, data: { fatal: boolean; type: string }) => {
    if (el._hlsGen !== gen) return;
    if (!data.fatal) {
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && attempts++ < 3) {
      hls.recoverMediaError();
      handlers.onFatal?.('recover');
    } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && attempts < 3) {
      attempts++;
      hls.startLoad();
      handlers.onFatal?.('recover');
    } else if (reResolveAttempts++ < 2) {
      handlers.onFatal?.('reresolve');
    } else {
      handlers.onFatal?.('fallback');
    }
  };

  el._hlsReady = onReady;
  el._hlsError = onError;
  hls.on(Hls.Events.MANIFEST_PARSED, onReady);
  hls.on(Hls.Events.ERROR, onError);
}

export function swapMediaSource(
  video: HTMLVideoElement,
  url: string,
  handlers: SwapMediaHandlers = {},
): { reused: boolean; isHls: boolean } {
  const wantHls = isHlsUrl(url) && Hls.isSupported();
  const existing = getAttachedHls(video);

  if (wantHls) {
    if (existing && !handlers.forceNew) {
      bindHlsHandlers(existing, video, handlers);
      existing.loadSource(url);
      existing.startLoad();
      return { reused: true, isHls: true };
    }
    detachHls(video);
    const hls = new Hls(buildHlsConfig());
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
  try { hls.startLoad(time); } catch { /* ignore */ }
}
