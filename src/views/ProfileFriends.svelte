<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { handleUserProfileClick } from '../stores/user-profile';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import { resolveBadgeName, resolveProfileBadgeUrl } from '../utils/badge';
  import { setDiscordContext, refreshDiscordPresence } from '../services/discord-presence';
  import Tabs from '../components/Tabs.svelte';
  import UserBadge from '../components/UserBadge.svelte';
  import Checkbox from '../components/Checkbox.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import {
    getProfileBanDurationLabel,
    getProfileBanNotice,
    type ProfileBanFields,
  } from './Profile/_utils';
  import {
    createFriendBanScanner,
    isCheckedFriendBanned,
    mergeBanFields,
    type FriendBanScanner,
  } from '../services/friends-ban-scan';

  interface Props {
    id?: number;
  }

  let { id }: Props = $props();

  function onProfileTabChange(tabId: string) {
    if (tabId === 'friends') return;
    navigate(id ? `/profile/${id}/lists?tab=votes` : '/bookmarks?tab=votes');
  }

  let profileLogin = $state('Загрузка…');
  let profileAvatar = $state('');
  let resolvedId = $derived(id ?? 0);
  let titleSet = false;
  let friendCount = $state<number | null>(null);

  const profileTabs = $derived([
    { id: 'votes', label: 'Оценки' },
    { id: 'friends', label: 'Друзья', badge: friendCount ?? undefined },
  ]);

  let friends = $state<any[]>([]);
  let recommendations = $state<any[]>([]);
  let isMyProfilePage = $state(false);
  $effect.pre(() => {
    isMyProfilePage = !id;
  });
  let currentPage = $state(0);
  let isLoading = $state(false);
  let hasMore = $state(true);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let showEnd = $state(false);
  let wrapEl: HTMLElement | undefined = $state();
  let showBannedOnly = $state(false);
  let banFieldsById = $state<Record<number, ProfileBanFields>>({});
  let banCheckedCount = $state(0);
  let banScanTotal = $state(0);
  let banScanRunning = $state(false);
  let banScanner: FriendBanScanner | null = null;

  const friendsWithBan = $derived(
    friends.map((fr) => mergeBanFields(fr, banFieldsById[Number(fr.id)])),
  );
  const bannedFriends = $derived(
    friendsWithBan.filter((fr) => isCheckedFriendBanned(fr, banFieldsById)),
  );
  const visibleFriends = $derived(showBannedOnly ? bannedFriends : friendsWithBan);
  const scanningBanned = $derived(
    showBannedOnly && (banScanRunning || isLoading || hasMore) && loadState !== 'error',
  );
  const scanLabel = $derived(
    `ищем… ${banCheckedCount}/${banScanTotal || friendCount || friends.length || '…'}`,
  );

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;
  let scrollAttached = false;

  function setProfile(login: string, avatar?: string, isSelf?: boolean) {
    if (titleSet) return;
    titleSet = true;
    profileLogin = login;
    if (avatar) profileAvatar = avatar;
    const profileIsSelf = isSelf ?? !id;
    setDiscordContext({
      profileLogin: login,
      profileAvatar: avatar ? resolveCdnAssetUrl(avatar) : undefined,
      profileIsSelf,
    });
    refreshDiscordPresence();
  }

  async function getId(): Promise<number> {
    if (resolvedId) return resolvedId;
    const self = await window.anixApi?.profile.self?.() as any;
    const p = self?.profile;
    if (p?.login) setProfile(p.login, p.avatar);
    if (typeof p?.friend_count === 'number') friendCount = p.friend_count;
    resolvedId = p?.id ?? 0;
    return resolvedId;
  }

  function attachInfiniteScroll() {
    if (scrollAttached) return;
    const el = wrapEl?.closest('.page__scroll') as HTMLElement | null;
    if (!el) return;
    scrollAttached = true;
    scrollEl = el;
    scrollListener = () => {
      if (!hasMore || isLoading) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 200) load(true);
    };
    el.addEventListener('scroll', scrollListener);
  }

  async function load(append: boolean) {
    if (isLoading || (!hasMore && append)) return;
    isLoading = true;
    if (!append) {
      if (loadState !== 'error') loadState = 'loading';
      currentPage = 0;
      hasMore = true;
      friends = [];
      showEnd = false;
    }
    const pageToLoad = currentPage;
    try {
      const uid = await getId();
      if (!uid) {
        loadState = 'empty';
        isLoading = false;
        return;
      }
      const data = await window.anixApi!.profile.getFriends(uid, pageToLoad) as any;
      const content = (data?.content ?? []) as any[];
      if (!content.length) {
        if (!append) loadState = 'empty';
        showEnd = true;
        hasMore = false;
        isLoading = false;
        return;
      }
      friends = append ? [...friends, ...content] : content;
      loadState = 'ready';
      currentPage += 1;
      isLoading = false;
      attachInfiniteScroll();
      if (showBannedOnly && hasMore) void load(true);
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
      loadState = 'error';
      isLoading = false;
    }
  }

  onMount(async () => {
    if (id) {
      window.anixApi?.profile.info(id).then((d: any) => {
        const p = d?.profile;
        if (p?.login) setProfile(p.login, p.avatar, !!d?.is_my_profile);
        if (typeof p?.friend_count === 'number') friendCount = p.friend_count;
        isMyProfilePage = !!d?.is_my_profile;
      }).catch(() => {});
    } else {
      isMyProfilePage = true;
      try {
        const rec = await window.anixApi?.profile.getFriendRecommendations?.() as { content?: any[] };
        recommendations = rec?.content ?? [];
      } catch { /* ignore */ }
    }
    if (window.anixApi) await load(false);
  });

  $effect(() => {
    if (!showBannedOnly) return;
    untrack(() => {
      if (!isLoading && hasMore && loadState === 'ready') void load(true);
    });
  });

  $effect(() => {
    const enabled = showBannedOnly;
    const ids = friends
      .map((fr) => Number(fr.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const totalHint = (friendCount ?? 0) > 0 ? friendCount! : ids.length;

    untrack(() => {
      if (!enabled) {
        banScanner?.abort();
        banScanner = null;
        banScanRunning = false;
        return;
      }
      banScanRunning = true;
      if (!ids.length) return;
      if (!banScanner) {
        banScanner = createFriendBanScanner((state) => {
          banScanRunning = state.scanning;
          banCheckedCount = state.checkedCount;
          banScanTotal = state.friendsTotal;
          banFieldsById = state.fieldsById;
        });
      }
      banScanner.scan(ids, totalHint);
    });
  });

  onDestroy(() => {
    banScanner?.abort();
    banScanner = null;
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
  });
</script>

<div class="view view-search" bind:this={wrapEl}>
  <div class="search-page">
    <div class="view-header">
      <div class="profile-more__user">
        <div class="profile-more__avatar" style={profileAvatar ? `background-image:url('${resolveCdnAssetUrl(profileAvatar)}')` : ''}></div>
        <h1 class="view-header__title">{profileLogin}</h1>
      </div>
    </div>

    <Tabs tabs={profileTabs} activeId="friends" onChange={onProfileTabChange} />

    <div class="profile-friends__toolbar">
      {#if scanningBanned}
        <span class="profile-friends__scan" aria-live="polite">{scanLabel}</span>
      {/if}
      <Checkbox
        className="profile-friends__ban-filter"
        bind:checked={showBannedOnly}
        label="Забаненные"
      />
    </div>

    <div class="search-page__results">
      {#if isMyProfilePage && recommendations.length && !showBannedOnly}
        <section class="profile-friends__recs">
          <h2 class="profile-friends__recs-title">Рекомендации</h2>
          <div class="search-page__profiles">
            {#each recommendations as fr}
              {@const badgeUrl = resolveProfileBadgeUrl(fr as Record<string, unknown>)}
              <button
                type="button"
                class="search-page__profile"
                onclick={(event) => handleUserProfileClick(fr.id, event)}
              >
                <div
                  class="search-page__profile-avatar"
                  style={fr.avatar ? `background-image:url('${resolveCdnAssetUrl(fr.avatar)}')` : ''}
                ></div>
                <div class="search-page__profile-info">
                  <span class="search-page__profile-name-row">
                    <span class="search-page__profile-name">{fr.login || ''}</span>
                    <UserBadge url={badgeUrl} name={resolveBadgeName(fr.badge)} size="sm" />
                  </span>
                </div>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if loadState === 'loading'}
        <div class="search-page__loading">Загрузка…</div>
      {:else if loadState === 'error'}
        <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void load(false)} />
      {:else if loadState === 'empty'}
        <p class="search-page__empty">{showBannedOnly ? 'Нет забаненных друзей' : 'Ничего не найдено'}</p>
      {:else if showBannedOnly && !visibleFriends.length}
        <p class="search-page__empty" aria-live="polite">
          {scanningBanned ? scanLabel : 'Нет забаненных друзей'}
        </p>
      {:else}
        <div class="search-page__profiles">
          {#each visibleFriends as fr}
            {@const badgeUrl = resolveProfileBadgeUrl(fr as Record<string, unknown>)}
            {@const banLabel = getProfileBanDurationLabel(fr)}
            {@const banNotice = getProfileBanNotice(fr)}
            <button
              type="button"
              class="search-page__profile"
              onclick={(event) => handleUserProfileClick(fr.id, event)}
            >
              <div
                class="search-page__profile-avatar"
                style={fr.avatar ? `background-image:url('${resolveCdnAssetUrl(fr.avatar)}')` : ''}
              ></div>
              <div class="search-page__profile-info">
                <span class="search-page__profile-name-row">
                  <span class="search-page__profile-name">{fr.login || ''}</span>
                  <UserBadge url={badgeUrl} name={resolveBadgeName(fr.badge)} size="sm" />
                  {#if banLabel}
                    <span class="search-page__profile-ban" title={banNotice ?? undefined}>{banLabel}</span>
                  {/if}
                </span>
                {#if fr.friend_count != null}
                  <span class="search-page__profile-status">{fr.friend_count} друзей</span>
                {/if}
              </div>
              {#if fr.is_online}
                <span class="search-page__profile-online"></span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}

      {#if showEnd && loadState === 'ready' && !showBannedOnly}
        <div class="search-page__end">это всё :)</div>
      {:else if loadState === 'ready' && isLoading && !scanningBanned}
        <div class="search-page__loading">Загрузка…</div>
      {:else if loadState === 'ready' && scanningBanned && visibleFriends.length}
        <div class="search-page__loading">{scanLabel}</div>
      {/if}
    </div>
  </div>
</div>
