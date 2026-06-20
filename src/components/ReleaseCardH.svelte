<script lang="ts">
  import { navigate } from '../stores/navigation';
  import { toCdnProxyUrl } from '../utils/posterUrl';
  import { iconCheck, iconFlag, iconStar, iconClock, iconCircleCheck } from './icons';
  import TitleInfoTrigger from './TitleInfoTrigger.svelte';
  import { renderDotsMenu, type DotsMenuEntry } from './dots-menu';
  import { ratingHue } from './release-card-h';
  import type { ReleaseCardData } from '../types/release';
  import { formatHistoryViewTime } from '../utils/historyFormat';
  import { onMount } from 'svelte';

  const LIST_STATUSES = [
    { id: 'watching', label: 'Смотрю' },
    { id: 'planned', label: 'В планах' },
    { id: 'completed', label: 'Просмотрено' },
    { id: 'dropped', label: 'Брошено' },
    { id: 'on_hold', label: 'Отложено' },
  ] as const;

  type ListStatusId = (typeof LIST_STATUSES)[number]['id'];

  const STATUS_LABEL_BY_ID: Record<ListStatusId, string> = {
    watching: 'Смотрю',
    planned: 'В планах',
    completed: 'Просмотрено',
    dropped: 'Брошено',
    on_hold: 'Отложено',
  };

  const DESC_MAX_LENGTH = 200;

  function truncate(str: string, max: number): string {
    if (str.length <= max) return str;
    return str.slice(0, max).trim() + '...';
  }

  function formatVoteCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  let {
    data,
    loading = false,
    variant = 'default',
    relatedChain,
    onDeleteFromHistory,
  }: {
    data?: ReleaseCardData;
    loading?: boolean;
    variant?: 'default' | 'history' | 'related';
    relatedChain?: { isFirst: boolean; isLast: boolean; isCurrent?: boolean };
    onDeleteFromHistory?: (id: number) => void;
  } = $props();

  const isHistory = $derived(variant === 'history' || !!data?.historyView);
  const isRelated = $derived(variant === 'related');
  const isCurrentRelated = $derived(!!relatedChain?.isCurrent);

  const id = $derived(data?.id);
  const title = $derived(data?.titleRu || data?.titleEn || 'Без названия');
  const poster = $derived(toCdnProxyUrl(data?.poster || ''));
  const ratingValue = $derived(typeof data?.rating === 'number' ? data.rating : null);
  const voteCount = $derived(data?.voteCount);
  const epCount = $derived(data?.episodesReleased ?? data?.episodesTotal ?? null);
  const desc = $derived(data?.description ? truncate(data.description, DESC_MAX_LENGTH) : '');
  const myVote = $derived(typeof data?.myVote === 'number' && data.myVote > 0 ? data.myVote : null);

  const genreTags = $derived(
    data?.genres
      ?.split(',')
      .map((g) => g.trim())
      .filter(Boolean)
      .slice(0, 5) ?? []
  );

  const hasRating = $derived(ratingValue != null && ratingValue > 0 && (voteCount ?? 0) > 0);
  const ratingHue_val = $derived(hasRating && ratingValue != null ? ratingHue(ratingValue) : 0);
  const ratingBg = $derived(hasRating ? `hsl(${ratingHue_val}, 95%, 52%)` : '');
  const ratingTextColor = $derived(hasRating ? (ratingHue_val >= 28 ? '#0b0b0b' : '#f5f5f5') : '');
  const votesLabel = $derived(voteCount != null ? formatVoteCount(voteCount) : '');

  let currentStatusId: ListStatusId | null = $state<ListStatusId | null>(null);
  let isFavorite = $state(false);
  $effect(() => {
    currentStatusId = (data?.listStatus as ListStatusId | undefined) ?? null;
    isFavorite = data?.isFavorite ?? false;
  });
  let posterError = $state(false);

  const infoParts = $derived((() => {
    if (!data) return [];
    const parts: string[] = [];
    if (data.year) parts.push(data.year);
    if (data.country) parts.push(data.country);
    if (data.status) {
      const statusText = String(data.status);
      if (!/^\s*вышел\s*$/i.test(statusText) && !/^\s*выходит\s*$/i.test(statusText)) {
        parts.push(statusText);
      }
    }
    return parts;
  })());

  const statusLabel = $derived(currentStatusId ? STATUS_LABEL_BY_ID[currentStatusId] : null);
  const statusClass = $derived(
    currentStatusId
      ? `release-card-h release-card-h--status release-card-h--status-${currentStatusId}`
      : `release-card-h${isHistory ? ' release-card-h--history' : ''}`
  );

  const historyEpisodeLabel = $derived(data?.historyView?.episodeLabel);
  const historyDubberLabel = $derived(data?.historyView?.dubberLabel);
  const historyTimeLabel = $derived(
    data?.historyView?.viewedAt != null
      ? formatHistoryViewTime(data.historyView.viewedAt)
      : undefined
  );
  const historyEpisodeLine = $derived(
    [historyEpisodeLabel, historyDubberLabel].filter(Boolean).join(' • ')
  );

  let menuSlotEl: HTMLElement | undefined = $state();

  onMount(() => {
    if (!menuSlotEl || loading) return;

    const menuWrap = renderDotsMenu({
      entries: buildEntries(),
      onSelect(entryId) {
        const api = window.anixApi;
        if (!id || !api) return;

        if (entryId === 'delete-history') {
          onDeleteFromHistory?.(id);
          return;
        }

        if (entryId === 'favorite') {
          const next = !isFavorite;
          (next ? api.release.addFavorite(id) : api.release.removeFavorite(id))
            .then(() => {
              isFavorite = next;
            })
            .catch(() => {});
          return;
        }

        if (entryId === 'none' && currentStatusId) {
          const prev = currentStatusId;
          api.release.clearListStatus(id, prev as unknown as number).then(() => {
            currentStatusId = null;
          }).catch(() => {});
          return;
        }

        if (LIST_STATUSES.some((s) => s.id === entryId)) {
          const nextStatus = entryId as ListStatusId;
          api.release.setListStatus(id, nextStatus as unknown as number).then(() => {
            currentStatusId = nextStatus;
          }).catch(() => {});
        }
      },
    });

    menuSlotEl.appendChild(menuWrap);
  });

  function buildEntries(): DotsMenuEntry[] {
    if (isHistory) {
      return [
        { id: 'delete-history', label: 'Удалить из истории' },
        { type: 'divider' },
        {
          id: 'favorite',
          label: isFavorite ? 'Убрать из избранного' : 'Добавить в избранное',
          icon: iconFlag(16, isFavorite),
        },
        { type: 'divider' },
        { type: 'label', text: 'СТАТУС' },
        { id: 'none', label: 'Не в списке' },
        ...LIST_STATUSES.map((s) => ({
          id: s.id,
          label: s.label,
          icon: currentStatusId === s.id ? iconCheck(16) : undefined,
        })),
      ];
    }

    return [
      {
        id: 'favorite',
        label: isFavorite ? 'Убрать из избранного' : 'Добавить в избранное',
        icon: iconFlag(16, isFavorite),
      },
      { type: 'divider' },
      { type: 'label', text: 'СТАТУС' },
      { id: 'none', label: 'Не в списке' },
      ...LIST_STATUSES.map((s) => ({
        id: s.id,
        label: s.label,
        icon: currentStatusId === s.id ? iconCheck(16) : undefined,
      })),
    ];
  }

  function handleLinkClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.tooltip-trigger') || target.closest('.title-info-popover') || target.closest('.dots-menu')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (isCurrentRelated) {
      e.preventDefault();
      return;
    }
    if (id) {
      e.preventDefault();
      navigate(`/release/${id}`);
    }
  }

  function handlePosterError() {
    posterError = true;
  }
</script>

<article
  class={statusClass}
  class:release-card-h--skeleton={loading}
  class:release-card-h--related={isRelated}
  class:release-card-h--related-first={isRelated && relatedChain?.isFirst}
  class:release-card-h--related-last={isRelated && relatedChain?.isLast}
  class:release-card-h--current-related={isCurrentRelated}
>
  {#if loading}
    <div class="release-card-h__skeleton">
      <div class="release-card-h__poster release-card-h__skeleton-poster"></div>
      <div class="release-card-h__body">
        <div class="release-card-h__skeleton-title"></div>
        <div class="release-card-h__skeleton-meta"></div>
        <div class="release-card-h__skeleton-desc"></div>
      </div>
    </div>
  {:else}
  <!-- svelte-ignore a11y_invalid_attribute -->
  <a
    href={id && !isCurrentRelated ? `/release/${id}` : '#'}
    class="release-card-h__link"
    class:release-card-h__link--related={isRelated}
    onclick={handleLinkClick}
    aria-current={isCurrentRelated ? 'page' : undefined}
  >
    {#if isRelated}
      <div class="release-card-h__poster-col">
        {#if !relatedChain?.isFirst}
          <div class="release-card-h__chain-line release-card-h__chain-line--top" aria-hidden="true"></div>
        {/if}
        <div class="release-card-h__poster">
          {#if poster && !posterError}
            <img src={poster} alt="" loading="lazy" onerror={handlePosterError} />
          {:else}
            <div class="release-card-h__no-poster"></div>
          {/if}
          {#if statusLabel}
            <div class="release-card-h__status-badge">{statusLabel}</div>
          {/if}
        </div>
        {#if !relatedChain?.isLast}
          <div class="release-card-h__chain-line release-card-h__chain-line--bottom" aria-hidden="true"></div>
        {/if}
      </div>
    {:else}
    <div class="release-card-h__poster">
      {#if poster && !posterError}
        <img src={poster} alt="" loading="lazy" onerror={handlePosterError} />
      {:else}
        <div class="release-card-h__no-poster"></div>
      {/if}
      {#if statusLabel}
        <div class="release-card-h__status-badge">{statusLabel}</div>
      {/if}
    </div>
    {/if}
    <div class="release-card-h__body">
      <div class="release-card-h__title-row">
        <h3 class="release-card-h__title">{title}</h3>
        <TitleInfoTrigger
          titleRu={data?.titleRu}
          titleEn={data?.titleEn}
          titleAlt={data?.titleAlt}
          className="release-card-h__title-info"
        />
        <span class="release-card-h__menu-slot" bind:this={menuSlotEl}></span>
      </div>

      <p class="release-card-h__meta">
        {#snippet metaBody()}
          {#if hasRating && ratingValue != null}
            <span
              class="release-card-h__rating-chip"
              style="background:{ratingBg};color:{ratingTextColor}"
            >{ratingValue.toFixed(2)} {@html iconStar(14, true)}{#if votesLabel}<span class="release-card-h__rating-chip-votes">{votesLabel}</span>{/if}</span>
          {/if}
          {#if isFavorite}
            {#if hasRating && ratingValue != null}<span class="release-card-h__meta-dot">·</span>{/if}
            <span class="release-card-h__favorite">{@html iconFlag(16, true)}</span>
          {/if}
          {#if !hasRating}
            {#if data?.releaseDate}
              {#if isFavorite}<span class="release-card-h__meta-dot">·</span>{/if}{data.releaseDate}
            {/if}
          {/if}
          {#if epCount != null}
            {#if hasRating || isFavorite || data?.releaseDate}<span class="release-card-h__meta-dot">·</span>{/if}{epCount} эп.
          {/if}
          {#if infoParts.length > 0}
            {#if hasRating || isFavorite || data?.releaseDate || epCount != null}<span class="release-card-h__meta-dot">·</span>{/if}
            {#each infoParts as part, i}{#if i > 0}<span class="release-card-h__meta-dot">·</span>{/if}{part}{/each}
          {/if}
          {#if !hasRating && !isFavorite && !data?.releaseDate && epCount == null && infoParts.length === 0}—{/if}
        {/snippet}
        {@render metaBody()}
        {#if myVote != null}
          <span class="release-card-h__meta-dot">·</span>
          <span class="release-card-h__my-vote">
            <span class="release-card-h__my-vote-label">Ваша оценка</span>
            <span class="release-card-h__my-vote-stars">
              {#each Array.from({ length: 5 }, (_, i) => i) as i}
                <span class={i < myVote ? 'release-card-h__star--on' : 'release-card-h__star--off'}>★</span>
              {/each}
            </span>
          </span>
        {/if}
      </p>

      {#if genreTags.length > 0}
        <div class="release-card-h__genres">
          {#each genreTags as genre}
            <span class="release-card-h__tag">{genre}</span>
          {/each}
        </div>
      {/if}

      {#if desc}
        <p class="release-card-h__desc">{desc}</p>
      {/if}

      {#if isHistory && (historyEpisodeLine || historyTimeLabel)}
        <div class="release-card-h__history-block">
          {#if historyEpisodeLine}
            <p class="release-card-h__history-line">
              <span class="release-card-h__history-icon release-card-h__history-icon--episode" aria-hidden="true">
                {@html iconCircleCheck(14)}
              </span>
              <span>{historyEpisodeLine}</span>
            </p>
          {/if}
          {#if historyTimeLabel}
            <p class="release-card-h__history-line">
              <span class="release-card-h__history-icon release-card-h__history-icon--time" aria-hidden="true">
                {@html iconClock(14)}
              </span>
              <span>{historyTimeLabel}</span>
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </a>
  {/if}
</article>
