<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from '../stores/navigation';
  import CommentRow from '../components/comments/CommentRow.svelte';
  import CommentList from '../components/comments/CommentList.svelte';
  import CommentComposer from '../components/comments/CommentComposer.svelte';
  import CommentsToolbar from '../components/comments/CommentsToolbar.svelte';
  import { iconArrowLeft } from '../components/icons';
  import {
    normalizeComment,
    patchCommentInTree,
  } from '../utils/comment';
  import type { CommentData, CommentSort } from '../types/comment';
  import { COMMENT_REPLIES_SORT_DEFAULT } from '../types/comment';

  interface Props {
    releaseId: number;
    commentId: number;
  }

  let { releaseId, commentId }: Props = $props();

  type LoadState = 'loading' | 'ready' | 'error';

  let loadState = $state<LoadState>('loading');
  let errorMsg = $state('');
  let parent = $state<CommentData | null>(null);
  let replies = $state<CommentData[]>([]);
  let totalCount = $state(0);
  let page = $state(0);
  let hasMore = $state(false);
  let loadingMore = $state(false);
  let sort = $state<CommentSort>(COMMENT_REPLIES_SORT_DEFAULT);
  let selfProfileId = $state<number | null>(null);
  let submitting = $state(false);

  async function loadParent() {
    if (!window.anixApi?.comments?.release) return;
    try {
      const data = await window.anixApi.comments.release.get(commentId) as Record<string, unknown>;
      parent = normalizeComment(data);
    } catch {
      parent = null;
    }
  }

  async function loadReplies(nextPage: number, append = false) {
    if (!window.anixApi?.comments?.release) {
      loadState = 'error';
      errorMsg = 'API недоступен';
      return;
    }

    if (append) loadingMore = true;
    else if (nextPage === 0) loadState = 'loading';

    try {
      const data = await window.anixApi.comments.release.replies(commentId, nextPage, sort) as {
        content?: Record<string, unknown>[];
        total_count?: number;
        total_elements?: number;
        last?: boolean;
      };

      const chunk = (data.content ?? []).map((raw) => normalizeComment(raw));
      replies = append ? [...replies, ...chunk] : chunk;
      totalCount = parent?.replyCount ?? data.total_count ?? data.total_elements ?? chunk.length;
      hasMore = data.last === false || chunk.length > 0 && replies.length < totalCount;
      page = nextPage;
      loadState = 'ready';
    } catch (err) {
      if (!append) {
        loadState = 'error';
        errorMsg = String(err);
      }
    } finally {
      loadingMore = false;
    }
  }

  async function reloadAll() {
    await loadParent();
    await loadReplies(0);
  }

  onMount(() => {
    void window.anixApi?.profile?.self?.().then((data: { profile?: { id?: number } }) => {
      selfProfileId = data?.profile?.id ?? null;
    });
    void reloadAll();
  });

  function handleSortChange(next: CommentSort) {
    sort = next;
    void loadReplies(0);
  }

  function handleVote(updated: CommentData) {
    const prev =
      updated.id === parent?.id
        ? parent
        : replies.find((c) => c.id === updated.id);
    if (!prev) return;

    if (updated.id === parent?.id) {
      parent = updated;
    } else {
      replies = patchCommentInTree(replies, updated.id, updated);
    }

    if (!window.anixApi?.comments?.release) return;

    window.anixApi.comments.release.vote(updated.id, updated.userVote).catch(() => {
      if (updated.id === parent?.id) parent = prev;
      else replies = patchCommentInTree(replies, updated.id, prev);
    });
  }

  function handleReplyToParent() {
    document.getElementById('replies-composer')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function handleNavigateReplies(reply: CommentData) {
    navigate(`/release/${releaseId}/comment/${reply.id}/replies`);
  }

  async function handleSubmit(payload: { message: string; isSpoiler: boolean }) {
    if (!window.anixApi?.comments?.release) return;
    submitting = true;
    try {
      const res = await window.anixApi.comments.release.add(releaseId, {
        message: payload.message,
        isSpoiler: payload.isSpoiler,
        parentCommentId: commentId,
        replyToProfileId: parent?.profile.id ?? null,
      }) as { comment?: Record<string, unknown> };

      if (res.comment) {
        const added = normalizeComment(res.comment);
        replies = [added, ...replies];
        totalCount += 1;
        if (parent) {
          parent = { ...parent, replyCount: parent.replyCount + 1 };
        }
      }
    } catch {
      /* ignore */
    } finally {
      submitting = false;
    }
  }

  function loadMore() {
    if (!hasMore || loadingMore) return;
    void loadReplies(page + 1, true);
  }

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate(`/release/${releaseId}/comments`);
    }
  }
</script>

<div class="view anix-comments-page anix-comments-replies-page">
  <div class="anix-comments-replies-page__top">
    <button type="button" class="anix-comments-replies-page__back" onclick={goBack} aria-label="Назад">
      {@html iconArrowLeft(22)}
    </button>
    <div class="view-header anix-comments-replies-page__header">
      <h1 class="view-header__title">Ответы</h1>
    </div>
    {#if loadState === 'ready'}
      <CommentsToolbar
        variant="header"
        totalCount={totalCount}
        {sort}
        onSortChange={handleSortChange}
      />
    {/if}
  </div>

  {#if loadState === 'loading' && !parent}
    <div class="anix-comments__empty">Загрузка…</div>
  {:else if loadState === 'error'}
    <div class="anix-comments__empty">{errorMsg}</div>
  {:else}
    {#if parent}
      <div class="anix-comments-replies-page__parent">
        <CommentRow
          comment={parent}
          canReply={true}
          canVote={!!window.anixApi?.comments?.release}
          showRepliesToggle={false}
          isMine={selfProfileId != null && parent.profile.id === selfProfileId}
          onReply={handleReplyToParent}
          onVote={(c) => handleVote(c)}
        />
      </div>
    {/if}

    {#if loadState === 'loading'}
      <div class="anix-comments__empty">Загрузка…</div>
    {:else if replies.length === 0}
      <div class="anix-comments__empty">Ответов пока нет</div>
    {:else}
      <CommentList
        items={replies}
        {releaseId}
        canReply={true}
        canVote={!!window.anixApi?.comments?.release}
        navigateReplies={true}
        {selfProfileId}
        onReply={handleReplyToParent}
        onVote={handleVote}
        onNavigateReplies={handleNavigateReplies}
      />
    {/if}

    {#if hasMore}
      <button
        type="button"
        class="anix-comments-page__load-more"
        disabled={loadingMore}
        onclick={loadMore}
      >
        {loadingMore ? 'Загрузка…' : 'Загрузить ещё'}
      </button>
    {/if}

    <div id="replies-composer">
      <CommentComposer busy={submitting} onSubmit={handleSubmit} />
    </div>
  {/if}
</div>
