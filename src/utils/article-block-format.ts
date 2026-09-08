/**
 * Общее форматирование блоков статей (header / paragraph / quote / list).
 * Inline HTML из Editor.js: <b> <i> <a> и т.п.
 */

const ALLOWED_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'br',
  'a',
  'code',
  'mark',
  'span',
]);

/** Декод HTML-сущностей: &#34; &#x1f63e; &quot; &amp; … */
export function decodeHtmlEntities(raw: string): string {
  let text = String(raw ?? '');
  // Несколько проходов: &amp;#34; → &#34; → "
  for (let i = 0; i < 3; i += 1) {
    const next = text
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
    if (next === text) break;
    text = next;
  }
  return text;
}

/** Плоский текст без разметки (сравнения, превью, aria). */
export function articlePlainText(raw: string): string {
  return decodeHtmlEntities(String(raw ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeHref(href: string): string | null {
  const value = href.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return null;
}

function escapeText(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(raw: string): string {
  return escapeText(raw).replace(/"/g, '&quot;');
}

const HASHTAG_RE = /#([\p{L}\p{N}_]{2,40})/gu;

/** Превращает `#тег` в кликабельные ссылки (текст уже экранирован). */
export function linkifyHashtags(escapedText: string): string {
  return escapedText.replace(HASHTAG_RE, (_full, tag: string) => {
    const href = `/feed?q=${encodeURIComponent(tag)}`;
    return `<a href="${escapeAttr(href)}" class="uiv2-hashtag" data-hashtag="${escapeAttr(tag)}">#${escapeText(tag)}</a>`;
  });
}

/**
 * Безопасный HTML для {@html}: только разрешённые inline-теги.
 * Сущности декодируются до экранирования, иначе &#34; превращается в &amp;#34;.
 */
export function sanitizeArticleHtml(raw: string): string {
  const decoded = decodeHtmlEntities(String(raw ?? ''));
  if (!decoded.trim()) return '';

  // Уже «голый» текст без тегов — экранируем символы, сущности уже символы
  if (!/<[a-z/]/i.test(decoded)) {
    return linkifyHashtags(escapeText(decoded));
  }

  let out = '';
  const tokenRe = /<\/?([a-zA-Z0-9]+)(\s[^>]*)?>|[^<]+/g;
  let match: RegExpExecArray | null;
  const openStack: string[] = [];

  while ((match = tokenRe.exec(decoded)) !== null) {
    const token = match[0];
    if (token.startsWith('<')) {
      const isClose = token.startsWith('</');
      const tag = String(match[1] ?? '').toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) continue;

      if (tag === 'br') {
        if (!isClose) out += '<br>';
        continue;
      }

      if (isClose) {
        const idx = openStack.lastIndexOf(tag);
        if (idx < 0) continue;
        while (openStack.length > idx) {
          const t = openStack.pop();
          if (t) out += `</${t}>`;
        }
        continue;
      }

      if (tag === 'a') {
        const hrefMatch = /\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(token);
        const rawHref = hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? '';
        const href = sanitizeHref(decodeHtmlEntities(rawHref));
        if (!href) continue;
        out += `<a href="${escapeAttr(href)}" class="uiv2-ext-link-inline" rel="noopener noreferrer">`;
        openStack.push('a');
        continue;
      }

      out += `<${tag}>`;
      openStack.push(tag);
      continue;
    }

    // Внутри ссылок хэштеги не линкуем повторно
    if (openStack.includes('a')) {
      out += escapeText(token);
    } else {
      out += linkifyHashtags(escapeText(token));
    }
  }

  while (openStack.length) {
    const t = openStack.pop();
    if (t) out += `</${t}>`;
  }

  return out.trim();
}

export type ArticleFormatBlock =
  | { kind: 'header'; html: string; plain: string; level: number }
  | { kind: 'text'; html: string; plain: string }
  | { kind: 'quote'; html: string; plain: string; captionHtml?: string; captionPlain?: string }
  | { kind: 'list'; itemsHtml: string[]; itemsPlain: string[] }
  | { kind: 'delimiter' };

export function formatInlineField(raw: string | null | undefined): { html: string; plain: string } {
  const source = String(raw ?? '');
  const plain = articlePlainText(source);
  if (!plain && !/<br\s*\/?>/i.test(source)) return { html: '', plain: '' };
  return { html: sanitizeArticleHtml(source), plain };
}
