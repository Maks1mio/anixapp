<script lang="ts">
  import { onMount } from 'svelte';
  import UiV2CommentComposer, {
    type UiV2CommentComposerPayload,
  } from '../uikit-v2/UiV2CommentComposer.svelte';
  import UiV2CommentThread, {
    type UiV2CommentNode,
  } from '../uikit-v2/UiV2CommentThread.svelte';
  import { requireAuth } from '../../stores/auth';
  import { handleUserProfileClick } from '../../stores/user-profile';
  import {
    buildReleaseCommentAddBody,
    normalizeComment,
    normalizeCommentsFromResponse,
  } from '../../utils/comment';
  import { commentDataToUiV2Node } from '../../utils/comment-v2';
  import { formatCommentsCountShort } from '../../utils/feed-top-comment';
  import { resolveJacksonRefs } from '../../utils/jackson-refs';

  type Props = {
    articleId: number;
    totalCount?: number;
    focusComposer?: boolean;
    onCountChange?: (count: number) => void;
    onClose?: () => void;
  };

  let {
    articleId,
    totalCount = 0,
    focusComposer = false,
    onCountChange,
    onClose,
  }: Props = $props();

  let nodes = $state<UiV2CommentNode[]>([]);
  let loading = $state(true);
  let submitting = $state(false);
  let selfProfileId = $state<number | null>(null);
  let knownTotal = $state(0);
  let rootEl = $state<HTMLElement | null>(null);

  $effect(() => {
    knownTotal = Math.max(0, Number(totalCount) || 0);
  });

  async function loadComments() {
    loading = true;
    try {
      const api = window.anixApi?.article;
      const res = api?.comments
        ? await api.comments(articleId, 0, 2)
        : await api?.commentsPopular?.(articleId);
      const list = normalizeCommentsFromResponse(
        (res ?? {}) as Record<string, unknown>,
      );
      nodes = list.map((c) => commentDataToUiV2Node(c));
      const apiTotal = Number(
        (res as { total_count?: number } | undefined)?.total_count,
      );
      if (Number.isFinite(apiTotal) && apiTotal > 0) {
        knownTotal = apiTotal;
        onCountChange?.(apiTotal);
      } else if (list.length > knownTotal) {
        knownTotal = list.length;
        onCountChange?.(list.length);
      }
    } catch {
      nodes = [];
    } finally {
      loading = false;
    }
  }

  async function submitTop(payload: UiV2CommentComposerPayload) {
    if (!requireAuth() || !window.anixApi?.article?.commentAdd) return;
    submitting = true;
    try {
      const res = (await window.anixApi.article.commentAdd(
        articleId,
        buildReleaseCommentAddBody(payload),
      )) as { code?: number; comment?: Record<string, unknown> };
      if (res.code != null && res.code !== 0) return;
      if (res.comment) {
        const resolved = resolveJacksonRefs(res) as Record<string, unknown>;
        const raw = (resolved.comment ?? res.comment) as Record<string, unknown>;
        const added = commentDataToUiV2Node(normalizeComment(raw, resolved));
        nodes = [added, ...nodes];
        knownTotal += 1;
        onCountChange?.(knownTotal);
      } else {
        await loadComments();
        knownTotal += 1;
        onCountChange?.(knownTotal);
      }
    } catch {
      /* ignore */
    } finally {
      submitting = false;
    }
  }

  function openAuthor(node: UiV2CommentNode) {
    const id = Number(node.profile.id);
    if (id > 0) handleUserProfileClick(id);
  }

  onMount(() => {
    void loadComments();
    void window.anixApi?.profile?.self?.().then((data: { profile?: { id?: number } }) => {
      selfProfileId = data?.profile?.id ?? null;
    });
    if (focusComposer) {
      queueMicrotask(() => {
        rootEl
          ?.querySelector<HTMLTextAreaElement>(
            '#feed-article-comments-composer textarea, #feed-article-comments-composer [id^="uiv2-composer-"]',
          )
          ?.focus();
      });
    }
  });
</script>

<section
  class="feed-article-comments"
  bind:this={rootEl}
  id="feed-article-comments-{articleId}"
  aria-label="Комментарии"
>
  <header class="feed-article-comments__head">
    <div class="feed-article-comments__heading">
      <h3 class="feed-article-comments__title">Комментарии</h3>
      {#if knownTotal > 0}
        <span class="feed-article-comments__count">{formatCommentsCountShort(knownTotal)}</span>
      {/if}
    </div>
    {#if onClose}
      <button type="button" class="feed-article-comments__close" onclick={onClose}>
        Свернуть
      </button>
    {/if}
  </header>

  <div class="feed-article-comments__composer" id="feed-article-comments-composer">
    <UiV2CommentComposer
      busy={submitting}
      requireLogin={true}
      autofocus={focusComposer}
      fieldLabel="Введите текст комментария"
      onSubmit={submitTop}
    />
  </div>

  {#if loading}
    <p class="feed-article-comments__empty">Загрузка…</p>
  {:else if nodes.length === 0}
    <p class="feed-article-comments__empty">Комментариев пока нет</p>
  {:else}
    <UiV2CommentThread
      {nodes}
      {selfProfileId}
      enableInlineReply={false}
      onAuthorClick={openAuthor}
    />
  {/if}
</section>
