import { buildPosterUrl } from '../../utils/posterUrl';
import type { ReleaseCardData } from '../../types/release';
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
  const overlay = document.createElement('div');
  overlay.className = 'release-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const div = document.createElement('div');
  div.textContent = imageUrl;
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
  const p = raw.poster as Record<string, { url?: string }> | undefined;
  const posterRaw =
    p?.original?.url ?? p?.medium?.url ?? p?.small?.url
    ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
    ?? (typeof raw.image  === 'string' ? raw.image  : undefined);
  const poster = typeof posterRaw === 'string' ? buildPosterUrl(posterRaw) || undefined : undefined;
  const statusObj   = raw.status   as { name?: string } | undefined;
  const categoryObj = raw.category as { name?: string } | undefined;
  const pls = typeof raw.profile_list_status === 'number' ? raw.profile_list_status : undefined;
  let listStatus: ReleaseCardData['listStatus'];
  switch (pls) {
    case 1: listStatus = 'watching';   break;
    case 2: listStatus = 'planned';    break;
    case 3: listStatus = 'completed';  break;
    case 4: listStatus = 'on_hold';    break;
    case 5: listStatus = 'dropped';    break;
  }
  return {
    id:               raw.id as number | undefined,
    titleRu:          (raw.title_ru    ?? raw.titleRu)  as string | undefined,
    titleEn:          (raw.title_original ?? raw.titleEn) as string | undefined,
    titleAlt:         (raw.title_alt   as string) || undefined,
    description:      (raw.description as string) || undefined,
    poster,
    rating:           typeof raw.grade      === 'number' ? raw.grade      : undefined,
    voteCount:        typeof raw.vote_count === 'number' ? raw.vote_count : undefined,
    episodesReleased: typeof raw.episodes_released === 'number' ? raw.episodes_released : undefined,
    episodesTotal:    typeof raw.episodes_total    === 'number' ? raw.episodes_total    : undefined,
    year:             typeof raw.year === 'string' ? raw.year : (typeof raw.year === 'number' ? String(raw.year) : undefined),
    country:          (raw.country as string) || undefined,
    genres:           (raw.genres  as string) || undefined,
    status:           statusObj?.name,
    studio:           (raw.studio  as string) || undefined,
    category:         categoryObj?.name,
    releaseDate:      (raw.release_date as string) || undefined,
    isFavorite:       !!(raw.is_favorite),
    listStatus,
  };
}
