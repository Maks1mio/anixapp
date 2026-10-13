/** Постановка серий в очередь загрузок (телефон): весь тайтл, недостающие серии, постер для офлайна. */
import { mapCardData } from '../views/Release/_utils';
import { queueEpisode, savePoster, type DownloadMeta } from '../native/anix-downloads';
import { refreshDownloads } from '../stores/mobile-downloads';

export const QUALITY_CHOICES = [
  { id: '360', label: '360p', hint: 'Минимум места' },
  { id: '480', label: '480p', hint: 'Экономия' },
  { id: '720', label: '720p', hint: 'Рекомендуется' },
  { id: '1080', label: '1080p', hint: 'Максимум' },
] as const;

const Q_KEY = 'anix:dlQuality';

export function getDownloadQuality(): string {
  try { return localStorage.getItem(Q_KEY) || '720'; } catch { return '720'; }
}
export function setDownloadQuality(q: string): void {
  try { localStorage.setItem(Q_KEY, q); } catch { /* ignore */ }
}

export interface DubContext {
  releaseId: number;
  releaseTitle: string;
  sourceId: number;
  sourceName: string;
  dubberId: number;
  dubberName: string;
  episodesTotal: number;
}

export interface QueueEp {
  position: number;
  name: string;
  url: string;
}

/** URL постера релиза (из карточки релиза). */
async function fetchPosterUrl(releaseId: number): Promise<string | undefined> {
  try {
    const data = (await window.anixApi!.release.info(releaseId, false)) as { release?: Record<string, unknown> };
    if (!data?.release) return undefined;
    return mapCardData(data.release).poster || undefined;
  } catch { return undefined; }
}

/** Серии озвучки/источника из API (нужны url для резолва) — для «докачать остальные». */
export async function fetchDubEpisodes(ctx: Pick<DubContext, 'releaseId' | 'dubberId' | 'sourceId'>): Promise<QueueEp[]> {
  const res = await window.anixApi!.release.getEpisodes(ctx.releaseId, ctx.dubberId, ctx.sourceId);
  return (res?.episodes ?? [])
    .filter((e: { url?: string }) => !!e?.url)
    .map((e: { position: number; name?: string; url: string }) => ({
      position: e.position,
      name: e.name || `${e.position} серия`,
      url: e.url,
    }));
}

export interface QueueResult { queued: number; skipped: number; failed: number; error?: string }

/** Ставит серии в очередь (по 3 одновременно: каждая — отдельный резолв через AnixBack). */
export async function queueEpisodes(
  ctx: DubContext,
  eps: QueueEp[],
  quality: string,
  onProgress?: (done: number, total: number) => void,
): Promise<QueueResult> {
  const res: QueueResult = { queued: 0, skipped: 0, failed: 0 };
  if (eps.length === 0) return res;

  const poster = await fetchPosterUrl(ctx.releaseId);
  const posterPath = poster ? await savePoster(ctx.releaseId, poster) : undefined;

  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < eps.length) {
      const ep = eps[next++];
      const meta: DownloadMeta = {
        releaseId: ctx.releaseId,
        releaseTitle: ctx.releaseTitle,
        poster,
        posterPath,
        sourceId: ctx.sourceId,
        sourceName: ctx.sourceName,
        dubberId: ctx.dubberId,
        dubberName: ctx.dubberName,
        episodePosition: ep.position,
        episodeName: ep.name,
        episodesTotal: ctx.episodesTotal,
      };
      try {
        const r = await queueEpisode(meta, ep.url, quality);
        if (r.skipped) res.skipped += 1; else res.queued += 1;
      } catch (e) {
        res.failed += 1;
        res.error = e instanceof Error ? e.message : String(e);
      }
      done += 1;
      onProgress?.(done, eps.length);
      void refreshDownloads();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  await refreshDownloads();
  return res;
}
