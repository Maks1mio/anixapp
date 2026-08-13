<script lang="ts">
  import type { Snippet } from 'svelte';
  import Select from './Select.svelte';
  import { iconShuffle } from './icons';
  import { bookmarkSortSelectOptions } from '../constants/bookmarkSort';

  interface Props {
    totalCount: number;
    sort: number;
    onSortChange: (sort: number) => void;
    onRandom: () => void;
    randomLoading?: boolean;
    /** Кнопки слева от сортировки/рандома */
    leadingActions?: Snippet;
    showCount?: boolean;
  }

  let {
    totalCount,
    sort,
    onSortChange,
    onRandom,
    randomLoading = false,
    leadingActions,
    showCount = true,
  }: Props = $props();

  const sortOptions = bookmarkSortSelectOptions();
</script>

<div class="bookmarks-toolbar" role="toolbar" aria-label="Действия списка">
  {#if showCount}
    <span class="bookmarks-toolbar__count" title="Всего в списке">{totalCount}</span>
  {/if}
  <div class="bookmarks-toolbar__actions">
    {#if leadingActions}
      {@render leadingActions()}
    {/if}
    <Select
      compact
      options={sortOptions}
      value={String(sort)}
      onChange={(v) => onSortChange(Number(v))}
      placeholder="Сортировка"
      className="bookmarks-toolbar__sort"
    />
    <button
      type="button"
      class="bookmarks-toolbar__icon-btn"
      title="Случайный релиз"
      aria-label="Случайный релиз"
      disabled={randomLoading || totalCount === 0}
      onclick={() => onRandom()}
    >
      {@html iconShuffle(18)}
    </button>
  </div>
</div>
