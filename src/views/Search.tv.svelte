<script lang="ts">
  import { onMount } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import TvReleaseGrid from '../components/tv/TvReleaseGrid.svelte';
  import TvCollectionTile from '../components/tv/TvCollectionTile.svelte';
  import type { CollectionCardData } from '../components/CollectionCard.svelte';
  import { iconSearch } from '../components/icons';
  import { addSearchHistory, getSearchHistory } from '../utils/search-history';
  import { mapReleaseRawToCard } from '../utils/release-card';
  import { mapCollectionCard } from '../utils/collection';
  import TvTypingWheel from '../components/tv/TvTypingWheel.svelte';
  import {
    TV_PAD_BUTTON,
    setTvGamepadCapture,
    tvInputDevice,
    type TvStick,
  } from '../services/tv-input';
  import {
    TV_WHEEL_LAYOUT_LABEL,
    TV_WHEEL_LAYOUT_NEXT,
    tvWheelChars,
    tvWheelIndex,
    type TvWheelLayout,
  } from '../tv/typingWheel';

  type Layout = 'ru' | 'en' | 'num';
  type Tab = 'releases' | 'collections';

  const LAYOUTS: Record<Layout, string[]> = {
    ru: [...'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'],
    en: [...'abcdefghijklmnopqrstuvwxyz'],
    num: [...'1234567890-.,:!?\'"&()'],
  };
  const LAYOUT_NEXT: Record<Layout, Layout> = { ru: 'en', en: 'ru', num: 'ru' };
  const LAYOUT_LABEL: Record<Layout, string> = { ru: 'ABC', en: 'АБВ', num: 'АБВ' };
  const SEARCH_DELAY_MS = 550;

  let query = $state('');
  let committed = $state('');
  let layout = $state<Layout>('ru');
  let tab = $state<Tab>('releases');
  let history = $state<string[]>(getSearchHistory().slice(0, 8));
  let collections = $state<CollectionCardData[]>([]);
  let collectionsState = $state<'loading' | 'ready' | 'empty' | 'error'>('loading');
  let wrapEl = $state<HTMLElement | undefined>();
  let timer = 0;
  let collectionsSeq = 0;

  const keys = $derived(LAYOUTS[layout]);

  // ——— Геймпад: два колеса букв под стиками, ввод триггерами ———
  const STICK_EPS = 0.02;
  let queryEl = $state<HTMLButtonElement | undefined>();
  let queryFocused = $state(false);
  let wheelLayout = $state<TvWheelLayout>('ru');
  let leftStick = $state<TvStick>({ x: 0, y: 0 });
  let rightStick = $state<TvStick>({ x: 0, y: 0 });
  let leftPulse = $state(0);
  let rightPulse = $state(0);

  const padMode = $derived($tvInputDevice === 'xbox' || $tvInputDevice === 'playstation');
  const wheelChars = $derived(tvWheelChars(wheelLayout));
  /** Колёса — пока фокус на строке запроса; ушли в результаты — стики снова навигация. */
  const wheelsOn = $derived(padMode && queryFocused);

  function sameStick(a: TvStick, b: TvStick): boolean {
    return Math.abs(a.x - b.x) < STICK_EPS && Math.abs(a.y - b.y) < STICK_EPS;
  }

  function typeFromWheel(side: 'left' | 'right'): void {
    const chars = side === 'left' ? wheelChars.left : wheelChars.right;
    const index = tvWheelIndex(side === 'left' ? leftStick : rightStick, chars.length);
    if (index < 0) return;
    type(chars[index]);
    if (side === 'left') leftPulse += 1;
    else rightPulse += 1;
  }

  /** B — спрятать клавиатуру: фокус уходит вниз, в результаты. Ниже пусто — обычный «Назад». */
  function closeWheels(): boolean {
    const from = document.activeElement;
    from?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    return document.activeElement !== from;
  }

  function onPadButton(index: number): boolean {
    switch (index) {
      case TV_PAD_BUTTON.LT:
        typeFromWheel('left');
        return true;
      case TV_PAD_BUTTON.RT:
        typeFromWheel('right');
        return true;
      case TV_PAD_BUTTON.X:
        backspace();
        return true;
      case TV_PAD_BUTTON.Y:
        if (query) type(' ');
        return true;
      case TV_PAD_BUTTON.LB:
        wheelLayout = TV_WHEEL_LAYOUT_NEXT[wheelLayout];
        return true;
      case TV_PAD_BUTTON.B:
        return closeWheels();
      default:
        return false;
    }
  }

  $effect(() => {
    if (!wheelsOn) return;
    const release = setTvGamepadCapture({
      sticks: (left, right) => {
        if (!sameStick(left, leftStick)) leftStick = left;
        if (!sameStick(right, rightStick)) rightStick = right;
      },
      button: onPadButton,
    });
    return () => {
      release();
      leftStick = { x: 0, y: 0 };
      rightStick = { x: 0, y: 0 };
    };
  });
  const gridKey = $derived(`${tab}|${committed}`);

  function scheduleSearch() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => commit(query), SEARCH_DELAY_MS);
  }

  function commit(value: string) {
    window.clearTimeout(timer);
    const next = value.trim();
    if (next === committed) return;
    committed = next;
    if (next && tab === 'collections') void loadCollections(next);
  }

  function type(ch: string) {
    if (query.length >= 80) return;
    query += ch;
    scheduleSearch();
  }

  function backspace() {
    if (!query) return;
    query = query.slice(0, -1);
    scheduleSearch();
  }

  function clear() {
    query = '';
    commit('');
  }

  function pickHistory(value: string) {
    query = value;
    commit(value);
  }

  function selectTab(next: Tab) {
    if (tab === next) return;
    tab = next;
    if (next === 'collections' && committed) void loadCollections(committed);
  }

  function extractContent(data: unknown): Record<string, unknown>[] {
    const rec = data as { content?: unknown } | null;
    let source: unknown = rec?.content ?? data;
    if (source && !Array.isArray(source) && typeof source === 'object') {
      const obj = source as Record<string, unknown>;
      if (Array.isArray(obj.releases)) source = obj.releases;
      else if (Array.isArray(obj.collections)) source = obj.collections;
    }
    return (Array.isArray(source) ? source : []).filter(
      (raw): raw is Record<string, unknown> => !!raw && typeof raw === 'object',
    );
  }

  async function fetchReleases(page: number) {
    const q = committed;
    const content = extractContent(await window.anixApi.search.releases(q, page, 0));
    if (page === 0 && content.length) {
      addSearchHistory(q);
      history = getSearchHistory().slice(0, 8);
    }
    return { items: content.map((raw) => mapReleaseRawToCard(raw)), done: content.length === 0 };
  }

  async function loadCollections(q: string) {
    const seq = ++collectionsSeq;
    collectionsState = 'loading';
    try {
      const content = extractContent(await window.anixApi.search.collections(q, 0));
      if (seq !== collectionsSeq) return;
      collections = content.map(mapCollectionCard).filter((c) => c.id > 0);
      collectionsState = collections.length ? 'ready' : 'empty';
    } catch {
      if (seq === collectionsSeq) collectionsState = 'error';
    }
  }

  function isLayerActive(): boolean {
    return !!wrapEl?.closest('.tv-route-layer--active');
  }

  /** Физическая клавиатура / пульт с буквами — печатаем без экранной клавиатуры. */
  function onKeydown(event: KeyboardEvent) {
    if (!isLayerActive() || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, [contenteditable="true"], [role="dialog"]')) return;
    if (event.key === 'Backspace') {
      event.preventDefault();
      backspace();
      return;
    }
    if (event.key.length !== 1) return;
    // Пробел на кнопке — это «нажать», а не символ.
    if (event.key === ' ' && (!query || document.activeElement?.closest('button'))) return;
    event.preventDefault();
    type(event.key.toLowerCase());
  }

  onMount(() => {
    // TV-навигация помечает фокус атрибутом — он надёжнее focusin (окно без фокуса их не шлёт).
    const syncFocus = () => {
      queryFocused = !!queryEl
        && (queryEl.getAttribute('data-tv-focus') === 'true' || document.activeElement === queryEl);
    };
    const observer = new MutationObserver(syncFocus);
    if (queryEl) observer.observe(queryEl, { attributes: true, attributeFilter: ['data-tv-focus'] });
    window.addEventListener('keydown', onKeydown);
    document.addEventListener('focusin', syncFocus);
    document.addEventListener('focusout', syncFocus);
    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', onKeydown);
      document.removeEventListener('focusin', syncFocus);
      document.removeEventListener('focusout', syncFocus);
      window.clearTimeout(timer);
    };
  });
</script>

<TvPage title="Поиск" hideHead>
  <div class="tv-home tv-search" class:tv-search--pad={padMode} class:tv-search--wheels={wheelsOn} bind:this={wrapEl}>
    <aside class="tv-search__panel" aria-label="Клавиатура">
      <!-- OK на строке запроса — искать сразу, без паузы набора. -->
      <button
        type="button"
        class="tv-search__query"
        class:tv-search__query--empty={!query}
        aria-live="polite"
        data-tv-autofocus={padMode || undefined}
        bind:this={queryEl}
        onclick={() => commit(query)}
      >
        <span class="tv-search__query-icon" aria-hidden="true">{@html iconSearch(26)}</span>
        <span class="tv-search__query-text">{query || 'Название аниме'}</span>
        <span class="tv-search__caret" aria-hidden="true"></span>
        {#if padMode}
          <span class="tv-search__layout">{TV_WHEEL_LAYOUT_LABEL[wheelLayout]}</span>
        {/if}
      </button>

      {#if !padMode}
      <div class="tv-search__keys" class:tv-search__keys--en={layout === 'en'} role="group" aria-label="Буквы">
        {#each keys as key, i (key)}
          <button
            type="button"
            class="tv-search__key"
            class:tv-search__key--primary={i === 0}
            onclick={() => type(key)}
          >{key}</button>
        {/each}
      </div>

      <div class="tv-search__controls">
        <button type="button" class="tv-search__key tv-search__key--wide" onclick={() => type(' ')}>Пробел</button>
        <button type="button" class="tv-search__key" aria-label="Стереть" onclick={backspace}>⌫</button>
        <button type="button" class="tv-search__key" onclick={() => (layout = LAYOUT_NEXT[layout])}>{LAYOUT_LABEL[layout]}</button>
        <button type="button" class="tv-search__key" onclick={() => (layout = layout === 'num' ? 'ru' : 'num')}>{layout === 'num' ? 'АБВ' : '123'}</button>
        <button type="button" class="tv-search__key tv-search__key--wide" onclick={clear} disabled={!query}>Очистить</button>
      </div>
      {/if}
    </aside>

    <section class="tv-search__results" data-tv-scroll aria-label="Результаты">
      {#if !committed}
        <div class="tv-search__intro">
          <h1 class="tv-bookmarks__empty-title">Поиск</h1>
          <p class="tv-bookmarks__empty-text">
            {padMode
              ? 'Наклоните стик к букве и нажмите триггер с той же стороны. Результаты появятся здесь.'
              : 'Набирайте название — результаты появятся здесь.'}
          </p>
          {#if history.length}
            <h2 class="tv-search__section-title">Недавние запросы</h2>
            <div class="tv-chips">
              {#each history as item (item)}
                <button type="button" class="tv-chip" onclick={() => pickHistory(item)}>{item}</button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <div class="tv-chips" role="tablist" aria-label="Что искать">
          <button type="button" class="tv-chip" class:tv-chip--active={tab === 'releases'} role="tab" aria-selected={tab === 'releases'} onclick={() => selectTab('releases')}>Аниме</button>
          <button type="button" class="tv-chip" class:tv-chip--active={tab === 'collections'} role="tab" aria-selected={tab === 'collections'} onclick={() => selectTab('collections')}>Коллекции</button>
        </div>

        {#if tab === 'releases'}
          <TvReleaseGrid fetchPage={fetchReleases} reloadKey={gridKey} emptyText={`По запросу «${committed}» ничего не найдено.`} />
        {:else if collectionsState === 'loading'}
          <p class="tv-page__status">Загрузка…</p>
        {:else if collectionsState === 'error'}
          <p class="tv-page__status">Не удалось загрузить коллекции.</p>
        {:else if collectionsState === 'empty'}
          <p class="tv-page__status">Коллекций по запросу «{committed}» нет.</p>
        {:else}
          <div class="tv-collections__grid tv-collections__grid--narrow" role="list">
            {#each collections as item (item.id)}
              <div role="listitem"><TvCollectionTile data={item} /></div>
            {/each}
          </div>
        {/if}
      {/if}
    </section>

    {#if wheelsOn}
      <div class="tv-search__wheels" aria-hidden="true">
        <TvTypingWheel side="left" chars={wheelChars.left} stick={leftStick} pulse={leftPulse} />
        <TvTypingWheel side="right" chars={wheelChars.right} stick={rightStick} pulse={rightPulse} />
      </div>
    {/if}
  </div>
</TvPage>
