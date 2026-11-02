<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../actions/portal';
  import { shortcutLabel } from '../utils/platform';
  import { getPath, getSearchParams } from '../router';
  import {
    iconSearch,
    iconX,
    iconClock,
    iconFilm,
    iconLayoutGrid,
    iconUsers,
    iconArrowRight,
  } from './icons';
  import {
    getSearchHistory,
    removeSearchHistory,
    clearSearchHistory,
  } from '../utils/search-history';
  import {
    openSearchPage,
    RELEASE_SEARCH_BY_OPTIONS,
    type SearchTab,
  } from '../search-controller';

  type Option =
    | { kind: 'scope'; tab: SearchTab; by: number; label: string; hint?: string; icon: string }
    | { kind: 'by'; by: number; label: string }
    | { kind: 'history'; value: string };

  const HISTORY_LIMIT = 8;

  let query = $state('');
  let focused = $state(false);
  let open = $state(false);
  let activeIndex = $state(-1);
  let recent = $state<string[]>(getSearchHistory());
  let inputEl = $state<HTMLInputElement | null>(null);
  let wrapEl = $state<HTMLDivElement | null>(null);
  let dropEl = $state<HTMLDivElement | null>(null);
  let dropTop = $state(0);
  let dropLeft = $state(0);
  let dropWidth = $state(0);

  const trimmed = $derived(query.trim());

  const scopeOptions = $derived.by((): Option[] => {
    if (!trimmed) return [];
    return [
      { kind: 'scope', tab: 'releases', by: 0, label: 'Тайтлы', hint: 'по названию', icon: iconFilm(16) },
      { kind: 'scope', tab: 'collections', by: 0, label: 'Коллекции', icon: iconLayoutGrid(16) },
      { kind: 'scope', tab: 'profiles', by: 0, label: 'Пользователи', icon: iconUsers(16) },
    ];
  });

  const byOptions = $derived.by((): Option[] => {
    if (!trimmed) return [];
    return RELEASE_SEARCH_BY_OPTIONS
      .filter((o) => Number(o.value) > 0)
      .map((o) => ({ kind: 'by', by: Number(o.value), label: o.label }));
  });

  const historyOptions = $derived.by((): Option[] => {
    const needle = trimmed.toLocaleLowerCase('ru-RU');
    return recent
      .filter((item) => item !== trimmed && (!needle || item.toLocaleLowerCase('ru-RU').includes(needle)))
      .slice(0, HISTORY_LIMIT)
      .map((value) => ({ kind: 'history', value }));
  });

  /** Порядок как в разметке — для стрелок. */
  const options = $derived([...scopeOptions, ...byOptions, ...historyOptions]);
  const showDrop = $derived(open && options.length > 0);

  function indexOf(opt: Option): number {
    return options.indexOf(opt);
  }

  function positionDrop() {
    if (!wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    const width = Math.max(rect.width, 400);
    const maxLeft = document.documentElement.clientWidth - width - 8;
    dropWidth = width;
    dropLeft = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, maxLeft));
    dropTop = rect.bottom + 6;
  }

  function openDrop() {
    recent = getSearchHistory();
    activeIndex = -1;
    positionDrop();
    open = true;
  }

  function closeDrop() {
    open = false;
    activeIndex = -1;
  }

  function finish() {
    closeDrop();
    inputEl?.blur();
  }

  function submit(tab: SearchTab = 'releases', by = 0, value = trimmed) {
    const q = value.trim();
    if (!q) return;
    query = q;
    openSearchPage(q, tab, by);
    finish();
  }

  function choose(opt: Option) {
    if (opt.kind === 'scope') submit(opt.tab, opt.by);
    else if (opt.kind === 'by') submit('releases', opt.by);
    else submit('releases', 0, opt.value);
  }

  function removeRecent(value: string) {
    removeSearchHistory(value);
    recent = getSearchHistory();
    activeIndex = -1;
  }

  function clearRecent() {
    clearSearchHistory();
    recent = [];
    activeIndex = -1;
  }

  function onFocus() {
    focused = true;
    openDrop();
  }

  function onBlur() {
    focused = false;
    closeDrop();
  }

  function onInput() {
    activeIndex = -1;
    if (!open) openDrop();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (open && options.length) closeDrop();
      else finish();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!options.length) return;
      e.preventDefault();
      if (!open) openDrop();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      activeIndex = (activeIndex + step + options.length + 1) % (options.length + 1);
      if (activeIndex === options.length) activeIndex = -1;
      void tick().then(() => {
        dropEl?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = activeIndex >= 0 ? options[activeIndex] : null;
      if (opt) choose(opt);
      else submit();
    }
  }

  function clearQuery() {
    query = '';
    activeIndex = -1;
    inputEl?.focus();
  }

  /** Текст поля следует за страницей поиска; на других страницах — пусто. */
  function syncFromRoute(route?: string) {
    if (focused) return;
    let pathname = getPath();
    let params = getSearchParams();
    if (typeof route === 'string' && route.startsWith('/')) {
      const qi = route.indexOf('?');
      pathname = qi >= 0 ? route.slice(0, qi) : route;
      params = new URLSearchParams(qi >= 0 ? route.slice(qi + 1) : '');
      // detail без query — тот же маршрут, параметры уже в URL
      if (qi < 0 && pathname === getPath()) params = getSearchParams();
    }
    query = pathname === '/search' ? params.get('q') ?? '' : '';
  }

  /** Не терять фокус поля при клике по пунктам. */
  function keepFocus(e: MouseEvent) {
    e.preventDefault();
  }

  onMount(() => {
    syncFromRoute();
    const onOpen = (e: Event) => {
      const q = (e as CustomEvent<{ q?: string }>).detail?.q;
      if (typeof q === 'string' && q) query = q;
      inputEl?.focus();
      inputEl?.select();
    };
    const onNavigate = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      syncFromRoute(typeof detail === 'string' ? detail : undefined);
    };
    const onPop = () => syncFromRoute();
    const onResize = () => {
      if (open) positionDrop();
    };
    window.addEventListener('anix:openSearchIsland', onOpen as EventListener);
    window.addEventListener('anix:navigate', onNavigate);
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('anix:openSearchIsland', onOpen as EventListener);
      window.removeEventListener('anix:navigate', onNavigate);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
      window.removeEventListener('resize', onResize);
    };
  });
</script>

<div class="titlebar-island" class:titlebar-island--focused={focused} bind:this={wrapEl}>
  <form
    class="titlebar-island__field"
    role="search"
    onsubmit={(e) => {
      e.preventDefault();
      submit();
    }}
  >
    <span class="titlebar-island__field-icon" aria-hidden="true">{@html iconSearch(15)}</span>
    <input
      id="titlebar-search-input"
      class="titlebar-island__input"
      type="search"
      placeholder="Поиск тайтлов, коллекций, пользователей"
      autocomplete="off"
      spellcheck="false"
      aria-label="Поиск"
      aria-autocomplete="list"
      aria-expanded={showDrop}
      aria-controls="titlebar-search-drop"
      bind:this={inputEl}
      bind:value={query}
      onfocus={onFocus}
      onblur={onBlur}
      oninput={onInput}
      onkeydown={onKeydown}
    />
    {#if trimmed}
      <button
        type="button"
        class="titlebar-island__clear"
        aria-label="Очистить"
        onmousedown={keepFocus}
        onclick={clearQuery}
      >
        {@html iconX(13)}
      </button>
    {:else if !focused}
      <kbd class="titlebar-island__kbd">{shortcutLabel('Ctrl+K')}</kbd>
    {/if}
  </form>
</div>

{#if showDrop}
  <div
    id="titlebar-search-drop"
    class="titlebar-island__drop"
    role="listbox"
    aria-label="Подсказки поиска"
    tabindex="-1"
    style="top:{dropTop}px; left:{dropLeft}px; width:{dropWidth}px;"
    bind:this={dropEl}
    use:portal={{ lock: false }}
    onmousedown={keepFocus}
    transition:fly={{ y: -4, duration: 140, easing: cubicOut }}
  >
    {#if scopeOptions.length}
      <section class="titlebar-island__group" aria-label="Где искать">
        <h3 class="titlebar-island__group-title">Искать «{trimmed}»</h3>
        {#each scopeOptions as opt (opt)}
          {#if opt.kind === 'scope'}
            {@const i = indexOf(opt)}
            <button
              type="button"
              class="titlebar-island__row"
              class:titlebar-island__row--active={activeIndex === i}
              role="option"
              aria-selected={activeIndex === i}
              data-active={activeIndex === i}
              onmouseenter={() => (activeIndex = i)}
              onclick={() => choose(opt)}
            >
              <span class="titlebar-island__row-icon" aria-hidden="true">{@html opt.icon}</span>
              <span class="titlebar-island__row-text">{opt.label}</span>
              {#if opt.hint}
                <span class="titlebar-island__row-hint">{opt.hint}</span>
              {/if}
              <span class="titlebar-island__row-go" aria-hidden="true">{@html iconArrowRight(14)}</span>
            </button>
          {/if}
        {/each}

        <div class="titlebar-island__by">
          <span class="titlebar-island__by-label">Тайтлы по</span>
          {#each byOptions as opt (opt)}
            {#if opt.kind === 'by'}
              {@const i = indexOf(opt)}
              <button
                type="button"
                class="titlebar-island__chip"
                class:titlebar-island__chip--active={activeIndex === i}
                role="option"
                aria-selected={activeIndex === i}
                data-active={activeIndex === i}
                onmouseenter={() => (activeIndex = i)}
                onclick={() => choose(opt)}
              >{opt.label.toLowerCase()}</button>
            {/if}
          {/each}
        </div>
      </section>
    {/if}

    {#if historyOptions.length}
      <section class="titlebar-island__group" aria-label="Недавние запросы">
        <div class="titlebar-island__group-head">
          <h3 class="titlebar-island__group-title">Недавние</h3>
          {#if !trimmed}
            <button type="button" class="titlebar-island__group-action" onclick={clearRecent}>
              Очистить
            </button>
          {/if}
        </div>
        {#each historyOptions as opt (opt)}
          {#if opt.kind === 'history'}
            {@const i = indexOf(opt)}
            <div
              class="titlebar-island__row titlebar-island__row--history"
              class:titlebar-island__row--active={activeIndex === i}
              data-active={activeIndex === i}
              role="presentation"
              onmouseenter={() => (activeIndex = i)}
            >
              <button
                type="button"
                class="titlebar-island__row-main"
                role="option"
                aria-selected={activeIndex === i}
                onclick={() => choose(opt)}
              >
                <span class="titlebar-island__row-icon" aria-hidden="true">{@html iconClock(15)}</span>
                <span class="titlebar-island__row-text">{opt.value}</span>
              </button>
              <button
                type="button"
                class="titlebar-island__row-remove"
                aria-label="Удалить из истории"
                onclick={() => removeRecent(opt.value)}
              >
                {@html iconX(13)}
              </button>
            </div>
          {/if}
        {/each}
      </section>
    {/if}
  </div>
{/if}
