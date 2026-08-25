import { fmtTime } from './_utils';
import type { PlayerLoadState } from './_types';
import type { Anime4kIntensity, Anime4kType } from './core/anime4k-presets';
import type { SurroundMode } from './core/surround-audio';
import { defaultEqGains, type EqGains } from './core/surround-eq';

export class PlayerState {
  loadState      = $state<PlayerLoadState>('loading');
  errorText      = $state('');
  paused         = $state(true);
  muted          = $state(false);
  isFullscreen   = $state(false);
  currentTime    = $state(0);
  duration       = $state(0);
  bufferedEnd    = $state(0);
  bufferedRanges = $state<{ start: number; end: number }[]>([]);
  volume         = $state(100);
  useVideo       = $state(false);
  playUrl        = $state('');
  upscaleEnabled = $state(false);
  upscaleMode    = $state(15);
  upscaleType    = $state<Anime4kType>('off');
  upscaleIntensity = $state<Anime4kIntensity>('optimal');
  /** Canvas Anime4K показан (Svelte не должен заново ставить hidden). */
  upscaleCanvasOn = $state(false);
  /** Оверлей отладки (настройки → воспроизведение) */
  debugOverlay   = $state(false);
  overlayVisible = $state(true);
  /** Смена серии/тайтла: поверх видео постер и «Загрузка…». */
  switching      = $state(false);

  // ── Playback settings ───────────────────────────────────────────────────
  playbackRate       = $state(1);
  /** 'auto' | '16/9' | '4/3' | '21/9' */
  aspectRatio        = $state('auto');
  /** Виртуальный surround / EQ */
  surroundMode       = $state<SurroundMode>('off');
  eqGains            = $state<EqGains>(defaultEqGains());
  eqLevel             = $state(0);
  /** Quality label → direct URL (e.g. { "720": "https://...720.m3u8" }) */
  availableQualities = $state<Record<string, string>>({});
  /** Currently selected quality label (e.g. "720") */
  currentQuality     = $state('');

  currentTimeDisplay = $derived(fmtTime(this.currentTime));
  totalTimeDisplay   = $derived(fmtTime(this.duration));
  timeDisplay        = $derived(`${fmtTime(this.currentTime)} / ${fmtTime(this.duration)}`);
  progressPct        = $derived(this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0);
  bufferedPct        = $derived(this.duration > 0 ? (this.bufferedEnd  / this.duration) * 100 : 0);
  bufferedRangePcts  = $derived.by(() => {
    if (!(this.duration > 0)) return [] as { startPct: number; endPct: number }[];
    return this.bufferedRanges.map((r) => ({
      startPct: (r.start / this.duration) * 100,
      endPct: (r.end / this.duration) * 100,
    }));
  });
}
