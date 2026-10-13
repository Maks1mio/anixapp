/** Last-seen дат статей по каналам (как ChannelLastSeen в Android APK). */

const STORAGE_KEY = 'anixapp.channelLastSeen';
/** 48 часов — окно «свежести» из MyFeedUiControllerState. */
export const CHANNEL_FRESH_WINDOW_SEC = 172_800;

type SeenMap = Record<string, number>;

function readMap(): SeenMap {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: SeenMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: SeenMap): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function getChannelLastSeen(channelId: number): number {
  if (!(channelId > 0)) return 0;
  return readMap()[String(channelId)] ?? 0;
}

/** Сохранить просмотр: lastArticleDate в unix-секундах (как в API). */
export function markChannelArticlesSeen(channelId: number, lastArticleDate: number): void {
  if (!(channelId > 0)) return;
  const date = Math.max(0, Math.floor(Number(lastArticleDate) || 0));
  const map = readMap();
  const prev = map[String(channelId)] ?? 0;
  if (date <= prev) return;
  map[String(channelId)] = date;
  writeMap(map);
  window.dispatchEvent(
    new CustomEvent('anix:channelLastSeenChanged', { detail: { channelId, lastArticleDate: date } }),
  );
}

/**
 * Есть ли непросмотренные статьи у канала.
 * last_article_date > lastSeen && возраст < 48ч.
 */
export function channelHasNewArticles(
  channelId: number,
  lastArticleDate: number | null | undefined,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  const last = Math.floor(Number(lastArticleDate) || 0);
  if (!(channelId > 0) || last <= 0) return false;
  if (nowSec - last >= CHANNEL_FRESH_WINDOW_SEC) return false;
  return last > getChannelLastSeen(channelId);
}

export function normalizeLastArticleDate(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // мс → сек, если похоже на epoch ms
    return raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}
