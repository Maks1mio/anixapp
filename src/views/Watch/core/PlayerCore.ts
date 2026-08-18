import { notifyHistoryChanged } from '../../../utils/favorites-events';
import { isLocalMediaUrl } from '../../../utils/local-media-url';
import { isHlsUrl, stripKodikQueryParams } from '../_utils';
import { detachHls, startHlsFromTime, swapMediaSource } from './hls-engine';
import { prefetchEpisodeUrl, resolveEpisodeUrlCached, invalidateEpisodeUrlCache, type ResolvedEpisodeMedia } from './url-cache';
import { UpscaleController, gpuAvailable } from './upscale';

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
  onFallback: () => void;
  onReresolve: (savedTime: number, wasPaused: boolean) => void;
  onWatchdogReresolve: () => Promise<{ url: string; useVideo: boolean } | null>;
  syncPlaybackRate: () => void;
  releaseId?: string;
  sourceId?: string;
};

const WD_DELAY_MS = 5_000;
const WD_RETRY_DELAY_MS = 4_000;

export class PlayerCore {
  video: HTMLVideoElement | null = null;
  canvas: HTMLCanvasElement | null = null;
  iframe: HTMLIFrameElement | null = null;

  origEpUrl = '';
  readonly upscale = new UpscaleController();

  private wdTimer: ReturnType<typeof setTimeout> | null = null;
  private wdGen = 0;
  private stallCheckTimer: ReturnType<typeof setInterval> | null = null;
  private playGen = 0;

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
      if (video) {
        detachHls(video);
        video.hidden = true;
      }
      if (iframeEl) iframeEl.hidden = false;
      return;
    }
    if (!video) return;

    this.wdClear();
    const myGen = ++this.wdGen;
    this.playGen++;
    const isLocal = isLocalMediaUrl(opts.url);

    if (this.stallCheckTimer) {
      clearInterval(this.stallCheckTimer);
      this.stallCheckTimer = null;
    }

    video.hidden = false;
    if (iframeEl) iframeEl.hidden = true;
    if (opts.volume !== undefined) video.volume = opts.volume / 100;

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
      video.addEventListener('loadeddata', restoreTime, { once: true });
      video.addEventListener('canplay', restoreTime, { once: true });
      if (opts.seekTime === 0) {
        try { video.currentTime = 0; } catch { /* ignore */ }
      }
    }

    const fallback = () => {
      if (isLocal) {
        opts.onFallback();
        return;
      }
      if (this.origEpUrl) opts.onFallback();
    };

    const { isHls } = swapMediaSource(video, opts.url, {
      onReady: () => {
        doPlay();
        opts.syncPlaybackRate();
      },
      onFatal: (kind) => {
        if (kind === 'reresolve') {
          const savedTime = !isNaN(video.currentTime) ? video.currentTime : 0;
          const wasPaused = video.paused;
          opts.onReresolve(savedTime, wasPaused);
        } else if (kind === 'fallback') {
          fallback();
        }
      },
    });

    video.addEventListener('loadedmetadata', () => opts.syncPlaybackRate(), { once: true });
    video.addEventListener('playing', () => opts.syncPlaybackRate(), { once: true });

    if (!isHls) {
      opts.syncPlaybackRate();
      doPlay();
    } else {
      let lastStall = -1;
      this.stallCheckTimer = setInterval(() => {
        if (video.paused || video.ended || video.hidden) {
          lastStall = -1;
          return;
        }
        const ct = video.currentTime;
        if (lastStall >= 0 && ct === lastStall) startHlsFromTime(video, ct);
        lastStall = ct;
      }, 5000);
    }

    video.addEventListener('error', fallback, { once: true });

    video.addEventListener('playing', () => {
      if (myGen === this.wdGen) this.wdClear();
      if (opts.releaseId && opts.sourceId) {
        this.recordHistory(opts.releaseId, opts.sourceId, opts.ep);
      }
    }, { once: true });

    if (!opts.initialPaused && !isLocal) {
      const scheduleWd = (delay: number) => {
        this.wdTimer = setTimeout(async () => {
          this.wdTimer = null;
          if (myGen !== this.wdGen) return;
          if (!this.video || this.video.currentTime > 0) return;
          if (!this.origEpUrl) return;
          try {
            const next = await opts.onWatchdogReresolve();
            if (myGen !== this.wdGen) return;
            if (next?.useVideo && next.url) {
              this.applySource({ ...opts, url: next.url, useVideo: true });
            } else if (myGen === this.wdGen) {
              scheduleWd(WD_RETRY_DELAY_MS);
            }
          } catch {
            if (myGen === this.wdGen) scheduleWd(WD_RETRY_DELAY_MS);
          }
        }, delay);
      };
      scheduleWd(WD_DELAY_MS);
    }
  }

  recordHistory(releaseId: string, sourceId: string, ep: number): void {
    const rId = parseInt(releaseId, 10);
    const sId = parseInt(sourceId, 10);
    const api = (window as unknown as { anixApi?: { history?: { add?: (a: number, b: number, c: number) => void; markWatched?: (a: number, b: number, c: number) => Promise<unknown> } } }).anixApi;
    api?.history?.add?.(rId, sId, ep);
    api?.history?.markWatched?.(rId, sId, ep)?.catch?.(() => {});
    if (Number.isFinite(rId)) notifyHistoryChanged({ releaseId: rId });
  }

  async startUpscale(enabled: boolean, mode: number, aspectRatio = 'auto'): Promise<boolean> {
    return this.upscale.start({
      enabled,
      mode,
      aspectRatio,
      video: this.video,
      canvas: this.canvas,
    });
  }

  stopUpscale(): void {
    this.upscale.stop(this.video, this.canvas);
  }

  destroy(): void {
    this.wdClear();
    if (this.stallCheckTimer) {
      clearInterval(this.stallCheckTimer);
      this.stallCheckTimer = null;
    }
    this.stopUpscale();
    if (this.video) detachHls(this.video);
  }

  isHls(url: string): boolean {
    return isHlsUrl(url);
  }

  private wdClear(): void {
    if (this.wdTimer) {
      clearTimeout(this.wdTimer);
      this.wdTimer = null;
    }
  }
}

export { gpuAvailable };
