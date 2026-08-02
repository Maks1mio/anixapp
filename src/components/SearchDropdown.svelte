<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getSearchHistory } from '../utils/search-history';

  export type SearchDropdownTab = 'releases' | 'profiles' | 'collections';

  export interface SearchDropdownSelect {
    query: string;
    tab?: SearchDropdownTab;
  }

  interface Props {
    searchInput: HTMLInputElement;
    anchor: HTMLElement;
    onSelect: (params: SearchDropdownSelect) => void;
  }

  const { searchInput, anchor, onSelect }: Props = $props();

  const GAP = 4;
  const EDGE = 8;

  let dropdownEl = $state<HTMLElement | null>(null);
  let visible = $state(true);
  let history = $state<string[]>([]);
  let query = $state('');
  let currentIndex = $state(-1);

  let top = $state(0);
  let left = $state(0);
  let width = $state(0);

  const filteredHistory = $derived(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => h.toLowerCase().includes(q));
  });

  const hasItems = $derived(filteredHistory().length > 0);

  function positionDropdown() {
    if (!anchor || !dropdownEl) return;
    const rect = anchor.getBoundingClientRect();
    const vh = document.documentElement.clientHeight;
    const dropdownHeight = dropdownEl.offsetHeight;

    let newTop = rect.bottom + GAP;
    if (newTop + dropdownHeight > vh - EDGE) {
      newTop = Math.max(EDGE, rect.top - dropdownHeight - GAP);
    }
    top = newTop;
    left = rect.left;
    width = rect.width;
  }

  function handleInput() {
    query = searchInput.value;
    currentIndex = -1;
    positionDropdown();
  }

  function handleHistoryClick(item: string) {
    onSelect({ query: item });
  }

  function setActive(index: number) {
    currentIndex = index;
  }

  function getItems(): HTMLButtonElement[] {
    if (!dropdownEl) return [];
    return Array.from(
      dropdownEl.querySelectorAll<HTMLButtonElement>(
        '.search-dropdown__option, .search-dropdown__history-item'
      )
    );
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onSelect({ query: '' });
      return;
    }

    const items = getItems();
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      currentIndex = (currentIndex + 1 + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('search-dropdown__item--active', i === currentIndex));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      currentIndex = (currentIndex - 1 + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('search-dropdown__item--active', i === currentIndex));
      return;
    }

    if (e.key === 'Enter' && currentIndex >= 0) {
      e.preventDefault();
      items[currentIndex]?.click();
    }
  }

  function onMouseDown(e: MouseEvent) {
    const target = e.target as Node;
    if (!dropdownEl) return;
    if (dropdownEl.contains(target) || anchor.contains(target)) return;
    onSelect({ query: '' });
  }

  onMount(() => {
    history = getSearchHistory();
    query = searchInput.value;

    searchInput.addEventListener('input', handleInput);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);

    // Position after mount
    requestAnimationFrame(() => positionDropdown());
  });

  onDestroy(() => {
    searchInput.removeEventListener('input', handleInput);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('mousedown', onMouseDown);
  });
</script>

{#if visible && hasItems}
  <div
    class="search-dropdown"
    role="listbox"
    bind:this={dropdownEl}
    style="position:fixed; left:{left}px; top:{top}px; width:{width}px; min-width:{width}px;"
  >
    <div class="search-dropdown__section">Недавние запросы</div>
    {#each filteredHistory() as item, i}
      <button
        type="button"
        class="search-dropdown__history-item"
        class:search-dropdown__item--active={i === currentIndex}
        onclick={() => handleHistoryClick(item)}
      >
        {item}
      </button>
    {/each}
  </div>
{/if}
