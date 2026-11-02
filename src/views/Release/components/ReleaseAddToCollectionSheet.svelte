<script lang="ts">
  /**
   * «Добавить к себе в коллекцию» (CollectionProfileListFragment в режиме выбора):
   * свои коллекции → collectionMy/release/add, либо новая коллекция с этим релизом.
   */
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../../actions/portal';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import UiV2Skeleton from '../../../components/uikit-v2/UiV2Skeleton.svelte';
  import { iconLock, iconPlus } from '../../../components/icons';
  import { resolveJacksonRefs } from '../../../utils/jackson-refs';
  import { ensureProfileId } from '../../../utils/profile';
  import {
    COLLECTION_RELEASES_MAX,
    mapCollectionCard,
    saveCollectionEditorDraft,
  } from '../../../utils/collection';
  import { showToast } from '../../../stores/toast';
  import { navigate } from '../../../stores/navigation';
  import type { CollectionCardData } from '../../../components/CollectionCard.svelte';

  interface Props {
    releaseId: number;
    /** Сырые данные релиза — для черновика новой коллекции */
    release: Record<string, unknown>;
    onClose: () => void;
  }

  let { releaseId, release, onClose }: Props = $props();

  const titleId = `release-add-collection-${Math.random().toString(36).slice(2, 8)}`;

  /** Коды ReleaseAddCollectionResult */
  const ADD_ERRORS: Record<number, string> = {
    2: 'Коллекция не найдена',
    3: 'Это не ваша коллекция',
    4: 'Некорректный релиз',
    5: 'Этот релиз уже находится в вашей коллекции',
    6: 'Коллекция удалена',
    7: 'Вы превысили допустимый лимит релизов в коллекции',
  };

  let loadState = $state<'loading' | 'ready' | 'error'>('loading');
  let items = $state<CollectionCardData[]>([]);
  let profileId = $state<number | null>(null);
  let page = $state(0);
  let hasMore = $state(true);
  let loadingMore = $state(false);
  let pendingId = $state<number | null>(null);

  async function loadPage() {
    const api = window.anixApi?.collection;
    if (!api?.profileCollections || !hasMore || loadingMore) return;
    loadingMore = true;
    try {
      if (profileId == null) profileId = await ensureProfileId();
      if (!profileId) throw new Error('no profile');
      const res = resolveJacksonRefs(await api.profileCollections(profileId, page)) as {
        content?: Record<string, unknown>[];
        last?: boolean;
      };
      const content = (res?.content ?? []).filter((c) => !(c.is_deleted ?? c.delete));
      items = [...items, ...content.map(mapCollectionCard)];
      hasMore = content.length > 0 && res?.last !== true && content.length >= 25;
      page += 1;
      loadState = 'ready';
    } catch {
      if (!items.length) loadState = 'error';
      hasMore = false;
    } finally {
      loadingMore = false;
    }
  }

  function retry() {
    loadState = 'loading';
    hasMore = true;
    page = 0;
    void loadPage();
  }

  function onListScroll(e: Event) {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) void loadPage();
  }

  async function addTo(item: CollectionCardData) {
    const api = window.anixApi?.collectionMy;
    if (!api?.releaseAdd || pendingId != null) return;
    pendingId = item.id;
    try {
      const res = (await api.releaseAdd(item.id, releaseId)) as { code?: number } | null;
      const code = Number(res?.code ?? 0);
      if (code === 0) {
        showToast(`Релиз был успешно добавлен в вашу коллекцию «${item.title}»`);
        onClose();
        return;
      }
      showToast(ADD_ERRORS[code] ?? `Не удалось добавить релиз (код ${code})`, code === 5 ? 'info' : 'err');
    } catch {
      showToast('Не удалось добавить релиз в коллекцию', 'err');
    } finally {
      pendingId = null;
    }
  }

  function createNew() {
    saveCollectionEditorDraft({
      title: '',
      description: '',
      isPrivate: false,
      releaseIds: [releaseId],
      releases: [release],
      editId: null,
    });
    onClose();
    navigate('/collections/create');
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  onMount(() => {
    void loadPage();
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="uiv2-choice-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} use:portal>
  <button
    type="button"
    class="uiv2-choice-sheet__backdrop"
    aria-label="Закрыть"
    onclick={onClose}
    transition:fade={{ duration: 160 }}
  ></button>

  <div
    class="uiv2-choice-sheet__panel uiv2-choice-sheet__panel--form add-collection"
    transition:scale={{ duration: 220, start: 0.94, easing: cubicOut }}
  >
    <h3 id={titleId} class="uiv2-choice-sheet__title">Добавить в коллекцию</h3>

    <button type="button" class="add-collection__row add-collection__row--create" onclick={createNew}>
      <span class="add-collection__cover add-collection__cover--create" aria-hidden="true">{@html iconPlus(20)}</span>
      <span class="add-collection__body">
        <span class="add-collection__name">Новая коллекция</span>
        <span class="add-collection__meta">С этим релизом</span>
      </span>
    </button>

    <div class="add-collection__scroll" onscroll={onListScroll}>
      {#if loadState === 'loading'}
        {#each Array(3) as _, i (i)}
          <div class="add-collection__row" aria-hidden="true">
            <UiV2Skeleton class="add-collection__cover" />
            <span class="add-collection__body">
              <UiV2Skeleton class="add-collection__skeleton-line" />
              <UiV2Skeleton class="add-collection__skeleton-line add-collection__skeleton-line--short" />
            </span>
          </div>
        {/each}
      {:else if loadState === 'error'}
        <div class="add-collection__empty">
          <p>Не удалось загрузить ваши коллекции</p>
          <UiV2Button label="Повторить" variant="chrome" onclick={retry} />
        </div>
      {:else if items.length === 0}
        <div class="add-collection__empty">
          <p>У вас пока нет коллекций</p>
        </div>
      {:else}
        {#each items as item (item.id)}
          {@const full = typeof item.releaseCount === 'number' && item.releaseCount >= COLLECTION_RELEASES_MAX}
          <button
            type="button"
            class="add-collection__row"
            disabled={pendingId != null}
            aria-busy={pendingId === item.id}
            onclick={() => void addTo(item)}
          >
            <span class="add-collection__cover">
              {#if item.image}
                <img src={item.image} alt="" loading="lazy" decoding="async" />
              {/if}
            </span>
            <span class="add-collection__body">
              <span class="add-collection__name">
                {item.title}
                {#if item.isPrivate}
                  <span class="add-collection__lock" aria-label="Приватная">{@html iconLock(12)}</span>
                {/if}
              </span>
              {#if typeof item.releaseCount === 'number'}
                <span class="add-collection__meta" class:add-collection__meta--warn={full}>
                  {item.releaseCount} из {COLLECTION_RELEASES_MAX} релизов
                </span>
              {/if}
            </span>
            {#if pendingId === item.id}
              <span class="add-collection__state add-collection__state--busy" aria-hidden="true"></span>
            {/if}
          </button>
        {/each}
        {#if loadingMore}
          <p class="add-collection__more">Загрузка…</p>
        {/if}
      {/if}
    </div>

    <UiV2Button label="Отмена" size="lg" block variant="chrome" onclick={onClose} />
  </div>
</div>

<style lang="scss">
  .add-collection {
    overflow: hidden;
  }

  .add-collection__scroll {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    margin: 0 -0.35rem;
    padding: 0 0.35rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .add-collection__row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-width: 0;
    padding: 0.5rem;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--uikit-v2-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.16s ease;

    &:hover:not(:disabled) {
      background: var(--uiv2-hover-bg);
    }

    &:focus-visible {
      outline: 2px solid var(--uikit-v2-accent);
      outline-offset: -2px;
    }

    &:disabled {
      cursor: default;
    }

    &--create {
      border: 1px dashed var(--uiv2-border-subtle);
    }
  }

  .add-collection__row :global(.add-collection__cover),
  .add-collection__cover {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 4.25rem;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border-radius: 8px;
    background: var(--uiv2-surface-raised);
    color: var(--uiv2-fg-soft);
  }

  .add-collection__cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .add-collection__cover--create {
    color: var(--uikit-v2-accent);
  }

  .add-collection__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .add-collection__name {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
    overflow: hidden;
    font-size: 0.86rem;
    font-weight: 600;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .add-collection__lock {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--uiv2-fg-muted);
  }

  .add-collection__meta {
    color: var(--uiv2-fg-muted);
    font-size: 0.74rem;

    &--warn {
      color: var(--color-error, #e5484d);
    }
  }

  .add-collection__state--busy {
    flex: 0 0 auto;
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid var(--uiv2-surface-raised);
    border-top-color: var(--uikit-v2-accent);
    border-radius: 50%;
    animation: add-collection-spin 0.8s linear infinite;
  }

  .add-collection__row :global(.add-collection__skeleton-line) {
    display: block;
    width: 70%;
    height: 0.8rem;
  }

  .add-collection__row :global(.add-collection__skeleton-line--short) {
    width: 40%;
  }

  .add-collection__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    padding: 1.5rem 0.5rem;
    color: var(--uiv2-fg-muted);
    font-size: 0.82rem;
    text-align: center;

    p {
      margin: 0;
    }
  }

  .add-collection__more {
    margin: 0;
    padding: 0.5rem 0;
    color: var(--uiv2-fg-muted);
    font-size: 0.78rem;
    text-align: center;
  }

  @keyframes add-collection-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
