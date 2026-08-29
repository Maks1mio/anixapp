<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { requireAuth } from '../stores/auth';
  import { openWatchModal } from '../stores/modals';
  import { buildPosterUrl, buildScreenshotUrl, toPosterDisplayUrl } from '../utils/posterUrl';
  import {
    getTvReleaseOpenTarget,
    runTvReleaseOpenAnimation,
  } from '../services/tv-release-transition';
  import { focusTvReleasePage } from '../services/tv-navigation';
  import { iconFlag, iconPlay } from '../components/icons';
  import { notifyFavoritesChanged } from '../utils/favorites-events';
  import { enrichBlockedRelease } from '../services/release-geo-bypass';
  import { extractHistoryEpisodeInfo } from '../utils/historyFormat';
  import { isReleaseAnnounce } from '../utils/release-card';
  import {
    formatVoteCount,
    getAgeRateText,
    getSeasonName,
    ratingHue,
    sanitizeRichHtml,
    stripHtmlToText,
  } from './Release/_utils';

  interface Props {
    id: number;
  }

  let { id }: Props = $props();

  const tvOpenTarget = getTvReleaseOpenTarget(id);

  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg = $state('');
  let release = $state<Record<string, unknown> | null>(null);
  let isFavorite = $state(false);
  let favoritesCount = $state(0);
  let historyResume = $state<{ episode: string; dubber: string } | null>(null);

  const posterUrl = $derived.by(() => {
    if (!release) return tvOpenTarget?.posterUrl ?? '';
    const r = release;
    const raw =
      typeof r.poster === 'string' ? r.poster as string :
      (r.poster as { original?: { url?: string }; medium?: { url?: string }; small?: { url?: string } } | undefined)?.original?.url
      ?? (r.poster as { medium?: { url?: string } } | undefined)?.medium?.url
      ?? (r.poster as { small?: { url?: string } } | undefined)?.small?.url;
    return buildPosterUrl(raw ?? (typeof r.image === 'string' ? r.image as string : '')) || '';
  });

  const displayPosterUrl = $derived(toPosterDisplayUrl(posterUrl || tvOpenTarget?.posterUrl || '', 'releaseHero'));

  const titleRu = $derived((release?.title_ru ?? '') as string);
  const titleOriginal = $derived((release?.title_original ?? '') as string);
  const title = $derived(titleRu || titleOriginal || tvOpenTarget?.title || 'Без названия');

  const desc = $derived((release?.description ?? '') as string);
  const descClean = $derived(desc ? stripHtmlToText(desc) : '');
  const descHtml = $derived(desc ? sanitizeRichHtml(desc) : '');

  const gradeRaw = $derived(release?.grade ?? release?.rating);
  const grade = $derived(typeof gradeRaw === 'number' && !Number.isNaN(gradeRaw) ? gradeRaw : null);
  const voteCount = $derived(typeof release?.vote_count === 'number' ? release.vote_count as number : 0);
  const hasRating = $derived(voteCount > 0 || (grade != null && grade > 0));
  const ratingHueVal = $derived(grade != null && grade > 0 ? ratingHue(grade) : 0);
  const ratingBg = $derived(grade != null && grade > 0 ? `hsl(${ratingHueVal}, 95%, 52%)` : 'rgba(255,255,255,0.12)');
  const ratingTextColor = $derived(grade != null && grade > 0 && ratingHueVal >= 28 ? '#0b0b0b' : '#f5f5f5');

  const year = $derived(release?.year != null ? String(release.year) : '');
  const country = $derived((release?.country ?? '') as string);
  const episodesReleased = $derived(release?.episodes_released as number | null | undefined);
  const episodesTotal = $derived(release?.episodes_total as number | null | undefined);
  const statusName = $derived((release?.status as { name?: string } | undefined)?.name ?? '');
  const statusId = $derived((release?.status as { id?: number } | undefined)?.id);
  const isAnnounce = $derived(isReleaseAnnounce(statusName, statusId));
  const studio = $derived((release?.studio ?? '') as string);
  const source = $derived((release?.source ?? '') as string);
  const genres = $derived((release?.genres ?? '') as string);
  const categoryName = $derived((release?.category as { name?: string } | undefined)?.name ?? '');
  const author = $derived((release?.author ?? '') as string);
  const director = $derived((release?.director ?? '') as string);
  const isAdult = $derived(!!(release?.is_adult));
  const ageRateText = $derived(isAdult ? '18+' : getAgeRateText(release?.age_rating as number | string | undefined));
  const ageIsRestricted = $derived(ageRateText === '16+' || ageRateText === '18+');
  const duration = $derived(release?.duration as number | null | undefined);
  const season = $derived(release?.season as number | null | undefined);
  const seasonName = $derived(getSeasonName(season));
  const isViewBlocked = $derived(!!(release?.is_view_blocked));
  const hasEpisodesReleased = $derived(typeof episodesReleased === 'number' && episodesReleased > 0);
  const releaseId = $derived(release?.id as number | undefined);

  const backdropUrl = $derived.by(() => {
    if (!release) return displayPosterUrl;
    const si = release.screenshot_images as string[] | undefined;
    if (si?.[0]) return buildScreenshotUrl(si[0]);
    const screenshots = (release.screenshots as string[] | undefined) ?? [];
    if (screenshots[0]) return buildScreenshotUrl(screenshots[0]);
    return displayPosterUrl;
  });

  function readResumeInfo(raw: Record<string, unknown> | null | undefined) {
    if (!raw) return { episode: '', dubber: '' };
    const lastEpisode = raw.last_view_episode as Record<string, unknown> | undefined;
    const releaseRaw = (raw.release as Record<string, unknown> | undefined) ?? raw;
    const category = String((releaseRaw.category as { name?: string } | undefined)?.name ?? '');
    const episodesTotalVal = typeof releaseRaw.episodes_total === 'number' ? releaseRaw.episodes_total : null;
    const nested = extractHistoryEpisodeInfo(lastEpisode, {
      isFilm: /фильм|movie|film/i.test(category),
      episodesTotal: episodesTotalVal,
    });
    const fromNested = String(nested.episodeLabel ?? '').trim();
    const rawEpisode = String(raw.last_view_episode_name ?? '').trim();
    let episode = fromNested;
    if (!episode && rawEpisode) {
      episode = /^\d+(?:[.,]\d+)?$/.test(rawEpisode) ? `${rawEpisode} серия` : rawEpisode;
    }
    const sourceObj = lastEpisode?.source as Record<string, unknown> | undefined;
    const dubber = String(
      raw.last_view_episode_type_name
      ?? (sourceObj?.dubber as { name?: string } | undefined)?.name
      ?? (sourceObj?.type as { name?: string } | undefined)?.name
      ?? nested.dubberLabel
      ?? '',
    ).trim();
    return { episode, dubber };
  }

  async function loadHistoryResume(releaseIdVal: number) {
    if (!window.anixApi?.history?.all) return null;
    for (let page = 0; page < 6; page += 1) {
      const response = await window.anixApi.history.all(page) as Record<string, unknown>;
      const content = (response?.content ?? response?.releases ?? []) as Record<string, unknown>[];
      const match = content.find((item) => Number(item.id ?? (item.release as Record<string, unknown> | undefined)?.id) === releaseIdVal);
      if (match) return readResumeInfo(match);
      if (content.length === 0 || response?.last === true) break;
    }
    return null;
  }

  const resumeInfo = $derived.by(() => {
    const fromRelease = readResumeInfo(release);
    return {
      episode: historyResume?.episode || fromRelease.episode,
      dubber: historyResume?.dubber || fromRelease.dubber,
    };
  });

  const playBtnText = $derived.by(() => {
    if (isViewBlocked || hasEpisodesReleased) {
      if (resumeInfo.episode && resumeInfo.dubber) return `${resumeInfo.episode} · ${resumeInfo.dubber}`;
      if (resumeInfo.episode) return `Продолжить · ${resumeInfo.episode}`;
      if (resumeInfo.dubber) return `Продолжить · ${resumeInfo.dubber}`;
      return 'Смотреть';
    }
    return 'Скоро';
  });

  const playBtnDisabled = $derived(!isViewBlocked && !hasEpisodesReleased);

  const subtitleLine = $derived.by(() => {
    const parts: string[] = [];
    if (titleOriginal && titleOriginal !== titleRu) parts.push(titleOriginal);
    if (year) parts.push(year);
    if (country) parts.push(country);
    return parts.join(' · ');
  });

  const metaRows = $derived.by(() => {
    const rows: Array<{ label: string; value: string }> = [];
    if (year) rows.push({ label: 'Год производства', value: year });
    if (country) rows.push({ label: 'Страна', value: country });
    if (genres) rows.push({ label: 'Жанр', value: genres });
    if (categoryName) rows.push({ label: 'Категория', value: categoryName });
    if (statusName) rows.push({ label: 'Статус', value: statusName });

    let epText = '';
    if (episodesReleased != null && episodesTotal != null && episodesTotal > 0) epText = `${episodesReleased} из ${episodesTotal} эп.`;
    else if (episodesReleased != null) epText = `${episodesReleased} эп.`;
    else if (episodesTotal != null) epText = `${episodesTotal} эп.`;
    if (duration && duration > 0) epText += epText ? ` · ~${duration} мин.` : `~${duration} мин.`;
    if (epText) rows.push({ label: 'Серии', value: epText });

    if (seasonName && year) rows.push({ label: 'Сезон', value: `${seasonName} ${year}` });
    if (studio) rows.push({ label: 'Студия', value: studio });
    if (author) rows.push({ label: 'Автор', value: author });
    if (director) rows.push({ label: 'Режиссёр', value: director });
    if (source) rows.push({ label: 'Первоисточник', value: source });
    return rows;
  });

  const aboutTitle = $derived.by(() => {
    const name = categoryName.toLowerCase();
    if (name.includes('сериал')) return 'О сериале';
    if (name.includes('фильм')) return 'О фильме';
    if (name.includes('донхуа') || name.includes('дунхуа')) return 'О донхуа';
    return 'О релизе';
  });

  const favLabel = $derived(
    favoritesCount > 0 ? formatVoteCount(favoritesCount).replace(/\s/g, ' ') : '',
  );

  async function toggleFavorite() {
    if (!requireAuth() || !window.anixApi || !releaseId) return;
    try {
      if (isFavorite) await window.anixApi.release.removeFavorite(releaseId);
      else await window.anixApi.release.addFavorite(releaseId);
      isFavorite = !isFavorite;
      favoritesCount = Math.max(0, favoritesCount + (isFavorite ? 1 : -1));
      notifyFavoritesChanged();
    } catch { /* ignore */ }
  }

  function handleWatch() {
    if (!releaseId || playBtnDisabled) return;
    openWatchModal(releaseId, titleRu || title || titleOriginal || 'Без названия');
  }

  onMount(async () => {
    if (tvOpenTarget) {
      void tick().then(async () => {
        await runTvReleaseOpenAnimation(id);
        focusTvReleasePage();
      });
    }

    if (!window.anixApi) {
      errorMsg = 'API недоступно.';
      loadState = 'error';
      return;
    }

    try {
      const historyResumePromise = loadHistoryResume(id).catch(() => null);
      const data = await window.anixApi.release.info(id, true) as { release?: Record<string, unknown> } | Record<string, unknown>;
      let raw = (data as { release?: Record<string, unknown> }).release ?? data;
      if (!raw || (raw.id == null && !raw.title_ru && !raw.title_original)) {
        errorMsg = 'Релиз не найден.';
        loadState = 'error';
        return;
      }
      raw = await enrichBlockedRelease(id, raw as Record<string, unknown>);
      release = raw as Record<string, unknown>;
      isFavorite = !!(raw.is_favorite);
      favoritesCount = (raw.favorites_count ?? 0) as number;
      loadState = 'ready';
      await tick();
      focusTvReleasePage();

      void historyResumePromise.then((resume) => {
        if (resume?.episode || resume?.dubber) historyResume = resume;
      });
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    }
  });

  onDestroy(() => {
    /* transition cleanup handled by tv-release-transition */
  });
</script>

<div class="tv-release-page" class:tv-release-page--enter={!!tvOpenTarget}>
  {#if loadState === 'loading' && tvOpenTarget}
    <div class="tv-release-page__shell tv-release-page__shell--skeleton" aria-busy="true">
      <h1 class="tv-release-page__kicker">{tvOpenTarget.title}</h1>
      <div class="tv-release-page__layout">
        <aside class="tv-release-page__aside">
          <div class="tv-release-page__poster" data-tv-release-poster>
            <img src={toPosterDisplayUrl(tvOpenTarget.posterUrl, 'releaseHero')} alt={tvOpenTarget.title} decoding="async" />
          </div>
        </aside>
        <div class="tv-release-page__main tv-release-page__content" aria-hidden="true"></div>
      </div>
    </div>

  {:else if loadState === 'loading'}
    <div class="tv-release-page__shell">
      <p class="tv-page__status">Загрузка…</p>
    </div>

  {:else if loadState === 'error'}
    <div class="tv-release-page__shell">
      <p class="tv-page__status">Ошибка: {errorMsg}</p>
    </div>

  {:else if release}
    <div class="tv-release-page__shell">
      {#if backdropUrl}
        <div class="tv-release-page__backdrop" aria-hidden="true">
          <img src={backdropUrl} alt="" decoding="async" />
        </div>
      {/if}

      <h1 class="tv-release-page__kicker">
        {title}{#if year}<span class="tv-release-page__kicker-year"> ({year})</span>{/if}
      </h1>

      <div class="tv-release-page__layout">
        <aside class="tv-release-page__aside">
          <div class="tv-release-page__poster" data-tv-release-poster>
            {#if displayPosterUrl}
              <img src={displayPosterUrl} alt={title} decoding="async" />
            {:else}
              <div class="tv-release-page__poster-ph" aria-hidden="true"></div>
            {/if}
          </div>
        </aside>

        <div class="tv-release-page__main tv-release-page__content">
          <div class="tv-release-page__hero">
            <div class="tv-release-page__info">
              {#if subtitleLine || ageRateText}
                <p class="tv-release-page__subtitle">
                  {#if subtitleLine}<span>{subtitleLine}</span>{/if}
                  {#if ageRateText}
                    <span class="tv-release-page__age" class:tv-release-page__age--restricted={ageIsRestricted}>{ageRateText}</span>
                  {/if}
                </p>
              {/if}

              {#if descClean}
                <div class="tv-release-page__desc">
                  {#if descHtml}
                    {@html descHtml}
                  {:else}
                    <p>{descClean}</p>
                  {/if}
                </div>
              {/if}

              <div class="tv-release-page__actions">
                <button
                  type="button"
                  class="tv-release-page__play"
                  disabled={playBtnDisabled}
                  onclick={handleWatch}
                >
                  <span class="tv-release-page__play-icon" aria-hidden="true">{@html iconPlay(22)}</span>
                  <span class="tv-release-page__play-label">{playBtnText}</span>
                </button>

                <button
                  type="button"
                  class="tv-release-page__chip"
                  class:tv-release-page__chip--active={isFavorite}
                  aria-pressed={isFavorite}
                  onclick={toggleFavorite}
                >
                  <span class="tv-release-page__chip-icon" aria-hidden="true">{@html iconFlag(18, isFavorite)}</span>
                  {#if favLabel}
                    <span class="tv-release-page__chip-label">{favLabel}</span>
                  {/if}
                </button>
              </div>
            </div>

            {#if hasRating && grade != null}
              <div class="tv-release-page__rating" style:--tv-release-rating-bg={ratingBg} style:--tv-release-rating-fg={ratingTextColor}>
                <div class="tv-release-page__rating-score">{grade.toFixed(1)}</div>
                <div class="tv-release-page__rating-meta">
                  <span>{formatVoteCount(voteCount)} оценок</span>
                  {#if isAnnounce}
                    <span>Анонс</span>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          {#if metaRows.length > 0}
            <section class="tv-release-page__about" aria-label={aboutTitle}>
              <h2 class="tv-release-page__about-title">{aboutTitle}</h2>
              <dl class="tv-release-page__meta">
                {#each metaRows as row (row.label)}
                  <div class="tv-release-page__meta-row">
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                {/each}
              </dl>
            </section>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
