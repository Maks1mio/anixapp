import type { UiV2FeedPostLastComment } from '../components/uikit-v2/UiV2FeedPost.svelte';
import { channelAvatarUrl } from './feed-article';
import { resolveJacksonRefs } from './jackson-refs';

const cache = new Map<number, UiV2FeedPostLastComment | null>();
const inflight = new Map<number, Promise<UiV2FeedPostLastComment | null>>();

function stripHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function mapArticleCommentToTop(
  raw: unknown,
): UiV2FeedPostLastComment | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (rec.is_deleted === true || rec.isDeleted === true) return null;
  const profile = (rec.profile ?? rec.author) as
    | { login?: string; avatar?: string | null }
    | undefined;
  const text = stripHtml(String(rec.message ?? rec.text ?? rec.content ?? ''));
  if (!text) return null;
  const spoiler = rec.is_spoiler === true || rec.isSpoiler === true;
  return {
    author: profile?.login?.trim() || 'Пользователь',
    avatar: channelAvatarUrl(profile?.avatar ?? null) || undefined,
    text: spoiler ? 'Спойлер' : text,
    isSpoiler: spoiler,
    voteCount: Number(rec.vote_count ?? rec.likes_count ?? rec.voteCount ?? 0) || undefined,
  };
}

export async function loadArticleTopComment(
  articleId: number,
): Promise<UiV2FeedPostLastComment | null> {
  if (!(articleId > 0)) return null;
  if (cache.has(articleId)) return cache.get(articleId) ?? null;
  const pending = inflight.get(articleId);
  if (pending) return pending;

  const task = (async () => {
    try {
      const res = await window.anixApi?.article?.commentsPopular?.(articleId);
      const resolved =
        res && typeof res === 'object'
          ? (resolveJacksonRefs(res as Record<string, unknown>) as Record<string, unknown>)
          : {};
      const list = Array.isArray(resolved.content)
        ? resolved.content
        : Array.isArray(resolved.comments)
          ? resolved.comments
          : [];
      const mapped = list
        .map(mapArticleCommentToTop)
        .find((item): item is UiV2FeedPostLastComment => item != null);
      cache.set(articleId, mapped ?? null);
      return mapped ?? null;
    } catch {
      cache.set(articleId, null);
      return null;
    }
  })();

  inflight.set(articleId, task);
  try {
    return await task;
  } finally {
    inflight.delete(articleId);
  }
}

export function ruCommentsLabel(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const abs = n % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return `${n} комментариев`;
  if (d === 1) return `${n} комментарий`;
  if (d >= 2 && d <= 4) return `${n} комментария`;
  return `${n} комментариев`;
}
