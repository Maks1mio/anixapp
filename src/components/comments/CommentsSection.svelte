<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import CommentList from './CommentList.svelte';
  import CommentComposer from './CommentComposer.svelte';
  import type { CommentData } from '../../types/comment';
  import { normalizeComment, patchCommentInTree } from '../../utils/comment';

  interface Props {
    title?: string;
    subtitle?: string;
    items: CommentData[];
    totalCount?: number;
    previewLimit?: number;
    showAllHref?: string;
    releaseId?: number;
    mode?: 'preview' | 'full';
    showComposer?: boolean;
    asSection?: boolean;
    selfProfileId?: number | null;
    onItemsChange?: (items: CommentData[]) => void;
    onCommentAdded?: (comment: CommentData) => void;
  }

  let {
    title = 'Комментарии',
    subtitle = 'Популярные и актуальные',
    items,
    totalCount,
    previewLimit = 5,
    showAllHref,
    releaseId,
    mode = 'preview',
    showComposer = false,
    asSection = true,
    selfProfileId = null,
    onItemsChange,
    onCommentAdded,
  }: Props = $props();

  let localItems = $state<CommentData[]>([]);
  let replyTarget = $state<CommentData | null>(null);
  let submitting = $state(false);

  $effect(() => {
    localItems = items;
  });

  const isPreview = $derived(mode === 'preview');
  const visibleItems = $derived(isPreview ? localItems.slice(0, previewLimit) : localItems);
  const countLabel = $derived(totalCount ?? localItems.length);
  const showHeaderLink = $derived(isPreview && showAllHref && countLabel > previewLimit);
  const showHeader = $derived(Boolean(title) || Boolean(subtitle) || showHeaderLink);

  function updateItems(next: CommentData[]) {
    localItems = next;
    onItemsChange?.(next);
  }

  function handleVote(updated: CommentData) {
    const prev = localItems.find((c) => c.id === updated.id);
    if (!prev || !window.anixApi?.comments?.release) {
      updateItems(patchCommentInTree(localItems, updated.id, updated));
      return;
    }

    updateItems(patchCommentInTree(localItems, updated.id, updated));
    window.anixApi.comments.release
      .vote(updated.id, updated.userVote)
      .catch(() => {
        updateItems(patchCommentInTree(localItems, updated.id, prev));
      });
  }

  function handleReply(comment: CommentData) {
    if (isPreview && showAllHref) {
      navigate(`${showAllHref}?reply=${comment.id}`);
      return;
    }
    replyTarget = comment;
  }

  function handleNavigateReplies(comment: CommentData) {
    if (!releaseId) return;
    navigate(`/release/${releaseId}/comment/${comment.id}/replies`);
  }

  async function handleSubmit(payload: { message: string; isSpoiler: boolean }) {
    if (!releaseId || !window.anixApi?.comments?.release) return;
    submitting = true;
    try {
      const res = await window.anixApi.comments.release.add(releaseId, {
        message: payload.message,
        isSpoiler: payload.isSpoiler,
        parentCommentId: replyTarget?.id ?? null,
        replyToProfileId: replyTarget?.profile.id ?? null,
      }) as { comment?: Record<string, unknown> };

      if (res.comment) {
        const added = normalizeComment(res.comment);
        updateItems([added, ...localItems]);
        onCommentAdded?.(added);
        replyTarget = null;
      }
    } catch {
      /* ignore */
    } finally {
      submitting = false;
    }
  }

  function openAll() {
    if (showAllHref) navigate(showAllHref);
  }
</script>

<section class="anix-comments" class:release-page__section={asSection} id="comments">
  {#if showHeader}
    <header class="anix-comments__header">
    <div class="anix-comments__heading">
      <h2 class="anix-comments__title">{title}</h2>
      {#if subtitle}
        <p class="anix-comments__subtitle">{subtitle}</p>
      {/if}
    </div>

    {#if showHeaderLink}
      <button type="button" class="anix-comments__show-all" onclick={openAll}>
        Показать все
      </button>
    {/if}
  </header>
  {/if}

  {#if visibleItems.length === 0}
    <div class="anix-comments__empty">Комментариев пока нет</div>
  {:else}
    <CommentList
      items={visibleItems}
      {releaseId}
      canReply={!!releaseId}
      canVote={!!window.anixApi?.comments?.release}
      navigateReplies={!!releaseId}
      {selfProfileId}
      onReply={handleReply}
      onVote={handleVote}
      onNavigateReplies={handleNavigateReplies}
    />
  {/if}

  {#if showComposer && releaseId}
    <CommentComposer
      busy={submitting}
      replyToLogin={replyTarget?.profile.login ?? null}
      onCancelReply={() => { replyTarget = null; }}
      onSubmit={handleSubmit}
    />
  {/if}
</section>
