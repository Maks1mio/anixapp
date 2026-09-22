/**
 * Поштучная проверка друзей на бан через profile.info.
 *
 * В списке друзей compact-профиль часто без is_banned / is_perm_banned,
 * поэтому смотрим полный профиль — как «друзья на релизе» сканируют списки.
 */
import { resolveJacksonRefs } from '../utils/jackson-refs';
import {
  isProfileBanned,
  type ProfileBanFields,
} from '../views/Profile/_utils';

const CONCURRENCY = 3;
const TTL_MS = 30 * 60 * 1000;

type CacheEntry = {
  at: number;
  fields: ProfileBanFields;
};

const cache = new Map<number, CacheEntry>();
const inflight = new Map<number, Promise<ProfileBanFields | null>>();

export type FriendBanScanState = {
  scanning: boolean;
  checkedCount: number;
  friendsTotal: number;
  fieldsById: Record<number, ProfileBanFields>;
};

export type FriendBanScanner = {
  scan: (ids: number[], totalHint?: number) => void;
  abort: () => void;
};

function now() {
  return Date.now();
}

function isFresh(ts: number) {
  return ts > 0 && now() - ts < TTL_MS;
}

export function pickBanFields(profile: Record<string, unknown>): ProfileBanFields {
  return {
    is_banned: !!profile.is_banned,
    is_perm_banned: !!profile.is_perm_banned,
    ban_expires: Number(profile.ban_expires ?? 0) || null,
    ban_reason: typeof profile.ban_reason === 'string' ? profile.ban_reason : null,
  };
}

export function mergeBanFields(
  friend: Record<string, unknown>,
  fields: ProfileBanFields | undefined,
): Record<string, unknown> {
  if (!fields) return friend;
  return { ...friend, ...fields };
}

export function isFriendBanChecked(
  friendId: number,
  fieldsById: Record<number, ProfileBanFields>,
): boolean {
  return Object.prototype.hasOwnProperty.call(fieldsById, friendId);
}

export function isCheckedFriendBanned(
  friend: Record<string, unknown>,
  fieldsById: Record<number, ProfileBanFields>,
): boolean {
  const id = Number(friend.id);
  if (!Number.isFinite(id) || !isFriendBanChecked(id, fieldsById)) return false;
  return isProfileBanned(mergeBanFields(friend, fieldsById[id]));
}

function getCached(id: number): ProfileBanFields | null {
  const entry = cache.get(id);
  if (!entry || !isFresh(entry.at)) return null;
  return entry.fields;
}

async function fetchFriendBanFields(id: number): Promise<ProfileBanFields | null> {
  const cached = getCached(id);
  if (cached) return cached;

  const pending = inflight.get(id);
  if (pending) return pending;

  const api = window.anixApi?.profile?.info;
  if (!api) return null;

  const task = (async () => {
    try {
      const info = await api(id);
      const resolved = resolveJacksonRefs(info as Record<string, unknown>);
      const raw = resolved.profile ?? (info as { profile?: unknown }).profile;
      if (!raw || typeof raw !== 'object') return null;
      const fields = pickBanFields(raw as Record<string, unknown>);
      cache.set(id, { at: now(), fields });
      return fields;
    } catch {
      return null;
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, task);
  return task;
}

export function createFriendBanScanner(
  onUpdate: (state: FriendBanScanState) => void,
): FriendBanScanner {
  const signal = { aborted: false };
  const queued: number[] = [];
  const queuedSet = new Set<number>();
  const checked = new Set<number>();
  const fieldsById: Record<number, ProfileBanFields> = {};
  let activeWorkers = 0;
  let totalHint = 0;

  function emit(scanning: boolean) {
    if (signal.aborted) return;
    onUpdate({
      scanning,
      checkedCount: checked.size,
      friendsTotal: Math.max(totalHint, checked.size + queued.length),
      fieldsById: { ...fieldsById },
    });
  }

  function pump() {
    while (activeWorkers < CONCURRENCY && queued.length && !signal.aborted) {
      void worker();
    }
  }

  async function worker() {
    activeWorkers += 1;
    try {
      while (!signal.aborted) {
        const id = queued.shift();
        if (id == null) break;
        queuedSet.delete(id);
        const fields = await fetchFriendBanFields(id);
        if (signal.aborted) break;
        checked.add(id);
        fieldsById[id] = fields ?? {
          is_banned: false,
          is_perm_banned: false,
          ban_expires: 0,
          ban_reason: null,
        };
        emit(true);
      }
    } finally {
      activeWorkers -= 1;
      if (!signal.aborted && queued.length) pump();
      else if (activeWorkers === 0) emit(false);
    }
  }

  return {
    scan(ids: number[], hint?: number) {
      if (signal.aborted) return;
      if (typeof hint === 'number' && hint > 0) totalHint = hint;

      for (const id of ids) {
        if (!Number.isFinite(id) || id <= 0) continue;
        if (checked.has(id) || queuedSet.has(id)) continue;
        const cached = getCached(id);
        if (cached) {
          checked.add(id);
          fieldsById[id] = cached;
          continue;
        }
        queued.push(id);
        queuedSet.add(id);
      }

      emit(queued.length > 0 || activeWorkers > 0);
      pump();
    },
    abort() {
      signal.aborted = true;
      queued.length = 0;
      queuedSet.clear();
    },
  };
}

export function clearFriendBanScanCache() {
  cache.clear();
  inflight.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('anix:authChanged', () => {
    clearFriendBanScanCache();
  });
}
