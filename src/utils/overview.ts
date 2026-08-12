import { resolveBadgeImageUrl, resolveBadgeName } from './badge';
import { resolveCdnAssetUrl } from './posterUrl';
import { formatCommentTimestamp } from './comment';
import { resolveJacksonEntity } from './jackson-refs';
import type { ReleaseCardData } from '../types/release';
import type { CollectionCardData } from '../components/CollectionCard.svelte';
import { mapCollectionCard } from './collection';
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
  profileBadgeUrl?: string | null;
  profileBadgeName?: string;
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
  return mapCollectionCard(raw);
}

export function mapOverviewCommentWeek(
  raw: Record<string, unknown>,
  root?: unknown,
): OverviewCommentWeekItem | null {
  const id = raw.id as number;
  if (!id) return null;
  const profileRaw =
    resolveJacksonEntity(raw.profile, root ?? raw) ??
    ((raw.profile ?? {}) as Record<string, unknown>);
  const profile =
    profileRaw && typeof profileRaw === 'object' && !Array.isArray(profileRaw)
      ? (profileRaw as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const release = resolveJacksonEntity(raw.release, root ?? raw);
  const releaseId = Number(release?.id ?? 0);
  if (!releaseId) return null;

  const badgeRaw =
    resolveJacksonEntity(profile.badge, root ?? raw) ?? profile.badge;

  return {
    id,
    message: String(raw.message ?? ''),
    timestamp: Number(raw.timestamp ?? 0),
    voteCount: Number(raw.vote_count ?? raw.voteCount ?? 0),
    isSpoiler: !!(raw.is_spoiler ?? raw.isSpoiler),
    profileLogin: String(profile.login ?? profile.nickname ?? 'Пользователь'),
    profileAvatar: resolveCdnAssetUrl(String(profile.avatar ?? '')),
    profileBadgeUrl:
      resolveBadgeImageUrl(badgeRaw) ??
      resolveBadgeImageUrl(profile.badge_url) ??
      resolveBadgeImageUrl(profile.badgeUrl),
    profileBadgeName: resolveBadgeName(badgeRaw) || undefined,
    releaseId,
    releaseTitle: String(
      release?.title_ru ?? release?.titleRu ?? release?.title_original ?? release?.title ?? 'Релиз',
    ),
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
