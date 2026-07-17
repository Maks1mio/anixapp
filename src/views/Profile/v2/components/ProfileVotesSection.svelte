<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from '../../../../stores/navigation';
  import { posterUrl } from '../../_utils';

  interface Props {
    items: Record<string, unknown>[];
    profileId: number;
    pageSize?: number;
  }

  let { items: previewItems, profileId, pageSize = 20 }: Props = $props();

  const GRID_STEP = 12;

  let allItems = $state<Record<string, unknown>[]>([]);
  let visibleCount = $state(GRID_STEP);
  let currentPage = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let initialized = $state(false);

  const displayed = $derived(allItems.slice(0, visibleCount));
  const showMoreCard = $derived(visibleCount < allItems.length || hasMore);

  function mergeUnique(existing: Record<string, unknown>[], incoming: Record<string, unknown>[]) {
    const ids = new Set(existing.map((i) => Number(i.id)));
    const next = [...existing];
    for (const item of incoming) {
      const id = Number(item.id);
      if (!id || ids.has(id)) continue;
      ids.add(id);
      next.push(item);
    }
    return next;
  }

  async function fetchPage(page: number): Promise<Record<string, unknown>[]> {
    if (!profileId || !window.anixApi?.profile?.getVotedReleases) return [];
    const data = await window.anixApi.profile.getVotedReleases(profileId, page) as {
      content?: Record<string, unknown>[];
    };
    return data?.content ?? [];
  }

  async function loadMore() {
    if (isLoading) return;

    if (visibleCount < allItems.length) {
      visibleCount = Math.min(visibleCount + GRID_STEP, allItems.length);
      return;
    }

    if (!hasMore) return;

    isLoading = true;
    try {
      const content = await fetchPage(currentPage);
      if (!content.length) {
        hasMore = false;
        isLoading = false;
        return;
      }
      allItems = mergeUnique(allItems, content);
      currentPage += 1;
      visibleCount = Math.min(visibleCount + GRID_STEP, allItems.length);
      hasMore = content.length >= pageSize;
    } catch {
      hasMore = false;
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    allItems = [...previewItems];
    visibleCount = Math.min(GRID_STEP, allItems.length);
    currentPage = 0;
    hasMore = true;
    initialized = true;
  });
</script>

<div class="profile-ui__votes">
  {#if !initialized && !displayed.length}
    <p class="profile-ui__state">Загрузка оценок…</p>
  {:else if !displayed.length}
    <p class="profile-ui__state">Нет оценок</p>
  {:else}
    <div class="profile-ui__votes-grid">
      {#each displayed as item (item.id)}
        <button type="button" class="profile-ui__vote-card" onclick={() => navigate(`/release/${item.id}`)}>
          {#if item.image}
            <div
              class="profile-ui__vote-poster"
              style="background-image:url('{posterUrl(String(item.image))}')"
            ></div>
          {:else}
            <div class="profile-ui__vote-poster"></div>
          {/if}
          <div class="profile-ui__vote-body">
            <span class="profile-ui__vote-title">{item.title_ru || item.title_original || 'Без названия'}</span>
            {#if item.my_vote}
              <div class="profile-ui__vote-stars" aria-label="Оценка {item.my_vote} из 5">
                {#each Array.from({ length: 5 }, (_, i) => i) as i}
                  <svg width="10" height="10" viewBox="0 0 24 24"
                    fill={i < Number(item.my_vote) ? 'currentColor' : 'none'}
                    stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
                  </svg>
                {/each}
              </div>
            {/if}
          </div>
        </button>
      {/each}

      {#if showMoreCard}
        <button
          type="button"
          class="profile-ui__more-card"
          disabled={isLoading}
          onclick={() => void loadMore()}
        >
          {#if isLoading}
            <span class="profile-ui__more-card-icon">…</span>
            <span class="profile-ui__more-card-label">Загрузка</span>
          {:else}
            <span class="profile-ui__more-card-icon">+</span>
            <span class="profile-ui__more-card-label">Показать ещё</span>
          {/if}
        </button>
      {/if}
    </div>
  {/if}
</div>
