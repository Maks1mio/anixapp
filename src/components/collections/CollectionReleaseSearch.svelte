<script lang="ts">
  /** Поиск тайтлов для редактора коллекции: каталог AnixApp, при его недоступности — поиск Anixart. */
  import { onDestroy } from 'svelte';
  import { iconCheck, iconPlus, iconSearch } from '../icons';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2PillField from '../uikit-v2/UiV2PillField.svelte';
  import UiV2Skeleton from '../uikit-v2/UiV2Skeleton.svelte';
  import { searchCatalog } from '../../services/catalog-search';
  import { toPosterDisplayUrl } from '../../utils/posterUrl';
  import { mapReleaseRawToCard, releaseCardMeta, releaseCardTitle } from '../../utils/release-card';

  type Raw = Record<string, unknown>;

  interface Props {
    /** Тайтлы, которые уже в коллекции */
    selectedIds: ReadonlySet<number>;
    /** Достигнут лимит: добавлять нельзя, убрать можно */
    full: boolean;
    onToggle: (raw: Raw) => void;
  }

  let { selectedIds, full, onToggle }: Props = $props();

  /** Размер страницы поиска Anixart; каталог отдаёт столько же, чтобы страницы совпадали. */
  const PAGE = 25;
  const DEBOUNCE_MS = 300;

  let query = $state('');
  let results = $state<Raw[]>([]);
  let status = $state<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  let hasMore = $state(false);
  let loadingMore = $state(false);

  let gen = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function fetchPage(q: string, offset: number): Promise<{ items: Raw[]; hasMore: boolean }> {
    const catalog = await searchCatalog(q, { offset, limit: PAGE });
    if (catalog) {
      return {
        items: catalog.hits.map((hit) => hit.raw),
        hasMore: offset + catalog.hits.length < catalog.total,
      };
    }
    const data = (await window.anixApi!.search.releases(q, offset / PAGE, 0)) as Raw;
    const items = ((data?.content ?? data?.releases ?? []) as Raw[]).filter((raw) => Number(raw?.id) > 0);
    return { items, hasMore: items.length >= PAGE };
  }

  async function load(q: string, offset: number) {
    const current = gen;
    try {
      const page = await fetchPage(q, offset);
      if (current !== gen) return;
      const seen = new Set(offset ? results.map((raw) => Number(raw.id)) : []);
      const fresh = page.items.filter((raw) => !seen.has(Number(raw.id)));
      results = offset ? [...results, ...fresh] : fresh;
      hasMore = page.hasMore && page.items.length > 0;
      status = results.length ? 'ready' : 'empty';
    } catch {
      if (current !== gen) return;
      if (!offset) status = 'error';
      hasMore = offset > 0;
    } finally {
      if (current === gen) loadingMore = false;
    }
  }

  function startSearch() {
    clearTimeout(timer);
    gen += 1;
    loadingMore = false;
    const q = query.trim();
    if (!q) {
      results = [];
      hasMore = false;
      status = 'idle';
      return;
    }
    status = 'loading';
    timer = setTimeout(() => void load(q, 0), DEBOUNCE_MS);
  }

  function loadMore() {
    if (loadingMore) return;
    loadingMore = true;
    void load(query.trim(), results.length);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && query) {
      e.stopPropagation();
      query = '';
      startSearch();
    }
  }

  onDestroy(() => clearTimeout(timer));
</script>

<div class="collection-search">
  <UiV2PillField
    label="Найти тайтл и добавить в коллекцию"
    type="search"
    autocomplete="off"
    spellcheck={false}
    bind:value={query}
    oninput={startSearch}
    onkeydown={onKeydown}
  >
    {#snippet icon()}{@html iconSearch(16)}{/snippet}
  </UiV2PillField>

  {#if status !== 'idle'}
    <div class="collection-search__panel" aria-busy={status === 'loading'}>
      {#if status === 'loading'}
        {#each [0, 1, 2] as i (i)}
          <div class="collection-search__row" aria-hidden="true">
            <UiV2Skeleton class="collection-search__poster" />
            <span class="collection-search__body">
              <UiV2Skeleton class="collection-search__line" />
              <UiV2Skeleton class="collection-search__line collection-search__line--short" />
            </span>
          </div>
        {/each}
      {:else if status === 'error'}
        <div class="collection-search__empty">
          <p>Не удалось выполнить поиск</p>
          <UiV2Button label="Повторить" size="sm" onclick={startSearch} />
        </div>
      {:else if status === 'empty'}
        <p class="collection-search__empty">Ничего не найдено</p>
      {:else}
        {#each results as raw (raw.id)}
          {@const card = mapReleaseRawToCard(raw)}
          {@const added = selectedIds.has(Number(raw.id))}
          <button
            type="button"
            class="collection-search__row collection-search__row--action"
            class:collection-search__row--added={added}
            disabled={full && !added}
            aria-pressed={added}
            onclick={() => onToggle(raw)}
          >
            <span class="collection-search__poster">
              {#if card.poster}
                <img src={toPosterDisplayUrl(card.poster, 'cardHorizontal')} alt="" loading="lazy" decoding="async" draggable="false" />
              {/if}
            </span>
            <span class="collection-search__body">
              <span class="collection-search__title">{releaseCardTitle(card)}</span>
              <span class="collection-search__meta">
                {[card.year, releaseCardMeta(card)].filter(Boolean).join(' • ')}
              </span>
            </span>
            <span class="collection-search__mark" aria-hidden="true">
              {@html added ? iconCheck(16) : iconPlus(16)}
            </span>
          </button>
        {/each}
        {#if hasMore}
          <div class="collection-search__more">
            <UiV2Button
              label={loadingMore ? 'Загрузка…' : 'Показать ещё'}
              size="sm"
              variant="ghost"
              disabled={loadingMore}
              onclick={loadMore}
            />
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>
