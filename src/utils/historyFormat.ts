export function formatHistoryViewTime(timestamp: number): string {
  if (!timestamp) return 'Недавно';
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const d = new Date(ms);
  const month = d.toLocaleDateString('ru-RU', { month: 'short' }).replace(/\.$/, '');
  const day = d.getDate();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${month} в ${time}`;
}

export function extractHistoryEpisodeInfo(lastEp: Record<string, unknown> | undefined): {
  episodeLabel?: string;
  dubberLabel?: string;
} {
  if (!lastEp) return {};

  const position = typeof lastEp.position === 'number' ? lastEp.position : null;
  const name = typeof lastEp.name === 'string' ? lastEp.name.trim() : '';
  let episodeLabel = name || undefined;
  if (position != null) {
    episodeLabel = `${position} серия`;
  }

  const source = lastEp.source as Record<string, unknown> | undefined;
  const type = source?.type as { name?: string } | undefined;
  const dubberLabel =
    (typeof type?.name === 'string' && type.name)
    || (typeof source?.name === 'string' && source.name)
    || undefined;

  return { episodeLabel, dubberLabel };
}
