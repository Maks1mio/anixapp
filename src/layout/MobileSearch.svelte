<script lang="ts">
  /**
   * Экран поиска в мобильном режиме: поле ввода в верхней панели, история запросов (пока запроса нет
   * или поле в фокусе) и панель фильтра. Результаты показывает обычная страница /search.
   */
  import { iconClock, iconSlidersHorizontal, iconX } from '../components/icons';
  import ReleaseFilterPanel from '../components/ReleaseFilterPanel.svelte';
  import { loadSearchFilter, saveSearchFilter } from '../utils/searchFilter';
  import { buildSearchRoute, SEARCH_PLACEHOLDERS, type SearchTab } from '../search-controller';
  import { navigate } from '../stores/navigation';
  import { addSearchHistory, clearSearchHistory, getSearchHistory, type SearchHistoryScope } from '../utils/search-history';

  interface Props {
    /** Запрос, вкладка и поле поиска из адреса страницы. */
    value?: string;
    tab?: SearchTab;
    searchBy?: number;
    /** Поиск внутри страницы (закладки): своя подпись и история, запрос уходит сюда, а не на /search. */
    local?: { label: string; onQuery: (query: string) => void };
  }
  let { value = '', tab = 'releases', searchBy = 0, local }: Props = $props();

  const historyScope = $derived<SearchHistoryScope>(local ? 'bookmarks' : tab);
  const placeholder = $derived(local?.label ?? SEARCH_PLACEHOLDERS[tab]);

  let query = $derived(value);
  let focused = $state(false);
  let filterPanelOpen = $state(false);
  let recent = $state<string[]>([]);
  let inputEl = $state<HTMLInputElement | null>(null);

  const showHistory = $derived(!value || focused);
  const history = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    return recent.filter((item) => item.toLocaleLowerCase('ru-RU').includes(needle));
  });

  $effect(() => {
    recent = getSearchHistory(historyScope);
  });

  // Пустой экран поиска сразу готов к вводу
  $effect(() => {
    if (!value) inputEl?.focus();
  });

  function onFocus() {
    recent = getSearchHistory(historyScope);
    focused = true;
  }

  function submit(text: string) {
    const q = text.trim();
    if (!q) return;
    query = q;
    inputEl?.blur();
    addSearchHistory(q, historyScope);
    if (q === value) return;
    if (local) {
      local.onQuery(q);
      return;
    }
    navigate(buildSearchRoute(q, tab, tab === 'releases' ? searchBy : 0));
  }

  function clearInput() {
    query = '';
    if (local && value) local.onQuery('');
    inputEl?.focus();
  }

  function clearAll() {
    clearSearchHistory(historyScope);
    recent = [];
  }

</script>

<form class="m-searchbar" role="search" onsubmit={(e) => { e.preventDefault(); submit(query); }}>
  <input
    bind:this={inputEl}
    bind:value={query}
    type="search"
    enterkeyhint="search"
    autocomplete="off"
    {placeholder}
    aria-label={placeholder}
    onfocus={onFocus}
    onblur={() => { focused = false; }}
  />
  {#if query}
    <!-- preventDefault: поле не теряет фокус, клавиатура не прячется -->
    <button type="button" class="m-icon-btn" aria-label="Очистить" onmousedown={(e) => e.preventDefault()} onclick={clearInput}>
      {@html iconX(24)}
    </button>
  {/if}
  {#if !local}
    <button type="button" class="m-icon-btn" aria-label="Поиск по фильтру" onclick={() => { filterPanelOpen = true; }}>
      {@html iconSlidersHorizontal(24)}
    </button>
  {/if}
</form>

{#if showHistory}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="m-search-history" onmousedown={(e) => e.preventDefault()}>
    {#if history.length > 0}
      <div class="m-search-history__head">
        <span>История поиска</span>
        <button type="button" onclick={clearAll}>Очистить все</button>
      </div>
      {#each history as item (item)}
        <button type="button" class="m-search-history__row" onclick={() => submit(item)}>
          {@html iconClock(24)}
          <span>{item}</span>
        </button>
      {/each}
    {:else if recent.length === 0}
      <p class="m-search-history__empty">Здесь появятся ваши запросы</p>
    {/if}
  </div>
{/if}

{#if filterPanelOpen}
  <ReleaseFilterPanel
    title="Фильтр"
    initial={loadSearchFilter()}
    applyLabel="Показать"
    onApply={(filter) => {
      saveSearchFilter(filter);
      filterPanelOpen = false;
      navigate('/filtered');
    }}
    onClose={() => { filterPanelOpen = false; }}
  />
{/if}

<style lang="scss">
  .m-searchbar {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    height: 48px;
    padding-left: var(--m-space-2);

    input {
      flex: 1;
      min-width: 0;
      height: 100%;
      border: 0;
      outline: 0;
      background: none;
      color: var(--m-text);
      font: 400 17px var(--m-font);
      appearance: none;
      &::placeholder { color: var(--m-text-2); }
      &::-webkit-search-cancel-button { display: none; }
    }
  }

  /* Под верхней панелью (12 + 48 + 9) и над таб-баром, поверх результатов */
  .m-search-history {
    position: fixed;
    top: calc(var(--safe-top) + 69px);
    left: var(--m-rail-left);
    right: var(--m-rail-right);
    bottom: calc(var(--m-nav-h) + var(--safe-bottom));
    z-index: 15;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--m-bg);
  }

  .m-search-history__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--m-space-1) 0 var(--m-gutter);
    color: var(--m-text-2);
    font-size: 15px;

    button {
      min-height: var(--m-touch);
      padding: 0 var(--m-space-3);
      border: 0;
      background: none;
      color: var(--m-text-2);
      font: 500 15px var(--m-font);
    }
  }

  .m-search-history__row {
    display: flex;
    align-items: center;
    gap: var(--m-space-5);
    width: 100%;
    min-height: 54px;
    padding: 0 var(--m-gutter);
    border: 0;
    background: none;
    color: var(--m-text);
    font: 400 16px var(--m-font);
    text-align: left;
    &:active { background: var(--m-press); }

    :global(svg) { flex: none; width: 24px; height: 24px; color: var(--m-text-2); }
    span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }

  .m-search-history__empty {
    margin: var(--m-space-5) var(--m-gutter);
    color: var(--m-text-2);
    font-size: 15px;
    text-align: center;
  }
</style>
