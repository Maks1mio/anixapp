import { resolveCdnAssetUrl } from './posterUrl';
import type { FeedArticle, FeedArticleBlock } from '../types/feed';

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      try {
        return Number.isFinite(code) ? String.fromCodePoint(code) : _;
      } catch {
        return _;
      }
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      try {
        return Number.isFinite(code) ? String.fromCodePoint(code) : _;
      } catch {
        return _;
      }
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function stripHtml(raw: string): string {
  return decodeHtmlEntities(raw.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function blockKind(block: FeedArticleBlock): string {
  return String(block.type ?? block.name ?? '').toLowerCase().trim();
}

function blockText(block: FeedArticleBlock): string {
  const data = block.data ?? {};
  const type = blockKind(block);
  if (type === 'paragraph' || type === 'text' || type === 'header' || type === 'quote') {
    const text = typeof data.text === 'string' ? data.text : '';
    return stripHtml(text);
  }
  if (type === 'list' && Array.isArray(data.items)) {
    return data.items
      .map((item) => stripHtml(typeof item === 'string' ? item : String((item as { content?: string })?.content ?? '')))
      .filter(Boolean)
      .join(' · ');
  }
  return '';
}

/** Первый header-блок как заголовок карточки (DTF-стиль). */
export function articleHeadline(article: FeedArticle): string {
  const blocks = article.payload?.blocks ?? [];
  for (const block of blocks) {
    if (blockKind(block) !== 'header') continue;
    const text = blockText(block);
    if (text) return text;
  }
  return '';
}

/** Короткий текст превью из блоков Editor.js / Anixart (без дубля headline). */
export function articlePreviewText(article: FeedArticle, maxLen = 220): string {
  const blocks = article.payload?.blocks ?? [];
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
  const blocks = article.payload?.blocks ?? [];
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

export type RenderBlock =
  | { kind: 'text'; text: string; level?: number }
  | { kind: 'quote'; text: string; caption?: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'media'; items: FeedMediaItem[] }
  | { kind: 'embed'; title?: string; description?: string; image?: string; url?: string; siteName?: string };

/** Блоки статьи для детального просмотра. */
export function articleRenderBlocks(article: FeedArticle): RenderBlock[] {
  const blocks = article.payload?.blocks ?? [];
  const out: RenderBlock[] = [];

  for (const block of blocks) {
    const type = blockKind(block);
    const data = (block.data ?? {}) as Record<string, unknown>;

    if (type === 'paragraph' || type === 'text') {
      const text = stripHtml(typeof data.text === 'string' ? data.text : '');
      if (text) out.push({ kind: 'text', text });
      continue;
    }
    if (type === 'header') {
      const text = stripHtml(typeof data.text === 'string' ? data.text : '');
      const level = typeof data.level === 'number' ? data.level : 2;
      if (text) out.push({ kind: 'text', text, level });
      continue;
    }
    if (type === 'quote') {
      const text = stripHtml(typeof data.text === 'string' ? data.text : '');
      const caption = stripHtml(typeof data.caption === 'string' ? data.caption : '');
      if (text) out.push({ kind: 'quote', text, caption: caption || undefined });
      continue;
    }
    if (type === 'list' && Array.isArray(data.items)) {
      const items = data.items
        .map((item) => stripHtml(typeof item === 'string' ? item : String((item as { content?: string })?.content ?? '')))
        .filter(Boolean);
      if (items.length) out.push({ kind: 'list', items });
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
