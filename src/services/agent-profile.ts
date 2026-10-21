/**
 * Profile snapshot for AAWA: collected here, in the app, through the bridge that
 * holds the Anixart token — anixback never gets (or keeps) the token itself.
 * Sent with chat requests only while «Доступ к профилю» is on. Cached for 10 min.
 */

const TTL_MS = 10 * 60 * 1000;
const PER_LIST = 40;

interface SnapItem {
  id: number;
  title: string | null;
  year: string | null;
  grade: number | null;
  genres: string[];
  my_vote?: number;
}

export interface AgentProfileSnapshot {
  login: string | null;
  counts: Record<string, number | null>;
  watched_episodes: number | null;
  watched_hours: number | null;
  friends: number | null;
  collections: number | null;
  registered: string | null;
  votes: SnapItem[];
  lists: Record<string, SnapItem[]>;
}

let cache: { profileId: number; at: number; data: AgentProfileSnapshot } | null = null;
let inFlight: Promise<AgentProfileSnapshot | null> | null = null;

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function item(raw: unknown): SnapItem | null {
  const r = rec(raw);
  const id = num(r?.id);
  if (!r || !id) return null;
  const vote = num(r.my_vote ?? r.your_vote);
  return {
    id,
    title: typeof r.title_ru === 'string' ? r.title_ru : typeof r.title_original === 'string' ? r.title_original : null,
    year: r.year != null ? String(r.year) : null,
    grade: typeof r.grade === 'number' ? Math.round(r.grade * 100) / 100 : null,
    genres: typeof r.genres === 'string' ? r.genres.split(',').map((g) => g.trim()).filter(Boolean).slice(0, 5) : [],
    ...(vote && vote > 0 ? { my_vote: vote } : {}),
  };
}

function items(res: unknown): SnapItem[] {
  const r = rec(res);
  const content = [r?.content, r?.releases, r?.history, r?.favorites].find((x): x is unknown[] => Array.isArray(x)) ?? [];
  return content.map(item).filter((x): x is SnapItem => x != null).slice(0, PER_LIST);
}

function selfProfileId(): number {
  return Number((window as { __anixProfile?: { id?: number } }).__anixProfile?.id ?? 0) || 0;
}

/** `__anixProfile` is set by the layout, but the agent tab can open first — ask the bridge as a fallback. */
export async function resolveProfileId(): Promise<number> {
  const direct = selfProfileId();
  if (direct) return direct;
  const pending = window.anixApi?.profile?.self?.();
  const self = pending ? await pending.catch(() => null) : null;
  return Number(rec(rec(self)?.profile)?.id ?? 0) || 0;
}

async function collect(profileId: number): Promise<AgentProfileSnapshot | null> {
  const api = window.anixApi;
  if (!api) return null;
  const safe = <T>(p: Promise<T> | undefined): Promise<T | null> => (p ? p.catch(() => null) : Promise.resolve(null));
  const bookmarks = (type: number) => safe(api.profile.getBookmarks?.(profileId, type, 0, 1, 0, 0));
  const [info, watching, planned, completed, holdOn, dropped, favorites, history] = await Promise.all([
    safe(api.profile.info(profileId)),
    bookmarks(1),
    bookmarks(2),
    bookmarks(3),
    bookmarks(4),
    bookmarks(5),
    safe(api.favorites?.all?.(0)),
    safe(api.history?.all?.(0)),
  ]);
  const p = rec(rec(info)?.profile);
  // Don't cache an empty snapshot when the profile request itself failed.
  if (!p) return null;
  return {
    login: typeof p.login === 'string' ? p.login : null,
    counts: {
      watching: num(p.watching_count),
      planned: num(p.plan_count),
      completed: num(p.completed_count),
      hold_on: num(p.hold_on_count),
      dropped: num(p.dropped_count),
      favorites: num(p.favorite_count),
    },
    watched_episodes: num(p.watched_episode_count),
    watched_hours: p.watched_time != null ? Math.round(Number(p.watched_time) / 3600) : null,
    friends: num(p.friend_count),
    collections: num(p.collection_count),
    registered: p.register_date ? new Date(Number(p.register_date) * 1000).toISOString().slice(0, 10) : null,
    votes: (Array.isArray(p.votes) ? p.votes : []).map(item).filter((x): x is SnapItem => x != null).slice(0, 20),
    lists: {
      watching: items(watching),
      planned: items(planned),
      completed: items(completed),
      hold_on: items(holdOn),
      dropped: items(dropped),
      favorites: items(favorites),
      history: items(history),
    },
  };
}

/** Current user's snapshot (cached); null when not logged in or the API is unavailable. */
export async function getAgentProfileSnapshot(): Promise<AgentProfileSnapshot | null> {
  const profileId = await resolveProfileId();
  if (!profileId) return null;
  if (cache && cache.profileId === profileId && Date.now() - cache.at < TTL_MS) return cache.data;
  inFlight ??= collect(profileId)
    .then((data) => {
      if (data) cache = { profileId, at: Date.now(), data };
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function resetAgentProfileSnapshot(): void {
  cache = null;
}

/** Same compact release shape for the agent's other tools (agent-client-tools.ts). */
export const snapshotItem = item;
