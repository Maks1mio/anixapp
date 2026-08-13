<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { iconArrowLeft, iconClock, iconSearch } from '../components/icons';
  import { navigate } from '../stores/navigation';
  import { showToast } from '../stores/toast';
  import {
    COLLECTION_RELEASES_MAX,
    loadCollectionEditorDraft,
    saveCollectionEditorDraft,
  } from '../utils/collection';
  import {
    addSearchHistory,
    clearSearchHistory,
    getSearchHistory,
  } from '../utils/search-history';
  import {
    mapReleaseRawToCard,
    releaseCardMeta,
    releaseCardTitle,
    releaseListStatusLabel,
    releaseRawToStored,
  } from '../utils/release-card';

  interface Props {
    returnPath?: string;
  }

  let { returnPath = '/collections/create' }: Props = $props();

  let query = $state('');
  let results = $state<Record<string, unknown>[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'hint' | 'loading' | 'error' | 'empty' | 'ready'>('hint');
  let history = $state<string[]>([]);

  let wrapEl: HTMLElement | undefined = $state();
  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;
  let inputEl: HTMLInputElement | undefined = $state();

  function getDraftReleases(): Record<string, unknown>[] {
    const draft = loadCollectionEditorDraft();
    return Array.isArray(draft?.releases) ? draft.releases : [];
  }

  function persistRelease(raw: Record<string, unknown>) {
    const draft = loadCollectionEditorDraft() ?? {
      title: '',
      description: '',
      isPrivate: false,
      releaseIds: [],
      releases: [],
    };
    const id = Number(raw.id);
    if (!Number.isFinite(id)) return;
    const existing = Array.isArray(draft.releases) ? draft.releases : [];
    if (existing.some((r) => Number(r.id) === id)) {
      showToast('Релиз уже добавлен', 'err');
      return;
    }
    if (existing.length >= COLLECTION_RELEASES_MAX) {
      showToast(`Максимум ${COLLECTION_RELEASES_MAX} релизов`, 'err');
      return;
    }
    draft.releases = [...existing, releaseRawToStored(raw)];
    draft.releaseIds = draft.releases.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
    saveCollectionEditorDraft(draft);
    navigate(returnPath);
  }

  async function search(append = false) {
    const q = query.trim();
    if (!q || !window.anixApi?.search?.releases) return;
    if (isLoading || (!append && !hasMore && page > 0)) return;

    isLoading = true;
    if (!append) {
      loadState = 'loading';
      page = 0;
      hasMore = true;
      results = [];
      addSearchHistory(q);
      history = getSearchHistory();
    }

    try {
      const data = (await window.anixApi.search.releases(q, page, 0)) as Record<string, unknown>;
      const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
      if (!content.length) {
        hasMore = false;
        if (!append) loadState = 'empty';
        return;
      }
      results = append ? [...results, ...content] : content;
      page += 1;
      if (content.length < 25) hasMore = false;
      loadState = 'ready';
    } catch {
      if (!append) loadState = 'error';
    } finally {
      isLoading = false;
    }
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    void search(false);
  }

  function pickHistory(item: string) {
    query = item;
    void search(false);
  }

  function attachScroll() {
    const el = (wrapEl?.closest('.page__scroll') as HTMLElement | null)
      ?? document.getElementById('content');
    if (!el) return;
    scrollEl = el;
    scrollListener = () => {
      if (!hasMore || isLoading || !query.trim()) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 300) void search(true);
    };
    el.addEventListener('scroll', scrollListener);
  }

  function detachScroll() {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
    scrollEl = null;
    scrollListener = null;
  }

  onMount(() => {
    history = getSearchHistory();
    requestAnimationFrame(() => {
      attachScroll();
      inputEl?.focus();
    });
  });

  onDestroy(detachScroll);
</script>

<div class="view collection-release-picker" bind:this={wrapEl}>
  <button type="button" class="collections-back" onclick={() => navigate(returnPath)}>
    {@html iconArrowLeft(18)}
    <span>Назад</span>
  </button>

  <form class="collection-release-picker__search" onsubmit={onSubmit}>
    <span aria-hidden="true">{@html iconSearch(18)}</span>
    <input
      bind:this={inputEl}
      class="collection-release-picker__input"
      type="search"
      placeholder="Поиск аниме"
      bind:value={query}
    />
  </form>

  {#if loadState === 'hint' && history.length > 0}
    <section class="collection-release-picker__history">
      <div class="collection-release-picker__history-head">
        <span>История поиска</span>
        <button
          type="button"
          class="collection-release-picker__history-clear"
          onclick={() => {
            clearSearchHistory();
            history = [];
          }}
        >
          Очистить все
        </button>
      </div>
      {#each history as item (item)}
        <button type="button" class="collection-release-picker__history-item" onclick={() => pickHistory(item)}>
          <span aria-hidden="true">{@html iconClock(14)}</span>
          <span>{item}</span>
        </button>
      {/each}
    </section>
  {/if}

  {#if loadState === 'loading' && results.length === 0}
    <div class="discover-page__loading">Поиск…</div>
  {:else if loadState === 'empty'}
    <div class="discover-page__empty">Ничего не найдено</div>
  {:else if loadState === 'error'}
    <div class="discover-page__error"><p>Ошибка поиска</p></div>
  {:else if results.length > 0}
    {#each results as raw (raw.id)}
      {@const card = mapReleaseRawToCard(raw)}
      {@const statusLabel = releaseListStatusLabel(card.listStatus)}
      <button type="button" class="collection-release-picker__result" onclick={() => persistRelease(raw)}>
        <div class="collection-editor__release-poster">
          {#if card.poster}
            <img src={card.poster} alt="" />
          {/if}
          {#if statusLabel}
            <div class="collection-editor__release-badge">{statusLabel}</div>
          {/if}
        </div>
        <div class="collection-editor__release-body">
          <h3 class="collection-editor__release-title">{releaseCardTitle(card)}</h3>
          <p class="collection-editor__release-meta">{releaseCardMeta(card)}</p>
          {#if card.description}
            <p class="collection-editor__release-desc">{card.description}</p>
          {/if}
        </div>
      </button>
    {/each}
    {#if isLoading}
      <div class="discover-page__loading discover-page__loading--inline">Загрузка…</div>
    {/if}
  {/if}

  {#if getDraftReleases().length > 0}
    <p class="collection-editor__releases-count" style="margin-top: 1rem">
      В коллекции: {getDraftReleases().length} из {COLLECTION_RELEASES_MAX}
    </p>
  {/if}
</div>
