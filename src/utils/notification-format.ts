import { resolveCdnAssetUrl } from './posterUrl';
import { resolveJacksonRefs } from './jackson-refs';

export interface ParsedNotification {
  bodyHtml: string;
  timeStr: string;
  isNew: boolean;
  image: string;
  markerKind:
    | 'episode'
    | 'article'
    | 'related'
    | 'friend'
    | 'friend-accept'
    | 'comment'
    | 'none';
  releaseId?: number;
  profileId?: number;
  articleId?: number;
  channelId?: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function boldQuoted(value: string): string {
  return `<b>«${escapeHtml(value)}»</b>`;
}

function boldText(value: string): string {
  return `<b>${escapeHtml(value)}</b>`;
}

function cdnImage(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '';
  return resolveCdnAssetUrl(raw);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain preview from article payload blocks (Anixart-compatible). */
export function extractArticlePreview(payload: unknown, maxLen = 150): string {
  if (!payload) return '';
  if (typeof payload === 'string') {
    const plain = stripHtml(payload);
    return plain.length > maxLen ? `${plain.slice(0, maxLen).trim()}…` : plain;
  }

  const root = asRecord(payload);
  if (!root) return '';

  const blocks = Array.isArray(root.blocks) ? root.blocks : [];
  const parts: string[] = [];
  for (const block of blocks) {
    const b = asRecord(block);
    const data = asRecord(b?.data) ?? b;
    const text = typeof data?.text === 'string' ? data.text : '';
    if (!text.trim()) continue;
    parts.push(stripHtml(text));
    if (parts.join(' ').length >= maxLen) break;
  }

  const joined = parts.join(' ').trim();
  if (!joined) return '';
  return joined.length > maxLen ? `${joined.slice(0, maxLen).trim()}…` : joined;
}

/** Relative / calendar time like Anixart mobile. */
export function formatNotificationTime(ts: number | undefined): string {
  if (!ts) return '';
  try {
    const now = new Date();
    const d = new Date(ts * 1000);
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    const hh = d.getHours().toString().padStart(2, '0');
    const mi = d.getMinutes().toString().padStart(2, '0');

    if (diffSec < 60) return 'только что';
    if (diffMin < 60) return `${diffMin} мин назад`;
    if (diffHour < 24 && isSameDay(d, now)) {
      if (diffHour < 12) return `${diffHour} ч назад`;
      return `сегодня в ${hh}:${mi}`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameDay(d, yesterday)) return `вчера в ${hh}:${mi}`;

    const monthsShort = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
    const dd = d.getDate();
    const mm = monthsShort[d.getMonth()];
    if (d.getFullYear() === now.getFullYear()) return `${dd} ${mm} в ${hh}:${mi}`;
    return `${dd} ${mm} ${d.getFullYear()} в ${hh}:${mi}`;
  } catch {
    return '';
  }
}

function episodeLabel(episode: Record<string, unknown> | null): string {
  if (!episode) return 'эпизод';
  const name = typeof episode.name === 'string' ? episode.name.trim() : '';
  if (name) return name;
  const pos = episode.position;
  if (typeof pos === 'number' && Number.isFinite(pos)) return `${pos} серия`;
  return 'эпизод';
}

export function parseNotification(rawInput: unknown): ParsedNotification {
  const raw = asRecord(resolveJacksonRefs(rawInput)) ?? {};
  const type = String(raw.type || '');
  const timeStr = formatNotificationTime(typeof raw.timestamp === 'number' ? raw.timestamp : undefined);
  const isNew = !!raw.is_new;

  if (type === 'episode') {
    const episode = asRecord(raw.episode);
    const release = asRecord(episode?.release);
    const source = asRecord(episode?.source);
    const sourceType = asRecord(source?.type);
    const epName = episodeLabel(episode);
    const title = String(release?.title_ru || 'Релиз');
    const variant = String(sourceType?.name || '—');
    const sourceName = String(source?.name || '—');
    return {
      bodyHtml: `Вышла ${boldQuoted(epName)} релиза ${boldQuoted(title)} в варианте ${boldQuoted(variant)} на источнике «${escapeHtml(sourceName)}»`,
      timeStr,
      isNew,
      image: cdnImage(release?.image),
      markerKind: 'episode',
      releaseId: release?.id != null ? Number(release.id) : undefined,
    };
  }

  if (type === 'article') {
    const article = asRecord(raw.article);
    const channel = asRecord(article?.channel);
    const channelTitle = String(channel?.title || channel?.login || 'Канал');
    const preview = extractArticlePreview(article?.payload);
    const base = `Новая запись на канале ${boldQuoted(channelTitle)}`;
    return {
      bodyHtml: preview ? `${base}: ${escapeHtml(preview)}` : base,
      timeStr,
      isNew,
      image: cdnImage(channel?.avatar),
      markerKind: 'article',
      articleId: article?.id != null ? Number(article.id) : undefined,
      channelId: channel?.id != null ? Number(channel.id) : undefined,
    };
  }

  if (type === 'relatedRelease') {
    const release = asRecord(raw.release);
    const title = String(release?.title_ru || 'Релиз');
    return {
      bodyHtml: `В приложение была добавлена страница релиза ${boldQuoted(title)}`,
      timeStr,
      isNew,
      image: cdnImage(release?.image),
      markerKind: 'related',
      releaseId: release?.id != null ? Number(release.id) : undefined,
    };
  }

  if (type === 'friend') {
    const profile = asRecord(raw.by_profile);
    const login = String(profile?.login || 'Пользователь');
    const status = String(raw.status || '');
    const bodyHtml =
      status === 'ACCEPT'
        ? `Пользователь ${boldText(login)} внёс вас в список своих друзей`
        : `Пользователь ${boldText(login)} хочет внести вас в список друзей`;
    return {
      bodyHtml,
      timeStr,
      isNew,
      image: cdnImage(profile?.avatar),
      markerKind: status === 'ACCEPT' ? 'friend-accept' : 'friend',
      profileId: profile?.id != null ? Number(profile.id) : undefined,
    };
  }

  if (
    type === 'releaseComment' ||
    type === 'collectionComment' ||
    type === 'articleComment' ||
    type === 'myCollection' ||
    type === 'myArticle'
  ) {
    const comment = asRecord(raw.comment) ?? asRecord(raw.parent_comment);
    const profile = asRecord(comment?.profile);
    const login = String(profile?.login || 'Пользователь');
    const message = typeof comment?.message === 'string' ? stripHtml(comment.message) : '';
    const title = String(
      comment?.embeddable_title ||
        asRecord(raw.release)?.title_ru ||
        asRecord(raw.collection)?.title ||
        asRecord(raw.article)?.title ||
        ''
    );
    let bodyHtml = `Новый комментарий от ${boldText(login)}`;
    if (message) bodyHtml += `: ${escapeHtml(message.slice(0, 120))}`;
    else if (title) bodyHtml += ` к ${boldQuoted(title)}`;

    const release = asRecord(raw.release) ?? asRecord(comment?.release);
    const article = asRecord(raw.article) ?? asRecord(comment?.article);
    const channel = asRecord(article?.channel);

    return {
      bodyHtml,
      timeStr,
      isNew,
      image: cdnImage(profile?.avatar),
      markerKind: 'comment',
      profileId: profile?.id != null ? Number(profile.id) : undefined,
      releaseId: release?.id != null ? Number(release.id) : undefined,
      articleId: article?.id != null ? Number(article.id) : undefined,
      channelId: channel?.id != null ? Number(channel.id) : undefined,
    };
  }

  // Fallback: never show empty "Уведомление" if we have any useful fields
  if (raw.release) {
    const release = asRecord(raw.release);
    const title = String(release?.title_ru || 'Релиз');
    return {
      bodyHtml: `Уведомление о релизе ${boldQuoted(title)}`,
      timeStr,
      isNew,
      image: cdnImage(release?.image),
      markerKind: 'related',
      releaseId: release?.id != null ? Number(release.id) : undefined,
    };
  }

  const title = String(raw.title || raw.text || 'Уведомление');
  return {
    bodyHtml: escapeHtml(title),
    timeStr,
    isNew,
    image: '',
    markerKind: 'none',
  };
}
