<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../../../../stores/navigation';
  import { toPosterDisplayUrl } from '../../../../utils/posterUrl';
  import { resolveJacksonRefs } from '../../../../utils/jackson-refs';

  interface Props {
    items: Record<string, unknown>[];
    profileId: number;
    pageSize?: number;
    isMyProfile?: boolean;
  }

  let { items: previewItems, profileId, pageSize = 25, isMyProfile = false }: Props = $props();

  let allItems = $state<Record<string, unknown>[]>([]);
  let currentPage = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'ready' | 'empty' | 'error'>('loading');
  let errorMsg = $state('');
  let rootEl = $state<HTMLElement | undefined>();

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  function voteId(item: Record<string, unknown>): number {
    return Number(item.id ?? (item.release as { id?: number } | undefined)?.id ?? 0);
  }

  function normalizeVoteItem(raw: Record<string, unknown>): Record<string, unknown> | null {
    const release = (raw.release && typeof raw.release === 'object'
      ? raw.release as Record<string, unknown>
      : raw);
    const id = Number(release.id ?? raw.id ?? 0);
    if (!id) return null;

    const posterObj = release.poster && typeof release.poster === 'object'
      ? release.poster as { original?: { url?: string }; medium?: { url?: string } }
      : null;
    const imageCandidate =
      release.image
      ?? posterObj?.original?.url
      ?? posterObj?.medium?.url
      ?? (typeof release.poster === 'string' && release.poster !== 'string' ? release.poster : undefined);

    return {
      ...release,
      id,
      image: imageCandidate ? String(imageCandidate) : '',
      title_ru: release.title_ru ?? release.titleRu ?? raw.title_ru,
      title_original: release.title_original ?? release.titleOriginal ?? raw.title_original,
      my_vote: Number(raw.my_vote ?? release.my_vote ?? 0) || undefined,
    };
  }

  function mergeUnique(existing: Record<string, unknown>[], incoming: Record<string, unknown>[]) {
    const ids = new Set(existing.map(voteId));
    const next = [...existing];
    for (const item of incoming) {
      const normalized = normalizeVoteItem(item);
      if (!normalized) continue;
      const id = voteId(normalized);
      if (!id || ids.has(id)) continue;
      ids.add(id);
      next.push(normalized);
    }
    return next;
  }

  async function fetchPage(page: number): Promise<{ content: Record<string, unknown>[]; exhausted: boolean }> {
    if (!profileId || !window.anixApi?.profile?.getVotedReleases) {
      return { content: [], exhausted: true };
    }
    const data = resolveJacksonRefs(
      await window.anixApi.profile.getVotedReleases(profileId, page, 1) as Record<string, unknown>,
    );
    const content = Array.isArray(data?.content) ? data.content as Record<string, unknown>[] : [];
    const totalCount = Number(data?.total_count ?? 0);
    const exhausted =
      data?.last === true
      || content.length === 0
      || content.length < pageSize
      || (totalCount > 0 && (page + 1) * pageSize >= totalCount);
    return { content, exhausted };
  }

  function attachInfiniteScroll() {
    if (scrollListener) return;
    const el = rootEl?.closest('[data-profile-main-scroll], .page__scroll') as HTMLElement | null;
    if (!el) return;
    scrollEl = el;
    scrollListener = () => {
      if (!hasMore || isLoading) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 240) void loadMore(true);
    };
    el.addEventListener('scroll', scrollListener);
  }

  async function loadMore(append: boolean) {
    if (isLoading || (!hasMore && append)) return;
    isLoading = true;
    try {
      const { content, exhausted } = await fetchPage(currentPage);
      if (!content.length) {
        hasMore = false;
        if (!allItems.length) loadState = 'empty';
        else loadState = 'ready';
        return;
      }
      allItems = mergeUnique(allItems, content);
      currentPage += 1;
      hasMore = !exhausted;
      loadState = allItems.length ? 'ready' : 'empty';
      attachInfiniteScroll();
    } catch (err) {
      if (!append && !allItems.length) {
        loadState = 'error';
        errorMsg = String(err);
      } else {
        hasMore = false;
        loadState = 'ready';
      }
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    const preview = mergeUnique([], previewItems);
    allItems = preview;
    loadState = preview.length ? 'ready' : 'loading';
    // Догружаем полный список с API (page 0), чтобы показать все оценки
    void loadMore(false).then(() => {
      if (!allItems.length && preview.length) {
        allItems = preview;
        loadState = 'ready';
        hasMore = false;
      }
      attachInfiniteScroll();
    });
  });

  onDestroy(() => {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
  });
</script>

<div class="profile-ui__votes" bind:this={rootEl}>
  {#if loadState === 'loading' && !allItems.length}
    <p class="profile-ui__state">Загрузка оценок…</p>
  {:else if loadState === 'error' && !allItems.length}
    <p class="profile-ui__state">{errorMsg || 'Не удалось загрузить оценки'}</p>
  {:else if loadState === 'empty' || !allItems.length}
    <p class="profile-ui__state">Нет оценок</p>
  {:else}
    <div class="profile-ui__votes-grid">
      {#each allItems as item (voteId(item))}
        <button type="button" class="profile-ui__vote-card" onclick={() => navigate(`/release/${voteId(item)}`)}>
          {#if item.image}
            <div class="profile-ui__vote-poster">
              <img
                src={toPosterDisplayUrl(String(item.image), 'cardVertical')}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </div>
          {:else}
            <div class="profile-ui__vote-poster"></div>
          {/if}
          <div class="profile-ui__vote-body">
            <span class="profile-ui__vote-title">{item.title_ru || item.title_original || 'Без названия'}</span>
            {#if item.my_vote}
              <div class="profile-ui__vote-stars" aria-label="Оценка {item.my_vote} из 5">
                {#each Array.from({ length: 5 }, (_, i) => i) as i}
                  <svg width="11" height="11" viewBox="0 0 24 24"
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
    </div>

    {#if isLoading}
      <p class="profile-ui__state">Загрузка…</p>
    {:else if hasMore}
      <button type="button" class="profile-ui__votes-more" onclick={() => void loadMore(true)}>
        Показать ещё
      </button>
    {/if}
    {#if allItems.length && loadState === 'ready'}
      <button
        type="button"
        class="profile-ui__votes-more"
        onclick={() => navigate(isMyProfile ? '/bookmarks?tab=votes' : `/bookmarks?tab=votes&user=${profileId}`)}
      >
        Открыть все оценки
      </button>
    {/if}
  {/if}
</div>
