import { writable, get } from 'svelte/store';
import { DEFAULT_BOOKMARK_SORT } from '../constants/bookmarkSort';
import {
  SIDEBAR_PINS_LIST_TYPE,
  sidebarPinsSourceLabel,
  type SidebarPinsPlacement,
  type SidebarPinsSource,
} from '../constants/sidebar-nav';
import { getSidebarPinsPlacement, getSidebarPinsSource } from '../prefs';
import { isAuthenticated } from './auth';
import { connectionKind } from './connection';
import { buildCollectionUrl, buildPosterUrl, resolveCdnAssetUrl } from '../utils/posterUrl';
import { mapReleaseRawToCard, releaseCardTitle, releaseListStatusLabel } from '../utils/release-card';
import { mapHistoryRawToReleaseCard } from '../utils/historyCard';
import { ensureProfileId } from '../utils/profile';
import type { ReleaseCardData } from '../types/release';

export interface SidebarPin {
  id: number;
  kind: 'release' | 'collection';
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

export { releaseListStatusLabel, sidebarPinsSourceLabel };

export const sidebarPins = writable<SidebarPin[]>([]);
export const sidebarPinsLoading = writable(false);
export const sidebarPinsSource = writable<SidebarPinsSource>(getSidebarPinsSource());
export const sidebarPinsPlacement = writable<SidebarPinsPlacement>(getSidebarPinsPlacement());

let loadPromise: Promise<void> | null = null;
let refreshQueued = false;
let favoriteRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const favoritePinLoads = new Set<number>();

/** Сайдбару хватает одной-двух страниц — не тянем всю историю. */
const MAX_PAGES = 2;
const MAX_PINS = 48;

/** Для миниатюр в сайдбаре — small/medium, не original. */
function extractPinPoster(raw: Record<string, unknown>): string | undefined {
  const p = raw.poster as Record<string, { url?: string }> | undefined;
  const posterRaw =
    p?.small?.url
    ?? p?.medium?.url
    ?? p?.original?.url
    ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
    ?? (typeof raw.image === 'string' ? raw.image : undefined);
  if (!posterRaw || typeof posterRaw !== 'string') return undefined;
  return buildPosterUrl(posterRaw) || resolveCdnAssetUrl(posterRaw) || undefined;
}

function mapRawToReleasePin(raw: Record<string, unknown>): SidebarPin | null {
  const card = mapReleaseRawToCard(raw);
  if (!card.id || card.id <= 0) return null;
  return {
    id: card.id,
    kind: 'release',
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

function mapHistoryToPin(raw: Record<string, unknown>): SidebarPin | null {
  const card = mapHistoryRawToReleaseCard(raw);
  if (!card.id || card.id <= 0) return null;
  const release =
    raw.release && typeof raw.release === 'object'
      ? (raw.release as Record<string, unknown>)
      : raw;
  return {
    id: card.id,
    kind: 'release',
    title: releaseCardTitle(card),
    titleRu: card.titleRu,
    titleEn: card.titleEn,
    poster: extractPinPoster(release) ?? card.poster,
    year: card.year,
    episodesReleased: card.episodesReleased,
    episodesTotal: card.episodesTotal,
    rating: card.rating,
    listStatus: card.listStatus,
  };
}

function mapCollectionToPin(raw: Record<string, unknown>): SidebarPin | null {
  const id = Number(raw.id);
  if (!(id > 0)) return null;
  const title = String(raw.title ?? raw.name ?? 'Без названия');
  const imageRaw = typeof raw.image === 'string'
    ? raw.image
    : typeof (raw.image as { url?: string } | undefined)?.url === 'string'
      ? (raw.image as { url: string }).url
      : undefined;
  return {
    id,
    kind: 'collection',
    title,
    poster: imageRaw
      ? (buildCollectionUrl(imageRaw) || resolveCdnAssetUrl(imageRaw) || undefined)
      : undefined,
  };
}

function dedupePins(pins: SidebarPin[]): SidebarPin[] {
  const seen = new Set<string>();
  const out: SidebarPin[] = [];
  for (const pin of pins) {
    const key = `${pin.kind}:${pin.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pin);
    if (out.length >= MAX_PINS) break;
  }
  return out;
}

async function paginatePins(
  fetchPage: (page: number) => Promise<{ content: Record<string, unknown>[]; last: boolean }>,
  mapPin: (raw: Record<string, unknown>) => SidebarPin | null,
): Promise<SidebarPin[]> {
  const pins: SidebarPin[] = [];
  const seen = new Set<string>();
  let page = 0;
  let hasMore = true;

  while (hasMore && pins.length < MAX_PINS) {
    const { content, last } = await fetchPage(page);
    for (const raw of content) {
      const pin = mapPin(raw);
      if (!pin) continue;
      const key = `${pin.kind}:${pin.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pins.push(pin);
      if (pins.length >= MAX_PINS) break;
    }
    hasMore = !last && content.length > 0;
    page += 1;
    if (page > MAX_PAGES) break;
  }

  return pins;
}

async function fetchPinsForSource(source: SidebarPinsSource): Promise<SidebarPin[]> {
  if (source === 'none') return [];

  const api = window.anixApi;
  if (!api) return [];

  if (source === 'favorites') {
    if (!api.favorites?.all) return [];
    return paginatePins(async (page) => {
      const data = await api.favorites!.all(page, DEFAULT_BOOKMARK_SORT, 0, 0) as Record<string, unknown>;
      const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
      return { content, last: data?.last === true || content.length === 0 };
    }, mapRawToReleasePin);
  }

  if (source === 'history') {
    if (!api.history?.all) return [];
    return paginatePins(async (page) => {
      const data = await api.history!.all(page) as Record<string, unknown>;
      const content = (data?.content ?? data?.history ?? data?.releases ?? []) as Record<string, unknown>[];
      return { content, last: data?.last === true || content.length === 0 };
    }, mapHistoryToPin);
  }

  if (source === 'votes') {
    if (!api.profile?.getVotedReleases) return [];
    const profileId = await ensureProfileId();
    if (typeof profileId !== 'number') return [];
    return paginatePins(async (page) => {
      const data = await api.profile!.getVotedReleases(profileId, page, 1) as Record<string, unknown>;
      const content = (data?.content ?? []) as Record<string, unknown>[];
      return { content, last: data?.last === true || content.length === 0 };
    }, mapRawToReleasePin);
  }

  if (source === 'collections') {
    if (!api.collection?.favorites) return [];
    return paginatePins(async (page) => {
      const data = await api.collection!.favorites(page) as Record<string, unknown>;
      const content = (data?.content ?? []) as Record<string, unknown>[];
      return { content, last: data?.last === true || content.length === 0 };
    }, mapCollectionToPin);
  }

  const listType = SIDEBAR_PINS_LIST_TYPE[source];
  if (listType == null || !api.profile?.getBookmarks) return [];
  const profileId = await ensureProfileId();
  if (typeof profileId !== 'number') return [];

  return paginatePins(async (page) => {
    const data = await api.profile!.getBookmarks(
      profileId,
      listType,
      page,
      DEFAULT_BOOKMARK_SORT,
      0,
      0,
    ) as Record<string, unknown>;
    const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
    return { content, last: data?.last === true || content.length === 0 };
  }, mapRawToReleasePin);
}

export async function refreshSidebarPins(): Promise<void> {
  const source = getSidebarPinsSource();
  const placement = getSidebarPinsPlacement();
  sidebarPinsSource.set(source);
  sidebarPinsPlacement.set(placement);

  if (placement === 'none' || source === 'none' || !get(isAuthenticated)) {
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
        const currentSource = getSidebarPinsSource();
        const currentPlacement = getSidebarPinsPlacement();
        sidebarPinsSource.set(currentSource);
        sidebarPinsPlacement.set(currentPlacement);
        if (currentPlacement === 'none' || currentSource === 'none' || !get(isAuthenticated)) {
          sidebarPins.set([]);
          break;
        }
        const pins = dedupePins(await fetchPinsForSource(currentSource));
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

function removeFavoritePin(releaseId: number): void {
  sidebarPins.update((pins) => pins.filter((pin) => !(pin.kind === 'release' && pin.id === releaseId)));
}

/** Оптимистично добавляем свежий избранный тайтл, не дожидаясь перезагрузки списка. */
async function addFavoritePin(releaseId: number): Promise<void> {
  if (getSidebarPinsSource() !== 'favorites' || getSidebarPinsPlacement() === 'none') return;
  if (get(sidebarPins).some((pin) => pin.kind === 'release' && pin.id === releaseId)) return;
  if (favoritePinLoads.has(releaseId)) return;
  favoritePinLoads.add(releaseId);

  try {
    const data = await window.anixApi?.release?.info?.(releaseId, false) as Record<string, unknown> | undefined;
    if (!data) return;
    const raw = (data.release && typeof data.release === 'object' ? data.release : data) as Record<string, unknown>;
    const pin = mapRawToReleasePin(raw);
    if (!pin) return;
    if (getSidebarPinsSource() !== 'favorites' || getSidebarPinsPlacement() === 'none') return;
    if (get(sidebarPins).some((p) => p.kind === 'release' && p.id === releaseId)) return;
    sidebarPins.update((pins) => dedupePins([pin, ...pins]));
  } catch {
    /* сеть недоступна — список обновится обычным refresh */
  } finally {
    favoritePinLoads.delete(releaseId);
  }
}

function scheduleSidebarPinsRefresh(delayMs = 0): void {
  if (delayMs <= 0) {
    void refreshSidebarPins();
    return;
  }
  if (favoriteRefreshTimer != null) clearTimeout(favoriteRefreshTimer);
  favoriteRefreshTimer = setTimeout(() => {
    favoriteRefreshTimer = null;
    void refreshSidebarPins();
  }, delayMs);
}

function applyFavoriteChange(detail: { releaseId?: unknown; favorited?: unknown }): void {
  if (getSidebarPinsSource() !== 'favorites' || getSidebarPinsPlacement() === 'none') {
    scheduleSidebarPinsRefresh();
    return;
  }

  const releaseId = Number(detail.releaseId);
  if (!(releaseId > 0)) {
    scheduleSidebarPinsRefresh();
    return;
  }

  if (detail.favorited === false) {
    removeFavoritePin(releaseId);
    scheduleSidebarPinsRefresh();
    scheduleSidebarPinsRefresh(900);
    return;
  }

  if (detail.favorited === true) {
    void addFavoritePin(releaseId);
  }
  // Небольшая задержка на случай, если бэкенд ещё не успел вернуть новый список.
  scheduleSidebarPinsRefresh(900);
}

export function initSidebarPins(): () => void {
  const unsubAuth = isAuthenticated.subscribe(() => {
    void refreshSidebarPins();
  });

  let prevConn: string | null = null;
  const unsubConn = connectionKind.subscribe((kind) => {
    const prev = prevConn;
    prevConn = kind;
    if (kind === 'ok' && prev != null && prev !== 'ok') {
      void refreshSidebarPins();
    }
  });

  const onRefresh = () => {
    void refreshSidebarPins();
  };
  const onFavoritesChanged = (e: Event) => {
    applyFavoriteChange((e as CustomEvent).detail ?? {});
  };
  const onBookmarksChanged = (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {};
    if (detail.kind === 'favorites') {
      applyFavoriteChange(detail);
      return;
    }
    void refreshSidebarPins();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refreshSidebarPins();
  };

  window.addEventListener('anix:favoritesChanged', onFavoritesChanged);
  window.addEventListener('anix:bookmarksChanged', onBookmarksChanged);
  window.addEventListener('anix:authChanged', onRefresh);
  window.addEventListener('anix:sidebarPinsPrefsChanged', onRefresh);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    unsubAuth();
    unsubConn();
    if (favoriteRefreshTimer != null) {
      clearTimeout(favoriteRefreshTimer);
      favoriteRefreshTimer = null;
    }
    window.removeEventListener('anix:favoritesChanged', onFavoritesChanged);
    window.removeEventListener('anix:bookmarksChanged', onBookmarksChanged);
    window.removeEventListener('anix:authChanged', onRefresh);
    window.removeEventListener('anix:sidebarPinsPrefsChanged', onRefresh);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
