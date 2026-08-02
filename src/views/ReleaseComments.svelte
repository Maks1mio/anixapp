<script lang="ts">
  import { onMount } from 'svelte';
  import { getSearchParams } from '../router';
  import { navigate } from '../stores/navigation';
  import { CommentsSection } from '../components/comments';
  import CommentsPageHeader from '../components/comments/CommentsPageHeader.svelte';
  import { normalizeCommentsFromResponse } from '../utils/comment';
  import type { CommentData, CommentSort } from '../types/comment';
  import { COMMENT_SORT_DEFAULT } from '../types/comment';
  import { setDiscordContext, refreshDiscordPresence } from '../services/discord-presence';

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
  const initialReplyId = $derived.by(() => {
    const reply = getSearchParams().get('reply');
    if (!reply) return null;
    const id = Number(reply);
    return Number.isFinite(id) ? id : null;
  });

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

      const chunk = normalizeCommentsFromResponse(data as Record<string, unknown>);
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

    void window.anixApi?.release?.info(releaseId, false).then((data: { release?: { title_ru?: string; title_original?: string; poster?: unknown; image?: string } }) => {
      const r = data.release;
      releaseTitle = r?.title_ru || r?.title_original || '';
      if (releaseTitle) {
        setDiscordContext({ releaseTitle });
        refreshDiscordPresence();
      }
    });

    void loadPage(0);
  });

  function handleSortChange(next: CommentSort) {
    sort = next;
    void loadPage(0);
  }

  function loadMore() {
    if (!hasMore || loadingMore) return;
    void loadPage(page + 1, true);
  }

  function goToRelease() {
    navigate(`/release/${releaseId}`);
  }
</script>

{#snippet pageHeader()}
  <CommentsPageHeader
    title="Комментарии"
    subtitle={releaseTitle}
    backLabel="К странице тайтла"
    onBack={goToRelease}
    onSubtitleClick={goToRelease}
    showToolbar={loadState === 'ready'}
    {totalCount}
    {sort}
    onSortChange={handleSortChange}
  />
{/snippet}

<div class="view anix-comments-page">
  {#if loadState === 'loading' && items.length === 0}
    <div class="anix-comments--dock-layout anix-comments-page--dock-fallback">
      <div class="anix-comments__scroll-body">
        {@render pageHeader()}
        <div class="anix-comments__empty">Загрузка…</div>
      </div>
    </div>
  {:else if loadState === 'error'}
    <div class="anix-comments--dock-layout anix-comments-page--dock-fallback">
      <div class="anix-comments__scroll-body">
        {@render pageHeader()}
        <div class="anix-comments__empty">{errorMsg}</div>
      </div>
    </div>
  {:else}
    <CommentsSection
      title=""
      subtitle=""
      {items}
      totalCount={totalCount}
      {releaseId}
      mode="full"
      showComposer={true}
      composerDock={true}
      asSection={false}
      {selfProfileId}
      {initialReplyId}
      prepend={pageHeader}
      loadMore={{
        hasMore,
        loading: loadingMore,
        onLoad: loadMore,
      }}
      onItemsChange={(next) => { items = next; }}
      onCommentAdded={() => { totalCount += 1; }}
    />
  {/if}
</div>
