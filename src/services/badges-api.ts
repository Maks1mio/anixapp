import { getApiBase } from './anixback-endpoint';

export interface AppBadge {
  slug: string;
  /** Hover title (custom per user, or «В AnixApp с …» for the default badge). */
  name: string;
  image_url: string;
  status: 'pending' | 'purchased' | 'granted';
  is_custom: boolean;
}

export interface BadgesMeResult {
  badges: AppBadge[];
  /** null until the user has launched AnixApp at least once (verified by anixback). */
  default_badge: { slug: string; name: string; image_url: string } | null;
  telegram: { linked: boolean; username: string | null };
}

export interface LinkCodeResult {
  code: string;
  expires_at: string;
  bot_username: string;
  linked: boolean;
  telegram_username: string | null;
}

function appHeaders(profileId: number): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Anixart-User-Id': String(profileId),
  };
}

/** Own badges + telegram link state. */
export async function fetchMyBadges(profileId: number, token: string): Promise<BadgesMeResult | null> {
  try {
    const res = await fetch(`${getApiBase()}/badges/me`, {
      headers: { ...appHeaders(profileId), 'x-anixapp-proxy-key': token },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as BadgesMeResult;
  } catch {
    return null;
  }
}

/** How a badge reached the user (anixback `/badges/events`). */
export interface BadgeEvent {
  id: number;
  slug: string;
  name: string;
  image_url: string | null;
  /** purchase — купил сам; gift — подарок (from); anon_gift — анонимно; granted — выдал админ. */
  kind: 'purchase' | 'gift' | 'anon_gift' | 'granted';
  from: { user_id: number | null; login: string | null; avatar: string | null; telegram: string | null } | null;
  created_at: string;
}

/** Badge notifications for the current user, newest first. */
export async function fetchBadgeEvents(profileId: number): Promise<BadgeEvent[] | null> {
  try {
    const res = await fetch(`${getApiBase()}/badges/events`, {
      headers: appHeaders(profileId),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: BadgeEvent[] };
    return Array.isArray(data.events) ? data.events : [];
  } catch {
    return null;
  }
}

/** Create one-time code to link Telegram via bot. */
export async function createLinkCode(profileId: number, token: string): Promise<LinkCodeResult | null> {
  try {
    const res = await fetch(`${getApiBase()}/badges/link-code`, {
      method: 'POST',
      headers: { ...appHeaders(profileId), 'x-anixapp-proxy-key': token },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as LinkCodeResult;
  } catch {
    return null;
  }
}

// ── public bulk lookup (other users): batched + cached ─────────────────────
// Lists render many profiles at once (comments, feed, friends): every AppBadges
// mount asks for one id, the loader merges them into /badges/users?ids=… requests.

const CACHE_TTL_MS = 3 * 60 * 1000;
const BATCH_DELAY_MS = 30;
const BATCH_MAX = 200;

const cache = new Map<number, { badges: AppBadge[]; at: number }>();
const waiting = new Map<number, Array<(badges: AppBadge[]) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function getCachedBadges(profileId: number): AppBadge[] | null {
  const hit = cache.get(profileId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.badges;
  return null;
}

export function cacheBadges(profileId: number, badges: AppBadge[]): void {
  cache.set(profileId, { badges, at: Date.now() });
}

export function invalidateBadges(profileId: number): void {
  cache.delete(profileId);
}

async function requestChunk(ids: number[]): Promise<Map<number, AppBadge[]> | null> {
  try {
    const res = await fetch(`${getApiBase()}/badges/users?ids=${ids.join(',')}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { badges?: Record<string, AppBadge[]> };
    const map = new Map<number, AppBadge[]>();
    for (const [uid, badges] of Object.entries(data.badges ?? {})) {
      const id = Number(uid);
      if (Number.isFinite(id) && Array.isArray(badges)) map.set(id, badges);
    }
    return map;
  } catch {
    return null;
  }
}

async function flush(): Promise<void> {
  flushTimer = null;
  const batch = new Map(waiting);
  waiting.clear();
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += BATCH_MAX) {
    const chunk = ids.slice(i, i + BATCH_MAX);
    const map = await requestChunk(chunk);
    for (const id of chunk) {
      const badges = map?.get(id) ?? [];
      // Cache "no badges" too, but only when the server actually answered.
      if (map) cacheBadges(id, badges);
      for (const resolve of batch.get(id) ?? []) resolve(badges);
    }
  }
}

/** Badges of one profile; concurrent calls are merged into one bulk request. */
export function loadUserBadges(profileId: number): Promise<AppBadge[]> {
  if (!Number.isFinite(profileId) || profileId <= 0) return Promise.resolve([]);
  const hit = getCachedBadges(profileId);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const list = waiting.get(profileId);
    if (list) list.push(resolve);
    else waiting.set(profileId, [resolve]);
    flushTimer ??= setTimeout(() => void flush(), BATCH_DELAY_MS);
  });
}

/** Bulk fetch badges for many users. Cached. */
export async function fetchUsersBadges(profileIds: number[]): Promise<Map<number, AppBadge[]>> {
  const ids = [...new Set(profileIds.filter((id) => id > 0))];
  const lists = await Promise.all(ids.map((id) => loadUserBadges(id)));
  return new Map(ids.map((id, i) => [id, lists[i]]));
}

/** Visible badges; order comes from anixback (admin-defined, «В AnixApp» first by default). */
export function visibleAppBadges(badges: AppBadge[]): AppBadge[] {
  return badges.filter((b) => b.status !== 'pending');
}

// ── public catalog (support modal) ────────────────────────────────────────

export interface BadgeCatalogType {
  slug: string;
  name: string;
  image_url: string;
  price: number | null;
  is_custom: boolean;
  description: string | null;
  /** Chat agent requests per day for Anix+ tiers; null for other badges / older anixback. */
  agent_daily_limit?: number | null;
}

let catalogCache: { types: BadgeCatalogType[]; at: number } | null = null;

/** Badge types with prices (Anix+ tiers). Cached for 10 minutes. */
export async function fetchBadgeCatalog(): Promise<BadgeCatalogType[]> {
  if (catalogCache && Date.now() - catalogCache.at < 10 * 60 * 1000) return catalogCache.types;
  try {
    const res = await fetch(`${getApiBase()}/badges/catalog`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return catalogCache?.types ?? [];
    const data = (await res.json()) as { types?: BadgeCatalogType[] };
    const types = Array.isArray(data.types) ? data.types : [];
    catalogCache = { types, at: Date.now() };
    return types;
  } catch {
    return catalogCache?.types ?? [];
  }
}
