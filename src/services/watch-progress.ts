/** Where the user stopped in each episode (anixback); the bridge attaches the Anixart token. */
import { getAnixbackDirectOrigin, whenAnixbackEndpointReady } from './anixback-endpoint';

export interface WatchProgress {
  release_id: number;
  episode_position: number;
  position_sec: number;
  duration_sec: number;
  source_id: number | null;
  source_name: string | null;
  dubber_id: number | null;
  dubber_name: string | null;
  updated_at?: string;
}

/** Earlier than this there is nothing to come back to. */
const MIN_RESUME_SEC = 10;

/** The credits are left: the episode counts as finished (up to 8%, at most 2.5 min, at least 10 s). */
export function isWatchFinished(p: Pick<WatchProgress, 'position_sec' | 'duration_sec'>): boolean {
  const creditsSec = Math.max(10, Math.min(p.duration_sec * 0.08, 150));
  return p.duration_sec - p.position_sec <= creditsSec;
}

/** Worth offering to continue and worth showing a timecode on the episode. */
export function isResumable(p: Pick<WatchProgress, 'position_sec' | 'duration_sec'>): boolean {
  return p.position_sec >= MIN_RESUME_SEC && !isWatchFinished(p);
}

let endpointKnown = false;

function send(method: 'GET' | 'PUT', extra: { query?: Record<string, number>; body?: unknown }) {
  const request = () =>
    window.anixApi?.client?.watchProgress?.({ origin: getAnixbackDirectOrigin(), method, ...extra });
  // Once known, the call goes out synchronously: the last save happens while the player window closes.
  if (endpointKnown) return request();
  return whenAnixbackEndpointReady().then(() => {
    endpointKnown = true;
    return request();
  });
}

/** Timecodes of a release, newest first; `null` when they could not be read. */
export async function fetchWatchProgress(releaseId: number, episode?: number): Promise<WatchProgress[] | null> {
  try {
    const query: Record<string, number> = { release_id: releaseId };
    if (episode !== undefined) query.episode = episode;
    const res = await send('GET', { query });
    return res?.ok ? ((res.items ?? []) as WatchProgress[]) : null;
  } catch {
    return null;
  }
}

/** Overwrites the timecode of this episode; `false` when it did not reach the server. */
export async function saveWatchProgress(progress: WatchProgress): Promise<boolean> {
  try {
    const res = await send('PUT', { body: progress });
    return !!res?.ok;
  } catch {
    return false;
  }
}
