<script lang="ts">
  import { onMount } from 'svelte';
  import FeedArticleComposer, {
    type FeedComposerChannel,
  } from '../components/feed/FeedArticleComposer.svelte';
  import UiV2Tooltip from '../components/uikit-v2/UiV2Tooltip.svelte';
  import { showToast } from '../stores/toast';
  import { isAuthenticated } from '../stores/auth';
  import type { FeedArticle } from '../types/feed';
  import { getFeedDraft, type FeedArticleDraft } from '../utils/feed-article-drafts';

  type ComposerPayload = {
    channelId?: number | null;
    draftId?: string | null;
    repostArticle?: FeedArticle | null;
    channels?: FeedComposerChannel[];
    isSuggestion?: boolean;
  };

  let channels = $state<FeedComposerChannel[]>([]);
  let channelId = $state<number | null>(null);
  let draft = $state<FeedArticleDraft | null>(null);
  let draftId = $state<string | null>(null);
  let repostArticle = $state<FeedArticle | null>(null);
  let isSuggestion = $state(false);
  let ready = $state(false);
  let createBusy = $state(false);

  function normalizeChannels(raw: unknown): FeedComposerChannel[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((c): c is FeedComposerChannel => !!c && Number(c.id) > 0);
  }

  async function loadChannels(): Promise<void> {
    if (isSuggestion) return;
    try {
      const res = await window.anixApi?.channel?.editorAll?.();
      const list = normalizeChannels(res?.channels);
      if (list.length) channels = list;
    } catch {
      /* keep payload channels */
    }
  }

  function applyPayload(payload: ComposerPayload | null | undefined) {
    const next = payload ?? {};
    isSuggestion = !!next.isSuggestion;
    const fromPayload = normalizeChannels(next.channels);
    if (fromPayload.length) channels = fromPayload;
    channelId = Number(next.channelId) > 0 ? Number(next.channelId) : channelId;
    draftId = typeof next.draftId === 'string' && next.draftId ? next.draftId : null;
    repostArticle = !isSuggestion && next.repostArticle && Number(next.repostArticle.id) > 0
      ? next.repostArticle
      : null;
    draft = draftId ? getFeedDraft(draftId) : null;
    if (draft && !(channelId && channelId > 0)) channelId = draft.channelId;
    if (draft?.repostArticle && !repostArticle && !isSuggestion) {
      repostArticle = draft.repostArticle;
    }
    if (!(channelId && channelId > 0)) channelId = channels[0]?.id ?? null;
  }

  async function waitForToken(timeoutMs = 8000): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        const status = await window.anixApi?.auth?.getStatus?.();
        if (status?.hasToken) {
          isAuthenticated.set(true);
          return true;
        }
      } catch {
        /* retry */
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return false;
  }

  async function boot() {
    try {
      const payload = await window.electron?.getComposerPayload?.();
      applyPayload(payload as ComposerPayload | null);
    } catch {
      applyPayload(null);
    }
    ready = true;
    const authed = await waitForToken();
    if (authed) await loadChannels();
    if (!(channelId && channelId > 0)) channelId = channels[0]?.id ?? null;
  }

  function closeWindow() {
    window.electron?.composerReadyToClose?.();
  }

  function onPublished(articleId: number, publishedChannelId: number) {
    window.electron?.composerPublished?.({ articleId, channelId: publishedChannelId });
    closeWindow();
  }

  async function onCreateBlog() {
    if (isSuggestion) return;
    const api = window.anixApi?.channel?.createBlog;
    if (!api) return;
    createBusy = true;
    try {
      await waitForToken(4000);
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
    void boot();
    const onPayload = (e: Event) => {
      applyPayload((e as CustomEvent<ComposerPayload | null>).detail);
    };
    window.addEventListener('anix:composer-payload', onPayload);
    return () => window.removeEventListener('anix:composer-payload', onPayload);
  });
</script>

<div class="composer-win">
  <header class="titlebar composer-win__titlebar">
    <div class="titlebar__drag">
      <span class="titlebar__logo" aria-hidden="true">
        <img src="logo/512x512.png" alt="" class="titlebar__logo-img" />
      </span>
      <span class="titlebar__title">{isSuggestion ? 'Предложение записи' : 'Новая запись'}</span>
    </div>
    <div class="titlebar__space" aria-hidden="true"></div>
    <div class="titlebar__controls">
      <UiV2Tooltip text="Свернуть">
        <button
          type="button"
          class="titlebar__btn titlebar__btn--min"
          aria-label="Свернуть"
          onclick={() => window.electron?.minimizeToolWindow?.()}
        ></button>
      </UiV2Tooltip>
      <UiV2Tooltip text="Развернуть">
        <button
          type="button"
          class="titlebar__btn titlebar__btn--max"
          aria-label="Развернуть"
          onclick={() => window.electron?.toggleMaximizeToolWindow?.()}
        ></button>
      </UiV2Tooltip>
      <UiV2Tooltip text="Закрыть">
        <button
          type="button"
          class="titlebar__btn titlebar__btn--close"
          aria-label="Закрыть"
          onclick={() => window.dispatchEvent(new CustomEvent('anix:composer-request-close'))}
        ></button>
      </UiV2Tooltip>
    </div>
  </header>

  {#if ready}
    {#key `${draftId ?? 'new'}:${repostArticle?.id ?? 0}:${isSuggestion ? 1 : 0}`}
      <FeedArticleComposer
        open={true}
        mode="window"
        channels={channels}
        initialChannelId={channelId}
        {createBusy}
        {repostArticle}
        {draftId}
        initialDraft={draft}
        {isSuggestion}
        onClose={closeWindow}
        onPublished={onPublished}
        onCreateBlog={() => void onCreateBlog()}
      />
    {/key}
  {:else}
    <div class="composer-win__loading">Открываем редактор…</div>
  {/if}
</div>
