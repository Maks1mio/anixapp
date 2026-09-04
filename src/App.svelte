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
  import { getCurrentRoomId, getCurrentRoomCode, getCurrentParticipants, pushCommand, voteOnProposal, notifyLobbyBufferingStart, notifyLobbyBufferingEnd, catchUpLobbyPlayback, sendLobbyChat, notifyFluoPlayerSynced, kickLobbyParticipant, transferLobbyHost, pushLobbyPreview } from './services/lobby-state';
  import {
    createLobbyRoomAndOpenPlayer,
    joinLobbyRoomAndOpenPlayer,
    leaveLobbyRoomFromUi,
    getLobbyProfile,
    pushLobbySessionToPlayer,
  } from './utils/lobby-player';
  import { initTooltipSystem } from './utils/body-tooltip';
  import { initBookmarksChangeSync } from './utils/favorites-events';
  import { stepZoom } from './utils/zoom';
  import {
    clearDiscordContext,
    scheduleDiscordPresenceSync,
  } from './services/discord-presence';
  import { openProfilePanel } from './stores/profile-panel';

  import Layout from './layout/Layout.svelte';
  import TvLayout from './layout/TvLayout.svelte';
  import { isTvMode } from './platform/tv';
  import Login from './views/Login.svelte';
  import Home from './views/Home.svelte';
  import Overview from './views/Overview.svelte';
  import FluoPage from './views/Fluo/page.svelte';
  import Feed from './views/Feed.svelte';
  import Article from './views/Article.svelte';
  import Channel from './views/Channel.svelte';
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
  import HomeTv from './views/Home.tv.svelte';
  import HomeCategoryTv from './views/HomeCategory.tv.svelte';
  import OverviewTv from './views/Overview.tv.svelte';
  import FeedTv from './views/Feed.tv.svelte';
  import PopularTv from './views/Popular.tv.svelte';
  import BookmarksTv from './views/Bookmarks.tv.svelte';
  import SearchTv from './views/Search.tv.svelte';
  import ReleaseTv from './views/Release.tv.svelte';
  import TvFallback from './views/TvFallback.svelte';
  import TvKeepAlive from './components/tv/TvKeepAlive.svelte';
  import TvPlayerShell from './components/tv/TvPlayerShell.svelte';
  import { rememberTvKeepAlive, tvKeepAliveKey, tvKeptCategoryIds, tvKeptReleaseIds } from './tv/keepAlive';
  import WebPlayerShell from './components/WebPlayerShell.svelte';
  import { isEmbeddedWebPlayer } from './utils/watch-nav';

  import SettingsModal from './components/SettingsModal.svelte';
  import LobbyModal from './components/LobbyModal.svelte';
  import NotificationsModal from './components/NotificationsModal.svelte';
  import WatchModal from './components/WatchModal.svelte';
  import Toast from './components/Toast.svelte';
  import TvDebugMetrics from './components/tv/TvDebugMetrics.svelte';

  initTheme();

  // ── Routing state ─────────────────────────────────────────────────────────
  let path = $state(getPath());
  let searchQ = $state('');
  let searchTab = $state<'releases' | 'profiles' | 'collections'>('releases');
  let searchBy = $state(0);
  let collectionsWeek = $state(false);

  let tvKept = $state<string[]>(rememberTvKeepAlive([], getPath()));
  const tvKeptCats = $derived(tvKeptCategoryIds(tvKept));
  const tvKeptReleases = $derived(tvKeptReleaseIds(tvKept));
  const tvKeepKey = $derived(tvKeepAliveKey(path));

  $effect(() => {
    const next = rememberTvKeepAlive(tvKept, path);
    if (next !== tvKept) tvKept = next;
  });

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
  const articleMatch          = $derived(path.match(/^\/article\/(\d+)$/));
  const channelMatch          = $derived(path.match(/^\/channel\/(\d+)$/));
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
      let hasToken = false;
      let authKnown = false;
      try {
        const status = await window.anixApi.auth.getStatus();
        hasToken = !!status?.hasToken;
        isAuthenticated.set(hasToken);
        authKnown = true;
      } catch {
        // Аккаунт не удалось определить — не открываем логин
        authKnown = false;
      }
      clearRetry();
      setConnectionOk();
      notifyAuthChanged();
      appScreen.set('main');
      // Логин только если точно нет токена, не при сбое определения сессии
      if (authKnown && !hasToken) openLoginPrompt();
    } catch {
      setConnectionProblem();
      // Плохое соединение — без окна входа; сессию читаем локально
      try {
        const status = await window.anixApi.auth.getStatus();
        isAuthenticated.set(!!status?.hasToken);
        if (status?.hasToken) notifyAuthChanged();
      } catch {
        /* ignore */
      }
    }
  }

  async function onLoginSuccess() {
    await syncAuthStatus();
    closeLoginPrompt();
    const { applyAccountSessionChange } = await import('./stores/auth');
    await applyAccountSessionChange();
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
      window.dispatchEvent(new CustomEvent('anix:navigate', { detail: path }));
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

    /** Последний proposal для плеера — повторно шлём, если окно открылось после события. */
    let lastProposalPlayerPayload: Record<string, unknown> | null = null;
    /** История чата для плеера при join mid-room */
    let lastChatHistoryForPlayer: unknown[] | null = null;

    function forwardProposalToPlayer(payload: Record<string, unknown>) {
      const t = String(payload.type ?? '');
      if (t === 'vote' || t === 'waiting') {
        lastProposalPlayerPayload = payload;
      } else if (t === 'accepted' || t === 'rejected') {
        lastProposalPlayerPayload = null;
      }
      window.electron?.sendProposalToPlayer?.(payload);
      if (!window.electron) window.dispatchEvent(new CustomEvent('lobby:proposal', { detail: payload }));
    }

    function flushPendingProposalToPlayer() {
      if (!lastProposalPlayerPayload) return;
      window.electron?.sendProposalToPlayer?.(lastProposalPlayerPayload);
      if (!window.electron) {
        window.dispatchEvent(new CustomEvent('lobby:proposal', { detail: lastProposalPlayerPayload }));
      }
    }

    function flushChatHistoryToPlayer() {
      if (!lastChatHistoryForPlayer?.length) return;
      window.electron?.sendLobbyChatHistoryToPlayer?.(lastChatHistoryForPlayer);
      if (!window.electron) {
        window.dispatchEvent(new CustomEvent('lobby:chatHistory', {
          detail: { messages: lastChatHistoryForPlayer },
        }));
      }
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
        forwardProposalToPlayer({ type: 'waiting', newPlayback: e.detail?.newPlayback ?? null });
      }) as EventListener],

      ['lobby:proposalNew', ((e: CustomEvent) => {
        forwardProposalToPlayer({
          type: 'vote',
          proposalId: e.detail?.proposalId,
          proposerLogin: e.detail?.proposerLogin ?? 'Участник',
          playback: e.detail?.playback ?? null,
          expiresAt: typeof e.detail?.expiresAt === 'number' ? e.detail.expiresAt : undefined,
        });
      }) as EventListener],

      ['lobby:proposalAccepted', ((e: CustomEvent) => {
        forwardProposalToPlayer({
          type: 'accepted',
          proposalId: e.detail?.proposalId,
          playback: e.detail?.playback ?? null,
        });
      }) as EventListener],

      ['lobby:proposalRejected', ((e: CustomEvent) => {
        forwardProposalToPlayer({
          type: 'rejected',
          proposalId: e.detail?.proposalId,
          reason: e.detail?.reason ?? '',
        });
      }) as EventListener],

      ['lobby:voteFromPlayer', ((e: CustomEvent) => {
        const { proposalId, accept } = e.detail ?? {};
        if (proposalId) voteOnProposal(proposalId, accept === true);
      }) as EventListener],

      ['lobby:remotePlayback', ((e: CustomEvent) => {
        const raw = (e.detail as any);
        const rp = raw?.playback ?? raw;
        if (!rp) return;
        const action = raw?.action != null ? String(raw.action) : null;
        const pb = {
          releaseId: String(rp.releaseId ?? ''), sourceId: String(rp.sourceId ?? ''),
          ep: String(rp.ep ?? ''), dubberId: rp.dubberId != null ? String(rp.dubberId) : undefined,
          title: String(rp.title ?? ''), sourceName: String(rp.sourceName ?? ''),
          paused: Boolean(rp.paused), currentTime: Number(rp.currentTime) || 0,
          ...(action ? { action } : {}),
        };
        lobbyCurrentPlayback.set(pb);
        if (window.electron?.syncPlayerState) {
          window.electron.syncPlayerState(pb);
          window.electron?.sendParticipantsToPlayer?.(getCurrentParticipants());
        } else if (isEmbeddedWebPlayer()) {
          window.dispatchEvent(new CustomEvent('player:applySync', { detail: pb }));
        }
        // partyInfo — только при смене участников, не на каждый snapshot
      }) as EventListener],

      ['lobby:participantsChanged', ((e: CustomEvent) => {
        const detail = e.detail as { participants?: unknown[]; hostPeerId?: string | null } | null;
        window.electron?.sendParticipantsToPlayer?.(detail?.participants ?? []);
        if (!window.electron) {
          window.dispatchEvent(new CustomEvent('lobby:participantsList', { detail }));
        }
        pushLobbySessionToPlayer();
        const parts = getCurrentParticipants();
        discordUpdate({ type: 'partyInfo', partyId: getCurrentRoomId() ?? undefined, partySize: parts.length, partyMax: Math.max(parts.length, 10), joinSecret: getCurrentRoomCode() ?? undefined });
      }) as EventListener],

      ['lobby:chat', ((e: CustomEvent) => {
        const msg = e.detail;
        if (msg && window.electron?.sendLobbyChatToPlayer) {
          window.electron.sendLobbyChatToPlayer(msg);
        }
      }) as EventListener],

      ['lobby:chatHistory', ((e: CustomEvent) => {
        const messages = Array.isArray(e.detail?.messages) ? e.detail.messages : [];
        lastChatHistoryForPlayer = messages;
        if (window.electron?.sendLobbyChatHistoryToPlayer) {
          window.electron.sendLobbyChatHistoryToPlayer(messages);
        }
      }) as EventListener],

      ['lobby:createFromPlayer', ((e: CustomEvent) => {
        const seed = e.detail && typeof e.detail === 'object' ? e.detail : null;
        void createLobbyRoomAndOpenPlayer(seed).catch(() => {
          window.electron?.sendLobbyChooserErrorToPlayer?.('Не удалось создать комнату. Попробуйте ещё раз.');
        });
      }) as EventListener],

      ['lobby:joinFromPlayer', ((e: CustomEvent) => {
        const code = String(e.detail ?? '').trim();
        if (!code) {
          window.electron?.sendLobbyChooserErrorToPlayer?.('Введите код комнаты');
          return;
        }
  void joinLobbyRoomAndOpenPlayer(code).catch((err: unknown) => {
          const banned = err && typeof err === 'object' && (err as { code?: string }).code === 'banned';
          window.electron?.sendLobbyChooserErrorToPlayer?.(
            banned
              ? 'Вас выгнали из этой комнаты — повторный вход недоступен'
              : 'Неверный код или комната не найдена',
          );
        });
      }) as EventListener],

      ['lobby:leaveFromPlayer', (() => {
        void leaveLobbyRoomFromUi();
      }) as EventListener],

      ['lobby:chatFromPlayer', ((e: CustomEvent) => {
        const text = String(e.detail ?? '');
        const profile = getLobbyProfile();
        sendLobbyChat({ text, login: profile.login, avatar: profile.avatar });
      }) as EventListener],

      ['lobby:kickFromPlayer', ((e: CustomEvent) => {
        const peerId = String((e.detail as { peerId?: string } | null)?.peerId ?? '');
        if (peerId) kickLobbyParticipant(peerId);
      }) as EventListener],

      ['lobby:transferHostFromPlayer', ((e: CustomEvent) => {
        const peerId = String((e.detail as { peerId?: string } | null)?.peerId ?? '');
        if (peerId) transferLobbyHost(peerId);
      }) as EventListener],

      ['lobby:kicked', (() => {
        pushLobbySessionToPlayer();
        window.electron?.sendLobbyChooserErrorToPlayer?.('Вас выгнали из комнаты');
      }) as EventListener],

      ['lobby:requestSession', (() => {
        pushLobbySessionToPlayer();
        flushPendingProposalToPlayer();
        flushChatHistoryToPlayer();
      }) as EventListener],

      ['lobby:activityEvent', ((e: CustomEvent) => {
        window.electron?.sendActivityToPlayer?.(e.detail ?? {});
        if (!window.electron) {
          window.dispatchEvent(new CustomEvent('lobby:activityFeed', { detail: e.detail ?? {} }));
        }
      }) as EventListener],

      ['lobby:playerStateChanged', ((e: CustomEvent) => {
        if (!getCurrentRoomId()) return;
        const d = e.detail as any;
        // Presence-only (loadedmetadata и т.п.) приходит без action — нельзя трогать часы комнаты,
        // иначе rejoiner с currentTime≈0 откатывает серию в начало у всех.
        if (!d || typeof d !== 'object' || typeof d.action !== 'string') return;
        const action = d.action as 'play' | 'pause' | 'seek' | 'changeEpisode';
        if (!['play', 'pause', 'seek', 'changeEpisode'].includes(action)) return;
        const rp = d.playback && typeof d.playback === 'object' ? d.playback : null;
        if (!rp || !('releaseId' in rp)) return;
        const playback = {
          releaseId: String(rp.releaseId ?? ''),
          sourceId: String(rp.sourceId ?? ''),
          ep: String(rp.ep ?? ''),
          dubberId: rp.dubberId != null ? String(rp.dubberId) : undefined,
          title: String(rp.title ?? ''),
          sourceName: String(rp.sourceName ?? ''),
          dubberName: typeof rp.dubberName === 'string' ? rp.dubberName : undefined,
          posterUrl: typeof rp.posterUrl === 'string' ? rp.posterUrl : undefined,
          paused: action === 'pause' ? true : action === 'play' ? false : Boolean(rp.paused),
          currentTime: typeof rp.currentTime === 'number' && Number.isFinite(rp.currentTime)
            ? rp.currentTime
            : 0,
          duration: typeof rp.duration === 'number' && Number.isFinite(rp.duration) && rp.duration > 0
            ? rp.duration
            : undefined,
        };
        pushCommand(action, playback);
      }) as EventListener],

      ['lobby:left', (() => {
        lastProposalPlayerPayload = null;
        lastChatHistoryForPlayer = null;
        window.electron?.sendParticipantsToPlayer?.([]);
        pushLobbySessionToPlayer();
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

      ['lobby:requestCatchUpFromPlayer', (() => {
        // После смены качества клиент на savedTime — догоняем живые часы комнаты.
        notifyLobbyBufferingEnd();
        catchUpLobbyPlayback();
        window.setTimeout(() => catchUpLobbyPlayback(), 450);
        window.setTimeout(() => catchUpLobbyPlayback(), 1100);
      }) as EventListener],

      ['lobby:playerSyncedFromPlayer', ((e: CustomEvent) => {
        const ct = (e.detail as { currentTime?: number } | null)?.currentTime;
        notifyFluoPlayerSynced(typeof ct === 'number' ? ct : undefined);
      }) as EventListener],

      ['fluo:previewFromPlayer', ((e: CustomEvent) => {
        if (!getCurrentRoomId()) return;
        const d = e.detail as { dataUrl?: string; duration?: number } | null;
        if (!d?.dataUrl) return;
        pushLobbyPreview(d.dataUrl, d.duration);
      }) as EventListener],

      ['lobby:barrierSync', ((e: CustomEvent) => {
        // fluo.sync на main → окно плеера (иначе смена серии не доходит)
        window.electron?.sendLobbyBarrierSyncToPlayer?.(e.detail ?? null);
      }) as EventListener],

      ['lobby:syncPause', ((e: CustomEvent) => {
        const detail = (e.detail ?? {}) as {
          waitingLogin?: string;
          waitingAvatar?: string | null;
          reason?: string;
        };
        if (window.electron?.sendLobbyWaitingOverlayToPlayer) {
          window.electron.sendLobbyWaitingOverlayToPlayer(
            detail.waitingLogin
              ? { mode: 'peer', login: detail.waitingLogin, avatar: detail.waitingAvatar ?? null }
              : { mode: 'localBuffering', label: 'Синхронизация…' },
          );
        }
      }) as EventListener],

      ['lobby:syncResume', (() => {
        window.electron?.sendLobbySyncResumeToPlayer?.();
        window.electron?.sendLobbyWaitingOverlayToPlayer?.(null);
      }) as EventListener],

      ['lobby:playerWaitingOverlay', ((e: CustomEvent) => {
        if (window.electron?.sendLobbyWaitingOverlayToPlayer) {
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
      if (open) {
        flushPendingProposalToPlayer();
        flushChatHistoryToPlayer();
      }
    });
    const onWsJoined = () => {
      if (!getCurrentRoomId()) return;
      sendPlayerViewActive(get(isPlayerWindowOpen));
      // Плеер мог открыться чуть позже WS joined — докинем активное голосование / чат
      window.setTimeout(() => {
        flushPendingProposalToPlayer();
        flushChatHistoryToPlayer();
      }, 400);
      window.setTimeout(() => {
        flushPendingProposalToPlayer();
        flushChatHistoryToPlayer();
      }, 1200);
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
        let hasToken = false;
        let authKnown = false;
        try {
          const status = await window.anixApi!.auth.getStatus();
          hasToken = !!status?.hasToken;
          isAuthenticated.set(hasToken);
          authKnown = true;
        } catch {
          authKnown = false;
        }
        setConnectionOk();
        notifyAuthChanged();
        window.setTimeout(() => {
          appScreen.set('main');
          if (authKnown && !hasToken) openLoginPrompt();
        }, 500);
      })
      .catch(async () => {
        setConnectionProblem();
        appScreen.set('main');
        // Плохое соединение — не показываем окно входа, сессию читаем локально
        try {
          const status = await window.anixApi!.auth.getStatus();
          isAuthenticated.set(!!status?.hasToken);
          if (status?.hasToken) notifyAuthChanged();
        } catch {
          /* ignore */
        }
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

{#snippet tvRoutes()}
  <div class="tv-route-stack">
    {#if tvKept.includes('home')}
      <TvKeepAlive keepKey="home" active={path === '/'}>
        <HomeTv />
      </TvKeepAlive>
    {/if}

    {#each tvKeptCats as tabId (tabId)}
      <TvKeepAlive keepKey={`home-cat:${tabId}`} active={path === `/home/${tabId}`}>
        <HomeCategoryTv {tabId} />
      </TvKeepAlive>
    {/each}

    {#if tvKept.includes('overview')}
      <TvKeepAlive keepKey="overview" active={path === '/overview' || path === '/schedule'}>
        <OverviewTv />
      </TvKeepAlive>
    {/if}

    {#if tvKept.includes('feed')}
      <TvKeepAlive keepKey="feed" active={path === '/feed'}>
        <FeedTv />
      </TvKeepAlive>
    {/if}

    {#if tvKept.includes('popular')}
      <TvKeepAlive keepKey="popular" active={path === '/overview/popular'}>
        <PopularTv />
      </TvKeepAlive>
    {/if}

    {#if tvKept.includes('bookmarks')}
      <TvKeepAlive keepKey="bookmarks" active={path === '/bookmarks'}>
        <BookmarksTv />
      </TvKeepAlive>
    {/if}

    {#if tvKept.includes('search')}
      <TvKeepAlive keepKey="search" active={path === '/search'}>
        <SearchTv />
      </TvKeepAlive>
    {/if}

    {#if isWatchRoute}
      <TvKeepAlive keepKey="watch" active>
        <TvPlayerShell />
      </TvKeepAlive>
    {/if}

    {#each tvKeptReleases as rid (rid)}
      <TvKeepAlive keepKey={`release:${rid}`} active={releaseMatch?.[1] === rid && !isWatchRoute}>
        <ReleaseTv id={parseInt(rid, 10)} />
      </TvKeepAlive>
    {/each}

    {#if releaseMatch && !tvKeptReleases.includes(releaseMatch[1])}
      <TvKeepAlive keepKey={`release:${releaseMatch[1]}`} active={!isWatchRoute}>
        {#key releaseMatch[1]}
          <ReleaseTv id={parseInt(releaseMatch[1], 10)} />
        {/key}
      </TvKeepAlive>
    {:else if !tvKeepKey && !isWatchRoute && !releaseMatch}
      <TvKeepAlive active>
        <TvFallback {path} />
      </TvKeepAlive>
    {/if}
  </div>
{/snippet}

{#snippet appRoutes()}
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
    {:else if path === '/fluo'}
      <FluoPage />
    {:else if path === '/feed'}
      <Feed />
    {:else if articleMatch}
      {#key articleMatch[1]}
        <Article id={parseInt(articleMatch[1], 10)} />
      {/key}
    {:else if channelMatch}
      {#key channelMatch[1]}
        <Channel id={parseInt(channelMatch[1], 10)} />
      {/key}
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
{/snippet}

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

{:else if isWatchRoute && !isTvMode()}
  <WebPlayerShell />

{:else}
  {#if isTvMode()}
    <TvLayout currentPath={path} immersive={isWatchRoute}>
      {@render tvRoutes()}
    </TvLayout>
  {:else}
    <Layout currentPath={path} onConnectionRetry={checkAndShow}>
      {@render appRoutes()}
    </Layout>
  {/if}

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
{#if isTvMode()}
  <TvDebugMetrics />
{/if}
