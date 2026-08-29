import type { ReleaseCardData } from '../types/release';
import { extractHistoryEpisodeInfo } from './historyFormat';
import { mapReleaseRawToCard } from './release-card';

function mapHistoryReleaseBase(raw: Record<string, unknown>): ReleaseCardData {
  const releaseRaw =
    raw.release && typeof raw.release === 'object'
      ? (raw.release as Record<string, unknown>)
      : raw;
  const voteRaw =
    typeof raw.my_vote === 'number'
      ? raw.my_vote
      : typeof raw.vote === 'number'
        ? raw.vote
        : typeof releaseRaw.my_vote === 'number'
          ? releaseRaw.my_vote
          : undefined;
  const myVote = typeof voteRaw === 'number' && voteRaw > 0 ? voteRaw : undefined;
  return {
    ...mapReleaseRawToCard(releaseRaw, { preferLargePoster: true }),
    myVote,
  };
}

export function mapHistoryRawToReleaseCard(raw: Record<string, unknown>): ReleaseCardData {
  const lastEp = raw.last_view_episode as Record<string, unknown> | undefined;
  const releaseRaw = (raw.release as Record<string, unknown> | undefined) ?? raw;
  const categoryName = String(
    (releaseRaw.category as { name?: string } | undefined)?.name
    ?? (raw.category as { name?: string } | undefined)?.name
    ?? '',
  ).toLowerCase();
  const episodesTotal = typeof releaseRaw.episodes_total === 'number'
    ? releaseRaw.episodes_total
    : typeof raw.episodes_total === 'number'
      ? raw.episodes_total
      : null;
  const { episodeLabel, dubberLabel } = extractHistoryEpisodeInfo(lastEp, {
    isFilm: /фильм|movie|film/i.test(categoryName),
    episodesTotal,
  });
  const viewedAt = typeof raw.last_view_timestamp === 'number' ? raw.last_view_timestamp : undefined;
  return {
    ...mapHistoryReleaseBase(raw),
    historyView: {
      episodeLabel,
      dubberLabel,
      viewedAt,
    },
  };
}
