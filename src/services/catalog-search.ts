import { getApiBase } from './anixback-endpoint';
import { mapReleaseRawToCard } from '../utils/release-card';
import type { ReleaseCardData } from '../types/release';

/** Hit from anixback's copy of the Anixart catalog (`/releases/search`). */
export interface CatalogHit {
  card: ReleaseCardData;
  /** Every query word is in the titles (or the field matched); otherwise a typo / wrong-layout match. */
  exact: boolean;
}

export interface CatalogSearchOptions {
  /** Anixart searchBy: 0 titles, 1 studio, 2 director, 3 author, 4 genre, 5 source. */
  by?: number;
  /** Only releases Anixart hides from its own search. */
  hiddenOnly?: boolean;
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
  { by = 0, hiddenOnly = false, offset = 0, limit = 30 }: CatalogSearchOptions = {},
): Promise<{ total: number; hits: CatalogHit[] } | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset) });
    if (by > 0) params.set('by', String(by));
    if (hiddenOnly) params.set('hidden', '1');
    const res = await fetch(`${getApiBase()}/releases/search?${params}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { total?: number; releases?: Array<Record<string, unknown>> };
    const hits = (data.releases ?? [])
      .filter((raw) => Number(raw.id) > 0)
      .map((raw) => ({
        card: { ...mapReleaseRawToCard(raw), hiddenInAnixart: raw.hidden_in_anixart === true },
        exact: raw.exact === true,
      }));
    return { total: Number(data.total ?? hits.length), hits };
  } catch {
    return null;
  }
}
