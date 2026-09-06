<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { requireAuth } from '../stores/auth';
  import { openWatchModal } from '../stores/modals';
  import { buildPosterUrl, buildScreenshotUrl, toPosterDisplayUrl } from '../utils/posterUrl';
  import {
    getTvReleaseOpenTarget,
    runTvReleaseOpenAnimation,
  } from '../services/tv-release-transition';
  import { focusTvReleasePage, restoreTvFocus, scheduleFocusTvOverlayContent } from '../services/tv-navigation';
  import { iconX } from '../components/icons';
  import type { SelectOption } from '../components/select';
  import { notifyFavoritesChanged } from '../utils/favorites-events';
  import { enrichBlockedRelease } from '../services/release-geo-bypass';
  import { extractHistoryEpisodeInfo } from '../utils/historyFormat';
  import { isReleaseAnnounce } from '../utils/release-card';
  import { applyReleaseListStatus } from '../utils/release-list-status';
  import { isCapacitorNative } from '../native/anix-api-native';
  import {
    ReleaseHead,
    ReleaseRating,
    ReleaseScreenshots,
    ReleaseRelated,
    ReleaseRecommendations,
  } from './Release/components';
  import { LIST_STATUSES, type ListStatusId } from './Release/_types';
  import type { ReleaseMetaInfoRow } from './Release/_metaInfo';
  import {
    buildCreditsSegments,
    buildGenreSegments,
    buildSourceSegments,
    plainMetaSegments,
  } from './Release/_metaInfo';
  import {
    formatEpisodeAdded,
    formatVoteCount,
    getAgeRateText,
    getSeasonName,
    mapCardData,
    numToStatusId,
    sanitizeRichHtml,
    stripHtmlToText,
  } from './Release/_utils';

  interface Props {
    id: number;
  }

  let { id }: Props = $props();

  const tvOpenTarget = $derived.by(() => getTvReleaseOpenTarget(id));
  const cheapVisuals = isCapacitorNative();

  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg = $state('');
  let release = $state<Record<string, unknown> | null>(null);
  let isFavorite = $state(false);
  let favoritesCount = $state(0);
  let historyResume = $state<{ episode: string; dubber: string } | null>(null);
  let currentStatus = $state<ListStatusId | null>(null);
  let descCollapsed = $state(true);
  let statusOpen = $state(false);
  let statusReturnFocus = $state<HTMLElement | null>(null);

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

  const titleRu = $derived((release?.title_ru ?? '') as string);
  const titleOriginal = $derived((release?.title_original ?? '') as string);
  const titleAlt = $derived((release?.title_alt ?? '') as string);
  const title = $derived(titleRu || titleOriginal || tvOpenTarget?.title || 'Без названия');

  const desc = $derived((release?.description ?? '') as string);
  const descClean = $derived(desc ? stripHtmlToText(desc) : '');
  const descHtml = $derived(desc ? sanitizeRichHtml(desc) : '');
  const descNeedsTruncate = $derived(descClean.length > 300);
  const noteHtml = $derived.by(() => {
    if (release?.is_view_blocked) return '';
    return release?.note ? sanitizeRichHtml(release.note as string) : '';
  });

  const vote1 = $derived((release?.vote_1_count ?? 0) as number);
  const vote2 = $derived((release?.vote_2_count ?? 0) as number);
  const vote3 = $derived((release?.vote_3_count ?? 0) as number);
  const vote4 = $derived((release?.vote_4_count ?? 0) as number);
  const vote5 = $derived((release?.vote_5_count ?? 0) as number);
  const yourVote = $derived(Math.max(0, Number(release?.your_vote ?? 0) || 0));
  const watchingCount = $derived((release?.watching_count ?? 0) as number);
  const planCount = $derived((release?.plan_count ?? 0) as number);
  const completedCount = $derived((release?.completed_count ?? 0) as number);
  const holdOnCount = $derived((release?.hold_on_count ?? 0) as number);
  const droppedCount = $derived((release?.dropped_count ?? 0) as number);

  const gradeRaw = $derived(release?.grade ?? release?.rating);
  const grade = $derived(typeof gradeRaw === 'number' && !Number.isNaN(gradeRaw) ? gradeRaw : null);
  const voteCount = $derived(typeof release?.vote_count === 'number' ? release.vote_count as number : 0);
  const hasRating = $derived(voteCount > 0 || (grade != null && grade > 0));

  const year = $derived(release?.year != null ? String(release.year) : '');
  const country = $derived((release?.country ?? '') as string);
  const episodesReleased = $derived(release?.episodes_released as number | null | undefined);
  const episodesTotal = $derived(release?.episodes_total as number | null | undefined);
  const statusName = $derived((release?.status as { name?: string } | undefined)?.name ?? '');
  const statusId = $derived((release?.status as { id?: number } | undefined)?.id);
  const isAnnounce = $derived(isReleaseAnnounce(statusName, statusId));
  const canVote = $derived(!isAnnounce && release?.rating_available !== false);
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

  const screenshots = $derived.by(() => {
    if (!release) return [] as string[];
    const si = release.screenshot_images as string[] | undefined;
    if (si?.length) return si.map((u) => buildScreenshotUrl(u));
    return ((release.screenshots as string[] | undefined) ?? []).map((u) => buildScreenshotUrl(u));
  });

  const related = $derived(release?.related as { id?: number; name_ru?: string } | null | undefined);
  const relatedCards = $derived(((release?.related_releases ?? []) as Record<string, unknown>[]).map(mapCardData));
  const recommendedCards = $derived(((release?.recommended_releases ?? []) as Record<string, unknown>[]).map(mapCardData));

  const selectOptions = $derived([
    { value: '', label: 'Не в списке' },
    ...LIST_STATUSES.map((s) => ({ value: s.id, label: s.label })),
  ] as SelectOption[]);

  const metaInfoRows = $derived.by((): ReleaseMetaInfoRow[] => {
    const rows: ReleaseMetaInfoRow[] = [];
    const parts: string[] = [];
    if (country) parts.push(country);
    if (seasonName && year) parts.push(`${seasonName} ${year} г.`);
    else if (year) parts.push(`${year} г.`);
    if (parts.length) {
      rows.push({
        kind: 'country',
        segments: plainMetaSegments(parts.join(', ')),
        country: country || undefined,
      });
    }

    let epText = '';
    if (episodesReleased != null && episodesTotal != null && episodesTotal > 0) epText = `${episodesReleased} из ${episodesTotal} эп.`;
    else if (episodesReleased != null) epText = `${episodesReleased} эп.`;
    else if (episodesTotal != null) epText = `${episodesTotal} эп.`;
    if (duration && duration > 0) epText += epText ? ` по ~${duration} мин.` : `~${duration} мин.`;
    if (epText) rows.push({ kind: 'episodes', segments: plainMetaSegments(epText) });

    const catParts: string[] = [];
    if (categoryName) catParts.push(categoryName);
    if (statusName) catParts.push(statusName);
    if (catParts.length) rows.push({ kind: 'category', segments: plainMetaSegments(catParts.join(', ')) });

    const creditSegments = buildCreditsSegments(studio, author, director);
    if (creditSegments.length) rows.push({ kind: 'credits', segments: creditSegments });

    if (source) rows.push({ kind: 'source', segments: buildSourceSegments(source) });
    if (genres) rows.push({ kind: 'genres', segments: buildGenreSegments(genres) });
    return rows;
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
    for (let page = 0; page < 3; page += 1) {
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

  const episodeAddedText = $derived.by(() => {
    if (playBtnDisabled) return null;
    return formatEpisodeAdded(release?.episode_last_update);
  });

  const statusLabel = $derived(
    LIST_STATUSES.find((item) => item.id === currentStatus)?.label ?? 'Не в списке',
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

  function openStatusPicker() {
    if (!requireAuth()) return;
    const focused = document.querySelector<HTMLElement>('[data-tv-focus="true"]');
    statusReturnFocus = focused ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    statusOpen = true;
    scheduleFocusTvOverlayContent(20);
  }

  function closeStatusPicker() {
    statusOpen = false;
    const target = statusReturnFocus;
    statusReturnFocus = null;
    restoreTvFocus(target);
  }

  async function setStatus(value: string) {
    if (!requireAuth() || !window.anixApi || !releaseId) return;
    const prev = currentStatus;
    const next = (value || null) as ListStatusId | null;
    if (prev === next) {
      closeStatusPicker();
      return;
    }
    try {
      await applyReleaseListStatus(releaseId, next, prev);
      currentStatus = next;
    } catch { /* keep previous */ }
    closeStatusPicker();
  }

  async function refreshReleaseData() {
    if (!window.anixApi) return;
    try {
      const data = await window.anixApi.release.info(id, true) as { release?: Record<string, unknown> } | Record<string, unknown>;
      let raw = (data as { release?: Record<string, unknown> }).release ?? data;
      if (raw && typeof raw === 'object') {
        raw = await enrichBlockedRelease(id, raw as Record<string, unknown>);
        release = { ...release, ...raw } as Record<string, unknown>;
        isFavorite = !!(raw as Record<string, unknown>).is_favorite;
        const fav = (raw as Record<string, unknown>).favorites_count;
        if (typeof fav === 'number') favoritesCount = fav;
        currentStatus = numToStatusId((raw as Record<string, unknown>).profile_list_status as number | null | undefined);
      }
    } catch { /* ignore */ }
  }

  function onOverlayKeys(event: KeyboardEvent) {
    const isBack = event.key === 'Escape' || event.key === 'Back' || event.key === 'BrowserBack';
    if (statusOpen && isBack) {
      event.preventDefault();
      event.stopPropagation();
      closeStatusPicker();
    }
  }

  function onBookmarksChanged(e: Event) {
    const detail = (e as CustomEvent<{ releaseId?: number }>).detail;
    if (detail?.releaseId != null && detail.releaseId !== id) return;
    void refreshReleaseData();
  }

  onMount(async () => {
    window.addEventListener('anix:bookmarksChanged', onBookmarksChanged);
    window.addEventListener('keydown', onOverlayKeys, true);

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
      const maybeRaw = (data as { release?: Record<string, unknown> }).release ?? data;
      const raw = (maybeRaw && typeof maybeRaw === 'object' ? maybeRaw : null) as Record<string, unknown> | null;
      if (!raw || (raw.id == null && !raw.title_ru && !raw.title_original)) {
        errorMsg = 'Релиз не найден.';
        loadState = 'error';
        return;
      }
      const enriched = await enrichBlockedRelease(id, raw);
      release = enriched as Record<string, unknown>;
      isFavorite = !!(enriched.is_favorite);
      favoritesCount = (enriched.favorites_count ?? 0) as number;
      currentStatus = numToStatusId(enriched.profile_list_status as number | null | undefined);
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
    window.removeEventListener('anix:bookmarksChanged', onBookmarksChanged);
    window.removeEventListener('keydown', onOverlayKeys, true);
  });
</script>

<div class="tv-release-page" class:tv-release-page--enter={!!tvOpenTarget} class:tv-release-page--cheap={cheapVisuals}>
  {#if loadState === 'loading' && tvOpenTarget}
    <div class="tv-release-page__shell tv-release-page__shell--skeleton" aria-busy="true">
      <section class="release-page">
        <div class="release-page__head">
          <div class="release-page__head-aside-play">
            <div class="release-page__poster" data-tv-release-poster>
              <img src={toPosterDisplayUrl(tvOpenTarget.posterUrl, 'releaseHero')} alt={tvOpenTarget.title} decoding="async" fetchpriority="high" />
            </div>
          </div>
        </div>
      </section>
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
      <section class="release-page release-page--tv">
        <div data-tv-release-section="hero">
          <ReleaseHead
          tvMode
          {posterUrl}
          {title}
          {titleRu}
          {titleOriginal}
          {titleAlt}
          {ageRateText}
          {ageIsRestricted}
          {isFavorite}
          {favoritesCount}
          {isViewBlocked}
          {noteHtml}
          {descHtml}
          {descClean}
          {descNeedsTruncate}
          {descCollapsed}
          {metaInfoRows}
          {playBtnText}
          {playBtnDisabled}
          {episodeAddedText}
          {currentStatus}
          {selectOptions}
          statusButtonLabel={statusLabel}
          onOpenStatusPicker={openStatusPicker}
          onToggleFavorite={toggleFavorite}
          onWatch={handleWatch}
          onSetStatus={setStatus}
          onToggleDesc={() => { descCollapsed = !descCollapsed; }}
          />
        </div>

        <div class="tv-release-page__body" data-tv-home-rails>
          <div data-tv-release-section="rating">
            <ReleaseRating
              releaseId={id}
              {grade}
              {hasRating}
              {voteCount}
              {vote1}
              {vote2}
              {vote3}
              {vote4}
              {vote5}
              {yourVote}
              {watchingCount}
              {planCount}
              {completedCount}
              {holdOnCount}
              {droppedCount}
              {canVote}
              onRefresh={refreshReleaseData}
            />
          </div>

          {#if screenshots.length > 0}
            <div data-tv-release-section="screenshots">
              <ReleaseScreenshots {screenshots} />
            </div>
          {/if}

          {#if relatedCards.length > 0 && related?.id}
            <ReleaseRelated releaseId={id} relatedId={related.id} items={relatedCards} tvMode />
          {/if}

          {#if recommendedCards.length > 0}
            <ReleaseRecommendations items={recommendedCards} tvMode />
          {/if}
        </div>
      </section>
    </div>
  {/if}
</div>

{#if statusOpen}
  <div
    class="tv-release-page__dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Добавить в список"
    tabindex="-1"
    onclick={(event) => { if (event.target === event.currentTarget) closeStatusPicker(); }}
    onkeydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
      }
    }}
  >
    <div class="tv-release-page__dialog-panel">
      <div class="tv-release-page__dialog-head">
        <h2>Добавить в список</h2>
        <button type="button" class="tv-release-page__dialog-close" aria-label="Закрыть" onclick={closeStatusPicker}>
          {@html iconX(20)}
        </button>
      </div>
      <div class="tv-release-page__dialog-list">
        <button
          type="button"
          class="tv-release-page__dialog-item"
          class:tv-release-page__dialog-item--on={!currentStatus}
          onclick={() => setStatus('')}
        >
          Не в списке
        </button>
        {#each LIST_STATUSES as item (item.id)}
          <button
            type="button"
            class="tv-release-page__dialog-item"
            class:tv-release-page__dialog-item--on={currentStatus === item.id}
            onclick={() => setStatus(item.id)}
          >
            {item.label}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
