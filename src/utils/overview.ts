import { resolveCdnAssetUrl } from './posterUrl';
import { formatCommentTimestamp } from './comment';
import type { ReleaseCardData } from '../types/release';
import type { CollectionCardData } from '../components/CollectionCard.svelte';
import { mapCardData } from '../views/Release/_utils';

export interface OverviewBanner {
  id: number;
  title: string;
  description: string;
  image: string;
  type: number;
  action: string;
}

export interface OverviewDiscussItem extends ReleaseCardData {
  commentPerDayCount: number;
}

export interface OverviewCommentWeekItem {
  id: number;
  message: string;
  timestamp: number;
  voteCount: number;
  isSpoiler: boolean;
  profileLogin: string;
  profileAvatar: string;
  releaseId: number;
  releaseTitle: string;
}

function resolveImageUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  return resolveCdnAssetUrl(value);
}

export function mapOverviewBanner(raw: Record<string, unknown>): OverviewBanner | null {
  if (raw.is_hidden || raw.isHidden) return null;
  const id = raw.id as number;
  if (!id) return null;
  return {
    id,
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    image: resolveImageUrl(raw.image),
    type: Number(raw.type ?? 0),
    action: String(raw.action ?? ''),
  };
}

export function mapOverviewDiscuss(raw: Record<string, unknown>): OverviewDiscussItem {
  const card = mapCardData(raw);
  return {
    ...card,
    commentPerDayCount: Number(raw.comment_per_day_count ?? raw.commentPerDayCount ?? 0),
  };
}

export function mapOverviewCollection(raw: Record<string, unknown>): CollectionCardData {
  return {
    id: raw.id as number,
    title: String(raw.title ?? 'Коллекция'),
    image: resolveImageUrl(raw.image) || undefined,
    description: String(raw.description ?? '') || undefined,
    notesCount: Number(raw.comment_count ?? raw.commentCount ?? 0) || undefined,
    favoritesCount: Number(raw.favorites_count ?? raw.favoritesCount ?? 0) || undefined,
    isFavorite: !!(raw.is_favorite ?? raw.isFavorite),
  };
}

export function mapOverviewCommentWeek(raw: Record<string, unknown>): OverviewCommentWeekItem | null {
  const id = raw.id as number;
  if (!id) return null;
  const profile = (raw.profile ?? {}) as Record<string, unknown>;
  const release = (raw.release ?? {}) as Record<string, unknown>;
  const releaseId = (release.id ?? release['@id']) as number;
  if (!releaseId) return null;

  return {
    id,
    message: String(raw.message ?? ''),
    timestamp: Number(raw.timestamp ?? 0),
    voteCount: Number(raw.vote_count ?? raw.voteCount ?? 0),
    isSpoiler: !!(raw.is_spoiler ?? raw.isSpoiler),
    profileLogin: String(profile.login ?? profile.nickname ?? 'Пользователь'),
    profileAvatar: resolveCdnAssetUrl(String(profile.avatar ?? '')),
    releaseId,
    releaseTitle: String(release.title_ru ?? release.titleRu ?? release.title_original ?? 'Релиз'),
  };
}

export function formatCommentPerDay(count: number): string {
  if (count <= 0) return '0 комментариев';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} комментарий`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} комментария`;
  return `${count} комментариев`;
}

export function formatCommentWeekTime(ts: number): string {
  if (!ts) return '';
  return formatCommentTimestamp(ts);
}

export function episodesLabel(released?: number, total?: number): string {
  if (released == null && total == null) return '';
  if (total != null && total > 0) return `${released ?? 0} / ${total} эп.`;
  if (released != null) return `${released} эп.`;
  return '';
}
