import type { FeedArticle, FeedChannel, FeedProfile } from '../types/feed';

export type FeedComposerOpenChannel = {
  id: number;
  title: string;
  avatar?: string | null;
  is_blog?: boolean;
};

export type FeedComposerOpenPayload = {
  channelId?: number | null;
  draftId?: string | null;
  repostArticle?: FeedArticle | null;
  /** Редактирование существующей записи (взаимоисключимо с suggestion). */
  editArticle?: FeedArticle | null;
  channels?: FeedComposerOpenChannel[];
  /** Предложение записи в канал (не прямая публикация). */
  isSuggestion?: boolean;
};

function plainClone<T>(value: T): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return null;
  }
}

function sanitizeChannel(raw: unknown): FeedChannel | null {
  if (!raw || typeof raw !== 'object') return null;
  const ch = raw as Record<string, unknown>;
  const id = Number(ch.id ?? 0);
  if (!(id > 0)) return null;
  return {
    id,
    title: typeof ch.title === 'string' ? ch.title : `Канал #${id}`,
    avatar: typeof ch.avatar === 'string' ? ch.avatar : undefined,
    cover: typeof ch.cover === 'string' ? ch.cover : undefined,
    is_blog: !!ch.is_blog,
    is_verified: !!ch.is_verified,
    is_subscribed: !!ch.is_subscribed,
    is_creator: !!ch.is_creator,
    is_administrator_or_higher: !!ch.is_administrator_or_higher,
    is_article_suggestion_enabled: !!ch.is_article_suggestion_enabled,
    blog_profile_id: Number(ch.blog_profile_id ?? 0) || undefined,
  };
}

function sanitizeProfile(raw: unknown): FeedProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const id = Number(p.id ?? 0);
  return {
    id: id > 0 ? id : undefined,
    login: typeof p.login === 'string' ? p.login : undefined,
    avatar: typeof p.avatar === 'string' ? p.avatar : null,
  };
}

/** Плоский JSON-safe снимок записи для IPC (без Proxy/циклов). */
export function sanitizeComposerArticle(
  raw: FeedArticle | null | undefined,
  depth = 0,
): FeedArticle | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = Number(raw.id ?? 0);
  if (!(id > 0)) return null;

  const payload = plainClone(raw.payload) ?? undefined;
  const channel = sanitizeChannel(raw.channel) ?? undefined;
  const author = sanitizeProfile(raw.author);
  const nested =
    depth < 1 && raw.repost_article
      ? sanitizeComposerArticle(raw.repost_article, depth + 1)
      : null;

  return {
    id,
    channel,
    author,
    payload,
    creation_date: Number(raw.creation_date ?? 0) || undefined,
    is_signed: !!raw.is_signed,
    contains_repost_article: !!raw.contains_repost_article || !!nested,
    repost_article: nested,
    comment_count: Number(raw.comment_count ?? 0) || 0,
    vote_count: Number(raw.vote_count ?? 0) || 0,
    repost_count: Number(raw.repost_count ?? 0) || 0,
  };
}

function sanitizeChannels(
  channels: FeedComposerOpenChannel[] | undefined,
): FeedComposerOpenChannel[] {
  if (!Array.isArray(channels)) return [];
  const out: FeedComposerOpenChannel[] = [];
  for (const raw of channels) {
    const id = Number(raw?.id ?? 0);
    if (!(id > 0)) continue;
    out.push({
      id,
      title: typeof raw.title === 'string' ? raw.title : `Канал #${id}`,
      avatar: typeof raw.avatar === 'string' ? raw.avatar : null,
      is_blog: !!raw.is_blog,
    });
  }
  return out;
}

export async function openFeedComposerWindow(
  payload: FeedComposerOpenPayload = {},
): Promise<boolean> {
  const open = window.electron?.openComposerWindow;
  if (!open) return false;

  const safe = {
    channelId: payload.channelId != null && Number(payload.channelId) > 0
      ? Number(payload.channelId)
      : null,
    draftId: typeof payload.draftId === 'string' && payload.draftId
      ? payload.draftId
      : null,
    repostArticle: sanitizeComposerArticle(payload.repostArticle ?? null),
    editArticle: sanitizeComposerArticle(payload.editArticle ?? null),
    channels: sanitizeChannels(payload.channels),
    isSuggestion: !!payload.isSuggestion,
  };

  try {
    await open(safe);
    return true;
  } catch (err) {
    console.error('[composer] openComposerWindow failed', err);
    return false;
  }
}

/** Подтянуть полный payload записи перед открытием редактора. */
export async function resolveFeedArticleForEdit(
  article: FeedArticle,
): Promise<FeedArticle> {
  const id = Number(article.id);
  if (!(id > 0)) return article;
  try {
    const res = await window.anixApi?.article?.info?.(id);
    const full = (res?.article ?? null) as FeedArticle | null;
    if (!full) return article;
    const merged: FeedArticle = {
      ...article,
      ...full,
      id: Number(full.id ?? article.id),
      payload: full.payload ?? article.payload,
      channel: full.channel ?? article.channel,
      repost_article: full.repost_article ?? article.repost_article,
      is_signed: full.is_signed ?? article.is_signed,
    };
    return sanitizeComposerArticle(merged) ?? merged;
  } catch {
    return sanitizeComposerArticle(article) ?? article;
  }
}
