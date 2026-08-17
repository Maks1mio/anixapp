<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    appScreen,
    syncAuthStatus,
    isAuthenticated,
    loginPromptOpen,
    closeLoginPrompt,
    openLoginPrompt,
    pathRequiresAuth,
    notifyAuthChanged,
  } from './stores/auth';
  import {
    setConnectionChecking,
    setConnectionOk,
    setConnectionProblem,
  } from './stores/connection';
  import { currentPath, navigate } from './stores/navigation';
  import { openLobbyModal, settingsModalOpen, lobbyModalOpen, lobbyModalInitialCode, notificationsModalOpen, watchModalOpen, watchModalReleaseId, watchModalReleaseTitle, lobbyCurrentPlayback, isPlayerWindowOpen, lobbyWatchingPeerIds } from './stores/modals';
  import { sendPlayerViewActive } from './services/lobby-ws';
  import { getPath, getSearchParams } from './router';
  import { captureActiveScroll, resetScrollAfterRouteChange } from './stores/view-state';
  import { initTabNavigation, recordTabNavigation } from './stores/tab-navigation';
  import { initTheme, applyThemeById } from './services/themes';
  import { initAnixbackEndpoint } from './services/anixback-endpoint';
  import { getCurrentRoomId, getCurrentRoomCode, getCurrentParticipants, pushCommand, voteOnProposal, notifyLobbyBufferingStart } from './services/lobby-state';
  import { initTooltipSystem } from './utils/body-tooltip';
  import { initBookmarksChangeSync } from './utils/favorites-events';
  import { stepZoom } from './utils/zoom';
  import {
    clearDiscordContext,
    scheduleDiscordPresenceSync,
  } from './services/discord-presence';
  import { openProfilePanel } from './stores/profile-panel';

  import Layout from './layout/Layout.svelte';
  import Login from './views/Login.svelte';
  import Home from './views/Home.svelte';
  import Overview from './views/Overview.svelte';
  import Popular from './views/Popular.svelte';
  import CollectionsList from './views/CollectionsList.svelte';
  import MyCollections from './views/MyCollections.svelte';
  import CollectionEditor from './views/CollectionEditor.svelte';
  import CollectionReleasePicker from './views/CollectionReleasePicker.svelte';
  import Catalog from './views/Catalog.svelte';
  import ReleaseCommentReplies from './views/ReleaseCommentReplies.svelte';
  import ReleaseCommentsPage from './views/ReleaseComments.svelte';
  import Release from './views/Release/page.svelte';
  import Related from './views/Related.svelte';
  import Bookmarks from './views/Bookmarks.svelte';
  import Profile from './views/Profile/page.svelte';
  import ProfileFriends from './views/ProfileFriends.svelte';
  import ProfileCollections from './views/ProfileCollections.svelte';
  import ProfileComments from './views/ProfileComments.svelte';
  import ProfileVideos from './views/ProfileVideos.svelte';
  import Search from './views/Search.svelte';
  import Collection from './views/Collection.svelte';
  import Notifications from './views/Notifications.svelte';
  import Uikit from './views/Uikit.svelte';
  import UikitV2 from './views/UikitV2.svelte';
  import AnnouncementChat from './views/AnnouncementChat/page.svelte';
  import AdminLoginPage from './views/Admin/LoginPage.svelte';
  import AdminPanelPage from './views/Admin/PanelPage.svelte';
  import Downloads from './views/Downloads.svelte';
  import WebPlayerShell from './components/WebPlayerShell.svelte';

  import SettingsModal from './components/SettingsModal.svelte';
  import LobbyModal from './components/LobbyModal.svelte';
  import NotificationsModal from './components/NotificationsModal.svelte';
  import WatchModal from './components/WatchModal.svelte';
  import Toast from './components/Toast.svelte';

  initTheme();

  // ── Routing state ─────────────────────────────────────────────────────────
  let path = $state(getPath());
  let searchQ = $state('');
  let searchTab = $state<'releases' | 'profiles' | 'collections'>('releases');
  let searchBy = $state(0);
  let collectionsWeek = $state(false);

  // Local reactive mirror of isPlayerWindowOpen store (used in event handlers inside onMount)
  let _isPlayerOpen = false;
  isPlayerWindowOpen.subscribe(v => { _isPlayerOpen = v; });

  let bookmarksUserId = $state<number | undefined>(undefined);

  function bookmarksUserFromRoute(route: string): number | undefined {
    const pathOnly = route.split('?')[0] || '';
    if (pathOnly !== '/bookmarks') return undefined;
    const q = route.includes('?') ? route.slice(route.indexOf('?') + 1) : '';
    const user = Number.parseInt(new URLSearchParams(q).get('user') || '', 10);
    return Number.isFinite(user) && user > 0 ? user : undefined;
  }

  function syncSearchParams(route?: string) {
    // anix:navigate приходит до pushState/hash — парсим целевой URL из detail
    const fromRoute = typeof route === 'string';
    const p = fromRoute
      ? new URLSearchParams(route.includes('?') ? route.slice(route.indexOf('?') + 1) : '')
      : getSearchParams();
    searchQ = p.get('q') || '';
    searchTab = (p.get('tab') || 'releases') as 'releases' | 'profiles' | 'collections';
    searchBy = Number.parseInt(p.get('by') || '0', 10) || 0;
    collectionsWeek = p.get('week') === '1' || p.get('sort') === '4';
    if (fromRoute) {
      bookmarksUserId = bookmarksUserFromRoute(route);
    } else {
      const user = Number.parseInt(p.get('user') || '', 10);
      bookmarksUserId = Number.isFinite(user) && user > 0 ? user : undefined;
    }
  }

  // Keep path in sync with the store (critical for HTTP mode where pushState
  // does not fire popstate, so onNav never runs after navigate())
  $effect(() => {
    const storePath = $currentPath;
    if (storePath !== path) {
      window.dispatchEvent(new CustomEvent('anix:beforeNavigate', { detail: { to: storePath } }));
      captureActiveScroll();
      path = storePath;
      syncSearchParams();
      resetScrollAfterRouteChange();
    }
  });

  $effect(() => {
    if ($appScreen !== 'main') return;
    const routePath = path;
    const week = collectionsWeek;
    const q = searchQ;
    clearDiscordContext();
    scheduleDiscordPresenceSync({
      path: routePath,
      collectionsWeek: week,
      searchQuery: q,
    });
  });

  // Гость открыл раздел, которому нужен аккаунт
  $effect(() => {
    if ($appScreen !== 'main') return;
    if ($isAuthenticated) return;
    if (!pathRequiresAuth(path)) return;
    openLoginPrompt();
    navigate('/');
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
  const profilePageId         = $derived(profileMatch?.[1] ? parseInt(profileMatch[1], 10) : undefined);
  const isProfileMainRoute    = $derived(path === '/profile' || profilePageId != null);
  const profileVotesMatch     = $derived(path.match(/^\/profile\/(\d+)\/votes$/));
  const profileFriendsMatch   = $derived(path.match(/^\/profile\/(\d+)\/friends$/));
  const profileCollectionsMatch = $derived(path.match(/^\/profile\/(\d+)\/collections$/));
  const profileListsMatch     = $derived(path.match(/^\/profile\/(\d+)\/lists$/));
  const profileCommentsMatch  = $derived(path.match(/^\/profile\/(\d+)\/comments$/));
  const profileVideosMatch    = $derived(path.match(/^\/profile\/(\d+)\/videos$/));
  const profileListsId        = $derived(profileListsMatch?.[1] ? parseInt(profileListsMatch[1], 10) : null);
  const profileVotesId        = $derived(profileVotesMatch?.[1] ? parseInt(profileVotesMatch[1], 10) : null);
  const profileFriendsId      = $derived(profileFriendsMatch?.[1] ? parseInt(profileFriendsMatch[1], 10) : null);
  const profileCollectionsId  = $derived(profileCollectionsMatch?.[1] ? parseInt(profileCollectionsMatch[1], 10) : null);
  const profileCommentsId     = $derived(profileCommentsMatch?.[1] ? parseInt(profileCommentsMatch[1], 10) : null);
  const profileVideosId       = $derived(profileVideosMatch?.[1] ? parseInt(profileVideosMatch[1], 10) : null);
  const collectionMatch       = $derived(path.match(/^\/collection\/(\d+)$/));
  const collectionEditMatch   = $derived(path.match(/^\/collections\/edit\/(\d+)$/));
  const collectionPickMatch   = $derived(path === '/collections/pick-release');
  const collectionPickReturn  = $derived(getSearchParams().get('return') || '/collections/create');
  const announcementChatMatch = $derived(path.match(/^\/announcement\/([^/]+)\/chat$/));
  const isWatchRoute = $derived(path === '/watch');

  // ── App screen state machine ───────────────────────────────────────────────
  let offlineRetryTimer: number | null = null;
  let pendingDeepLink: { type: string; id: number } | null = null;

  function clearRetry() {
    if (offlineRetryTimer !== null) { window.clearInterval(offlineRetryTimer); offlineRetryTimer = null; }
  }

  function applyDeepLink(d: { type: string; id: number }) {
    if (d.type === 'profile') openProfilePanel(d.id);
    else if (d.type === 'release') navigate(`/release/${d.id}`);
    else if (d.type === 'collection') navigate(`/collection/${d.id}`);
  }

  async function checkAndShow() {
    if (!window.anixApi) return;
    setConnectionChecking();
    try {
      await window.anixApi.client.checkConnection();
      const ok = await syncAuthStatus();
      clearRetry();
      setConnectionOk();
      notifyAuthChanged();
      appScreen.set('main');
      if (!ok) openLoginPrompt();
    } catch {
      setConnectionProblem();
    }
  }

  async function onLoginSuccess() {
    await syncAuthStatus();
    closeLoginPrompt();
    notifyAuthChanged();
  }

  function dismissLoginPrompt() {
    closeLoginPrompt();
    if (pathRequiresAuth(path)) navigate('/');
  }

  onMount(() => {
    initTooltipSystem();
    const stopBookmarksSync = initBookmarksChangeSync();
    void initAnixbackEndpoint();

    if (!window.anixApi) {
      appScreen.set('login');
      return () => stopBookmarksSync();
    }

    // Routing listeners
    const onNav = () => {
      window.dispatchEvent(new CustomEvent('anix:beforeNavigate', { detail: { to: getPath() } }));
      captureActiveScroll();
      path = getPath();
      recordTabNavigation(path);
      currentPath.set(path);
      syncSearchParams();
      resetScrollAfterRouteChange();
    };
    const onAnixNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const to = typeof detail === 'string'
        ? detail
        : (detail && typeof detail === 'object' && 'to' in detail
          ? String((detail as { to: unknown }).to ?? '')
          : '');
      syncSearchParams(to || undefined);
    };
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);
    window.addEventListener('anix:navigate', onAnixNavigate);
    initTabNavigation(getPath());
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
        setConnectionProblem();
        appScreen.set('main');
        if (offlineRetryTimer === null) {
          offlineRetryTimer = window.setInterval(checkAndShow, 7000);
        }
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

      ['anix:deepLink', ((e: CustomEvent) => {
        window.electron?.consumePendingDeepLink?.();
        const d = e.detail as { type?: string; id?: number } | null;
        const id = Number(d?.id);
        if (!d?.type || !Number.isFinite(id) || id <= 0) return;
        const payload = { type: d.type, id };
        if (get(appScreen) !== 'main') {
          pendingDeepLink = payload;
          return;
        }
        applyDeepLink(payload);
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
        if (v.colorBg) {
          const hex = v.colorBg.replace('#', '').slice(0, 6);
          const lum = hex.length >= 6
            ? (0.299 * parseInt(hex.slice(0, 2), 16) + 0.587 * parseInt(hex.slice(2, 4), 16) + 0.114 * parseInt(hex.slice(4, 6), 16)) / 255
            : 0;
          r.dataset.themeMode = lum > 0.55 ? 'light' : 'dark';
          r.style.colorScheme = lum > 0.55 ? 'light' : 'dark';
        }
      }) as EventListener],

      ['anix:themeEditorDeleted', ((e: CustomEvent) => {
        const { themeId } = e.detail ?? {};
        if (themeId && themeId === localStorage.getItem('anixapp.activeTheme')) applyThemeById('auto');
      }) as EventListener],

      ['discord:joinLobby', ((e: CustomEvent) => {
        const { roomCode } = e.detail ?? {};
        if (roomCode) openLobbyModal(roomCode);
      }) as EventListener],
    ];

    handlers.forEach(([evt, fn]) => window.addEventListener(evt, fn));

    // Deep link could arrive before listeners are attached (cold start).
    const earlyDeepLink = window.electron?.consumePendingDeepLink?.();
    if (earlyDeepLink) {
      window.dispatchEvent(new CustomEvent('anix:deepLink', { detail: earlyDeepLink }));
    }

    const unsubAppScreen = appScreen.subscribe((screen) => {
      if (screen !== 'main' || !pendingDeepLink) return;
      const next = pendingDeepLink;
      pendingDeepLink = null;
      applyDeepLink(next);
    });

    const unsubPlayerView = isPlayerWindowOpen.subscribe((open) => {
      if (!getCurrentRoomId()) return;
      sendPlayerViewActive(open);
    });
    const onWsJoined = () => {
      if (!getCurrentRoomId()) return;
      sendPlayerViewActive(get(isPlayerWindowOpen));
    };
    window.addEventListener('lobby:wsJoined', onWsJoined);

    async function adjustUiZoom(direction: 1 | -1) {
      if (!window.electron?.getSettings || !window.electron?.saveSettings) return;
      const settings = await window.electron.getSettings();
      const next = stepZoom(settings.uiZoom ?? 100, direction);
      await window.electron.saveSettings({ uiZoom: next });
      window.dispatchEvent(new CustomEvent('anix:uiZoomChanged', { detail: { uiZoom: next } }));
    }

    function handleZoomKeydown(e: KeyboardEvent) {
      if (!e.ctrlKey || !window.electron?.saveSettings) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      if (e.key === '=' || e.key === '+' || e.code === 'Equal') {
        e.preventDefault();
        void adjustUiZoom(1);
      } else if (e.key === '-' || e.code === 'Minus') {
        e.preventDefault();
        void adjustUiZoom(-1);
      }
    }

    window.addEventListener('keydown', handleZoomKeydown);

    // Initial boot — UI сразу main, проблемы сети только баннером
    setConnectionChecking();
    window.anixApi.client.checkConnection()
      .then(async () => {
        const ok = await syncAuthStatus();
        setConnectionOk();
        notifyAuthChanged();
        window.setTimeout(() => {
          appScreen.set('main');
          if (!ok) openLoginPrompt();
        }, 500);
      })
      .catch(() => {
        setConnectionProblem();
        appScreen.set('main');
        if (offlineRetryTimer === null) {
          offlineRetryTimer = window.setInterval(checkAndShow, 7000);
        }
      });

    const onBrowserOffline = () => setConnectionProblem();
    const onBrowserOnline = () => {
      setConnectionChecking();
      void checkAndShow();
    };
    window.addEventListener('offline', onBrowserOffline);
    window.addEventListener('online', onBrowserOnline);

    return () => {
      window.removeEventListener('hashchange', onNav);
      window.removeEventListener('popstate', onNav);
      window.removeEventListener('anix:navigate', onAnixNavigate);
      handlers.forEach(([evt, fn]) => window.removeEventListener(evt, fn));
      window.removeEventListener('lobby:wsJoined', onWsJoined);
      window.removeEventListener('keydown', handleZoomKeydown);
      window.removeEventListener('offline', onBrowserOffline);
      window.removeEventListener('online', onBrowserOnline);
      unsubAppScreen();
      unsubPlayerView();
      clearRetry();
      stopBookmarksSync();
    };
  });
</script>

{#if $appScreen === 'login'}
  <!-- Нет anixApi (браузер без моста) -->
  <Login
    onSuccess={() => { void onLoginSuccess(); appScreen.set('main'); }}
    allowGuest
    onDismiss={() => appScreen.set('main')}
    onConnectionRetry={checkAndShow}
  />
  {#if $settingsModalOpen}
    <SettingsModal onClose={() => settingsModalOpen.set(false)} />
  {/if}

{:else if isWatchRoute}
  <WebPlayerShell />

{:else}
  <Layout currentPath={path} onConnectionRetry={checkAndShow}>
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
    {:else if profileListsId != null}
      {#key profileListsId}
        <Bookmarks id={profileListsId} />
      {/key}
    {:else if profileCommentsId != null}
      {#key profileCommentsId}
        <ProfileComments id={profileCommentsId} />
      {/key}
    {:else if profileVideosId != null}
      {#key profileVideosId}
        <ProfileVideos id={profileVideosId} />
      {/key}
    {:else if profileVotesId != null}
      {#key profileVotesId}
        <Bookmarks id={profileVotesId} initialTab="votes" />
      {/key}
    {:else if profileFriendsId != null}
      {#key profileFriendsId}
        <ProfileFriends id={profileFriendsId} />
      {/key}
    {:else if profileCollectionsId != null}
      {#key profileCollectionsId}
        <ProfileCollections id={profileCollectionsId} />
      {/key}
    {:else if isProfileMainRoute}
      {#key path}
        <Profile id={profilePageId} />
      {/key}
    {:else if collectionEditMatch}
      {#key collectionEditMatch[1]}
        <CollectionEditor editId={parseInt(collectionEditMatch[1], 10)} />
      {/key}
    {:else if path === '/collections/create'}
      <CollectionEditor />
    {:else if collectionPickMatch}
      <CollectionReleasePicker returnPath={collectionPickReturn} />
    {:else if path === '/collections/my'}
      <MyCollections />
    {:else if collectionMatch}
      {#key collectionMatch[1]}
        <Collection id={parseInt(collectionMatch[1], 10)} />
      {/key}
    {:else if path === '/admin/panel'}
      <AdminPanelPage />
    {:else if path === '/admin'}
      <AdminLoginPage />
    {:else if path === '/overview'}
      <Overview />
    {:else if path === '/overview/popular'}
      <Popular />
    {:else if path === '/schedule'}
      <Overview />
    {:else if path === '/collections'}
      <CollectionsList week={collectionsWeek} />
    {:else if path === '/catalog'}
      <Catalog />
    {:else if path === '/bookmarks'}
      {#key bookmarksUserId ?? 'self'}
        <Bookmarks id={bookmarksUserId} />
      {/key}
    {:else if path === '/notifications'}
      <Notifications />
    {:else if path === '/profile/votes'}
      <Bookmarks initialTab="votes" />
    {:else if path === '/profile/friends'}
      <ProfileFriends />
    {:else if path === '/profile/collections'}
      <ProfileCollections />
    {:else if path === '/profile/lists'}
      <Bookmarks listsOnly />
    {:else if path === '/profile/comments'}
      <ProfileComments />
    {:else if path === '/profile/videos'}
      <ProfileVideos />
    {:else if path === '/search'}
      <Search q={searchQ} tab={searchTab} {searchBy} />
    {:else if path === '/downloads'}
      <Downloads />
    {:else if path === '/uikit'}
      <Uikit />
    {:else if path === '/uikit-v2'}
      <UikitV2 />
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
  {#if $loginPromptOpen}
    <Login
      overlay
      allowGuest
      onSuccess={() => void onLoginSuccess()}
      onDismiss={dismissLoginPrompt}
      onConnectionRetry={checkAndShow}
    />
  {/if}
{/if}

<Toast />
<div id="ui-tooltip-root" aria-hidden="true"></div>
