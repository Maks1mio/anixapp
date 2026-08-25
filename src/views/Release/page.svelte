<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../../stores/navigation';
  import { requireAuth } from '../../stores/auth';
  import { openWatchModal } from '../../stores/modals';
  import { buildPosterUrl, buildScreenshotUrl } from '../../utils/posterUrl';
  import { setDiscordContext, refreshDiscordPresence } from '../../services/discord-presence';
  import type { SelectOption } from '../../components/select';
  import { LIST_STATUSES, type ListStatusId } from './_types';
  import type { ReleaseMetaInfoRow } from './_metaInfo';
  import {
    buildCreditsSegments,
    buildGenreSegments,
    buildSourceSegments,
    plainMetaSegments,
  } from './_metaInfo';
  import {
    getAgeRateText, getSeasonName, stripHtmlToText, sanitizeRichHtml,
    numToStatusId, ratingHue, mapCardData, formatEpisodeAdded,
  } from './_utils';
  import { isReleaseAnnounce } from '../../utils/release-card';
  import { ReleaseHead, ReleaseVideos, ReleaseRating, ReleaseRelated, ReleaseRecommendations, ReleaseScreenshots, ReleaseComments } from './components';
  import { notifyFavoritesChanged } from '../../utils/favorites-events';
  import { applyReleaseListStatus } from '../../utils/release-list-status';
  import { enrichBlockedRelease } from '../../services/release-geo-bypass';
  import { extractHistoryEpisodeInfo } from '../../utils/historyFormat';

  interface Props { id: number; }
  let { id }: Props = $props();

  // ── State ──────────────────────────────────────────────────────────────────
  let loadState   = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg    = $state('');
  let release     = $state<Record<string, unknown> | null>(null);
  let isFavorite  = $state(false);
  let favoritesCount = $state(0);
  let currentStatus  = $state<ListStatusId | null>(null);
  let descCollapsed  = $state(true);
  let historyResume  = $state<{ episode: string; dubber: string } | null>(null);

  function readResumeInfo(raw: Record<string, unknown> | null | undefined) {
    if (!raw) return { episode: '', dubber: '' };

    const lastEpisode = raw.last_view_episode as Record<string, unknown> | undefined;
    const nested = extractHistoryEpisodeInfo(lastEpisode);
    const rawEpisode = String(raw.last_view_episode_name ?? nested.episodeLabel ?? '').trim();
    const episode = /^\d+(?:[.,]\d+)?$/.test(rawEpisode)
      ? `${rawEpisode} серия`
      : rawEpisode;

    const source = lastEpisode?.source as Record<string, unknown> | undefined;
    const sourceDubber = source?.dubber as Record<string, unknown> | undefined;
    const sourceType = source?.type as Record<string, unknown> | undefined;
    const dubber = String(
      raw.last_view_episode_type_name
      ?? sourceDubber?.name
      ?? sourceType?.name
      ?? nested.dubberLabel
      ?? '',
    ).trim();

    return { episode, dubber };
  }

  async function loadHistoryResume(releaseId: number) {
    if (!window.anixApi?.history?.all) return null;

    // Обычно нужный релиз находится на первой странице. Несколько страниц
    // нужны для тайтлов, которые пользователь смотрел чуть раньше.
    for (let page = 0; page < 6; page += 1) {
      const response = await window.anixApi.history.all(page) as Record<string, unknown>;
      const content = (response?.content ?? response?.releases ?? []) as Record<string, unknown>[];
      const match = content.find((item) => Number(item.id ?? (item.release as Record<string, unknown> | undefined)?.id) === releaseId);
      if (match) return readResumeInfo(match);
      if (content.length === 0 || response?.last === true) break;
    }
    return null;
  }

  // ── Derived: poster ────────────────────────────────────────────────────────
  const posterUrl = $derived.by(() => {
    if (!release) return '';
    const r = release;
    const raw =
      typeof r.poster === 'string' ? r.poster as string :
      (r.poster as any)?.original?.url ?? (r.poster as any)?.medium?.url ?? (r.poster as any)?.small?.url;
    return buildPosterUrl(raw ?? (typeof r.image === 'string' ? r.image as string : '')) || '';
  });

  // ── Derived: title / description ──────────────────────────────────────────
  const titleRu       = $derived((release?.title_ru       ?? '') as string);
  const titleOriginal = $derived((release?.title_original ?? '') as string);
  const titleAlt        = $derived((release?.title_alt ?? '') as string);
  const title         = $derived(titleRu || titleOriginal || 'Без названия');
  const desc          = $derived((release?.description ?? '') as string);
  const descClean     = $derived(desc ? stripHtmlToText(desc) : '');
  const descHtml      = $derived(desc ? sanitizeRichHtml(desc) : '');
  const descNeedsTruncate = $derived(descClean.length > 300);
  const noteHtml      = $derived.by(() => {
    if (release?.is_view_blocked) return '';
    return release?.note ? sanitizeRichHtml(release.note as string) : '';
  });

  // ── Derived: rating ───────────────────────────────────────────────────────
  const gradeRaw   = $derived(release?.grade ?? release?.rating);
  const grade      = $derived(typeof gradeRaw === 'number' && !Number.isNaN(gradeRaw) ? gradeRaw : null);
  const voteCount  = $derived(typeof release?.vote_count === 'number' ? release.vote_count as number : 0);
  const hasRating  = $derived(voteCount > 0 || (grade != null && grade > 0));
  const ratingHueVal   = $derived(grade != null && grade > 0 ? ratingHue(grade) : 0);
  const ratingBg       = $derived(grade != null && grade > 0 ? `hsl(${ratingHueVal}, 95%, 52%)` : 'rgba(255,255,255,0.12)');
  const ratingTextColor = $derived(grade != null && grade > 0 && ratingHueVal >= 28 ? '#0b0b0b' : '#f5f5f5');

  // ── Derived: vote counts ──────────────────────────────────────────────────
  const vote1 = $derived((release?.vote_1_count ?? 0) as number);
  const vote2 = $derived((release?.vote_2_count ?? 0) as number);
  const vote3 = $derived((release?.vote_3_count ?? 0) as number);
  const vote4 = $derived((release?.vote_4_count ?? 0) as number);
  const vote5 = $derived((release?.vote_5_count ?? 0) as number);
  const yourVote = $derived(Math.max(0, Number(release?.your_vote ?? 0) || 0));
  const watchingCount  = $derived((release?.watching_count  ?? 0) as number);
  const planCount      = $derived((release?.plan_count      ?? 0) as number);
  const completedCount = $derived((release?.completed_count ?? 0) as number);
  const holdOnCount    = $derived((release?.hold_on_count   ?? 0) as number);
  const droppedCount   = $derived((release?.dropped_count   ?? 0) as number);

  // ── Derived: meta ─────────────────────────────────────────────────────────
  const year         = $derived(release?.year != null ? String(release.year) : '');
  const country      = $derived((release?.country ?? '') as string);
  const episodesReleased = $derived(release?.episodes_released as number | null | undefined);
  const episodesTotal    = $derived(release?.episodes_total    as number | null | undefined);
  const statusName   = $derived((release?.status   as { name?: string } | undefined)?.name ?? '');
  const statusId     = $derived((release?.status as { id?: number } | undefined)?.id);
  const isAnnounce   = $derived(isReleaseAnnounce(statusName, statusId));
  const canVote      = $derived(!isAnnounce && release?.rating_available !== false);
  const studio       = $derived((release?.studio   ?? '') as string);
  const source       = $derived((release?.source   ?? '') as string);
  const genres       = $derived((release?.genres   ?? '') as string);
  const categoryName = $derived((release?.category as { name?: string } | undefined)?.name ?? '');
  const author       = $derived((release?.author   ?? '') as string);
  const director     = $derived((release?.director ?? '') as string);
  const isAdult      = $derived(!!(release?.is_adult));
  const ageRatingRaw = $derived(release?.age_rating as number | string | undefined);
  const ageRateText  = $derived(isAdult ? '18+' : getAgeRateText(ageRatingRaw));
  const ageIsRestricted = $derived(ageRateText === '16+' || ageRateText === '18+');
  const duration     = $derived(release?.duration   as number | null | undefined);
  const season       = $derived(release?.season     as number | null | undefined);
  const seasonName   = $derived(getSeasonName(season));
  const releaseDate  = $derived((release?.release_date ?? '') as string);
  const airedOnDate  = $derived(release?.aired_on_date as number | null | undefined);
  const isViewBlocked = $derived(!!(release?.is_view_blocked));
  const hasEpisodesReleased = $derived(typeof episodesReleased === 'number' && episodesReleased > 0);
  const releaseId    = $derived(release?.id as number | undefined);

  const resumeInfo = $derived.by(() => {
    const fromRelease = readResumeInfo(release);
    return {
      episode: historyResume?.episode || fromRelease.episode,
      dubber: historyResume?.dubber || fromRelease.dubber,
    };
  });

  const airedText = $derived.by(() => {
    if (airedOnDate && airedOnDate > 0) {
      const d = new Date(airedOnDate * 1000);
      const months = ['янв.','февр.','мар.','апр.','мая','июн.','июл.','авг.','сен.','окт.','нояб.','дек.'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} г.`;
    }
    return releaseDate;
  });

  const playBtnText     = $derived.by(() => {
    if (isViewBlocked || hasEpisodesReleased) {
      if (resumeInfo.episode && resumeInfo.dubber) {
        return `${resumeInfo.episode} · ${resumeInfo.dubber}`;
      }
      if (resumeInfo.episode) return `Продолжить · ${resumeInfo.episode}`;
      if (resumeInfo.dubber) return `Продолжить · ${resumeInfo.dubber}`;
      return 'Воспроизвести';
    }
    return airedText ? `${airedText}` : 'Скоро';
  });
  const playBtnDisabled = $derived(!isViewBlocked && !hasEpisodesReleased);

  const episodeAddedText = $derived.by(() => {
    if (playBtnDisabled) return null;
    return formatEpisodeAdded(release?.episode_last_update);
  });

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
    else if (episodesTotal    != null) epText = `${episodesTotal} эп.`;
    if (duration && duration > 0) epText += epText ? ` по ~${duration} мин.` : `~${duration} мин.`;
    if (epText) rows.push({ kind: 'episodes', segments: plainMetaSegments(epText) });

    const catParts: string[] = [];
    if (categoryName) catParts.push(categoryName);
    if (statusName)   catParts.push(statusName);
    if (catParts.length) rows.push({ kind: 'category', segments: plainMetaSegments(catParts.join(', ')) });

    const creditSegments = buildCreditsSegments(studio, author, director);
    if (creditSegments.length) rows.push({ kind: 'credits', segments: creditSegments });

    if (source) rows.push({ kind: 'source', segments: buildSourceSegments(source) });
    if (genres) rows.push({ kind: 'genres', segments: buildGenreSegments(genres) });
    return rows;
  });

  // ── Derived: lists / related / screenshots ────────────────────────────────
  const screenshots   = $derived.by(() => {
    if (!release) return [] as string[];
    const si = release.screenshot_images as string[] | undefined;
    if (si) return si.map((u) => buildScreenshotUrl(u));
    return ((release.screenshots as string[] | undefined) ?? [])
      .map((u) => buildScreenshotUrl(u));
  });

  const related          = $derived(release?.related as { id?: number; name_ru?: string; release_count?: number } | null | undefined);
  const relatedReleases  = $derived((release?.related_releases  ?? []) as Record<string, unknown>[]);
  const recommended      = $derived((release?.recommended_releases ?? []) as Record<string, unknown>[]);
  const comments         = $derived((release?.comments ?? []) as Record<string, unknown>[]);
  const commentCount     = $derived(
    typeof release?.comment_count === 'number' ? release.comment_count
      : typeof release?.comments_count === 'number' ? release.comments_count
      : comments.length,
  );
  const relatedCards     = $derived(relatedReleases.map(r => mapCardData(r)));
  const recommendedCards = $derived(recommended.map(r => mapCardData(r)));

  // ── Select options ────────────────────────────────────────────────────────
  const selectOptions = $derived([
    { value: '', label: 'Не в списке' },
    ...LIST_STATUSES.map(s => ({ value: s.id, label: s.label })),
  ] as SelectOption[]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function toggleFavorite() {
    if (!requireAuth()) return;
    if (!window.anixApi || !releaseId) return;
    try {
      if (isFavorite) await window.anixApi.release.removeFavorite(releaseId);
      else            await window.anixApi.release.addFavorite(releaseId);
      isFavorite     = !isFavorite;
      favoritesCount = Math.max(0, favoritesCount + (isFavorite ? 1 : -1));
      notifyFavoritesChanged();
    } catch { /* ignore */ }
  }

  function handleWatch() {
    if (!releaseId) return;
    openWatchModal(releaseId, titleRu || title || titleOriginal || 'Без названия');
  }

  async function setStatus(value: string) {
    if (!requireAuth()) return;
    if (!window.anixApi || !releaseId) return;
    const prev = currentStatus;
    const next = (value || null) as ListStatusId | null;
    if (prev === next) return;
    try {
      await applyReleaseListStatus(releaseId, next, prev);
      currentStatus = next;
    } catch {
      /* keep previous status on failure */
    }
  }

  async function syncListStateFromApi() {
    if (!window.anixApi || !id) return;
    try {
      const data = await window.anixApi.release.info(id, true) as Record<string, unknown>;
      const raw = (data?.release ?? data) as Record<string, unknown> | undefined;
      if (!raw || typeof raw !== 'object') return;
      isFavorite = !!(raw.is_favorite);
      if (typeof raw.favorites_count === 'number') favoritesCount = raw.favorites_count;
      currentStatus = numToStatusId(raw.profile_list_status as number | null | undefined);
    } catch { /* ignore */ }
  }

  async function refreshReleaseData() {
    if (!window.anixApi) return;
    try {
      const data = await window.anixApi.release.info(id, true) as any;
      let raw = data?.release ?? data;
      if (raw && typeof raw === 'object') {
        raw = await enrichBlockedRelease(id, raw as Record<string, unknown>);
        release = { ...release, ...raw } as Record<string, unknown>;
        isFavorite = !!(raw.is_favorite);
        if (typeof raw.favorites_count === 'number') favoritesCount = raw.favorites_count;
        currentStatus = numToStatusId(raw.profile_list_status as number | null | undefined);
      }
    } catch { /* ignore */ }
  }

  function onBookmarksChanged(e: Event) {
    const detail = (e as CustomEvent<{ releaseId?: number }>).detail;
    if (detail?.releaseId != null && detail.releaseId !== id) return;
    void syncListStateFromApi();
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  onMount(async () => {
    window.addEventListener('anix:bookmarksChanged', onBookmarksChanged);
    if (!window.anixApi) {
      errorMsg  = 'API недоступно (только в Electron).';
      loadState = 'error';
      return;
    }
    try {
      const historyResumePromise = loadHistoryResume(id).catch(() => null);
      const data = await window.anixApi.release.info(id, true) as any;
      let raw  = data?.release ?? data;
      if (!raw || (raw.id == null && !raw.title_ru && !raw.title_original)) {
        errorMsg  = 'Релиз не найден.';
        loadState = 'error';
        return;
      }
      raw = await enrichBlockedRelease(id, raw as Record<string, unknown>);
      release        = raw as Record<string, unknown>;
      isFavorite     = !!(raw.is_favorite);
      favoritesCount = (raw.favorites_count ?? 0) as number;
      currentStatus  = numToStatusId(raw.profile_list_status as number | null | undefined);
      loadState      = 'ready';

      const posterVal = buildPosterUrl(
        typeof raw.poster === 'string' ? raw.poster :
        (raw.poster as any)?.original?.url ?? (raw.poster as any)?.medium?.url ?? (typeof raw.image === 'string' ? raw.image : '')
      );
      setDiscordContext({
        releaseTitle: (raw.title_ru || raw.title_original || '') as string,
        releasePoster: posterVal || undefined,
      });
      refreshDiscordPresence();

      void historyResumePromise.then((resume) => {
        if (resume?.episode || resume?.dubber) historyResume = resume;
      });
    } catch (err) {
      errorMsg  = String(err);
      loadState = 'error';
    }
  });

  onDestroy(() => {
    window.removeEventListener('anix:bookmarksChanged', onBookmarksChanged);
  });
</script>

<div class="release-view-wrap">
  <div class="view view-release">
  {#if loadState === 'loading'}
    <div class="release-loading">Загрузка…</div>

  {:else if loadState === 'error'}
    <div class="release-loading">{errorMsg}</div>

  {:else if release}
    <section class="release-page">

      <!-- Head: poster + info -->
      <ReleaseHead
        {posterUrl} {title} {titleRu} {titleOriginal} {titleAlt}
        {ageRateText} {ageIsRestricted}
        {isFavorite} {favoritesCount}
        {isViewBlocked} {noteHtml} {descHtml} {descClean} {descNeedsTruncate} {descCollapsed}
        {metaInfoRows} {playBtnText} {playBtnDisabled} {episodeAddedText}
        {currentStatus} {selectOptions}
        onToggleFavorite={toggleFavorite}
        onWatch={handleWatch}
        onSetStatus={setStatus}
        onToggleDesc={() => { descCollapsed = !descCollapsed; }}
      />

      <ReleaseVideos releaseId={id} releaseTitle={title} />

      <!-- Rating block -->
      <ReleaseRating
        releaseId={id}
        {grade} {hasRating} {voteCount}
        {vote1} {vote2} {vote3} {vote4} {vote5}
        {yourVote}
        {watchingCount} {planCount} {completedCount} {holdOnCount} {droppedCount}
        {canVote}
        onRefresh={refreshReleaseData}
      />

      <!-- Screenshots -->
      {#if screenshots.length > 0}
        <ReleaseScreenshots {screenshots} />
      {/if}

      <!-- Related releases -->
      {#if relatedCards.length > 0 && related?.id}
        <ReleaseRelated
          releaseId={id}
          relatedId={related.id}
          items={relatedCards}
        />
      {/if}

      <!-- Recommendations -->
      <ReleaseRecommendations items={recommendedCards} />

      <!-- Comments -->
      {#if commentCount > 0 || comments.length > 0}
        <ReleaseComments releaseId={id} {comments} totalCount={commentCount} commentsRoot={release} />
      {/if}

    </section>
  {/if}
  </div>
</div>
