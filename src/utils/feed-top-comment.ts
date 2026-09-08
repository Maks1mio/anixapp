import type { UiV2FeedPostLastComment } from '../components/uikit-v2/UiV2FeedPost.svelte';
import { channelAvatarUrl } from './feed-article';
import { articlePlainText } from './article-block-format';
import { resolveJacksonRefs } from './jackson-refs';

const cache = new Map<number, UiV2FeedPostLastComment | null>();
const inflight = new Map<number, Promise<UiV2FeedPostLastComment | null>>();

export function mapArticleCommentToTop(
  raw: unknown,
): UiV2FeedPostLastComment | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (rec.is_deleted === true || rec.isDeleted === true) return null;
  const profile = (rec.profile ?? rec.author) as
    | { login?: string; avatar?: string | null }
    | undefined;
  const text = articlePlainText(
    String(rec.message ?? rec.text ?? rec.content ?? '').replace(/<br\s*\/?>/gi, '\n'),
  );
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

/** Короткий счётчик как в приложении: «17 тыс.». */
export function formatCommentsCountShort(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    const s = k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, '');
    return `${s} тыс.`;
  }
  const m = n / 1_000_000;
  const s = m >= 10 ? String(Math.round(m)) : m.toFixed(1).replace(/\.0$/, '');
  return `${s} млн`;
}
