import { buildPosterUrl } from './posterUrl';
import type { ReleaseCardData } from '../types/release';

export function mapReleaseRawToCard(raw: Record<string, unknown>): ReleaseCardData {
  const p = raw.poster as Record<string, { url?: string }> | undefined;
  const posterRaw = p?.original?.url ?? p?.medium?.url ?? p?.small?.url
    ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
    ?? (typeof raw.image === 'string' ? raw.image : undefined);
  const poster = posterRaw ? buildPosterUrl(posterRaw) || undefined : undefined;
  const grade = typeof raw.grade === 'number' ? raw.grade : undefined;
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
    studio: (raw.studio as string) || undefined,
    category: (raw.category as { name?: string })?.name,
    releaseDate: (raw.release_date as string) || undefined,
    isFavorite: !!(raw.is_favorite),
    listStatus,
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

export function releaseRawToStored(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw };
}
