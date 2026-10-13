/**
 * Индекс списков друзей для блока «друзья с этим тайтлом» на странице релиза.
 *
 * Anixart не отдаёт bulk по релизу → сканируем списки друзей с:
 * - пулом параллелизма
 * - early-exit при нахождении тайтла
 * - кэшем страниц списков (повторные релизы почти бесплатны)
 * - TTL и персистом в localStorage
 */
import { ensureProfileId } from '../utils/profile';
import { resolveBadgeName, resolveProfileBadgeUrl } from '../utils/badge';
import { resolveJacksonEntity } from '../utils/jackson-refs';
import type { ReleaseListStatusId } from '../utils/release-list-status';

export const LIST_TYPE_TO_STATUS: Record<number, ReleaseListStatusId> = {
  1: 'watching',
  2: 'planned',
  3: 'completed',
  4: 'on_hold',
  5: 'dropped',
};

const STATUS_TO_TYPE: Record<ReleaseListStatusId, number> = {
  watching: 1,
  planned: 2,
  completed: 3,
  on_hold: 4,
  dropped: 5,
};

/** Порядок проверки: сначала «активные» статусы. */
const SCAN_TYPE_ORDER = [1, 2, 3, 4, 5] as const;

const FRIENDS_TTL_MS = 30 * 60 * 1000;
const FRIEND_INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 3;
const BOOKMARK_PAGE_HINT = 20;
const STORAGE_PREFIX = 'anix:friend-release-index:v3:';

export interface FriendBrief {
  id: number;
  login: string;
  avatar: string;
  isOnline: boolean;
  badgeUrl: string | null;
  badgeName: string;
}

export interface FriendReleaseMatch extends FriendBrief {
  status: ReleaseListStatusId;
  statusType: number;
}

export interface FriendsReleaseLookupState {
  matches: FriendReleaseMatch[];
  scanning: boolean;
  friendsTotal: number;
  checkedCount: number;
}

interface FriendIndexEntry {
  releases: Map<number, number>;
  scannedTypes: Set<number>;
  /** Следующая страница для недосканированного типа (early-exit). */
  typeCursor: Map<number, number>;
  inaccessible: boolean;
  updatedAt: number;
}

interface PersistedFriendIndex {
  updatedAt: number;
  inaccessible: boolean;
  scannedTypes: number[];
  typeCursor?: Record<string, number>;
  releases: Record<string, number>;
}

interface PersistedStore {
  friendsAt: number;
  friends: FriendBrief[];
  indexes: Record<string, PersistedFriendIndex>;
}

let selfId: number | null = null;
let friendsCache: FriendBrief[] | null = null;
let friendsCachedAt = 0;
/** Кэш друзей собран с Jackson-корнем ответа (бейджи). */
let friendsFromApiWithBadges = false;
const indexes = new Map<number, FriendIndexEntry>();
const friendScanInflight = new Map<number, Promise<void>>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function now() {
  return Date.now();
}

function isFresh(ts: number, ttl: number) {
  return ts > 0 && now() - ts < ttl;
}

function storageKey(uid: number) {
  return `${STORAGE_PREFIX}${uid}`;
}

function entryFromPersisted(raw: PersistedFriendIndex): FriendIndexEntry {
  const releases = new Map<number, number>();
  for (const [k, v] of Object.entries(raw.releases ?? {})) {
    const id = Number(k);
    const type = Number(v);
    if (Number.isFinite(id) && LIST_TYPE_TO_STATUS[type]) releases.set(id, type);
  }
  const typeCursor = new Map<number, number>();
  for (const [k, v] of Object.entries(raw.typeCursor ?? {})) {
    const type = Number(k);
    const page = Number(v);
    if (LIST_TYPE_TO_STATUS[type] && Number.isFinite(page) && page >= 0) {
      typeCursor.set(type, page);
    }
  }
  return {
    releases,
    scannedTypes: new Set((raw.scannedTypes ?? []).filter((t) => LIST_TYPE_TO_STATUS[t])),
    typeCursor,
    inaccessible: !!raw.inaccessible,
    updatedAt: raw.updatedAt || 0,
  };
}

function loadPersisted(uid: number) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return;
    const data = JSON.parse(raw) as PersistedStore;
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.friends) && isFresh(data.friendsAt, FRIENDS_TTL_MS)) {
      friendsCache = data.friends
        .filter((f) => typeof f?.id === 'number')
        .map((f) => ({
          ...f,
          badgeUrl: f.badgeUrl ?? null,
          badgeName: f.badgeName ?? '',
        }));
      friendsCachedAt = data.friendsAt;
      friendsFromApiWithBadges = true;
    }
    for (const [idStr, idx] of Object.entries(data.indexes ?? {})) {
      const id = Number(idStr);
      if (!Number.isFinite(id) || !idx) continue;
      if (!isFresh(idx.updatedAt, FRIEND_INDEX_TTL_MS)) continue;
      indexes.set(id, entryFromPersisted(idx));
    }
  } catch {
    /* ignore corrupt cache */
  }
}

function schedulePersist() {
  if (selfId == null || typeof localStorage === 'undefined') return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (selfId == null) return;
    try {
      const payload: PersistedStore = {
        friendsAt: friendsCachedAt,
        friends: friendsCache ?? [],
        indexes: {},
      };
      for (const [id, entry] of indexes) {
        if (!isFresh(entry.updatedAt, FRIEND_INDEX_TTL_MS)) continue;
        const releases: Record<string, number> = {};
        for (const [rid, type] of entry.releases) releases[String(rid)] = type;
        payload.indexes[String(id)] = {
          updatedAt: entry.updatedAt,
          inaccessible: entry.inaccessible,
          scannedTypes: [...entry.scannedTypes],
          typeCursor: Object.fromEntries([...entry.typeCursor].map(([t, p]) => [String(t), p])),
          releases,
        };
      }
      localStorage.setItem(storageKey(selfId), JSON.stringify(payload));
    } catch {
      /* quota / private mode */
    }
  }, 800);
}

function ensureEntry(friendId: number): FriendIndexEntry {
  let entry = indexes.get(friendId);
  if (!entry || !isFresh(entry.updatedAt, FRIEND_INDEX_TTL_MS)) {
    entry = {
      releases: new Map(),
      scannedTypes: new Set(),
      typeCursor: new Map(),
      inaccessible: false,
      updatedAt: now(),
    };
    indexes.set(friendId, entry);
  }
  return entry;
}

function extractReleaseId(raw: Record<string, unknown>): number | null {
  const nested = raw.release;
  const src =
    nested && typeof nested === 'object'
      ? (nested as Record<string, unknown>)
      : raw;
  const id = Number(src.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function ensureSelf(): Promise<number | null> {
  if (!window.anixApi?.profile?.self) return null;
  try {
    const status = await window.anixApi.auth?.getStatus?.();
    if (status && status.hasToken === false) return null;
  } catch {
    /* сеть — пробуем дальше через self */
  }
  const id = await ensureProfileId();
  if (typeof id !== 'number') return null;
  if (selfId !== id) {
    selfId = id;
    friendsCache = null;
    friendsCachedAt = 0;
    friendsFromApiWithBadges = false;
    indexes.clear();
    loadPersisted(id);
  }
  return id;
}

function mapFriend(raw: Record<string, unknown>, root: unknown): FriendBrief | null {
  const profile = resolveJacksonEntity(raw, root) ?? raw;
  const id = Number(profile.id ?? raw.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const badgeRaw = profile.badge ?? raw.badge;
  const badgeEntity = resolveJacksonEntity(badgeRaw, root) ?? badgeRaw;
  return {
    id,
    login: String(profile.login ?? raw.login ?? ''),
    avatar: String(profile.avatar ?? raw.avatar ?? ''),
    isOnline: !!(profile.is_online ?? raw.is_online),
    badgeUrl: resolveProfileBadgeUrl(profile, root) ?? resolveProfileBadgeUrl(raw, root),
    badgeName: resolveBadgeName(badgeEntity),
  };
}

function friendsCacheUsable(friends: FriendBrief[] | null): friends is FriendBrief[] {
  return !!friends && friends.every((f) => 'badgeUrl' in f);
}

async function loadAllFriends(uid: number): Promise<FriendBrief[]> {
  if (
    friendsFromApiWithBadges
    && friendsCacheUsable(friendsCache)
    && isFresh(friendsCachedAt, FRIENDS_TTL_MS)
  ) {
    return friendsCache;
  }
  const api = window.anixApi?.profile;
  if (!api?.getFriends) return [];

  const out: FriendBrief[] = [];
  const seen = new Set<number>();
  for (let page = 0; page < 50; page += 1) {
    const data = await api.getFriends(uid, page) as {
      content?: Record<string, unknown>[];
      last?: boolean;
    };
    const content = data?.content ?? [];
    if (!content.length) break;
    for (const raw of content) {
      const friend = mapFriend(raw, data);
      if (!friend || seen.has(friend.id)) continue;
      seen.add(friend.id);
      out.push(friend);
    }
    if (data?.last === true || content.length < 20) break;
  }

  friendsCache = out;
  friendsCachedAt = now();
  friendsFromApiWithBadges = true;
  schedulePersist();
  return out;
}

/**
 * Сканирует списки друга до нахождения releaseId или полного обхода.
 * Все просмотренные страницы попадают в кэш → следующие релизы дешевле.
 */
async function scanFriendForRelease(friend: FriendBrief, releaseId: number, signal: { aborted: boolean }) {
  const entry = ensureEntry(friend.id);
  if (entry.inaccessible) return;
  if (entry.releases.has(releaseId)) return;
  if (SCAN_TYPE_ORDER.every((t) => entry.scannedTypes.has(t))) return;

  const api = window.anixApi?.profile;
  if (!api?.getBookmarks) return;

  // Дождаться чужого скана того же друга, затем при необходимости досканировать сами.
  while (friendScanInflight.has(friend.id)) {
    await friendScanInflight.get(friend.id);
    if (signal.aborted) return;
    if (entry.releases.has(releaseId)) return;
    if (entry.inaccessible) return;
    if (SCAN_TYPE_ORDER.every((t) => entry.scannedTypes.has(t))) return;
  }

  const task = (async () => {
    try {
      for (const type of SCAN_TYPE_ORDER) {
        if (signal.aborted) return;
        if (entry.releases.has(releaseId)) return;
        if (entry.scannedTypes.has(type)) continue;

        let page = entry.typeCursor.get(type) ?? 0;
        let exhausted = false;
        while (!exhausted) {
          if (signal.aborted) return;
          let content: Record<string, unknown>[] = [];
          try {
            const data = await api.getBookmarks(friend.id, type, page, 1, 0, 0) as {
              content?: Record<string, unknown>[];
              releases?: Record<string, unknown>[];
              last?: boolean;
            };
            content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
            if (data?.last === true) exhausted = true;
          } catch {
            entry.inaccessible = true;
            entry.updatedAt = now();
            schedulePersist();
            return;
          }

          if (!content.length) {
            exhausted = true;
          } else {
            for (const item of content) {
              const rid = extractReleaseId(item);
              if (rid != null) entry.releases.set(rid, type);
            }
            if (content.length < BOOKMARK_PAGE_HINT) exhausted = true;
            else page += 1;
          }

          entry.updatedAt = now();
          if (exhausted) {
            entry.scannedTypes.add(type);
            entry.typeCursor.delete(type);
          } else {
            entry.typeCursor.set(type, page);
          }

          // Нашли целевой релиз — early-exit; курсор уже сохранён для доскана
          if (entry.releases.has(releaseId)) {
            schedulePersist();
            return;
          }

          if (page > 80) {
            entry.scannedTypes.add(type);
            entry.typeCursor.delete(type);
            exhausted = true;
          }
        }

        entry.scannedTypes.add(type);
        entry.typeCursor.delete(type);
        entry.updatedAt = now();
      }
      schedulePersist();
    } finally {
      friendScanInflight.delete(friend.id);
    }
  })();

  friendScanInflight.set(friend.id, task);
  await task;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  signal: { aborted: boolean },
) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!signal.aborted) {
      const i = idx;
      idx += 1;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

function matchFromFriend(friend: FriendBrief, type: number): FriendReleaseMatch | null {
  const status = LIST_TYPE_TO_STATUS[type];
  if (!status) return null;
  return {
    ...friend,
    status,
    statusType: type,
  };
}

function collectMatches(friends: FriendBrief[], releaseId: number): FriendReleaseMatch[] {
  const matches: FriendReleaseMatch[] = [];
  for (const friend of friends) {
    const entry = indexes.get(friend.id);
    if (!entry || entry.inaccessible) continue;
    const type = entry.releases.get(releaseId);
    if (type == null) continue;
    const m = matchFromFriend(friend, type);
    if (m) matches.push(m);
  }
  matches.sort((a, b) => {
    if (a.statusType !== b.statusType) return a.statusType - b.statusType;
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return a.login.localeCompare(b.login, 'ru');
  });
  return matches;
}

function friendNeedsScan(friendId: number, releaseId: number): boolean {
  const entry = indexes.get(friendId);
  if (!entry) return true;
  if (!isFresh(entry.updatedAt, FRIEND_INDEX_TTL_MS)) return true;
  if (entry.inaccessible) return false;
  if (entry.releases.has(releaseId)) return false;
  return !SCAN_TYPE_ORDER.every((t) => entry.scannedTypes.has(t));
}

/**
 * Подписка на прогрессивный поиск друзей с данным релизом в списках.
 * Сразу отдаёт кэш, затем докачивает недостающих друзей.
 */
export function watchFriendsForRelease(
  releaseId: number,
  onUpdate: (state: FriendsReleaseLookupState) => void,
): { abort: () => void } {
  const signal = { aborted: false };

  const emit = (
    friends: FriendBrief[],
    scanning: boolean,
    checkedCount: number,
  ) => {
    if (signal.aborted) return;
    onUpdate({
      matches: collectMatches(friends, releaseId),
      scanning,
      friendsTotal: friends.length,
      checkedCount,
    });
  };

  void (async () => {
    const uid = await ensureSelf();
    if (signal.aborted) return;
    if (uid == null) {
      onUpdate({ matches: [], scanning: false, friendsTotal: 0, checkedCount: 0 });
      return;
    }

    let friends: FriendBrief[] = [];
    try {
      friends = await loadAllFriends(uid);
    } catch {
      friends = [];
    }
    if (signal.aborted) return;

    if (!friends.length) {
      emit([], false, 0);
      return;
    }

    const pending = friends.filter((f) => friendNeedsScan(f.id, releaseId));
    const alreadyChecked = friends.length - pending.length;
    emit(friends, pending.length > 0, alreadyChecked);

    if (!pending.length) return;

    let checked = alreadyChecked;
    await runPool(pending, CONCURRENCY, async (friend) => {
      if (signal.aborted) return;
      try {
        await scanFriendForRelease(friend, releaseId, signal);
      } catch {
        /* ignore single-friend failures */
      }
      checked += 1;
      emit(friends, checked < friends.length, checked);
    }, signal);

    if (!signal.aborted) emit(friends, false, friends.length);
  })();

  return {
    abort() {
      signal.aborted = true;
    },
  };
}

export function clearFriendsReleaseIndex() {
  selfId = null;
  friendsCache = null;
  friendsCachedAt = 0;
  indexes.clear();
  friendScanInflight.clear();
}

export function statusTypeOf(status: ReleaseListStatusId): number {
  return STATUS_TO_TYPE[status];
}

if (typeof window !== 'undefined') {
  window.addEventListener('anix:authChanged', () => {
    if (selfId != null && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(storageKey(selfId));
      } catch { /* ignore */ }
    }
    clearFriendsReleaseIndex();
  });
}
