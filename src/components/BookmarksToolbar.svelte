<script lang="ts">
  import Select from './Select.svelte';
  import { iconShuffle } from './icons';
  import { bookmarkSortSelectOptions } from '../constants/bookmarkSort';

  interface Props {
    totalCount: number;
    sort: number;
    onSortChange: (sort: number) => void;
    onRandom: () => void;
    randomLoading?: boolean;
  }

  let { totalCount, sort, onSortChange, onRandom, randomLoading = false }: Props = $props();

  const sortOptions = bookmarkSortSelectOptions();
</script>

<div class="bookmarks-toolbar">
  <span class="bookmarks-toolbar__count">{totalCount} всего</span>
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
