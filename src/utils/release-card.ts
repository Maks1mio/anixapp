import { buildPosterUrl } from './posterUrl';
import type { ReleaseCardData } from '../types/release';

function strField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function pickReleasePosterRaw(
  raw: Record<string, unknown>,
  preferLarge = false,
): string | undefined {
  const p = raw.poster as Record<string, { url?: string }> | undefined;
  if (preferLarge) {
    return p?.original?.url ?? p?.medium?.url ?? p?.small?.url
      ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
      ?? (typeof raw.image === 'string' ? raw.image : undefined);
  }
  return p?.small?.url ?? p?.medium?.url ?? p?.original?.url
    ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
    ?? (typeof raw.image === 'string' ? raw.image : undefined);
}

export function mapReleaseRawToCard(
  raw: Record<string, unknown>,
  options?: { preferLargePoster?: boolean },
): ReleaseCardData {
  const posterRaw = pickReleasePosterRaw(raw, options?.preferLargePoster === true);
  const poster = posterRaw ? buildPosterUrl(posterRaw) || undefined : undefined;
  const grade =
    typeof raw.grade === 'number'
      ? raw.grade
      : typeof raw.rating === 'number'
        ? raw.rating
        : undefined;
  const profileListStatus = typeof raw.profile_list_status === 'number' ? raw.profile_list_status : undefined;
  let listStatus: ReleaseCardData['listStatus'];
  switch (profileListStatus) {
    case 1: listStatus = 'watching'; break;
    case 2: listStatus = 'planned'; break;
    case 3: listStatus = 'completed'; break;
    case 4: listStatus = 'on_hold'; break;
    case 5: listStatus = 'dropped'; break;
    default: listStatus = undefined;
  }
  return {
    id: raw.id as number | undefined,
    titleRu: (raw.title_ru ?? raw.titleRu) as string | undefined,
    titleEn: (raw.title_original ?? raw.titleEn) as string | undefined,
    titleAlt: (raw.title_alt as string) || undefined,
    description: (raw.description as string) || undefined,
    poster: poster || undefined,
    rating: grade,
    voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : undefined,
    episodesReleased: typeof raw.episodes_released === 'number' ? raw.episodes_released : undefined,
    episodesTotal: typeof raw.episodes_total === 'number' ? raw.episodes_total : undefined,
    year: typeof raw.year === 'string' ? raw.year : (typeof raw.year === 'number' ? String(raw.year) : undefined),
    country: (raw.country as string) || undefined,
    genres: (raw.genres as string) || undefined,
    status: (raw.status as { name?: string })?.name,
    statusId:
      typeof (raw.status as { id?: number } | undefined)?.id === 'number'
        ? (raw.status as { id: number }).id
        : typeof raw.status_id === 'number'
          ? raw.status_id
          : undefined,
    studio: strField(raw.studio),
    category: (raw.category as { name?: string })?.name,
    source: strField(raw.source),
    author: strField(raw.author),
    director: strField(raw.director),
    duration: typeof raw.duration === 'number' ? raw.duration : undefined,
    season: typeof raw.season === 'number' ? raw.season : undefined,
    airedOnDate: typeof raw.aired_on_date === 'number' ? raw.aired_on_date : undefined,
    favoritesCount: typeof raw.favorites_count === 'number' ? raw.favorites_count : undefined,
    releaseDate: (raw.release_date as string) || undefined,
    isFavorite: !!(raw.is_favorite),
    listStatus,
    ageRating: typeof raw.age_rating === 'number' ? raw.age_rating : undefined,
    isAdult: !!raw.is_adult,
  };
}

const LIST_STATUS_LABELS: Record<NonNullable<ReleaseCardData['listStatus']>, string> = {
  watching: 'смотрю',
  planned: 'в планах',
  completed: 'просмотрено',
  on_hold: 'отложено',
  dropped: 'брошено',
};

export function releaseCardTitle(data: ReleaseCardData): string {
  return data.titleRu || data.titleEn || data.titleAlt || 'Без названия';
}

export function releaseCardMeta(data: ReleaseCardData): string {
  const parts: string[] = [];
  if (data.episodesTotal) parts.push(`${data.episodesTotal} эп`);
  if (typeof data.rating === 'number') parts.push(`${data.rating.toFixed(1)} ★`);
  return parts.join(' • ');
}

export function releaseListStatusLabel(status?: ReleaseCardData['listStatus']): string | null {
  if (!status) return null;
  return LIST_STATUS_LABELS[status] ?? null;
}

/** Anixart ReleaseStatus.Announced = 3 */
export function isReleaseAnnounce(
  status?: string | null,
  statusId?: number | null,
): boolean {
  if (statusId === 3) return true;
  return /^анонс$/i.test(String(status ?? '').trim());
}

export function releaseRawToStored(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw };
}
