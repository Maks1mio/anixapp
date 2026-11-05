import { writable } from 'svelte/store';
import { getAnixbackOrigin, getApiBase } from './anixback-endpoint';

/** One grabbed frame, plus the second angle when the catalog has it. */
export interface EpisodeCover {
  url: string;
  alt?: string;
}

/** anixmedia: episode covers and screenshots grabbed from the players on request. */
export interface ReleaseMedia {
  release_id: number;
  state: 'none' | 'planning' | 'working' | 'ready' | 'empty';
  /** episode position → cover */
  episodes: Record<string, EpisodeCover>;
  /** episodes the players don't have: no frame will come, a stub instead */
  missing?: number[];
  screenshots: string[];
  pending: number;
}

const STORAGE_KEY = 'anix:release-media-v1';
const STORAGE_MAX = 8;

const mediaBase = () => `${getAnixbackOrigin()}/api/anixapp`;
const abs = (url: string) => (url.startsWith('/') ? `${getAnixbackOrigin()}${url}` : url);

/** What the API sends: `episodes` is position → URL, the second frames come in `episodes_alt`. */
type MediaResponse = Omit<ReleaseMedia, 'episodes'> & {
  episodes?: Record<string, string | EpisodeCover>;
  episodes_alt?: Record<string, string>;
};

/** Takes the API's URL or an already built cover from the local cache. */
function asCover(raw: string | EpisodeCover, altRaw?: string): EpisodeCover {
  const cover = typeof raw === 'string' ? { url: raw } : raw;
  const alt = altRaw ?? cover.alt;
  return { url: abs(cover.url), ...(alt ? { alt: abs(alt) } : {}) };
}

function normalizeMedia({ episodes_alt: alts, ...m }: MediaResponse): ReleaseMedia {
  return {
    ...m,
    episodes: Object.fromEntries(
      Object.entries(m.episodes ?? {}).map(([position, raw]) => [position, asCover(raw, alts?.[position])]),
    ),
    screenshots: (m.screenshots ?? []).map(abs),
  };
}

function loadStored(): MediaResponse[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as MediaResponse[];
    if (!Array.isArray(list)) return [];
    return list.filter((item) => item && typeof item.release_id === 'number' && item.episodes);
  } catch {
    return [];
  }
}

const persisted = new Map<number, ReleaseMedia>();
for (const item of loadStored()) persisted.set(item.release_id, normalizeMedia(item));

/** releaseId → media; the release page fills it, the watch modal reads it. */
export const releaseMedia = writable<Record<number, ReleaseMedia>>(Object.fromEntries(persisted));

function remember(media: ReleaseMedia) {
  persisted.delete(media.release_id);
  persisted.set(media.release_id, media);
  while (persisted.size > STORAGE_MAX) {
    const oldest = persisted.keys().next().value;
    if (oldest == null) break;
    persisted.delete(oldest);
  }
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...persisted.values()]));
  } catch {
    /* quota */
  }
}

function store(m: MediaResponse) {
  const media = normalizeMedia(m);
  releaseMedia.update((all) => ({ ...all, [m.release_id]: media }));
  remember(media);
}

async function call(method: 'GET' | 'POST', releaseId: number, suffix = ''): Promise<MediaResponse | null> {
  try {
    const res = await fetch(`${mediaBase()}/media/${releaseId}${suffix}`, { method, signal: AbortSignal.timeout(10_000) });
    return res.ok ? ((await res.json()) as MediaResponse) : null;
  } catch {
    return null;
  }
}

const POLL_MS = 6_000;
/** Long series are grabbed for hours — the page stops polling after this, the next open resumes. */
const POLL_FOR_MS = 15 * 60_000;

/**
 * Release opened: refresh its catalog data, ask for covers (queues new episodes, if any) and
 * poll while frames are being grabbed. Returns the stop function for the caller's cleanup.
 * The release page and the watch modal share one watcher.
 */
export function watchReleaseMedia(releaseId: number): () => void {
  let watcher = watchers.get(releaseId);
  if (!watcher) {
    watcher = { refs: 0, stop: startWatching(releaseId) };
    watchers.set(releaseId, watcher);
  }
  const shared = watcher;
  shared.refs += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    shared.refs -= 1;
    if (shared.refs === 0) {
      shared.stop();
      watchers.delete(releaseId);
    }
  };
}

const watchers = new Map<number, { refs: number; stop: () => void }>();

function startWatching(releaseId: number): () => void {
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
