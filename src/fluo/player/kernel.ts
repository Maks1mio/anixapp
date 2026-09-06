/**
 * Fluo player kernel — единый фасад управления плеером.
 * UI, IPC и sync ходят только сюда; `<video>` не трогают напрямую.
 */

import type { PlayerCore } from '../../views/Watch/core/PlayerCore';
import {
  emptyFluoState,
  type FluoCommandOptions,
  type FluoContent,
  type FluoEpisodeItem,
  type FluoEventMap,
  type FluoEventName,
  type FluoLoadParams,
  type FluoLoadState,
  type FluoOrigin,
  type FluoState,
} from '../types';

type Listener<K extends FluoEventName> = (payload: FluoEventMap[K]) => void;

export type FluoLoadHandler = (params: FluoLoadParams, origin: FluoOrigin) => void | Promise<void>;
export type FluoQualityHandler = (quality: string, origin: FluoOrigin) => void | Promise<void>;
export type FluoDubberHandler = (dubberId: string, origin: FluoOrigin) => void | Promise<void>;
export type FluoSourceHandler = (sourceId: string, origin: FluoOrigin) => void | Promise<void>;

export class FluoPlayer {
  private video: HTMLVideoElement | null = null;
  private core: PlayerCore | null = null;
  private state: FluoState = emptyFluoState();
  private listeners = new Map<FluoEventName, Set<Listener<FluoEventName>>>();
  private lastCommandOrigin: FluoOrigin = 'system';
  private applyingSync = false;
  private destroyed = false;

  private loadHandler: FluoLoadHandler | null = null;
  private qualityHandler: FluoQualityHandler | null = null;
  private dubberHandler: FluoDubberHandler | null = null;
  private sourceHandler: FluoSourceHandler | null = null;

  private onVideoTimeUpdate = (): void => {
    if (!this.video || this.destroyed) return;
    this.state.currentTime = this.video.currentTime || 0;
    this.state.duration = Number.isFinite(this.video.duration) ? this.video.duration : this.state.duration;
    this.emit('timeupdate', {
      currentTime: this.state.currentTime,
      duration: this.state.duration,
      origin: this.lastCommandOrigin,
    });
  };

  private onVideoPlay = (): void => {
    if (this.applyingSync) return;
    this.state.paused = false;
    this.state.buffering = false;
    this.emit('play', { origin: this.lastCommandOrigin === 'sync' ? 'sync' : 'user' });
    this.emitState();
  };

  private onVideoPause = (): void => {
    if (this.applyingSync) return;
    if (this.video?.seeking) return;
    this.state.paused = true;
    this.emit('pause', { origin: this.lastCommandOrigin === 'sync' ? 'sync' : 'user' });
    this.emitState();
  };

  private onVideoEnded = (): void => {
    this.state.paused = true;
    this.emit('ended', { origin: this.lastCommandOrigin });
    this.emitState();
  };

  private onVideoWaiting = (): void => {
    this.state.buffering = true;
    this.emit('buffering', { buffering: true, origin: this.lastCommandOrigin });
    this.emitState();
  };

  private onVideoPlaying = (): void => {
    this.state.buffering = false;
    this.state.paused = false;
    this.emit('buffering', { buffering: false, origin: this.lastCommandOrigin });
    this.emitState();
  };

  /** Привязать DOM / PlayerCore (вызывается из Watch page). */
  bind(opts: { video: HTMLVideoElement | null; core?: PlayerCore | null }): void {
    this.unbindVideoListeners();
    this.video = opts.video;
    if (opts.core !== undefined) this.core = opts.core;
    this.bindVideoListeners();
    this.syncFromVideo();
  }

  unbind(): void {
    this.unbindVideoListeners();
    this.video = null;
  }

  setLoadHandler(handler: FluoLoadHandler | null): void {
    this.loadHandler = handler;
  }

  setQualityHandler(handler: FluoQualityHandler | null): void {
    this.qualityHandler = handler;
  }

  setDubberHandler(handler: FluoDubberHandler | null): void {
    this.dubberHandler = handler;
  }

  setSourceHandler(handler: FluoSourceHandler | null): void {
    this.sourceHandler = handler;
  }

  getState(): FluoState {
    this.syncFromVideo();
    return {
      ...this.state,
      content: this.state.content ? { ...this.state.content } : null,
      availableQualities: { ...this.state.availableQualities },
      queue: this.state.queue.slice(),
    };
  }

  isPlaying(): boolean {
    this.syncFromVideo();
    return !this.state.paused;
  }

  getProgress(): number {
    this.syncFromVideo();
    return this.state.currentTime;
  }

  getDuration(): number {
    this.syncFromVideo();
    return this.state.duration;
  }

  getVolume(): number {
    return this.state.volume;
  }

  getQueue(): FluoEpisodeItem[] {
    return this.state.queue.slice();
  }

  getLastOrigin(): FluoOrigin {
    return this.lastCommandOrigin;
  }

  isApplyingSync(): boolean {
    return this.applyingSync;
  }

  play(opts?: FluoCommandOptions): void {
    const origin = opts?.origin ?? 'user';
    this.lastCommandOrigin = origin;
    this.withSyncGuard(origin, () => {
      const v = this.video;
      if (!v) {
        this.state.paused = false;
        this.emit('play', { origin });
        this.emitState();
        return;
      }
      void v.play().then(() => {
        this.state.paused = false;
        this.emit('play', { origin });
        this.emitState();
      }).catch(() => {
        this.state.paused = true;
        this.emitState();
      });
    });
  }

  pause(opts?: FluoCommandOptions): void {
    const origin = opts?.origin ?? 'user';
    this.lastCommandOrigin = origin;
    this.withSyncGuard(origin, () => {
      this.video?.pause();
      this.state.paused = true;
      this.emit('pause', { origin });
      this.emitState();
    });
  }

  togglePlayPause(opts?: FluoCommandOptions): void {
    this.syncFromVideo();
    if (this.state.paused) this.play(opts);
    else this.pause(opts);
  }

  setProgress(time: number, opts?: FluoCommandOptions): void {
    const origin = opts?.origin ?? 'user';
    this.lastCommandOrigin = origin;
    const t = Math.max(0, Number(time) || 0);
    this.withSyncGuard(origin, () => {
      const v = this.video;
      if (v && Number.isFinite(v.duration) && v.duration > 0) {
        v.currentTime = Math.min(t, v.duration);
      } else if (v) {
        v.currentTime = t;
      }
      this.state.currentTime = t;
      this.emit('seek', { currentTime: t, origin });
      this.emitState();
    });
  }

  setVolume(volume: number, opts?: FluoCommandOptions): void {
    const origin = opts?.origin ?? 'user';
    this.lastCommandOrigin = origin;
    const vol = Math.max(0, Math.min(100, Number(volume) || 0));
    this.state.volume = vol;
    this.state.muted = vol <= 0 ? true : this.state.muted && vol <= 0;
    if (vol > 0) this.state.muted = false;
    this.applyVolumeToMedia();
    this.emitState();
  }

  setMuted(muted: boolean, opts?: FluoCommandOptions): void {
    const origin = opts?.origin ?? 'user';
    this.lastCommandOrigin = origin;
    this.state.muted = !!muted;
    this.applyVolumeToMedia();
    this.emitState();
  }

  setRate(rate: number, opts?: FluoCommandOptions): void {
    const origin = opts?.origin ?? 'user';
    this.lastCommandOrigin = origin;
    const r = Math.max(0.25, Math.min(3, Number(rate) || 1));
    this.state.playbackRate = r;
    if (this.video) this.video.playbackRate = r;
    this.emitState();
  }

  setQuality(quality: string, opts?: FluoCommandOptions): void {
    const origin = opts?.origin ?? 'user';
    this.lastCommandOrigin = origin;
    this.state.quality = String(quality ?? '');
    void this.qualityHandler?.(this.state.quality, origin);
    this.emitState();
  }

  setDubber(dubberId: string, opts?: FluoCommandOptions): void {
    const origin = opts?.origin ?? 'user';
    this.lastCommandOrigin = origin;
    void this.dubberHandler?.(String(dubberId), origin);
  }

  setSource(sourceId: string, opts?: FluoCommandOptions): void {
    const origin = opts?.origin ?? 'user';
    this.lastCommandOrigin = origin;
    void this.sourceHandler?.(String(sourceId), origin);
  }

  setQueue(queue: FluoEpisodeItem[]): void {
    this.state.queue = queue.slice();
    this.emitState();
  }

  /** Обновить метаданные контента без перезагрузки (после успешного load в page). */
  setContent(content: FluoContent | null, opts?: FluoCommandOptions): void {
    const origin = opts?.origin ?? 'system';
    this.lastCommandOrigin = origin;
    this.state.content = content ? { ...content } : null;
    this.emit('content', { content: this.state.content, origin });
    this.emitState();
  }

  setLoadState(loadState: FluoLoadState, opts?: FluoCommandOptions): void {
    this.state.loadState = loadState;
    if (opts?.origin) this.lastCommandOrigin = opts.origin;
    this.emitState();
  }

  setAvailableQualities(map: Record<string, string>, current?: string): void {
    this.state.availableQualities = { ...map };
    if (current != null) this.state.quality = current;
    this.emitState();
  }

  /** Загрузить контент — делегирует в page через loadHandler. */
  async load(params: FluoLoadParams, opts?: FluoCommandOptions): Promise<void> {
    const origin = opts?.origin ?? 'user';
    this.lastCommandOrigin = origin;
    this.state.loadState = 'loading';
    this.state.content = {
      releaseId: String(params.releaseId ?? ''),
      sourceId: String(params.sourceId ?? ''),
      ep: String(params.ep ?? ''),
      dubberId: params.dubberId != null ? String(params.dubberId) : undefined,
      title: String(params.title ?? ''),
      sourceName: String(params.sourceName ?? ''),
    };
    if (typeof params.seek === 'number') this.state.currentTime = params.seek;
    if (typeof params.paused === 'boolean') this.state.paused = params.paused;
    this.emit('content', { content: this.state.content, origin });
    this.emitState();
    if (this.loadHandler) {
      await this.loadHandler(params, origin);
    }
  }

  next(opts?: FluoCommandOptions): void {
    const ep = Number(this.state.content?.ep);
    if (!Number.isFinite(ep)) return;
    const nextEp = this.state.queue.find((q: FluoEpisodeItem) => q.position > ep);
    if (!nextEp || !this.state.content) return;
    void this.load({ ...this.state.content, ep: String(nextEp.position), seek: 0, paused: false }, opts);
  }

  previous(opts?: FluoCommandOptions): void {
    const ep = Number(this.state.content?.ep);
    if (!Number.isFinite(ep)) return;
    const prev = [...this.state.queue].reverse().find((q: FluoEpisodeItem) => q.position < ep);
    if (!prev || !this.state.content) return;
    void this.load({ ...this.state.content, ep: String(prev.position), seek: 0, paused: false }, opts);
  }

  /** Применить snapshot часов (sync) без эха в комнату. */
  applyClockSnapshot(snap: {
    content?: FluoContent | null;
    paused: boolean;
    currentTime: number;
    softRate?: number;
  }): void {
    this.lastCommandOrigin = 'sync';
    if (snap.content) {
      const same =
        this.state.content
        && this.state.content.releaseId === snap.content.releaseId
        && this.state.content.sourceId === snap.content.sourceId
        && this.state.content.ep === snap.content.ep
        && String(this.state.content.dubberId ?? '') === String(snap.content.dubberId ?? '');
      if (!same) {
        void this.load({ ...snap.content, seek: snap.currentTime, paused: snap.paused }, { origin: 'sync' });
        return;
      }
    }
    this.withSyncGuard('sync', () => {
      const drift = Math.abs((this.video?.currentTime ?? this.state.currentTime) - snap.currentTime);
      if (drift > 0.8 && this.video) {
        this.video.currentTime = Math.max(0, snap.currentTime);
        this.state.currentTime = snap.currentTime;
        this.emit('seek', { currentTime: snap.currentTime, origin: 'sync' });
      } else if (typeof snap.softRate === 'number' && this.video) {
        this.video.playbackRate = snap.softRate;
        this.state.playbackRate = snap.softRate;
      }
      if (snap.paused) {
        this.video?.pause();
        this.state.paused = true;
      } else {
        void this.video?.play().catch(() => {});
        this.state.paused = false;
      }
      this.emitState();
    });
  }

  on<K extends FluoEventName>(event: K, cb: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb as Listener<FluoEventName>);
    return () => {
      set!.delete(cb as Listener<FluoEventName>);
    };
  }

  destroy(): void {
    this.destroyed = true;
    this.unbindVideoListeners();
    this.listeners.clear();
    this.loadHandler = null;
    this.qualityHandler = null;
    this.dubberHandler = null;
    this.sourceHandler = null;
    this.video = null;
    this.core = null;
  }

  private emit<K extends FluoEventName>(event: K, payload: FluoEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      try {
        (cb as Listener<K>)(payload);
      } catch {
        /* ignore */
      }
    }
  }

  private emitState(): void {
    this.emit('state', this.getState());
  }

  private syncFromVideo(): void {
    const v = this.video;
    if (!v) return;
    if (!this.applyingSync) {
      this.state.paused = v.paused;
      this.state.currentTime = Number.isFinite(v.currentTime) ? v.currentTime : this.state.currentTime;
    }
    if (Number.isFinite(v.duration) && v.duration > 0) this.state.duration = v.duration;
  }

  private applyVolumeToMedia(): void {
    const muted = this.state.muted || this.state.volume <= 0;
    const linear = muted ? 0 : Math.max(0, Math.min(1, this.state.volume / 100));
    this.core?.surround.setOutputLevel(linear);
    if (!this.video) return;
    this.video.muted = muted;
    this.video.volume = linear;
  }

  private withSyncGuard(origin: FluoOrigin, fn: () => void): void {
    const guard = origin === 'sync';
    if (guard) this.applyingSync = true;
    try {
      fn();
    } finally {
      if (guard) {
        window.setTimeout(() => {
          this.applyingSync = false;
        }, 400);
      }
    }
  }

  private bindVideoListeners(): void {
    const v = this.video;
    if (!v) return;
    v.addEventListener('timeupdate', this.onVideoTimeUpdate);
    v.addEventListener('play', this.onVideoPlay);
    v.addEventListener('pause', this.onVideoPause);
    v.addEventListener('ended', this.onVideoEnded);
    v.addEventListener('waiting', this.onVideoWaiting);
    v.addEventListener('playing', this.onVideoPlaying);
  }

  private unbindVideoListeners(): void {
    const v = this.video;
    if (!v) return;
    v.removeEventListener('timeupdate', this.onVideoTimeUpdate);
    v.removeEventListener('play', this.onVideoPlay);
    v.removeEventListener('pause', this.onVideoPause);
    v.removeEventListener('ended', this.onVideoEnded);
    v.removeEventListener('waiting', this.onVideoWaiting);
    v.removeEventListener('playing', this.onVideoPlaying);
  }
}

let singleton: FluoPlayer | null = null;

export function getFluoPlayer(): FluoPlayer {
  if (!singleton) singleton = new FluoPlayer();
  return singleton;
}

export function resetFluoPlayer(): void {
  singleton?.destroy();
  singleton = new FluoPlayer();
}
