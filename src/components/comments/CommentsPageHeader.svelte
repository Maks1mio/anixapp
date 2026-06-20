<script lang="ts">
  import CommentsToolbar from './CommentsToolbar.svelte';
  import { iconArrowLeft } from '../icons';
  import type { CommentSort } from '../../types/comment';

  interface Props {
    title: string;
    subtitle?: string;
    onBack: () => void;
    backLabel?: string;
    showToolbar?: boolean;
    totalCount?: number;
    sort?: CommentSort;
    onSortChange?: (sort: CommentSort) => void;
    onSubtitleClick?: () => void;
  }

  let {
    title,
    subtitle = '',
    onBack,
    backLabel = 'Назад',
    showToolbar = false,
    totalCount = 0,
    sort,
    onSortChange,
    onSubtitleClick,
  }: Props = $props();
</script>

<header class="anix-comments-page-head">
  <button
    type="button"
    class="anix-comments-page-head__back"
    aria-label={backLabel}
    onclick={onBack}
  >
    {@html iconArrowLeft(20)}
  </button>

  <div class="anix-comments-page-head__body">
    <div class="anix-comments-page-head__text">
      <h1 class="anix-comments-page-head__title">{title}</h1>
      {#if subtitle}
        {#if onSubtitleClick}
          <button type="button" class="anix-comments-page-head__subtitle anix-comments-page-head__subtitle--link" onclick={onSubtitleClick}>
            {subtitle}
          </button>
        {:else}
          <p class="anix-comments-page-head__subtitle">{subtitle}</p>
        {/if}
      {/if}
    </div>

    {#if showToolbar && sort != null && onSortChange}
      <CommentsToolbar
        variant="page"
        {totalCount}
        {sort}
        onSortChange={onSortChange}
      />
    {/if}
  </div>
</header>
