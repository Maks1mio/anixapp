/** Сборка payload для POST article/create — как ArticleBuilder в AnixartJS. */

export const ARTICLE_EDITOR_VERSION = '2.29.0-rc.1';
export const ARTICLE_MAX_BLOCKS = 25;
export const ARTICLE_MAX_MEDIA_ITEMS = 50;

export function generateBlockId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_';
  let id = '';
  for (let i = 0; i < 10; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export type FeedArticlePayloadBlock = {
  id: string;
  type: string;
  name: string;
  data: Record<string, unknown>;
};

export type FeedArticleCreateBody = {
  is_signed: boolean;
  repost_article_id: number | null;
  payload: {
    time: number;
    version: string;
    blocks: FeedArticlePayloadBlock[];
    block_count: number;
  };
};

export type ArticleEmbedType = 'youtube' | 'vk' | 'link';

export type ArticleEditorMediaItem = {
  id: string;
  url: string;
  hash: string;
  width: number;
  height: number;
  localPreview?: string;
  /** 0–100 пока файл уходит на S3; после загрузки поля нет. */
  uploadProgress?: number;
};

export type ArticleEditorEmbedData = {
  url: string;
  hash: string;
  embed: string | null;
  image: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  service: string;
  site_name: string | null;
  description: string | null;
};

export type ArticleEditorBlock =
  | { id: string; type: 'paragraph'; html: string }
  | { id: string; type: 'header'; html: string; level: 3 }
  | { id: string; type: 'quote'; html: string; caption: string; alignment: 'left' }
  | { id: string; type: 'list'; style: 'ordered' | 'unordered'; items: string[] }
  | { id: string; type: 'delimiter' }
  | { id: string; type: 'media'; items: ArticleEditorMediaItem[] }
  | { id: string; type: 'embed'; data: ArticleEditorEmbedData };

const EDITOR_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'a']);

function escapeText(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(raw: string): string {
  return escapeText(raw).replace(/"/g, '&quot;');
}

function sanitizeHref(href: string): string | null {
  const value = href.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return null;
}

/** HTML для payload Editor.js: только inline-теги, без автолинков. */
export function sanitizeEditorHtml(raw: string): string {
  const decoded = String(raw ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ');
  if (!decoded.trim()) return '';
  if (!/<[a-z/]/i.test(decoded)) return escapeText(decoded).replace(/\n/g, '<br>');

  let out = '';
  const tokenRe = /<\/?([a-zA-Z0-9]+)(\s[^>]*)?>|[^<]+/g;
  const openStack: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(decoded)) !== null) {
    const token = match[0];
    if (!token.startsWith('<')) {
      out += escapeText(token);
      continue;
    }
    const tag = String(match[1] ?? '').toLowerCase();
    const closing = token.startsWith('</');
    if (!EDITOR_TAGS.has(tag)) continue;
    if (tag === 'br') {
      out += '<br>';
      continue;
    }
    if (closing) {
      const idx = openStack.lastIndexOf(tag);
      if (idx < 0) continue;
      while (openStack.length > idx) {
        const t = openStack.pop();
        if (t) out += `</${t}>`;
      }
      continue;
    }
    if (tag === 'a') {
      const hrefMatch = token.match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const hrefRaw = hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? '';
      const href = sanitizeHref(hrefRaw);
      if (!href) continue;
      out += `<a href="${escapeAttr(href)}">`;
      openStack.push('a');
      continue;
    }
    const mapped = tag === 'strong' ? 'b' : tag === 'em' ? 'i' : tag;
    out += `<${mapped}>`;
    openStack.push(mapped);
  }
  while (openStack.length) {
    const t = openStack.pop();
    if (t) out += `</${t}>`;
  }
  return out.replace(/(<br>\s*)+$/g, '').trim();
}

export function editorPlainText(html: string): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function emptyParagraph(): ArticleEditorBlock {
  return { id: generateBlockId(), type: 'paragraph', html: '' };
}

export function cloneEditorBlocks(blocks: ArticleEditorBlock[]): ArticleEditorBlock[] {
  return JSON.parse(JSON.stringify(blocks)) as ArticleEditorBlock[];
}

/** Черновик без data URL и без файлов, которые ещё грузятся на S3. */
export function editorBlocksForDraft(blocks: ArticleEditorBlock[]): ArticleEditorBlock[] {
  return cloneEditorBlocks(blocks).map((block) => {
    if (block.type !== 'media') return block;
    return {
      ...block,
      items: block.items
        .filter((item) => item.url)
        .map((item) => ({
          id: item.id,
          url: item.url,
          hash: item.hash,
          width: item.width,
          height: item.height,
        })),
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function unwrapPayloadBlocks(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const root = asRecord(raw);
  if (!root) return [];
  const nested = asRecord(root.payload);
  if (nested && Array.isArray(nested.blocks)) return nested.blocks;
  if (Array.isArray(root.blocks)) return root.blocks;
  return [];
}

function fromPayloadBlock(raw: unknown): ArticleEditorBlock | null {
  const item = asRecord(raw);
  if (!item) return null;
  const type = asString(item.type || item.name).trim();
  const id = asString(item.id).trim() || generateBlockId();
  const data = asRecord(item.data) ?? {};
  switch (type) {
    case 'paragraph':
      return { id, type: 'paragraph', html: sanitizeEditorHtml(asString(data.text)) };
    case 'header':
      return { id, type: 'header', html: sanitizeEditorHtml(asString(data.text)), level: 3 };
    case 'quote':
      return {
        id,
        type: 'quote',
        html: sanitizeEditorHtml(asString(data.text)),
        caption: sanitizeEditorHtml(asString(data.caption)),
        alignment: 'left',
      };
    case 'list': {
      const items = Array.isArray(data.items)
        ? data.items.map((entry) => sanitizeEditorHtml(asString(entry)))
        : [''];
      return {
        id,
        type: 'list',
        style: asString(data.style) === 'ordered' ? 'ordered' : 'unordered',
        items: items.length ? items : [''],
      };
    }
    case 'delimiter':
      return { id, type: 'delimiter' };
    case 'media': {
      const items = Array.isArray(data.items)
        ? data.items.flatMap((entry) => {
            const media = asRecord(entry);
            if (!media) return [];
            const url = asString(media.url).trim();
            if (!url) return [];
            return [{
              id: asString(media.id).trim() || generateBlockId(),
              url,
              hash: asString(media.hash),
              width: asNumber(media.width),
              height: asNumber(media.height),
            }];
          })
        : [];
      return { id, type: 'media', items };
    }
    case 'embed': {
      const url = asString(data.url).trim();
      if (!url) return null;
      return {
        id,
        type: 'embed',
        data: {
          url,
          hash: asString(data.hash),
          embed: asString(data.embed) || null,
          image: asString(data.image) || null,
          title: asString(data.title) || null,
          width: data.width == null ? null : asNumber(data.width),
          height: data.height == null ? null : asNumber(data.height),
          service: asString(data.service) || detectEmbedType(url),
          site_name: asString(data.site_name) || null,
          description: asString(data.description) || null,
        },
      };
    }
    default:
      return null;
  }
}

export function editorBlocksFromPayload(raw: unknown): ArticleEditorBlock[] {
  const out: ArticleEditorBlock[] = [];
  for (const item of unwrapPayloadBlocks(raw).slice(0, ARTICLE_MAX_BLOCKS)) {
    const block = fromPayloadBlock(item);
    if (block) out.push(block);
  }
  return out.length ? out : [emptyParagraph()];
}

export function stringifyEditorPayload(blocks: ArticleEditorBlock[]): string {
  return JSON.stringify(buildArticlePayload(blocks).payload, null, 2);
}

export function parseEditorPayloadJson(text: string): ArticleEditorBlock[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Некорректный JSON');
  }
  if (parsed == null || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
    throw new Error('Ожидается JSON объекта записи или массива блоков');
  }
  return editorBlocksFromPayload(parsed);
}

export function isEditorBlockEmpty(block: ArticleEditorBlock): boolean {
  if (block.type === 'delimiter') return false;
  if (block.type === 'media') return block.items.length === 0;
  if (block.type === 'embed') return !block.data.url;
  if (block.type === 'list') return block.items.every((item) => !editorPlainText(item));
  if (block.type === 'quote') {
    return !editorPlainText(block.html) && !editorPlainText(block.caption);
  }
  return !editorPlainText(block.html);
}

export function editorHasContent(blocks: ArticleEditorBlock[]): boolean {
  return blocks.some((block) => !isEditorBlockEmpty(block) || block.type === 'delimiter');
}

export function detectEmbedType(url: string): ArticleEmbedType {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) {
      return 'youtube';
    }
    if (host === 'vk.com' || host === 'vk.ru' || host.endsWith('.vk.com')) {
      return 'vk';
    }
  } catch {
    /* ignore */
  }
  return 'link';
}

export function looksLikeUrl(text: string): boolean {
  const value = text.trim();
  return /^https?:\/\/\S+$/i.test(value);
}

function toPayloadBlock(block: ArticleEditorBlock): FeedArticlePayloadBlock | null {
  switch (block.type) {
    case 'paragraph': {
      const text = sanitizeEditorHtml(block.html);
      if (!editorPlainText(text) && !/<br/i.test(text)) return null;
      return {
        id: block.id,
        type: 'paragraph',
        name: 'paragraph',
        data: { text, text_length: text.length },
      };
    }
    case 'header': {
      const text = sanitizeEditorHtml(block.html);
      if (!editorPlainText(text)) return null;
      return {
        id: block.id,
        type: 'header',
        name: 'header',
        data: { text, text_length: text.length, level: 3 },
      };
    }
    case 'quote': {
      const text = sanitizeEditorHtml(block.html);
      const caption = sanitizeEditorHtml(block.caption);
      if (!editorPlainText(text)) return null;
      return {
        id: block.id,
        type: 'quote',
        name: 'quote',
        data: {
          text,
          caption,
          alignment: 'left',
          text_length: text.length,
          caption_length: caption.length,
        },
      };
    }
    case 'list': {
      const items = block.items
        .map((item) => sanitizeEditorHtml(item))
        .filter((item) => editorPlainText(item));
      if (!items.length) return null;
      return {
        id: block.id,
        type: 'list',
        name: 'list',
        data: {
          style: block.style,
          items,
          item_count: items.length,
        },
      };
    }
    case 'delimiter':
      return { id: block.id, type: 'delimiter', name: 'delimiter', data: {} };
    case 'media': {
      const items = block.items
        .filter((item) => item.url)
        .map((item) => ({
          id: item.id,
          url: item.url,
          hash: item.hash,
          width: item.width,
          height: item.height,
        }));
      if (!items.length) return null;
      return {
        id: block.id,
        type: 'media',
        name: 'media',
        data: { items, item_count: items.length },
      };
    }
    case 'embed': {
      const data = block.data;
      if (!data.url) return null;
      return {
        id: block.id,
        type: 'embed',
        name: 'embed',
        data: {
          hash: data.hash,
          embed: data.embed,
          image: data.image,
          site_name: data.site_name,
          title: data.title,
          description: data.description,
          width: data.width,
          height: data.height,
          url: data.url,
          service: data.service || 'link',
        },
      };
    }
    default:
      return null;
  }
}

export function buildArticlePayload(
  blocks: ArticleEditorBlock[],
  opts?: { isSigned?: boolean; repostArticleId?: number | null },
): FeedArticleCreateBody {
  const payloadBlocks = blocks
    .map(toPayloadBlock)
    .filter((block): block is FeedArticlePayloadBlock => block != null)
    .slice(0, ARTICLE_MAX_BLOCKS);

  return {
    is_signed: opts?.isSigned ?? true,
    repost_article_id: opts?.repostArticleId && opts.repostArticleId > 0
      ? opts.repostArticleId
      : null,
    payload: {
      time: Date.now(),
      version: ARTICLE_EDITOR_VERSION,
      blocks: payloadBlocks,
      block_count: payloadBlocks.length,
    },
  };
}

/** Текст + опциональный заголовок → payload статьи (совместимость). */
export function buildTextArticlePayload(
  text: string,
  opts?: { title?: string; isSigned?: boolean },
): FeedArticleCreateBody {
  const blocks: ArticleEditorBlock[] = [];
  const title = opts?.title?.trim() ?? '';
  if (title) {
    blocks.push({
      id: generateBlockId(),
      type: 'header',
      html: escapeText(title),
      level: 3,
    });
  }
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const parts = paragraphs.length > 0 ? paragraphs : [text.trim()].filter(Boolean);
  for (const part of parts.slice(0, ARTICLE_MAX_BLOCKS - blocks.length)) {
    blocks.push({
      id: generateBlockId(),
      type: 'paragraph',
      html: escapeText(part).replace(/\n/g, '<br>'),
    });
  }
  return buildArticlePayload(blocks, { isSigned: opts?.isSigned });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

export function dataUrlMimeExt(dataUrl: string): string {
  const match = /^data:image\/([a-z0-9+]+);/i.exec(dataUrl);
  const mime = (match?.[1] ?? 'jpeg').toLowerCase();
  if (mime === 'jpeg' || mime === 'pjpeg') return 'jpg';
  if (mime === 'svg+xml') return 'svg';
  return mime;
}

export function editorTempFileName(ext = 'jpg'): string {
  const stamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 15);
  return `temp_file_${stamp}.${ext}`;
}
