import { writable, get } from 'svelte/store';
import { DEFAULT_BOOKMARK_SORT } from '../constants/bookmarkSort';
import { isAuthenticated } from './auth';
import { buildPosterUrl } from '../utils/posterUrl';
import { mapReleaseRawToCard, releaseCardTitle, releaseListStatusLabel } from '../utils/release-card';
import type { ReleaseCardData } from '../types/release';

export interface SidebarPin {
  id: number;
  title: string;
  titleRu?: string;
  titleEn?: string;
  poster?: string;
  year?: string;
  episodesReleased?: number;
  episodesTotal?: number;
  rating?: number;
  listStatus?: ReleaseCardData['listStatus'];
}

export { releaseListStatusLabel };

export const sidebarPins = writable<SidebarPin[]>([]);
export const sidebarPinsLoading = writable(false);

let loadPromise: Promise<void> | null = null;
let refreshQueued = false;

/** Для миниатюр в сайдбаре — small/medium, не original (иначе слишком резко при даунскейле). */
function extractPinPoster(raw: Record<string, unknown>): string | undefined {
  const p = raw.poster as Record<string, { url?: string }> | undefined;
  const posterRaw =
    p?.small?.url
    ?? p?.medium?.url
    ?? p?.original?.url
    ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
    ?? (typeof raw.image === 'string' ? raw.image : undefined);
  if (!posterRaw || typeof posterRaw !== 'string') return undefined;
  return buildPosterUrl(posterRaw) || undefined;
}

function mapRawToPin(raw: Record<string, unknown>): SidebarPin | null {
  const card = mapReleaseRawToCard(raw);
  if (!card.id || card.id <= 0) return null;
  return {
    id: card.id,
    title: releaseCardTitle(card),
    titleRu: card.titleRu,
    titleEn: card.titleEn,
    poster: extractPinPoster(raw) ?? card.poster,
    year: card.year,
    episodesReleased: card.episodesReleased,
    episodesTotal: card.episodesTotal,
    rating: card.rating,
    listStatus: card.listStatus,
  };
}

async function fetchAllFavoritePins(): Promise<SidebarPin[]> {
  if (!window.anixApi?.favorites?.all) return [];

  const pins: SidebarPin[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await window.anixApi.favorites.all(page, DEFAULT_BOOKMARK_SORT, 0, 0) as Record<string, unknown>;
    const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];

    for (const raw of content) {
      const pin = mapRawToPin(raw);
      if (pin) pins.push(pin);
    }

    const last = data?.last === true || content.length === 0;
    hasMore = !last;
    page += 1;
    if (page > 64) break;
  }

  return pins;
}

export async function refreshSidebarPins(): Promise<void> {
  if (!get(isAuthenticated)) {
    sidebarPins.set([]);
    sidebarPinsLoading.set(false);
    return;
  }

  if (loadPromise) {
    refreshQueued = true;
    return loadPromise;
  }

  loadPromise = (async () => {
    sidebarPinsLoading.set(true);
    try {
      do {
        refreshQueued = false;
        const pins = await fetchAllFavoritePins();
        sidebarPins.set(pins);
      } while (refreshQueued);
    } catch {
      if (get(sidebarPins).length === 0) sidebarPins.set([]);
    } finally {
      sidebarPinsLoading.set(false);
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export function initSidebarPins(): () => void {
  void refreshSidebarPins();

  const onFavoritesChanged = () => {
    void refreshSidebarPins();
  };
  const onAuthChanged = () => {
    void refreshSidebarPins();
  };
  window.addEventListener('anix:favoritesChanged', onFavoritesChanged);
  window.addEventListener('anix:authChanged', onAuthChanged);

  return () => {
    window.removeEventListener('anix:favoritesChanged', onFavoritesChanged);
    window.removeEventListener('anix:authChanged', onAuthChanged);
  };
}
