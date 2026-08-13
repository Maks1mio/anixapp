<script lang="ts">
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';
  import { navigate } from '../../stores/navigation';
  import { requireAuth } from '../../stores/auth';
  import { handleUserProfileClick } from '../../stores/user-profile';
  import UiV2SectionHeader from '../uikit-v2/UiV2SectionHeader.svelte';
  import UiV2CommentThread, {
    type UiV2CommentNode,
  } from '../uikit-v2/UiV2CommentThread.svelte';
  import UiV2CommentComposer, {
    type UiV2CommentComposerPayload,
  } from '../uikit-v2/UiV2CommentComposer.svelte';
  import CommentsLoadSentinel from './CommentsLoadSentinel.svelte';
  import type { CommentData } from '../../types/comment';
  import { normalizeComment, normalizeCommentsFromResponse, buildReleaseCommentAddBody } from '../../utils/comment';
  import { resolveJacksonRefs } from '../../utils/jackson-refs';
  import {
    appendUiV2CommentReply,
    commentDataToUiV2Node,
    patchUiV2CommentNode,
    setUiV2CommentReplies,
    uiV2NodeToCommentData,
    uiV2NodesToCommentDataList,
  } from '../../utils/comment-v2';

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

  let nodes = $state<UiV2CommentNode[]>([]);
  let submitting = $state(false);
  let initialReplyApplied = $state(false);
  let scrollRootEl = $state<HTMLElement | null>(null);
  let dockReplyLogin = $state<string | null>(null);
  let dockReplyParent = $state<UiV2CommentNode | null>(null);

  $effect(() => {
    const next = items.map((c) => commentDataToUiV2Node(c));
    const prevNodes = untrack(() => nodes);
    nodes = next.map((n) => {
      const prev = prevNodes.find((p) => p.id === n.id);
      if (prev?.replies?.length) {
        return {
          ...n,
          replies: prev.replies,
          replyCount: Math.max(n.replyCount ?? 0, prev.replies.length),
        };
      }
      return n;
    });
  });

  const isPreview = $derived(mode === 'preview');
  const visibleNodes = $derived(isPreview ? nodes.slice(0, previewLimit) : nodes);
  const showHeaderLink = $derived(isPreview && !!showAllHref);
  const showHeader = $derived(Boolean(title) || Boolean(subtitle) || showHeaderLink);
  const useInlineComposer = $derived(showComposer && !!releaseId && !composerDock);
  const useInlineReply = $derived(!composerDock);

  $effect(() => {
    if (initialReplyApplied || !initialReplyId || nodes.length === 0) return;
    const target = nodes.find((c) => c.id === initialReplyId);
    if (!target) return;
    initialReplyApplied = true;
    if (composerDock) {
      dockReplyParent = target;
      dockReplyLogin = target.profile.login;
      focusComposer();
    }
  });

  function syncItems(next: UiV2CommentNode[]) {
    nodes = next;
    onItemsChange?.(uiV2NodesToCommentDataList(next));
  }

  function focusComposer() {
    queueMicrotask(() => {
      document
        .querySelector<HTMLTextAreaElement>('#comments-composer textarea, #comments-composer [id^="uiv2-composer-"]')
        ?.focus();
    });
  }

  function handleVote(updated: UiV2CommentNode) {
    if (!requireAuth()) return;
    const prev = findNode(nodes, updated.id);
    syncItems(
      patchUiV2CommentNode(nodes, updated.id, {
        userVote: updated.userVote,
        voteCount: updated.voteCount,
      }),
    );
    if (!window.anixApi?.comments?.release || !prev) return;
    const id = typeof updated.id === 'number' ? updated.id : Number(updated.id);
    window.anixApi.comments.release.vote(id, updated.userVote ?? 0).catch(() => {
      syncItems(
        patchUiV2CommentNode(nodes, updated.id, {
          userVote: prev.userVote,
          voteCount: prev.voteCount,
        }),
      );
    });
  }

  function findNode(list: UiV2CommentNode[], id: number | string): UiV2CommentNode | null {
    for (const n of list) {
      if (n.id === id) return n;
      if (n.replies?.length) {
        const found = findNode(n.replies, id);
        if (found) return found;
      }
    }
    return null;
  }

  function handleReply(node: UiV2CommentNode) {
    if (!requireAuth()) return;
    if (composerDock) {
      dockReplyParent = node;
      dockReplyLogin = node.profile.login;
      focusComposer();
    }
  }

  async function loadReplies(node: UiV2CommentNode) {
    const commentId = typeof node.id === 'number' ? node.id : Number(node.id);
    if (!Number.isFinite(commentId) || !window.anixApi?.comments?.release?.replies) return;
    try {
      const data = await window.anixApi.comments.release.replies(commentId, 0, 2);
      const list = normalizeCommentsFromResponse(data as Record<string, unknown>);
      const replies = list.map((c) => commentDataToUiV2Node(c));
      syncItems(setUiV2CommentReplies(nodes, node.id, replies));
    } catch {
      /* ignore */
    }
  }

  async function submitNew(payload: UiV2CommentComposerPayload, parent: UiV2CommentNode | null = null) {
    if (!releaseId || !window.anixApi?.comments?.release) return;
    submitting = true;
    try {
      const replyTarget = parent ? uiV2NodeToCommentData(parent) : null;
      const res = (await window.anixApi.comments.release.add(
        releaseId,
        buildReleaseCommentAddBody(payload, { replyTarget }),
      )) as { comment?: Record<string, unknown>; code?: number };

      if (res.code != null && res.code !== 0) throw new Error(String(res.code));

      if (res.comment) {
        const resolved = resolveJacksonRefs(res) as Record<string, unknown>;
        const commentRaw = (resolved.comment ?? res.comment) as Record<string, unknown>;
        const added = commentDataToUiV2Node(normalizeComment(commentRaw, resolved));
        if (parent) {
          syncItems(appendUiV2CommentReply(nodes, parent.id, added));
        } else {
          syncItems([added, ...nodes]);
        }
        onCommentAdded?.(uiV2NodeToCommentData(added));
        dockReplyParent = null;
        dockReplyLogin = null;
      }
    } catch {
      /* ignore */
    } finally {
      submitting = false;
    }
  }

  async function handleSubmitReply(node: UiV2CommentNode, payload: UiV2CommentComposerPayload) {
    await submitNew(payload, node);
  }

  async function handleSubmitTop(payload: UiV2CommentComposerPayload) {
    await submitNew(payload, composerDock ? dockReplyParent : null);
  }

  async function handleEdit(node: UiV2CommentNode, payload: UiV2CommentComposerPayload) {
    if (!window.anixApi?.comments?.release?.edit) return;
    const prev = findNode(nodes, node.id);
    if (!prev) return;
    const id = typeof node.id === 'number' ? node.id : Number(node.id);

    syncItems(
      patchUiV2CommentNode(nodes, node.id, {
        message: payload.message,
        isSpoiler: payload.isSpoiler,
        isEdited: true,
      }),
    );

    try {
      await window.anixApi.comments.release.edit(id, {
        message: payload.message,
        isSpoiler: payload.isSpoiler,
      });
    } catch {
      syncItems(
        patchUiV2CommentNode(nodes, node.id, {
          message: prev.message,
          isSpoiler: prev.isSpoiler,
          isEdited: prev.isEdited,
        }),
      );
    }
  }

  async function handleDelete(node: UiV2CommentNode) {
    if (!window.anixApi?.comments?.release?.delete) return;
    const prev = findNode(nodes, node.id);
    if (!prev) return;
    const id = typeof node.id === 'number' ? node.id : Number(node.id);

    syncItems(
      patchUiV2CommentNode(nodes, node.id, {
        isDeleted: true,
        message: '',
      }),
    );

    try {
      await window.anixApi.comments.release.delete(id);
    } catch {
      syncItems(
        patchUiV2CommentNode(nodes, node.id, {
          isDeleted: prev.isDeleted,
          message: prev.message,
        }),
      );
    }
  }

  function openAuthor(node: UiV2CommentNode, e?: MouseEvent) {
    if (node.profile.id) handleUserProfileClick(node.profile.id, e);
  }

  function openAll() {
    if (showAllHref) navigate(showAllHref);
  }

  $effect(() => {
    loadMore?.hasMore;
    loadMore?.loading;
    visibleNodes.length;
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
    <UiV2SectionHeader
      title={title || (totalCount ? `Комментарии (${totalCount})` : 'Комментарии')}
      {subtitle}
      moreLabel="Показать всё"
      onShowAll={showHeaderLink ? openAll : undefined}
    />
  {/if}

  {#if useInlineComposer}
    <div class="anix-comments__composer uiv2-comments-composer" id="comments-composer">
      <UiV2CommentComposer busy={submitting} requireLogin={true} onSubmit={handleSubmitTop} />
    </div>
  {/if}

  {#if visibleNodes.length === 0}
    <div class="anix-comments__empty">Комментариев пока нет</div>
  {:else}
    <UiV2CommentThread
      nodes={visibleNodes}
      {selfProfileId}
      enableInlineReply={useInlineReply}
      onVote={handleVote}
      onReply={handleReply}
      onLoadReplies={loadReplies}
      onSubmitReply={handleSubmitReply}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onAuthorClick={openAuthor}
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
      <div class="anix-comments__dock uiv2-comments-composer" id="comments-composer">
        <UiV2CommentComposer
          busy={submitting}
          replyToLogin={dockReplyLogin}
          requireLogin={true}
          onCancelReply={() => {
            dockReplyParent = null;
            dockReplyLogin = null;
          }}
          onSubmit={handleSubmitTop}
        />
      </div>
    {/if}
  </section>
{:else}
  <section class="anix-comments" id="comments" class:anix-comments--section={asSection}>
    {@render commentsBody()}
  </section>
{/if}
