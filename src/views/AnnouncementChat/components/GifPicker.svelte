<script lang="ts">
  import { searchGifs, getTrending, type GifResult } from '../../../services/giphy';
  import Page from '../../../components/Page.svelte';

  interface Props {
    open: boolean;
    onSelect: (url: string) => void;
    onClose: () => void;
  }

  let { open, onSelect, onClose }: Props = $props();

  const LIMIT = 24;

  let query = $state('');
  let gifs = $state<GifResult[]>([]);
  let offset = $state(0);
  let hasMore = $state(true);
  let loading = $state(false);
  let loadingMore = $state(false);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let ioRef: { observer?: IntersectionObserver } = {};

  function infiniteScrollSentinel(node: HTMLDivElement) {
    const scrollEl = document.getElementById('gif-grid');
    if (!scrollEl) return;
    ioRef.observer?.disconnect();
    ioRef.observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore(); },
      { root: scrollEl, rootMargin: '100px', threshold: 0 }
    );
    ioRef.observer.observe(node);
    return {
      destroy() {
        ioRef.observer?.disconnect();
      },
    };
  }

  async function loadGifs(reset = true) {
    if (reset) {
      loading = true;
      offset = 0;
      hasMore = true;
    } else {
      loadingMore = true;
    }
    try {
      const off = reset ? 0 : offset;
      const next = query.trim()
        ? await searchGifs(query.trim(), LIMIT, off)
        : await getTrending(LIMIT, off);
      hasMore = next.length >= LIMIT;
      if (reset) {
        gifs = next;
        offset = next.length;
      } else {
        gifs = [...gifs, ...next];
        offset += next.length;
      }
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  async function loadMore() {
    if (loading || loadingMore || !hasMore || gifs.length === 0) return;
    await loadGifs(false);
  }

  $effect(() => {
    if (!open) return;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadGifs(true), query ? 350 : 0);
    return () => {
      if (searchTimer) clearTimeout(searchTimer);
    };
  });

  function handleSelect(g: GifResult) {
    onSelect(g.url);
    onClose();
  }
</script>

{#if open}
  <!-- Backdrop: click outside to close -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="dc-gif-popover__backdrop"
    role="presentation"
    onclick={onClose}
  ></div>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="dc-gif-popover"
    role="dialog"
    aria-label="Выбор GIF"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Search -->
    <div class="dc-gif-popover__search-wrap">
      <svg class="dc-gif-popover__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="search"
        class="dc-gif-popover__search"
        placeholder="Поиск гифок…"
        bind:value={query}
        onkeydown={(e) => e.key === 'Escape' && onClose()}
      />
    </div>

    <!-- Content grid in Page with custom scroll -->
    <div class="dc-gif-popover__body">
      {#if loading}
        <div class="dc-gif-popover__status">
          <span class="dc-gif-popover__spinner"></span>
          Загрузка…
        </div>
      {:else if gifs.length === 0}
        <div class="dc-gif-popover__status">Ничего не найдено</div>
      {:else}
        <Page scrollId="gif-grid" noPadding={true} extraClass="dc-gif-popover__page">
          <div class="dc-gif-popover__grid">
            {#each gifs as g (g.id)}
              <button
                type="button"
                class="dc-gif-popover__item"
                onclick={() => handleSelect(g)}
              >
                <img src={g.preview} alt="" loading="lazy" />
              </button>
            {/each}
            {#if hasMore}
              <div use:infiniteScrollSentinel class="dc-gif-popover__sentinel" aria-hidden="true"></div>
            {/if}
          </div>
          {#if loadingMore}
            <div class="dc-gif-popover__more">
              <span class="dc-gif-popover__spinner"></span>
            </div>
          {/if}
        </Page>
      {/if}
    </div>

  </div>
{/if}

<style lang="scss">
  @use '../../../styles/variables' as *;

  .dc-gif-popover__backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: transparent;
    cursor: default;
  }

  .dc-gif-popover {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    width: 360px;
    height: 520px;
    display: flex;
    flex-direction: column;
    background: $color-surface;
    border: 1px solid $color-border;
    border-radius: 12px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.55);
    overflow: hidden;
    z-index: 1001;
  }

  .dc-gif-popover__search-wrap {
    position: relative;
    padding: 0.5rem 0.75rem;
    flex-shrink: 0;
  }

  .dc-gif-popover__search-icon {
    position: absolute;
    left: 1.25rem;
    top: 50%;
    transform: translateY(-50%);
    color: $color-text-muted;
    pointer-events: none;
  }

  .dc-gif-popover__search {
    width: 100%;
    padding: 0.5rem 0.75rem 0.5rem 2.25rem;
    font-size: 0.85rem;
    background: $color-bg;
    border: 1px solid $color-border;
    border-radius: 8px;
    color: $color-text;
    outline: none;
    transition: border-color $transition;

    &:focus {
      border-color: $color-accent;
    }

    &::placeholder {
      color: $color-text-muted;
    }
  }

  .dc-gif-popover__body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .dc-gif-popover__body .dc-gif-popover__status {
    padding: 2rem;
  }

  .dc-gif-popover__body :global(.dc-gif-popover__page) {
    flex: 1;
    min-height: 0;
  }

  .dc-gif-popover__body :global(.dc-gif-popover__page .page__scroll) {
    padding: 0 0.5rem 0.5rem;
  }

  .dc-gif-popover__status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    font-size: 0.85rem;
    color: $color-text-muted;
  }

  .dc-gif-popover__spinner {
    width: 18px;
    height: 18px;
    border: 2px solid $color-border;
    border-top-color: $color-text-muted;
    border-radius: 50%;
    animation: dc-gif-spin 0.6s linear infinite;
  }

  @keyframes dc-gif-spin {
    to { transform: rotate(360deg); }
  }

  .dc-gif-popover__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.35rem;
    padding: 0.25rem 0;
  }

  .dc-gif-popover__sentinel {
    grid-column: 1 / -1;
    height: 1px;
    pointer-events: none;
  }

  .dc-gif-popover__more {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
  }

  .dc-gif-popover__item {
    aspect-ratio: 1;
    padding: 0;
    background: $color-border;
    border: none;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: transform $transition;

    &:hover {
      transform: scale(1.02);
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

</style>
