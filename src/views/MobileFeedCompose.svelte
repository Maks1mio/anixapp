<script lang="ts">
  /**
   * Мобильная страница написания записи (маршрут /feed/write).
   * Как в Anixart для Android: отдельный экран со своей шапкой, а не окно поверх ленты.
   */
  import { onMount } from 'svelte';
  import FeedArticleComposer, {
    type FeedComposerChannel,
  } from '../components/feed/FeedArticleComposer.svelte';
  import { showToast } from '../stores/toast';
  import { navigate, replacePath } from '../stores/navigation';
  import type { FeedArticle } from '../types/feed';
  import { getFeedDraft, type FeedArticleDraft } from '../utils/feed-article-drafts';
  import { getMobileComposerPayload } from '../utils/feed-composer-open';

  const payload = getMobileComposerPayload() ?? {};
  const isSuggestion = !!payload.isSuggestion;
  const editArticle: FeedArticle | null = !isSuggestion && payload.editArticle && Number(payload.editArticle.id) > 0
    ? payload.editArticle
    : null;
  const draftId = !editArticle && typeof payload.draftId === 'string' && payload.draftId ? payload.draftId : null;
  const draft: FeedArticleDraft | null = draftId ? getFeedDraft(draftId) : null;
  const repostArticle: FeedArticle | null = !isSuggestion && !editArticle
    ? (payload.repostArticle && Number(payload.repostArticle.id) > 0
      ? payload.repostArticle
      : (draft?.repostArticle ?? null))
    : null;

  function normalizeChannels(raw: unknown): FeedComposerChannel[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((c): c is FeedComposerChannel => !!c && Number(c.id) > 0);
  }

  let channels = $state<FeedComposerChannel[]>(normalizeChannels(payload.channels));
  let channelId = $state<number | null>(
    Number(payload.channelId) > 0
      ? Number(payload.channelId)
      : (draft?.channelId ?? (Number(editArticle?.channel?.id ?? 0) || null)),
  );
  let ready = $state(isSuggestion || normalizeChannels(payload.channels).length > 0);
  let createBusy = $state(false);

  async function loadChannels(): Promise<void> {
    if (isSuggestion) return;
    try {
      const res = await window.anixApi?.channel?.editorAll?.();
      const list = normalizeChannels(res?.channels);
      if (list.length) channels = list;
    } catch {
      /* остаются каналы из payload */
    }
    if (!(channelId && channelId > 0)) channelId = channels[0]?.id ?? null;
  }

  function leave() {
    if (window.history.length > 1) window.history.back();
    else navigate('/feed');
  }

  function onPublished(articleId: number) {
    // Новая запись открывается сразу, как после публикации в Anixart; правка и предложение — назад.
    if (!editArticle && !isSuggestion && articleId > 0) {
      replacePath(`/article/${articleId}`);
      return;
    }
    leave();
  }

  async function onCreateBlog() {
    if (isSuggestion || editArticle) return;
    const api = window.anixApi?.channel?.createBlog;
    if (!api) return;
    createBusy = true;
    try {
      const res = await api();
      const newId = Number(res?.channel?.id ?? 0);
      await loadChannels();
      if (newId > 0) {
        channelId = newId;
        showToast('Блог создан', 'ok');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'err');
    } finally {
      createBusy = false;
    }
  }

  onMount(() => {
    void loadChannels().finally(() => { ready = true; });
  });
</script>

<div class="m-compose">
  {#if ready}
    <FeedArticleComposer
      open={true}
      mode="page"
      {channels}
      initialChannelId={channelId}
      {createBusy}
      {repostArticle}
      {editArticle}
      {draftId}
      initialDraft={draft}
      {isSuggestion}
      onClose={leave}
      onPublished={(id) => onPublished(id)}
      onCreateBlog={() => void onCreateBlog()}
    />
  {:else}
    <div class="m-compose__loading" aria-busy="true">Открываем редактор…</div>
  {/if}
</div>

<style lang="scss">
  .m-compose {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .m-compose__loading {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    color: var(--m-text-2, var(--uiv2-fg-muted));
  }
</style>
