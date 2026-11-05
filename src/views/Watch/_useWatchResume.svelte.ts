import {
  fetchWatchProgress,
  isResumable,
  saveWatchProgress,
  type WatchProgress,
} from '../../services/watch-progress';

/** The saved timecode is only overwritten once the question about it is closed. */
type Phase = 'off' | 'checking' | 'pending' | 'prompt' | 'open';

type EpisodeContext = Omit<WatchProgress, 'position_sec' | 'duration_sec' | 'updated_at'>;

const SAVE_EVERY_MS = 15_000;
/** Shorter positions are the transient start of a stream, not a place to come back to. */
const MIN_SAVE_SEC = 3;
/** The answer came this late: playback has moved on, stopping it would only get in the way. */
const PROMPT_LATEST_SEC = 30;

/**
 * Solo progress of the current episode: asks about the saved timecode and writes the new one.
 * In a room it does nothing: the position belongs to the room, not to the user.
 */
export class WatchResume {
  /** Set while the player shows the question. */
  prompt = $state<{ position: number; duration: number } | null>(null);
  private phase = $state<Phase>('off');

  private key = '';
  private saved: WatchProgress | null = null;
  private sample: WatchProgress | null = null;
  private dirty = false;
  private lastSaveAt = 0;
  private loadGen = 0;
  private autoAccept = false;

  /** The saved timecode waits for its question: autoplay must not run past it. */
  holdsPlayback = $derived(this.phase === 'pending' || this.phase === 'prompt');
  /** A timecode was found, the question appears once the episode has loaded. */
  isPending = $derived(this.phase === 'pending');

  /**
   * A different episode was opened. `startsElsewhere`: the player was told where to start.
   * `autoAccept`: «Смотреть» on the home card, the user already said continue.
   */
  openEpisode(key: string, releaseId: number, episode: number, opts: { room: boolean; startsElsewhere: boolean; autoAccept: boolean }): void {
    if (key === this.key) return;
    this.flush();
    this.key = key;
    this.sample = null;
    this.saved = null;
    this.prompt = null;
    this.autoAccept = opts.autoAccept;
    const gen = ++this.loadGen;
    if (!key) {
      this.phase = 'off';
      return;
    }
    if (opts.room || opts.startsElsewhere) {
      this.phase = 'open';
      return;
    }
    this.phase = 'checking';
    void fetchWatchProgress(releaseId, episode).then((items) => {
      if (gen !== this.loadGen || this.phase !== 'checking') return;
      // Unknown state of the server: do not risk overwriting a timecode we have not seen.
      if (!items) {
        this.phase = 'off';
        return;
      }
      const hit = items[0];
      if (hit && isResumable(hit)) {
        this.saved = hit;
        this.phase = 'pending';
      } else {
        this.phase = 'open';
      }
    });
  }

  /** The episode has loaded: ask. Returns true when the question went up and playback has to stop. */
  showPrompt(currentTime: number): boolean {
    if (this.phase !== 'pending' || !this.saved) return false;
    if (currentTime > PROMPT_LATEST_SEC) {
      this.phase = 'open';
      return false;
    }
    this.prompt = { position: this.saved.position_sec, duration: this.saved.duration_sec };
    this.phase = 'prompt';
    return true;
  }

  /** The question is already answered: no need to show it. */
  get answeredYes(): boolean {
    return this.autoAccept;
  }

  /** Continue from the timecode; returns the position to seek to. */
  accept(): number | null {
    const position = this.prompt?.position ?? null;
    this.close();
    return position;
  }

  /** Started over: the old timecode is overwritten right away. */
  decline(ctx: EpisodeContext, duration: number): void {
    this.close();
    const total = Number.isFinite(duration) && duration > 0 ? duration : this.saved?.duration_sec ?? 0;
    if (total > 0) void saveWatchProgress({ ...ctx, position_sec: 0, duration_sec: total });
  }

  /** The user went elsewhere in the episode: what they watch from now on overwrites the timecode. */
  close(): void {
    this.prompt = null;
    if (this.phase === 'pending' || this.phase === 'prompt') this.phase = 'open';
  }

  /** A room took over the player: no question, no holding playback, no more writes. */
  enterRoom(): void {
    this.flush();
    this.loadGen++;
    this.prompt = null;
    this.sample = null;
    if (this.phase !== 'off') this.phase = 'open';
  }

  /** Called on `timeupdate`; `solid` = the video really shows this episode (no room, no source swap). */
  track(ctx: EpisodeContext, position: number, duration: number, opts: { solid: boolean; playing: boolean }): void {
    if (this.phase !== 'open' || !opts.solid) return;
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;
    if (position < MIN_SAVE_SEC || position > duration) return;
    this.sample = { ...ctx, position_sec: position, duration_sec: duration };
    this.dirty = true;
    if (opts.playing && Date.now() - this.lastSaveAt >= SAVE_EVERY_MS) this.flush();
  }

  /** Writes the last position, if there is a new one. */
  flush(): void {
    if (!this.dirty || !this.sample) return;
    this.dirty = false;
    this.lastSaveAt = Date.now();
    const sample = this.sample;
    void saveWatchProgress(sample).then((ok) => {
      // Lost: the next tick or flush tries again unless a newer position already waits.
      if (!ok && this.sample === sample) this.dirty = true;
    });
  }
}
