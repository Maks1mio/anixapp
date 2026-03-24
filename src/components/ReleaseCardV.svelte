<script lang="ts">
  import { navigate } from '../stores/navigation';
  import { iconCheck, iconFlag, iconStar } from './icons';
  import { renderDotsMenu, type DotsMenuEntry } from './dots-menu';
  import { ratingHue } from './release-card-h';
  import type { ReleaseCardData } from '../types/release';
  import { onMount } from 'svelte';

  type ListStatusId = 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped';

  const LIST_STATUSES = [
    { id: 'watching' as const, label: 'Смотрю' },
    { id: 'planned' as const, label: 'В планах' },
    { id: 'completed' as const, label: 'Просмотрено' },
    { id: 'dropped' as const, label: 'Брошено' },
    { id: 'on_hold' as const, label: 'Отложено' },
  ];

  const STATUS_LABEL: Record<ListStatusId, string> = {
    watching: 'смотрю',
    planned: 'в планах',
    completed: 'просмотрено',
    dropped: 'брошено',
    on_hold: 'отложено',
  };

  const STATUS_COLOR: Record<ListStatusId, string> = {
    watching: 'rgba(56, 161, 105, 0.85)',
    planned: 'rgba(139, 92, 246, 0.85)',
    completed: 'rgba(59, 130, 246, 0.85)',
    on_hold: 'rgba(180, 143, 59, 0.85)',
    dropped: 'rgba(185, 68, 68, 0.85)',
  };

  let { data, loading = false }: { data?: ReleaseCardData; loading?: boolean } = $props();

  const id = $derived(data?.id);
  const title = $derived(data?.titleRu || data?.titleEn || 'Без названия');
  const poster = $derived(data?.poster || '');
  const ratingValue = $derived(typeof data?.rating === 'number' ? data.rating : null);
  const myVote = $derived(typeof data?.myVote === 'number' && data.myVote > 0 ? data.myVote : null);

  let currentStatusId: ListStatusId | null = $state<ListStatusId | null>(null);
  let isFavorite = $state(false);
  $effect(() => {
    currentStatusId = (data?.listStatus as ListStatusId | undefined) ?? null;
    isFavorite = !!data?.isFavorite;
  });
  let posterError = $state(false);

  // Computed
  const epCount = $derived(data?.episodesReleased ?? data?.episodesTotal ?? null);
  const hasRating = $derived(
    ratingValue != null && ratingValue > 0 && (data?.voteCount ?? 0) > 0
  );
  const ratingHtml = $derived(
    hasRating && ratingValue != null
      ? `<span class="release-card-v__rating" style="color:hsl(${ratingHue(ratingValue)}, 95%, 52%)">${ratingValue.toFixed(1)} ${iconStar(12, true)}</span>`
      : ''
  );
  const metaParts = $derived((() => {
    if (!data) return [];
    const parts: string[] = [];
    if (epCount != null) parts.push(`${epCount} эп.`);
    if (data.year) parts.push(data.year);
    if (data.status) {
      const statusText = String(data.status);
      if (!/^\s*вышел\s*$/i.test(statusText) && !/^\s*выходит\s*$/i.test(statusText)) {
        parts.push(statusText);
      }
    }
    if (!hasRating && data.releaseDate) parts.push(data.releaseDate);
    return parts;
  })());

  // DotsMenu slot ref
  let menuSlotEl: HTMLElement | undefined = $state();

  onMount(() => {
    if (!menuSlotEl || loading) return;

    const buildEntries = (): DotsMenuEntry[] => [
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

    const menuWrap = renderDotsMenu({
      entries: buildEntries(),
      iconSize: 18,
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

  function handleLinkClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.dots-menu')) {
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

<article class="release-card-v" class:release-card-v--skeleton={loading}>
  {#if loading}
    <div class="release-card-v__skeleton">
      <div class="release-card-v__poster release-card-v__skeleton-poster"></div>
      <div class="release-card-v__body">
        <div class="release-card-v__skeleton-title"></div>
        <div class="release-card-v__skeleton-meta"></div>
      </div>
    </div>
  {:else}
  <!-- svelte-ignore a11y_invalid_attribute -->
  <a href={id ? `/release/${id}` : '#'} class="release-card-v__link" onclick={handleLinkClick}>
    <div class="release-card-v__poster">
      {#if poster && !posterError}
        <img src={poster} alt="" loading="lazy" onerror={handlePosterError} />
      {:else}
        <div class="release-card-v__no-poster"></div>
      {/if}
      <span class="release-card-v__menu-slot" bind:this={menuSlotEl}></span>
      {#if currentStatusId && STATUS_LABEL[currentStatusId]}
        <div
          class="release-card-v__badge"
          style="background:{STATUS_COLOR[currentStatusId]}"
        >{STATUS_LABEL[currentStatusId]}</div>
      {/if}
    </div>
    <div class="release-card-v__body">
      <h3 class="release-card-v__title">{title}</h3>
      <p class="release-card-v__meta">
        {#if myVote != null}
          <span class="release-card-v__my-vote">
            {#each Array.from({ length: 5 }, (_, i) => i) as i}
              <span class={i < myVote ? 'release-card-v__star--on' : 'release-card-v__star--off'}>★</span>
            {/each}
          </span>
        {:else}
          {#each metaParts as part, i}
            {#if i > 0}<span class="release-card-v__dot">·</span>{/if}{part}
          {/each}
          {#if hasRating && ratingValue != null}
            {#if metaParts.length > 0}<span class="release-card-v__dot">·</span>{/if}
            {@html ratingHtml}
          {/if}
          {#if isFavorite}
            <span class="release-card-v__favorite">{@html iconFlag(12, true)}</span>
          {/if}
        {/if}
      </p>
    </div>
  </a>
  {/if}
</article>
