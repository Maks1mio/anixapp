import { toCdnProxyUrl } from '../../utils/posterUrl';
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

export function stripHtmlToText(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html.replace(/<br\s*\/?>/gi, '\n');
  return (tmp.textContent || tmp.innerText || '').trim();
}

export function sanitizeRichHtml(raw: string): string {
  if (!raw) return '';
  const root = document.createElement('div');
  root.innerHTML = raw;
  const DENY = ['script','iframe','object','embed','video','audio','form','input','button','link','meta','style','img','svg'];
  DENY.forEach(tag => root.querySelectorAll(tag).forEach(el => el.remove()));
  root.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on')) { el.removeAttribute(attr.name); continue; }
      if (attr.name === 'href' && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
    }
  });
  return root.innerHTML;
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

export function openImageLightbox(imageUrl: string) {
  const displayUrl = toCdnProxyUrl(imageUrl);
  const overlay = document.createElement('div');
  overlay.className = 'release-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const div = document.createElement('div');
  div.textContent = displayUrl;
  const safeUrl = div.innerHTML;
  overlay.innerHTML = `<div class="release-lightbox__backdrop"></div><div class="release-lightbox__content"><img src="${safeUrl}" alt="" /></div>`;
  const backdrop = overlay.querySelector('.release-lightbox__backdrop');
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  const img = overlay.querySelector('img');
  if (img) img.addEventListener('click', (e) => e.stopPropagation());
}

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
