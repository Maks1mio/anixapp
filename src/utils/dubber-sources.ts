/** Источники озвучки: официальный список + скрытые из episode/updates. */

export type DubberSourceRef = { id: number; name: string };

/** Сообщение, когда у озвучки нет рабочей серии / источника. */
export const NO_EPISODE_PICK_OTHER_DUB = 'Серии нет. Выберите другую озвучку';

/** Anixart помечает мёртвые источники в имени, например «Источник 3 (не работает)». */
export function isUnusableSourceName(name: string | null | undefined): boolean {
  return /не\s*работает/i.test(String(name ?? ''));
}

type EpisodeUpdateLike = {
  last_episode_source_update_id?: number;
  last_episode_source_update_name?: string;
  last_episode_type_update_id?: number;
};

type ReleaseApi = {
  getDubberSources?: (
    releaseId: number,
    dubberId: number,
  ) => Promise<{ sources?: Array<{ id: number; name: string }> }>;
  getEpisodeUpdates?: (
    releaseId: number,
    page?: number,
  ) => Promise<{
    content?: EpisodeUpdateLike[];
    total_page_count?: number;
  }>;
};

const TTL_MS = 5 * 60 * 1000;
const updatesCache = new Map<number, { at: number; rows: EpisodeUpdateLike[] }>();
const sourcesCache = new Map<string, { at: number; sources: DubberSourceRef[] }>();

function releaseApi(api?: ReleaseApi): ReleaseApi | undefined {
  return api ?? (typeof window !== 'undefined' ? window.anixApi?.release : undefined);
}

function cacheKey(releaseId: number, dubberId: number): string {
  return `${releaseId}:${dubberId}`;
}

function asSource(idRaw: unknown, nameRaw: unknown): DubberSourceRef | null {
  const id = typeof idRaw === 'number' ? idRaw : Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) return null;
  const name = String(nameRaw ?? '').trim() || `Источник ${id}`;
  if (isUnusableSourceName(name)) return null;
  return { id, name };
}

export function invalidateDubberSourcesCache(releaseId?: number): void {
  if (releaseId != null && Number.isFinite(releaseId) && releaseId > 0) {
    updatesCache.delete(releaseId);
    const prefix = `${releaseId}:`;
    for (const key of sourcesCache.keys()) {
      if (key.startsWith(prefix)) sourcesCache.delete(key);
    }
    return;
  }
  updatesCache.clear();
  sourcesCache.clear();
}

async function loadEpisodeUpdates(api: ReleaseApi, releaseId: number): Promise<EpisodeUpdateLike[]> {
  const hit = updatesCache.get(releaseId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  if (!api.getEpisodeUpdates) return [];

  const rows: EpisodeUpdateLike[] = [];
  const first = await api.getEpisodeUpdates(releaseId, 0);
  rows.push(...(first?.content ?? []));
  const pages = Math.min(Number(first?.total_page_count) || 1, 5);
  for (let page = 1; page < pages; page++) {
    const next = await api.getEpisodeUpdates(releaseId, page);
    rows.push(...(next?.content ?? []));
  }
  updatesCache.set(releaseId, { at: Date.now(), rows });
  return rows;
}

function sourcesFromUpdates(rows: EpisodeUpdateLike[], dubberId: number): DubberSourceRef[] {
  const found = new Map<number, DubberSourceRef>();
  for (const row of rows) {
    const typeId = Number(row.last_episode_type_update_id);
    if (typeId !== dubberId) continue;
    const src = asSource(row.last_episode_source_update_id, row.last_episode_source_update_name);
    if (src) found.set(src.id, src);
  }
  return [...found.values()];
}

/**
 * Официальный `episode/{release}/{type}` иногда пустой, хотя озвучка есть в списке
 * (Anixart прячет источники вроде «Источник N (не работает)»).
 * Тогда берём source id из episode/updates.
 */
export async function listPlayableDubberSources(
  releaseId: number,
  dubberId: number,
  api?: ReleaseApi,
): Promise<DubberSourceRef[]> {
  const release = releaseApi(api);
  if (!release?.getDubberSources) return [];
  if (!Number.isFinite(releaseId) || releaseId <= 0 || !Number.isFinite(dubberId) || dubberId <= 0) {
    return [];
  }

  const key = cacheKey(releaseId, dubberId);
  const cached = sourcesCache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.sources.filter((s) => !isUnusableSourceName(s.name));
  }

  let official: DubberSourceRef[] = [];
  try {
    const res = await release.getDubberSources(releaseId, dubberId);
    official = (res?.sources ?? [])
      .map((s) => asSource(s.id, s.name))
      .filter((s): s is DubberSourceRef => s != null);
  } catch {
    official = [];
  }
  if (official.length > 0) {
    sourcesCache.set(key, { at: Date.now(), sources: official });
    return official;
  }

  let hidden: DubberSourceRef[] = [];
  try {
    hidden = sourcesFromUpdates(await loadEpisodeUpdates(release, releaseId), dubberId);
  } catch {
    hidden = [];
  }
  sourcesCache.set(key, { at: Date.now(), sources: hidden });
  return hidden;
}
