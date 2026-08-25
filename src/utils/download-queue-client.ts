import { isLibriaHtmlEmbed, resolveDownloadUrl } from '../views/Watch/_utils';

export interface QueueDownloadItem {
  url: string;
  filename: string;
  folder: string;
  headers?: Record<string, string>;
  releaseId: number;
  sourceId: number;
  dubberId: number;
  episodePosition: number;
  releaseTitle: string;
  dubberName: string;
  sourceName: string;
  skip?: {
    opening?: { start: number; end: number } | null;
    ending?: { start: number; end: number } | null;
  } | null;
}

function safeFilePart(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'episode';
}

/** Папка: `Тайтл/Озвучка/Источник` (относительно Anixapp). */
export function buildDownloadFolder(
  releaseTitle: string,
  dubberName: string,
  sourceName: string,
): string {
  return [
    safeFilePart(releaseTitle),
    safeFilePart(dubberName || 'Озвучка'),
    safeFilePart(sourceName || 'Источник'),
  ].join('/');
}

/** Имя файла: `Название аниме 01.mp4`. */
export function buildEpisodeFilename(
  releaseTitle: string,
  _dubName: string,
  position: number,
  _playerName = '',
): string {
  const title = safeFilePart(releaseTitle);
  const epNum = String(Math.max(0, position | 0)).padStart(2, '0');
  return `${title} ${epNum}.mp4`;
}

/** Плоское имя без папок (то же правило, чтобы не плодить длинные имена). */
export function buildFlatEpisodeFilename(
  releaseTitle: string,
  _dubName: string,
  position: number,
  _playerName = '',
): string {
  return buildEpisodeFilename(releaseTitle, '', position, '');
}

function sourceFallbackRank(name: string): number {
  const n = String(name || '');
  if (/не\s*работает/i.test(n)) return 100;
  if (/kodik/i.test(n)) return 0;
  if (/sibnet/i.test(n)) return 2;
  if (/libria|анилиб/i.test(n)) return 5;
  return 3;
}

function looksLikeLibriaUrl(url: string): boolean {
  return isLibriaHtmlEmbed(url) || /aniliberty|anilibria|libria\.fun/i.test(url);
}

/**
 * Если основной источник (часто Libria iframe 404) не резолвится —
 * пробуем другие плееры той же озвучки (Kodik первым).
 */
export async function resolveDownloadWithSiblingFallback(opts: {
  releaseId: number;
  sourceId: number;
  dubberId: number;
  position: number;
  episodeUrl?: string;
  iframe?: boolean;
}): Promise<{
  url: string;
  headers: Record<string, string>;
  skip: QueueDownloadItem['skip'];
  sourceId: number;
  sourceName: string | null;
} | null> {
  let url = opts.episodeUrl ?? '';
  let useIframe = !!opts.iframe;
  if (!url) {
    const res = await window.anixApi?.release?.getEpisode?.(
      opts.releaseId,
      opts.sourceId,
      opts.position,
    );
    const ep = res?.episode;
    if (!ep?.url) return null;
    url = ep.url;
    useIframe = !!ep.iframe;
  }

  const primary = await resolveDownloadUrl(url, useIframe);
  if (primary?.url) {
    return {
      url: primary.url,
      headers: primary.headers,
      skip: primary.skip ?? null,
      sourceId: opts.sourceId,
      sourceName: null,
    };
  }

  // Fallback только когда упал Libria / не удалось получить прямую ссылку
  if (!looksLikeLibriaUrl(url) && opts.dubberId == null) return null;
  if (!Number.isFinite(opts.dubberId)) return null;

  const srcRes = await window.anixApi?.release?.getDubberSources?.(
    opts.releaseId,
    opts.dubberId,
  );
  const sources = Array.isArray(srcRes?.sources) ? [...srcRes.sources] : [];
  sources.sort(
    (a, b) => sourceFallbackRank(a?.name || '') - sourceFallbackRank(b?.name || ''),
  );

  for (const src of sources) {
    const sid = Number(src?.id);
    if (!Number.isFinite(sid) || sid === opts.sourceId) continue;
    if (sourceFallbackRank(src?.name || '') >= 100) continue;
    try {
      const epRes = await window.anixApi?.release?.getEpisode?.(
        opts.releaseId,
        sid,
        opts.position,
      );
      const ep = epRes?.episode;
      if (!ep?.url) continue;
      // Не уходим снова на мёртвый Libria iframe
      if (looksLikeLibriaUrl(ep.url)) continue;
      const resolved = await resolveDownloadUrl(ep.url, !!ep.iframe);
      if (!resolved?.url) continue;
      return {
        url: resolved.url,
        headers: resolved.headers,
        skip: resolved.skip ?? null,
        sourceId: sid,
        sourceName: typeof src?.name === 'string' ? src.name : 'Источник',
      };
    } catch {
      /* next */
    }
  }
  return null;
}

export async function resolveQueueItem(
  releaseId: number,
  sourceId: number,
  dubberId: number,
  releaseTitle: string,
  dubberName: string,
  sourceName: string,
  position: number,
  episodeUrl?: string,
  iframe = false,
): Promise<QueueDownloadItem | null> {
  const resolved = await resolveDownloadWithSiblingFallback({
    releaseId,
    sourceId,
    dubberId,
    position,
    episodeUrl,
    iframe,
  });
  if (!resolved?.url) return null;

  const effectiveSourceId = resolved.sourceId;
  const effectiveSourceName = resolved.sourceName || sourceName;

  return {
    url: resolved.url,
    filename: buildEpisodeFilename(releaseTitle, dubberName, position, effectiveSourceName),
    folder: buildDownloadFolder(releaseTitle, dubberName, effectiveSourceName),
    headers: resolved.headers,
    releaseId,
    sourceId: effectiveSourceId,
    dubberId,
    episodePosition: position,
    releaseTitle,
    dubberName,
    sourceName: effectiveSourceName,
    skip: resolved.skip ?? null,
  };
}

export async function queueMissingEpisodes(opts: {
  releaseId: number;
  sourceId: number;
  dubberId: number;
  releaseTitle: string;
  dubberName: string;
  sourceName: string;
  existingPositions: number[];
}): Promise<number> {
  const res = await window.anixApi?.release?.getEpisodes?.(
    opts.releaseId,
    opts.dubberId,
    opts.sourceId,
  );
  const episodes = res?.episodes ?? [];
  const have = new Set(opts.existingPositions);
  const missing = episodes.filter((ep) => !have.has(ep.position));
  if (missing.length === 0) return 0;

  const items: QueueDownloadItem[] = [];
  for (const ep of missing) {
    const item = await resolveQueueItem(
      opts.releaseId,
      opts.sourceId,
      opts.dubberId,
      opts.releaseTitle,
      opts.dubberName,
      opts.sourceName,
      ep.position,
      ep.url,
      ep.iframe,
    );
    if (item) items.push(item);
  }
  if (items.length === 0) return 0;
  await window.electron?.queueEpisodeDownloads?.({ items });
  return items.length;
}
