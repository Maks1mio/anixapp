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

/** Хэштег: буквы/цифры/`_`, 2–40 символов. */
const HASHTAG_RE = /#([\p{L}\p{N}_]{2,40})/gu;
const BARE_URL_RE = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_URL_PUNCT_RE = /[),.!?;:…»"'”’]+$/u;

/**
 * `#192.` в начале заголовка — нумерация выпуска, не тег.
 * Чисто цифровые `#2024` / `#100` без точки после — обычные хэштеги.
 */
export function isEpisodeNumberHash(
  tag: string,
  full: string,
  offset: number,
  source: string,
): boolean {
  if (!/^\d+$/.test(tag)) return false;
  return source.charAt(offset + full.length) === '.';
}

/** Находит хэштеги в тексте, пропуская нумерацию вида `#192.`. */
export function matchArticleHashtags(text: string): string[] {
  const source = String(text ?? '');
  const out: string[] = [];
  for (const match of source.matchAll(HASHTAG_RE)) {
    const tag = match[1];
    const full = match[0];
    const offset = match.index ?? 0;
    if (!tag || isEpisodeNumberHash(tag, full, offset, source)) continue;
    out.push(tag);
  }
  return out;
}

/** Превращает `#тег` в кликабельные ссылки (текст уже экранирован). */
export function linkifyHashtags(escapedText: string): string {
  return escapedText.replace(HASHTAG_RE, (full, tag: string, offset: number) => {
    if (isEpisodeNumberHash(tag, full, offset, escapedText)) return full;
    const href = `/feed?q=${encodeURIComponent(tag)}`;
    return `<a href="${escapeAttr(href)}" class="uiv2-hashtag" data-hashtag="${escapeAttr(tag)}">#${escapeText(tag)}</a>`;
  });
}

/**
 * Голые http(s)-URL → кликабельные ссылки (текст уже экранирован).
 * Editor.js часто кладёт YouTube и т.п. без обёртки `<a>`.
 */
export function linkifyUrls(escapedText: string): string {
  let out = '';
  let last = 0;
  BARE_URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BARE_URL_RE.exec(escapedText)) !== null) {
    out += escapedText.slice(last, match.index);

    let url = match[0];
    let trailing = '';
    const punct = TRAILING_URL_PUNCT_RE.exec(url);
    if (punct) {
      trailing = punct[0];
      url = url.slice(0, -trailing.length);
    }

    const href = sanitizeHref(url);
    if (href && url) {
      out += `<a href="${escapeAttr(href)}" class="uiv2-ext-link-inline" rel="noopener noreferrer">${url}</a>`;
      out += trailing;
    } else {
      out += match[0];
    }
    last = match.index + match[0].length;
  }
  out += escapedText.slice(last);
  return out;
}

function linkifyPlainEscaped(escapedText: string): string {
  return linkifyHashtags(linkifyUrls(escapedText));
}

/**
 * Editor.js иногда жирнит только `#`: `<b>#</b>фрея` / `…#</b>фрея`.
 * Склеиваем в обычный `#тег`, чтобы сработали чипы.
 */
export function joinMarkupSplitHashtags(html: string): string {
  let text = String(html ?? '');
  for (let i = 0; i < 3; i += 1) {
    const next = text
      // <b>#</b>tag / <strong>#</strong>tag
      .replace(/<(b|strong)>\s*#\s*<\/\1>([\p{L}\p{N}_]{2,40})/gu, '#$2')
      // #<b>tag</b>
      .replace(/#<(b|strong)>([\p{L}\p{N}_]{2,40})<\/\1>/gu, '#$2')
      // …#</b>tag — закрываем жирный до тега: <b>…#</b>x → <b>…</b>#x
      .replace(/#<\/(b|strong)>([\p{L}\p{N}_]{2,40})/gu, '</$1>#$2');
    if (next === text) break;
    text = next;
  }
  return text;
}

/**
 * Безопасный HTML для {@html}: только разрешённые inline-теги.
 * Сущности декодируются до экранирования, иначе &#34; превращается в &amp;#34;.
 */
export function sanitizeArticleHtml(raw: string): string {
  const decoded = joinMarkupSplitHashtags(decodeHtmlEntities(String(raw ?? '')));
  if (!decoded.trim()) return '';

  // Уже «голый» текст без тегов — экранируем символы, сущности уже символы
  if (!/<[a-z/]/i.test(decoded)) {
    return linkifyPlainEscaped(escapeText(decoded));
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

    // Внутри ссылок не линкуем URL/хэштеги повторно
    if (openStack.includes('a')) {
      out += escapeText(token);
    } else {
      out += linkifyPlainEscaped(escapeText(token));
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
