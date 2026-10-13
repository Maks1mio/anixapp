import { getApiBase } from './anixback-endpoint';

export interface AppBadge {
  slug: string;
  name: string;
  image_url: string;
  status: 'pending' | 'purchased' | 'granted';
  is_custom: boolean;
}

export interface BadgesMeResult {
  badges: AppBadge[];
  default_badge: { slug: string; name: string; image_url: string };
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

// ── public bulk lookup (other users) with in-memory cache ──────────────────

const CACHE_TTL_MS = 3 * 60 * 1000;
const cache = new Map<number, { badges: AppBadge[]; at: number }>();
let inflight: Promise<Map<number, AppBadge[]>> | null = null;

export function getCachedBadges(profileId: number): AppBadge[] | null {
  const hit = cache.get(profileId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.badges;
  return null;
}

export function cacheBadges(profileId: number, badges: AppBadge[]): void {
  cache.set(profileId, { badges, at: Date.now() });
}

/** Bulk fetch badges for many users (lents, comments, profiles). Cached. */
export async function fetchUsersBadges(profileIds: number[]): Promise<Map<number, AppBadge[]>> {
  const result = new Map<number, AppBadge[]>();
  const missing: number[] = [];
  const now = Date.now();

  for (const id of profileIds) {
    if (id <= 0) continue;
    const hit = cache.get(id);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      result.set(id, hit.badges);
    } else {
      missing.push(id);
    }
  }

  if (missing.length === 0) return result;

  // Deduplicate concurrent bulk calls
  if (!inflight) {
    inflight = (async () => {
      const map = new Map<number, AppBadge[]>();
      try {
        const ids = missing.slice(0, 200).join(',');
        const res = await fetch(`${getApiBase()}/badges/users?ids=${ids}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = (await res.json()) as { badges?: Record<string, AppBadge[]> };
          for (const [uid, badges] of Object.entries(data.badges ?? {})) {
            const id = Number(uid);
            if (!Number.isFinite(id)) continue;
            map.set(id, badges);
            cache.set(id, { badges, at: Date.now() });
          }
        }
      } catch {
        /* network error — empty result */
      }
      return map;
    })().finally(() => {
      inflight = null;
    });
  }

  const fetched = await inflight;
  for (const id of missing) {
    result.set(id, fetched.get(id) ?? []);
  }
  return result;
}
