/** «Продолжить» on a release: the dub and episode the user really watched last, not the last ticked one. */
import { episodeDisplayNumber } from '../utils/episode-display';
import { fetchWatchProgress, isWatchFinished } from './watch-progress';

export interface ContinueTarget {
  sourceId: number;
  sourceName: string;
  dubberId?: number;
  dubberName?: string;
  episode: number;
  /** «117 серия · AniLibria» */
  label: string;
}

type EpisodeRow = { position: number; name?: string | null };

async function loadEpisodes(releaseId: number, dubberId: number | null, sourceId: number): Promise<EpisodeRow[]> {
  if (dubberId == null) return [];
  try {
    const res = await window.anixApi?.release?.getEpisodes?.(releaseId, dubberId, sourceId);
    return ((res?.episodes ?? []) as EpisodeRow[]).slice().sort((a, b) => a.position - b.position);
  } catch {
    return [];
  }
}

export async function loadContinueTarget(releaseId: number): Promise<ContinueTarget | null> {
  const latest = (await fetchWatchProgress(releaseId))?.[0];
  if (!latest?.source_id) return null;

  const episodes = await loadEpisodes(releaseId, latest.dubber_id, latest.source_id);
  let episode = latest.episode_position;
  // Watched to the credits: go on with the next episode, if there is one yet.
  if (isWatchFinished(latest)) {
    episode = episodes.find((e) => e.position > episode)?.position ?? episode;
  }

  const row = episodes.find((e) => e.position === episode);
  const number = episodeDisplayNumber(row ?? { position: episode, name: null }, episodes);
  const episodeLabel = number != null ? `${number} серия` : row?.name?.trim() || `${episode} серия`;
  return {
    sourceId: latest.source_id,
    sourceName: latest.source_name ?? '',
    dubberId: latest.dubber_id ?? undefined,
    dubberName: latest.dubber_name ?? undefined,
    episode,
    label: [episodeLabel, latest.dubber_name].filter(Boolean).join(' · '),
  };
}
