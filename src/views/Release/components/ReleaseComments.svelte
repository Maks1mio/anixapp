<script lang="ts">
  import { CommentsSection } from '../../../components/comments';
  import { navigate } from '../../../stores/navigation';
  import { normalizeComment } from '../../../utils/comment';
  import type { CommentData } from '../../../types/comment';

  interface Props {
    releaseId: number;
    comments: Record<string, unknown>[];
    totalCount?: number;
  }

  let { releaseId, comments, totalCount }: Props = $props();

  let selfProfileId = $state<number | null>(null);
  let loadedItems = $state<CommentData[]>([]);
  let loading = $state(false);

  $effect(() => {
    releaseId;
    const preview = comments.map((raw) => normalizeComment(raw));

    if (preview.length > 0) {
      loadedItems = preview;
      return;
    }

    const count = totalCount ?? 0;
    if (!count || !window.anixApi?.comments?.release) {
      loadedItems = [];
      return;
    }

    let cancelled = false;
    loading = true;

    void window.anixApi.comments.release
      .list(releaseId, 0, 0)
      .then((data) => {
        if (cancelled) return;
        loadedItems = (data.content ?? []).map((raw) => normalizeComment(raw));
      })
      .catch(() => {
        if (!cancelled) loadedItems = [];
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });

    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    releaseId;
    void window.anixApi?.profile?.self?.().then((data: { profile?: { id?: number } }) => {
      selfProfileId = data?.profile?.id ?? null;
    });
  });
</script>

{#if loading && loadedItems.length === 0}
  <section class="anix-comments release-page__section" id="comments">
    <header class="anix-comments__header">
      <div class="anix-comments__heading">
        <h2 class="anix-comments__title">
          Комментарии{totalCount ? ` (${totalCount})` : ''}
        </h2>
        <p class="anix-comments__subtitle">Популярные и актуальные</p>
      </div>
      <button
        type="button"
        class="anix-comments__show-all"
        onclick={() => navigate(`/release/${releaseId}/comments`)}
      >
        Показать всё
      </button>
    </header>
    <div class="anix-comments__empty">Загрузка…</div>
  </section>
{:else}
  <CommentsSection
    items={loadedItems}
    totalCount={totalCount ?? loadedItems.length}
    {releaseId}
    {selfProfileId}
    showComposer={true}
    showAllHref={`/release/${releaseId}/comments`}
  />
{/if}
