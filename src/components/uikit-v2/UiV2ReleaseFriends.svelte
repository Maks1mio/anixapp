<script lang="ts">
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import UserBadge from '../UserBadge.svelte';
  import UiV2Skeleton from './UiV2Skeleton.svelte';
  import { iconBookmark, iconLayoutGrid, iconTags, iconType } from '../icons';
  import { resolveCdnAssetUrl } from '../../utils/posterUrl';
  import {
    getReleaseFriendsLayout,
    getReleaseFriendsSort,
    setReleaseFriendsLayout,
    setReleaseFriendsSort,
  } from '../../prefs';

  export type UiV2ReleaseFriendStatus =
    | 'watching'
    | 'planned'
    | 'completed'
    | 'on_hold'
    | 'dropped';

  export type UiV2ReleaseFriend = {
    id: number;
    login: string;
    avatar?: string;
    isOnline?: boolean;
    badgeUrl?: string | null;
    badgeName?: string;
    status: UiV2ReleaseFriendStatus;
  };

  export type UiV2ReleaseFriendsSort = 'status' | 'nickname';
  export type UiV2ReleaseFriendsLayout = 'grid' | 'mini';

  export const UIV2_RELEASE_FRIEND_STATUSES: {
    id: UiV2ReleaseFriendStatus;
    label: string;
    color: string;
  }[] = [
    { id: 'watching', label: 'Смотрю', color: '#22c55e' },
    { id: 'planned', label: 'В планах', color: '#c084fc' },
    { id: 'completed', label: 'Просмотрено', color: '#60a5fa' },
    { id: 'on_hold', label: 'Отложено', color: '#fb923c' },
    { id: 'dropped', label: 'Брошено', color: '#ef4444' },
  ];

  type Props = {
    friends?: UiV2ReleaseFriend[];
    scanning?: boolean;
    checkedCount?: number;
    friendsTotal?: number;
    onSortChange?: (id: UiV2ReleaseFriendsSort) => void;
    onLayoutChange?: (id: UiV2ReleaseFriendsLayout) => void;
    onFriendClick?: (id: number, event: MouseEvent) => void;
    class?: string;
  };

  let {
    friends = [],
    scanning = false,
    checkedCount = 0,
    friendsTotal = 0,
    onSortChange,
    onLayoutChange,
    onFriendClick,
    class: className = '',
  }: Props = $props();

  const vtNs = `uiv2rf${Math.floor(Math.random() * 1e6).toString(36)}`;

  let appeared = $state(new Set<number>());
  let sort = $state<UiV2ReleaseFriendsSort>(getReleaseFriendsSort());
  let layout = $state<UiV2ReleaseFriendsLayout>(getReleaseFriendsLayout());

  const statusCounts = $derived(
    UIV2_RELEASE_FRIEND_STATUSES.map((row) => ({
      ...row,
      count: friends.filter((f) => f.status === row.id).length,
    })),
  );

  const visibleStatusCounts = $derived(statusCounts.filter((row) => row.count > 0));

  const statusOrder = $derived(
    Object.fromEntries(UIV2_RELEASE_FRIEND_STATUSES.map((row, i) => [row.id, i])),
  );

  const shownFriends = $derived.by(() => {
    const list = [...friends];
    if (sort === 'nickname') {
      list.sort((a, b) => a.login.localeCompare(b.login, 'ru'));
    } else {
      list.sort((a, b) => {
        const byStatus = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
        if (byStatus !== 0) return byStatus;
        return a.login.localeCompare(b.login, 'ru');
      });
    }
    return list;
  });

  let listFading = $state(false);
  let displayedLayout = $state(getReleaseFriendsLayout());

  const skeletonCount = $derived(
    scanning ? (friends.length === 0 ? (displayedLayout === 'mini' ? 5 : 3) : 1) : 0,
  );

  const scanLabel = $derived(`ищем… ${checkedCount}/${friendsTotal || '…'}`);

  const showStats = $derived(scanning || friends.length > 0);

  $effect(() => {
    if (friends.length === 0) appeared = new Set();
  });

  $effect(() => {
    const onSort = (event: Event) => {
      const id = (event as CustomEvent<{ sort?: UiV2ReleaseFriendsSort }>).detail?.sort;
      if (id !== 'status' && id !== 'nickname') return;
      if (id === sort) return;
      withMotion(() => {
        sort = id;
      });
    };
    const onLayout = (event: Event) => {
      const id = (event as CustomEvent<{ layout?: UiV2ReleaseFriendsLayout }>).detail?.layout;
      if (id !== 'grid' && id !== 'mini') return;
      if (id === layout) return;
      layout = id;
    };
    window.addEventListener('anix:releaseFriendsSortChanged', onSort);
    window.addEventListener('anix:releaseFriendsLayoutChanged', onLayout);
    return () => {
      window.removeEventListener('anix:releaseFriendsSortChanged', onSort);
      window.removeEventListener('anix:releaseFriendsLayoutChanged', onLayout);
    };
  });

  $effect(() => {
    const next = layout;
    if (next === displayedLayout) return;
    if (prefersReducedMotion()) {
      displayedLayout = next;
      return;
    }
    listFading = true;
    const timer = window.setTimeout(() => {
      displayedLayout = next;
      void tick().then(() => {
        requestAnimationFrame(() => {
          listFading = false;
        });
      });
    }, 160);
    return () => window.clearTimeout(timer);
  });

  function friendWord(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'друг';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'друга';
    return 'друзей';
  }

  function statusLabel(status: UiV2ReleaseFriendStatus): string {
    return UIV2_RELEASE_FRIEND_STATUSES.find((s) => s.id === status)?.label ?? status;
  }

  function statusColor(status: UiV2ReleaseFriendStatus): string {
    return UIV2_RELEASE_FRIEND_STATUSES.find((s) => s.id === status)?.color ?? 'var(--uikit-v2-muted)';
  }

  function avatarUrl(avatar: string | undefined): string {
    return avatar ? resolveCdnAssetUrl(avatar.trim()) : '';
  }

  function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function withMotion(update: () => void) {
    const start = document.startViewTransition?.bind(document);
    if (!start || prefersReducedMotion()) {
      update();
      return;
    }
    const run = async () => {
      update();
      await tick();
    };
    try {
      (start as (cb: unknown) => unknown)({ update: run, types: ['uiv2-rf'] });
    } catch {
      start(run);
    }
  }

  function requestSort(id: UiV2ReleaseFriendsSort) {
    if (id === sort) return;
    withMotion(() => {
      sort = id;
      setReleaseFriendsSort(id);
      onSortChange?.(id);
    });
  }

  function requestLayout(id: UiV2ReleaseFriendsLayout) {
    if (id === layout || listFading) return;
    layout = id;
    setReleaseFriendsLayout(id);
    onLayoutChange?.(id);
  }

  function markAppeared(id: number) {
    if (appeared.has(id)) return;
    appeared = new Set(appeared).add(id);
  }

  function onSlotAnimEnd(id: number, event: AnimationEvent) {
    if (event.target !== event.currentTarget) return;
    markAppeared(id);
  }

  function slotStyle(friend: UiV2ReleaseFriend): string {
    const mini = displayedLayout === 'mini' ? `--mini-status:${statusColor(friend.status)};` : '';
    return `${mini}view-transition-name:${vtNs}-f${friend.id};view-transition-class:uiv2-rf-friend`;
  }
</script>

<section class="uiv2-release-friends {className}" aria-label="Друзья">
  <header class="uiv2-release-friends__head">
    <div class="uiv2-release-friends__title-row">
      <h2 class="uiv2-release-friends__title">Друзья</h2>
      {#if friends.length > 0}
        <span class="uiv2-release-friends__count">
          {friends.length} {friendWord(friends.length)}
        </span>
      {/if}
    </div>

    <div class="uiv2-release-friends__toolbar">
      <div class="uiv2-release-friends__sort">
        <span class="uiv2-release-friends__sort-label">Сортировать по</span>
        <div class="uiv2-release-friends__btns" role="group" aria-label="Сортировать по">
          <button
            type="button"
            class="uiv2-release-friends__icon-btn uiv2-release-friends__icon-btn--label"
            class:uiv2-release-friends__icon-btn--on={sort === 'status'}
            aria-pressed={sort === 'status'}
            onclick={() => requestSort('status')}
          >
            {@html iconBookmark(16)}
            Статусу
          </button>
          <button
            type="button"
            class="uiv2-release-friends__icon-btn uiv2-release-friends__icon-btn--label"
            class:uiv2-release-friends__icon-btn--on={sort === 'nickname'}
            aria-pressed={sort === 'nickname'}
            onclick={() => requestSort('nickname')}
          >
            {@html iconType(16)}
            Никнейму
          </button>
        </div>
      </div>
      <div class="uiv2-release-friends__btns" role="group" aria-label="Вид списка">
        <button
          type="button"
          class="uiv2-release-friends__icon-btn"
          class:uiv2-release-friends__icon-btn--on={layout === 'grid'}
          aria-label="Сетка"
          aria-pressed={layout === 'grid'}
          title="Сетка"
          onclick={() => requestLayout('grid')}
        >
          {@html iconLayoutGrid(16)}
        </button>
        <button
          type="button"
          class="uiv2-release-friends__icon-btn"
          class:uiv2-release-friends__icon-btn--on={layout === 'mini'}
          aria-label="Мини"
          aria-pressed={layout === 'mini'}
          title="Мини"
          onclick={() => requestLayout('mini')}
        >
          {@html iconTags(16)}
        </button>
      </div>
    </div>
  </header>

  {#if showStats}
    <div class="uiv2-release-friends__stats" style="view-transition-name:{vtNs}-bar">
      <div
        class="uiv2-release-friends__bar"
        class:uiv2-release-friends__bar--empty={friends.length === 0}
        aria-hidden="true"
      >
        {#each statusCounts as row (row.id)}
          <span
            class="uiv2-release-friends__bar-seg"
            style={`width:${friends.length ? (row.count / friends.length) * 100 : 0}%;background:${row.color}`}
          ></span>
        {/each}
      </div>
      {#if visibleStatusCounts.length > 0}
        <ul class="uiv2-release-friends__legend">
          {#each visibleStatusCounts as row (row.id)}
            <li class="uiv2-release-friends__legend-item" transition:fade={{ duration: 180 }}>
              <i class="uiv2-release-friends__dot" style={`background:${row.color}`}></i>
              {row.label} — {row.count}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if shownFriends.length > 0 || scanning}
    <ul
      class="uiv2-release-friends__list"
      class:uiv2-release-friends__list--grid={displayedLayout === 'grid'}
      class:uiv2-release-friends__list--mini={displayedLayout === 'mini'}
      class:uiv2-release-friends__list--fading={listFading}
    >
      {#each shownFriends as friend, index (friend.id)}
        <li
          class="uiv2-release-friends__slot"
          class:uiv2-release-friends__slot--in={!appeared.has(friend.id)}
          style={`--enter-i:${index};${slotStyle(friend)}`}
          onanimationend={(event) => onSlotAnimEnd(friend.id, event)}
        >
          <button
            type="button"
            class="uiv2-release-friends__item"
            class:uiv2-release-friends__item--mini={displayedLayout === 'mini'}
            aria-label={`${friend.login || `id ${friend.id}`}, ${statusLabel(friend.status)}${friend.isOnline ? ', онлайн' : ''}`}
            onclick={(event) => onFriendClick?.(friend.id, event)}
          >
            {#if displayedLayout === 'mini'}
              {#if friend.isOnline}
                <span class="uiv2-release-friends__mini-online" aria-hidden="true"></span>
              {/if}
            {:else}
              <span
                class="uiv2-release-friends__av"
                class:uiv2-release-friends__av--img={!!friend.avatar}
                class:uiv2-release-friends__av--online={!!friend.isOnline}
                style={friend.avatar ? `background-image:url('${avatarUrl(friend.avatar)}')` : ''}
              ></span>
            {/if}
            <span class="uiv2-release-friends__meta">
              <span class="uiv2-release-friends__name-row">
                <span class="uiv2-release-friends__login">{friend.login || `id ${friend.id}`}</span>
                <UserBadge
                  class="uiv2-release-friends__badge"
                  url={friend.badgeUrl}
                  name={friend.badgeName}
                  size="sm"
                />
              </span>
              {#if displayedLayout !== 'mini'}
                <span class="uiv2-release-friends__status uiv2-release-friends__status--{friend.status}">
                  {statusLabel(friend.status)}
                </span>
              {/if}
            </span>
          </button>
        </li>
      {/each}

      {#each Array.from({ length: skeletonCount }, (_, i) => i) as i (`skel-${displayedLayout}-${i}`)}
        <li
          class="uiv2-release-friends__slot uiv2-release-friends__slot--skel"
          class:uiv2-release-friends__slot--skel-mini={displayedLayout === 'mini'}
          class:uiv2-release-friends__slot--skel-scan={i === 0}
          aria-hidden={i !== 0}
          style={`--enter-i:${shownFriends.length + i}`}
        >
          {#if displayedLayout === 'mini'}
            {#if i === 0}
              <span class="uiv2-release-friends__skel-chip uiv2-release-friends__skel-chip--label">
                <span class="uiv2-release-friends__scan" aria-live="polite">{scanLabel}</span>
              </span>
            {:else}
              <UiV2Skeleton rounded="sm" class="uiv2-release-friends__skel-chip" />
            {/if}
          {:else if i === 0}
            <div class="uiv2-release-friends__skel-row">
              <UiV2Skeleton rounded="full" class="uiv2-release-friends__skel-av" />
              <span class="uiv2-release-friends__skel-lines">
                <span class="uiv2-release-friends__scan" aria-live="polite">{scanLabel}</span>
                <UiV2Skeleton rounded="sm" class="uiv2-release-friends__skel-line uiv2-release-friends__skel-line--sm" />
              </span>
            </div>
          {:else}
            <div class="uiv2-release-friends__skel-row">
              <UiV2Skeleton rounded="full" class="uiv2-release-friends__skel-av" />
              <span class="uiv2-release-friends__skel-lines">
                <UiV2Skeleton rounded="sm" class="uiv2-release-friends__skel-line" />
                <UiV2Skeleton rounded="sm" class="uiv2-release-friends__skel-line uiv2-release-friends__skel-line--sm" />
              </span>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="uiv2-release-friends__hint">Ваши друзья еще не смотрели это тайтл</p>
  {/if}
</section>

<style>
  .uiv2-release-friends {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    color: var(--uikit-v2-text);
    font-family: var(--uikit-v2-font);
  }

  .uiv2-release-friends__head {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .uiv2-release-friends__title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.45rem 0.7rem;
  }

  .uiv2-release-friends__title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .uiv2-release-friends__count {
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--uikit-v2-muted);
    font-variant-numeric: tabular-nums;
  }

  .uiv2-release-friends__scan {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--uikit-v2-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .uiv2-release-friends__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .uiv2-release-friends__sort {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.55rem;
  }

  .uiv2-release-friends__sort-label {
    font-size: 0.78rem;
    color: var(--uikit-v2-muted);
  }

  .uiv2-release-friends__btns {
    display: flex;
    gap: 0.15rem;
  }

  .uiv2-release-friends__icon-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    width: 1.85rem;
    height: 1.85rem;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--uikit-v2-muted);
    font: inherit;
    cursor: pointer;
    transition: background 0.22s ease, color 0.22s ease;
  }

  .uiv2-release-friends__icon-btn--label {
    width: auto;
    padding: 0 0.55rem 0 0.4rem;
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .uiv2-release-friends__icon-btn--on {
    color: var(--uikit-v2-text);
    background: var(--uiv2-hover-bg);
  }

  .uiv2-release-friends__icon-btn:hover {
    color: var(--uikit-v2-text);
  }

  .uiv2-release-friends__icon-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--uikit-v2-accent) 55%, transparent);
    outline-offset: 2px;
  }

  .uiv2-release-friends__stats {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .uiv2-release-friends__bar {
    display: flex;
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--uiv2-surface-raised);
  }

  .uiv2-release-friends__bar--empty {
    background: linear-gradient(
      90deg,
      var(--uiv2-skeleton-base) 0%,
      var(--uiv2-skeleton-highlight) 50%,
      var(--uiv2-skeleton-base) 100%
    );
    background-size: 200% 100%;
    animation: uiv2-rf-shimmer 1.35s ease-in-out infinite;
  }

  .uiv2-release-friends__bar-seg {
    display: block;
    height: 100%;
    min-width: 0;
    flex: 0 0 auto;
    transition: width 0.48s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .uiv2-release-friends__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .uiv2-release-friends__legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    color: var(--uikit-v2-muted);
    font-variant-numeric: tabular-nums;
  }

  .uiv2-release-friends__dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .uiv2-release-friends__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
    transition: opacity 0.16s ease;
  }

  .uiv2-release-friends__list--fading {
    opacity: 0;
    pointer-events: none;
  }

  .uiv2-release-friends__list--grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }

  .uiv2-release-friends__list--mini {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .uiv2-release-friends__slot {
    min-width: 0;
  }

  .uiv2-release-friends__slot--in {
    animation: uiv2-rf-enter 0.46s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: calc(var(--enter-i, 0) * 42ms);
  }

  .uiv2-release-friends__slot--skel {
    animation: uiv2-rf-enter 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: calc(var(--enter-i, 0) * 42ms);
  }

  .uiv2-release-friends__item {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.45rem 0.5rem;
    border: none;
    border-radius: var(--uikit-v2-radius);
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .uiv2-release-friends__item:hover {
    background: var(--uiv2-hover-bg);
  }

  .uiv2-release-friends__item:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--uikit-v2-accent) 55%, transparent);
    outline-offset: 2px;
  }

  .uiv2-release-friends__item--mini {
    width: auto;
    gap: 0.35rem;
    padding: 0.22rem 0.5rem;
    border: 1px solid var(--mini-status);
    border-radius: 6px;
    background: var(--uikit-v2-elevated, var(--uiv2-surface-raised));
  }

  .uiv2-release-friends__item--mini:has(.uiv2-release-friends__mini-online) {
    padding-left: 0.38rem;
  }

  .uiv2-release-friends__mini-online {
    flex-shrink: 0;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: #22c55e;
  }

  .uiv2-release-friends__item--mini:hover {
    background: color-mix(in srgb, var(--mini-status) 14%, var(--uikit-v2-elevated, var(--uiv2-surface-raised)));
  }

  .uiv2-release-friends__item--mini:focus-visible {
    outline-color: var(--mini-status);
  }

  .uiv2-release-friends__item--mini .uiv2-release-friends__meta {
    gap: 0;
  }

  .uiv2-release-friends__item--mini .uiv2-release-friends__login {
    font-size: 0.82rem;
    font-weight: 600;
  }

  .uiv2-release-friends__item--mini .uiv2-release-friends__name-row :global(.user-badge) {
    width: 0.85rem;
    height: 0.85rem;
  }

  .uiv2-release-friends__av {
    position: relative;
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--uiv2-surface-raised) center / cover no-repeat;
  }

  .uiv2-release-friends__av--online::after {
    content: '';
    position: absolute;
    right: 0;
    bottom: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #22c55e;
    border: 2px solid var(--uikit-v2-bg);
    box-sizing: border-box;
  }

  .uiv2-release-friends__meta {
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
    min-width: 0;
  }

  .uiv2-release-friends__name-row {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
    max-width: 100%;
  }

  .uiv2-release-friends__login {
    font-size: 0.92rem;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .uiv2-release-friends__name-row :global(.user-badge) {
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
  }

  .uiv2-release-friends__status {
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--uikit-v2-muted);
  }

  .uiv2-release-friends__status--watching { color: #22c55e; }
  .uiv2-release-friends__status--planned { color: #c084fc; }
  .uiv2-release-friends__status--completed { color: #60a5fa; }
  .uiv2-release-friends__status--on_hold { color: #fb923c; }
  .uiv2-release-friends__status--dropped { color: #ef4444; }

  .uiv2-release-friends__hint {
    margin: 0;
    font-size: 0.88rem;
    color: var(--uikit-v2-muted);
  }

  .uiv2-release-friends__skel-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.45rem 0.5rem;
  }

  .uiv2-release-friends__slot--skel-mini {
    display: flex;
  }

  :global(.uiv2-release-friends__skel-av) {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
  }

  .uiv2-release-friends__skel-lines {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
    flex: 1;
  }

  :global(.uiv2-release-friends__skel-line) {
    width: 72%;
    height: 0.72rem;
  }

  :global(.uiv2-release-friends__skel-line--sm) {
    width: 44%;
    height: 0.58rem;
  }

  :global(.uiv2-release-friends__skel-chip) {
    width: 5.6rem;
    height: 1.65rem;
  }

  .uiv2-release-friends__skel-chip--label {
    display: inline-flex;
    align-items: center;
    width: auto;
    min-width: 5.6rem;
    padding: 0 0.55rem;
    border-radius: 6px;
    background: linear-gradient(
      90deg,
      var(--uiv2-skeleton-base) 0%,
      var(--uiv2-skeleton-highlight) 50%,
      var(--uiv2-skeleton-base) 100%
    );
    background-size: 200% 100%;
    animation: uiv2-rf-shimmer 1.35s ease-in-out infinite;
  }

  .uiv2-release-friends__slot--skel-mini:nth-child(3n) :global(.uiv2-release-friends__skel-chip) {
    width: 4.4rem;
  }

  .uiv2-release-friends__slot--skel-mini:nth-child(3n + 1) :global(.uiv2-release-friends__skel-chip) {
    width: 7.2rem;
  }

  @keyframes uiv2-rf-enter {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes uiv2-rf-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  :global(html:active-view-transition-type(uiv2-rf)::view-transition-old(root)),
  :global(html:active-view-transition-type(uiv2-rf)::view-transition-new(root)) {
    animation: none;
    mix-blend-mode: normal;
  }

  :global(html:active-view-transition-type(uiv2-rf)::view-transition-group(.uiv2-rf-friend)) {
    animation-duration: 0.42s;
    animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
    z-index: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .uiv2-release-friends__slot--in,
    .uiv2-release-friends__slot--skel,
    .uiv2-release-friends__bar--empty,
    .uiv2-release-friends__skel-chip--label {
      animation: none;
    }

    .uiv2-release-friends__bar-seg,
    .uiv2-release-friends__icon-btn,
    .uiv2-release-friends__item,
    .uiv2-release-friends__list {
      transition: none;
    }
  }
</style>
