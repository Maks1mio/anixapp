import type { ReleaseCardData } from '../../types/release';
import { mapReleaseRawToCard } from '../../utils/release-card';
import type { ListStatusId } from './_types';

// ── Text helpers ──────────────────────────────────────────────────────────────

export function getAgeRateText(rate: number | string | undefined): string {
  const n = typeof rate === 'string' ? parseInt(rate, 10) : rate;
  switch (n) {
    case 2: return '6+';
    case 3: return '12+';
    case 4: return '16+';
    case 5: return '18+';
    default: return '0+';
  }
}

export function getSeasonName(season: number | null | undefined): string {
  switch (season) {
    case 1: return 'Зима';
    case 2: return 'Весна';
    case 3: return 'Лето';
    case 4: return 'Осень';
    default: return '';
  }
}

/**
 * HTML с сервера (описание, заметка релиза) разбирается в инертном документе DOMParser: там не
 * грузятся картинки и не срабатывают обработчики (onerror и т. п.). Присваивание innerHTML элементу
 * живого документа выполняло `<img src=x onerror=…>` ещё до очистки.
 */
function parseInert(html: string): Document {
  return new DOMParser().parseFromString(String(html), 'text/html');
}

export function stripHtmlToText(html: string): string {
  if (!html) return '';
  const doc = parseInert(html.replace(/<br\s*\/?>/gi, '\n'));
  return (doc.body.textContent || '').trim();
}

/** Разрешённые теги (остальные — разворачиваются в текст) и атрибуты. */
const RICH_ALLOWED_TAGS = new Set([
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'br', 'p', 'span', 'div',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'sub', 'sup', 'small', 'hr',
]);
/** Удаляются вместе с содержимым. */
const RICH_DROP_TAGS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'video', 'audio',
  'source', 'track', 'img', 'picture', 'svg', 'math', 'form', 'input', 'button', 'select', 'textarea',
  'option', 'link', 'meta', 'base', 'template', 'noscript', 'canvas', 'map', 'area', 'portal',
]);

/** Только http(s), mailto и относительные пути; управляющие символы и пробелы внутри схемы не обходят проверку. */
function safeHref(value: string): string | null {
  const v = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  if (!v) return null;
  if (v.startsWith('/') && !v.startsWith('//')) return value.trim();
  if (v.startsWith('#')) return value.trim();
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:' ? u.href : null;
  } catch {
    return null;
  }
}

function sanitizeNode(node: Node, doc: Document): void {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    const tag = el.localName.toLowerCase();
    if (RICH_DROP_TAGS.has(tag) || el.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
      el.remove();
      continue;
    }
    sanitizeNode(el, doc);
    if (!RICH_ALLOWED_TAGS.has(tag)) {
      // Неизвестный тег: оставляем только содержимое
      el.replaceWith(...[...el.childNodes]);
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (tag === 'a' && name === 'href') {
        const href = safeHref(attr.value);
        if (href) el.setAttribute('href', href);
        else el.removeAttribute('href');
      } else if (name !== 'class' && name !== 'title' && !(tag === 'a' && name === 'target')) {
        el.removeAttribute(attr.name);
      }
    }
    if (tag === 'a') {
      el.setAttribute('rel', 'noopener noreferrer nofollow');
      if (el.getAttribute('target') !== '_blank') el.removeAttribute('target');
    }
  }
}

export function sanitizeRichHtml(raw: string): string {
  if (!raw) return '';
  const doc = parseInert(raw);
  sanitizeNode(doc.body, doc);
  return doc.body.innerHTML;
}

export function formatVoteCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export function formatCommentTime(ts: number): string {
  const date = new Date(ts * 1000);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000)     return 'только что';
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)} мин. назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч. назад`;
  if (diff < 172_800_000) return 'вчера';
  const months = 'янв. февр. мар. апр. май июн. июл. авг. сен. окт. нояб. дек.'.split(' ');
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

export function numToStatusId(n: number | null | undefined): ListStatusId | null {
  if (n == null) return null;
  const map: Record<number, ListStatusId> = { 1: 'watching', 2: 'planned', 3: 'completed', 4: 'on_hold', 5: 'dropped' };
  return map[n] ?? null;
}

export function ratingHue(grade: number): number {
  return (Math.max(0, Math.min(5, grade)) / 5) * 48;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

export { closeImageLightbox, isImageLightboxOpen, openImageLightbox, openImageLightboxGallery } from '../../utils/image-lightbox';

// ── Card mapper ───────────────────────────────────────────────────────────────

export function mapCardData(raw: Record<string, unknown>): ReleaseCardData {
  return mapReleaseRawToCard(raw);
}

export interface EpisodeLastUpdateData {
  last_episode_update_name?: string;
  last_episode_type_update_name?: string;
  last_episode_source_update_name?: string;
  lastEpisodeUpdateName?: string;
  lastEpisodeTypeUpdateName?: string;
  lastEpisodeSourceUpdateName?: string;
}

/** Android: format_episode_added → «Добавлено: %1$s | %2$s | %3$s» */
export function formatEpisodeAdded(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as EpisodeLastUpdateData;

  const episode =
    String(u.last_episode_update_name ?? u.lastEpisodeUpdateName ?? '').trim()
    || 'неизвестная серия';
  const type =
    String(u.last_episode_type_update_name ?? u.lastEpisodeTypeUpdateName ?? '').trim();
  const source =
    String(u.last_episode_source_update_name ?? u.lastEpisodeSourceUpdateName ?? '').trim();

  if (!type && !source && episode === 'неизвестная серия') return null;

  return `Добавлено: ${episode} | ${type} | ${source}`;
}
