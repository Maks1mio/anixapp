import { notifyHistoryChanged } from '../../../utils/favorites-events';
import { isLocalMediaUrl } from '../../../utils/local-media-url';
import { isHlsUrl, stripKodikQueryParams } from '../_utils';
import { bufferAheadAtPlayhead, detachHls, startHlsFromTime, swapMediaSource } from './hls-engine';
import { prefetchEpisodeUrl, resolveEpisodeUrlCached, invalidateEpisodeUrlCache, type ResolvedEpisodeMedia } from './url-cache';
import { UpscaleController, isGpuAvailable } from './upscale';
import { SurroundController } from './surround-audio';

export type PlayerCorePlayOpts = {
  url: string;
  useVideo: boolean;
  ep: number;
  title: string;
  sourceName: string;
  dubberId: string;
  seekTime?: number;
  initialPaused?: boolean;
  volume: number;
  muted?: boolean;
  onFallback: () => void;
  onReresolve: (savedTime: number, wasPaused: boolean) => void;
  onWatchdogReresolve: () => Promise<{ url: string; useVideo: boolean } | null>;
  /** Soft mid-watch reconnect (HLS backoff / stall). */
  onReconnect?: (active: boolean) => void;
  syncPlaybackRate: () => void;
  releaseId?: string;
  sourceId?: string;
};

const WD_DELAY_MS = 5_000;
const STALL_TICK_MS = 6_000;
/** Progressive: waiting/stalled longer than this → soft reconnect kick. */
const PROGRESSIVE_WAIT_MS = 10_000;
/** Soft stall kicks before full reresolve (× STALL_TICK_MS). */
const STALL_SOFT_TICKS = 2;

export class PlayerCore {
  video: HTMLVideoElement | null = null;
  canvas: HTMLCanvasElement | null = null;
  iframe: HTMLIFrameElement | null = null;

  origEpUrl = '';
  readonly upscale = new UpscaleController();
  readonly surround = new SurroundController();

  private wdTimer: ReturnType<typeof setTimeout> | null = null;
  private wdGen = 0;
  private stallCheckTimer: ReturnType<typeof setInterval> | null = null;
  private progressiveWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private playGen = 0;
  private mediaAbort: AbortController | null = null;

  setOrigEpisodeUrl(rawUrl: string): void {
    const abs = rawUrl.startsWith('http') ? rawUrl : `https:${rawUrl}`;
    this.origEpUrl = stripKodikQueryParams(abs);
  }

  invalidateCache(embedUrl?: string): void {
    invalidateEpisodeUrlCache(embedUrl);
  }

  resolve(embedUrl: string, iframe: boolean, maxAttempts?: number): Promise<ResolvedEpisodeMedia> {
    return resolveEpisodeUrlCached(embedUrl, iframe, maxAttempts);
  }

  prefetch(embedUrl: string, iframe: boolean): void {
    prefetchEpisodeUrl(embedUrl, iframe);
  }

  applySource(opts: PlayerCorePlayOpts): void {
    const video = this.video;
    const iframeEl = this.iframe;
    if (!opts.useVideo) {
      this.wdClear();
      this.clearStallWatch();
      this.stopUpscale();
      if (video) {
        detachHls(video);
        video.hidden = true;
      }
      if (iframeEl) iframeEl.hidden = false;
      opts.onReconnect?.(false);
      return;
    }
    if (!video) return;

    this.wdClear();
    this.clearStallWatch();
    this.stopUpscale();
    this.mediaAbort?.abort();
    this.mediaAbort = new AbortController();
    const { signal } = this.mediaAbort;
    const myGen = ++this.wdGen;
    this.playGen++;
    const isLocal = isLocalMediaUrl(opts.url);
    // Keep soft-reconnect UI while silently re-applying after stall/network (seek resume).
    if (opts.seekTime == null) opts.onReconnect?.(false);

    video.hidden = false;
    if (iframeEl) iframeEl.hidden = true;
    if (opts.volume !== undefined) {
      const muted = opts.muted === true || opts.volume <= 0;
      video.muted = muted;
      video.volume = muted ? 0 : opts.volume / 100;
      this.surround.setOutputLevel(muted ? 0 : opts.volume / 100);
    }

    const doPlay = () => {
      if (!opts.initialPaused) video.play().catch(() => {});
    };

    if (opts.seekTime != null) {
      const restoreTime = () => {
        const t = Math.max(0, opts.seekTime!);
        video.currentTime = Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(t, video.duration)
          : t;
        if (opts.initialPaused) video.pause();
      };
      video.addEventListener('loadeddata', restoreTime, { once: true, signal });
      video.addEventListener('canplay', restoreTime, { once: true, signal });
    }

    const fallback = () => {
      if (myGen !== this.wdGen) return;
      opts.onReconnect?.(false);
      if (isLocal) {
        opts.onFallback();
        return;
      }
      if (this.origEpUrl) opts.onFallback();
    };

    const silentReresolve = () => {
      if (myGen !== this.wdGen) return;
      const savedTime = !isNaN(video.currentTime) ? video.currentTime : 0;
      const wasPaused = video.paused;
      console.warn(`[Player] reresolve at ${savedTime.toFixed(1)}s (rs=${video.readyState}, hls=${isHls})`);
      opts.onReconnect?.(true);
      opts.onReresolve(savedTime, wasPaused);
    };

    const { isHls } = swapMediaSource(video, opts.url, {
      forceNew: true,
      // Load from resume time — avoid fetching seg-1 then seeking (OP/black flash).
      startPosition: opts.seekTime,
      onReady: () => {
        if (myGen !== this.wdGen) return;
        opts.onReconnect?.(false);
        doPlay();
        opts.syncPlaybackRate();
      },
      onReconnect: (active) => {
        if (myGen !== this.wdGen) return;
        opts.onReconnect?.(active);
      },
      onFatal: (kind) => {
        if (myGen !== this.wdGen) return;
        if (kind === 'reresolve') {
          silentReresolve();
        } else if (kind === 'fallback') {
          fallback();
        }
        // 'recover' — silent soft kick, no overlay
      },
    });

    video.addEventListener('loadedmetadata', () => opts.syncPlaybackRate(), { once: true, signal });
    video.addEventListener('playing', () => {
      if (myGen !== this.wdGen) return;
      opts.onReconnect?.(false);
      opts.syncPlaybackRate();
    }, { signal });

    video.addEventListener('canplay', () => {
      if (myGen !== this.wdGen) return;
      opts.onReconnect?.(false);
    }, { signal });

    // ── Stall escalate (HLS + progressive) ─────────────────────────────────
    let lastStall = -1;
    let stallTicks = 0;
    let progressiveEscalated = false;

    this.stallCheckTimer = setInterval(() => {
      if (myGen !== this.wdGen) return;
      if (video.paused || video.ended || video.hidden) {
        lastStall = -1;
        stallTicks = 0;
        return;
      }
      // Forward buffer at playhead (not last TimeRanges end — that ignores holes).
      if (bufferAheadAtPlayhead(video, 1.5)) {
        lastStall = video.currentTime;
        stallTicks = 0;
        opts.onReconnect?.(false);
        return;
      }

      const ct = video.currentTime;
      if (lastStall >= 0 && Math.abs(ct - lastStall) < 0.05) {
        stallTicks += 1;
        if (stallTicks <= STALL_SOFT_TICKS) {
          // Quiet soft kick — keep last frame, no UI.
          if (isHls) startHlsFromTime(video, ct);
          else this.kickProgressiveReload(video, opts.url, ct);
        } else {
          stallTicks = 0;
          lastStall = -1;
          silentReresolve();
        }
      } else {
        stallTicks = 0;
      }
      lastStall = ct;
    }, STALL_TICK_MS);

    // Progressive: long waiting/stalled → soft reconnect then reresolve
    if (!isHls && !isLocal) {
      const clearWait = () => {
        if (this.progressiveWaitTimer) {
          clearTimeout(this.progressiveWaitTimer);
          this.progressiveWaitTimer = null;
        }
      };
      const onWaitStart = () => {
        if (myGen !== this.wdGen || video.paused || video.ended) return;
        clearWait();
        const startedAt = !isNaN(video.currentTime) ? video.currentTime : 0;
        this.progressiveWaitTimer = setTimeout(() => {
          this.progressiveWaitTimer = null;
          if (myGen !== this.wdGen || video.paused || video.ended) return;
          const ct = !isNaN(video.currentTime) ? video.currentTime : 0;
          // `stalled`/`waiting` приходят и при простое сети с полным буфером (нативный HLS):
          // если позиция идёт вперёд и впереди есть данные — это не зависание, источник не
          // трогаем (иначе video.src пересоздаётся каждые ~20 с → чёрный кадр).
          if (video.readyState >= 3 && ct - startedAt > 1 && bufferAheadAtPlayhead(video, 1.5)) return;
          if (!progressiveEscalated) {
            progressiveEscalated = true;
            // Quiet soft reload — no overlay.
            this.kickProgressiveReload(video, opts.url, ct);
            this.progressiveWaitTimer = setTimeout(() => {
              this.progressiveWaitTimer = null;
              if (myGen !== this.wdGen) return;
              if (video.paused || video.ended) return;
              if (video.readyState < 3) silentReresolve();
            }, PROGRESSIVE_WAIT_MS);
          } else {
            silentReresolve();
          }
        }, PROGRESSIVE_WAIT_MS);
      };
      video.addEventListener('waiting', onWaitStart, { signal });
      video.addEventListener('stalled', onWaitStart, { signal });
      video.addEventListener('playing', clearWait, { signal });
      video.addEventListener('canplay', clearWait, { signal });
    }

    // Progressive hard error: try soft reload once, then reresolve, then fallback
    let hardErrors = 0;
    video.addEventListener('error', () => {
      if (myGen !== this.wdGen) return;
      if (isLocal) {
        fallback();
        return;
      }
      hardErrors += 1;
      const ct = !isNaN(video.currentTime) ? video.currentTime : 0;
      if (hardErrors === 1 && !isHls) {
        // Quiet soft reload.
        this.kickProgressiveReload(video, opts.url, ct);
        return;
      }
      if (hardErrors <= 2) {
        silentReresolve();
        return;
      }
      fallback();
    }, { signal });

    video.addEventListener('playing', () => {
      if (myGen === this.wdGen) this.wdClear();
      if (opts.releaseId && opts.sourceId) {
        this.recordHistory(opts.releaseId, opts.sourceId, opts.ep);
      }
    }, { once: true, signal });

    if (!isHls) {
      opts.syncPlaybackRate();
      doPlay();
    }

    if (!opts.initialPaused && !isLocal) {
      const scheduleWd = (delay: number) => {
        this.wdTimer = setTimeout(async () => {
          this.wdTimer = null;
          if (myGen !== this.wdGen) return;
          if (!this.video || this.video.currentTime > 0) return;
          if (!this.origEpUrl) return;
          opts.onReconnect?.(true);
          try {
            const next = await opts.onWatchdogReresolve();
            if (myGen !== this.wdGen) return;
            if (next?.useVideo && next.url) {
              this.applySource({ ...opts, url: next.url, useVideo: true });
            } else {
              opts.onFallback();
            }
          } catch {
            if (myGen === this.wdGen) opts.onFallback();
          }
        }, delay);
      };
      scheduleWd(WD_DELAY_MS);
    }
  }

  /** Reload progressive src and seek back — soft mid-watch recovery. */
  private kickProgressiveReload(video: HTMLVideoElement, url: string, atTime: number): void {
    try {
      const t = Math.max(0, atTime);
      const abs = url;
      console.warn(`[Player] soft reload of source at ${t.toFixed(1)}s (rs=${video.readyState})`);
      // Force network re-fetch without leaving the element empty for long.
      video.src = abs;
      const seek = () => {
        try {
          if (Number.isFinite(video.duration) && video.duration > 0) {
            video.currentTime = Math.min(t, Math.max(0, video.duration - 0.25));
          } else {
            video.currentTime = t;
          }
        } catch { /* ignore */ }
        video.play().catch(() => {});
      };
      video.addEventListener('loadeddata', seek, { once: true });
      video.addEventListener('canplay', seek, { once: true });
      video.load();
    } catch { /* ignore */ }
  }

  recordHistory(releaseId: string, sourceId: string, ep: number): void {
    const rId = Number.parseInt(releaseId, 10);
    const sId = Number.parseInt(sourceId, 10);
    if (!Number.isFinite(rId) || rId <= 0 || !Number.isFinite(sId) || sId <= 0) return;
    const api = (window as unknown as { anixApi?: { history?: { add?: (a: number, b: number, c: number) => void; markWatched?: (a: number, b: number, c: number) => Promise<unknown> } } }).anixApi;
    api?.history?.add?.(rId, sId, ep);
    api?.history?.markWatched?.(rId, sId, ep)?.catch?.(() => {});
    if (Number.isFinite(rId)) notifyHistoryChanged({ releaseId: rId });
  }

  async startUpscale(
    enabled: boolean,
    mode: number,
    aspectRatio = 'auto',
    targetHeight: number | null = null,
  ): Promise<boolean> {
    return this.upscale.start({
      enabled,
      mode,
      aspectRatio,
      targetHeight,
      video: this.video,
      canvas: this.canvas,
    });
  }

  stopUpscale(): void {
    this.upscale.stop(this.video, this.canvas);
  }

  hideMedia(): void {
    this.wdClear();
    this.clearStallWatch();
    this.mediaAbort?.abort();
    this.mediaAbort = null;
    this.stopUpscale();
    const video = this.video;
    if (video) {
      detachHls(video);
      video.hidden = true;
      try { video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
    }
    const iframeEl = this.iframe;
    if (iframeEl) {
      iframeEl.hidden = true;
      try { iframeEl.src = ''; } catch { /* ignore */ }
    }
  }

  destroy(): void {
    this.hideMedia();
    this.surround.dispose();
  }

  isHls(url: string): boolean {
    return isHlsUrl(url);
  }

  private clearStallWatch(): void {
    if (this.stallCheckTimer) {
      clearInterval(this.stallCheckTimer);
      this.stallCheckTimer = null;
    }
    if (this.progressiveWaitTimer) {
      clearTimeout(this.progressiveWaitTimer);
      this.progressiveWaitTimer = null;
    }
  }

  private wdClear(): void {
    if (this.wdTimer) {
      clearTimeout(this.wdTimer);
      this.wdTimer = null;
    }
  }
}

export { isGpuAvailable };
