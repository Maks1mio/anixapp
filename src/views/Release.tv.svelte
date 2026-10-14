<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { requireAuth } from '../stores/auth';
  import { openWatchModal } from '../stores/modals';
  import { buildPosterUrl, toPosterDisplayUrl } from '../utils/posterUrl';
  import {
    getTvReleaseOpenTarget,
    runTvReleaseOpenAnimation,
  } from '../services/tv-release-transition';
  import { focusTvReleasePage, restoreTvFocus, scheduleFocusTvOverlayContent } from '../services/tv-navigation';
  import { iconStar, iconX } from '../components/icons';
  import { notifyFavoritesChanged, notifyVotesChanged } from '../utils/favorites-events';
  import { enrichBlockedRelease } from '../services/release-geo-bypass';
  import { extractHistoryEpisodeInfo } from '../utils/historyFormat';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import { formatReleaseEpisodes, isReleaseAnnounce } from '../utils/release-card';
  import { formatEveryWeekdayShort, weekdayKeyFromBroadcast } from '../utils/release-air-calendar';
  import { formatDubberQuality } from '../utils/dubber-meta';
  import { applyReleaseListStatus } from '../utils/release-list-status';
  import { isCapacitorNative } from '../native/anix-api-native';
  import ReleaseHeadTv from './Release/components/ReleaseHeadTv.svelte';
  import { LIST_STATUSES, type ListStatusId, type ReleaseCreditRow } from './Release/_types';
  import {
    getAgeRateText,
    getSeasonName,
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
  let voteOpen = $state(false);
  let voteBusy = $state(false);
  let voteHover = $state(0);
  let voteReturnFocus = $state<HTMLElement | null>(null);
  /** «1080P / QHD» — качества озвучек, как в макете на кнопке «Смотреть». */
  let qualityLabels = $state<string[]>([]);

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
  const title = $derived(titleRu || titleOriginal || tvOpenTarget?.title || 'Без названия');

  const desc = $derived((release?.description ?? '') as string);
  const descClean = $derived(desc ? stripHtmlToText(desc) : '');
  const descHtml = $derived(desc ? sanitizeRichHtml(desc) : '');
  const descNeedsTruncate = $derived(descClean.length > 300);
  const noteHtml = $derived.by(() => {
    if (release?.is_view_blocked) return '';
    return release?.note ? sanitizeRichHtml(release.note as string) : '';
  });

  const yourVote = $derived(Math.max(0, Number(release?.your_vote ?? 0) || 0));
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
  /** Предпросмотр звёзд: при наведении показываем оценку под курсором, иначе — свою. */
  const voteDisplay = $derived(voteHover > 0 ? voteHover : yourVote);
  const voteCountLabel = $derived(voteCount > 0 ? `${voteCount.toLocaleString('ru-RU')} голосов` : '');
  const studio = $derived((release?.studio ?? '') as string);
  const source = $derived((release?.source ?? '') as string);
  const genres = $derived((release?.genres ?? '') as string);
  const author = $derived((release?.author ?? '') as string);
  const director = $derived((release?.director ?? '') as string);
  const isAdult = $derived(!!(release?.is_adult));
  const ageRateText = $derived(isAdult ? '18+' : getAgeRateText(release?.age_rating as number | string | undefined));
  const ageIsRestricted = $derived(ageRateText === '16+' || ageRateText === '18+');
  const duration = $derived(release?.duration as number | null | undefined);
  const season = $derived(release?.season as number | null | undefined);
  const seasonName = $derived(getSeasonName(season));
  const broadcast = $derived(typeof release?.broadcast === 'number' ? release.broadcast as number : null);
  const isViewBlocked = $derived(!!(release?.is_view_blocked));
  const hasEpisodesReleased = $derived(typeof episodesReleased === 'number' && episodesReleased > 0);
  const releaseId = $derived(release?.id as number | undefined);

  const episodesText = $derived(formatReleaseEpisodes(episodesReleased, episodesTotal));
  const durationText = $derived(duration && duration > 0 ? `~${duration} мин` : '');
  const isAiring = $derived(statusId === 2 || /^выходит$/i.test(statusName));
  const broadcastText = $derived(isAiring ? formatEveryWeekdayShort(weekdayKeyFromBroadcast(broadcast)) : '');
  const countrySeasonYear = $derived.by(() => {
    const parts: string[] = [];
    if (country) parts.push(country);
    if (seasonName && year) parts.push(`${seasonName} ${year} г.`);
    else if (year) parts.push(`${year} г.`);
    return parts.join(', ');
  });

  const creditRows = $derived.by((): ReleaseCreditRow[] => {
    const rows: ReleaseCreditRow[] = [];
    if (source) rows.push({ label: 'Источник', value: source });
    if (studio) rows.push({ label: 'Студия', value: studio });
    if (author && director) rows.push({ label: 'Автор', value: `${author}, режиссёр ${director}` });
    else if (author) rows.push({ label: 'Автор', value: author });
    else if (director) rows.push({ label: 'Режиссёр', value: director });
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

  const playSubtitle = $derived.by(() => {
    if (resumeInfo.episode && resumeInfo.dubber) return `${resumeInfo.episode} · ${resumeInfo.dubber}`;
    return resumeInfo.episode || resumeInfo.dubber || '';
  });

  const playBtnDisabled = $derived(!isViewBlocked && !hasEpisodesReleased);

  const statusLabel = $derived(
    LIST_STATUSES.find((item) => item.id === currentStatus)?.label ?? 'Не в списке',
  );

  async function loadQualityLabels(releaseIdVal: number) {
    const api = window.anixApi?.release;
    if (!api?.getDubbers) {
      qualityLabels = [];
      return;
    }
    try {
      const data = await api.getDubbers(releaseIdVal) as { types?: Array<{ quality?: number }> } | null | undefined;
      const byRank = new Map<number, string>();
      for (const item of data?.types ?? []) {
        const rank = Number(item?.quality);
        const label = formatDubberQuality(item?.quality);
        if (!label || !Number.isFinite(rank) || byRank.has(rank)) continue;
        byRank.set(rank, label);
      }
      qualityLabels = [...byRank.entries()]
        .sort((a, b) => b[0] - a[0])
        .slice(0, 2)
        .map(([, label]) => label);
    } catch {
      qualityLabels = [];
    }
  }

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

  function openVotePicker() {
    if (!canVote || !requireAuth()) return;
    const focused = document.querySelector<HTMLElement>('[data-tv-focus="true"]');
    voteReturnFocus = focused ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    voteHover = 0;
    voteOpen = true;
    scheduleFocusTvOverlayContent(20);
  }

  function closeVotePicker() {
    voteOpen = false;
    voteHover = 0;
    const target = voteReturnFocus;
    voteReturnFocus = null;
    restoreTvFocus(target);
  }

  /** Крестик в окне оценки: снять свою оценку, если она есть, иначе просто закрыть. */
  async function onVoteCloseClick() {
    if (yourVote > 0) {
      await removeVote();
      return;
    }
    closeVotePicker();
  }

  async function submitVote(stars: number) {
    if (!canVote || !requireAuth() || !window.anixApi || !releaseId || voteBusy) return;
    // Оставляем ту же оценку — ничего не меняем, просто закрываем окно.
    if (yourVote === stars) {
      closeVotePicker();
      return;
    }
    voteBusy = true;
    try {
      if (yourVote > 0) await window.anixApi.release.deleteVote(releaseId);
      await window.anixApi.release.vote(releaseId, stars);
      notifyVotesChanged({ releaseId });
      await refreshReleaseData();
    } catch { /* ignore */ }
    finally {
      voteBusy = false;
    }
    closeVotePicker();
  }

  async function removeVote() {
    if (!requireAuth() || !window.anixApi || !releaseId || voteBusy) return;
    voteBusy = true;
    try {
      await window.anixApi.release.deleteVote(releaseId);
      notifyVotesChanged({ releaseId });
      await refreshReleaseData();
    } catch { /* ignore */ }
    finally {
      voteBusy = false;
    }
    closeVotePicker();
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
    if (!isBack) return;
    if (statusOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeStatusPicker();
      return;
    }
    if (voteOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeVotePicker();
    }
  }

  function onBookmarksChanged(e: Event) {
    const detail = (e as CustomEvent<{ releaseId?: number }>).detail;
    if (detail?.releaseId != null && detail.releaseId !== id) return;
    void refreshReleaseData();
  }

  async function loadRelease() {
    if (!window.anixApi) {
      errorMsg = 'API недоступно.';
      loadState = 'error';
      return;
    }
    if (loadState !== 'error') loadState = 'loading';
    qualityLabels = [];
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

      const episodesReleasedVal = enriched.episodes_released as number | null | undefined;
      if (typeof episodesReleasedVal === 'number' && episodesReleasedVal > 0) {
        void loadQualityLabels(id);
      }

      void historyResumePromise.then((resume) => {
        if (resume?.episode || resume?.dubber) historyResume = resume;
      });
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
      loadState = 'error';
    }
  }

  onMount(() => {
    window.addEventListener('anix:bookmarksChanged', onBookmarksChanged);
    window.addEventListener('keydown', onOverlayKeys, true);

    if (tvOpenTarget) {
      void tick().then(async () => {
        await runTvReleaseOpenAnimation(id);
        focusTvReleasePage();
      });
    }

    void loadRelease();
  });

  onDestroy(() => {
    window.removeEventListener('anix:bookmarksChanged', onBookmarksChanged);
    window.removeEventListener('keydown', onOverlayKeys, true);
  });
</script>

<div class="tv-release-page" class:tv-release-page--enter={!!tvOpenTarget} class:tv-release-page--cheap={cheapVisuals}>
  {#if loadState === 'loading' && tvOpenTarget}
    <div class="tv-release-page__shell tv-release-page__shell--skeleton" aria-busy="true">
      <div class="tv-release-hero tv-release-hero--skeleton">
        <div class="tv-release-hero__art" data-tv-release-poster aria-hidden="true">
          {#if tvOpenTarget.posterUrl}
            <img
              src={toPosterDisplayUrl(tvOpenTarget.posterUrl, 'releaseHero')}
              alt=""
              decoding="async"
              fetchpriority="high"
            />
          {/if}
          <div class="tv-release-hero__art-scrim"></div>
        </div>
      </div>
    </div>

  {:else if loadState === 'loading'}
    <div class="tv-release-page__shell">
      <p class="tv-page__status">Загрузка…</p>
    </div>

  {:else if loadState === 'error'}
    <div class="tv-release-page__shell">
      <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void loadRelease()} />
    </div>

  {:else if release}
    <div class="tv-release-page__shell">
      <ReleaseHeadTv
        artUrl={posterUrl}
        {title}
        {titleOriginal}
        {ageRateText}
        {ageIsRestricted}
        {grade}
        {hasRating}
        {episodesText}
        {broadcastText}
        {durationText}
        {countrySeasonYear}
        {genres}
        {descHtml}
        {descClean}
        {descNeedsTruncate}
        {descCollapsed}
        {noteHtml}
        {isViewBlocked}
        {statusLabel}
        {voteCount}
        {yourVote}
        {canVote}
        playDisabled={playBtnDisabled}
        {playSubtitle}
        {qualityLabels}
        {isFavorite}
        credits={creditRows}
        onOpenStatusPicker={openStatusPicker}
        onOpenVotePicker={openVotePicker}
        onWatch={handleWatch}
        onToggleFavorite={toggleFavorite}
        onToggleDesc={() => { descCollapsed = !descCollapsed; }}
      />
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

{#if voteOpen}
  <div
    class="tv-release-page__dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Оценить"
    tabindex="-1"
    onclick={(event) => { if (event.target === event.currentTarget) closeVotePicker(); }}
    onkeydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
      }
    }}
  >
    <div class="tv-release-page__dialog-panel tv-release-page__vote-panel">
      <h2 class="tv-release-page__vote-title">Оценить релиз</h2>

      <div class="tv-release-page__vote-row">
        <button
          type="button"
          class="tv-release-page__vote-close"
          aria-label={yourVote > 0 ? 'Убрать оценку' : 'Закрыть'}
          disabled={voteBusy}
          onclick={() => void onVoteCloseClick()}
        >
          {@html iconX(24)}
        </button>

        <div
          class="tv-release-page__vote-stars"
          role="group"
          aria-label="Поставить оценку"
          onmouseleave={() => { voteHover = 0; }}
        >
          {#each [1, 2, 3, 4, 5] as star (star)}
            <button
              type="button"
              class="tv-release-page__star"
              class:tv-release-page__star--on={star <= voteDisplay}
              disabled={voteBusy}
              aria-label="{star} из 5"
              onmouseenter={() => { voteHover = star; }}
              onclick={() => void submitVote(star)}
            >
              {@html iconStar(44, star <= voteDisplay)}
            </button>
          {/each}
        </div>
      </div>

      {#if voteCountLabel}
        <p class="tv-release-page__vote-count">{voteCountLabel}</p>
      {/if}
    </div>
  </div>
{/if}
