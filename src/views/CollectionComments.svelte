<script lang="ts">
  import { onMount } from 'svelte';
    import { navigate } from '../stores/navigation';
  import { CommentsSection } from '../components/comments';
  import CommentsPageHeader from '../components/comments/CommentsPageHeader.svelte';
  import { normalizeCommentsFromResponse } from '../utils/comment';
  import type { CommentData, CommentSort } from '../types/comment';
  import { COMMENT_SORT_DEFAULT } from '../types/comment';
  import { setDiscordContext, refreshDiscordPresence } from '../services/discord-presence';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';

  interface Props {
    collectionId: number;
  }

  let { collectionId }: Props = $props();

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
  let collectionTitle = $state('');

  async function loadPage(nextPage: number, append = false) {
    if (!window.anixApi?.comments?.collection) {
      loadState = 'error';
      errorMsg = 'API недоступен';
      return;
    }

    if (append) loadingMore = true;
    else if (nextPage === 0 && loadState !== 'error') loadState = 'loading';

    try {
      const data = await window.anixApi.comments.collection.list(collectionId, nextPage, sort) as {
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
        errorMsg = headlineFromLoadError(err);
      }
    } finally {
      loadingMore = false;
    }
  }

  onMount(() => {
    void window.anixApi?.profile?.self?.().then((data: { profile?: { id?: number } }) => {
      selfProfileId = data?.profile?.id ?? null;
    });

    void window.anixApi?.collection?.info(collectionId).then((data: { collection?: { title?: string } }) => {
      collectionTitle = data?.collection?.title || '';
      if (collectionTitle) {
        setDiscordContext({ collectionTitle });
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

  function goToCollection() {
    navigate(`/collection/${collectionId}`);
  }
</script>

{#snippet pageHeader()}
  <CommentsPageHeader
    title="Комментарии"
    subtitle={collectionTitle}
    backLabel="К коллекции"
    onBack={goToCollection}
    onSubtitleClick={goToCollection}
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
        <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void loadPage(0)} />
      </div>
    </div>
  {:else}
    <CommentsSection
      title=""
      subtitle=""
      {items}
      totalCount={totalCount}
      {collectionId}
      mode="full"
      showComposer={true}
      composerDock={true}
      asSection={false}
      {selfProfileId}
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
