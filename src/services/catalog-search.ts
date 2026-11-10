import { getApiBase } from './anixback-endpoint';
import { mapReleaseRawToCard } from '../utils/release-card';
import type { ReleaseCardData } from '../types/release';

/** Hit from anixback's copy of the Anixart catalog (`/releases/search`). */
export interface CatalogHit {
  card: ReleaseCardData;
  /** The release as the API returned it, in the shape of an Anixart list item. */
  raw: Record<string, unknown>;
  /** Every query word is in the titles (or the field matched); otherwise a typo / wrong-layout match. */
  exact: boolean;
}

export interface CatalogSearchOptions {
  /** Anixart searchBy: 0 titles, 1 studio, 2 director, 3 author, 4 genre, 5 source. */
  by?: number;
  offset?: number;
  limit?: number;
}

/**
 * Typo-tolerant search over anixback's mirror of the catalog. Also finds releases
 * Anixart hides from its own search (`card.hiddenInAnixart`). Null on any failure —
 * the regular Anixart search must work without it.
 */
export async function searchCatalog(
  query: string,
  { by = 0, offset = 0, limit = 30 }: CatalogSearchOptions = {},
): Promise<{ total: number; hits: CatalogHit[] } | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset) });
    if (by > 0) params.set('by', String(by));
    const res = await fetch(`${getApiBase()}/releases/search?${params}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { total?: number; releases?: Array<Record<string, unknown>> };
    const hits = (data.releases ?? [])
      .filter((raw) => Number(raw.id) > 0)
      .map((raw) => ({
        card: { ...mapReleaseRawToCard(raw), hiddenInAnixart: raw.hidden_in_anixart === true },
        raw,
        exact: raw.exact === true,
      }));
    return { total: Number(data.total ?? hits.length), hits };
  } catch {
    return null;
  }
}

export interface CatalogBrowseParams {
  /** popular (в избранном), grade, votes (число оценок), year, updated, new, title, episodes */
  sort: string;
  yearFrom?: number;
  yearTo?: number;
  season?: number;
  genres?: string[];
  statusId?: number;
  categoryId?: number;
  offset: number;
  limit: number;
}

/**
 * Список по статистике AnixApp — anixback's mirror (`/releases/browse`), с сортировками,
 * которых нет у /filter Anixart. Бросает ошибку: вызывающий показывает экран повтора.
 */
export async function browseCatalog(p: CatalogBrowseParams): Promise<{ total: number; items: ReleaseCardData[] }> {
  const params = new URLSearchParams({ sort: p.sort, offset: String(p.offset), limit: String(p.limit) });
  if (p.yearFrom != null) params.set('year_from', String(p.yearFrom));
  if (p.yearTo != null) params.set('year_to', String(p.yearTo));
  if (p.season != null) params.set('season', String(p.season));
  if (p.genres?.length) params.set('genres', p.genres.join(','));
  if (p.statusId != null) params.set('status_id', String(p.statusId));
  if (p.categoryId != null) params.set('category_id', String(p.categoryId));
  const res = await fetch(`${getApiBase()}/releases/browse?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(res.status === 429 ? 'Слишком много запросов — подождите минуту' : `Каталог AnixApp недоступен (${res.status})`);
  const data = (await res.json()) as { total?: number; releases?: Array<Record<string, unknown>> };
  const items = (data.releases ?? [])
    .filter((raw) => Number(raw.id) > 0)
    .map((raw) => ({ ...mapReleaseRawToCard(raw), hiddenInAnixart: raw.hidden_in_anixart === true }));
  return { total: Number(data.total ?? items.length), items };
}
