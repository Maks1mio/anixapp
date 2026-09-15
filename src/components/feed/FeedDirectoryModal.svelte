<script lang="ts">
  import { untrack, onDestroy, tick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import { infiniteScroll } from '../../actions/infiniteScroll';
  import UserAvatar from '../UserAvatar.svelte';
  import UiV2ScrollArea from '../uikit-v2/UiV2ScrollArea.svelte';
  import { openProfilePanel } from '../../stores/profile-panel';
  import { channelAvatarUrl, formatCompactCount } from '../../utils/feed-article';
  import {
    directoryChannelsFromFeed,
    mergeUniqueChannels,
    mergeUniquePeople,
    normalizeDirectoryPeople,
    pageableContent,
    pageableHasMore,
    pageableTotalCount,
    type DirectoryChannel,
    type DirectoryPerson,
  } from '../../utils/feed-directory';
  import type { FeedChannel } from '../../types/feed';
  import { iconSearch, iconX } from '../icons';

  type Kind = 'subscribers' | 'subscriptions';
  type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

  type Props = {
    open: boolean;
    kind: Kind;
    channelId?: number;
    totalCount?: number;
    onClose: () => void;
    onSelectChannel?: (id: number) => void;
  };

  let {
    open,
    kind,
    channelId = 0,
    totalCount = 0,
    onClose,
    onSelectChannel,
  }: Props = $props();

  let searchOpen = $state(false);
  let searchValue = $state('');
  let searchInputEl = $state<HTMLInputElement | null>(null);

  let people = $state<DirectoryPerson[]>([]);
  let channels = $state<DirectoryChannel[]>([]);
  let page = $state(0);
  let hasMore = $state(false);
  let loadState = $state<LoadState>('idle');
  let busy = $state(false);
  let loadedTotal = $state(0);
  let panelEl = $state<HTMLElement | null>(null);
  let viewportEl = $state<HTMLElement | null>(null);

  const title = $derived(kind === 'subscribers' ? 'Подписчики' : 'Подписки');
  const countLabel = $derived(formatCompactCount(loadedTotal || totalCount));
  const visibleChannels = $derived.by(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((ch) => ch.title.toLowerCase().includes(q));
  });
  const showSkeleton = $derived(loadState === 'idle' || loadState === 'loading');
  const skeletonCount = $derived(kind === 'subscribers' ? 15 : 10);
  const emptyHint = $derived.by(() => {
    if (kind === 'subscriptions') {
      return searchValue.trim()
        ? 'Нет подписок по этому запросу.'
        : 'Подпишитесь на каналы и блоги — они появятся здесь.';
    }
    return searchValue.trim()
      ? 'Никого не нашли по этому запросу.'
      : 'Список подписчиков пока недоступен.';
  });

  $effect(() => {
    if (!open) return;
    untrack(() => {
      searchOpen = false;
      searchValue = '';
      people = [];
      channels = [];
      page = 0;
      hasMore = false;
      loadedTotal = totalCount;
      loadState = 'loading';
      void loadPage(0, false, '');
    });
  });

  $effect(() => {
    if (!open || !panelEl) {
      viewportEl = null;
      return;
    }
    loadState;
    people.length;
    channels.length;
    bindViewport();
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  function normalizeChannels(raw: unknown): DirectoryChannel[] {
    if (!Array.isArray(raw)) return [];
    const feed = raw.filter((item): item is FeedChannel => (
      !!item && typeof item === 'object' && Number((item as FeedChannel).id) > 0
    ));
    return directoryChannelsFromFeed(feed.map((c) => ({
      ...c,
      is_subscribed: c.is_subscribed !== false,
    })));
  }

  async function loadPage(nextPage: number, append: boolean, query: string): Promise<void> {
    if (append) {
      if (busy || !hasMore) return;
      busy = true;
    } else {
      loadState = 'loading';
    }
    try {
      if (kind === 'subscriptions') {
        if (!window.anixApi?.channel?.all && !window.anixApi?.channel?.subscriptions) {
          if (!append) {
            channels = [];
            loadState = 'error';
          }
          return;
        }
        let res: unknown = null;
        let list: DirectoryChannel[] = [];
        if (window.anixApi?.channel?.all) {
          res = await window.anixApi.channel.all(nextPage, { isSubscribed: true, sort: 1 });
          list = normalizeChannels(pageableContent(res));
        }
        const stalled = append && list.every((ch) => channels.some((c) => c.id === ch.id));
        if ((!list.length || stalled) && window.anixApi?.channel?.subscriptions) {
          res = await window.anixApi.channel.subscriptions(nextPage, { sort: 1 });
          list = normalizeChannels(pageableContent(res));
        }
        const prevLen = channels.length;
        channels = append ? mergeUniqueChannels(channels, list) : list;
        page = nextPage;
        const apiTotal = pageableTotalCount(res);
        loadedTotal = Math.max(apiTotal, channels.length, totalCount);
        hasMore = append && (list.length === 0 || channels.length === prevLen)
          ? false
          : pageableHasMore(res, nextPage, channels.length, list.length, apiTotal);
        loadState = channels.length === 0 ? 'empty' : 'ready';
        return;
      }

      const api = window.anixApi?.search?.channelSubscribers;
      if (!api || !(channelId > 0)) {
        if (!append) {
          people = [];
          loadState = 'error';
        }
        return;
      }
      const res = await api(channelId, nextPage, query);
      const list = normalizeDirectoryPeople(pageableContent(res));
      people = append ? mergeUniquePeople(people, list) : list;
      page = nextPage;
      const apiTotal = pageableTotalCount(res);
      loadedTotal = Math.max(apiTotal, totalCount, people.length);
      hasMore = append && list.length === 0
        ? false
        : pageableHasMore(res, nextPage, people.length, list.length, Math.max(apiTotal, totalCount));
      loadState = people.length === 0 ? 'empty' : 'ready';
    } catch {
      if (!append) {
        people = [];
        channels = [];
        loadState = 'error';
      }
    } finally {
      busy = false;
    }
    await fillViewportIfNeeded();
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });

  function onSearchInput(value: string) {
    searchValue = value;
    if (kind !== 'subscribers') return;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void loadPage(0, false, value.trim());
    }, 280);
  }

  function toggleSearch() {
    searchOpen = !searchOpen;
    if (!searchOpen && kind === 'subscribers' && searchValue) {
      searchValue = '';
      void loadPage(0, false, '');
    }
  }

  function bindViewport() {
    viewportEl = panelEl?.querySelector<HTMLElement>('[data-uiv2-scroll]') ?? null;
  }

  async function fillViewportIfNeeded() {
    await tick();
    bindViewport();
    if (!open || !hasMore || busy || loadState !== 'ready') return;
    const vp = viewportEl;
    if (!vp) return;
    if (vp.scrollHeight <= vp.clientHeight + 240) {
      void loadPage(page + 1, true, searchValue.trim());
    }
  }

  function loadMore() {
    void loadPage(page + 1, true, searchValue.trim());
  }

  function onViewportScroll(e: Event) {
    const el = e.currentTarget as HTMLElement;
    if (!el || !hasMore || busy || loadState === 'loading') return;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 160) return;
    loadMore();
  }

  function selectPerson(id: number) {
    if (!(id > 0)) return;
    onClose();
    openProfilePanel(id);
  }

  function selectChannel(id: number) {
    if (!(id > 0)) return;
    onSelectChannel?.(id);
    onClose();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <div
    class="feed-dir-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="feed-dir-modal-title"
    use:portal
  >
    <button
      type="button"
      class="feed-dir-modal__backdrop"
      aria-label="Закрыть"
      onclick={onClose}
      transition:fade={{ duration: 160 }}
    ></button>

    <div
      class="feed-dir-modal__panel"
      bind:this={panelEl}
      transition:scale={{ duration: 220, start: 0.96, easing: cubicOut }}
    >
      <header class="feed-dir-modal__header">
        {#if searchOpen}
          <label class="feed-dir-modal__search">
            <span class="feed-dir-modal__search-icon" aria-hidden="true">{@html iconSearch(16)}</span>
            <input
              bind:this={searchInputEl}
              class="feed-dir-modal__search-input"
              type="search"
              autocomplete="off"
              spellcheck="false"
              placeholder={kind === 'subscribers' ? 'Поиск подписчиков' : 'Поиск подписок'}
              aria-label={kind === 'subscribers' ? 'Поиск подписчиков' : 'Поиск подписок'}
              value={searchValue}
              oninput={(e) => onSearchInput((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
        {:else}
          <h2 id="feed-dir-modal-title" class="feed-dir-modal__title">
            {title}
            <span class="feed-dir-modal__count">{countLabel}</span>
          </h2>
        {/if}

        <div class="feed-dir-modal__tools">
          <button
            type="button"
            class="feed-dir-modal__icon-btn"
            class:feed-dir-modal__icon-btn--on={searchOpen}
            aria-label={searchOpen ? 'Скрыть поиск' : 'Поиск'}
            aria-pressed={searchOpen}
            onclick={toggleSearch}
          >
            {@html iconSearch(16)}
          </button>
          <button
            type="button"
            class="feed-dir-modal__icon-btn"
            aria-label="Закрыть"
            onclick={onClose}
          >
            {@html iconX(16)}
          </button>
        </div>
      </header>

      <UiV2ScrollArea
        class="feed-dir-modal__scroll"
        viewportClass="feed-dir-modal__body"
        padding="1rem 0.85rem 1.15rem"
        onscroll={onViewportScroll}
      >
        {#if showSkeleton}
          <ul class="feed-dir-modal__grid" aria-busy="true" aria-label="Загрузка">
            {#each Array.from({ length: skeletonCount }) as _, i (`sk-${i}`)}
              <li class="feed-dir-modal__skel">
                <span class="feed-dir-modal__skel-avatar"></span>
                <span class="feed-dir-modal__skel-name"></span>
              </li>
            {/each}
          </ul>
        {:else if loadState === 'error'}
          <p class="feed-dir-modal__empty">Не получилось загрузить список. Попробуйте ещё раз.</p>
          <button type="button" class="feed-dir-modal__retry" onclick={() => void loadPage(0, false, searchValue.trim())}>
            Повторить
          </button>
        {:else if kind === 'subscribers' && people.length === 0}
          <p class="feed-dir-modal__empty">{emptyHint}</p>
        {:else if kind === 'subscriptions' && visibleChannels.length === 0}
          <p class="feed-dir-modal__empty">{emptyHint}</p>
        {:else if kind === 'subscribers'}
          <ul class="feed-dir-modal__grid">
            {#each people as person (person.id)}
              <li>
                <button
                  type="button"
                  class="feed-dir-modal__person"
                  title={person.login}
                  onclick={() => selectPerson(person.id)}
                >
                  <span class="feed-dir-modal__avatar">
                    <UserAvatar src={channelAvatarUrl(person.avatar)} label={person.login} />
                  </span>
                  <span class="feed-dir-modal__name">
                    {person.login}
                    {#if person.verified}
                      <span class="uiv2-feed-post__verified" title="Подтверждён" aria-hidden="true">✓</span>
                    {/if}
                  </span>
                </button>
              </li>
            {/each}
            {#if busy}
              {#each Array.from({ length: 5 }) as _, i (`more-${i}`)}
                <li class="feed-dir-modal__skel">
                  <span class="feed-dir-modal__skel-avatar"></span>
                  <span class="feed-dir-modal__skel-name"></span>
                </li>
              {/each}
            {/if}
          </ul>
        {:else}
          <ul class="feed-dir-modal__grid">
            {#each visibleChannels as ch (ch.id)}
              <li>
                <button
                  type="button"
                  class="feed-dir-modal__person"
                  title={ch.title}
                  onclick={() => selectChannel(ch.id)}
                >
                  <span
                    class="feed-dir-modal__avatar"
                    class:feed-dir-modal__avatar--channel={!ch.isBlog}
                  >
                    <UserAvatar
                      src={ch.avatar}
                      label={ch.title}
                      shape={ch.isBlog ? 'circle' : 'channel'}
                    />
                  </span>
                  <span class="feed-dir-modal__name">{ch.title}</span>
                </button>
              </li>
            {/each}
            {#if busy}
              {#each Array.from({ length: 5 }) as _, i (`more-${i}`)}
                <li class="feed-dir-modal__skel">
                  <span class="feed-dir-modal__skel-avatar"></span>
                  <span class="feed-dir-modal__skel-name"></span>
                </li>
              {/each}
            {/if}
          </ul>
        {/if}
        {#if loadState === 'ready' && (hasMore || busy)}
          <div
            class="feed-dir-modal__more-sentinel"
            aria-hidden="true"
            use:infiniteScroll={{
              onLoad: loadMore,
              enabled: () => hasMore && !busy && loadState === 'ready',
              root: viewportEl,
              rootMargin: '200px',
            }}
          ></div>
        {/if}
      </UiV2ScrollArea>
    </div>
  </div>
{/if}
