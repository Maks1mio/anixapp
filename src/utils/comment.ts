import type { CommentData, CommentProfile, CommentVoteValue, CommentSort } from '../types/comment';
import { resolveCdnAssetUrl } from './posterUrl';
import { COMMENT_SORT_OPTIONS } from '../types/comment';

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

export function normalizeCommentProfile(raw: Record<string, unknown> | undefined): CommentProfile {
  if (!raw) {
    return { id: 0, login: 'Пользователь', avatar: '' };
  }
  return {
    id: (raw.id as number) ?? 0,
    login: String(raw.login ?? raw.nickname ?? 'Пользователь'),
    avatar: resolveCdnAssetUrl(String(raw.avatar ?? '')),
    badgeUrl: resolveCdnAssetUrl((raw.badge_url as string) || undefined) || undefined,
    isVerified: !!(raw.is_verified ?? raw.isVerified),
    isSponsor: !!(raw.is_sponsor ?? raw.isSponsor),
  };
}

export function normalizeComment(raw: Record<string, unknown>): CommentData {
  const vote = raw.vote ?? raw.user_vote ?? 0;
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
    profile: normalizeCommentProfile(raw.profile as Record<string, unknown> | undefined),
  };
}

export function isCommentContentHidden(comment: CommentData, revealed: boolean): boolean {
  if (revealed || comment.isDeleted) return false;
  if (comment.isSpoiler) return true;
  if (comment.voteCount <= -5) return true;
  return false;
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
