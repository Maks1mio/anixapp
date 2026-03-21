<script lang="ts">
  import { navigate } from '../stores/navigation';
  import { iconCheck, iconFlag, iconInfo, iconStar } from './icons';
  import { renderDotsMenu, type DotsMenuEntry } from './dots-menu';
  import { ratingHue } from './release-card-h';
  import type { ReleaseCardData } from '../types/release';
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

  let { data }: { data: ReleaseCardData } = $props();

  const id = data.id;
  const title = data.titleRu || data.titleEn || 'Без названия';
  const poster = data.poster || '';
  const ratingValue = typeof data.rating === 'number' ? data.rating : null;
  const voteCount = data.voteCount;
  const epCount = data.episodesReleased ?? data.episodesTotal ?? null;
  const desc = data.description ? truncate(data.description, DESC_MAX_LENGTH) : '';
  const myVote = typeof data.myVote === 'number' && data.myVote > 0 ? data.myVote : null;

  const genreTags = data.genres
    ?.split(',')
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, 5) ?? [];

  const hasRating = ratingValue != null && ratingValue > 0 && (voteCount ?? 0) > 0;
  const ratingHue_val = hasRating && ratingValue != null ? ratingHue(ratingValue) : 0;
  const ratingBg = hasRating ? `hsl(${ratingHue_val}, 95%, 52%)` : '';
  const ratingTextColor = hasRating ? (ratingHue_val >= 28 ? '#0b0b0b' : '#f5f5f5') : '';
  const votesLabel = voteCount != null ? formatVoteCount(voteCount) : '';

  const titleTooltipLines: string[] = [];
  if (data.titleRu) titleTooltipLines.push(`Русское: ${data.titleRu}`);
  if (data.titleEn) titleTooltipLines.push(`Оригинал: ${data.titleEn}`);
  if (data.titleAlt) titleTooltipLines.push(`Альт: ${data.titleAlt}`);
  const hasTitleTooltip = titleTooltipLines.length > 0;

  let currentStatusId: ListStatusId | null = $state(
    (data.listStatus as ListStatusId | undefined) ?? null
  );
  let isFavorite = $state(!!data.isFavorite);
  let posterError = $state(false);

  const infoParts = $derived(() => {
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
  });

  const statusLabel = $derived(currentStatusId ? STATUS_LABEL_BY_ID[currentStatusId] : null);
  const statusClass = $derived(
    currentStatusId
      ? `release-card-h release-card-h--status release-card-h--status-${currentStatusId}`
      : 'release-card-h'
  );

  let menuSlotEl: HTMLElement | undefined = $state();

  onMount(() => {
    if (!menuSlotEl) return;

    const menuWrap = renderDotsMenu({
      entries: buildEntries(),
      onSelect(entryId) {
        const api = window.anixApi;
        if (!id || !api) return;

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
    return [
      {
        id: 'favorite',
        label: isFavorite ? 'Убрать из избранного' : 'Добавить в избранное',
        icon: iconFlag(16, isFavorite),
      },
      { type: 'divider' },
      { type: 'label', text: 'СТАТУС' },
      { id: 'none', label: 'Не смотрю' },
      ...LIST_STATUSES.map((s) => ({
        id: s.id,
        label: s.label,
        icon: currentStatusId === s.id ? iconCheck(16) : undefined,
      })),
    ];
  }

  function handleLinkClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.tooltip-trigger') || target.closest('.dots-menu')) {
      e.preventDefault();
      e.stopPropagation();
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

<article class={statusClass}>
  <!-- svelte-ignore a11y_invalid_attribute -->
  <a href={id ? `/release/${id}` : '#'} class="release-card-h__link" onclick={handleLinkClick}>
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
    <div class="release-card-h__body">
      <div class="release-card-h__title-row">
        <h3 class="release-card-h__title">{title}</h3>
        {#if hasTitleTooltip}
          <span class="release-card-h__title-info tooltip-trigger" role="button" tabindex="0" aria-label="Названия">
            {@html iconInfo(14)}
            <span class="tooltip tooltip--animated">
              {#each titleTooltipLines as line, i}
                {#if i > 0}<br />{/if}{line}
              {/each}
            </span>
          </span>
        {/if}
        <span class="release-card-h__menu-slot" bind:this={menuSlotEl}></span>
      </div>

      <p class="release-card-h__meta">
        {#snippet metaBody()}
          {#if hasRating && ratingValue != null}
            <span
              class="release-card-h__rating-chip"
              style="background:{ratingBg};color:{ratingTextColor}"
            >{ratingValue.toFixed(2)} {@html iconStar(14, true)}{#if votesLabel}<span class="release-card-h__rating-chip-votes">{votesLabel}</span>{/if}</span>
            {#if isFavorite}
              <span class="release-card-h__meta-dot">·</span><span class="release-card-h__favorite">{@html iconFlag(16, true)}</span>
            {/if}
            {#if epCount != null}
              <span class="release-card-h__meta-dot">·</span>{epCount} эп.
            {/if}
          {:else}
            {#if data.releaseDate}{data.releaseDate}{/if}
            {#if epCount != null}
              {#if data.releaseDate}<span class="release-card-h__meta-dot">·</span>{/if}{epCount} эп.
            {/if}
          {/if}
          {#if infoParts().length > 0}
            {#if hasRating || data.releaseDate || epCount != null}<span class="release-card-h__meta-dot">·</span>{/if}
            {#each infoParts() as part, i}{#if i > 0}<span class="release-card-h__meta-dot">·</span>{/if}{part}{/each}
          {/if}
          {#if !hasRating && !data.releaseDate && epCount == null && infoParts().length === 0}—{/if}
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
    </div>
  </a>
</article>
