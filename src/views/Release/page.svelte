<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from '../../stores/navigation';
  import { openWatchModal } from '../../stores/modals';
  import { buildPosterUrl } from '../../utils/posterUrl';
  import ReleaseCardsGrid from '../../components/ReleaseCardsGrid.svelte';
  import type { SelectOption } from '../../components/Select.svelte';
  import { LIST_STATUSES, type ListStatusId } from './_types';
  import {
    getAgeRateText, getSeasonName, stripHtmlToText, sanitizeRichHtml,
    numToStatusId, ratingHue, mapCardData,
  } from './_utils';
  import { ReleaseHead, ReleaseRating, ReleaseScreenshots, ReleaseComments } from './components';

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
  const title         = $derived(titleRu || titleOriginal || 'Без названия');
  const desc          = $derived((release?.description ?? '') as string);
  const descClean     = $derived(desc ? stripHtmlToText(desc) : '');
  const descHtml      = $derived(desc ? sanitizeRichHtml(desc) : '');
  const descNeedsTruncate = $derived(descClean.length > 300);
  const noteHtml      = $derived(release?.note ? sanitizeRichHtml(release.note as string) : '');

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
  const watchingCount  = $derived((release?.watching_count  ?? 0) as number);
  const planCount      = $derived((release?.plan_count      ?? 0) as number);
  const completedCount = $derived((release?.completed_count ?? 0) as number);
  const holdOnCount    = $derived((release?.hold_on_count   ?? 0) as number);
  const droppedCount   = $derived((release?.dropped_count   ?? 0) as number);
  const totalList      = $derived(watchingCount + planCount + completedCount + holdOnCount + droppedCount);

  // ── Derived: meta ─────────────────────────────────────────────────────────
  const year         = $derived(release?.year != null ? String(release.year) : '');
  const country      = $derived((release?.country ?? '') as string);
  const episodesReleased = $derived(release?.episodes_released as number | null | undefined);
  const episodesTotal    = $derived(release?.episodes_total    as number | null | undefined);
  const statusName   = $derived((release?.status   as { name?: string } | undefined)?.name ?? '');
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
  const releaseId    = $derived(release?.id as number | undefined);

  const airedText = $derived.by(() => {
    if (airedOnDate && airedOnDate > 0) {
      const d = new Date(airedOnDate * 1000);
      const months = ['янв.','февр.','мар.','апр.','мая','июн.','июл.','авг.','сен.','окт.','нояб.','дек.'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} г.`;
    }
    return releaseDate;
  });

  const playBtnText     = $derived.by(() => {
    if (isViewBlocked) return 'Недоступно';
    if (!episodesReleased || episodesReleased <= 0) return airedText ? `${airedText}` : 'Скоро';
    return 'Воспроизвести';
  });
  const playBtnDisabled = $derived(isViewBlocked || !episodesReleased || episodesReleased <= 0);

  const metaInfoRows = $derived.by(() => {
    const rows: Array<{ icon: string; text: string }> = [];
    const parts: string[] = [];
    if (country) parts.push(country);
    if (seasonName && year) parts.push(`${seasonName} ${year} г.`);
    else if (year) parts.push(`${year} г.`);
    if (parts.length) rows.push({ icon: '🌍', text: parts.join(', ') });

    let epText = '';
    if (episodesReleased != null && episodesTotal != null && episodesTotal > 0) epText = `${episodesReleased} из ${episodesTotal} эп.`;
    else if (episodesReleased != null) epText = `${episodesReleased} эп.`;
    else if (episodesTotal    != null) epText = `${episodesTotal} эп.`;
    if (duration && duration > 0) epText += epText ? ` по ~${duration} мин.` : `~${duration} мин.`;
    if (epText) rows.push({ icon: '🎬', text: epText });

    const catParts: string[] = [];
    if (categoryName) catParts.push(categoryName);
    if (statusName)   catParts.push(statusName);
    if (catParts.length) rows.push({ icon: '📺', text: catParts.join(', ') });

    const studioParts: string[] = [];
    if (studio)   studioParts.push(`Студия ${studio}`);
    if (author)   studioParts.push(`автор ${author}`);
    if (director) studioParts.push(`режиссёр ${director}`);
    if (studioParts.length) rows.push({ icon: '🎨', text: studioParts.join(', ') });

    if (source) rows.push({ icon: '📖', text: `Источник: ${source}` });
    if (genres) rows.push({ icon: '🏷️', text: genres });
    return rows;
  });

  // ── Derived: lists / related / screenshots ────────────────────────────────
  const screenshots   = $derived.by(() => {
    if (!release) return [] as string[];
    const si = release.screenshot_images as string[] | undefined;
    if (si) return si;
    return ((release.screenshots as string[] | undefined) ?? [])
      .map(u => u.startsWith('http') ? u : `https://s.anixmirai.com/screenshots/${u}.jpg`);
  });

  const related          = $derived(release?.related as { id?: number; name_ru?: string; release_count?: number } | null | undefined);
  const relatedReleases  = $derived((release?.related_releases  ?? []) as Record<string, unknown>[]);
  const recommended      = $derived((release?.recommended_releases ?? []) as Record<string, unknown>[]);
  const comments         = $derived((release?.comments ?? []) as Array<{ id?: number; profile?: { nickname?: string; avatar?: string }; message?: string; timestamp?: number }>);
  const relatedCards     = $derived(relatedReleases.map(r => mapCardData(r)));
  const recommendedCards = $derived(recommended.map(r => mapCardData(r)));

  // ── Select options ────────────────────────────────────────────────────────
  const selectOptions = $derived([
    { value: '', label: 'Не в списке' },
    ...LIST_STATUSES.map(s => ({ value: s.id, label: s.label })),
  ] as SelectOption[]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function toggleFavorite() {
    if (!window.anixApi || !releaseId) return;
    try {
      if (isFavorite) await window.anixApi.release.removeFavorite(releaseId);
      else            await window.anixApi.release.addFavorite(releaseId);
      isFavorite     = !isFavorite;
      favoritesCount = Math.max(0, favoritesCount + (isFavorite ? 1 : -1));
    } catch { /* ignore */ }
  }

  function handleWatch() {
    if (!releaseId) return;
    if ((window as any).electron?.openPlayerWindow) {
      openWatchModal(releaseId, titleRu || title || titleOriginal || 'Без названия');
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

  // ── Load ──────────────────────────────────────────────────────────────────
  onMount(async () => {
    if (!window.anixApi) {
      errorMsg  = 'API недоступно (только в Electron).';
      loadState = 'error';
      return;
    }
    try {
      const data = await window.anixApi.release.info(id, true) as any;
      const raw  = data?.release ?? data;
      if (!raw || (raw.id == null && !raw.title_ru && !raw.title_original)) {
        errorMsg  = 'Релиз не найден.';
        loadState = 'error';
        return;
      }
      release        = raw as Record<string, unknown>;
      isFavorite     = !!(raw.is_favorite);
      favoritesCount = (raw.favorites_count ?? 0) as number;
      currentStatus  = numToStatusId(raw.profile_list_status as number | null | undefined);
      loadState      = 'ready';

      const posterVal = buildPosterUrl(
        typeof raw.poster === 'string' ? raw.poster :
        (raw.poster as any)?.original?.url ?? (raw.poster as any)?.medium?.url ?? (typeof raw.image === 'string' ? raw.image : '')
      );
      window.dispatchEvent(new CustomEvent('discord:releaseView', {
        detail: { title: raw.title_ru || raw.title_original || '', posterUrl: posterVal || undefined },
      }));
    } catch (err) {
      errorMsg  = String(err);
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

      <!-- Head: poster + info -->
      <ReleaseHead
        {posterUrl} {title} {titleRu} {titleOriginal}
        {ageRateText} {ageIsRestricted}
        {grade} {voteCount} {hasRating} {ratingBg} {ratingTextColor}
        {isFavorite} {favoritesCount}
        {noteHtml} {descHtml} {descClean} {descNeedsTruncate} {descCollapsed}
        {metaInfoRows} {playBtnText} {playBtnDisabled}
        {currentStatus} {selectOptions}
        onToggleFavorite={toggleFavorite}
        onWatch={handleWatch}
        onSetStatus={setStatus}
        onToggleDesc={() => { descCollapsed = !descCollapsed; }}
      />

      <!-- Rating block -->
      {#if voteCount > 0 || totalList > 0}
        <ReleaseRating
          {grade} {hasRating} {voteCount}
          {vote1} {vote2} {vote3} {vote4} {vote5}
          {watchingCount} {planCount} {completedCount} {holdOnCount} {droppedCount}
        />
      {/if}

      <!-- Screenshots -->
      {#if screenshots.length > 0}
        <ReleaseScreenshots {screenshots} />
      {/if}

      <!-- Related releases -->
      {#if related?.id && (relatedCards.length > 0 || (related.release_count ?? 0) > 0)}
        <div class="release-page__section">
          <h2 class="release-page__section-title">
            <button
              type="button"
              class="release-page__section-link"
              onclick={() => navigate(`/release/${related!.id}/related`)}
            >{related.name_ru || 'Франшиза'}</button>
            {#if relatedCards.length > 0} · Связанные релизы{/if}
          </h2>
          <ReleaseCardsGrid items={relatedCards.slice(0, 12)} />
        </div>
      {/if}

      <!-- Recommendations -->
      {#if recommendedCards.length > 0}
        <div class="release-page__section">
          <h2 class="release-page__section-title">Рекомендации</h2>
          <ReleaseCardsGrid items={recommendedCards} />
        </div>
      {/if}

      <!-- Comments -->
      {#if comments.length > 0}
        <ReleaseComments {comments} />
      {/if}

    </section>
  {/if}
</div>
