<script lang="ts">
  /** Сортировка комментариев круглой кнопкой в строке вкладок (как фильтры в каталоге) */
  import UiV2PopupMenu from '../uikit-v2/UiV2PopupMenu.svelte';
  import { iconArrowUpDown } from '../icons';
  import { COMMENT_SORT_OPTIONS, type CommentSort } from '../../types/comment';

  interface Props {
    sort: CommentSort;
    onSortChange: (sort: CommentSort) => void;
  }

  let { sort, onSortChange }: Props = $props();

  let open = $state(false);
  let triggerEl = $state<HTMLButtonElement | null>(null);

  const items = $derived(
    COMMENT_SORT_OPTIONS.map((o) => ({
      id: String(o.value),
      label: o.label,
      type: 'radio' as const,
      checked: o.value === sort,
    })),
  );
</script>

<button
  bind:this={triggerEl}
  type="button"
  class="uiv2-tabs__tool-btn"
  aria-haspopup="menu"
  aria-expanded={open}
  aria-label="Сортировка"
  onclick={() => { open = !open; }}
>
  {@html iconArrowUpDown(18)}
</button>

<UiV2PopupMenu
  {open}
  x={0}
  y={0}
  dropdown
  anchor={triggerEl}
  {items}
  onClose={() => { open = false; }}
  onSelect={(id) => {
    open = false;
    onSortChange(Number(id) as CommentSort);
  }}
/>
