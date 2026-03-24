import { fmtTime } from './_utils';
import type { PlayerLoadState } from './_types';

export class PlayerState {
  loadState      = $state<PlayerLoadState>('loading');
  errorText      = $state('');
  paused         = $state(true);
  muted          = $state(false);
  isFullscreen   = $state(false);
  currentTime    = $state(0);
  duration       = $state(0);
  bufferedEnd    = $state(0);
  volume         = $state(100);
  useVideo       = $state(false);
  playUrl        = $state('');
  upscaleEnabled = $state(false);
  upscaleMode    = $state(15);
  /** Оверлей отладки (настройки → воспроизведение) */
  debugOverlay   = $state(false);
  overlayVisible = $state(false);

  currentTimeDisplay = $derived(fmtTime(this.currentTime));
  totalTimeDisplay   = $derived(fmtTime(this.duration));
  timeDisplay        = $derived(`${fmtTime(this.currentTime)} / ${fmtTime(this.duration)}`);
  progressPct        = $derived(this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0);
  bufferedPct        = $derived(this.duration > 0 ? (this.bufferedEnd  / this.duration) * 100 : 0);
}
