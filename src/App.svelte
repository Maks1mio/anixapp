<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { appScreen } from './stores/auth';
  import { currentPath, navigate } from './stores/navigation';
  import { openLobbyModal, settingsModalOpen, lobbyModalOpen, lobbyModalInitialCode, notificationsModalOpen, watchModalOpen, watchModalReleaseId, watchModalReleaseTitle, lobbyCurrentPlayback, isPlayerWindowOpen, lobbyWatchingPeerIds } from './stores/modals';
  import { sendPlayerViewActive } from './services/lobby-ws';
  import { getPath, getSearchParams } from './router';
  import { initTheme, applyThemeById } from './services/themes';
  import { getCurrentRoomId, getCurrentRoomCode, getCurrentParticipants, pushCommand, voteOnProposal, notifyLobbyBufferingStart } from './services/lobby-state';
  import { initTooltipPlacement } from './utils/tooltip-place';
  import { initBodyTooltip } from './utils/body-tooltip';

  import Layout from './layout/Layout.svelte';
  import Login from './views/Login.svelte';
  import Home from './views/Home.svelte';
  import Catalog from './views/Catalog.svelte';
  import ReleaseCommentReplies from './views/ReleaseCommentReplies.svelte';
  import ReleaseCommentsPage from './views/ReleaseComments.svelte';
  import Release from './views/Release/page.svelte';
  import Related from './views/Related.svelte';
  import Bookmarks from './views/Bookmarks.svelte';
  import Profile from './views/Profile/page.svelte';
  import ProfileVotes from './views/ProfileVotes.svelte';
  import ProfileFriends from './views/ProfileFriends.svelte';
  import Search from './views/Search.svelte';
  import Collection from './views/Collection.svelte';
  import Notifications from './views/Notifications.svelte';
  import Uikit from './views/Uikit.svelte';
  import AnnouncementChat from './views/AnnouncementChat/page.svelte';

  import SettingsModal from './components/SettingsModal.svelte';
  import LobbyModal from './components/LobbyModal.svelte';
  import NotificationsModal from './components/NotificationsModal.svelte';
  import WatchModal from './components/WatchModal.svelte';
  import Toast from './components/Toast.svelte';
  import OfflineScreen from './views/OfflineScreen.svelte';

  initTheme();

  // ── Routing state ─────────────────────────────────────────────────────────
  let path = $state(getPath());
  let searchQ = $state('');
  let searchTab = $state<'releases' | 'profiles' | 'collections'>('releases');

  // Local reactive mirror of isPlayerWindowOpen store (used in event handlers inside onMount)
  let _isPlayerOpen = false;
  isPlayerWindowOpen.subscribe(v => { _isPlayerOpen = v; });

  function syncSearchParams() {
    const p = getSearchParams();
    searchQ = p.get('q') || '';
    searchTab = (p.get('tab') || 'releases') as 'releases' | 'profiles' | 'collections';
  }

  // Keep path in sync with the store (critical for HTTP mode where pushState
  // does not fire popstate, so onNav never runs after navigate())
  $effect(() => {
    const storePath = $currentPath;
    if (storePath !== path) {
      path = storePath;
      syncSearchParams();
    }
  });

  // Окно плеера без WS: список участников шлётся по IPC. События до открытия плеера терялись — при открытии и при смене плейбека лобби повторяем push.
  $effect(() => {
    if (!$isPlayerWindowOpen) return;
    if (!getCurrentRoomId()) return;
    void $lobbyCurrentPlayback;
    queueMicrotask(() => {
      window.electron?.sendParticipantsToPlayer?.(getCurrentParticipants());
    });
  });

  const releaseCommentRepliesMatch = $derived(path.match(/^\/release\/(\d+)\/comment\/(\d+)\/replies$/));
  const releaseCommentsMatch = $derived(path.match(/^\/release\/(\d+)\/comments$/));
  const releaseMatch          = $derived(path.match(/^\/release\/(\d+)$/));
  const relatedMatch          = $derived(path.match(/^\/release\/(\d+)\/related$/));
  const profileMatch          = $derived(path.match(/^\/profile\/(\d+)$/));
  const profileVotesMatch     = $derived(path.match(/^\/profile\/(\d+)\/votes$/));
  const profileFriendsMatch   = $derived(path.match(/^\/profile\/(\d+)\/friends$/));
  const collectionMatch       = $derived(path.match(/^\/collection\/(\d+)$/));
  const announcementChatMatch = $derived(path.match(/^\/announcement\/([^/]+)\/chat$/));

  // ── App screen state machine ───────────────────────────────────────────────
  let offlineRetryTimer: number | null = null;

  function clearRetry() {
    if (offlineRetryTimer !== null) { window.clearInterval(offlineRetryTimer); offlineRetryTimer = null; }
  }

  async function checkAndShow() {
    if (!window.anixApi) return;
    try {
      await window.anixApi.client.checkConnection();
      const { hasToken } = await window.anixApi.auth.getStatus();
      clearRetry();
      appScreen.set(hasToken ? 'main' : 'login');
    } catch { /* stay offline */ }
  }

  onMount(() => {
    initTooltipPlacement();
    initBodyTooltip();

    if (!window.anixApi) {
      appScreen.set('login');
      return;
    }

    // Routing listeners
    const onNav = () => {
      path = getPath();
      currentPath.set(path);
      syncSearchParams();
    };
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);
    syncSearchParams();

    // ── Player window state tracking ────────────────────────────────────────
    // Initialise flag from main process (in case app was reloaded while player was open)
    window.electron?.isPlayerOpen?.().then(open => isPlayerWindowOpen.set(open)).catch(() => {});

    // ── Lobby IPC forwarding ─────────────────────────────────────────────────
    function discordUpdate(d: Record<string, unknown>) {
      (window.electron as any)?.discordUpdate?.(d);
    }

    const handlers: [string, EventListener][] = [
      ['anix:offline', (() => {
        clearRetry();
        appScreen.set('offline');
        offlineRetryTimer = window.setInterval(checkAndShow, 7000);
      }) as EventListener],

      ['lobby:proposalSentLocal', ((e: CustomEvent) => {
        window.electron?.sendProposalToPlayer?.({ type: 'waiting', newPlayback: e.detail?.newPlayback ?? null });
      }) as EventListener],

      ['lobby:proposalNew', ((e: CustomEvent) => {
        window.electron?.sendProposalToPlayer?.({ type: 'vote', proposalId: e.detail?.proposalId, proposerLogin: e.detail?.proposerLogin ?? 'Участник', playback: e.detail?.playback ?? null });
      }) as EventListener],

      ['lobby:proposalAccepted', ((e: CustomEvent) => {
        window.electron?.sendProposalToPlayer?.({ type: 'accepted', proposalId: e.detail?.proposalId, playback: e.detail?.playback ?? null });
      }) as EventListener],

      ['lobby:proposalRejected', ((e: CustomEvent) => {
        window.electron?.sendProposalToPlayer?.({ type: 'rejected', proposalId: e.detail?.proposalId, reason: e.detail?.reason ?? '' });
      }) as EventListener],

      ['lobby:voteFromPlayer', ((e: CustomEvent) => {
        const { proposalId, accept } = e.detail ?? {};
        if (proposalId) voteOnProposal(proposalId, accept === true);
      }) as EventListener],

      ['lobby:remotePlayback', ((e: CustomEvent) => {
        const raw = (e.detail as any);
        const rp = raw?.playback ?? raw;
        if (!rp) return;
        const pb = {
          releaseId: String(rp.releaseId ?? ''), sourceId: String(rp.sourceId ?? ''),
          ep: String(rp.ep ?? ''), dubberId: rp.dubberId != null ? String(rp.dubberId) : undefined,
          title: String(rp.title ?? ''), sourceName: String(rp.sourceName ?? ''),
          paused: Boolean(rp.paused), currentTime: Number(rp.currentTime) || 0,
        };
        // Always keep widget up-to-date regardless of player state
        lobbyCurrentPlayback.set(pb);
        // Only sync to player if it's already open — don't auto-open it
        if (_isPlayerOpen && window.electron?.syncPlayerState) {
          window.electron.syncPlayerState(pb);
          window.electron?.sendParticipantsToPlayer?.(getCurrentParticipants());
        }
        const parts = getCurrentParticipants();
        discordUpdate({ type: 'partyInfo', partyId: getCurrentRoomId() ?? undefined, partySize: parts.length, partyMax: Math.max(parts.length, 10), joinSecret: getCurrentRoomCode() ?? undefined });
      }) as EventListener],

      ['lobby:participantsChanged', ((e: CustomEvent) => {
        window.electron?.sendParticipantsToPlayer?.(e.detail?.participants ?? []);
        const parts = getCurrentParticipants();
        discordUpdate({ type: 'partyInfo', partyId: getCurrentRoomId() ?? undefined, partySize: parts.length, partyMax: Math.max(parts.length, 10), joinSecret: getCurrentRoomCode() ?? undefined });
      }) as EventListener],

      ['lobby:activityEvent', ((e: CustomEvent) => {
        window.electron?.sendActivityToPlayer?.(e.detail ?? {});
      }) as EventListener],

      ['lobby:playerStateChanged', ((e: CustomEvent) => {
        if (!getCurrentRoomId()) return;
        const d = e.detail as any;
        let action: 'play' | 'pause' | 'seek' | 'changeEpisode' = 'play';
        let rp: any = d;
        if (d?.playback) { rp = d.playback; if (typeof d.action === 'string') action = d.action; }
        if (!rp || typeof rp !== 'object' || !('releaseId' in rp)) return;
        if (action === 'play' || action === 'pause') action = rp.paused ? 'pause' : 'play';
        pushCommand(action, { releaseId: String(rp.releaseId ?? ''), sourceId: String(rp.sourceId ?? ''), ep: String(rp.ep ?? ''), dubberId: rp.dubberId != null ? String(rp.dubberId) : undefined, title: String(rp.title ?? ''), sourceName: String(rp.sourceName ?? ''), paused: Boolean(rp.paused), currentTime: Number(rp.currentTime) || 0 });
      }) as EventListener],

      ['lobby:left', (() => {
        window.electron?.sendParticipantsToPlayer?.([]);
        discordUpdate({ type: 'partyInfo', partyId: null });
        lobbyCurrentPlayback.set(null);
        lobbyWatchingPeerIds.set([]);
      }) as EventListener],

      ['lobby:viewerState', ((e: CustomEvent) => {
        const ids = (e.detail as { watchingPeerIds?: string[] })?.watchingPeerIds;
        lobbyWatchingPeerIds.set(Array.isArray(ids) ? ids : []);
      }) as EventListener],

      ['lobby:bufferingStartFromPlayer', (() => {
        notifyLobbyBufferingStart();
      }) as EventListener],

      ['lobby:playerSyncedFromPlayer', (() => {
        window.dispatchEvent(new CustomEvent('lobby:playerSynced'));
      }) as EventListener],

      ['lobby:playerWaitingOverlay', ((e: CustomEvent) => {
        if (_isPlayerOpen && window.electron?.sendLobbyWaitingOverlayToPlayer) {
          window.electron.sendLobbyWaitingOverlayToPlayer(e.detail ?? null);
        }
      }) as EventListener],

      ['player:windowClosed', (() => {
        isPlayerWindowOpen.set(false);
        _isPlayerOpen = false;
      }) as EventListener],

      ['anix:themeEditorSaved', ((e: CustomEvent) => {
        const { themeId } = e.detail ?? {};
        if (themeId) applyThemeById(themeId);
      }) as EventListener],

      ['anix:themeEditorLiveUpdate', ((e: CustomEvent) => {
        const v = e.detail as Record<string, string>;
        if (!v) return;
        const r = document.documentElement;
        if (v.colorBg)           r.style.setProperty('--color-bg', v.colorBg);
        if (v.colorSurface)      r.style.setProperty('--color-surface', v.colorSurface);
        if (v.colorSurfaceHover) r.style.setProperty('--color-surface-hover', v.colorSurfaceHover);
        if (v.colorBorder)       r.style.setProperty('--color-border', v.colorBorder);
        if (v.colorText)         r.style.setProperty('--color-text', v.colorText);
        if (v.colorTextMuted)    r.style.setProperty('--color-text-muted', v.colorTextMuted);
        if (v.colorAccent)       r.style.setProperty('--color-accent', v.colorAccent);
        if (v.colorAccentHover)  r.style.setProperty('--color-accent-hover', v.colorAccentHover);
        if (v.fontFamily)        r.style.setProperty('--font-sans', v.fontFamily);
      }) as EventListener],

      ['anix:themeEditorDeleted', ((e: CustomEvent) => {
        const { themeId } = e.detail ?? {};
        if (themeId && themeId === localStorage.getItem('anixapp.activeTheme')) applyThemeById('auto');
      }) as EventListener],

      ['discord:releaseView', ((e: CustomEvent) => {
        const { title, posterUrl } = e.detail ?? {};
        discordUpdate({ type: 'release', title: title ?? '', posterUrl: posterUrl ?? undefined });
        if (posterUrl) discordUpdate({ type: 'posterUrl', posterUrl });
      }) as EventListener],

      ['discord:profileView', ((e: CustomEvent) => {
        const { username, avatarUrl, isSelf } = e.detail ?? {};
        discordUpdate({ type: 'profile', username: username ?? '', avatarUrl: avatarUrl ?? undefined, isSelf: isSelf ?? false });
      }) as EventListener],

      ['discord:joinLobby', ((e: CustomEvent) => {
        const { roomCode } = e.detail ?? {};
        if (roomCode) openLobbyModal(roomCode);
      }) as EventListener],
    ];

    handlers.forEach(([evt, fn]) => window.addEventListener(evt, fn));

    const unsubPlayerView = isPlayerWindowOpen.subscribe((open) => {
      if (!getCurrentRoomId()) return;
      sendPlayerViewActive(open);
    });
    const onWsJoined = () => {
      if (!getCurrentRoomId()) return;
      sendPlayerViewActive(get(isPlayerWindowOpen));
    };
    window.addEventListener('lobby:wsJoined', onWsJoined);

    // Initial boot sequence
    window.anixApi.client.checkConnection()
      .then(async () => {
        const { hasToken } = await window.anixApi.auth.getStatus();
        window.setTimeout(() => appScreen.set(hasToken ? 'main' : 'login'), 500);
      })
      .catch(() => {
        offlineRetryTimer = window.setInterval(checkAndShow, 7000);
      });

    return () => {
      window.removeEventListener('hashchange', onNav);
      window.removeEventListener('popstate', onNav);
      handlers.forEach(([evt, fn]) => window.removeEventListener(evt, fn));
      window.removeEventListener('lobby:wsJoined', onWsJoined);
      unsubPlayerView();
      clearRetry();
    };
  });
</script>

{#if $appScreen === 'offline'}
  <OfflineScreen onRetry={checkAndShow} />

{:else if $appScreen === 'login'}
  <Login onSuccess={() => appScreen.set('main')} />

{:else}
  <Layout currentPath={path} searchQ={searchQ}>
    {#if announcementChatMatch}
      {#key announcementChatMatch[1]}
        <AnnouncementChat id={announcementChatMatch[1]} />
      {/key}
    {:else if relatedMatch}
      {#key relatedMatch[1]}
        <Related id={parseInt(relatedMatch[1], 10)} />
      {/key}
    {:else if releaseCommentRepliesMatch}
      {#key `${releaseCommentRepliesMatch[1]}-${releaseCommentRepliesMatch[2]}`}
        <ReleaseCommentReplies
          releaseId={parseInt(releaseCommentRepliesMatch[1], 10)}
          commentId={parseInt(releaseCommentRepliesMatch[2], 10)}
        />
      {/key}
    {:else if releaseCommentsMatch}
      {#key releaseCommentsMatch[1]}
        <ReleaseCommentsPage releaseId={parseInt(releaseCommentsMatch[1], 10)} />
      {/key}
    {:else if releaseMatch}
      {#key releaseMatch[1]}
        <Release id={parseInt(releaseMatch[1], 10)} />
      {/key}
    {:else if profileVotesMatch}
      {#key profileVotesMatch[1]}
        <ProfileVotes id={parseInt(profileVotesMatch[1], 10)} />
      {/key}
    {:else if profileFriendsMatch}
      {#key profileFriendsMatch[1]}
        <ProfileFriends id={parseInt(profileFriendsMatch[1], 10)} />
      {/key}
    {:else if profileMatch}
      {#key profileMatch[1]}
        <Profile id={parseInt(profileMatch[1], 10)} />
      {/key}
    {:else if collectionMatch}
      {#key collectionMatch[1]}
        <Collection id={parseInt(collectionMatch[1], 10)} />
      {/key}
    {:else if path === '/catalog'}
      <Catalog />
    {:else if path === '/bookmarks'}
      <Bookmarks />
    {:else if path === '/notifications'}
      <Notifications />
    {:else if path === '/profile'}
      <Profile />
    {:else if path === '/profile/votes'}
      <ProfileVotes />
    {:else if path === '/profile/friends'}
      <ProfileFriends />
    {:else if path === '/search'}
      <Search q={searchQ} tab={searchTab} />
    {:else if path === '/uikit'}
      <Uikit />
    {:else}
      <Home />
    {/if}
  </Layout>

  {#if $settingsModalOpen}
    <SettingsModal onClose={() => settingsModalOpen.set(false)} />
  {/if}
  {#if $lobbyModalOpen}
    <LobbyModal initialCode={$lobbyModalInitialCode ?? undefined} onClose={() => lobbyModalOpen.set(false)} />
  {/if}
  {#if $notificationsModalOpen}
    <NotificationsModal onClose={() => notificationsModalOpen.set(false)} />
  {/if}
  {#if $watchModalOpen}
    <WatchModal
      releaseId={$watchModalReleaseId}
      releaseTitle={$watchModalReleaseTitle}
      onClose={() => watchModalOpen.set(false)}
    />
  {/if}
{/if}

<Toast />
<div id="ui-tooltip-root"></div>
