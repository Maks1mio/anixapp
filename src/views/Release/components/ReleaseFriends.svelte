<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { isAuthenticated } from '../../../stores/auth';
  import { handleUserProfileClick } from '../../../stores/user-profile';
  import UiV2ReleaseFriends from '../../../components/uikit-v2/UiV2ReleaseFriends.svelte';
  import {
    watchFriendsForRelease,
    type FriendReleaseMatch,
    type FriendsReleaseLookupState,
  } from '../../../services/friends-release-index';

  interface Props {
    releaseId: number;
  }

  let { releaseId }: Props = $props();

  let auth = $state(get(isAuthenticated));
  let matches = $state<FriendReleaseMatch[]>([]);
  let scanning = $state(false);
  let friendsTotal = $state(0);
  let checkedCount = $state(0);
  let done = $state(false);
  let sectionEl = $state<HTMLElement | undefined>();
  let startedForId: number | null = null;
  let abortWatch: (() => void) | null = null;
  let observer: IntersectionObserver | null = null;
  let unsubAuth: (() => void) | null = null;

  const reveal = $derived(auth && (scanning || done));

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

    stopWatch();
    matches = [];
    scanning = false;
    friendsTotal = 0;
    checkedCount = 0;
    done = false;

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
      <UiV2ReleaseFriends
        friends={matches}
        {scanning}
        {checkedCount}
        {friendsTotal}
        onFriendClick={(id, event) => handleUserProfileClick(id, event)}
      />
    {/if}
  </div>
{/if}
