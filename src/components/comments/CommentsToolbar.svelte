<script lang="ts">
  import Select from '../Select.svelte';
  import { COMMENT_SORT_OPTIONS } from '../../types/comment';
  import type { CommentSort } from '../../types/comment';
  import { formatCommentsTotal } from '../../utils/comment';

  interface Props {
    totalCount: number;
    sort: CommentSort;
    onSortChange: (sort: CommentSort) => void;
    variant?: 'default' | 'header';
  }

  let { totalCount, sort, onSortChange, variant = 'default' }: Props = $props();

  const sortOptions = COMMENT_SORT_OPTIONS.map((o) => ({
    value: String(o.value),
    label: o.label,
  }));
</script>

<div class="anix-comments-toolbar" class:anix-comments-toolbar--header={variant === 'header'}>
  <span class="anix-comments-toolbar__count">{formatCommentsTotal(totalCount)}</span>

  <Select
    compact
    className="anix-comments-toolbar__select"
    options={sortOptions}
    value={String(sort)}
    onChange={(v) => onSortChange(Number(v) as CommentSort)}
  />
</div>
