import { navigate } from '../app';
import { renderReleaseCardHorizontal } from '../components/release-card-h';
import { renderReleaseCardVertical } from '../components/release-card-v';
import { openWatchModal } from '../components/watch-modal';
import { renderSelect } from '../components/select';
import { iconPlay, iconStar } from '../components/icons';
import { ratingHue } from '../components/release-card-h';
import { getCardLayout } from '../prefs';
import { buildPosterUrl } from '../utils/posterUrl';
import type { ReleaseCardData } from '../types/release';

const LIST_STATUSES = [
  { id: 'watching', label: 'Смотрю' },
  { id: 'planned', label: 'В планах' },
  { id: 'completed', label: 'Просмотрено' },
  { id: 'dropped', label: 'Брошено' },
  { id: 'on_hold', label: 'Отложено' },
] as const;

type ListStatusId = (typeof LIST_STATUSES)[number]['id'];

interface ReleaseApi {
  id?: number;
  title_ru?: string;
  title_original?: string;
  title_alt?: string | null;
  description?: string | null;
  note?: string | null;
  image?: string;
  poster?: string | { small?: { url?: string }; medium?: { url?: string }; original?: { url?: string } };
  grade?: number;
  vote_count?: number;
  rating?: number;
  episodes_released?: number | null;
  episodes_total?: number | null;
  duration?: number | null;
  year?: string | number;
  season?: number | null;
  country?: string;
  genres?: string;
  studio?: string | null;
  author?: string | null;
  director?: string | null;
  source?: string | null;
  release_date?: string | null;
  aired_on_date?: number | null;
  status?: { id?: number; name?: string };
  category?: { id?: number; name?: string };
  is_favorite?: boolean;
  is_view_blocked?: boolean;
  profile_list_status?: number | null;
  comments?: Array<{ id?: number; profile?: { nickname?: string; avatar?: string }; message?: string; timestamp?: number }>;
  recommended_releases?: Array<Record<string, unknown>>;
  related?: { id?: number; name_ru?: string; release_count?: number } | null;
  related_releases?: Array<Record<string, unknown>>;
  screenshot_images?: string[];
  screenshots?: string[];
  video_banners?: Array<{ name?: string; image?: string; value?: string; action_id?: number }>;
  favorites_count?: number;
  completed_count?: number;
  watching_count?: number;
  comments_count?: number;
  /** Возрастной рейтинг (числовой код 1-5 из API): 1=0+, 2=6+, 3=12+, 4=16+, 5=18+ */
  age_rating?: number | string;
  is_adult?: boolean;
  vote_1_count?: number;
  vote_2_count?: number;
  vote_3_count?: number;
  vote_4_count?: number;
  vote_5_count?: number;
  plan_count?: number;
  hold_on_count?: number;
  dropped_count?: number;
}

/** Конвертирует числовой код возрастного рейтинга (1–5 из Anixart API) в текстовый вид */
function getAgeRateText(rate: number | string | undefined): string {
  const n = typeof rate === 'string' ? parseInt(rate, 10) : rate;
  switch (n) {
    case 2: return '6+';
    case 3: return '12+';
    case 4: return '16+';
    case 5: return '18+';
    case 1:
    default: return '0+';
  }
}

/** Название сезона по числовому коду (1–4) */
function getSeasonName(season: number | null | undefined): string {
  switch (season) {
    case 1: return 'Зима';
    case 2: return 'Весна';
    case 3: return 'Лето';
    case 4: return 'Осень';
    default: return '';
  }
}

/** Подмена http на https для превью (CSP разрешает только https) */
function ensureHttps(url: string): string {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/^http:\/\//i, 'https://');
}

/** Извлечь YouTube video ID из URL превью (img.youtube.com/vi/VIDEO_ID/...) */
function youtubeVideoIdFromThumbUrl(url: string): string | null {
  const m = /youtube\.com\/vi\/([a-zA-Z0-9_-]+)/.exec(url);
  return m ? m[1] : null;
}

function openImageLightbox(imageUrl: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'release-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `<div class="release-lightbox__backdrop"></div><div class="release-lightbox__content"><img src="${escapeHtml(imageUrl)}" alt="" /></div>`;
  const backdrop = overlay.querySelector('.release-lightbox__backdrop');
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  const img = overlay.querySelector('img');
  if (img) img.addEventListener('click', (e) => e.stopPropagation());
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/** Strip HTML tags from API description (API sometimes returns <font> / <b> / <br> etc.) */
function stripHtmlToText(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').trim();
}

/** Convert API description HTML to safe display HTML (render <br> as newlines, strip font/b/i/etc) */
function sanitizeDescriptionHtml(raw: string): string {
  if (!raw) return '';
  // Normalize <br> / <br/> / <br /> to newlines
  let s = raw.replace(/<br\s*\/?>/gi, '\n');
  // Strip all HTML tags
  const tmp = document.createElement('div');
  tmp.innerHTML = s;
  s = (tmp.textContent || tmp.innerText || '').trim();
  // Escape for safe insertion, then convert newlines back to <br>
  const escaped = escapeHtml(s);
  return escaped.replace(/\n/g, '<br>');
}

/**
 * Sanitize API rich HTML (notes, announcements) for safe innerHTML insertion.
 * Keeps formatting tags (<b>, <i>, <br>, <font color="...">, <span>) but
 * removes dangerous elements (script, iframe, img, …) and all event handlers.
 */
function sanitizeRichHtml(raw: string): string {
  if (!raw) return '';
  const root = document.createElement('div');
  root.innerHTML = raw;

  // Remove entire dangerous subtrees
  const DENY_TAGS = ['script', 'iframe', 'object', 'embed', 'video', 'audio',
                     'form', 'input', 'button', 'link', 'meta', 'style', 'img', 'svg'];
  DENY_TAGS.forEach(tag => root.querySelectorAll(tag).forEach(el => el.remove()));

  // Strip event handlers and javascript: hrefs from every remaining element
  root.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on')) { el.removeAttribute(attr.name); continue; }
      if (attr.name === 'href' && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return root.innerHTML;
}

function formatVoteCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
  const p = raw.poster as Record<string, { url?: string }> | undefined;
  const posterRaw =
    p?.original?.url ?? p?.medium?.url ?? p?.small?.url
    ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
    ?? (typeof raw.image === 'string' ? raw.image : undefined);
  const posterStr = typeof posterRaw === 'string' ? posterRaw : undefined;
  const poster = posterStr ? buildPosterUrl(posterStr) || undefined : undefined;
  const grade = typeof raw.grade === 'number' ? raw.grade : undefined;
  const statusObj = raw.status as { name?: string } | undefined;
  const categoryObj = raw.category as { name?: string } | undefined;
  const profileListStatus = typeof raw.profile_list_status === 'number' ? raw.profile_list_status : undefined;
  let listStatus: ReleaseCardData['listStatus'];
  switch (profileListStatus) {
    case 1: listStatus = 'watching'; break;
    case 2: listStatus = 'planned'; break;
    case 3: listStatus = 'completed'; break;
    case 4: listStatus = 'on_hold'; break;
    case 5: listStatus = 'dropped'; break;
    default: listStatus = undefined;
  }
  return {
    id: raw.id as number | undefined,
    titleRu: (raw.title_ru ?? raw.titleRu) as string | undefined,
    titleEn: (raw.title_original ?? raw.titleEn) as string | undefined,
    titleAlt: (raw.title_alt as string) || undefined,
    description: (raw.description as string) || undefined,
    poster: poster || undefined,
    rating: grade,
    voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : undefined,
    episodesReleased: typeof raw.episodes_released === 'number' ? raw.episodes_released : undefined,
    episodesTotal: typeof raw.episodes_total === 'number' ? raw.episodes_total : undefined,
    year: typeof raw.year === 'string' ? raw.year : (typeof raw.year === 'number' ? String(raw.year) : undefined),
    country: (raw.country as string) || undefined,
    genres: (raw.genres as string) || undefined,
    status: statusObj?.name,
    studio: (raw.studio as string) || undefined,
    category: categoryObj?.name,
    releaseDate: (raw.release_date as string) || undefined,
    isFavorite: !!(raw.is_favorite),
    listStatus,
  };
}

function formatCommentTime(ts: number): string {
  const date = new Date(ts * 1000);
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return 'только что';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} мин. назад`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} ч. назад`;
  if (diff < 172800_000) return 'вчера';
  const day = date.getDate();
  const months = 'янв. февр. мар. апр. май июн. июл. авг. сен. окт. нояб. дек.'.split(' ');
  const month = months[date.getMonth()];
  return `${day} ${month}`;
}

export function renderRelease(id: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-release';

  wrap.innerHTML = `
    <div class="release-loading" id="release-load">Загрузка…</div>
    <div class="release-content" id="release-content" hidden></div>
  `;

  const loadEl = wrap.querySelector('#release-load') as HTMLElement;
  const contentEl = wrap.querySelector('#release-content') as HTMLElement;

  console.log('[AnixApp] Страница релиза открыта, id:', id, 'API доступен:', !!window.anixApi);

  if (!window.anixApi) {
    loadEl.textContent = 'API недоступно (только в Electron).';
    return wrap;
  }

  window.anixApi.release
    .info(id, true)
    .then((data: { release?: unknown } & Record<string, unknown>) => {
      // Вывод в консоль для отладки: что вернул API
      console.log('[AnixApp] API getReleaseById ответ:', data);
      const raw = data?.release ?? data;
      const release = raw as ReleaseApi | undefined;
      if (release) {
        console.log('[AnixApp] Релиз:', {
          id: release.id,
          title_ru: release.title_ru,
          title_original: release.title_original,
          grade: release.grade,
          rating: release.rating,
          vote_count: release.vote_count,
          age_rating: release.age_rating,
        });
      }
      if (!release || (release.id == null && !release.title_ru && !release.title_original)) {
        loadEl.textContent = 'Релиз не найден.';
        return;
      }
      loadEl.hidden = true;
      contentEl.hidden = false;
      contentEl.appendChild(buildReleaseBody(release));

      // Discord Rich Presence — update when viewing an anime page
      {
        const title = release.title_ru || release.title_original || '';
        const posterRaw =
          typeof release.poster === 'string'
            ? release.poster
            : (release.poster as unknown as Record<string, { url?: string }>)?.original?.url
              ?? (release.poster as unknown as Record<string, { url?: string }>)?.medium?.url
              ?? (typeof release.image === 'string' ? release.image : '');
        const posterUrl = buildPosterUrl(posterRaw ?? '');
        window.dispatchEvent(
          new CustomEvent('discord:releaseView', { detail: { title, posterUrl: posterUrl || undefined } }),
        );
      }
    })
    .catch((err) => {
      console.error('[AnixApp] Ошибка getReleaseById:', err);
      loadEl.textContent = `Ошибка: ${String(err)}`;
    });

  return wrap;
}

/** Читает поле из объекта с поддержкой snake_case и camelCase (как возвращают разные варианты API) */
function getField<T>(r: Record<string, unknown>, snake: string, camel: string): T | undefined {
  const raw = r[snake] ?? r[camel];
  return raw as T | undefined;
}

function buildReleaseBody(r: ReleaseApi): HTMLElement {
  const rec = r as unknown as Record<string, unknown>;
  const posterRaw =
    typeof r.poster === 'string' ? r.poster : r.poster?.original?.url ?? r.poster?.medium?.url ?? r.poster?.small?.url;
  const posterUrl = buildPosterUrl(
    posterRaw ?? (typeof r.image === 'string' ? r.image : undefined) ?? '',
  );
  const titleRu = (r.title_ru ?? getField<string>(rec, 'title_ru', 'titleRu')) ?? '';
  const titleOriginal = (r.title_original ?? getField<string>(rec, 'title_original', 'titleOriginal')) ?? '';
  const title = titleRu || titleOriginal || 'Без названия';
  const desc = (r.description ?? getField<string>(rec, 'description', 'description')) ?? '';
  // Рейтинг: API может отдавать grade или rating (как в AniDesk / Anixart)
  const gradeRaw = r.grade ?? r.rating ?? getField<number>(rec, 'grade', 'grade') ?? getField<number>(rec, 'rating', 'rating');
  const grade = typeof gradeRaw === 'number' && !Number.isNaN(gradeRaw) ? gradeRaw : null;
  const voteCountRaw = r.vote_count ?? getField<number>(rec, 'vote_count', 'voteCount') ?? getField<number>(rec, 'votes_count', 'votesCount');
  const voteCount = typeof voteCountRaw === 'number' && !Number.isNaN(voteCountRaw) ? voteCountRaw : 0;
  const hasRating = voteCount > 0 || (grade != null && grade > 0);
  const year = (r.year ?? getField(rec, 'year', 'year')) != null ? String(r.year ?? getField(rec, 'year', 'year')) : '';
  const country = (r.country ?? getField<string>(rec, 'country', 'country')) ?? '';
  const episodesReleased = r.episodes_released ?? getField<number>(rec, 'episodes_released', 'episodesReleased');
  const episodesTotal = r.episodes_total ?? getField<number>(rec, 'episodes_total', 'episodesTotal');
  const statusObj = r.status ?? getField<{ name?: string }>(rec, 'status', 'status');
  const statusName = statusObj?.name ?? '';
  const studio = (r.studio ?? getField<string>(rec, 'studio', 'studio')) ?? '';
  const source = (r.source ?? getField<string>(rec, 'source', 'source')) ?? '';
  const releaseDate = (r.release_date ?? getField<string>(rec, 'release_date', 'releaseDate')) ?? '';
  const genres = (r.genres ?? getField<string>(rec, 'genres', 'genres')) ?? '';
  const categoryObj = r.category ?? getField<{ name?: string }>(rec, 'category', 'category');
  const categoryName = categoryObj?.name ?? '';
  const isFavorite = !!(r.is_favorite ?? getField<boolean>(rec, 'is_favorite', 'isFavorite'));
  const profileListStatus = r.profile_list_status ?? getField<number>(rec, 'profile_list_status', 'profileListStatus');
  const releaseId = r.id ?? getField<number>(rec, 'id', 'id');
  const layout = getCardLayout();
  const related = r.related ?? getField(rec, 'related', 'related');
  const relatedReleases = (r.related_releases ?? getField<Record<string, unknown>[]>(rec, 'related_releases', 'relatedReleases')) ?? [];
  const recommended = (r.recommended_releases ?? getField<Record<string, unknown>[]>(rec, 'recommended_releases', 'recommendedReleases')) ?? [];
  const screenshotImages = r.screenshot_images ?? getField<string[]>(rec, 'screenshot_images', 'screenshotImages');
  const screenshotsRaw = r.screenshots ?? getField<string[]>(rec, 'screenshots', 'screenshots');
  const screenshots = screenshotImages ?? screenshotsRaw?.map((s) => (s.startsWith('http') ? s : `https://s.anixmirai.com/screenshots/${s}.jpg`)) ?? [];
  const videoBanners = (r.video_banners ?? getField<Array<{ name?: string; image?: string; value?: string; action_id?: number }>>(rec, 'video_banners', 'videoBanners')) ?? [];
  const comments = (r.comments ?? getField(rec, 'comments', 'comments')) ?? [];
  const commentsCount = (r.comments_count ?? getField<number>(rec, 'comments_count', 'commentsCount')) ?? (Array.isArray(comments) ? comments.length : 0);
  const favoritesCount = (r.favorites_count ?? getField<number>(rec, 'favorites_count', 'favoritesCount')) ?? 0;
  const isAdult = !!(r.is_adult ?? getField<boolean>(rec, 'is_adult', 'isAdult'));
  const ageRatingRaw = r.age_rating ?? getField<number>(rec, 'age_rating', 'ageRating');
  const ageRateText = isAdult ? '18+' : getAgeRateText(ageRatingRaw);
  const ageIsRestricted = ageRateText === '16+' || ageRateText === '18+';
  const duration = r.duration ?? getField<number>(rec, 'duration', 'duration');
  const season = r.season ?? getField<number>(rec, 'season', 'season');
  const seasonName = getSeasonName(season);
  const note = (r.note ?? getField<string>(rec, 'note', 'note')) ?? '';
  const isViewBlocked = !!(r.is_view_blocked ?? getField<boolean>(rec, 'is_view_blocked', 'isViewBlocked'));
  const airedOnDate = r.aired_on_date ?? getField<number>(rec, 'aired_on_date', 'airedOnDate');
  const author = (r.author ?? getField<string>(rec, 'author', 'author')) ?? '';
  const director = (r.director ?? getField<string>(rec, 'director', 'director')) ?? '';
  const vote1 = (r.vote_1_count ?? getField<number>(rec, 'vote_1_count', 'vote1Count')) ?? 0;
  const vote2 = (r.vote_2_count ?? getField<number>(rec, 'vote_2_count', 'vote2Count')) ?? 0;
  const vote3 = (r.vote_3_count ?? getField<number>(rec, 'vote_3_count', 'vote3Count')) ?? 0;
  const vote4 = (r.vote_4_count ?? getField<number>(rec, 'vote_4_count', 'vote4Count')) ?? 0;
  const vote5 = (r.vote_5_count ?? getField<number>(rec, 'vote_5_count', 'vote5Count')) ?? 0;
  const planCount = (r.plan_count ?? getField<number>(rec, 'plan_count', 'planCount')) ?? 0;
  const holdOnCount = (r.hold_on_count ?? getField<number>(rec, 'hold_on_count', 'holdOnCount')) ?? 0;
  const droppedCount = (r.dropped_count ?? getField<number>(rec, 'dropped_count', 'droppedCount')) ?? 0;
  const watchingCount = (r.watching_count ?? getField<number>(rec, 'watching_count', 'watchingCount')) ?? 0;
  const completedCount = (r.completed_count ?? getField<number>(rec, 'completed_count', 'completedCount')) ?? 0;

  // ── Build structured meta info rows (AniDesk-style) ──
  const metaInfoRows: Array<{ icon: string; text: string }> = [];

  // Country + year + season
  {
    const parts: string[] = [];
    if (country) parts.push(country);
    if (seasonName && year) parts.push(`${seasonName} ${year} г.`);
    else if (year) parts.push(`${year} г.`);
    if (parts.length) metaInfoRows.push({ icon: '🌍', text: parts.join(', ') });
  }

  // Episodes + duration
  {
    const epRel = episodesReleased;
    const epTot = episodesTotal;
    let epText = '';
    if (epRel != null && epTot != null && epTot > 0) epText = `${epRel} из ${epTot} эп.`;
    else if (epRel != null) epText = `${epRel} эп.`;
    else if (epTot != null) epText = `${epTot} эп.`;
    if (duration && duration > 0) epText += epText ? ` по ~${duration} мин.` : `~${duration} мин.`;
    if (epText) metaInfoRows.push({ icon: '🎬', text: epText });
  }

  // Category + status
  {
    const parts: string[] = [];
    if (categoryName) parts.push(categoryName);
    if (statusName) parts.push(statusName);
    if (parts.length) metaInfoRows.push({ icon: '📺', text: parts.join(', ') });
  }

  // Studio + author + director
  {
    const parts: string[] = [];
    if (studio) parts.push(`Студия ${studio}`);
    if (author) parts.push(`автор ${author}`);
    if (director) parts.push(`режиссёр ${director}`);
    if (parts.length) metaInfoRows.push({ icon: '🎨', text: parts.join(', ') });
  }

  // Source
  if (source) metaInfoRows.push({ icon: '📖', text: `Источник: ${source}` });

  // Genres
  if (genres) metaInfoRows.push({ icon: '🏷️', text: genres });

  const section = document.createElement('section');
  section.className = 'release-page';

  let ratingChipHtml = '';
  if (hasRating) {
    const displayGrade = grade != null && grade > 0 ? grade.toFixed(2) : '—';
    const hue = grade != null && grade > 0 ? ratingHue(grade) : 0;
    const bg = grade != null && grade > 0 ? `hsl(${hue}, 95%, 52%)` : 'rgba(255,255,255,0.12)';
    const textColor = grade != null && grade > 0 && hue >= 28 ? '#0b0b0b' : '#f5f5f5';
    const votesLabel = formatVoteCount(voteCount);
    ratingChipHtml = `<span class="release-page__rating" style="background:${bg};color:${textColor}">${displayGrade} ${iconStar(14, true)}<span class="release-page__rating-votes">${escapeHtml(votesLabel)}</span></span>`;
  }

  // Age badge: color-code restricted ratings
  const ageBadgeClass = ageIsRestricted ? 'release-page__age release-page__age--restricted' : 'release-page__age';
  const ageBadgeHtml = `<span class="${ageBadgeClass}">${escapeHtml(ageRateText)}</span>`;

  // Aired / release date display
  let airedText = '';
  if (airedOnDate && airedOnDate > 0) {
    const d = new Date(airedOnDate * 1000);
    airedText = `${d.getDate()} ${['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'нояб.', 'дек.'][d.getMonth()]} ${d.getFullYear()} г.`;
  } else if (releaseDate) {
    airedText = releaseDate;
  }

  // Play button text (blocked / coming soon / play)
  let playBtnText = 'Смотреть';
  let playBtnDisabled = false;
  if (isViewBlocked) {
    playBtnText = 'Недоступно';
    playBtnDisabled = true;
  } else if (!episodesReleased || episodesReleased <= 0) {
    playBtnText = airedText ? `Выход: ${airedText}` : 'Скоро';
    playBtnDisabled = true;
  }

  // Description: sanitize with rich formatting preserved, check length for truncation
  const descClean = stripHtmlToText(desc);
  const descHtml = sanitizeRichHtml(desc);
  const descNeedsTruncate = descClean.length > 300;
  // Note: sanitize with rich formatting (font colors, bold, line breaks)
  const noteHtml = sanitizeRichHtml(note);

  // Favorite button icon (bookmark)
  const favIconSvg = (filled: boolean) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>`;

  section.innerHTML = `
    <div class="release-page__head">
      <div class="release-page__left">
        <div class="release-page__poster" data-poster-wrap>
          ${posterUrl ? `<img src="${escapeHtml(posterUrl)}" alt="${escapeHtml(title)}" data-lightbox />` : '<div class="release-page__poster-placeholder"></div>'}
        </div>
        <div class="release-page__play-row">
          <button type="button" class="release-page__btn release-page__btn--play${playBtnDisabled ? ' release-page__btn--disabled' : ''}" data-watch-btn ${playBtnDisabled ? 'disabled' : ''}>
            ${playBtnDisabled ? '' : `<span class="release-page__btn-icon">${iconPlay(20)}</span>`}
            <span>${escapeHtml(playBtnText)}</span>
          </button>
        </div>
        <div class="release-page__status-selector" data-status-selector></div>
      </div>
      <div class="release-page__info">
        <div class="release-page__title-row">
          <h1 class="release-page__title">${escapeHtml(titleRu || title)}</h1>
        </div>
        ${titleOriginal && titleOriginal !== titleRu
          ? `<p class="release-page__title-en">${escapeHtml(titleOriginal)} ${ageBadgeHtml}</p>`
          : `<p class="release-page__title-en">${ageBadgeHtml}</p>`}
        <div class="release-page__meta-row">
          ${ratingChipHtml}
          <button type="button" class="release-page__fav-btn${isFavorite ? ' release-page__fav-btn--active' : ''}" data-fav-btn title="${isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}">
            <span data-fav-icon>${favIconSvg(isFavorite)}</span>
            <span data-fav-count>${favoritesCount > 0 ? formatVoteCount(favoritesCount) : ''}</span>
          </button>
        </div>
        ${noteHtml ? `<div class="release-page__note">${noteHtml}</div>` : ''}
        ${descClean ? `
          <div class="release-page__desc${descNeedsTruncate ? ' release-page__desc--collapsed' : ''}" data-desc>
            ${descHtml}
          </div>
          ${descNeedsTruncate ? `<button type="button" class="release-page__desc-toggle" data-desc-toggle>Показать полностью</button>` : ''}
        ` : ''}
        ${metaInfoRows.length > 0 ? `
          <div class="release-page__meta-info">
            ${metaInfoRows.map(row => `
              <div class="release-page__meta-info-row">
                <span class="release-page__meta-info-icon">${row.icon}</span>
                <span class="release-page__meta-info-text">${escapeHtml(row.text)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // ── Interactive bindings ──
  const posterWrap = section.querySelector('[data-poster-wrap]');
  if (posterWrap && posterUrl) {
    const img = posterWrap.querySelector('img[data-lightbox]');
    if (img) {
      posterWrap.classList.add('release-page__poster--clickable');
      posterWrap.addEventListener('click', () => openImageLightbox(posterUrl));
    }
  }

  // Description expand/collapse with smooth animation
  const descEl = section.querySelector('[data-desc]') as HTMLElement | null;
  const descToggle = section.querySelector('[data-desc-toggle]') as HTMLElement | null;
  if (descEl && descToggle) {
    // Set initial max-height for collapsed state
    if (descEl.classList.contains('release-page__desc--collapsed')) {
      descEl.style.maxHeight = '6.6em';
    }
    descToggle.addEventListener('click', () => {
      const isCollapsed = descEl.classList.contains('release-page__desc--collapsed');
      if (isCollapsed) {
        // Expand: measure full height, set it, then remove class
        descEl.style.maxHeight = descEl.scrollHeight + 'px';
        descEl.classList.remove('release-page__desc--collapsed');
        descToggle.textContent = 'Свернуть';
        // After transition completes, remove max-height limit
        const onEnd = () => {
          descEl.style.maxHeight = 'none';
          descEl.removeEventListener('transitionend', onEnd);
        };
        descEl.addEventListener('transitionend', onEnd);
      } else {
        // Collapse: set current height explicitly first, then reduce
        descEl.style.maxHeight = descEl.scrollHeight + 'px';
        // Force reflow
        void descEl.offsetHeight;
        descEl.style.maxHeight = '6.6em';
        descEl.classList.add('release-page__desc--collapsed');
        descToggle.textContent = 'Показать полностью';
      }
    });
  }

  const watchBtn = section.querySelector('[data-watch-btn]') as HTMLButtonElement | null;
  if (watchBtn && releaseId != null && !playBtnDisabled && window.electron?.openPlayerWindow) {
    watchBtn.addEventListener('click', () => {
      openWatchModal({
        releaseId,
        releaseTitle: titleRu || title || titleOriginal || 'Без названия',
        onOpenPlayer: (url) => window.electron?.openPlayerWindow?.(url),
      });
    });
  } else if (watchBtn && releaseId != null && !playBtnDisabled) {
    watchBtn.addEventListener('click', () => {
      window.open(`https://anixart.tv/release/${releaseId}`, '_blank', 'noopener,noreferrer');
    });
  }

  // ── Favorite button (bookmark icon in meta row) ──
  const favBtn = section.querySelector('[data-fav-btn]') as HTMLButtonElement | null;
  if (favBtn && releaseId != null) {
    let currentFavorite = isFavorite;
    let currentFavCount = favoritesCount;
    favBtn.addEventListener('click', () => {
      if (!window.anixApi) return;
      (currentFavorite ? window.anixApi.release.removeFavorite(releaseId!) : window.anixApi.release.addFavorite(releaseId!)).then(() => {
        currentFavorite = !currentFavorite;
        currentFavCount += currentFavorite ? 1 : -1;
        if (currentFavCount < 0) currentFavCount = 0;
        favBtn.classList.toggle('release-page__fav-btn--active', currentFavorite);
        favBtn.title = currentFavorite ? 'Убрать из избранного' : 'Добавить в избранное';
        const iconEl = favBtn.querySelector('[data-fav-icon]');
        if (iconEl) iconEl.innerHTML = favIconSvg(currentFavorite);
        const countEl = favBtn.querySelector('[data-fav-count]');
        if (countEl) countEl.textContent = currentFavCount > 0 ? formatVoteCount(currentFavCount) : '';
      });
    });
  }

  // ── Status selector (custom dropdown under Watch button) ──
  const statusSlot = section.querySelector('[data-status-selector]') as HTMLElement;
  if (statusSlot && releaseId != null) {
    let currentStatus: ListStatusId | null = numToStatusId(profileListStatus);
    const selectOptions = [
      { value: '', label: 'Не в списке' },
      ...LIST_STATUSES.map(s => ({ value: s.id, label: s.label })),
    ];
    const selectEl = renderSelect({
      placeholder: 'Добавить в список',
      options: selectOptions,
      value: currentStatus ?? '',
      onChange(value) {
        if (window.anixApi && value) {
          window.anixApi.release.setListStatus(releaseId!, value as unknown as number).then(() => {
            currentStatus = value as ListStatusId;
          });
        }
      },
    });
    statusSlot.appendChild(selectEl);
  }

  // Блок «Рейтинг»: средний балл, распределение голосов 1–5, статистика по статусам просмотра
  const totalList = watchingCount + planCount + completedCount + holdOnCount + droppedCount;
  const hasRatingBlock = voteCount > 0 || totalList > 0;
  if (hasRatingBlock) {
    const ratingSection = document.createElement('div');
    ratingSection.className = 'release-page__section release-page__rating-block';
    const votePct = (n: number) => (voteCount > 0 ? (n / voteCount) * 100 : 0);
    const listPct = (n: number) => (totalList > 0 ? (n / totalList) * 100 : 0);
    const formatNum = (n: number) => n.toLocaleString('ru-RU');
    ratingSection.innerHTML = `
      <h2 class="release-page__section-title">Рейтинг</h2>
      <div class="release-page__rating-content">
        <div class="release-page__rating-main">
          <div class="release-page__rating-value">${grade != null && hasRating ? grade.toFixed(2) : '—'}</div>
          ${voteCount > 0 ? `<div class="release-page__rating-votes-label">${formatNum(voteCount)} голосов</div>` : ''}
        </div>
        <div class="release-page__rating-bars" data-rating-bars>
          ${[5, 4, 3, 2, 1].map((star) => {
            const v = star === 5 ? vote5 : star === 4 ? vote4 : star === 3 ? vote3 : star === 2 ? vote2 : vote1;
            const pct = votePct(v);
            return `<div class="release-page__rating-bar-row"><span class="release-page__rating-bar-label">${star}</span><div class="release-page__rating-bar-track"><div class="release-page__rating-bar-fill" style="width:${pct}%"></div></div></div>`;
          }).join('')}
        </div>
      </div>
      ${totalList > 0 ? `
      <div class="release-page__list-stats">
        <div class="release-page__list-stats-bar" data-list-stats-bar>
          <div class="release-page__list-stats-seg release-page__list-stats-seg--watching" style="width:${listPct(watchingCount)}%" title="Смотрю: ${formatNum(watchingCount)}"></div>
          <div class="release-page__list-stats-seg release-page__list-stats-seg--planned" style="width:${listPct(planCount)}%" title="В планах: ${formatNum(planCount)}"></div>
          <div class="release-page__list-stats-seg release-page__list-stats-seg--completed" style="width:${listPct(completedCount)}%" title="Просмотрено: ${formatNum(completedCount)}"></div>
          <div class="release-page__list-stats-seg release-page__list-stats-seg--on_hold" style="width:${listPct(holdOnCount)}%" title="Отложено: ${formatNum(holdOnCount)}"></div>
          <div class="release-page__list-stats-seg release-page__list-stats-seg--dropped" style="width:${listPct(droppedCount)}%" title="Брошено: ${formatNum(droppedCount)}"></div>
        </div>
        <div class="release-page__list-stats-legend">
          <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--watching"><i></i> Смотрю — ${formatNum(watchingCount)}</span>
          <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--planned"><i></i> В планах — ${formatNum(planCount)}</span>
          <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--completed"><i></i> Просмотрено — ${formatNum(completedCount)}</span>
          <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--on_hold"><i></i> Отложено — ${formatNum(holdOnCount)}</span>
          <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--dropped"><i></i> Брошено — ${formatNum(droppedCount)}</span>
        </div>
      </div>
      ` : ''}
    `;
    section.appendChild(ratingSection);
  }

  if (screenshots.length > 0) {
    const screenshotsEl = document.createElement('div');
    screenshotsEl.className = 'release-page__section';
    screenshotsEl.innerHTML = `
      <h2 class="release-page__section-title">Скриншоты</h2>
      <div class="release-page__screenshots" data-screenshots></div>
    `;
    const list = screenshotsEl.querySelector('[data-screenshots]') as HTMLElement;
    screenshots.slice(0, 8).forEach((url) => {
      const fullUrl = url.startsWith('http') ? url : `https://s.anixmirai.com/screenshots/${url}.jpg`;
      const img = document.createElement('img');
      img.src = fullUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.dataset.lightbox = '1';
      img.style.cursor = 'pointer';
      img.addEventListener('click', () => openImageLightbox(fullUrl));
      list?.appendChild(img);
    });
    section.appendChild(screenshotsEl);
  }

  if (related?.id && (relatedReleases.length > 0 || (related.release_count ?? 0) > 0)) {
    const relatedSection = document.createElement('div');
    relatedSection.className = 'release-page__section';
    const franchiseName = related.name_ru || 'Франшиза';
    relatedSection.innerHTML = `
      <h2 class="release-page__section-title">
        <a href="#" class="release-page__section-link" data-related-link>${escapeHtml(franchiseName)}</a>
        ${relatedReleases.length > 0 ? ` · Связанные релизы` : ''}
      </h2>
      <div class="release-page__grid release-page__grid--related" data-related-grid></div>
    `;
    const link = relatedSection.querySelector('[data-related-link]');
    if (link && related.id) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(`/release/${related.id}/related`);
      });
    }
    const grid = relatedSection.querySelector('[data-related-grid]') as HTMLElement;
    relatedReleases.slice(0, 12).forEach((rel) => {
      const cardData = mapReleaseToCardData(rel as Record<string, unknown>);
      const card = layout === 'mini' ? renderReleaseCardVertical(cardData) : renderReleaseCardHorizontal(cardData);
      grid?.appendChild(card);
    });
    if (layout === 'mini' && grid) grid.classList.add('release-cards-grid');
    section.appendChild(relatedSection);
  }

  if (recommended.length > 0) {
    const recSection = document.createElement('div');
    recSection.className = 'release-page__section';
    recSection.innerHTML = `
      <h2 class="release-page__section-title">Рекомендации</h2>
      <div class="release-page__grid release-page__grid--recommended" data-recommended-grid></div>
    `;
    const grid = recSection.querySelector('[data-recommended-grid]') as HTMLElement;
    recommended.forEach((rel) => {
      const cardData = mapReleaseToCardData(rel as Record<string, unknown>);
      const card = layout === 'mini' ? renderReleaseCardVertical(cardData) : renderReleaseCardHorizontal(cardData);
      grid?.appendChild(card);
    });
    if (layout === 'mini' && grid) grid.classList.add('release-cards-grid');
    section.appendChild(recSection);
  }

  if (comments.length > 0) {
    const commentsSection = document.createElement('div');
    commentsSection.className = 'release-page__section';
    commentsSection.id = 'comments';
    commentsSection.innerHTML = `
      <h2 class="release-page__section-title">Комментарии (${comments.length})</h2>
      <div class="release-page__comments" data-comments></div>
    `;
    const list = commentsSection.querySelector('[data-comments]') as HTMLElement;
    comments.slice(0, 20).forEach((c) => {
      const profile = c.profile ?? {};
      const nickname = (profile as { nickname?: string }).nickname ?? 'Пользователь';
      const avatar = (profile as { avatar?: string }).avatar ?? '';
      const msg = escapeHtml(c.message ?? '').replace(/\n/g, '<br>');
      const time = c.timestamp ? formatCommentTime(c.timestamp) : '';
      const item = document.createElement('div');
      item.className = 'release-page__comment';
      item.innerHTML = `
        <div class="release-page__comment-avatar" style="${avatar ? `background-image:url(${escapeHtml(avatar)})` : ''}"></div>
        <div class="release-page__comment-body">
          <span class="release-page__comment-author">${escapeHtml(nickname)}</span>
          ${time ? `<span class="release-page__comment-time">${escapeHtml(time)}</span>` : ''}
          <div class="release-page__comment-text">${msg}</div>
        </div>
      `;
      list?.appendChild(item);
    });
    section.appendChild(commentsSection);
  }

  return section;
}

function statusIdToNum(id: ListStatusId): number {
  const map: Record<ListStatusId, number> = { watching: 1, planned: 2, completed: 3, dropped: 5, on_hold: 4 };
  return map[id] ?? 0;
}

function numToStatusId(n: number | null | undefined): ListStatusId | null {
  if (n == null) return null;
  const map: Record<number, ListStatusId> = { 1: 'watching', 2: 'planned', 3: 'completed', 4: 'on_hold', 5: 'dropped' };
  return map[n] ?? null;
}
