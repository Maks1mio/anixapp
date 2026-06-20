import type { CollectionCardData } from '../components/CollectionCard.svelte';
import type { ReleaseCardData } from '../types/release';
import type {
  OverviewBanner,
  OverviewCommentWeekItem,
  OverviewDiscussItem,
} from './overview';

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
