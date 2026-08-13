<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { requireAuth } from '../stores/auth';
  import { handleUserProfileClick } from '../stores/user-profile';
  import UiV2CommentThread, {
    type UiV2CommentNode,
  } from '../components/uikit-v2/UiV2CommentThread.svelte';
  import UiV2CommentComposer, {
    type UiV2CommentComposerPayload,
  } from '../components/uikit-v2/UiV2CommentComposer.svelte';
  import CommentsLoadSentinel from '../components/comments/CommentsLoadSentinel.svelte';
  import CommentsPageHeader from '../components/comments/CommentsPageHeader.svelte';
  import {
    normalizeComment,
    normalizeCommentsFromResponse,
    buildReleaseCommentAddBody,
  } from '../utils/comment';
  import { resolveJacksonRefs } from '../utils/jackson-refs';
  import {
    appendUiV2CommentReply,
    commentDataToUiV2Node,
    patchUiV2CommentNode,
    setUiV2CommentReplies,
    uiV2NodeToCommentData,
  } from '../utils/comment-v2';
  import type { CommentSort } from '../types/comment';
  import { COMMENT_REPLIES_SORT_DEFAULT } from '../types/comment';

  interface Props {
    releaseId: number;
    commentId: number;
  }

  let { releaseId, commentId }: Props = $props();

  type LoadState = 'loading' | 'ready' | 'error';

  let loadState = $state<LoadState>('loading');
  let errorMsg = $state('');
  let parent = $state<UiV2CommentNode | null>(null);
  let replyNodes = $state<UiV2CommentNode[]>([]);
  let totalCount = $state(0);
  let page = $state(0);
  let hasMore = $state(false);
  let loadingMore = $state(false);
  let sort = $state<CommentSort>(COMMENT_REPLIES_SORT_DEFAULT);
  let selfProfileId = $state<number | null>(null);
  let submitting = $state(false);
  let dockReplyLogin = $state<string | null>(null);
  let dockReplyParent = $state<UiV2CommentNode | null>(null);
  let scrollRootEl = $state<HTMLElement | null>(null);
  let releaseTitle = $state('');

  async function loadParent() {
    if (!window.anixApi?.comments?.release) return;
    try {
      const data = (await window.anixApi.comments.release.get(commentId)) as Record<string, unknown>;
      const resolved = resolveJacksonRefs(data) as Record<string, unknown>;
      parent = commentDataToUiV2Node(normalizeComment(resolved, resolved));
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
      const data = (await window.anixApi.comments.release.replies(commentId, nextPage, sort)) as {
        content?: Record<string, unknown>[];
        total_count?: number;
        total_elements?: number;
        last?: boolean;
      };

      const chunk = normalizeCommentsFromResponse(data as Record<string, unknown>).map((c) =>
        commentDataToUiV2Node(c),
      );
      replyNodes = append ? [...replyNodes, ...chunk] : chunk;
      totalCount =
        (typeof parent?.replyCount === 'number' ? parent.replyCount : 0) ||
        data.total_count ||
        data.total_elements ||
        chunk.length;
      hasMore = data.last === false || (chunk.length > 0 && replyNodes.length < totalCount);
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
    void window.anixApi?.release?.info(releaseId, false).then(
      (data: { release?: { title_ru?: string; title_original?: string } }) => {
        const r = data.release;
        releaseTitle = r?.title_ru || r?.title_original || '';
      },
    );
    void reloadAll();
  });

  function handleSortChange(next: CommentSort) {
    sort = next;
    void loadReplies(0);
  }

  function findInReplies(id: number | string): UiV2CommentNode | null {
    for (const n of replyNodes) {
      if (n.id === id) return n;
      if (n.replies?.length) {
        const nested = findInRepliesDeep(n.replies, id);
        if (nested) return nested;
      }
    }
    return null;
  }

  function findInRepliesDeep(list: UiV2CommentNode[], id: number | string): UiV2CommentNode | null {
    for (const n of list) {
      if (n.id === id) return n;
      if (n.replies?.length) {
        const found = findInRepliesDeep(n.replies, id);
        if (found) return found;
      }
    }
    return null;
  }

  function handleVote(updated: UiV2CommentNode) {
    if (!requireAuth()) return;
    const isParent = parent?.id === updated.id;
    const prev = isParent ? parent : findInReplies(updated.id);
    if (!prev) return;

    if (isParent) {
      parent = { ...parent!, userVote: updated.userVote, voteCount: updated.voteCount };
    } else {
      replyNodes = patchUiV2CommentNode(replyNodes, updated.id, {
        userVote: updated.userVote,
        voteCount: updated.voteCount,
      });
    }

    if (!window.anixApi?.comments?.release) return;
    const id = typeof updated.id === 'number' ? updated.id : Number(updated.id);
    window.anixApi.comments.release.vote(id, updated.userVote ?? 0).catch(() => {
      if (isParent) {
        parent = prev;
      } else {
        replyNodes = patchUiV2CommentNode(replyNodes, updated.id, {
          userVote: prev.userVote,
          voteCount: prev.voteCount,
        });
      }
    });
  }

  function focusComposer() {
    queueMicrotask(() => {
      document
        .querySelector<HTMLTextAreaElement>('#replies-composer textarea, #replies-composer [id^="uiv2-composer-"]')
        ?.focus();
    });
  }

  function handleReply(node: UiV2CommentNode) {
    if (!requireAuth()) return;
    dockReplyParent = node;
    dockReplyLogin = node.profile.login;
    focusComposer();
  }

  async function loadNestedReplies(node: UiV2CommentNode) {
    const id = typeof node.id === 'number' ? node.id : Number(node.id);
    if (!Number.isFinite(id) || !window.anixApi?.comments?.release?.replies) return;
    try {
      const data = await window.anixApi.comments.release.replies(id, 0, 2);
      const list = normalizeCommentsFromResponse(data as Record<string, unknown>).map((c) =>
        commentDataToUiV2Node(c),
      );
      replyNodes = setUiV2CommentReplies(replyNodes, node.id, list);
    } catch {
      /* ignore */
    }
  }

  async function handleSubmit(payload: UiV2CommentComposerPayload) {
    if (!window.anixApi?.comments?.release) return;
    submitting = true;
    try {
      const replyTarget = dockReplyParent ? uiV2NodeToCommentData(dockReplyParent) : null;
      const res = (await window.anixApi.comments.release.add(
        releaseId,
        buildReleaseCommentAddBody(payload, {
          replyTarget,
          threadRootCommentId: commentId,
        }),
      )) as { comment?: Record<string, unknown>; code?: number };

      if (res.code != null && res.code !== 0) throw new Error(String(res.code));

      if (res.comment) {
        const resolvedAdd = resolveJacksonRefs(res) as Record<string, unknown>;
        const commentRaw = (resolvedAdd.comment ?? res.comment) as Record<string, unknown>;
        const added = commentDataToUiV2Node(normalizeComment(commentRaw, resolvedAdd));
        if (dockReplyParent && dockReplyParent.id !== parent?.id) {
          replyNodes = appendUiV2CommentReply(replyNodes, dockReplyParent.id, added);
        } else {
          replyNodes = [added, ...replyNodes];
        }
        totalCount += 1;
        if (parent) {
          parent = { ...parent, replyCount: (parent.replyCount ?? 0) + 1 };
        }
        dockReplyParent = null;
        dockReplyLogin = null;
      }
    } catch {
      /* ignore */
    } finally {
      submitting = false;
    }
  }

  async function handleEdit(node: UiV2CommentNode, payload: UiV2CommentComposerPayload) {
    if (!window.anixApi?.comments?.release?.edit) return;
    const isParent = parent?.id === node.id;
    const prev = isParent ? parent : findInReplies(node.id);
    if (!prev) return;
    const id = typeof node.id === 'number' ? node.id : Number(node.id);

    const optimistic = { message: payload.message, isSpoiler: payload.isSpoiler, isEdited: true as const };
    if (isParent) parent = { ...parent!, ...optimistic };
    else replyNodes = patchUiV2CommentNode(replyNodes, node.id, optimistic);

    try {
      await window.anixApi.comments.release.edit(id, {
        message: payload.message,
        isSpoiler: payload.isSpoiler,
      });
    } catch {
      if (isParent) parent = prev;
      else {
        replyNodes = patchUiV2CommentNode(replyNodes, node.id, {
          message: prev.message,
          isSpoiler: prev.isSpoiler,
          isEdited: prev.isEdited,
        });
      }
    }
  }

  async function handleDelete(node: UiV2CommentNode) {
    if (!window.anixApi?.comments?.release?.delete) return;
    const isParent = parent?.id === node.id;
    const prev = isParent ? parent : findInReplies(node.id);
    if (!prev) return;
    const id = typeof node.id === 'number' ? node.id : Number(node.id);

    if (isParent) parent = { ...parent!, isDeleted: true, message: '' };
    else replyNodes = patchUiV2CommentNode(replyNodes, node.id, { isDeleted: true, message: '' });

    try {
      await window.anixApi.comments.release.delete(id);
    } catch {
      if (isParent) parent = prev;
      else {
        replyNodes = patchUiV2CommentNode(replyNodes, node.id, {
          isDeleted: prev.isDeleted,
          message: prev.message,
        });
      }
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

  function openAuthor(node: UiV2CommentNode, e?: MouseEvent) {
    if (node.profile.id) handleUserProfileClick(node.profile.id, e);
  }

  $effect(() => {
    hasMore;
    loadingMore;
    replyNodes.length;
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
            <UiV2CommentThread
              nodes={[parent]}
              {selfProfileId}
              enableInlineReply={false}
              onVote={handleVote}
              onReply={handleReply}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAuthorClick={openAuthor}
            />
          </div>
        {/if}

        {#if loadState === 'loading'}
          <div class="anix-comments__empty">Загрузка…</div>
        {:else if replyNodes.length === 0}
          <div class="anix-comments__empty">Ответов пока нет</div>
        {:else}
          <UiV2CommentThread
            nodes={replyNodes}
            {selfProfileId}
            enableInlineReply={false}
            onVote={handleVote}
            onReply={handleReply}
            onLoadReplies={loadNestedReplies}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAuthorClick={openAuthor}
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
      <div class="anix-comments__dock uiv2-comments-composer" id="replies-composer">
        <UiV2CommentComposer
          busy={submitting}
          replyToLogin={dockReplyLogin}
          requireLogin={true}
          onCancelReply={() => {
            dockReplyParent = null;
            dockReplyLogin = null;
          }}
          onSubmit={handleSubmit}
        />
      </div>
    {/if}
  </div>
</div>
