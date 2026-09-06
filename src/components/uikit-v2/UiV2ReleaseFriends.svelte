<script lang="ts">
  import UserBadge from '../UserBadge.svelte';
  import { iconBookmark, iconLayoutGrid, iconTags, iconType } from '../icons';
  import { resolveCdnAssetUrl } from '../../utils/posterUrl';

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
    sort?: UiV2ReleaseFriendsSort;
    layout?: UiV2ReleaseFriendsLayout;
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
    sort = 'status',
    layout = 'grid',
    onSortChange,
    onLayoutChange,
    onFriendClick,
    class: className = '',
  }: Props = $props();

  const statusCounts = $derived(
    UIV2_RELEASE_FRIEND_STATUSES
      .map((row) => ({
        ...row,
        count: friends.filter((f) => f.status === row.id).length,
      }))
      .filter((row) => row.count > 0),
  );

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
      {#if scanning}
        <span class="uiv2-release-friends__scan" aria-live="polite">
          ищем… {checkedCount}/{friendsTotal || '…'}
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
            onclick={() => onSortChange?.('status')}
          >
            {@html iconBookmark(16)}
            Статусу
          </button>
          <button
            type="button"
            class="uiv2-release-friends__icon-btn uiv2-release-friends__icon-btn--label"
            class:uiv2-release-friends__icon-btn--on={sort === 'nickname'}
            aria-pressed={sort === 'nickname'}
            onclick={() => onSortChange?.('nickname')}
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
          onclick={() => onLayoutChange?.('grid')}
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
          onclick={() => onLayoutChange?.('mini')}
        >
          {@html iconTags(16)}
        </button>
      </div>
    </div>
  </header>

  {#if statusCounts.length > 0}
    <div class="uiv2-release-friends__stats">
      <div class="uiv2-release-friends__bar" aria-hidden="true">
        {#each statusCounts as row}
          <span
            class="uiv2-release-friends__bar-seg"
            style={`flex:${row.count};background:${row.color}`}
          ></span>
        {/each}
      </div>
      <ul class="uiv2-release-friends__legend">
        {#each statusCounts as row}
          <li class="uiv2-release-friends__legend-item">
            <i class="uiv2-release-friends__dot" style={`background:${row.color}`}></i>
            {row.label} — {row.count}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if shownFriends.length > 0}
    <ul
      class="uiv2-release-friends__list"
      class:uiv2-release-friends__list--grid={layout === 'grid'}
      class:uiv2-release-friends__list--mini={layout === 'mini'}
    >
      {#each shownFriends as friend (friend.id)}
        <li>
          <button
            type="button"
            class="uiv2-release-friends__item"
            class:uiv2-release-friends__item--mini={layout === 'mini'}
            style={layout === 'mini' ? `--mini-status:${statusColor(friend.status)}` : ''}
            aria-label={`${friend.login || `id ${friend.id}`}, ${statusLabel(friend.status)}${friend.isOnline ? ', онлайн' : ''}`}
            onclick={(event) => onFriendClick?.(friend.id, event)}
          >
            {#if layout === 'mini'}
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
              {#if layout !== 'mini'}
                <span class="uiv2-release-friends__status uiv2-release-friends__status--{friend.status}">
                  {statusLabel(friend.status)}
                </span>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if scanning}
    <p class="uiv2-release-friends__hint">Проверяем списки друзей…</p>
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
  }

  .uiv2-release-friends__scan {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--uikit-v2-muted);
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

  .uiv2-release-friends__bar-seg {
    min-width: 2px;
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
  }

  .uiv2-release-friends__list--grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }

  .uiv2-release-friends__list--mini {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
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
</style>
