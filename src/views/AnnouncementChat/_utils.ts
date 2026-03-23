import type { Comment } from '../../services/announcements';
import type { ParsedMsg } from './_types';
import { buildPosterUrl } from '../../utils/posterUrl';

/** Извлекает готовый URL постера из объекта релиза API */
export function extractPosterUrl(r: Record<string, any> | undefined): string | undefined {
  if (!r) return undefined;
  const p = r.poster as Record<string, { url?: string }> | undefined;
  const raw = p?.original?.url ?? p?.medium?.url ?? p?.small?.url ?? (typeof r.poster === 'string' ? r.poster : undefined);
  return raw ? buildPosterUrl(raw) : undefined;
}

export function getSelf(): { id: number; login: string; avatar: string | null } | null {
  const p = (window as any).__anixProfile;
  return p?.id ? p : null;
}

export function parseMessage(msg: string): ParsedMsg {
  let text = msg;
  let replyId: string | null = null;
  let gifUrl: string | null = null;

  const replyMatch = text.match(/^<<([^>]+)>>\n?([\s\S]*)$/);
  if (replyMatch && !replyMatch[1].startsWith('release:') && !replyMatch[1].startsWith('gif:')) {
    replyId = replyMatch[1];
    text = replyMatch[2];
  }

  const releaseMatch = text.match(/^<<release:(\d+)>>$/);
  if (releaseMatch) return { replyId, releaseId: Number(releaseMatch[1]), gifUrl: null, text: '' };

  const gifMatch = text.match(/<<gif:(https?:\/\/[^>\s]+)>>/);
  if (gifMatch) {
    gifUrl = gifMatch[1];
    text = text.replace(gifMatch[0], '').trim();
  }

  return { replyId, releaseId: null, gifUrl: gifUrl || null, text };
}

export function renderText(
  msg: string,
  profileCache: Record<number, { login: string; avatar: string | null }>,
): string {
  return msg
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/@\[(\d+)\]/g, (_, uid) => {
      const name = profileCache[Number(uid)]?.login ?? uid;
      return `<span class="dc-mention">@${name}</span>`;
    });
}

export function dateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function shouldShowDate(comments: Comment[], i: number): boolean {
  if (i === 0) return true;
  return (
    new Date(comments[i - 1].createdAt).toDateString() !==
    new Date(comments[i].createdAt).toDateString()
  );
}

export function isGrouped(comments: Comment[], i: number): boolean {
  if (i === 0) return false;
  const prev = comments[i - 1];
  const cur  = comments[i];
  return (
    prev.userId === cur.userId &&
    new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime() < 7 * 60 * 1000 &&
    !shouldShowDate(comments, i)
  );
}

/** True если это последнее сообщение в цепочке от одного пользователя */
export function isLastInGroup(comments: Comment[], i: number): boolean {
  if (i === comments.length - 1) return true;
  return !isGrouped(comments, i + 1);
}
