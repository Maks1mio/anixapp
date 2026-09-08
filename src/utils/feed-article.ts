import { resolveCdnAssetUrl } from './posterUrl';
import type { FeedArticle, FeedArticleBlock, FeedArticlePayload } from '../types/feed';
import {
  articlePlainText,
  formatInlineField,
  type ArticleFormatBlock,
} from './article-block-format';

export type { ArticleFormatBlock } from './article-block-format';
export {
  articlePlainText,
  decodeHtmlEntities,
  formatInlineField,
  sanitizeArticleHtml,
} from './article-block-format';

/** Как Android Preview: после первой картинки/эмбеда превью обрывается. */
const PREVIEW_BOTTOM_BLOCKS = new Set(['media', 'image', 'gallery', 'embed']);

function blockKind(block: FeedArticleBlock): string {
  return String(block.type ?? block.name ?? '').toLowerCase().trim();
}

export function resolveArticlePayload(article: FeedArticle): {
  blocks: FeedArticleBlock[];
  blockCount: number;
} {
  let raw: unknown = article.payload;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return { blocks: [], blockCount: 0 };
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      return { blocks: [], blockCount: 0 };
    }
  }
  const root = raw && typeof raw === 'object' ? (raw as FeedArticlePayload) : null;
  const blocks = Array.isArray(root?.blocks) ? root.blocks : [];
  const declared = Number(root?.block_count ?? (root as { blockCount?: number } | null)?.blockCount);
  const blockCount = Number.isFinite(declared) && declared > 0 ? declared : blocks.length;
  return { blocks, blockCount };
}

function articleBlocks(article: FeedArticle): FeedArticleBlock[] {
  return resolveArticlePayload(article).blocks;
}

function blockText(block: FeedArticleBlock): string {
  const data = block.data ?? {};
  const type = blockKind(block);
  if (type === 'paragraph' || type === 'text' || type === 'header' || type === 'quote') {
    const text = typeof data.text === 'string' ? data.text : '';
    return articlePlainText(text);
  }
  if (type === 'list' && Array.isArray(data.items)) {
    return data.items
      .map((item) =>
        articlePlainText(typeof item === 'string' ? item : String((item as { content?: string })?.content ?? '')),
      )
      .filter(Boolean)
      .join(' · ');
  }
  return '';
}

/** Первый header-блок как заголовок карточки (DTF-стиль). */
export function articleHeadline(article: FeedArticle): string {
  const blocks = articleBlocks(article);
  for (const block of blocks) {
    if (blockKind(block) !== 'header') continue;
    const text = blockText(block);
    if (text) return text;
  }
  return '';
}

export type ArticleVoteValue = 0 | 1 | 2;

/** Как в Anixart: 1 — минус, 2 — плюс, 0 — нет. */
export const ARTICLE_VOTE_MINUS = 1 as const;
export const ARTICLE_VOTE_PLUS = 2 as const;

export function normalizeArticleVote(raw: unknown): ArticleVoteValue {
  const n = Number(raw ?? 0);
  if (n === ARTICLE_VOTE_MINUS || n === ARTICLE_VOTE_PLUS) return n;
  return 0;
}

export function nextArticleVoteCount(
  count: number,
  prev: ArticleVoteValue,
  next: ArticleVoteValue,
): number {
  let n = Number(count) || 0;
  if (prev === ARTICLE_VOTE_PLUS) n -= 1;
  else if (prev === ARTICLE_VOTE_MINUS) n += 1;
  if (next === ARTICLE_VOTE_PLUS) n += 1;
  else if (next === ARTICLE_VOTE_MINUS) n -= 1;
  return n;
}

export function applyArticleVote(
  article: FeedArticle,
  nextVote: ArticleVoteValue,
): FeedArticle {
  const prev = normalizeArticleVote(article.vote);
  return {
    ...article,
    vote: nextVote,
    vote_count: nextArticleVoteCount(Number(article.vote_count ?? 0), prev, nextVote),
  };
}

export function formatCompactCount(n: number | undefined | null): string {
  const v = Math.max(0, Number(n) || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}K`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(v);
}

function ruPlural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.floor(n)) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
}

export function formatSubscriberLabel(n: number | undefined | null): string {
  const v = Math.max(0, Number(n) || 0);
  return `${formatCompactCount(v)} ${ruSubscribersWord(v)}`;
}

export function ruSubscribersWord(n: number | undefined | null): string {
  return ruPlural(Math.max(0, Number(n) || 0), 'подписчик', 'подписчика', 'подписчиков');
}

/** Счётчик подписчиков канала: API отдаёт и snake_case, и camelCase. */
export function channelSubscriberCount(channel: object | null | undefined): number {
  if (!channel || typeof channel !== 'object') return 0;
  const c = channel as Record<string, unknown>;
  let fallback = 0;
  for (const key of ['subscriber_count', 'subscriberCount', 'subscribers_count', 'subscribersCount'] as const) {
    const raw = c[key];
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    if (n > 0) return n;
    fallback = 0;
  }
  return fallback;
}

const TAG_RE = /#([\p{L}\p{N}_]{2,40})/gu;

function pushUniqueTag(out: string[], seen: Set<string>, raw: string): void {
  const tag = raw.replace(/^#/, '').trim();
  if (!tag) return;
  const key = tag.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push(tag);
}

/** Хэштеги записи: поле tags, блок tags/hashtag или #теги в тексте. */
export function articleTags(article: FeedArticle, limit = 12): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  if (Array.isArray(article.tags)) {
    for (const item of article.tags) {
      if (typeof item === 'string') pushUniqueTag(out, seen, item);
      else if (item && typeof item === 'object') {
        pushUniqueTag(out, seen, String(item.name ?? item.title ?? item.tag ?? ''));
      }
    }
  }

  for (const block of articleBlocks(article)) {
    const kind = blockKind(block);
    if (kind !== 'tags' && kind !== 'hashtag' && kind !== 'hashtags') continue;
    const data = block.data ?? {};
    const items = data.items ?? data.tags ?? data.text;
    if (Array.isArray(items)) {
      for (const it of items) {
        if (typeof it === 'string') pushUniqueTag(out, seen, it);
        else if (it && typeof it === 'object') {
          pushUniqueTag(out, seen, String((it as { name?: string }).name ?? ''));
        }
      }
    } else if (typeof items === 'string') {
      for (const match of items.matchAll(TAG_RE)) pushUniqueTag(out, seen, match[1]);
    }
  }

  if (out.length === 0) {
    const blob = `${articleHeadline(article)} ${articlePreviewText(article, 4000)}`;
    for (const match of blob.matchAll(TAG_RE)) {
      pushUniqueTag(out, seen, match[1]);
      if (out.length >= limit) break;
    }
  }

  return out.slice(0, limit);
}

/** Короткий текст превью из блоков Editor.js / Anixart (без дубля headline). */
export function articlePreviewText(article: FeedArticle, maxLen = 220): string {
  const blocks = articleBlocks(article);
  const headline = articleHeadline(article);
  const parts: string[] = [];
  let skippedHeadline = !headline;
  for (const block of blocks) {
    const kind = blockKind(block);
    const t = blockText(block);
    if (!t) continue;
    // Пропускаем первый header, если он уже показан как заголовок.
    if (!skippedHeadline && kind === 'header' && t === headline) {
      skippedHeadline = true;
      continue;
    }
    parts.push(t);
    if (parts.join(' ').length >= maxLen) break;
  }
  const full = parts.join(' ').trim();
  if (!full) return '';
  if (full.length <= maxLen) return full;
  return `${full.slice(0, maxLen - 1).trimEnd()}…`;
}

function isMediaBlockKind(kind: string): boolean {
  return PREVIEW_BOTTOM_BLOCKS.has(kind);
}

function collectBlockTexts(
  blocks: FeedArticleBlock[],
  headline: string,
  stopAtMedia: boolean,
): string {
  const parts: string[] = [];
  let skippedHeadline = !headline;
  for (const block of blocks) {
    const kind = blockKind(block);
    if (stopAtMedia && isMediaBlockKind(kind)) break;
    const t = blockText(block);
    if (!t) continue;
    if (!skippedHeadline && kind === 'header' && t === headline) {
      skippedHeadline = true;
      continue;
    }
    parts.push(t);
  }
  return parts.join('\n\n').trim();
}

/**
 * Текст поста для карточки ленты: целиком (до/после медиа).
 * canExpand — только если API отдал урезанный payload.
 */
export function articleFeedPreviewParts(article: FeedArticle): {
  lead: string;
  more: string;
  canExpand: boolean;
} {
  const { before, after, canExpand } = articleFeedContentParts(article);
  const lead = before
    .map((b) => {
      if (b.kind === 'list') return b.itemsPlain.join('\n');
      return b.plain;
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const more = after
    .map((b) => {
      if (b.kind === 'list') return b.itemsPlain.join('\n');
      return b.plain;
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
  return { lead, more, canExpand };
}

export type FeedTextBlock = ArticleFormatBlock;

/** Текстовые/цитатные блоки до и после первого медиа. */
export function articleFeedContentParts(article: FeedArticle): {
  before: FeedTextBlock[];
  after: FeedTextBlock[];
  canExpand: boolean;
} {
  const { blocks, blockCount } = resolveArticlePayload(article);
  const before: FeedTextBlock[] = [];
  const after: FeedTextBlock[] = [];
  let seenMedia = false;

  for (const block of blocks) {
    const type = blockKind(block);
    if (isMediaBlockKind(type)) {
      seenMedia = true;
      continue;
    }
    const mapped = mapPayloadBlockToFeedText(block);
    if (!mapped) continue;
    (seenMedia ? after : before).push(mapped);
  }

  const apiTruncated = blocks.some((block) => {
    const data = block.data ?? {};
    const text = typeof data.text === 'string' ? data.text : '';
    const declared = Number(data.text_length ?? data.textLength);
    return Number.isFinite(declared) && declared > text.length + 2;
  });

  return {
    before,
    after,
    canExpand: blockCount > blocks.length || apiTruncated,
  };
}

function mapPayloadBlockToFeedText(block: FeedArticleBlock): FeedTextBlock | null {
  const type = blockKind(block);
  const data = (block.data ?? {}) as Record<string, unknown>;

  if (type === 'paragraph' || type === 'text') {
    const { html, plain } = formatInlineField(typeof data.text === 'string' ? data.text : '');
    return plain || html ? { kind: 'text', html, plain } : null;
  }
  if (type === 'header') {
    const { html, plain } = formatInlineField(typeof data.text === 'string' ? data.text : '');
    const level = typeof data.level === 'number' ? data.level : 2;
    return plain || html ? { kind: 'header', html, plain, level } : null;
  }
  if (type === 'quote') {
    const body = formatInlineField(typeof data.text === 'string' ? data.text : '');
    const caption = formatInlineField(typeof data.caption === 'string' ? data.caption : '');
    if (!body.plain && !body.html) return null;
    return {
      kind: 'quote',
      html: body.html,
      plain: body.plain,
      captionHtml: caption.html || undefined,
      captionPlain: caption.plain || undefined,
    };
  }
  if (type === 'list' && Array.isArray(data.items)) {
    const items = data.items
      .map((item) =>
        formatInlineField(
          typeof item === 'string' ? item : String((item as { content?: string })?.content ?? ''),
        ),
      )
      .filter((x) => x.plain || x.html);
    if (!items.length) return null;
    return {
      kind: 'list',
      itemsHtml: items.map((x) => x.html),
      itemsPlain: items.map((x) => x.plain),
    };
  }
  return null;
}

function isVideoUrl(raw: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(raw);
}

function isGifUrl(raw: string): boolean {
  return /\.gif(\?|$)/i.test(raw);
}

/** Полный прокси URL без ресайза — article media почти всегда webp, nativeImage их ломает. */
function normalizeMediaUrl(raw: string): string {
  return resolveCdnAssetUrl(raw) || '';
}

function collectUrlsFromMediaData(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (u: unknown) => {
    if (typeof u === 'string' && u.trim()) out.push(u.trim());
  };

  const items = data.items;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      push(row.url);
      const file = row.file as { url?: string } | undefined;
      push(file?.url);
    }
  }

  const file = data.file as { url?: string } | undefined;
  push(file?.url);
  push(data.url);
  push(data.image);
  push(data.cover);

  return out;
}

export type FeedMediaItem = { url: string; kind: 'image' | 'video' | 'gif' };

function mediaKind(raw: string, url: string): FeedMediaItem['kind'] {
  if (isVideoUrl(raw) || isVideoUrl(url)) return 'video';
  if (isGifUrl(raw) || isGifUrl(url)) return 'gif';
  return 'image';
}

/** Все картинки/видео из блоков статьи (Anixart type: media | image | gallery | embed). */
export function articleMediaItems(article: FeedArticle, limit = 6): FeedMediaItem[] {
  const blocks = articleBlocks(article);
  const out: FeedMediaItem[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const url = normalizeMediaUrl(raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, kind: mediaKind(raw, url) });
  };

  for (const block of blocks) {
    const type = blockKind(block);
    const data = (block.data ?? {}) as Record<string, unknown>;

    if (type === 'media' || type === 'image' || type === 'gallery') {
      for (const raw of collectUrlsFromMediaData(data)) {
        push(raw);
        if (out.length >= limit) return out;
      }
    }

    if (type === 'embed') {
      const image = typeof data.image === 'string' ? data.image : '';
      if (image) {
        push(image);
        if (out.length >= limit) return out;
      }
    }
  }

  return out;
}

/** URL медиа для превью карточки. */
export function articleMediaUrls(article: FeedArticle, limit = 6): string[] {
  return articleMediaItems(article, limit).map((m) => m.url);
}

/** Первая картинка из блоков статьи. */
export function articlePreviewImage(article: FeedArticle): string {
  return articleMediaUrls(article, 1)[0] ?? '';
}

export function formatFeedRelativeTime(ts: number | undefined | null): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return '';
  const ms = ts > 1e12 ? ts : ts * 1000;
  const diff = Date.now() - ms;
  if (diff < 0) return 'только что';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'только что';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ч назад`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} дн назад`;
  try {
    return new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export function channelAvatarUrl(avatar: string | undefined | null): string {
  if (!avatar) return '';
  return resolveCdnAssetUrl(avatar) || avatar;
}

export function channelCoverUrl(cover: string | undefined | null): string {
  if (!cover) return '';
  return resolveCdnAssetUrl(cover) || cover;
}

export type RenderBlock =
  | ArticleFormatBlock
  | { kind: 'media'; items: FeedMediaItem[] }
  | { kind: 'embed'; title?: string; description?: string; image?: string; url?: string; siteName?: string };

/** Блоки статьи для детального просмотра. */
export function articleRenderBlocks(article: FeedArticle): RenderBlock[] {
  const blocks = articleBlocks(article);
  const out: RenderBlock[] = [];

  for (const block of blocks) {
    const type = blockKind(block);
    const data = (block.data ?? {}) as Record<string, unknown>;

    if (
      type === 'paragraph'
      || type === 'text'
      || type === 'header'
      || type === 'quote'
      || type === 'list'
    ) {
      const mapped = mapPayloadBlockToFeedText(block);
      if (mapped) out.push(mapped);
      continue;
    }
    if (type === 'media' || type === 'image' || type === 'gallery') {
      const items = collectUrlsFromMediaData(data)
        .map((raw) => {
          const url = normalizeMediaUrl(raw);
          if (!url) return null;
          return {
            url,
            kind: mediaKind(raw, url),
          };
        })
        .filter((x): x is FeedMediaItem => x != null);
      if (items.length) out.push({ kind: 'media', items });
      continue;
    }
    if (type === 'embed') {
      out.push({
        kind: 'embed',
        title: typeof data.title === 'string' ? data.title : undefined,
        description: typeof data.description === 'string' ? data.description : undefined,
        image: typeof data.image === 'string' ? normalizeMediaUrl(data.image) : undefined,
        url: typeof data.url === 'string' ? data.url : undefined,
        siteName: typeof data.site_name === 'string'
          ? data.site_name
          : (typeof data.siteName === 'string' ? data.siteName : undefined),
      });
    }
  }

  return out;
}
