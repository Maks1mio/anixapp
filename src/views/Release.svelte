<script lang="ts">
  import ReleaseCardV from "../components/ReleaseCardV.svelte";
  import { onMount } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { buildPosterUrl } from '../utils/posterUrl';
  import type { ReleaseCardData } from '../types/release';

  interface Props {
    id: number;
  }

  let { id }: Props = $props();

  const LIST_STATUSES = [
    { id: 'watching',  label: 'Смотрю' },
    { id: 'planned',   label: 'В планах' },
    { id: 'completed', label: 'Просмотрено' },
    { id: 'dropped',   label: 'Брошено' },
    { id: 'on_hold',   label: 'Отложено' },
  ] as const;

  type ListStatusId = (typeof LIST_STATUSES)[number]['id'];

  function getAgeRateText(rate: number | string | undefined): string {
    const n = typeof rate === 'string' ? parseInt(rate, 10) : rate;
    switch (n) {
      case 2: return '6+';
      case 3: return '12+';
      case 4: return '16+';
      case 5: return '18+';
      default: return '0+';
    }
  }

  function getSeasonName(season: number | null | undefined): string {
    switch (season) {
      case 1: return 'Зима';
      case 2: return 'Весна';
      case 3: return 'Лето';
      case 4: return 'Осень';
      default: return '';
    }
  }

  function stripHtmlToText(html: string): string {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html.replace(/<br\s*\/?>/gi, '\n');
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  function sanitizeRichHtml(raw: string): string {
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

  function formatVoteCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function formatCommentTime(ts: number): string {
    const date = new Date(ts * 1000);
    const diff = Date.now() - date.getTime();
    if (diff < 60_000) return 'только что';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} мин. назад`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} ч. назад`;
    if (diff < 172800_000) return 'вчера';
    const months = 'янв. февр. мар. апр. май июн. июл. авг. сен. окт. нояб. дек.'.split(' ');
    return `${date.getDate()} ${months[date.getMonth()]}`;
  }

  function numToStatusId(n: number | null | undefined): ListStatusId | null {
    if (n == null) return null;
    const map: Record<number, ListStatusId> = { 1: 'watching', 2: 'planned', 3: 'completed', 4: 'on_hold', 5: 'dropped' };
    return map[n] ?? null;
  }

  function ratingHue(grade: number): number {
    const clamped = Math.max(0, Math.min(5, grade));
    if (clamped <= 2.5) return Math.round((clamped / 2.5) * 30);
    return Math.round(30 + ((clamped - 2.5) / 2.5) * 90);
  }

  function openImageLightbox(imageUrl: string) {
    const overlay = document.createElement('div');
    overlay.className = 'release-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `<div class="release-lightbox__backdrop"></div><div class="release-lightbox__content"><img src="${imageUrl}" alt="" /></div>`;
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

  // State
  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg = $state('');
  let release = $state<Record<string, unknown> | null>(null);

  // Derived fields
  let posterUrl = $derived.by(() => {
    if (!release) return '';
    const r = release;
    const posterRaw =
      typeof r.poster === 'string' ? r.poster as string :
      (r.poster as any)?.original?.url ?? (r.poster as any)?.medium?.url ?? (r.poster as any)?.small?.url;
    return buildPosterUrl(posterRaw ?? (typeof r.image === 'string' ? r.image as string : '')) || '';
  });

  let titleRu = $derived((release?.title_ru ?? '') as string);
  let titleOriginal = $derived((release?.title_original ?? '') as string);
  let title = $derived(titleRu || titleOriginal || 'Без названия');
  let desc = $derived((release?.description ?? '') as string);
  let descClean = $derived(desc ? stripHtmlToText(desc) : '');
  let descHtml = $derived(desc ? sanitizeRichHtml(desc) : '');
  let descNeedsTruncate = $derived(descClean.length > 300);
  let noteHtml = $derived(release?.note ? sanitizeRichHtml(release.note as string) : '');

  let gradeRaw = $derived(release?.grade ?? release?.rating);
  let grade = $derived(typeof gradeRaw === 'number' && !Number.isNaN(gradeRaw) ? gradeRaw : null);
  let voteCount = $derived(typeof release?.vote_count === 'number' ? release.vote_count as number : 0);
  let hasRating = $derived(voteCount > 0 || (grade != null && grade > 0));

  let year = $derived(release?.year != null ? String(release.year) : '');
  let country = $derived((release?.country ?? '') as string);
  let episodesReleased = $derived(release?.episodes_released as number | null | undefined);
  let episodesTotal = $derived(release?.episodes_total as number | null | undefined);
  let statusName = $derived((release?.status as { name?: string } | undefined)?.name ?? '');
  let studio = $derived((release?.studio ?? '') as string);
  let source = $derived((release?.source ?? '') as string);
  let genres = $derived((release?.genres ?? '') as string);
  let categoryName = $derived((release?.category as { name?: string } | undefined)?.name ?? '');
  let isFavorite = $state(false);
  let favoritesCount = $state(0);
  let isAdult = $derived(!!(release?.is_adult));
  let ageRatingRaw = $derived(release?.age_rating as number | string | undefined);
  let ageRateText = $derived(isAdult ? '18+' : getAgeRateText(ageRatingRaw));
  let ageIsRestricted = $derived(ageRateText === '16+' || ageRateText === '18+');
  let duration = $derived(release?.duration as number | null | undefined);
  let season = $derived(release?.season as number | null | undefined);
  let seasonName = $derived(getSeasonName(season));
  let releaseDate = $derived((release?.release_date ?? '') as string);
  let airedOnDate = $derived(release?.aired_on_date as number | null | undefined);
  let isViewBlocked = $derived(!!(release?.is_view_blocked));
  let releaseId = $derived(release?.id as number | undefined);
  let profileListStatus = $derived(release?.profile_list_status as number | null | undefined);
  let currentStatus = $state<ListStatusId | null>(null);

  let author = $derived((release?.author ?? '') as string);
  let director = $derived((release?.director ?? '') as string);

  let vote1 = $derived((release?.vote_1_count ?? 0) as number);
  let vote2 = $derived((release?.vote_2_count ?? 0) as number);
  let vote3 = $derived((release?.vote_3_count ?? 0) as number);
  let vote4 = $derived((release?.vote_4_count ?? 0) as number);
  let vote5 = $derived((release?.vote_5_count ?? 0) as number);
  let watchingCount = $derived((release?.watching_count ?? 0) as number);
  let planCount = $derived((release?.plan_count ?? 0) as number);
  let completedCount = $derived((release?.completed_count ?? 0) as number);
  let holdOnCount = $derived((release?.hold_on_count ?? 0) as number);
  let droppedCount = $derived((release?.dropped_count ?? 0) as number);
  let totalList = $derived(watchingCount + planCount + completedCount + holdOnCount + droppedCount);

  let screenshots = $derived.by(() => {
    if (!release) return [] as string[];
    const si = release.screenshot_images as string[] | undefined;
    if (si) return si;
    const s = release.screenshots as string[] | undefined;
    return (s ?? []).map((u: string) => u.startsWith('http') ? u : `https://s.anixmirai.com/screenshots/${u}.jpg`);
  });

  let related = $derived(release?.related as { id?: number; name_ru?: string; release_count?: number } | null | undefined);
  let relatedReleases = $derived((release?.related_releases ?? []) as Record<string, unknown>[]);
  let recommended = $derived((release?.recommended_releases ?? []) as Record<string, unknown>[]);
  let comments = $derived((release?.comments ?? []) as Array<{ id?: number; profile?: { nickname?: string; avatar?: string }; message?: string; timestamp?: number }>);

  let airedText = $derived.by(() => {
    if (airedOnDate && airedOnDate > 0) {
      const d = new Date(airedOnDate * 1000);
      const months = ['янв.','февр.','мар.','апр.','мая','июн.','июл.','авг.','сен.','окт.','нояб.','дек.'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} г.`;
    }
    return releaseDate;
  });

  let playBtnText = $derived.by(() => {
    if (isViewBlocked) return 'Недоступно';
    if (!episodesReleased || episodesReleased <= 0) return airedText ? `Выход: ${airedText}` : 'Скоро';
    return 'Смотреть';
  });
  let playBtnDisabled = $derived(isViewBlocked || !episodesReleased || episodesReleased <= 0);

  let descCollapsed = $state(true);

  function toggleDesc() {
    descCollapsed = !descCollapsed;
  }

  async function toggleFavorite() {
    if (!window.anixApi || !releaseId) return;
    try {
      if (isFavorite) {
        await window.anixApi.release.removeFavorite(releaseId);
      } else {
        await window.anixApi.release.addFavorite(releaseId);
      }
      isFavorite = !isFavorite;
      favoritesCount = Math.max(0, favoritesCount + (isFavorite ? 1 : -1));
    } catch { /* ignore */ }
  }

  async function handleWatch() {
    if (!releaseId) return;
    if (window.electron?.openPlayerWindow) {
      const { openWatchModal } = await import('../components/watch-modal');
      openWatchModal({
        releaseId,
        releaseTitle: titleRu || title || titleOriginal || 'Без названия',
        onOpenPlayer: (url: string) => window.electron?.openPlayerWindow?.(url),
      });
    } else {
      window.open(`https://anixart.tv/release/${releaseId}`, '_blank', 'noopener,noreferrer');
    }
  }

  async function setStatus(value: string) {
    if (!window.anixApi || !releaseId) return;
    if (!value) {
      if (currentStatus) {
        await window.anixApi.release.clearListStatus(releaseId, currentStatus as unknown as number).catch(() => {});
        currentStatus = null;
      }
      return;
    }
    await window.anixApi.release.setListStatus(releaseId, value as unknown as number).catch(() => {});
    currentStatus = value as ListStatusId;
  }

  function mapCardData(raw: Record<string, unknown>): ReleaseCardData {
    const p = raw.poster as Record<string, { url?: string }> | undefined;
    const posterRaw =
      p?.original?.url ?? p?.medium?.url ?? p?.small?.url
      ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
      ?? (typeof raw.image === 'string' ? raw.image : undefined);
    const posterStr = typeof posterRaw === 'string' ? posterRaw : undefined;
    const poster = posterStr ? buildPosterUrl(posterStr) || undefined : undefined;
    return {
      id: raw.id as number | undefined,
      titleRu: (raw.title_ru ?? raw.titleRu) as string | undefined,
      titleEn: (raw.title_original ?? raw.titleEn) as string | undefined,
      poster: poster || undefined,
      rating: typeof raw.grade === 'number' ? raw.grade : undefined,
      isFavorite: !!(raw.is_favorite),
    };
  }


  onMount(async () => {
    if (!window.anixApi) {
      errorMsg = 'API недоступно (только в Electron).';
      loadState = 'error';
      return;
    }

    try {
      const data = await window.anixApi.release.info(id, true) as any;
      const raw = data?.release ?? data;
      if (!raw || (raw.id == null && !raw.title_ru && !raw.title_original)) {
        errorMsg = 'Релиз не найден.';
        loadState = 'error';
        return;
      }
      release = raw as Record<string, unknown>;
      isFavorite = !!(raw.is_favorite);
      favoritesCount = (raw.favorites_count ?? 0) as number;
      currentStatus = numToStatusId(raw.profile_list_status as number | null | undefined);
      loadState = 'ready';

      // Discord RPC
      const posterVal = buildPosterUrl(
        typeof raw.poster === 'string' ? raw.poster :
        (raw.poster as any)?.original?.url ?? (raw.poster as any)?.medium?.url ?? (typeof raw.image === 'string' ? raw.image : '')
      );
      window.dispatchEvent(new CustomEvent('discord:releaseView', {
        detail: { title: raw.title_ru || raw.title_original || '', posterUrl: posterVal || undefined },
      }));
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    }
  });
</script>

<div class="view view-release">
  {#if loadState === 'loading'}
    <div class="release-loading">Загрузка…</div>
  {:else if loadState === 'error'}
    <div class="release-loading">{errorMsg}</div>
  {:else if release}
    <section class="release-page">
      <!-- Head -->
      <div class="release-page__head">
        <!-- Left column: poster + play + status -->
        <div class="release-page__left">
          <div
            class="release-page__poster{posterUrl ? ' release-page__poster--clickable' : ''}"
            role="button"
            tabindex={posterUrl ? 0 : -1}
            onclick={() => posterUrl && openImageLightbox(posterUrl)}
            onkeydown={(e) => e.key === 'Enter' && posterUrl && openImageLightbox(posterUrl)}
          >
            {#if posterUrl}
              <img src={posterUrl} alt={title} />
            {:else}
              <div class="release-page__poster-placeholder"></div>
            {/if}
          </div>

          <div class="release-page__play-row">
            <button
              type="button"
              class="release-page__btn release-page__btn--play{playBtnDisabled ? ' release-page__btn--disabled' : ''}"
              disabled={playBtnDisabled}
              onclick={handleWatch}
            >
              {#if !playBtnDisabled}
                <span class="release-page__btn-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                </span>
              {/if}
              <span>{playBtnText}</span>
            </button>
          </div>

          <!-- Status selector -->
          <div class="release-page__status-selector">
            <select
              class="custom-select__trigger"
              value={currentStatus ?? ''}
              onchange={(e) => setStatus((e.target as HTMLSelectElement).value)}
            >
              <option value="">Не в списке</option>
              {#each LIST_STATUSES as s}
                <option value={s.id}>{s.label}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- Right column: info -->
        <div class="release-page__info">
          <div class="release-page__title-row">
            <h1 class="release-page__title">{titleRu || title}</h1>
          </div>

          {#if titleOriginal && titleOriginal !== titleRu}
            <p class="release-page__title-en">
              {titleOriginal}
              <span class="{ageIsRestricted ? 'release-page__age release-page__age--restricted' : 'release-page__age'}">{ageRateText}</span>
            </p>
          {:else}
            <p class="release-page__title-en">
              <span class="{ageIsRestricted ? 'release-page__age release-page__age--restricted' : 'release-page__age'}">{ageRateText}</span>
            </p>
          {/if}

          <!-- Rating + favorite -->
          <div class="release-page__meta-row">
            {#if hasRating && grade != null}
              {@const hue = grade > 0 ? ratingHue(grade) : 0}
              {@const bg = grade > 0 ? `hsl(${hue}, 95%, 52%)` : 'rgba(255,255,255,0.12)'}
              {@const textColor = grade > 0 && hue >= 28 ? '#0b0b0b' : '#f5f5f5'}
              <span class="release-page__rating" style="background:{bg};color:{textColor}">
                {grade.toFixed(2)}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
                <span class="release-page__rating-votes">{formatVoteCount(voteCount)}</span>
              </span>
            {/if}

            <button
              type="button"
              class="release-page__fav-btn{isFavorite ? ' release-page__fav-btn--active' : ''}"
              title={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              onclick={toggleFavorite}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
              </svg>
              {#if favoritesCount > 0}
                <span>{formatVoteCount(favoritesCount)}</span>
              {/if}
            </button>
          </div>

          {#if noteHtml}
            <div class="release-page__note">{@html noteHtml}</div>
          {/if}

          {#if descClean}
            <div class="release-page__desc{descCollapsed && descNeedsTruncate ? ' release-page__desc--collapsed' : ''}" style={descCollapsed && descNeedsTruncate ? 'max-height:6.6em;overflow:hidden' : ''}>
              {@html descHtml}
            </div>
            {#if descNeedsTruncate}
              <button type="button" class="release-page__desc-toggle" onclick={toggleDesc}>
                {descCollapsed ? 'Показать полностью' : 'Свернуть'}
              </button>
            {/if}
          {/if}

          <!-- Meta info rows -->
          <div class="release-page__meta-info">
            {#if country || seasonName || year}
              <div class="release-page__meta-info-row">
                <span class="release-page__meta-info-icon">🌍</span>
                <span class="release-page__meta-info-text">
                  {[country, seasonName && year ? `${seasonName} ${year} г.` : year ? `${year} г.` : ''].filter(Boolean).join(', ')}
                </span>
              </div>
            {/if}
            {#if episodesReleased != null || episodesTotal != null || duration}
              {@const epText = (() => {
                let t = '';
                if (episodesReleased != null && episodesTotal != null && episodesTotal > 0) t = `${episodesReleased} из ${episodesTotal} эп.`;
                else if (episodesReleased != null) t = `${episodesReleased} эп.`;
                else if (episodesTotal != null) t = `${episodesTotal} эп.`;
                if (duration && duration > 0) t += t ? ` по ~${duration} мин.` : `~${duration} мин.`;
                return t;
              })()}
              {#if epText}
                <div class="release-page__meta-info-row">
                  <span class="release-page__meta-info-icon">🎬</span>
                  <span class="release-page__meta-info-text">{epText}</span>
                </div>
              {/if}
            {/if}
            {#if categoryName || statusName}
              <div class="release-page__meta-info-row">
                <span class="release-page__meta-info-icon">📺</span>
                <span class="release-page__meta-info-text">{[categoryName, statusName].filter(Boolean).join(', ')}</span>
              </div>
            {/if}
            {#if studio || author || director}
              <div class="release-page__meta-info-row">
                <span class="release-page__meta-info-icon">🎨</span>
                <span class="release-page__meta-info-text">
                  {[studio ? `Студия ${studio}` : '', author ? `автор ${author}` : '', director ? `режиссёр ${director}` : ''].filter(Boolean).join(', ')}
                </span>
              </div>
            {/if}
            {#if source}
              <div class="release-page__meta-info-row">
                <span class="release-page__meta-info-icon">📖</span>
                <span class="release-page__meta-info-text">Источник: {source}</span>
              </div>
            {/if}
            {#if genres}
              <div class="release-page__meta-info-row">
                <span class="release-page__meta-info-icon">🏷️</span>
                <span class="release-page__meta-info-text">{genres}</span>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Rating block -->
      {#if voteCount > 0 || totalList > 0}
        <div class="release-page__section release-page__rating-block">
          <h2 class="release-page__section-title">Рейтинг</h2>
          <div class="release-page__rating-content">
            <div class="release-page__rating-main">
              <div class="release-page__rating-value">{grade != null && hasRating ? grade.toFixed(2) : '—'}</div>
              {#if voteCount > 0}
                <div class="release-page__rating-votes-label">{voteCount.toLocaleString('ru-RU')} голосов</div>
              {/if}
            </div>
            <div class="release-page__rating-bars">
              {#each [5, 4, 3, 2, 1] as star}
                {@const v = star === 5 ? vote5 : star === 4 ? vote4 : star === 3 ? vote3 : star === 2 ? vote2 : vote1}
                {@const pct = voteCount > 0 ? (v / voteCount) * 100 : 0}
                <div class="release-page__rating-bar-row">
                  <span class="release-page__rating-bar-label">{star}</span>
                  <div class="release-page__rating-bar-track">
                    <div class="release-page__rating-bar-fill" style="width:{pct}%"></div>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          {#if totalList > 0}
            {@const lp = (n: number) => totalList > 0 ? (n / totalList) * 100 : 0}
            <div class="release-page__list-stats">
              <div class="release-page__list-stats-bar">
                <div class="release-page__list-stats-seg release-page__list-stats-seg--watching" style="width:{lp(watchingCount)}%" title="Смотрю: {watchingCount.toLocaleString('ru-RU')}"></div>
                <div class="release-page__list-stats-seg release-page__list-stats-seg--planned"   style="width:{lp(planCount)}%"     title="В планах: {planCount.toLocaleString('ru-RU')}"></div>
                <div class="release-page__list-stats-seg release-page__list-stats-seg--completed" style="width:{lp(completedCount)}%" title="Просмотрено: {completedCount.toLocaleString('ru-RU')}"></div>
                <div class="release-page__list-stats-seg release-page__list-stats-seg--on_hold"   style="width:{lp(holdOnCount)}%"   title="Отложено: {holdOnCount.toLocaleString('ru-RU')}"></div>
                <div class="release-page__list-stats-seg release-page__list-stats-seg--dropped"   style="width:{lp(droppedCount)}%"  title="Брошено: {droppedCount.toLocaleString('ru-RU')}"></div>
              </div>
              <div class="release-page__list-stats-legend">
                <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--watching"><i></i> Смотрю — {watchingCount.toLocaleString('ru-RU')}</span>
                <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--planned"><i></i> В планах — {planCount.toLocaleString('ru-RU')}</span>
                <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--completed"><i></i> Просмотрено — {completedCount.toLocaleString('ru-RU')}</span>
                <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--on_hold"><i></i> Отложено — {holdOnCount.toLocaleString('ru-RU')}</span>
                <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--dropped"><i></i> Брошено — {droppedCount.toLocaleString('ru-RU')}</span>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Screenshots -->
      {#if screenshots.length > 0}
        <div class="release-page__section">
          <h2 class="release-page__section-title">Скриншоты</h2>
          <div class="release-page__screenshots">
            {#each screenshots.slice(0, 8) as url}
              {@const fullUrl = url.startsWith('http') ? url : `https://s.anixmirai.com/screenshots/${url}.jpg`}
              <img
                src={fullUrl}
                alt=""
                loading="lazy"
                style="cursor:pointer"
                onclick={() => openImageLightbox(fullUrl)}
              />
            {/each}
          </div>
        </div>
      {/if}

      <!-- Related releases -->
      {#if related?.id && (relatedReleases.length > 0 || (related.release_count ?? 0) > 0)}
        <div class="release-page__section">
          <h2 class="release-page__section-title">
            <a
              href="#"
              class="release-page__section-link"
              onclick={(e) => { e.preventDefault(); navigate(`/release/${related!.id}/related`); }}
            >{related.name_ru || 'Франшиза'}</a>
            {#if relatedReleases.length > 0} · Связанные релизы{/if}
          </h2>
          <div class="release-page__grid release-page__grid--related">
            {#each relatedReleases.slice(0, 12) as rel}
              <ReleaseCardV data={mapCardData(rel as Record<string, unknown>)} />
            {/each}
          </div>
        </div>
      {/if}

      <!-- Recommendations -->
      {#if recommended.length > 0}
        <div class="release-page__section">
          <h2 class="release-page__section-title">Рекомендации</h2>
          <div class="release-page__grid release-page__grid--recommended">
            {#each recommended as rel}
              <ReleaseCardV data={mapCardData(rel as Record<string, unknown>)} />
            {/each}
          </div>
        </div>
      {/if}

      <!-- Comments -->
      {#if comments.length > 0}
        <div class="release-page__section" id="comments">
          <h2 class="release-page__section-title">Комментарии ({comments.length})</h2>
          <div class="release-page__comments">
            {#each comments.slice(0, 20) as c}
              {@const profile = c.profile ?? {}}
              {@const nickname = (profile as { nickname?: string }).nickname ?? 'Пользователь'}
              {@const avatar = (profile as { avatar?: string }).avatar ?? ''}
              <div class="release-page__comment">
                <div class="release-page__comment-avatar" style={avatar ? `background-image:url(${avatar})` : ''}></div>
                <div class="release-page__comment-body">
                  <span class="release-page__comment-author">{nickname}</span>
                  {#if c.timestamp}
                    <span class="release-page__comment-time">{formatCommentTime(c.timestamp)}</span>
                  {/if}
                  <div class="release-page__comment-text">{c.message ?? ''}</div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}
</div>
