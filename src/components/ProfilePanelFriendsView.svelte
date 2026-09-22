<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { iconMessageCircle } from './icons';
  import UserBadge from './UserBadge.svelte';
  import Checkbox from './Checkbox.svelte';
  import { resolveBadgeName, resolveProfileBadgeUrl } from '../utils/badge';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import UiV2BackBar from './uikit-v2/UiV2BackBar.svelte';
  import {
    getProfileBanDurationLabel,
    getProfileBanNotice,
    type ProfileBanFields,
  } from '../views/Profile/_utils';
  import {
    createFriendBanScanner,
    isCheckedFriendBanned,
    mergeBanFields,
    type FriendBanScanner,
  } from '../services/friends-ban-scan';

  interface Props {
    profileId: number;
    login: string;
    isMyProfile: boolean;
    friendCount?: number;
    onBack: () => void;
    onOpenFriend: (id: number, login?: string) => void;
    onOpenMessage?: (id: number, friend: Record<string, unknown>) => void;
  }

  let {
    profileId,
    login,
    isMyProfile,
    friendCount = 0,
    onBack,
    onOpenFriend,
    onOpenMessage,
  }: Props = $props();

  let rootEl = $state<HTMLElement | undefined>();
  let requestsIn = $state<Record<string, unknown>[]>([]);
  let requestsOut = $state<Record<string, unknown>[]>([]);
  let friends = $state<Record<string, unknown>[]>([]);
  /** Корни ответов API — для Jackson @id у badge */
  let friendsRoot = $state<unknown>(null);
  let requestsInRoot = $state<unknown>(null);
  let requestsOutRoot = $state<unknown>(null);
  let page = $state(0);
  let hasMore = $state(true);
  let loading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let requestBusyId = $state(0);
  let showBannedOnly = $state(false);
  let banFieldsById = $state<Record<number, ProfileBanFields>>({});
  let banCheckedCount = $state(0);
  let banScanTotal = $state(0);
  let banScanRunning = $state(false);
  let banScanner: FriendBanScanner | null = null;

  const hasAnyRequests = $derived(requestsIn.length > 0 || requestsOut.length > 0);
  const friendsWithBan = $derived(
    friends.map((fr) => mergeBanFields(fr, banFieldsById[Number(fr.id)])),
  );
  const bannedFriends = $derived(
    friendsWithBan.filter((fr) => isCheckedFriendBanned(fr, banFieldsById)),
  );
  const visibleFriends = $derived(showBannedOnly ? bannedFriends : friendsWithBan);
  const scanningBanned = $derived(
    showBannedOnly && (banScanRunning || loading || hasMore) && loadState !== 'error',
  );
  const listCount = $derived(showBannedOnly ? bannedFriends.length : friendCount);
  const scanLabel = $derived(
    `ищем… ${banCheckedCount}/${banScanTotal || friendCount || friends.length || '…'}`,
  );

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  function avatarOf(u: Record<string, unknown>): string {
    return u.avatar ? resolveCdnAssetUrl(String(u.avatar)) : '';
  }

  /** Как в Anixart: is_social → белый акцент на кнопке сообщения */
  function hasSocial(u: Record<string, unknown>): boolean {
    if (u.is_social === true) return true;
    if (u.is_social_hidden) return false;
    return !!(u.vk_page || u.tg_page || u.inst_page || u.tt_page || u.discord_page);
  }

  function friendWord(n: number) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'друг';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'друга';
    return 'друзей';
  }

  async function loadRequests() {
    if (!isMyProfile || !window.anixApi?.profile) {
      requestsIn = [];
      requestsOut = [];
      requestsInRoot = null;
      requestsOutRoot = null;
      return;
    }
    const api = window.anixApi.profile;
    const [inRes, outRes] = await Promise.allSettled([
      api.getFriendRequestsIn?.(0),
      api.getFriendRequestsOut?.(0),
    ]);
    if (inRes.status === 'fulfilled') {
      requestsInRoot = inRes.value;
      requestsIn = (inRes.value as { content?: Record<string, unknown>[] } | undefined)?.content ?? [];
    } else {
      requestsInRoot = null;
      requestsIn = [];
    }
    if (outRes.status === 'fulfilled') {
      requestsOutRoot = outRes.value;
      requestsOut = (outRes.value as { content?: Record<string, unknown>[] } | undefined)?.content ?? [];
    } else {
      requestsOutRoot = null;
      requestsOut = [];
    }
  }

  async function loadFriends(append: boolean) {
    if (!window.anixApi?.profile || loading || (!hasMore && append)) return;
    loading = true;
    if (!append) {
      loadState = 'loading';
      page = 0;
      hasMore = true;
      friends = [];
      friendsRoot = null;
    }
    const pageToLoad = page;
    try {
      const data = await window.anixApi.profile.getFriends(profileId, pageToLoad) as {
        content?: Record<string, unknown>[];
      };
      const content = data?.content ?? [];
      if (!content.length) {
        if (!append) loadState = hasAnyRequests ? 'ready' : 'empty';
        hasMore = false;
        loading = false;
        return;
      }
      friendsRoot = append ? friendsRoot ?? data : data;
      const enriched = content.map((fr) => ({
        ...fr,
        __badgeUrl: resolveProfileBadgeUrl(fr, data),
      }));
      friends = append ? [...friends, ...enriched] : enriched;
      loadState = 'ready';
      page += 1;
      hasMore = content.length >= 20;
      loading = false;
      attachScroll();
      if (showBannedOnly && hasMore) void loadFriends(true);
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
      loading = false;
    }
  }

  function attachScroll() {
    if (scrollListener) return;
    const el = rootEl?.closest('.page__scroll') as HTMLElement | null;
    if (!el) return;
    scrollEl = el;
    scrollListener = () => {
      if (!hasMore || loading) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 220) void loadFriends(true);
    };
    el.addEventListener('scroll', scrollListener);
  }

  async function acceptRequest(id: number) {
    if (!window.anixApi?.profile?.sendFriendRequest || requestBusyId) return;
    requestBusyId = id;
    try {
      await window.anixApi.profile.sendFriendRequest(id);
      requestsIn = requestsIn.filter((r) => Number(r.id) !== id);
      void loadFriends(false);
    } catch {
      /* ignore */
    } finally {
      requestBusyId = 0;
    }
  }

  async function hideRequest(id: number) {
    if (!window.anixApi?.profile?.hideFriendRequest || requestBusyId) return;
    requestBusyId = id;
    try {
      await window.anixApi.profile.hideFriendRequest(id);
      requestsIn = requestsIn.filter((r) => Number(r.id) !== id);
    } catch {
      /* ignore */
    } finally {
      requestBusyId = 0;
    }
  }

  async function cancelOutgoing(id: number) {
    if (!window.anixApi?.profile?.removeFriendRequest || requestBusyId) return;
    requestBusyId = id;
    try {
      await window.anixApi.profile.removeFriendRequest(id);
      requestsOut = requestsOut.filter((r) => Number(r.id) !== id);
    } catch {
      /* ignore */
    } finally {
      requestBusyId = 0;
    }
  }

  $effect(() => {
    if (!showBannedOnly) return;
    untrack(() => {
      if (!loading && hasMore && loadState === 'ready') void loadFriends(true);
    });
  });

  $effect(() => {
    const enabled = showBannedOnly;
    const ids = friends
      .map((fr) => Number(fr.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const totalHint = friendCount > 0 ? friendCount : ids.length;

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

  onMount(async () => {
    await loadRequests();
    await loadFriends(false);
    attachScroll();
  });

  onDestroy(() => {
    banScanner?.abort();
    banScanner = null;
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
  });
</script>

<div class="profile-panel__friends-view" bind:this={rootEl}>
  <header class="profile-panel__friends-head">
    <UiV2BackBar
      segments={[
        { label: 'Друзья', active: true },
        { label: login },
      ]}
      onBack={onBack}
    />
  </header>

  {#if isMyProfile && requestsIn.length}
    <section class="profile-panel__requests" aria-label="Заявки в друзья">
      <h3 class="profile-panel__friends-section-title">Заявки в друзья</h3>
      <ul class="profile-panel__request-list">
        {#each requestsIn as req (req.id)}
          {@const av = avatarOf(req)}
          {@const badgeUrl = resolveProfileBadgeUrl(req, requestsInRoot)}
          <li class="profile-panel__request">
            <button
              type="button"
              class="profile-panel__request-user"
              onclick={() => onOpenFriend(Number(req.id), String(req.login ?? ''))}
            >
              <span
                class="profile-panel__friend-row-av"
                class:profile-panel__friend-row-av--online={!!req.is_online}
                style={av ? `background-image:url('${av}')` : undefined}
              ></span>
              <span class="profile-panel__friend-row-name">
                {req.login || 'Без имени'}
                <UserBadge url={badgeUrl} name={resolveBadgeName(req.badge)} size="xs" />
              </span>
            </button>
            <div class="profile-panel__request-actions">
              <button
                type="button"
                class="profile-panel__request-btn profile-panel__request-btn--accept"
                disabled={requestBusyId === Number(req.id)}
                onclick={() => void acceptRequest(Number(req.id))}
              >Принять</button>
              <button
                type="button"
                class="profile-panel__request-btn"
                disabled={requestBusyId === Number(req.id)}
                onclick={() => void hideRequest(Number(req.id))}
              >Скрыть</button>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if isMyProfile && requestsOut.length}
    <section class="profile-panel__requests" aria-label="Исходящие заявки">
      <h3 class="profile-panel__friends-section-title">Исходящие заявки</h3>
      <ul class="profile-panel__request-list">
        {#each requestsOut as req (req.id)}
          {@const av = avatarOf(req)}
          {@const badgeUrl = resolveProfileBadgeUrl(req, requestsOutRoot)}
          <li class="profile-panel__request">
            <button
              type="button"
              class="profile-panel__request-user"
              onclick={() => onOpenFriend(Number(req.id), String(req.login ?? ''))}
            >
              <span
                class="profile-panel__friend-row-av"
                class:profile-panel__friend-row-av--online={!!req.is_online}
                style={av ? `background-image:url('${av}')` : undefined}
              ></span>
              <span class="profile-panel__friend-row-name">
                {req.login || 'Без имени'}
                <UserBadge url={badgeUrl} name={resolveBadgeName(req.badge)} size="xs" />
              </span>
            </button>
            <div class="profile-panel__request-actions">
              <button
                type="button"
                class="profile-panel__request-btn"
                disabled={requestBusyId === Number(req.id)}
                onclick={() => void cancelOutgoing(Number(req.id))}
              >Отменить</button>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="profile-panel__friends-list-wrap" aria-label="Мои друзья">
    <div class="profile-panel__friends-section-head">
      <h3 class="profile-panel__friends-section-title" id="profile-panel-friends-heading">
        {isMyProfile ? 'Мои друзья' : 'Друзья'}
        {#if listCount > 0}
          <span class="profile-panel__friends-badge">{listCount}</span>
        {/if}
      </h3>
      {#if scanningBanned}
        <span class="profile-panel__friends-scan" aria-live="polite">{scanLabel}</span>
      {/if}
      <Checkbox
        className="profile-panel__friends-ban-filter"
        bind:checked={showBannedOnly}
        label="Забаненные"
      />
    </div>

    {#if loadState === 'loading' && !friends.length}
      <p class="profile-panel__state">Загрузка…</p>
    {:else if loadState === 'error'}
      <p class="profile-panel__state">{errorMsg || 'Не удалось загрузить'}</p>
    {:else if loadState === 'empty' && !hasAnyRequests}
      <p class="profile-panel__state">Нет друзей</p>
    {:else if showBannedOnly && !visibleFriends.length}
      <p class="profile-panel__state" aria-live="polite">
        {scanningBanned ? scanLabel : 'Нет забаненных друзей'}
      </p>
    {:else if visibleFriends.length}
      <ul
        class="profile-panel__friend-rows"
        aria-labelledby="profile-panel-friends-heading"
        aria-busy={scanningBanned ? 'true' : undefined}
      >
        {#each visibleFriends as fr (fr.id)}
          {@const av = avatarOf(fr)}
          {@const badgeUrl =
            (typeof fr.__badgeUrl === 'string' ? fr.__badgeUrl : null) ??
            resolveProfileBadgeUrl(fr, friendsRoot)}
          {@const n = Number(fr.friend_count ?? 0)}
          {@const social = hasSocial(fr)}
          {@const banLabel = getProfileBanDurationLabel(fr)}
          {@const banNotice = getProfileBanNotice(fr)}
          <li class="profile-panel__friend-row">
            <button
              type="button"
              class="profile-panel__friend-row-main"
              onclick={() => onOpenFriend(Number(fr.id), String(fr.login ?? ''))}
            >
              <span
                class="profile-panel__friend-row-av"
                class:profile-panel__friend-row-av--online={!!fr.is_online}
                style={av ? `background-image:url('${av}')` : undefined}
              ></span>
              <span class="profile-panel__friend-row-meta">
                <span class="profile-panel__friend-row-name">
                  <span class="profile-panel__friend-row-login">{fr.login || 'Без имени'}</span>
                  <UserBadge url={badgeUrl} name={resolveBadgeName(fr.badge)} size="xs" />
                  {#if banLabel}
                    <span class="profile-panel__friend-row-ban" title={banNotice ?? undefined}>
                      {banLabel}
                    </span>
                  {/if}
                </span>
                {#if Number.isFinite(n)}
                  <span class="profile-panel__friend-row-sub">{n} {friendWord(n)}</span>
                {/if}
              </span>
            </button>
            <button
              type="button"
              class="profile-panel__friend-row-msg"
              class:profile-panel__friend-row-msg--accent={social}
              title="Сообщение"
              aria-label="Сообщение"
              onclick={() => onOpenMessage?.(Number(fr.id), fr)}
            >
              {@html iconMessageCircle(18)}
            </button>
          </li>
        {/each}
      </ul>
      {#if loading && !showBannedOnly}
        <p class="profile-panel__state">Загрузка…</p>
      {/if}
    {/if}
  </section>
</div>
