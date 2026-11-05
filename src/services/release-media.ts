import { writable } from 'svelte/store';
import { getAnixbackOrigin, getApiBase } from './anixback-endpoint';

/** anixmedia: episode covers and screenshots grabbed from the players on request. */
export interface ReleaseMedia {
  release_id: number;
  state: 'none' | 'planning' | 'working' | 'ready' | 'empty';
  /** episode position → cover URL */
  episodes: Record<string, string>;
  /** episodes the players don't have: no frame will come, a stub instead */
  missing?: number[];
  screenshots: string[];
  pending: number;
}

/** releaseId → media; the release page fills it, the watch modal reads it. */
export const releaseMedia = writable<Record<number, ReleaseMedia>>({});

const mediaBase = () => `${getAnixbackOrigin()}/api/anixapp`;
const abs = (url: string) => (url.startsWith('/') ? `${getAnixbackOrigin()}${url}` : url);

function store(m: ReleaseMedia) {
  const media: ReleaseMedia = {
    ...m,
    episodes: Object.fromEntries(Object.entries(m.episodes ?? {}).map(([k, v]) => [k, abs(v)])),
    screenshots: (m.screenshots ?? []).map(abs),
  };
  releaseMedia.update((all) => ({ ...all, [m.release_id]: media }));
}

async function call(method: 'GET' | 'POST', releaseId: number, suffix = ''): Promise<ReleaseMedia | null> {
  try {
    const res = await fetch(`${mediaBase()}/media/${releaseId}${suffix}`, { method, signal: AbortSignal.timeout(10_000) });
    return res.ok ? ((await res.json()) as ReleaseMedia) : null;
  } catch {
    return null;
  }
}

const POLL_MS = 6_000;
/** Long series are grabbed for hours — the page stops polling after this, the next open resumes. */
const POLL_FOR_MS = 15 * 60_000;

/**
 * Release opened: refresh its catalog data, ask for covers (queues new episodes, if any) and
 * poll while frames are being grabbed. Returns the stop function for the page's cleanup.
 */
export function watchReleaseMedia(releaseId: number): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const until = Date.now() + POLL_FOR_MS;

  void fetch(`${getApiBase()}/releases/${releaseId}/refresh`, { method: 'POST', signal: AbortSignal.timeout(30_000) }).catch(
    () => undefined,
  );

  const tick = async (first: boolean) => {
    const m = await call(first ? 'POST' : 'GET', releaseId, first ? '/sync' : '');
    if (stopped) return;
    if (m) store(m);
    // No answer (service down, old backend) — don't keep hammering it.
    const busy = !!m && (m.state === 'planning' || m.state === 'working');
    if (busy && Date.now() < until) timer = setTimeout(() => void tick(false), POLL_MS);
  };
  void tick(true);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
