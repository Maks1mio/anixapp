/**
 * AnixApp badge notifications (bought / gifted / granted) from anixback.
 * Merged into the Anixart notification list and shown as device toasts.
 * Read state is local: the last seen event id per profile.
 */
import { fetchBadgeEvents, invalidateBadges, type BadgeEvent } from '../services/badges-api';

const CACHE_MS = 20_000;
const SEEN_KEY = 'anixapp.badgeEvents.lastSeen';

let cache: { profileId: number; events: BadgeEvent[]; at: number } | null = null;
let inFlight: Promise<BadgeEvent[]> | null = null;

export function selfProfileId(): number {
  return Number((window as { __anixProfile?: { id?: number } }).__anixProfile?.id ?? 0) || 0;
}

/** Events of the logged-in profile (short cache; empty when anixback is unreachable). */
export async function loadBadgeEvents(force = false): Promise<BadgeEvent[]> {
  const profileId = selfProfileId();
  if (!profileId) return [];
  if (!force && cache && cache.profileId === profileId && Date.now() - cache.at < CACHE_MS) return cache.events;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const events = await fetchBadgeEvents(profileId);
      if (events == null) return cache?.profileId === profileId ? cache.events : [];
      cache = { profileId, events, at: Date.now() };
      return events;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function seenKey(profileId: number): string {
  return `${SEEN_KEY}.${profileId}`;
}

export function lastSeenBadgeEventId(): number {
  const profileId = selfProfileId();
  if (!profileId) return 0;
  try {
    return Number(localStorage.getItem(seenKey(profileId))) || 0;
  } catch {
    return 0;
  }
}

export function markBadgeEventsSeen(events: BadgeEvent[]): void {
  const profileId = selfProfileId();
  const maxId = events.reduce((m, e) => Math.max(m, e.id), 0);
  if (!profileId || maxId <= lastSeenBadgeEventId()) return;
  try {
    localStorage.setItem(seenKey(profileId), String(maxId));
  } catch {
    /* storage blocked */
  }
}

const TOASTED_KEY = 'anixapp.badgeEvents.toasted';

/**
 * Events not yet shown as a device toast (oldest first). The very first run only
 * records a baseline, so existing history doesn't flood the screen; gifts that
 * arrived while the app was closed still toast on the next launch.
 */
export async function takeBadgeEventsForToast(): Promise<BadgeEvent[]> {
  const profileId = selfProfileId();
  if (!profileId) return [];
  const events = await loadBadgeEvents(true);
  const key = `${TOASTED_KEY}.${profileId}`;
  const maxId = events.reduce((m, e) => Math.max(m, e.id), 0);
  let toasted: number | null = null;
  try {
    const raw = localStorage.getItem(key);
    toasted = raw == null ? null : Number(raw) || 0;
    if (maxId > (toasted ?? 0)) localStorage.setItem(key, String(maxId));
  } catch {
    return []; // no storage → can't dedupe across launches, stay quiet
  }
  if (toasted == null) return [];
  const fresh = events.filter((e) => e.id > (toasted as number)).sort((a, b) => a.id - b.id);
  if (fresh.length) onBadgeEventsArrived();
  return fresh;
}

export async function unreadBadgeEventCount(): Promise<number> {
  const seen = lastSeenBadgeEventId();
  return (await loadBadgeEvents()).filter((e) => e.id > seen).length;
}

/** Who/how line, plain text (toasts) — the list renders the HTML variant. */
export function badgeEventTitle(e: BadgeEvent): string {
  switch (e.kind) {
    case 'gift':
    case 'anon_gift':
      return 'Вам подарили значок';
    case 'granted':
      return 'Вам выдали значок';
    default:
      return 'Значок получен';
  }
}

export function badgeEventSender(e: BadgeEvent): string | null {
  if (!e.from) return null;
  if (e.from.login) return e.from.login;
  if (e.from.telegram) return `@${e.from.telegram}`;
  return null;
}

export function badgeEventPlainBody(e: BadgeEvent): string {
  const badge = `«${e.name}»`;
  const who = badgeEventSender(e);
  switch (e.kind) {
    case 'gift':
      return who ? `${who} подарил(а) вам значок ${badge}` : `Вам подарили значок ${badge}`;
    case 'anon_gift':
      return `Кто-то анонимно подарил вам значок ${badge}`;
    case 'granted':
      return who ? `${who} выдал(а) вам значок ${badge}` : `Команда AnixApp выдала вам значок ${badge}`;
    default:
      return `Вы приобрели значок ${badge}`;
  }
}

/** Synthetic raw notification understood by `parseNotification` (type `anixappBadge`). */
export function badgeEventToRaw(e: BadgeEvent, seenId: number): Record<string, unknown> {
  return {
    id: `anixapp-badge-${e.id}`,
    type: 'anixappBadge',
    timestamp: Math.floor(Date.parse(e.created_at) / 1000) || 0,
    is_new: e.id > seenId,
    badge_event: e,
  };
}

/** A new badge changes the profile's badge row — drop the cached copy. */
export function onBadgeEventsArrived(): void {
  const profileId = selfProfileId();
  if (profileId) invalidateBadges(profileId);
}

export function resetBadgeEventsCache(): void {
  cache = null;
}
