<script lang="ts">
  import { untrack } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2FeedPost from '../uikit-v2/UiV2FeedPost.svelte';
  import UiV2ScrollArea from '../uikit-v2/UiV2ScrollArea.svelte';
  import type { FeedArticle } from '../../types/feed';
  import { feedArticleToUiV2FeedPost } from '../../utils/uikit-v2-feed-post';
  import { openProfilePanel } from '../../stores/profile-panel';
  import { showToast } from '../../stores/toast';
  import { iconTrash2, iconX } from '../icons';

  type Props = {
    open: boolean;
    channelId: number;
    channelTitle?: string;
    onClose?: () => void;
    onDeleted?: (suggestionId: number) => void;
  };

  let {
    open,
    channelId,
    channelTitle = '',
    onClose,
    onDeleted,
  }: Props = $props();

  let items = $state<FeedArticle[]>([]);
  let loadState = $state<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  let errorMsg = $state('');
  let page = $state(0);
  let hasMore = $state(false);
  let busyMore = $state(false);
  let deletingId = $state<number | null>(null);

  function authorLogin(article: FeedArticle): string {
    const raw = article as FeedArticle & {
      profile?: { login?: string; id?: number } | null;
    };
    return String(
      article.author?.login
      ?? raw.profile?.login
      ?? '',
    ).trim() || 'Неизвестно';
  }

  function authorId(article: FeedArticle): number {
    const raw = article as FeedArticle & {
      profile?: { id?: number } | null;
    };
    return Number(article.author?.id ?? raw.profile?.id ?? 0);
  }

  function openAuthor(article: FeedArticle) {
    const id = authorId(article);
    if (!(id > 0)) return;
    openProfilePanel(id);
  }

  function suggestionPostData(article: FeedArticle) {
    const data = feedArticleToUiV2FeedPost(article);
    // Автор показывается в футере карточки предложения — без дубля из «Подписать запись».
    return { ...data, signedAuthor: null };
  }

  async function loadPage(nextPage: number, append: boolean): Promise<void> {
    const api = window.anixApi?.article?.suggestions;
    if (!api || !(channelId > 0)) {
      loadState = 'error';
      errorMsg = 'API предложений недоступно';
      return;
    }
    if (append) busyMore = true;
    else {
      loadState = 'loading';
      errorMsg = '';
    }
    try {
      const res = await api(nextPage, { channelId });
      const list = Array.isArray(res?.content)
        ? (res.content as FeedArticle[]).filter((a) => Number(a?.id) > 0)
        : [];
      items = append ? [...items, ...list] : list;
      page = nextPage;
      const totalPages = Number(res?.total_page_count ?? 0);
      hasMore = totalPages > 0 ? nextPage + 1 < totalPages : list.length >= 20;
      loadState = items.length === 0 ? 'empty' : 'ready';
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      if (!append) {
        items = [];
        loadState = 'error';
      }
    } finally {
      busyMore = false;
    }
  }

  async function deleteSuggestion(article: FeedArticle, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const id = Number(article.id ?? 0);
    if (!(id > 0) || deletingId != null) return;
    const api = window.anixApi?.article?.deleteSuggestion;
    if (!api) {
      showToast('API удаления предложений недоступно', 'err');
      return;
    }
    deletingId = id;
    try {
      const res = await api(id);
      const code = Number(res?.code ?? 0);
      if (code !== 0) {
        showToast(`Не удалось удалить предложение (код ${code})`, 'err');
        return;
      }
      items = items.filter((a) => a.id !== id);
      loadState = items.length === 0 ? 'empty' : 'ready';
      onDeleted?.(id);
      showToast('Предложение удалено', 'ok');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'err');
    } finally {
      deletingId = null;
    }
  }

  $effect(() => {
    if (!open || !(channelId > 0)) {
      items = [];
      loadState = 'idle';
      deletingId = null;
      return;
    }
    void untrack(() => loadPage(0, false));
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <div
    class="feed-sug-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="feed-sug-modal-title"
    use:portal
  >
    <button
      type="button"
      class="feed-sug-modal__backdrop"
      aria-label="Закрыть"
      onclick={() => onClose?.()}
      transition:fade={{ duration: 160 }}
    ></button>

    <div
      class="feed-sug-modal__panel"
      transition:scale={{ duration: 220, start: 0.96, easing: cubicOut }}
    >
      <header class="feed-sug-modal__header">
        <div class="feed-sug-modal__heading">
          <h2 id="feed-sug-modal-title" class="feed-sug-modal__title">
            Предложенные записи
          </h2>
          {#if channelTitle}
            <p class="feed-sug-modal__sub">{channelTitle}</p>
          {/if}
        </div>
        <div class="feed-sug-modal__tools">
          <button
            type="button"
            class="feed-sug-modal__icon-btn"
            aria-label="Закрыть"
            onclick={() => onClose?.()}
          >
            {@html iconX(16)}
          </button>
        </div>
      </header>

      <UiV2ScrollArea
        class="feed-sug-modal__scroll"
        viewportClass="feed-sug-modal__body"
        padding="0.85rem 0.85rem 1.15rem"
      >
        {#if loadState === 'loading' || loadState === 'idle'}
          <p class="feed-sug-modal__empty">Загрузка предложений…</p>
        {:else if loadState === 'error'}
          <p class="feed-sug-modal__empty" role="alert">
            {errorMsg || 'Не получилось загрузить список. Попробуйте ещё раз.'}
          </p>
          <button
            type="button"
            class="feed-sug-modal__retry"
            onclick={() => void loadPage(0, false)}
          >
            Повторить
          </button>
        {:else if loadState === 'empty'}
          <p class="feed-sug-modal__empty">Пока нет предложенных записей.</p>
        {:else}
          <ul class="feed-sug-modal__list">
            {#each items as article (article.id)}
              <li class="feed-sug-modal__card">
                <div class="feed-sug-modal__item">
                  <UiV2FeedPost
                    data={suggestionPostData(article)}
                    staticPreview
                  />
                </div>
                <div class="feed-sug-modal__meta">
                  <p class="feed-sug-modal__author">
                    Автор:
                    {#if authorId(article) > 0}
                      <button
                        type="button"
                        class="feed-sug-modal__author-name"
                        onclick={() => openAuthor(article)}
                      >{authorLogin(article)}</button>
                    {:else}
                      <span>{authorLogin(article)}</span>
                    {/if}
                  </p>
                  <button
                    type="button"
                    class="feed-sug-modal__delete"
                    disabled={deletingId === article.id}
                    onclick={(e) => void deleteSuggestion(article, e)}
                  >
                    <span class="feed-sug-modal__delete-icon" aria-hidden="true">
                      {@html iconTrash2(16)}
                    </span>
                    <span>
                      {deletingId === article.id ? 'Удаление…' : 'Удалить предложение'}
                    </span>
                  </button>
                </div>
              </li>
            {/each}
          </ul>
          {#if hasMore}
            <div class="feed-sug-modal__more">
              <UiV2Button
                variant="chrome"
                size="sm"
                label={busyMore ? 'Загрузка…' : 'Ещё'}
                disabled={busyMore}
                onclick={() => void loadPage(page + 1, true)}
              />
            </div>
          {/if}
        {/if}
      </UiV2ScrollArea>
    </div>
  </div>
{/if}
