import { episodeHistoryLabel } from './episode-display';

export function formatHistoryViewTime(timestamp: number): string {
  if (!timestamp) return 'Недавно';
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const d = new Date(ms);
  const month = d.toLocaleDateString('ru-RU', { month: 'short' }).replace(/\.$/, '');
  const day = d.getDate();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${month} в ${time}`;
}

export function extractHistoryEpisodeInfo(
  lastEp: Record<string, unknown> | undefined,
  opts?: { isFilm?: boolean; episodesTotal?: number | null },
): {
  episodeLabel?: string;
  dubberLabel?: string;
} {
  if (!lastEp) return {};

  const positionRaw = lastEp.position;
  const position = typeof positionRaw === 'number'
    ? positionRaw
    : Number.parseInt(String(positionRaw ?? ''), 10);
  const name = typeof lastEp.name === 'string' ? lastEp.name.trim() : '';
  const pos = Number.isFinite(position) ? position : 0;

  let episodeLabel = episodeHistoryLabel({ position: pos, name: name || null });

  // Film / single-title source: bare position 0 without a useful name
  if (
    (!name || /^0\s*серия$/i.test(episodeLabel))
    && pos === 0
    && (opts?.isFilm || opts?.episodesTotal === 1)
  ) {
    episodeLabel = 'Смотреть онлайн';
  }

  const source = lastEp.source as Record<string, unknown> | undefined;
  const type = source?.type as { name?: string } | undefined;
  const dubberLabel =
    (typeof type?.name === 'string' && type.name)
    || (typeof source?.name === 'string' && source.name)
    || undefined;

  return {
    episodeLabel: episodeLabel || undefined,
    dubberLabel,
  };
}
