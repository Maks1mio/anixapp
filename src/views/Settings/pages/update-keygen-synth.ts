import { ChiptuneJsPlayer } from '../../../vendor/chiptune3/chiptune3.js';

export type KeygenTrackId = 'tmg' | 'snd' | 'zwt' | 'underpl' | 'digerati' | 'incar';

export type KeygenTrack = {
  id: KeygenTrackId;
  label: string;
  /** path relative to site root, without leading slash */
  path: string;
};

export const BOSS_TRACK: KeygenTrack = {
  id: 'incar',
  label: 'INCAR — Hard Disk Sentinel',
  path: 'keygen/incar-hard-disk-sentinel.it',
};

export const KEYGEN_TRACKS: KeygenTrack[] = [
  {
    id: 'tmg',
    label: 'TMG — DocumentConverter',
    path: 'keygen/tmg-documentconverter.xm',
  },
  {
    id: 'snd',
    label: 'SnD — WinTools.net Pro',
    path: 'keygen/snd-wintools.xm',
  },
  {
    id: 'zwt',
    label: 'ZWT — Spy-KillDeluxe',
    path: 'keygen/zwt-spy-killdeluxe.xm',
  },
  {
    id: 'underpl',
    label: 'UnderPL — Photo Slide Show',
    path: 'keygen/underpl-photo-slideshow.xm',
  },
  {
    id: 'digerati',
    label: 'DiGERATi — AutoRun III',
    path: 'keygen/digerati-autorun-iii.xm',
  },
  BOSS_TRACK,
];

type ChiptunePlayer = {
  context: AudioContext;
  duration?: number;
  currentTime?: number;
  load: (url: string) => void;
  play: (buf: ArrayBuffer) => void;
  stop: () => void;
  pause: () => void;
  unpause: () => void;
  togglePause: () => void;
  setVol: (v: number) => void;
  setRepeatCount: (n: number) => void;
  onInitialized: (fn: () => void) => void;
  onMetadata: (fn: (meta: {
    dur?: number;
    title?: string;
    artist?: string;
    message?: string;
    [key: string]: unknown;
  }) => void) => void;
  onProgress: (fn: (data: { pos?: number }) => void) => void;
  onEnded: (fn: () => void) => void;
  onError: (fn: (err: unknown) => void) => void;
};

function assetUrl(relPath: string): string {
  const base = import.meta.env.BASE_URL || './';
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}${relPath.replace(/^\//, '')}`;
}

function pickRandomTrack(exclude?: KeygenTrackId | null): KeygenTrack {
  const pool = exclude
    ? KEYGEN_TRACKS.filter((t) => t.id !== exclude)
    : KEYGEN_TRACKS;
  const list = pool.length ? pool : KEYGEN_TRACKS;
  return list[Math.floor(Math.random() * list.length)]!;
}

function trackIndex(id: KeygenTrackId | null | undefined): number {
  if (!id) return -1;
  return KEYGEN_TRACKS.findIndex((t) => t.id === id);
}

function trackByOffset(from: KeygenTrackId | null | undefined, delta: number): KeygenTrack {
  const n = KEYGEN_TRACKS.length;
  if (!n) throw new Error('no keygen tracks');
  const cur = trackIndex(from);
  const start = cur >= 0 ? cur : 0;
  const next = ((start + delta) % n + n) % n;
  return KEYGEN_TRACKS[next]!;
}

/**
 * Keygen XM/IT player — one Chiptune instance, pause/unpause without reloading,
 * with soft volume fades for play / pause / skip.
 */
export class KeygenXmPlayer {
  private player: ChiptunePlayer | null = null;
  private ready: Promise<ChiptunePlayer> | null = null;
  private playing = false;
  private volume = 0.55;
  private outputVol = 0;
  private duration = 0;
  private position = 0;
  private track: KeygenTrack | null = null;
  private songTitle = '';
  private loadedPath: string | null = null;
  private listeners = new Set<() => void>();
  private fadeToken = 0;
  private opChain: Promise<void> = Promise.resolve();
  /** After boss clear: play each module once, then advance. */
  private autoAdvance = false;
  /** Suppress onEnded while stop/load (stop() otherwise chains auto-advance forever). */
  private suppressEnded = false;
  private lastAdvanceAt = 0;
  private trackStartedAt = 0;

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentTrack(): KeygenTrack | null {
    return this.track;
  }

  /** Real module title from XM metadata (e.g. "Tears of october") */
  get title(): string {
    return this.songTitle || this.track?.label || '';
  }

  /** Keygen / release label under the song title */
  get sourceLabel(): string {
    return this.track?.label ?? '';
  }

  /** 0..1 within the module (or 0 if unknown duration) */
  get progress(): number {
    if (this.duration > 0) return Math.min(1, Math.max(0, this.position / this.duration));
    return 0;
  }

  getVolume(): number {
    return this.volume;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private applyGain(v: number) {
    this.outputVol = Math.min(1, Math.max(0, v));
    this.player?.setVol(this.outputVol);
  }

  private fadeGain(to: number, ms: number): Promise<void> {
    const token = ++this.fadeToken;
    const from = this.outputVol;
    if (!this.player || ms <= 0) {
      this.applyGain(to);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now: number) => {
        if (token !== this.fadeToken) {
          resolve();
          return;
        }
        const p = Math.min(1, (now - t0) / ms);
        // smoothstep
        const e = p * p * (3 - 2 * p);
        this.applyGain(from + (to - from) * e);
        if (p < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  private enqueue(op: () => Promise<void>): Promise<void> {
    this.opChain = this.opChain.then(op, op);
    return this.opChain;
  }

  setAutoAdvance(on: boolean) {
    this.autoAdvance = on;
    this.player?.setRepeatCount(on ? 0 : -1);
    // switching to non-loop mid-song can spuriously fire onEnded — ignore briefly
    if (on) {
      this.trackStartedAt = performance.now();
      this.suppressEnded = true;
      window.setTimeout(() => {
        this.suppressEnded = false;
      }, 800);
    }
  }

  getAutoAdvance(): boolean {
    return this.autoAdvance;
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.playing) this.applyGain(this.volume);
    this.emit();
  }

  private async ensurePlayer(): Promise<ChiptunePlayer> {
    if (this.player) return this.player;
    if (this.ready) return this.ready;

    this.ready = (async () => {
      let initRejected = false;
      const player = new ChiptuneJsPlayer({
        repeatCount: -1,
        workletUrl: assetUrl('keygen/player/chiptune3.worklet.js'),
      }) as unknown as ChiptunePlayer;

      await new Promise<void>((resolve, reject) => {
        const t = window.setTimeout(() => reject(new Error('chiptune init timeout')), 15000);
        player.onInitialized(() => {
          window.clearTimeout(t);
          resolve();
        });
        player.onError((err) => {
          console.error('[keygen]', err);
          this.playing = false;
          this.loadedPath = null;
          this.emit();
          if (!this.player && !initRejected) {
            initRejected = true;
            window.clearTimeout(t);
            reject(err instanceof Error ? err : new Error(String((err as { type?: string })?.type ?? err)));
          }
        });
      });

      player.setRepeatCount(this.autoAdvance ? 0 : -1);
      this.applyGain(0);
      player.onMetadata((meta) => {
        if (typeof meta?.dur === 'number' && meta.dur > 0) {
          this.duration = meta.dur;
        }
        const raw = typeof meta?.title === 'string' ? meta.title.trim() : '';
        this.songTitle = raw;
        this.emit();
      });
      player.onProgress((data) => {
        if (typeof data?.pos === 'number') {
          this.position = data.pos;
          this.emit();
        }
      });
      player.onEnded(() => {
        if (this.suppressEnded) return;
        // ignore bogus immediate ends right after load
        if (performance.now() - this.trackStartedAt < 1200) return;
        if (!this.autoAdvance) {
          this.playing = false;
          this.emit();
          return;
        }
        const now = performance.now();
        if (now - this.lastAdvanceAt < 1500) return;
        this.lastAdvanceAt = now;
        this.playing = false;
        this.emit();
        void this.play({ forceNewTrack: true });
      });

      this.player = player;
      return player;
    })();

    try {
      return await this.ready;
    } catch (e) {
      this.ready = null;
      this.player = null;
      throw e;
    }
  }

  private async loadTrack(next: KeygenTrack, fadeInMs: number) {
    const player = await this.ensurePlayer();
    if (player.context.state === 'suspended') await player.context.resume();

    this.suppressEnded = true;
    try {
      if (this.playing || this.outputVol > 0.01) {
        await this.fadeGain(0, 280);
        player.pause();
        player.stop();
      }

      this.track = next;
      this.songTitle = '';
      this.position = 0;
      this.duration = 0;
      this.loadedPath = next.path;
      this.applyGain(0);
      player.setRepeatCount(this.autoAdvance ? 0 : -1);
      this.trackStartedAt = performance.now();
      player.load(assetUrl(next.path));
      this.playing = true;
      this.emit();
      await this.fadeGain(this.volume, fadeInMs);
    } finally {
      // allow ended only after a beat so stop()/load artifacts are ignored
      window.setTimeout(() => {
        this.suppressEnded = false;
      }, 400);
    }
  }

  /** Start (or resume). Picks a random track when starting fresh. */
  async play(opts?: { forceNewTrack?: boolean; track?: KeygenTrack }) {
    return this.enqueue(async () => {
      const player = await this.ensurePlayer();
      if (player.context.state === 'suspended') await player.context.resume();

      const wantNew = !!opts?.track || !!opts?.forceNewTrack || !this.loadedPath;

      if (!wantNew) {
        if (this.playing && this.outputVol > this.volume * 0.9) return;
        player.unpause();
        this.playing = true;
        this.emit();
        await this.fadeGain(this.volume, 420);
        return;
      }

      const next = opts?.track ?? pickRandomTrack(this.track?.id ?? null);
      await this.loadTrack(next, 520);
    });
  }

  pause() {
    void this.enqueue(async () => {
      if (!this.player || !this.playing) return;
      await this.fadeGain(0, 320);
      this.player.pause();
      this.playing = false;
      this.emit();
    });
  }

  async toggle() {
    if (this.playing) this.pause();
    else await this.play();
  }

  /** Step through the playlist (−1 prev / +1 next) */
  async skip(delta: -1 | 1) {
    const next = trackByOffset(this.track?.id ?? null, delta);
    await this.play({ track: next });
  }

  /** Next random track (skips current when possible) */
  async nextRandom() {
    await this.play({ forceNewTrack: true });
  }

  dispose() {
    this.fadeToken += 1;
    try {
      this.player?.stop();
      this.player?.pause();
      void this.player?.context?.close?.();
    } catch {
      /* ignore */
    }
    this.player = null;
    this.ready = null;
    this.playing = false;
    this.loadedPath = null;
    this.listeners.clear();
  }
}
