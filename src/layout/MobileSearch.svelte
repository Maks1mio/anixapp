<script lang="ts">
  /**
   * Экран поиска в мобильном режиме: поле ввода в верхней панели, история запросов (пока запроса нет
   * или поле в фокусе) и шторка фильтров. Результаты показывает обычная страница /search.
   */
  import { iconClock, iconSlidersHorizontal, iconX } from '../components/icons';
  import { buildSearchRoute, RELEASE_SEARCH_BY_OPTIONS, type SearchTab } from '../search-controller';
  import { navigate, replacePath } from '../stores/navigation';
  import { addSearchHistory, clearSearchHistory, getSearchHistory } from '../utils/search-history';

  interface Props {
    /** Запрос, вкладка и фильтры из адреса страницы. */
    value?: string;
    tab?: SearchTab;
    searchBy?: number;
    hiddenOnly?: boolean;
  }
  let { value = '', tab = 'releases', searchBy = 0, hiddenOnly = false }: Props = $props();

  let query = $derived(value);
  /** Фильтры можно выбрать и до ввода запроса: применятся при отправке. */
  let by = $derived(searchBy);
  let hidden = $derived(hiddenOnly);
  let focused = $state(false);
  let filtersOpen = $state(false);
  let recent = $state<string[]>(getSearchHistory());
  let inputEl = $state<HTMLInputElement | null>(null);

  const hasFilters = $derived(by > 0 || hidden);
  const showHistory = $derived(!value || focused);
  const history = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    return recent.filter((item) => item.toLocaleLowerCase('ru-RU').includes(needle));
  });

  // Пустой экран поиска сразу готов к вводу; при переходе по истории шторка не остаётся открытой
  $effect(() => {
    filtersOpen = false;
    if (!value) inputEl?.focus();
  });

  function onFocus() {
    recent = getSearchHistory();
    focused = true;
  }

  function submit(text: string) {
    const q = text.trim();
    if (!q) return;
    query = q;
    inputEl?.blur();
    addSearchHistory(q);
    if (q === value) return;
    navigate(buildSearchRoute(q, tab, tab === 'releases' ? by : 0, tab === 'releases' && hidden));
  }

  function clearInput() {
    query = '';
    inputEl?.focus();
  }

  function clearAll() {
    clearSearchHistory();
    recent = [];
  }

  function applyFilters() {
    if (value) replacePath(buildSearchRoute(value, 'releases', by, hidden));
  }

  function setBy(next: number) {
    by = next;
    applyFilters();
  }

  function toggleHidden() {
    hidden = !hidden;
    applyFilters();
  }
</script>

<form class="m-searchbar" role="search" onsubmit={(e) => { e.preventDefault(); submit(query); }}>
  <input
    bind:this={inputEl}
    bind:value={query}
    type="search"
    enterkeyhint="search"
    autocomplete="off"
    placeholder="Поиск"
    aria-label="Поиск"
    onfocus={onFocus}
    onblur={() => { focused = false; }}
  />
  {#if query}
    <!-- preventDefault: поле не теряет фокус, клавиатура не прячется -->
    <button type="button" class="m-icon-btn" aria-label="Очистить" onmousedown={(e) => e.preventDefault()} onclick={clearInput}>
      {@html iconX(24)}
    </button>
  {/if}
  {#if tab === 'releases'}
    <button type="button" class="m-icon-btn" aria-label="Фильтры поиска" onclick={() => { filtersOpen = true; }}>
      {@html iconSlidersHorizontal(24)}
      {#if hasFilters}<i class="m-dot"></i>{/if}
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

{#if filtersOpen}
  <button type="button" class="m-overlay m-search-scrim" aria-label="Закрыть" onclick={() => { filtersOpen = false; }}></button>
  <div class="m-sheet m-search-filters" role="dialog" aria-label="Фильтры поиска">
    <div class="m-sheet__handle"></div>
    <p class="m-search-filters__label">Искать по</p>
    <div class="m-search-filters__chips">
      {#each RELEASE_SEARCH_BY_OPTIONS as option (option.value)}
        <button
          type="button"
          class="m-search-filters__chip"
          class:m-search-filters__chip--on={Number(option.value) === by}
          aria-pressed={Number(option.value) === by}
          onclick={() => setBy(Number(option.value))}
        >{option.label}</button>
      {/each}
    </div>
    <p class="m-search-filters__label">Показывать</p>
    <div class="m-search-filters__chips">
      <button
        type="button"
        class="m-search-filters__chip"
        class:m-search-filters__chip--on={hidden}
        aria-pressed={hidden}
        onclick={toggleHidden}
      >Только скрытые в Anixart</button>
    </div>
  </div>
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
    top: calc(env(safe-area-inset-top) + 69px);
    left: var(--m-rail-w);
    right: 0;
    bottom: calc(var(--m-nav-h) + env(safe-area-inset-bottom));
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

  .m-search-scrim { border: 0; padding: 0; }

  .m-search-filters__label {
    margin: var(--m-space-4) 0 var(--m-space-2);
    color: var(--m-text-2);
    font-size: 14px;
    &:first-of-type { margin-top: 0; }
  }

  .m-search-filters__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--m-space-2);
  }

  .m-search-filters__chip {
    min-height: 40px;
    padding: 0 var(--m-space-4);
    border: 1px solid var(--m-outline-variant);
    border-radius: var(--m-radius-pill);
    background: none;
    color: var(--m-text);
    font: 500 14px var(--m-font);

    &--on {
      border-color: transparent;
      background: var(--m-secondary-container);
      color: var(--m-on-secondary-container);
    }
  }
</style>
