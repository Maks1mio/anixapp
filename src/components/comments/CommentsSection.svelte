<script lang="ts">
  import type { Snippet } from 'svelte';
  import { navigate } from '../../stores/navigation';
  import { requireAuth } from '../../stores/auth';
  import CommentList from './CommentList.svelte';
  import CommentComposer from './CommentComposer.svelte';
  import CommentsLoadSentinel from './CommentsLoadSentinel.svelte';
  import type { CommentData } from '../../types/comment';
  import { normalizeComment, patchCommentInTree, buildReleaseCommentAddBody } from '../../utils/comment';
  import { resolveJacksonRefs } from '../../utils/jackson-refs';

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
    composerDock?: boolean;
    asSection?: boolean;
    selfProfileId?: number | null;
    initialReplyId?: number | null;
    prepend?: Snippet;
    loadMore?: {
      hasMore: boolean;
      loading: boolean;
      onLoad: () => void;
    };
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
    composerDock = false,
    asSection = true,
    selfProfileId = null,
    initialReplyId = null,
    prepend,
    loadMore,
    onItemsChange,
    onCommentAdded,
  }: Props = $props();

  let localItems = $state<CommentData[]>([]);
  let replyTarget = $state<CommentData | null>(null);
  let submitting = $state(false);
  let initialReplyApplied = $state(false);
  let scrollRootEl = $state<HTMLElement | null>(null);

  $effect(() => {
    localItems = items;
  });

  $effect(() => {
    if (initialReplyApplied || !initialReplyId || localItems.length === 0) return;
    const target = localItems.find((c) => c.id === initialReplyId);
    if (!target) return;
    initialReplyApplied = true;
    replyTarget = target;
    focusComposer();
  });

  const isPreview = $derived(mode === 'preview');
  const visibleItems = $derived(isPreview ? localItems.slice(0, previewLimit) : localItems);
  const showHeaderLink = $derived(isPreview && !!showAllHref);
  const showHeader = $derived(Boolean(title) || Boolean(subtitle) || showHeaderLink);
  const useInlineComposer = $derived(showComposer && !!releaseId && !composerDock);

  function focusComposer() {
    queueMicrotask(() => {
      document.querySelector<HTMLTextAreaElement>('#comments-composer textarea')?.focus();
    });
  }

  function updateItems(next: CommentData[]) {
    localItems = next;
    onItemsChange?.(next);
  }

  function handleVote(updated: CommentData) {
    if (!requireAuth()) return;
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
    if (!requireAuth()) return;
    replyTarget = comment;
    if (composerDock) {
      focusComposer();
      return;
    }
    queueMicrotask(() => {
      document.getElementById(`comment-reply-${comment.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }

  function handleNavigateReplies(comment: CommentData) {
    if (!releaseId) return;
    navigate(`/release/${releaseId}/comment/${comment.id}/replies`);
  }

  async function handleSubmit(payload: { message: string; isSpoiler: boolean }) {
    if (!releaseId || !window.anixApi?.comments?.release) return;
    submitting = true;
    try {
      const res = await window.anixApi.comments.release.add(
        releaseId,
        buildReleaseCommentAddBody(payload, { replyTarget }),
      ) as { comment?: Record<string, unknown>; code?: number };

      if (res.code != null && res.code !== 0) {
        throw new Error(String(res.code));
      }

      if (res.comment) {
        const resolved = resolveJacksonRefs(res) as Record<string, unknown>;
        const commentRaw = (resolved.comment ?? res.comment) as Record<string, unknown>;
        const added = normalizeComment(commentRaw, resolved);
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

  async function handleEdit(
    comment: CommentData,
    payload: { message: string; isSpoiler: boolean },
  ) {
    if (!window.anixApi?.comments?.release?.edit) return;
    const prev = localItems.find((c) => c.id === comment.id);
    if (!prev) return;

    const optimistic: CommentData = {
      ...prev,
      message: payload.message,
      isSpoiler: payload.isSpoiler,
      isEdited: true,
    };
    updateItems(patchCommentInTree(localItems, comment.id, optimistic));

    try {
      await window.anixApi.comments.release.edit(comment.id, {
        message: payload.message,
        isSpoiler: payload.isSpoiler,
      });
    } catch {
      updateItems(patchCommentInTree(localItems, comment.id, prev));
    }
  }

  async function handleDelete(comment: CommentData) {
    if (!window.anixApi?.comments?.release?.delete) return;
    const prev = localItems.find((c) => c.id === comment.id);
    if (!prev) return;

    const optimistic: CommentData = {
      ...prev,
      isDeleted: true,
      message: '',
    };
    updateItems(patchCommentInTree(localItems, comment.id, optimistic));

    try {
      await window.anixApi.comments.release.delete(comment.id);
    } catch {
      updateItems(patchCommentInTree(localItems, comment.id, prev));
    }
  }

  function openAll() {
    if (showAllHref) navigate(showAllHref);
  }

  $effect(() => {
    loadMore?.hasMore;
    loadMore?.loading;
    visibleItems.length;
    const root = scrollRootEl;
    if (!loadMore?.hasMore || loadMore.loading || !root) return;

    queueMicrotask(() => {
      if (!loadMore?.hasMore || loadMore.loading) return;
      if (root.scrollHeight <= root.clientHeight + 80) {
        loadMore.onLoad();
      }
    });
  });
</script>

{#snippet commentsBody()}
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
          Показать всё
        </button>
      {/if}
    </header>
  {/if}

  {#if useInlineComposer && !replyTarget}
    <div class="anix-comments__composer" id="comments-composer">
      <CommentComposer busy={submitting} onSubmit={handleSubmit} />
    </div>
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
      {replyTarget}
      showInlineComposer={useInlineComposer}
      submitting={submitting}
      onReply={handleReply}
      onVote={handleVote}
      onNavigateReplies={handleNavigateReplies}
      onSubmit={handleSubmit}
      onCancelReply={() => { replyTarget = null; }}
      onEdit={handleEdit}
      onDelete={handleDelete}
    />
  {/if}

  {#if loadMore && (loadMore.hasMore || loadMore.loading)}
    <CommentsLoadSentinel
      hasMore={loadMore.hasMore}
      loading={loadMore.loading}
      onLoad={loadMore.onLoad}
      scrollRoot={composerDock ? scrollRootEl : null}
    />
  {/if}
{/snippet}

{#if composerDock}
  <section class="anix-comments anix-comments--dock-layout" id="comments">
    <div class="anix-comments__scroll-body" bind:this={scrollRootEl}>
      {@render prepend?.()}
      {@render commentsBody()}
    </div>

    {#if showComposer && releaseId}
      <div class="anix-comments__dock" id="comments-composer">
        <CommentComposer
          busy={submitting}
          replyToLogin={replyTarget?.profile.login ?? null}
          onCancelReply={() => { replyTarget = null; }}
          onSubmit={handleSubmit}
        />
      </div>
    {/if}
  </section>
{:else}
  <section class="anix-comments" id="comments">
    {@render commentsBody()}
  </section>
{/if}
