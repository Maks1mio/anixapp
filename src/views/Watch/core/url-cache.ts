import { resolveEpisodeUrlWithRetry, stripKodikQueryParams } from '../_utils';

export type ResolvedEpisodeMedia = Awaited<ReturnType<typeof resolveEpisodeUrlWithRetry>>;

const TTL_MS = 4 * 60 * 1000;
const TTL_SIGNED_MS = 90 * 1000;
const cache = new Map<string, { result: ResolvedEpisodeMedia; expires: number }>();
const inflight = new Map<string, Promise<ResolvedEpisodeMedia>>();

function cacheKey(embedUrl: string): string {
  const raw = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  return stripKodikQueryParams(raw);
}

function ttlForKey(key: string): number {
  if (/vk\.com|vkvideo|ok\.ru|odnoklassniki/i.test(key)) return TTL_SIGNED_MS;
  return TTL_MS;
}

function isUsable(result: ResolvedEpisodeMedia): boolean {
  return !!(result.useVideo && result.playUrl);
}

export function peekQualityMap(embedUrl: string): Record<string, string> | null {
  const hit = cache.get(cacheKey(embedUrl));
  if (!hit || hit.expires <= Date.now()) return null;
  return hit.result.qualityMap;
}

export async function resolveEpisodeUrlCached(
  embedUrl: string,
  iframe: boolean,
  maxAttempts = 4,
): Promise<ResolvedEpisodeMedia> {
  const key = cacheKey(embedUrl);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now() && isUsable(hit.result)) return hit.result;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = resolveEpisodeUrlWithRetry(embedUrl, iframe, maxAttempts)
    .then((result) => {
      if (isUsable(result)) {
        cache.set(key, { result, expires: Date.now() + ttlForKey(key) });
      }
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}

/** Фоновый прогрев кэша — ошибки глотаем. */
export function prefetchEpisodeUrl(embedUrl: string, iframe: boolean): void {
  if (!embedUrl) return;
  void resolveEpisodeUrlCached(embedUrl, iframe).catch(() => {});
}

export function invalidateEpisodeUrlCache(embedUrl?: string): void {
  if (!embedUrl) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey(embedUrl));
}
