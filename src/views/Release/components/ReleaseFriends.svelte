<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { isAuthenticated } from '../../../stores/auth';
  import { handleUserProfileClick } from '../../../stores/user-profile';
  import { resolveCdnAssetUrl } from '../../../utils/posterUrl';
  import { LIST_STATUSES } from '../_types';
  import {
    watchFriendsForRelease,
    type FriendReleaseMatch,
    type FriendsReleaseLookupState,
  } from '../../../services/friends-release-index';

  interface Props {
    releaseId: number;
  }

  let { releaseId }: Props = $props();

  const PREVIEW_LIMIT = 8;

  let auth = $state(get(isAuthenticated));
  let matches = $state<FriendReleaseMatch[]>([]);
  let scanning = $state(false);
  let friendsTotal = $state(0);
  let checkedCount = $state(0);
  let done = $state(false);
  let expanded = $state(false);
  let sectionEl = $state<HTMLElement | undefined>();
  let startedForId: number | null = null;
  let abortWatch: (() => void) | null = null;
  let observer: IntersectionObserver | null = null;
  let unsubAuth: (() => void) | null = null;

  const empty = $derived(done && !scanning && matches.length === 0);
  const reveal = $derived(auth && (scanning || done));

  const statusCounts = $derived.by(() => {
    const counts: Partial<Record<FriendReleaseMatch['status'], number>> = {};
    for (const m of matches) {
      counts[m.status] = (counts[m.status] ?? 0) + 1;
    }
    return LIST_STATUSES
      .map((s) => ({ id: s.id, label: s.label, count: counts[s.id] ?? 0 }))
      .filter((s) => s.count > 0);
  });

  const shownFriends = $derived(expanded ? matches : matches.slice(0, PREVIEW_LIMIT));
  const hiddenCount = $derived(Math.max(0, matches.length - PREVIEW_LIMIT));

  function friendWord(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'друг';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'друга';
    return 'друзей';
  }

  function statusLabel(status: FriendReleaseMatch['status']): string {
    return LIST_STATUSES.find((s) => s.id === status)?.label ?? status;
  }

  function avatarUrl(avatar: string): string {
    return resolveCdnAssetUrl(avatar.trim());
  }

  function applyState(state: FriendsReleaseLookupState) {
    matches = state.matches;
    scanning = state.scanning;
    friendsTotal = state.friendsTotal;
    checkedCount = state.checkedCount;
    if (!state.scanning) done = true;
  }

  function stopWatch() {
    abortWatch?.();
    abortWatch = null;
    startedForId = null;
  }

  function startWatch(id: number) {
    if (!auth || !id || startedForId === id) return;
    stopWatch();
    startedForId = id;
    done = false;
    matches = [];
    scanning = true;
    friendsTotal = 0;
    checkedCount = 0;
    expanded = false;
    abortWatch = watchFriendsForRelease(id, applyState).abort;
  }

  function attachObserver(el: HTMLElement) {
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) startWatch(releaseId);
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 },
    );
    observer.observe(el);
  }

  onMount(() => {
    unsubAuth = isAuthenticated.subscribe((ok) => {
      auth = ok;
      if (!ok) {
        stopWatch();
        matches = [];
        scanning = false;
        friendsTotal = 0;
        checkedCount = 0;
        done = false;
      }
    });
  });

  onDestroy(() => {
    stopWatch();
    observer?.disconnect();
    unsubAuth?.();
  });

  $effect(() => {
    const id = releaseId;
    const el = sectionEl;
    if (!auth || !el) return;

    // Смена релиза / появление секции: observer + старт, если уже в зоне видимости
    stopWatch();
    matches = [];
    scanning = false;
    friendsTotal = 0;
    checkedCount = 0;
    done = false;
    expanded = false;

    attachObserver(el);
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 240 && rect.bottom > -240) {
      startWatch(id);
    }

    return () => {
      observer?.disconnect();
      observer = null;
    };
  });
</script>

{#if auth}
  <div
    class="release-page__section release-page__friends"
    class:release-page__friends--hidden={!reveal}
    bind:this={sectionEl}
    aria-hidden={!reveal}
  >
    {#if reveal}
      <div class="release-page__friends-head">
        <h2 class="release-page__block-title">Друзья</h2>
        {#if matches.length > 0}
          <span class="release-page__friends-count">
            {matches.length} {friendWord(matches.length)}
          </span>
        {:else if scanning}
          <span class="release-page__friends-count release-page__friends-count--muted">
            ищем… {checkedCount}/{friendsTotal || '…'}
          </span>
        {/if}
      </div>

      {#if statusCounts.length > 0}
        <div class="release-page__friends-summary" aria-label="Статусы друзей">
          {#each statusCounts as row}
            <span class="release-page__friends-chip release-page__friends-chip--{row.id}">
              <i></i>
              {row.label} — {row.count}
            </span>
          {/each}
        </div>
      {/if}

      {#if matches.length > 0}
        <ul class="release-page__friends-list">
          {#each shownFriends as friend (friend.id)}
            <li>
              <button
                type="button"
                class="release-page__friends-item"
                onclick={(event) => handleUserProfileClick(friend.id, event)}
              >
                <span
                  class="release-page__friends-av"
                  class:release-page__friends-av--img={!!friend.avatar}
                  style={friend.avatar ? `background-image:url('${avatarUrl(friend.avatar)}')` : ''}
                >
                  {#if friend.isOnline}
                    <span class="release-page__friends-online" title="Онлайн"></span>
                  {/if}
                </span>
                <span class="release-page__friends-meta">
                  <span class="release-page__friends-login">{friend.login || `id ${friend.id}`}</span>
                  <span class="release-page__friends-status release-page__friends-status--{friend.status}">
                    {statusLabel(friend.status)}
                  </span>
                </span>
              </button>
            </li>
          {/each}
        </ul>

        {#if hiddenCount > 0 && !expanded}
          <button
            type="button"
            class="release-page__friends-more"
            onclick={() => { expanded = true; }}
          >
            Показать ещё {hiddenCount}
          </button>
        {/if}
      {:else if scanning}
        <p class="release-page__friends-hint">Проверяем списки друзей…</p>
      {:else if empty}
        <p class="release-page__friends-hint">Ваши друзья еще не смотрели это тайтл</p>
      {/if}
    {/if}
  </div>
{/if}
