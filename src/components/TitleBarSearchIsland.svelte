<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../actions/portal';
  import { iconSearch, iconX, iconArrowRight, iconArrowLeft } from './icons';
  import TitleBarIslandCarousel from './TitleBarIslandCarousel.svelte';
  import CollectionCard, { type CollectionCardData } from './CollectionCard.svelte';
  import ReleaseCardsGrid from './ReleaseCardsGrid.svelte';
  import UiV2SearchFranchise from './uikit-v2/UiV2SearchFranchise.svelte';
  import UiV2ScrollArea from './uikit-v2/UiV2ScrollArea.svelte';
  import UiV2FeedPersonTile from './uikit-v2/UiV2FeedPersonTile.svelte';
  import { handleUserProfileClick } from '../stores/user-profile';
  import { resolveBadgeName, resolveProfileBadgeUrl } from '../utils/badge';
  import { addSearchHistory, getSearchHistory } from '../utils/search-history';
  import { mapReleaseRawToCard } from '../utils/release-card';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import type { ReleaseCardData } from '../types/release';

  type ProfileHit = {
    id: number;
    login: string;
    avatar?: string | null;
    is_online?: boolean;
    badge?: unknown;
    _root?: unknown;
  };

  type FranchiseData = {
    images: string[];
    name: string;
    releaseCount?: number;
    relatedId?: number;
    firstReleaseId?: number;
  };

  type ExpandedSection = 'profiles' | 'collections' | null;

  let open = $state(false);
  let query = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);
  let pillEl = $state<HTMLButtonElement | null>(null);
  let panelEl = $state<HTMLDivElement | null>(null);
  let busy = $state(false);
  let loadState = $state<'idle' | 'hint' | 'loading' | 'empty' | 'ready' | 'error'>('idle');
  let errorMsg = $state('');
  let releases = $state<ReleaseCardData[]>([]);
  let collections = $state<CollectionCardData[]>([]);
  let profiles = $state<ProfileHit[]>([]);
  let profilesRoot = $state<unknown>(null);
  let franchise = $state<FranchiseData | null>(null);
  let releasePage = $state(0);
  let releaseHasMore = $state(true);
  let profilePage = $state(0);
  let profileHasMore = $state(true);
  let collectionPage = $state(0);
  let collectionHasMore = $state(true);
  let recent = $state<string[]>(getSearchHistory());
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let requestSeq = 0;
  let expandReady = $state(false);
  let layerVisible = $state(false);
  let closing = $state(false);
  let pillObscured = $state(false);
  let reducedMotion = $state(false);
  let lastSearchedQuery = $state('');
  let reopenQueued = false;
  let expanded = $state<ExpandedSection>(null);

  const FADE_MS = 260;
  const PAGE_SIZE = 20;

  const trimmed = $derived(query.trim());
  const showHistory = $derived(open && !trimmed && recent.length > 0);
  const searchDone = $derived(loadState === 'ready' || loadState === 'empty');
  const hasFranchise = $derived(!!franchise && (!!franchise.images.length || !!franchise.name));
  const hasResults = $derived(
    releases.length > 0 || collections.length > 0 || profiles.length > 0 || hasFranchise,
  );

  function mapCollection(raw: Record<string, unknown>): CollectionCardData {
    return {
      id: Number(raw.id),
      title: String(raw.title ?? raw.name ?? 'Без названия'),
      image: resolveCdnAssetUrl(String(raw.image ?? '')) || undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      releaseCount: typeof raw.release_count === 'number' ? raw.release_count : undefined,
      notesCount: typeof raw.notes_count === 'number'
        ? raw.notes_count
        : (typeof raw.comment_count === 'number' ? raw.comment_count : undefined),
      bookmarksCount: typeof raw.bookmarks_count === 'number' ? raw.bookmarks_count : undefined,
      favoritesCount: typeof raw.favorites_count === 'number' ? raw.favorites_count : undefined,
      isFavorite: !!raw.is_favorite,
    };
  }

  function mapProfile(raw: Record<string, unknown>, root: unknown): ProfileHit | null {
    const id = Number(raw.id ?? 0);
    if (!(id > 0)) return null;
    return {
      id,
      login: typeof raw.login === 'string' && raw.login.trim() ? raw.login.trim() : `id${id}`,
      avatar: typeof raw.avatar === 'string' ? raw.avatar : null,
      is_online: !!raw.is_online,
      badge: raw.badge,
      _root: root,
    };
  }

  function extractContent(data: unknown): unknown[] {
    const rec = data as { content?: unknown } | null;
    let source: unknown = rec?.content ?? data;
    if (source && !Array.isArray(source) && typeof source === 'object') {
      const obj = source as Record<string, unknown>;
      if (Array.isArray(obj.releases)) source = obj.releases;
      else if (Array.isArray(obj.collections)) source = obj.collections;
    }
    return Array.isArray(source) ? source : [];
  }

  function prefersReducedMotion(): boolean {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  function waitMs(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function waitFrames(n = 2): Promise<void> {
    return new Promise((resolve) => {
      const step = (left: number) => {
        if (left <= 0) {
          resolve();
          return;
        }
        requestAnimationFrame(() => step(left - 1));
      };
      step(n);
    });
  }

  async function playOpenFade(): Promise<void> {
    expandReady = false;
    pillObscured = false;
    layerVisible = false;
    await tick();
    await waitFrames(2);
    if (reducedMotion) {
      expandReady = true;
      pillObscured = true;
      layerVisible = true;
      return;
    }
    layerVisible = true;
    expandReady = true;
    pillObscured = true;
    await waitMs(FADE_MS);
  }

  async function playCloseFade(): Promise<void> {
    expandReady = false;
    layerVisible = false;
    pillObscured = false;
    if (reducedMotion) return;
    await waitMs(FADE_MS);
  }

  function canReuseSearch(q: string): boolean {
    if (!q || q !== lastSearchedQuery) return false;
    return loadState === 'ready' || loadState === 'empty' || hasResults;
  }

  function resetExpanded() {
    expanded = null;
  }

  async function openIsland(initialQuery = ''): Promise<void> {
    if (open && !closing) {
      if (initialQuery) query = initialQuery;
      inputEl?.focus();
      return;
    }
    if (closing) {
      if (initialQuery) query = initialQuery;
      reopenQueued = true;
      return;
    }
    reducedMotion = prefersReducedMotion();
    if (initialQuery) query = initialQuery;
    recent = getSearchHistory();
    closing = false;
    open = true;
    await playOpenFade();
    inputEl?.focus();
    if (trimmed) {
      const len = inputEl?.value.length ?? 0;
      inputEl?.setSelectionRange(len, len);
      if (!canReuseSearch(trimmed)) void runSearch(false);
    } else if (loadState !== 'ready' && loadState !== 'empty') {
      loadState = recent.length ? 'hint' : 'idle';
    }
  }

  async function closeIsland(): Promise<void> {
    if (!open || closing) return;
    closing = true;
    reopenQueued = false;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    await playCloseFade();
    open = false;
    closing = false;
    pillObscured = false;
    layerVisible = false;
    expandReady = false;
    resetExpanded();
    if (reopenQueued) {
      reopenQueued = false;
      void openIsland(query);
    }
  }

  function onPillClick() {
    void openIsland(query);
  }

  function onBackdropClick() {
    void closeIsland();
  }

  function onInput() {
    resetExpanded();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runSearch(false);
    }, 280);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (expanded) {
        resetExpanded();
        return;
      }
      void closeIsland();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  }

  async function runSearch(appendReleases: boolean) {
    const q = trimmed;
    if (!q) {
      releases = [];
      collections = [];
      profiles = [];
      franchise = null;
      lastSearchedQuery = '';
      releaseHasMore = false;
      profileHasMore = false;
      collectionHasMore = false;
      resetExpanded();
      loadState = recent.length ? 'hint' : 'idle';
      return;
    }
    if (!window.anixApi?.search) {
      loadState = 'error';
      errorMsg = 'API поиска недоступно';
      return;
    }
    if (appendReleases && (busy || !releaseHasMore)) return;

    const seq = ++requestSeq;
    busy = true;
    if (!appendReleases) {
      loadState = 'loading';
      releasePage = 0;
      releaseHasMore = true;
      profilePage = 0;
      profileHasMore = true;
      collectionPage = 0;
      collectionHasMore = true;
      releases = [];
      collections = [];
      profiles = [];
      profilesRoot = null;
      franchise = null;
      resetExpanded();
    }

    try {
      if (!appendReleases) {
        const [relRes, colRes, profRes] = await Promise.allSettled([
          window.anixApi.search.releases(q, 0, 0),
          window.anixApi.search.collections(q, 0),
          window.anixApi.search.profiles(q, 0),
        ]);
        if (seq !== requestSeq) return;

        if (relRes.status === 'fulfilled') {
          const data = relRes.value;
          const content = extractContent(data);
          const related = (data as { related?: Record<string, unknown> })?.related;
          if (related) {
            franchise = {
              images: Array.isArray(related.images) ? related.images.map(String) : [],
              name: String(related.name_ru ?? related.name ?? ''),
              releaseCount: typeof related.release_count === 'number' ? related.release_count : undefined,
              relatedId: typeof related.id === 'number' ? related.id : undefined,
              firstReleaseId: content[0] && typeof (content[0] as { id?: number }).id === 'number'
                ? (content[0] as { id: number }).id
                : undefined,
            };
          }
          releases = content.map((row) => mapReleaseRawToCard(row as Record<string, unknown>));
          releasePage = 1;
          releaseHasMore = content.length >= PAGE_SIZE;
        }

        if (colRes.status === 'fulfilled') {
          const content = extractContent(colRes.value);
          collections = content
            .map((row) => mapCollection(row as Record<string, unknown>))
            .filter((c) => c.id > 0);
          collectionPage = 1;
          collectionHasMore = content.length >= PAGE_SIZE;
        }

        if (profRes.status === 'fulfilled') {
          profilesRoot = profRes.value;
          const content = extractContent(profRes.value);
          profiles = content
            .map((row) => mapProfile(row as Record<string, unknown>, profRes.value))
            .filter((p): p is ProfileHit => !!p);
          profilePage = 1;
          profileHasMore = content.length >= PAGE_SIZE;
        }

        addSearchHistory(q);
        recent = getSearchHistory();
        lastSearchedQuery = q;
        const found =
          releases.length > 0 ||
          collections.length > 0 ||
          profiles.length > 0 ||
          !!(franchise && (franchise.images.length || franchise.name));
        loadState = found ? 'ready' : 'empty';
      } else {
        const data = await window.anixApi.search.releases(q, releasePage, 0);
        if (seq !== requestSeq) return;
        const content = extractContent(data);
        if (!content.length) {
          releaseHasMore = false;
        } else {
          releases = [
            ...releases,
            ...content.map((row) => mapReleaseRawToCard(row as Record<string, unknown>)),
          ];
          releasePage += 1;
          releaseHasMore = content.length >= PAGE_SIZE;
          loadState = 'ready';
        }
      }
    } catch (err) {
      if (seq !== requestSeq) return;
      if (!appendReleases) {
        errorMsg = err instanceof Error ? err.message : String(err);
        loadState = 'error';
      }
    } finally {
      if (seq === requestSeq) busy = false;
    }
  }

  async function loadMoreProfiles() {
    const q = trimmed;
    if (!q || busy || !profileHasMore || !window.anixApi?.search) return;
    const seq = ++requestSeq;
    busy = true;
    try {
      const data = await window.anixApi.search.profiles(q, profilePage);
      if (seq !== requestSeq) return;
      const content = extractContent(data);
      if (!content.length) {
        profileHasMore = false;
        return;
      }
      profilesRoot = data;
      const next = content
        .map((row) => mapProfile(row as Record<string, unknown>, data))
        .filter((p): p is ProfileHit => !!p);
      const seen = new Set(profiles.map((p) => p.id));
      profiles = [...profiles, ...next.filter((p) => !seen.has(p.id))];
      profilePage += 1;
      profileHasMore = content.length >= PAGE_SIZE;
    } finally {
      if (seq === requestSeq) busy = false;
    }
  }

  async function loadMoreCollections() {
    const q = trimmed;
    if (!q || busy || !collectionHasMore || !window.anixApi?.search) return;
    const seq = ++requestSeq;
    busy = true;
    try {
      const data = await window.anixApi.search.collections(q, collectionPage);
      if (seq !== requestSeq) return;
      const content = extractContent(data);
      if (!content.length) {
        collectionHasMore = false;
        return;
      }
      const next = content
        .map((row) => mapCollection(row as Record<string, unknown>))
        .filter((c) => c.id > 0);
      const seen = new Set(collections.map((c) => c.id));
      collections = [...collections, ...next.filter((c) => !seen.has(c.id))];
      collectionPage += 1;
      collectionHasMore = content.length >= PAGE_SIZE;
    } finally {
      if (seq === requestSeq) busy = false;
    }
  }

  function onPanelScroll(e: Event) {
    const el = e.currentTarget as HTMLElement | null;
    if (!el || !trimmed || busy) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance >= 240) return;
    if (expanded === 'profiles') {
      void loadMoreProfiles();
      return;
    }
    if (expanded === 'collections') {
      void loadMoreCollections();
      return;
    }
    if (releaseHasMore) void runSearch(true);
  }

  function pickHistory(item: string) {
    query = item;
    resetExpanded();
    void runSearch(false);
    void tick().then(() => inputEl?.focus());
  }

  function expandSection(kind: 'profiles' | 'collections') {
    expanded = kind;
    if (kind === 'profiles' && profileHasMore && profiles.length < PAGE_SIZE * 2) {
      void loadMoreProfiles();
    }
    if (kind === 'collections' && collectionHasMore && collections.length < PAGE_SIZE * 2) {
      void loadMoreCollections();
    }
  }

  function onGlobalKey(e: KeyboardEvent) {
    if (!open || closing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (expanded) {
        resetExpanded();
        return;
      }
      void closeIsland();
    }
  }

  onMount(() => {
    reducedMotion = prefersReducedMotion();
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ q?: string }>).detail;
      void openIsland(typeof detail?.q === 'string' ? detail.q : '');
    };
    const onFocus = () => void openIsland(query);
    window.addEventListener('anix:openSearchIsland', onOpen as EventListener);
    window.addEventListener('anix:focusSearch', onFocus);
    window.addEventListener('keydown', onGlobalKey);
    return () => {
      window.removeEventListener('anix:openSearchIsland', onOpen as EventListener);
      window.removeEventListener('anix:focusSearch', onFocus);
      window.removeEventListener('keydown', onGlobalKey);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  });
</script>

<div class="titlebar-island" class:titlebar-island--open={open}>
  <button
    type="button"
    class="titlebar-island__pill"
    class:titlebar-island__pill--hidden={pillObscured}
    bind:this={pillEl}
    aria-label="Поиск тайтлов"
    onclick={onPillClick}
  >
    <span class="titlebar-island__pill-icon" aria-hidden="true">{@html iconSearch(15)}</span>
    <span class="titlebar-island__pill-text" class:titlebar-island__pill-text--query={!!trimmed}>
      {trimmed || 'Поиск тайтлов'}
    </span>
    {#if !trimmed}
      <kbd class="titlebar-island__pill-kbd">Ctrl+K</kbd>
    {/if}
  </button>

  {#if open}
    <div
      class="titlebar-island__layer"
      class:titlebar-island__layer--visible={layerVisible}
      class:titlebar-island__layer--closing={closing}
      use:portal={'body'}
    >
      <button
        type="button"
        class="titlebar-island__backdrop"
        aria-label="Закрыть поиск"
        onclick={onBackdropClick}
      ></button>

      <div
        class="titlebar-island__panel"
        class:titlebar-island__panel--ready={expandReady}
        bind:this={panelEl}
        role="dialog"
        aria-modal="true"
        aria-label="Поиск"
      >
        <div class="titlebar-island__bar">
          <span class="titlebar-island__bar-icon" aria-hidden="true">{@html iconSearch(18)}</span>
          <input
            id="titlebar-search-input"
            class="titlebar-island__input"
            type="search"
            placeholder="Тайтлы, коллекции, пользователи…"
            autocomplete="off"
            spellcheck="false"
            bind:this={inputEl}
            bind:value={query}
            oninput={onInput}
            onkeydown={onKeydown}
          />
          <div class="titlebar-island__bar-end">
            <span class="titlebar-island__esc-hint" aria-hidden="true">Esc</span>
            <button
              type="button"
              class="titlebar-island__close"
              aria-label="Закрыть"
              title="Закрыть"
              onclick={() => void closeIsland()}
            >
              {@html iconX(16)}
            </button>
          </div>
        </div>

        <UiV2ScrollArea
          class="titlebar-island__scroll"
          viewportClass="titlebar-island__body"
          padding="0.85rem 1rem 1.25rem"
          onscroll={onPanelScroll}
        >
          {#if showHistory}
            <section class="titlebar-island__section" aria-label="Недавние запросы">
              <h3 class="titlebar-island__section-title">Недавние</h3>
              <div class="titlebar-island__chips">
                {#each recent as item (item)}
                  <button
                    type="button"
                    class="titlebar-island__chip"
                    onclick={() => pickHistory(item)}
                  >{item}</button>
                {/each}
              </div>
            </section>
          {:else if loadState === 'loading' && !searchDone}
            <p class="titlebar-island__state">Ищем…</p>
          {:else if loadState === 'error'}
            <p class="titlebar-island__state titlebar-island__state--err">{errorMsg || 'Ошибка поиска'}</p>
          {:else if searchDone}
            {#key expanded}
              <div
                class="titlebar-island__view"
                in:fade={{ duration: reducedMotion ? 0 : FADE_MS, easing: cubicOut }}
                out:fade={{ duration: reducedMotion ? 0 : FADE_MS, easing: cubicOut }}
              >
                {#if expanded === 'profiles'}
                  <section class="titlebar-island__section" aria-label="Пользователи">
                    <div class="titlebar-island__section-head">
                      <h3 class="titlebar-island__section-title">Пользователи</h3>
                      <button
                        type="button"
                        class="titlebar-island__more"
                        onclick={resetExpanded}
                      >
                        <span aria-hidden="true">{@html iconArrowLeft(14)}</span>
                        Назад
                      </button>
                    </div>
                    {#if profiles.length}
                      <div class="island-people-grid">
                        {#each profiles as p (p.id)}
                          {@const badgeUrl = resolveProfileBadgeUrl(p, p._root ?? profilesRoot)}
                          <UiV2FeedPersonTile
                            class="island-people-grid__item"
                            title={p.login}
                            avatar={p.avatar}
                            showDot={!!p.is_online}
                            badgeUrl={badgeUrl}
                            badgeName={resolveBadgeName(p.badge)}
                            onclick={(e) => {
                              void closeIsland();
                              handleUserProfileClick(p.id, e);
                            }}
                          />
                        {/each}
                      </div>
                      {#if busy && profileHasMore}
                        <p class="titlebar-island__state">Ещё…</p>
                      {/if}
                    {:else}
                      <p class="titlebar-island__empty">Результат не найден</p>
                    {/if}
                  </section>
                {:else if expanded === 'collections'}
                  <section class="titlebar-island__section" aria-label="Коллекции">
                    <div class="titlebar-island__section-head">
                      <h3 class="titlebar-island__section-title">Коллекции</h3>
                      <button
                        type="button"
                        class="titlebar-island__more"
                        onclick={resetExpanded}
                      >
                        <span aria-hidden="true">{@html iconArrowLeft(14)}</span>
                        Назад
                      </button>
                    </div>
                    {#if collections.length}
                      <div class="island-collections-grid">
                        {#each collections as col (col.id)}
                          <div
                            class="island-collections-grid__card"
                            onclick={() => void closeIsland()}
                            onkeydown={(e) => e.key === 'Enter' && void closeIsland()}
                            role="presentation"
                          >
                            <CollectionCard data={col} variant="cover" />
                          </div>
                        {/each}
                      </div>
                      {#if busy && collectionHasMore}
                        <p class="titlebar-island__state">Ещё…</p>
                      {/if}
                    {:else}
                      <p class="titlebar-island__empty">Результат не найден</p>
                    {/if}
                  </section>
                {:else}
                  <section class="titlebar-island__section" aria-label="Пользователи">
                    <div class="titlebar-island__section-head">
                      <h3 class="titlebar-island__section-title">Пользователи</h3>
                      {#if profiles.length}
                        <button
                          type="button"
                          class="titlebar-island__more"
                          onclick={() => expandSection('profiles')}
                        >
                          Все
                          <span aria-hidden="true">{@html iconArrowRight(14)}</span>
                        </button>
                      {/if}
                    </div>
                    {#if profiles.length}
                      <TitleBarIslandCarousel label="Пользователи" measureKey={`p:${profiles.length}`}>
                        {#each profiles as p (p.id)}
                          {@const badgeUrl = resolveProfileBadgeUrl(p, p._root ?? profilesRoot)}
                          <UiV2FeedPersonTile
                            class="island-hcarousel__person"
                            title={p.login}
                            avatar={p.avatar}
                            showDot={!!p.is_online}
                            badgeUrl={badgeUrl}
                            badgeName={resolveBadgeName(p.badge)}
                            onclick={(e) => {
                              void closeIsland();
                              handleUserProfileClick(p.id, e);
                            }}
                          />
                        {/each}
                      </TitleBarIslandCarousel>
                    {:else}
                      <p class="titlebar-island__empty">Результат не найден</p>
                    {/if}
                  </section>

                  <section class="titlebar-island__section" aria-label="Коллекции">
                    <div class="titlebar-island__section-head">
                      <h3 class="titlebar-island__section-title">Коллекции</h3>
                      {#if collections.length}
                        <button
                          type="button"
                          class="titlebar-island__more"
                          onclick={() => expandSection('collections')}
                        >
                          Все
                          <span aria-hidden="true">{@html iconArrowRight(14)}</span>
                        </button>
                      {/if}
                    </div>
                    {#if collections.length}
                      <TitleBarIslandCarousel label="Коллекции" measureKey={`c:${collections.length}`}>
                        {#each collections as col (col.id)}
                          <div
                            class="island-hcarousel__card"
                            onclick={() => void closeIsland()}
                            onkeydown={(e) => e.key === 'Enter' && void closeIsland()}
                            role="presentation"
                          >
                            <CollectionCard data={col} variant="cover" />
                          </div>
                        {/each}
                      </TitleBarIslandCarousel>
                    {:else}
                      <p class="titlebar-island__empty">Результат не найден</p>
                    {/if}
                  </section>

                  <section
                    class="titlebar-island__section"
                    aria-label="Связанное"
                    onclick={() => {
                      if (hasFranchise) void closeIsland();
                    }}
                  >
                    <h3 class="titlebar-island__section-title">Связанное</h3>
                    {#if hasFranchise && franchise}
                      <div class="island-related">
                        <UiV2SearchFranchise data={franchise} />
                      </div>
                    {:else}
                      <p class="titlebar-island__empty">Результат не найден</p>
                    {/if}
                  </section>

                  <section
                    class="titlebar-island__section"
                    aria-label="Тайтлы"
                    onclick={(e) => {
                      const t = e.target as HTMLElement;
                      if (t.closest('a, button, [role="link"]')) {
                        queueMicrotask(() => void closeIsland());
                      }
                    }}
                  >
                    <div class="titlebar-island__section-head">
                      <h3 class="titlebar-island__section-title">Тайтлы</h3>
                    </div>
                    {#if releases.length}
                      <ReleaseCardsGrid items={releases} layout="mini" className="titlebar-island__grid" />
                      {#if busy && releaseHasMore}
                        <p class="titlebar-island__state">Ещё…</p>
                      {/if}
                    {:else}
                      <p class="titlebar-island__empty">Результат не найден</p>
                    {/if}
                  </section>
                {/if}
              </div>
            {/key}
          {:else if open && !trimmed}
            <p class="titlebar-island__state">Начните вводить название, коллекцию или ник</p>
          {/if}
        </UiV2ScrollArea>
      </div>
    </div>
  {/if}
</div>
