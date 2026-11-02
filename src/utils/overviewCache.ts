import type { CollectionCardData } from '../components/CollectionCard.svelte';
import type { ReleaseCardData } from '../types/release';
import {
  mapOverviewBanner,
  mapOverviewCollection,
  mapOverviewCommentWeek,
  mapOverviewDiscuss,
  type OverviewBanner,
  type OverviewCommentWeekItem,
  type OverviewDiscussItem,
} from './overview';
import { mapCardData } from '../views/Release/_utils';

export const OVERVIEW_CACHE_TTL_MS = 30 * 60 * 1000;

export interface OverviewCacheData {
  fetchedAt: number;
  banners: OverviewBanner[];
  recommendations: ReleaseCardData[];
  watching: ReleaseCardData[];
  discussing: OverviewDiscussItem[];
  collectionsWeek: CollectionCardData[];
  commentsWeek: OverviewCommentWeekItem[];
}

export type OverviewCachePayload = Omit<OverviewCacheData, 'fetchedAt'>;

let cache: OverviewCacheData | null = null;
let inflight: Promise<OverviewCacheData> | null = null;

export function getOverviewCache(): OverviewCacheData | null {
  if (!cache) return null;
  if (Date.now() - cache.fetchedAt >= OVERVIEW_CACHE_TTL_MS) {
    cache = null;
    return null;
  }
  return cache;
}

export function setOverviewCache(payload: OverviewCachePayload): OverviewCacheData {
  cache = { ...payload, fetchedAt: Date.now() };
  return cache;
}

export function clearOverviewCache(): void {
  cache = null;
  inflight = null;
}

/** Reuse in-flight fetch when navigating back before first load completes. */
export function getOverviewInflight(): Promise<OverviewCacheData> | null {
  return inflight;
}

export function setOverviewInflight(promise: Promise<OverviewCacheData> | null): void {
  inflight = promise;
}

const DISCOVER_TIMEOUT_MS = 8_000;

function mapReleaseList(data: { content?: unknown[] } | null | undefined): ReleaseCardData[] {
  return (data?.content ?? [])
    .filter((raw): raw is Record<string, unknown> => !!raw && typeof raw === 'object')
    .map((raw) => mapCardData(raw));
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label}: timeout`)), DISCOVER_TIMEOUT_MS);
    }),
  ]);
}

export async function fetchOverviewPayload(): Promise<OverviewCachePayload> {
  if (!window.anixApi?.discover) {
    throw new Error('API недоступен');
  }

  const api = window.anixApi.discover;
  const results = await Promise.allSettled([
    withTimeout(api.interesting(), 'interesting'),
    withTimeout(api.recommendations(-1, -1), 'recommendations'),
    withTimeout(api.watching(0), 'watching'),
    withTimeout(api.discussing(), 'discussing'),
    withTimeout(api.collectionsWeek(-1, -1), 'collectionsWeek'),
    withTimeout(api.commentsWeek(), 'commentsWeek'),
  ]);

  return {
    banners: results[0].status === 'fulfilled'
      ? (results[0].value.content ?? [])
          .map((raw) => mapOverviewBanner(raw as Record<string, unknown>))
          .filter((b): b is OverviewBanner => b != null)
      : [],
    recommendations: results[1].status === 'fulfilled' ? mapReleaseList(results[1].value) : [],
    watching: results[2].status === 'fulfilled' ? mapReleaseList(results[2].value) : [],
    discussing: results[3].status === 'fulfilled'
      ? (results[3].value.content ?? []).map((raw) => mapOverviewDiscuss(raw as Record<string, unknown>))
      : [],
    collectionsWeek: results[4].status === 'fulfilled'
      ? (results[4].value.content ?? []).map((raw) => mapOverviewCollection(raw as Record<string, unknown>))
      : [],
    commentsWeek: results[5].status === 'fulfilled'
      ? (results[5].value.content ?? [])
          .map((raw) =>
            mapOverviewCommentWeek(raw as Record<string, unknown>, results[5].value),
          )
          .filter((c): c is OverviewCommentWeekItem => c != null)
      : [],
  };
}

/** Данные обзора: кэш → общий запрос в полёте → новый запрос. */
export async function loadOverviewData(force = false): Promise<OverviewCacheData> {
  if (!force) {
    const cached = getOverviewCache();
    if (cached) return cached;
    const pending = getOverviewInflight();
    if (pending) return pending;
  }
  const request = fetchOverviewPayload()
    .then((payload) => setOverviewCache(payload))
    .finally(() => setOverviewInflight(null));
  setOverviewInflight(request);
  return request;
}
