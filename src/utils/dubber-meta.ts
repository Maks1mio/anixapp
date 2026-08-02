/** Dubber list helpers: pin sort + mobile QualityBadge / novelty labels. */

export type DubberQuality = 1 | 2 | 3;

/** Mobile QualityBadge: 1=FHD, 2=QHD, 3=4K. */
export function formatDubberQuality(quality: unknown): string | null {
  const q = typeof quality === 'number' ? quality : Number(quality);
  if (q === 1) return '1080p';
  if (q === 2) return 'QHD';
  if (q === 3) return '4K';
  return null;
}

export function isDubberPinned(d: { pinned?: boolean }): boolean {
  return d.pinned === true;
}

/** Mobile «НОВИНКА»: type id matches release.episode_last_update.last_episode_type_update_id. */
export function isDubberNovelty(
  dubberId: number | string | undefined,
  lastEpisodeTypeUpdateId: number | null | undefined,
): boolean {
  if (lastEpisodeTypeUpdateId == null || lastEpisodeTypeUpdateId <= 0) return false;
  const id = typeof dubberId === 'number' ? dubberId : Number(dubberId);
  return Number.isFinite(id) && id === lastEpisodeTypeUpdateId;
}

export function readLastEpisodeTypeUpdateId(release: unknown): number | null {
  const r = release && typeof release === 'object' ? (release as Record<string, unknown>) : null;
  if (!r) return null;
  const update = (r.episode_last_update ?? r.episodeLastUpdate) as Record<string, unknown> | undefined;
  const raw =
    update?.last_episode_type_update_id
    ?? update?.lastEpisodeTypeUpdateId
    ?? r.last_episode_type_update_id
    ?? r.lastEpisodeTypeUpdateId;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Pinned first, keep relative order otherwise. */
export function sortDubbersPinnedFirst<T extends { pinned?: boolean }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(isDubberPinned(b)) - Number(isDubberPinned(a)));
}
