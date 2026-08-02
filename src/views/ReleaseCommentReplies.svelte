<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from '../stores/navigation';
  import CommentRow from '../components/comments/CommentRow.svelte';
  import CommentList from '../components/comments/CommentList.svelte';
  import CommentComposer from '../components/comments/CommentComposer.svelte';
  import CommentsLoadSentinel from '../components/comments/CommentsLoadSentinel.svelte';
  import CommentsPageHeader from '../components/comments/CommentsPageHeader.svelte';
  import {
    normalizeComment,
    normalizeCommentsFromResponse,
    patchCommentInTree,
    buildReleaseCommentAddBody,
  } from '../utils/comment';
  import { resolveJacksonRefs } from '../utils/jackson-refs';
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
  let replyTarget = $state<CommentData | null>(null);
  let scrollRootEl = $state<HTMLElement | null>(null);
  let releaseTitle = $state('');

  async function loadParent() {
    if (!window.anixApi?.comments?.release) return;
    try {
      const data = await window.anixApi.comments.release.get(commentId) as Record<string, unknown>;
      const resolved = resolveJacksonRefs(data) as Record<string, unknown>;
      parent = normalizeComment(resolved, resolved);
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

      const chunk = normalizeCommentsFromResponse(data as Record<string, unknown>);
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
    void window.anixApi?.release?.info(releaseId, false).then((data: { release?: { title_ru?: string; title_original?: string } }) => {
      const r = data.release;
      releaseTitle = r?.title_ru || r?.title_original || '';
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

  function focusComposer() {
    queueMicrotask(() => {
      document.querySelector<HTMLTextAreaElement>('#replies-composer textarea')?.focus();
    });
  }

  function handleReply(comment: CommentData) {
    replyTarget = comment;
    focusComposer();
  }

  function handleNavigateReplies(reply: CommentData) {
    navigate(`/release/${releaseId}/comment/${reply.id}/replies`);
  }

  async function handleSubmit(payload: { message: string; isSpoiler: boolean }) {
    if (!window.anixApi?.comments?.release) return;
    submitting = true;
    try {
      const res = await window.anixApi.comments.release.add(
        releaseId,
        buildReleaseCommentAddBody(payload, {
          replyTarget,
          threadRootCommentId: commentId,
        }),
      ) as { comment?: Record<string, unknown>; code?: number };

      if (res.code != null && res.code !== 0) {
        throw new Error(String(res.code));
      }

      if (res.comment) {
        const resolvedAdd = resolveJacksonRefs(res) as Record<string, unknown>;
        const commentRaw = (resolvedAdd.comment ?? res.comment) as Record<string, unknown>;
        const added = normalizeComment(commentRaw, resolvedAdd);
        replies = [added, ...replies];
        totalCount += 1;
        if (parent) {
          parent = { ...parent, replyCount: parent.replyCount + 1 };
        }
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

    const isParent = comment.id === parent?.id;
    const prev = isParent ? parent : replies.find((c) => c.id === comment.id);
    if (!prev) return;

    const optimistic: CommentData = {
      ...prev,
      message: payload.message,
      isSpoiler: payload.isSpoiler,
      isEdited: true,
    };

    if (isParent) parent = optimistic;
    else replies = patchCommentInTree(replies, comment.id, optimistic);

    try {
      await window.anixApi.comments.release.edit(comment.id, {
        message: payload.message,
        isSpoiler: payload.isSpoiler,
      });
    } catch {
      if (isParent) parent = prev;
      else replies = patchCommentInTree(replies, comment.id, prev);
    }
  }

  async function handleDelete(comment: CommentData) {
    if (!window.anixApi?.comments?.release?.delete) return;

    const isParent = comment.id === parent?.id;
    const prev = isParent ? parent : replies.find((c) => c.id === comment.id);
    if (!prev) return;

    const optimistic: CommentData = {
      ...prev,
      isDeleted: true,
      message: '',
    };

    if (isParent) parent = optimistic;
    else replies = patchCommentInTree(replies, comment.id, optimistic);

    try {
      await window.anixApi.comments.release.delete(comment.id);
    } catch {
      if (isParent) parent = prev;
      else replies = patchCommentInTree(replies, comment.id, prev);
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

  const composerReplyLogin = $derived(replyTarget?.profile.login ?? null);

  $effect(() => {
    hasMore;
    loadingMore;
    replies.length;
    const root = scrollRootEl;
    if (!hasMore || loadingMore || !root) return;

    queueMicrotask(() => {
      if (!hasMore || loadingMore) return;
      if (root.scrollHeight <= root.clientHeight + 80) {
        loadMore();
      }
    });
  });
</script>

<div class="view anix-comments-page anix-comments-replies-page">
  <div class="anix-comments anix-comments--dock-layout">
    <div class="anix-comments__scroll-body" bind:this={scrollRootEl}>
      <CommentsPageHeader
        title="Ответы"
        subtitle={releaseTitle}
        backLabel="Назад"
        onBack={goBack}
        onSubtitleClick={() => navigate(`/release/${releaseId}`)}
        showToolbar={loadState === 'ready'}
        {totalCount}
        {sort}
        onSortChange={handleSortChange}
      />

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
              canManage={!!window.anixApi?.comments?.release}
              showRepliesToggle={false}
              isMine={selfProfileId != null && parent.profile.id === selfProfileId}
              onReply={() => handleReply(parent!)}
              onVote={(c) => handleVote(c)}
              onEdit={handleEdit}
              onDelete={handleDelete}
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
            onReply={handleReply}
            onVote={handleVote}
            onNavigateReplies={handleNavigateReplies}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        {/if}

        <CommentsLoadSentinel
          {hasMore}
          loading={loadingMore}
          onLoad={loadMore}
          scrollRoot={scrollRootEl}
        />
      {/if}
    </div>

    {#if loadState !== 'error'}
      <div class="anix-comments__dock" id="replies-composer">
        <CommentComposer
          busy={submitting}
          replyToLogin={composerReplyLogin}
          onCancelReply={() => { replyTarget = null; }}
          onSubmit={handleSubmit}
        />
      </div>
    {/if}
  </div>
</div>
