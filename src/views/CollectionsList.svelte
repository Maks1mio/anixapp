<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import CollectionCard from '../components/CollectionCard.svelte';
  import { swipeTabs } from '../actions/swipeTabs';
  import { isMobileMode } from '../platform/mobile';
  import TabPeek from '../components/TabPeek.svelte';
  import { createTabPrefetch, tabNeighbors, TAB_PEEK_ITEMS } from '../utils/tab-prefetch.svelte';
  import UiV2CollectionCardSkeleton from '../components/uikit-v2/UiV2CollectionCardSkeleton.svelte';
  import CollectionsHeaderActions from '../components/collections/CollectionsHeaderActions.svelte';
  import DiscoverHero from '../components/DiscoverHero.svelte';
  import UiV2Tabs from '../components/uikit-v2/UiV2Tabs.svelte';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import { iconFolder, iconLayoutGrid, iconPlus } from '../components/icons';
  import { navigate } from '../stores/navigation';
  import { requireAuth } from '../stores/auth';
  import { ensureProfileId } from '../utils/profile';
  import { resolveJacksonRefs } from '../utils/jackson-refs';
  import { buildPosterUrl } from '../utils/posterUrl';
  import { openProfilePanel } from '../stores/profile-panel';
  import { closeLocalSearch, localSearchLabel, localSearchQuery } from '../stores/mobile-local-search';
  import UiV2PillField from '../components/uikit-v2/UiV2PillField.svelte';
  import { iconSearch, iconX } from '../components/icons';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import {
    COLLECTION_SORT_OPTIONS,
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
    resetScrollTop,
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
    /** Коллекции другого пользователя (/profile/:id/collections) — та же страница, что «Мои» */
    userId?: number | null;
  }

  let { week = false, mine = false, userId = null }: Props = $props();

  /** Чужой профиль: шапка с аватаром и ником, без «Создать» */
  const foreign = $derived(userId != null && userId > 0);
  let ownerLogin = $state('');
  let ownerAvatar = $state('');
  let ownerTotal = $state<number | null>(null);


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

  /** Поиск по коллекциям пользователя: у API его нет — фильтруем загруженное (и догружаем всё при вводе) */
  let deskQuery = $state('');
  const searchQuery = $derived((isMobileMode() ? $localSearchQuery : deskQuery).trim().toLowerCase());
  const visibleItems = $derived(
    foreign && searchQuery
      ? items.filter((it) => {
          return `${it.title ?? ''} ${it.description ?? ''}`.toLowerCase().includes(searchQuery);
        })
      : items,
  );
  $effect(() => {
    if (!foreign) return;
    localSearchLabel.set(ownerLogin ? `Поиск в коллекциях у ${ownerLogin}` : 'Поиск в коллекциях');
  });
  $effect(() => {
    // Ищем по всем коллекциям, а не по первой странице
    if (foreign && searchQuery && hasMore && !isLoading && loadState === 'ready') void untrack(() => loadPage());
  });

  const listSort = $derived(week ? 4 : selectedSort);
  const listWhere = $derived(week ? 2 : 1);
  const pageTitle = $derived(week ? 'Коллекции недели' : foreign ? 'Коллекции' : mine ? 'Мои коллекции' : 'Коллекции');
  const pageSubtitle = $derived(
    week
      ? 'Лучшие подборки за неделю'
      : foreign
        ? (ownerTotal != null ? collectionsCountLabel(ownerTotal) : '')
        : mine
          ? 'Ваши подборки релизов'
          : 'Пользовательские коллекции релизов',
  );

  function collectionsCountLabel(n: number): string {
    const m10 = n % 10;
    const m100 = n % 100;
    const word = m10 === 1 && m100 !== 11 ? 'коллекция'
      : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 'коллекции'
        : 'коллекций';
    return `${n} ${word}`;
  }

  async function loadOwner(id: number) {
    try {
      const info = resolveJacksonRefs(await window.anixApi?.profile.info(id) as Record<string, unknown>);
      const p = info?.profile as { login?: string; avatar?: string } | undefined;
      ownerLogin = p?.login ?? '';
      ownerAvatar = p?.avatar ? buildPosterUrl(p.avatar) : '';
    } catch {
      /* шапка без ника — не критично */
    }
  }


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
    resetScrollTop();
    const seed = isMobileMode() ? tabPrefetch.get(String(sort)) : undefined;
    if (seed?.items.length) {
      loadToken += 1;
      isLoading = false;
      applySnapshot(seed);
      return;
    }
    resetList();
    void loadPage();
  }

  /** Первая страница соседних сортировок: при свайпе рядом едет уже настоящий список. */
  const tabPrefetch = createTabPrefetch<CollectionsViewState>(async (id) => {
    const sort = Number(id);
    const requestPage = initialCollectionListPage(sort);
    const data = (await window.anixApi!.collection.all(requestPage, {
      sort,
      where: 1,
      previousPage: initialCollectionPreviousPage(),
    })) as { content?: unknown[]; last?: boolean; total_page_count?: number; current_page?: number };
    const content = (data?.content ?? []) as Record<string, unknown>[];
    const currentPage = typeof data.current_page === 'number' ? data.current_page : requestPage;
    return {
      items: content.map(mapCollectionCard),
      page: requestPage + 1,
      previousPage: requestPage,
      hasMore: data.last === true
        ? false
        : typeof data.total_page_count === 'number'
          ? currentPage + 1 < data.total_page_count
          : content.length >= 25,
      loadState: content.length ? 'ready' : 'empty',
      errorMsg: '',
      selectedSort: sort,
    };
  });
  const peekTabs = $derived(tabNeighbors(sortTabs.map((t) => t.id), String(selectedSort)));

  $effect(() => {
    if (!isMobileMode() || mine || week || loadState === 'loading') return;
    const { prev, next } = peekTabs;
    untrack(() => {
      if (prev) tabPrefetch.ensure(prev);
      if (next) tabPrefetch.ensure(next);
    });
  });

  function swipeToTab(dir: 1 | -1): boolean {
    const nextTab = sortTabs[sortTabs.findIndex((t) => t.id === String(selectedSort)) + dir];
    if (!nextTab) return false;
    onSortChange(Number(nextTab.id));
    return true;
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
    if (foreign) profileId = userId;
    else if (profileId == null) profileId = await ensureProfileId();
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
      total_count?: number;
    };
    if (token !== loadToken) return;
    if (nextPage === 0 && typeof data?.total_count === 'number') ownerTotal = data.total_count;
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
    unregisterScrollKey = registerActiveScrollKey(() => buildViewStateKey(
      foreign ? `/profile/${userId}/collections` : shownMine ? '/collections/my' : '/collections',
    ));
    if (foreign && userId) void loadOwner(userId);
    if (foreign) closeLocalSearch();
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
    if (foreign) closeLocalSearch();
    unregisterScrollKey?.();
    unregisterScrollKey = null;
    const allState = shownMine ? allSnapshot : snapshot();
    if (allState) saveViewStateData(COLLECTIONS_VIEW_KEY(), allState);
    detachScroll();
  });
</script>

{#snippet userSearch()}
  <!-- Как поиск в «Списках»: поле на всю ширину под вкладками -->
  <div class="bm-tools" role="search">
  <div class="bm-tools__search">
    <UiV2PillField
      size="md"
      type="search"
      label={ownerLogin ? `Поиск в коллекциях у ${ownerLogin}` : 'Поиск в коллекциях'}
      value={deskQuery}
      autocomplete="off"
      spellcheck={false}
      oninput={(e) => (deskQuery = (e.currentTarget as HTMLInputElement).value)}
    >
      {#snippet icon()}{@html iconSearch(16)}{/snippet}
    </UiV2PillField>
    {#if deskQuery}
      <button type="button" class="bm-tools__clear" aria-label="Очистить поиск" onclick={() => (deskQuery = '')}>
        {@html iconX(14)}
      </button>
    {/if}
  </div>
  </div>
{/snippet}

{#snippet headerActions()}
  <CollectionsHeaderActions myActive={mine && !foreign} onMy={() => (foreign ? navigate('/collections/my') : toggleMine())} onCreate={createCollection} />
{/snippet}

<div class="view view-collections-list discover-page collections-page" bind:this={wrapEl}>
  <!-- На телефоне вкладкам нужна вся ширина: «Мои» и «Создать» стоят рядом с заголовком -->
  <DiscoverHero
    title={pageTitle}
    subtitle={pageSubtitle}
    avatarUrl={foreign ? ownerAvatar : undefined}
    login={foreign ? ownerLogin : undefined}
    onTitleClick={foreign && userId ? () => openProfilePanel(userId!, { login: ownerLogin }) : undefined}
    actions={isMobileMode() && !week && !foreign ? headerActions : undefined}
  >
    <!-- Чужие коллекции: только шапка и поиск — без общих вкладок сортировки, «Мои» и «Создать» -->
    {#if !week && !foreign}
      <UiV2Tabs
        tabs={sortTabs}
        activeId={mine ? '' : String(selectedSort)}
        onChange={(id) => onSortChange(Number(id))}
        class="uiv2-tabs--static collections-page__tabs"
        rightActions={isMobileMode() ? undefined : headerActions}
      />
    {:else if foreign && !isMobileMode()}
      <!-- На месте вкладок — поиск по коллекциям пользователя (закрепляется при прокрутке, как вкладки) -->
      {@render userSearch()}
    {/if}
  </DiscoverHero>

  <!-- Скелетон и пустое состояние внутри блока: смена вкладки плавная, даже пока список грузится -->
  <div use:swipeTabs={{ onSwipe: swipeToTab, enabled: isMobileMode() && !mine && !week, activeId: String(selectedSort) }}>
    {#if loadState === 'loading' && items.length === 0}
      <div class="collections-feed" aria-busy="true">
        <UiV2CollectionCardSkeleton count={6} />
      </div>
    {:else if loadState === 'error'}
      <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void loadPage()} />
    {:else if loadState === 'empty'}
      {#if mine && !foreign}
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
      {#if foreign && searchQuery && visibleItems.length === 0 && !isLoading && !hasMore}
        <div class="discover-empty">
          <span class="discover-empty__icon" aria-hidden="true">{@html iconSearch(26)}</span>
          <p class="discover-empty__title">Ничего не найдено</p>
        </div>
      {:else}
        <div class="collections-feed">
          {#each visibleItems as item (item.id)}
            <CollectionCard data={item} variant="grid" />
          {/each}
        </div>
      {/if}
      {#if isLoading}
        <div class="collections-feed" aria-busy="true">
          <UiV2CollectionCardSkeleton count={2} />
        </div>
      {/if}
      {#if !mine && !week}
        {#if peekTabs.prev}<TabPeek dir={-1}>{@render collectionsPeek(peekTabs.prev)}</TabPeek>{/if}
        {#if peekTabs.next}<TabPeek dir={1}>{@render collectionsPeek(peekTabs.next)}</TabPeek>{/if}
      {/if}
    {/if}
  </div>
</div>

{#snippet collectionsPeek(id: string)}
  {@const seed = tabPrefetch.get(id)}
  <div class="collections-feed">
    {#if seed}
      {#each seed.items.slice(0, TAB_PEEK_ITEMS) as item (item.id)}
        <CollectionCard data={item} variant="grid" />
      {/each}
    {:else}
      <UiV2CollectionCardSkeleton count={6} />
    {/if}
  </div>
{/snippet}
