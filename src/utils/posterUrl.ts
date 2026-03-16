const POSTER_BASE = 'https://s.anixmirai.com/posters';

/** Собирает URL постера: id → https://s.anixmirai.com/posters/{id}.jpg */
export function buildPosterUrl(value: string | undefined): string {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const id = trimmed.endsWith('.jpg') || trimmed.endsWith('.jpeg') || trimmed.endsWith('.png')
    ? trimmed
    : `${trimmed}.jpg`;
  return `${POSTER_BASE}/${id}`;
}
