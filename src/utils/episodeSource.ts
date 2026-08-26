import { isDubberBlacklisted, resolveEpisodeUrlWithRetry } from '../views/Watch/_utils';
import { listPlayableDubberSources } from './dubber-sources';

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

/** Films may use episode position 0; prefer explicit match, then 1, then 0, then first in list. */
export function pickDefaultEpisodePosition(
  episodes: Array<{ position: number }>,
  preferred?: number,
): number {
  if (
    preferred != null
    && Number.isFinite(preferred)
    && episodes.some((e) => e.position === preferred)
  ) {
    return preferred;
  }
  if (episodes.length === 0) {
    return preferred != null && Number.isFinite(preferred) ? preferred : 1;
  }
  if (episodes.some((e) => e.position === 1)) return 1;
  if (episodes.some((e) => e.position === 0)) return 0;
  return [...episodes].sort((a, b) => a.position - b.position)[0].position;
}

export async function resolveFirstAvailableEpisode(
  releaseId: number,
  sourceId: number,
  dubberId: number,
  preferred = 1,
): Promise<{ position: number; episode: { url: string; iframe?: boolean } } | null> {
  const api = window.anixApi?.release;
  if (!api?.getEpisode) return null;

  const tryPos = async (pos: number) => {
    const res = await api.getEpisode(releaseId, sourceId, pos);
    return res?.episode?.url ? { position: pos, episode: res.episode } : null;
  };

  const direct = await tryPos(preferred);
  if (direct) return direct;
  if (preferred !== 0) {
    const zero = await tryPos(0);
    if (zero) return zero;
  }
  if (!api.getEpisodes) return null;
  try {
    const list = await api.getEpisodes(releaseId, dubberId, sourceId);
    const eps = (list?.episodes ?? []) as Array<{ position: number }>;
    const picked = pickDefaultEpisodePosition(eps, preferred);
    if (picked === preferred) return null;
    return tryPos(picked);
  } catch {
    return null;
  }
}

export async function listReleaseDubbers(releaseId: number): Promise<DubberOption[]> {
  const api = window.anixApi?.release;
  if (!api?.getDubbers || !Number.isFinite(releaseId) || releaseId <= 0) return [];
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
  return listPlayableDubberSources(releaseId, dubberId);
}

export async function resolveEpisodePlayback(
  releaseId: number,
  dubberId: number,
  sourceId: number,
  episode = 1
): Promise<EpisodePlayback | null> {
  const api = window.anixApi?.release;
  if (!api?.getEpisode || !api.getDubbers || !Number.isFinite(releaseId) || releaseId <= 0) return null;

  try {
    const dubRes = await api.getDubbers(releaseId);
    const dub = (dubRes?.types ?? []).find((d) => d.id === dubberId);
    const epRes = await api.getEpisode(releaseId, sourceId, episode);
    const ep = epRes?.episode;
    if (!ep?.url) return null;

    const resolved = await resolveEpisodeUrlWithRetry(ep.url, ep.iframe);
    if (!resolved.useVideo || !resolved.playUrl) return null;

    const sources = await listPlayableDubberSources(releaseId, dubberId);
    const source = sources.find((s) => s.id === sourceId);

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

/** Best default: top dubber + first source + first playable episode (incl. film ep 0). */
export async function resolveDefaultEpisodePlayback(releaseId: number): Promise<EpisodePlayback | null> {
  const dubbers = await listReleaseDubbers(releaseId);
  for (const dub of dubbers) {
    const sources = await listDubberSources(releaseId, dub.id);
    for (const src of sources) {
      for (const epNum of [1, 0]) {
        const playback = await resolveEpisodePlayback(releaseId, dub.id, src.id, epNum);
        if (playback) return playback;
      }
      const resolved = await resolveFirstAvailableEpisode(releaseId, src.id, dub.id, 1);
      if (resolved) {
        const playback = await resolveEpisodePlayback(
          releaseId,
          dub.id,
          src.id,
          resolved.position,
        );
        if (playback) return playback;
      }
    }
  }
  return null;
}
