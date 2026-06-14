<script lang="ts">
  import { onMount } from 'svelte';
  import { getSearchParams } from '../router';
  import { CommentsSection } from '../components/comments';
  import CommentsToolbar from '../components/comments/CommentsToolbar.svelte';
  import { normalizeComment } from '../utils/comment';
  import type { CommentData, CommentSort } from '../types/comment';
  import { COMMENT_SORT_DEFAULT } from '../types/comment';

  interface Props {
    releaseId: number;
  }

  let { releaseId }: Props = $props();

  type LoadState = 'loading' | 'ready' | 'error';

  let loadState = $state<LoadState>('loading');
  let errorMsg = $state('');
  let items = $state<CommentData[]>([]);
  let totalCount = $state(0);
  let page = $state(0);
  let hasMore = $state(false);
  let loadingMore = $state(false);
  let sort = $state<CommentSort>(COMMENT_SORT_DEFAULT);
  let selfProfileId = $state<number | null>(null);
  let releaseTitle = $state('');

  async function loadPage(nextPage: number, append = false) {
    if (!window.anixApi?.comments?.release) {
      loadState = 'error';
      errorMsg = 'API недоступен';
      return;
    }

    if (append) loadingMore = true;
    else if (nextPage === 0) loadState = 'loading';

    try {
      const data = await window.anixApi.comments.release.list(releaseId, nextPage, sort) as {
        content?: Record<string, unknown>[];
        total_count?: number;
        total_elements?: number;
        last?: boolean;
      };

      const chunk = (data.content ?? []).map((raw) => normalizeComment(raw));
      items = append ? [...items, ...chunk] : chunk;
      totalCount = data.total_count ?? data.total_elements ?? items.length;
      hasMore = data.last === false || chunk.length > 0 && items.length < totalCount;
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

  onMount(() => {
    void window.anixApi?.profile?.self?.().then((data: { profile?: { id?: number } }) => {
      selfProfileId = data?.profile?.id ?? null;
    });

    void window.anixApi?.release?.info(releaseId, false).then((data: { release?: { title_ru?: string; title_original?: string } }) => {
      const r = data.release;
      releaseTitle = r?.title_ru || r?.title_original || '';
    });

    void loadPage(0);

    const reply = getSearchParams().get('reply');
    if (reply) {
      queueMicrotask(() => {
        document.getElementById('comments-composer')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  });

  function handleSortChange(next: CommentSort) {
    sort = next;
    void loadPage(0);
  }

  function loadMore() {
    if (!hasMore || loadingMore) return;
    void loadPage(page + 1, true);
  }
</script>

<div class="view anix-comments-page">
  <div class="view-header anix-comments-page__header">
    <div class="anix-comments-page__header-text">
      <h1 class="view-header__title">Комментарии</h1>
      {#if releaseTitle}
        <p class="view-header__subtitle">{releaseTitle}</p>
      {/if}
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

  {#if loadState === 'loading' && items.length === 0}
    <div class="anix-comments__empty">Загрузка…</div>
  {:else if loadState === 'error'}
    <div class="anix-comments__empty">{errorMsg}</div>
  {:else}
    <CommentsSection
      title=""
      subtitle=""
      {items}
      totalCount={totalCount}
      {releaseId}
      mode="full"
      showComposer={true}
      asSection={false}
      {selfProfileId}
      onItemsChange={(next) => { items = next; }}
      onCommentAdded={() => { totalCount += 1; }}
    />

    <div id="comments-composer"></div>

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
  {/if}
</div>
