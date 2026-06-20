import { isDubberBlacklisted, resolveEpisodeUrlWithRetry } from '../views/Watch/_utils';

export interface DubberOption {
  id: number;
  name: string;
  viewCount: number;
}

export interface SourceOption {
  id: number;
  name: string;
}

export interface EpisodePlayback {
  releaseId: number;
  dubberId: number;
  dubberName: string;
  sourceId: number;
  sourceName: string;
  playUrl: string;
  episodeUrl: string;
  iframe: boolean;
}

function isVoiceoverDub(d: { type?: number; name: string }): boolean {
  return !(d.type === 1 || /субтитр/i.test(d.name));
}

export async function listReleaseDubbers(releaseId: number): Promise<DubberOption[]> {
  const api = window.anixApi?.release;
  if (!api?.getDubbers) return [];
  const dubRes = await api.getDubbers(releaseId);
  return (dubRes?.types ?? [])
    .filter((d) => isVoiceoverDub(d) && !isDubberBlacklisted(d.name))
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
    .map((d) => ({
      id: d.id,
      name: d.name,
      viewCount: d.view_count ?? 0,
    }));
}

export async function listDubberSources(releaseId: number, dubberId: number): Promise<SourceOption[]> {
  const api = window.anixApi?.release;
  if (!api?.getDubberSources) return [];
  const srcRes = await api.getDubberSources(releaseId, dubberId);
  return (srcRes?.sources ?? []).map((s) => ({ id: s.id, name: s.name }));
}

export async function resolveEpisodePlayback(
  releaseId: number,
  dubberId: number,
  sourceId: number,
  episode = 1
): Promise<EpisodePlayback | null> {
  const api = window.anixApi?.release;
  if (!api?.getEpisode || !api.getDubbers) return null;

  try {
    const dubRes = await api.getDubbers(releaseId);
    const dub = (dubRes?.types ?? []).find((d) => d.id === dubberId);
    const epRes = await api.getEpisode(releaseId, sourceId, episode);
    const ep = epRes?.episode;
    if (!ep?.url) return null;

    const resolved = await resolveEpisodeUrlWithRetry(ep.url, ep.iframe);
    if (!resolved.useVideo || !resolved.playUrl) return null;

    const srcRes = await api.getDubberSources(releaseId, dubberId);
    const source = (srcRes?.sources ?? []).find((s) => s.id === sourceId);

    return {
      releaseId,
      dubberId,
      dubberName: dub?.name ?? `Озвучка ${dubberId}`,
      sourceId,
      sourceName: source?.name ?? `Источник ${sourceId}`,
      playUrl: resolved.playUrl,
      episodeUrl: ep.url,
      iframe: ep.iframe,
    };
  } catch {
    return null;
  }
}

/** Best default: top dubber + first source + ep 1 */
export async function resolveDefaultEpisodePlayback(releaseId: number): Promise<EpisodePlayback | null> {
  const dubbers = await listReleaseDubbers(releaseId);
  for (const dub of dubbers) {
    const sources = await listDubberSources(releaseId, dub.id);
    for (const src of sources) {
      const playback = await resolveEpisodePlayback(releaseId, dub.id, src.id, 1);
      if (playback) return playback;
    }
  }
  return null;
}
