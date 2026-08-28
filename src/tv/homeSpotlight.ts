import { writable, get } from 'svelte/store';
import type { ReleaseCardData } from '../types/release';
import { isReleaseAnnounce } from '../utils/release-card';

const catalog = new Map<number, ReleaseCardData>();

export const tvHomeSpotlightStore = writable<ReleaseCardData | null>(null);

export function getTvHomeSpotlight(): ReleaseCardData | null {
  return get(tvHomeSpotlightStore);
}

export function registerTvHomeRelease(item: ReleaseCardData): void {
  if (typeof item.id === 'number' && item.id > 0) {
    catalog.set(item.id, item);
  }
}

export function clearTvHomeCatalog(): void {
  catalog.clear();
  tvHomeSpotlightStore.set(null);
}

function seasonName(value: number | null | undefined): string {
  switch (value) {
    case 1: return 'Зима';
    case 2: return 'Весна';
    case 3: return 'Лето';
    case 4: return 'Осень';
    default: return '';
  }
}

function seasonFromAiredOn(ts: number | null | undefined): number | null {
  if (ts == null || ts <= 0) return null;
  const m = new Date(ts * 1000).getUTCMonth();
  if (m === 11 || m <= 1) return 1;
  if (m <= 4) return 2;
  if (m <= 7) return 3;
  return 4;
}

export function tvHomeSpotlightTitle(item: ReleaseCardData): string {
  return item.titleRu || item.titleEn || item.titleAlt || 'Без названия';
}

export function tvHomeSpotlightSubtitle(item: ReleaseCardData): string | null {
  const ru = item.titleRu?.trim();
  const en = item.titleEn?.trim();
  if (en && en !== ru) return en;
  if (item.titleAlt?.trim() && item.titleAlt.trim() !== ru) return item.titleAlt.trim();
  return null;
}

export function tvHomeCountrySeasonLine(item: ReleaseCardData): string | null {
  const parts: string[] = [];
  if (item.country?.trim()) parts.push(item.country.trim());

  let season = item.season;
  if (season == null || season < 1 || season > 4) {
    season = seasonFromAiredOn(item.airedOnDate) ?? undefined;
  }
  if (isReleaseAnnounce(item.status, item.statusId) && item.year && (season == null || season < 1)) {
    season = 1;
  }

  const seasonLabel = seasonName(season ?? null);
  const year = item.year?.trim();
  if (seasonLabel && year) parts.push(`${seasonLabel} ${year} г.`);
  else if (year) parts.push(`${year} г.`);
  else if (seasonLabel) parts.push(seasonLabel);

  return parts.length ? parts.join(', ') : null;
}

export function tvHomeEpisodesLine(item: ReleaseCardData): string | null {
  const released = item.episodesReleased;
  const total = item.episodesTotal;
  const parts: string[] = [];

  if (typeof released === 'number' && typeof total === 'number' && total > 0) {
    parts.push(`${released} из ${total} эп.`);
  } else if (typeof total === 'number' && total > 0) {
    parts.push(`${total} эп.`);
  } else if (typeof released === 'number' && released > 0) {
    parts.push(`${released} эп.`);
  }

  if (typeof item.duration === 'number' && item.duration > 0) {
    parts.push(`по ~${item.duration} мин.`);
  }

  return parts.length ? parts.join(' ') : null;
}

export function tvHomeTypeStatusLine(item: ReleaseCardData): string | null {
  const parts = [item.category, item.status].filter((v): v is string => !!v?.trim());
  return parts.length ? parts.join(', ') : null;
}

export function tvHomeGenres(item: ReleaseCardData): string[] {
  return (item.genres ?? '')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
}

export function tvHomePrimaryMetaParts(item: ReleaseCardData): string[] {
  return [
    tvHomeCountrySeasonLine(item),
    tvHomeEpisodesLine(item),
    tvHomeTypeStatusLine(item),
  ].filter((v): v is string => !!v);
}

export function tvHomeSecondaryMetaParts(item: ReleaseCardData): string[] {
  const parts: string[] = [];
  if (item.studio?.trim()) parts.push(`Студия: ${item.studio.trim()}`);
  if (item.author?.trim()) parts.push(`Автор: ${item.author.trim()}`);
  if (item.director?.trim()) parts.push(`Режиссёр: ${item.director.trim()}`);
  if (item.source?.trim()) parts.push(`Источник: ${item.source.trim()}`);
  return parts;
}

export function tvHomeDescription(item: ReleaseCardData, maxLen = 220): string | null {
  const text = item.description?.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}…`;
}

const CARD_SEL = '.uiv2-anime-card:not(.tv-category-see-all)';

function spotlightFromReleaseId(id: number): boolean {
  if (!Number.isFinite(id) || !catalog.has(id)) return false;
  tvHomeSpotlightStore.set(catalog.get(id) ?? null);
  return true;
}

function spotlightFromElement(el: Element | null): boolean {
  const wrap = el?.closest('[data-tv-release-id]');
  const rawId = wrap?.getAttribute('data-tv-release-id');
  const id = rawId ? Number.parseInt(rawId, 10) : NaN;
  return spotlightFromReleaseId(id);
}

function spotlightFromFirstCard(): boolean {
  const first = document.querySelector('.tv-home [data-tv-release-id]');
  return spotlightFromElement(first);
}

export function syncTvHomeSpotlightFromElement(el: Element | null): void {
  if (el && spotlightFromElement(el)) return;
  syncTvHomeSpotlightFromDom();
}

export function syncTvHomeSpotlightFromDom(): void {
  const focused = document.querySelector('[data-tv-focus="true"]');
  if (focused) {
    const card = focused.matches(CARD_SEL)
      ? focused
      : focused.closest(CARD_SEL);
    if (card && spotlightFromElement(card)) return;
    if (spotlightFromElement(focused)) return;
  }

  if (spotlightFromFirstCard()) return;

  tvHomeSpotlightStore.set(null);
}
