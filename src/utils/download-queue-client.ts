import { resolveDownloadUrl } from '../views/Watch/_utils';

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
}

function safeFilePart(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'episode';
}

export function buildEpisodeFilename(releaseTitle: string, dubName: string, position: number): string {
  const epNum = String(position).padStart(2, '0');
  return `${safeFilePart(releaseTitle)} ${safeFilePart(dubName)} ${epNum}.mp4`;
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
  let url = episodeUrl ?? '';
  let useIframe = iframe;
  if (!url) {
    const res = await window.anixApi?.release?.getEpisode?.(releaseId, sourceId, position);
    const ep = res?.episode;
    if (!ep?.url) return null;
    url = ep.url;
    useIframe = !!ep.iframe;
  }
  const resolved = await resolveDownloadUrl(url, useIframe);
  if (!resolved?.url) return null;
  return {
    url: resolved.url,
    filename: buildEpisodeFilename(releaseTitle, dubberName || sourceName, position),
    folder: safeFilePart(releaseTitle),
    headers: resolved.headers,
    releaseId,
    sourceId,
    dubberId,
    episodePosition: position,
    releaseTitle,
    dubberName,
    sourceName,
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
