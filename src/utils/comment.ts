import type { CommentData, CommentProfile, CommentVoteValue, CommentSort } from '../types/comment';
import { resolveCdnAssetUrl } from './posterUrl';
import { resolveBadgeName, resolveBadgeImageUrl } from './badge';
import { COMMENT_SORT_OPTIONS } from '../types/comment';
import { resolveJacksonEntity, resolveJacksonRefs } from './jackson-refs';

export { COMMENT_SORT_OPTIONS };
export type { CommentSort };

export const COMMENT_MIN_LENGTH = 5;
export const COMMENT_MAX_LENGTH = 720;

const MONTHS_SHORT = [
  'янв.', 'февр.', 'мар.', 'апр.', 'май', 'июн.',
  'июл.', 'авг.', 'сен.', 'окт.', 'нояб.', 'дек.',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Mobile-style: «10 июн. в 15:24» */
export function formatCommentTimestamp(ts: number): string {
  const date = new Date(ts * 1000);
  const now = new Date();
  const diff = Date.now() - date.getTime();

  if (diff < 60_000) return 'только что';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин. назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч. назад`;

  const isSameYear = date.getFullYear() === now.getFullYear();
  const dayMonth = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

  if (isSameYear) return `${dayMonth} в ${time}`;
  return `${dayMonth} ${date.getFullYear()} в ${time}`;
}

export function formatCommentsTotal(count: number): string {
  return `${count} всего`;
}

export function getCommentSortLabel(sort: CommentSort): string {
  return COMMENT_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Сначала новые';
}

export function normalizeCommentProfile(
  raw: Record<string, unknown> | undefined,
  root?: unknown,
): CommentProfile {
  if (!raw) {
    return { id: 0, login: 'Пользователь', avatar: '' };
  }
  const id = Number(raw.id ?? raw['@id'] ?? 0);
  const badgeRaw =
    resolveJacksonEntity(raw.badge, root ?? raw) ??
    (raw.badge && typeof raw.badge === 'object' && !Array.isArray(raw.badge)
      ? (raw.badge as Record<string, unknown>)
      : raw.badge);
  const badgeUrl =
    resolveBadgeImageUrl(badgeRaw) ??
    resolveBadgeImageUrl(raw.badge_url) ??
    resolveBadgeImageUrl(raw.badgeUrl) ??
    undefined;
  const badgeName = resolveBadgeName(badgeRaw) || undefined;
  return {
    id: Number.isFinite(id) && id > 0 ? id : 0,
    login: String(raw.login ?? raw.nickname ?? 'Пользователь'),
    avatar: resolveCdnAssetUrl(String(raw.avatar ?? '')),
    badgeUrl,
    badgeName,
    isVerified: !!(raw.is_verified ?? raw.isVerified),
    isSponsor: !!(raw.is_sponsor ?? raw.isSponsor),
  };
}

export function normalizeComment(raw: Record<string, unknown>, root?: unknown): CommentData {
  const vote = raw.vote ?? raw.user_vote ?? 0;
  const profileRaw = resolveJacksonEntity(raw.profile, root ?? raw)
    ?? (raw.profile && typeof raw.profile === 'object' && !Array.isArray(raw.profile)
      ? raw.profile as Record<string, unknown>
      : undefined);

  return {
    id: raw.id as number,
    message: String(raw.message ?? ''),
    timestamp: (raw.timestamp as number) ?? 0,
    voteCount: Number(raw.vote_count ?? raw.voteCount ?? 0),
    userVote: (typeof vote === 'number' ? vote : 0) as CommentVoteValue,
    isSpoiler: !!(raw.is_spoiler ?? raw.isSpoiler),
    isEdited: !!(raw.is_edited ?? raw.isEdited),
    isDeleted: !!(raw.is_deleted ?? raw.isDeleted),
    replyCount: Number(raw.reply_count ?? raw.replyCount ?? 0),
    parentCommentId: (raw.parent_comment_id ?? raw.parentCommentId ?? null) as number | null,
    postedAtEpisode: (raw.posted_at_episode ?? raw.postedAtEpisode ?? null) as number | null,
    profile: normalizeCommentProfile(profileRaw, root ?? raw),
  };
}

/** Список комментариев из ответа API с разворотом Jackson @id. */
export function normalizeCommentsFromResponse(data: Record<string, unknown>): CommentData[] {
  const resolved = resolveJacksonRefs(data) as Record<string, unknown>;
  const content = Array.isArray(resolved.content) ? resolved.content : [];
  return content
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((raw) => normalizeComment(raw, resolved));
}

export function isCommentContentHidden(comment: CommentData, revealed: boolean): boolean {
  if (revealed || comment.isDeleted) return false;
  if (comment.isSpoiler) return true;
  if (comment.voteCount <= -5) return true;
  return false;
}

export function isCommentHideable(comment: Pick<CommentData, 'isSpoiler' | 'voteCount' | 'isDeleted'>): boolean {
  if (comment.isDeleted) return false;
  return !!comment.isSpoiler || comment.voteCount <= -5;
}

export function hiddenCommentLabel(comment: CommentData): string {
  const spoiler = comment.isSpoiler;
  const lowVotes = comment.voteCount <= -5;

  if (spoiler && lowVotes) {
    return 'Комментарий может содержать спойлер и скрыт из-за низкого рейтинга. Нажмите, чтобы прочитать';
  }
  if (lowVotes) {
    return 'Комментарий скрыт из-за низкого рейтинга. Нажмите, чтобы прочитать';
  }
  if (spoiler) {
    return 'Комментарий может содержать спойлер. Нажмите, чтобы прочитать';
  }
  return '';
}

export function hiddenCommentMeta(comment: Pick<CommentData, 'isSpoiler' | 'voteCount'>): {
  kind: 'spoiler' | 'rating' | 'both';
  title: string;
  desc: string;
} {
  const spoiler = !!comment.isSpoiler;
  const lowVotes = comment.voteCount <= -5;
  if (spoiler && lowVotes) {
    return {
      kind: 'both',
      title: 'Спойлер и низкий рейтинг',
      desc: 'Текст скрыт: возможны спойлеры и негативная оценка сообщества.',
    };
  }
  if (lowVotes) {
    return {
      kind: 'rating',
      title: 'Скрыто из‑за рейтинга',
      desc: 'Комментарий получил много дизлайков. Нажмите, чтобы прочитать.',
    };
  }
  return {
    kind: 'spoiler',
    title: 'Возможен спойлер',
    desc: 'Автор отметил комментарий как спойлер. Нажмите, чтобы прочитать.',
  };
}

export interface ProfileCommentPreviewItem {
  id: number;
  message: string;
  timestamp: number;
  voteCount: number;
  isSpoiler: boolean;
  profileLogin: string;
  profileAvatar: string;
  profileBadgeUrl?: string;
  profileBadgeName?: string;
  contextLabel: string;
  targetTitle: string;
  targetPath: string | null;
}

function profileCommentContext(typeRaw: unknown): string {
  const type = String(typeRaw ?? '').toLowerCase();
  if (type === 'collection' || type.includes('collection')) return 'к коллекции';
  if (type === 'article' || type.includes('article')) return 'к статье';
  return 'к релизу';
}

function entityNumericId(raw: Record<string, unknown> | undefined): number {
  if (!raw) return 0;
  const id = Number(raw.id ?? 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function releaseTitleFrom(raw: Record<string, unknown>): string {
  return String(
    raw.title_ru ?? raw.titleRu ?? raw.title_original ?? raw.titleOriginal ?? raw.title ?? '',
  ).trim();
}

function collectionTitleFrom(raw: Record<string, unknown>): string {
  return String(raw.title ?? raw.name ?? '').trim();
}

export function mapProfileCommentPreview(
  raw: Record<string, unknown>,
  profileRoot?: unknown,
): ProfileCommentPreviewItem | null {
  const id = raw.id as number;
  if (!id) return null;

  const profile = normalizeCommentProfile(
    (resolveJacksonEntity(raw.profile, profileRoot) ??
      raw.profile) as Record<string, unknown> | undefined,
    profileRoot,
  );
  const commentType = String(raw.commentType ?? raw.comment_type ?? raw.type ?? '').toLowerCase();

  const release = resolveJacksonEntity(raw.release, profileRoot);
  const collection = resolveJacksonEntity(raw.collection, profileRoot);
  const article = resolveJacksonEntity(raw.article, profileRoot);

  let targetPath: string | null = null;
  let targetTitle = '';

  if (commentType === 'collection' || commentType.includes('collection')) {
    const collectionId = entityNumericId(collection);
    if (collectionId) targetPath = `/collection/${collectionId}`;
    targetTitle = collection ? collectionTitleFrom(collection) : '';
  } else if (commentType === 'article' || commentType.includes('article')) {
    const articleId = entityNumericId(article);
    const channelId = Number(
      (article?.channel as { id?: number } | undefined)?.id
      ?? article?.channel_id
      ?? article?.channelId
      ?? 0,
    );
    if (articleId && channelId) targetPath = `/channel/${channelId}/article/${articleId}`;
    targetTitle = String(article?.title ?? article?.embeddable_title ?? article?.embeddableTitle ?? '').trim();
  } else {
    const releaseId = entityNumericId(release);
    if (releaseId) targetPath = `/release/${releaseId}`;
    targetTitle = release ? releaseTitleFrom(release) : '';
  }

  return {
    id,
    message: String(raw.message ?? ''),
    timestamp: Number(raw.timestamp ?? 0),
    voteCount: Number(raw.vote_count ?? raw.voteCount ?? 0),
    isSpoiler: !!(raw.is_spoiler ?? raw.isSpoiler),
    profileLogin: profile.login,
    profileAvatar: profile.avatar,
    profileBadgeUrl: profile.badgeUrl,
    profileBadgeName: profile.badgeName,
    contextLabel: profileCommentContext(commentType),
    targetTitle: targetTitle || 'Без названия',
    targetPath,
  };
}

export function episodeContextLabel(episode: number | null | undefined): string | null {
  if (episode == null || episode <= 0) return null;
  return `На момент выхода ${episode} серии`;
}

export function repliesLabel(count: number): string {
  if (count <= 0) return '';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `Показать ${count} ответ`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `Показать ${count} ответа`;
  }
  return `Показать ${count} ответов`;
}

export function voteCountClass(count: number): 'neutral' | 'positive' | 'negative' {
  if (count > 0) return 'positive';
  if (count < 0) return 'negative';
  return 'neutral';
}

export function formatVoteCountDisplay(count: number): string {
  if (count === 0) return '0';
  return String(count).replace('-', '–');
}

export function nextVote(current: CommentVoteValue, action: 'up' | 'down'): CommentVoteValue {
  if (action === 'up') return current === 2 ? 0 : 2;
  return current === 1 ? 0 : 1;
}

export function applyVoteDelta(
  comment: CommentData,
  prevVote: CommentVoteValue,
  next: CommentVoteValue,
): CommentData {
  let delta = 0;
  if (prevVote === 2) delta -= 1;
  if (prevVote === 1) delta += 1;
  if (next === 2) delta += 1;
  if (next === 1) delta -= 1;
  return {
    ...comment,
    userVote: next,
    voteCount: comment.voteCount + delta,
  };
}

export function patchCommentInTree(
  items: CommentData[],
  commentId: number,
  patch: Partial<CommentData>,
): CommentData[] {
  return items.map((item) => {
    if (item.id === commentId) return { ...item, ...patch };
    return item;
  });
}

/** Release comment add params — matches Android CommentRepliesFragment / CommentsFragment. */
export function buildReleaseCommentAddBody(
  payload: { message: string; isSpoiler: boolean },
  opts: {
    replyTarget?: CommentData | null;
    threadRootCommentId?: number | null;
  } = {},
): {
  message: string;
  isSpoiler: boolean;
  parentCommentId: number | null;
  replyToProfileId: number | null;
} {
  const { replyTarget = null, threadRootCommentId = null } = opts;

  if (threadRootCommentId != null) {
    return {
      message: payload.message,
      isSpoiler: payload.isSpoiler,
      parentCommentId: threadRootCommentId,
      replyToProfileId: replyTarget?.profile.id ?? null,
    };
  }

  return {
    message: payload.message,
    isSpoiler: payload.isSpoiler,
    parentCommentId: replyTarget?.id ?? null,
    replyToProfileId: replyTarget?.profile.id ?? null,
  };
}
