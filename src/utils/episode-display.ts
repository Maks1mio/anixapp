/** Display helpers for episode lists (API `position` may be 0-based, e.g. Sibnet). */

export type EpisodeLike = { position: number; name?: string | null };

/** «Смотреть онлайн» / Фильм — без номера серии (часто position 0 у любого источника). */
export function isUnnumberedEpisodeName(name?: string | null): boolean {
  if (!name || typeof name !== 'string') return false;
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!n) return false;
  return (
    /смотр\S*\s+онлайн/i.test(n)
    || n === 'фильм'
    || n === 'movie'
    || n === 'film'
    || n === 'ova'
    || n === 'ona'
    || n === 'спешл'
    || n === 'special'
  );
}

/** Parse human episode number from Anixart `name` ("1 серия", "серия 12", …). */
export function parseEpisodeNumberFromName(name?: string | null): number | null {
  if (!name || typeof name !== 'string') return null;
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!n || isUnnumberedEpisodeName(n)) return null;

  const patterns = [
    /^(\d{1,4})\s*серия(?:\b|$)/i,
    /^серия\s*(\d{1,4})(?:\b|$)/i,
    /^episode\s*(\d{1,4})(?:\b|$)/i,
    /^ep\.?\s*(\d{1,4})(?:\b|$)/i,
    /^#?\s*(\d{1,4})$/,
  ];
  for (const re of patterns) {
    const m = n.match(re);
    if (m) {
      const num = Number.parseInt(m[1], 10);
      if (Number.isFinite(num) && num >= 0) return num;
    }
  }
  return null;
}

/** True when source uses 0-based `position` while titles are 1-based (Sibnet-style). */
export function isZeroBasedEpisodeList(episodes: EpisodeLike[]): boolean {
  if (!Array.isArray(episodes) || episodes.length < 2) return false;
  const positions = episodes.map((e) => e.position).filter((p) => Number.isFinite(p));
  if (positions.length < 2) return false;
  const min = Math.min(...positions);
  if (min !== 0) return false;
  const atZero = episodes.find((e) => e.position === 0);
  if (isUnnumberedEpisodeName(atZero?.name)) return false;
  const named = parseEpisodeNumberFromName(atZero?.name);
  if (named === 1) return true;
  return positions.includes(1);
}

/**
 * Number shown in UI. Keep using `position` for API (watch/mark/download).
 * Sibnet: position 0 + name "1 серия" → display 1.
 * Returns null when the episode has no meaningful number (Смотреть онлайн / фильм).
 */
export function episodeDisplayNumber(
  ep: EpisodeLike,
  list?: EpisodeLike[] | null,
): number | null {
  if (isUnnumberedEpisodeName(ep.name)) return null;

  const fromName = parseEpisodeNumberFromName(ep.name);
  if (fromName != null) return fromName;

  const zeroBased = list ? isZeroBasedEpisodeList(list) : false;
  if (zeroBased && Number.isFinite(ep.position) && ep.position >= 0) {
    return ep.position + 1;
  }
  return ep.position;
}

/** Short caption for history / top bar / cards. */
export function episodeHistoryLabel(ep: EpisodeLike, list?: EpisodeLike[] | null): string {
  const name = ep.name?.trim() ?? '';
  if (isUnnumberedEpisodeName(name)) return name;
  if (name) {
    const fromName = parseEpisodeNumberFromName(name);
    if (fromName != null) return `${fromName} серия`;
    // Custom title that isn't a bare number label
    if (!/^\d+(?:[.,]\d+)?$/.test(name)) return name;
  }
  const num = episodeDisplayNumber(ep, list);
  if (num == null) return name || 'Смотреть онлайн';
  return `${num} серия`;
}

export function episodeDisplayLabel(ep: EpisodeLike, list?: EpisodeLike[] | null): string {
  const name = ep.name?.trim() ?? '';
  if (isUnnumberedEpisodeName(name)) return name;

  const num = episodeDisplayNumber(ep, list);
  if (num == null) return name || 'Смотреть онлайн';
  if (!name) return `Серия ${num}`;
  const fromName = parseEpisodeNumberFromName(name);
  if (fromName === num || name.toLowerCase() === String(num) || name.toLowerCase() === `${num} серия`) {
    return `Серия ${num}`;
  }
  return `Серия ${num} — ${name}`;
}
