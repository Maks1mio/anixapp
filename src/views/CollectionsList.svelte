<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import CollectionCard from '../components/CollectionCard.svelte';
  import UiV2CollectionCardSkeleton from '../components/uikit-v2/UiV2CollectionCardSkeleton.svelte';
  import CollectionsHeaderActions from '../components/collections/CollectionsHeaderActions.svelte';
  import DiscoverHero from '../components/DiscoverHero.svelte';
  import UiV2Tabs from '../components/uikit-v2/UiV2Tabs.svelte';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import { iconFolder, iconLayoutGrid, iconPlus } from '../components/icons';
  import { navigate } from '../stores/navigation';
  import { requireAuth } from '../stores/auth';
  import { ensureProfileId } from '../utils/profile';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import {
    COLLECTION_SORT_OPTIONS,
    collectionsBackdropUrl,
    defaultCollectionListSort,
    initialCollectionListPage,
    initialCollectionPreviousPage,
    clearCollectionEditorDraft,
    mapCollectionCard,
  } from '../utils/collection';
  import type { CollectionCardData } from '../components/CollectionCard.svelte';
  import {
    buildViewStateKey,
    getViewState,
    saveViewStateWithScroll,
    restoreScrollTop,
    registerActiveScrollKey,
    saveViewStateData,
  } from '../stores/view-state';

  interface CollectionsViewState {
    items: CollectionCardData[];
    page: number;
    previousPage: number;
    hasMore: boolean;
    loadState: 'loading' | 'error' | 'empty' | 'ready';
    errorMsg: string;
    selectedSort: number;
  }

  interface Props {
    week?: boolean;
    /** Режим «Мои» (/collections/my) — та же страница, список коллекций профиля */
    mine?: boolean;
  }

  let { week = false, mine = false }: Props = $props();

  let items = $state<CollectionCardData[]>([]);
  let page = $state(0);
  let previousPage = $state(-1);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let selectedSort = $state(defaultCollectionListSort());
  let profileId: number | null = null;
  /** Растёт при каждом сбросе списка — ответы устаревших запросов отбрасываются */
  let loadToken = 0;
  /** Общий список, пока открыт режим «Мои» — возврат без перезагрузки */
  let allSnapshot: CollectionsViewState | null = null;
  let mounted = false;
  let shownMine = false;

  let wrapEl: HTMLElement | undefined = $state();
  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;
  let unregisterScrollKey: (() => void) | null = null;

  const listSort = $derived(week ? 4 : selectedSort);
  const listWhere = $derived(week ? 2 : 1);
  const pageTitle = $derived(week ? 'Коллекции недели' : mine ? 'Мои коллекции' : 'Коллекции');
  const pageSubtitle = $derived(
    week
      ? 'Лучшие подборки за неделю'
      : mine
        ? 'Ваши подборки релизов'
        : 'Пользовательские коллекции релизов',
  );

  const heroBackdrop = $derived(collectionsBackdropUrl(items));

  const sortTabs = COLLECTION_SORT_OPTIONS.map((o) => ({ id: String(o.value), label: o.label }));

  const COLLECTIONS_VIEW_KEY = () => buildViewStateKey('/collections');

  function snapshot(): CollectionsViewState {
    return { items, page, previousPage, hasMore, loadState, errorMsg, selectedSort };
  }

  function applySnapshot(s: CollectionsViewState) {
    selectedSort = s.selectedSort;
    items = s.items;
    page = s.page;
    previousPage = s.previousPage;
    hasMore = s.hasMore;
    loadState = s.loadState;
    errorMsg = s.errorMsg;
  }

  function resetList() {
    loadToken += 1;
    isLoading = false;
    items = [];
    page = mine ? 0 : initialCollectionListPage(listSort);
    previousPage = initialCollectionPreviousPage();
    hasMore = true;
    loadState = 'loading';
  }

  function onSortChange(sort: number) {
    if (mine) {
      // Из «Моих» вкладка сортировки возвращает к общему списку
      if (allSnapshot && allSnapshot.selectedSort !== sort) allSnapshot = null;
      selectedSort = sort;
      navigate('/collections');
      return;
    }
    if (sort === selectedSort) return;
    selectedSort = sort;
    resetList();
    void loadPage();
  }

  function toggleMine() {
    if (!requireAuth()) return;
    navigate(mine ? '/collections' : '/collections/my');
  }

  function createCollection() {
    if (!requireAuth()) return;
    clearCollectionEditorDraft();
    navigate('/collections/create');
  }

  /** Переключение «Все» ↔ «Мои» без пересоздания страницы */
  function switchMode(nextMine: boolean) {
    if (nextMine === shownMine) return;
    shownMine = nextMine;
    if (nextMine) {
      if (items.length > 0) allSnapshot = snapshot();
      resetList();
      void loadPage();
      return;
    }
    const restore = allSnapshot;
    allSnapshot = null;
    if (restore && restore.items.length > 0) {
      loadToken += 1;
      isLoading = false;
      applySnapshot(restore);
      return;
    }
    resetList();
    void loadPage();
  }

  $effect(() => {
    const nextMine = mine;
    if (mounted) untrack(() => switchMode(nextMine));
  });

  async function loadMinePage(token: number) {
    if (!window.anixApi?.collection?.profileCollections) return;
    if (profileId == null) profileId = await ensureProfileId();
    if (token !== loadToken) return;
    if (profileId == null) {
      errorMsg = 'Не удалось определить профиль';
      loadState = 'error';
      return;
    }
    const nextPage = page;
    const data = (await window.anixApi.collection.profileCollections(profileId, nextPage)) as {
      content?: unknown[];
      last?: boolean;
    };
    if (token !== loadToken) return;
    const content = (data?.content ?? []) as Record<string, unknown>[];
    if (!content.length) {
      hasMore = false;
      if (items.length === 0) loadState = 'empty';
      return;
    }
    items = [...items, ...content.map(mapCollectionCard)];
    page = nextPage + 1;
    if (data.last === true || content.length < 25) hasMore = false;
    loadState = 'ready';
    requestAnimationFrame(checkIfNeedsMore);
  }

  async function loadPage() {
    if (isLoading || !hasMore) return;
    if (mine) {
      const token = loadToken;
      isLoading = true;
      try {
        await loadMinePage(token);
      } catch (err) {
        if (token === loadToken && items.length === 0) {
          errorMsg = headlineFromLoadError(err);
          loadState = 'error';
        }
      } finally {
        if (token === loadToken) isLoading = false;
      }
      return;
    }
    if (!window.anixApi?.collection?.all) return;

    const token = loadToken;
    isLoading = true;
    const nextPage = page;
    if (nextPage === initialCollectionListPage(listSort) && previousPage === initialCollectionPreviousPage() && items.length === 0 && loadState !== 'error') {
      loadState = 'loading';
    }

    try {
      const requestPage = page;
      const requestPreviousPage = previousPage;
      const data = (await window.anixApi.collection.all(requestPage, {
        sort: listSort,
        where: listWhere,
        previousPage: requestPreviousPage,
      })) as {
        content?: unknown[];
        last?: boolean;
        total_page_count?: number;
        current_page?: number;
        code?: number;
      };
      if (token !== loadToken) return;
      const content = (data?.content ?? []) as Record<string, unknown>[];
      if (data?.code != null && data.code !== 0) {
        hasMore = false;
        if (items.length === 0) {
          errorMsg = `Ошибка API (код ${data.code})`;
          loadState = 'error';
        }
        return;
      }
      if (!content.length) {
        hasMore = false;
        if (items.length === 0) loadState = 'empty';
        return;
      }
      items = [...items, ...content.map(mapCollectionCard)];
      previousPage = requestPage;
      page = requestPage + 1;
      const totalPages = typeof data.total_page_count === 'number' ? data.total_page_count : null;
      const currentPage = typeof data.current_page === 'number' ? data.current_page : requestPage;
      if (data.last === true) {
        hasMore = false;
      } else if (totalPages != null) {
        hasMore = currentPage + 1 < totalPages;
      } else {
        hasMore = content.length >= 25;
      }
      loadState = 'ready';
      requestAnimationFrame(checkIfNeedsMore);
    } catch (err) {
      if (token === loadToken && items.length === 0) {
        errorMsg = headlineFromLoadError(err);
        loadState = 'error';
      }
    } finally {
      if (token === loadToken) isLoading = false;
    }
  }

  function checkIfNeedsMore() {
    if (!scrollEl || !hasMore || isLoading) return;
    const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (distance < 300) void loadPage();
  }

  function attachScroll() {
    const el = (wrapEl?.closest('.page__scroll') as HTMLElement | null)
      ?? document.getElementById('content');
    if (!el) return;
    scrollEl = el;
    scrollListener = () => checkIfNeedsMore();
    el.addEventListener('scroll', scrollListener);
  }

  function detachScroll() {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
    scrollEl = null;
    scrollListener = null;
  }

  onMount(() => {
    mounted = true;
    shownMine = mine;
    unregisterScrollKey = registerActiveScrollKey(() => buildViewStateKey(shownMine ? '/collections/my' : '/collections'));
    const cached = getViewState<CollectionsViewState>(COLLECTIONS_VIEW_KEY());
    if (mine) {
      // Общий список из кэша держим наготове для возврата из «Моих»
      if (cached?.data && cached.data.items.length > 0) allSnapshot = cached.data;
      requestAnimationFrame(attachScroll);
      void loadPage();
      return;
    }
    if (cached?.data && cached.data.items.length > 0) {
      const s = cached.data;
      selectedSort = s.selectedSort;
      items = s.items;
      page = s.page;
      previousPage = s.previousPage;
      hasMore = s.hasMore;
      loadState = s.loadState;
      errorMsg = s.errorMsg;
      requestAnimationFrame(() => {
        attachScroll();
        void restoreScrollTop(cached.scrollTop, { maxWaitMs: 5000 });
      });
      return;
    }

    page = initialCollectionListPage(listSort);
    previousPage = initialCollectionPreviousPage();
    requestAnimationFrame(attachScroll);
    void loadPage();
  });

  onDestroy(() => {
    unregisterScrollKey?.();
    unregisterScrollKey = null;
    const allState = shownMine ? allSnapshot : snapshot();
    if (allState) saveViewStateData(COLLECTIONS_VIEW_KEY(), allState);
    detachScroll();
  });
</script>

<div class="view view-collections-list discover-page collections-page" bind:this={wrapEl}>
  <DiscoverHero title={pageTitle} subtitle={pageSubtitle} backdrop={heroBackdrop}>
    {#if !week}
      <UiV2Tabs
        tabs={sortTabs}
        activeId={mine ? '' : String(selectedSort)}
        onChange={(id) => onSortChange(Number(id))}
        class="uiv2-tabs--static collections-page__tabs"
      >
        {#snippet rightActions()}
          <CollectionsHeaderActions myActive={mine} onMy={toggleMine} onCreate={createCollection} />
        {/snippet}
      </UiV2Tabs>
    {/if}
  </DiscoverHero>

  {#if loadState === 'loading' && items.length === 0}
    <div class="collections-feed" aria-busy="true">
      <UiV2CollectionCardSkeleton count={6} />
    </div>
  {:else if loadState === 'error'}
    <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void loadPage()} />
  {:else if loadState === 'empty'}
    {#if mine}
      <div class="discover-empty">
        <span class="discover-empty__icon" aria-hidden="true">{@html iconFolder(26)}</span>
        <p class="discover-empty__title">Ой, а тут коллекций нет!</p>
        <p class="discover-empty__text">Соберите любимые релизы в подборку и поделитесь ею с другими</p>
        <UiV2Button label="Создать коллекцию" variant="primary" onclick={createCollection}>
          {#snippet icon()}{@html iconPlus(16)}{/snippet}
        </UiV2Button>
      </div>
    {:else}
      <div class="discover-empty">
        <span class="discover-empty__icon" aria-hidden="true">{@html iconLayoutGrid(26)}</span>
        <p class="discover-empty__title">Коллекций пока нет</p>
      </div>
    {/if}
  {:else}
    <div class="collections-feed">
      {#each items as item (item.id)}
        <CollectionCard data={item} variant="grid" />
      {/each}
    </div>
    {#if isLoading}
      <div class="collections-feed" aria-busy="true">
        <UiV2CollectionCardSkeleton count={2} />
      </div>
    {/if}
  {/if}
</div>
