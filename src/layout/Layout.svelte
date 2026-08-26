<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';
  import { navigate, navigateSearchTab, navigateSidebarTab } from '../stores/navigation';
  import { activeSidebarTab, isSidebarTabActive } from '../stores/tab-navigation';
  import { openAdminArea, restoreAdminSession, checkTeamMembership, isTeamMember } from '../stores/admin';
  import { openLobbyModal, openNotificationsModal, openSettingsModal } from '../stores/modals';
  import { isAuthenticated, requireAuth } from '../stores/auth';
  import { ensureProfileId } from '../utils/profile';
  import { bindSearchHotkeys } from '../search-controller';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import { iconHome, iconBookmark, iconCompass, iconFlame, iconLayoutGrid, iconDownload, iconNewspaper } from '../components/icons';
  import { downloads, activeDownloadsCount, downloadsOverallProgress } from '../stores/downloads';

  import TitleBar from '../components/TitleBar.svelte';
  import LobbyNowWatching from '../components/LobbyNowWatching.svelte';
  import SidebarSchedulePanel from '../components/SidebarSchedulePanel.svelte';
  import SidebarProfilePanel from '../components/SidebarProfilePanel.svelte';
  import SidebarPins from '../components/SidebarPins.svelte';
  import Page from '../components/Page.svelte';
  import UiV2Tooltip from '../components/uikit-v2/UiV2Tooltip.svelte';
  import { initSidebarPins } from '../stores/sidebar-pins';
  import {
    profilePanelOpen,
    profilePanelUserId,
    resetProfilePanelHistory,
    toggleProfilePanel,
  } from '../stores/profile-panel';

  interface Props {
    children?: Snippet;
    currentPath?: string;
    onConnectionRetry?: () => void | Promise<void>;
  }

  let { children, currentPath = '/', onConnectionRetry }: Props = $props();

  const SIDEBAR_NAV = [
    { href: '/', label: 'Главная', icon: iconHome(18) },
    { href: '/overview', label: 'Обзор', icon: iconCompass(18) },
    { href: '/feed', label: 'Лента', icon: iconNewspaper(18) },
    { href: '/overview/popular', label: 'Популярное', icon: iconFlame(18) },
    { href: '/collections', label: 'Коллекции', icon: iconLayoutGrid(18) },
    { href: '/bookmarks', label: 'Закладки', icon: iconBookmark(18) },
    { href: '/downloads', label: 'Загрузки', icon: iconDownload(18) },
  ];

  const downloadsBadge = $derived($activeDownloadsCount);
  const dlProgress = $derived($downloadsOverallProgress);
  const showDlProgress = $derived(dlProgress > 0 && downloadsBadge > 0);
  const dlRingOffset = $derived(100 - dlProgress);

  onMount(() => {
    const cleanupDl = downloads.init();
    const cleanupPins = initSidebarPins();
    return () => {
      cleanupDl?.();
      cleanupPins();
    };
  });

  const SCHEDULE_ANIM_MS = 340;

  /** Панель в DOM (для outro-анимации) */
  let scheduleVisible = $state(false);
  /** Визуально открыта (CSS-класс --open) */
  let scheduleActive = $state(false);
  let scheduleCloseTimer: ReturnType<typeof setTimeout> | null = null;

  let profileVisible = $state(false);
  let profileActive = $state(false);
  let profileCloseTimer: ReturnType<typeof setTimeout> | null = null;
  let panelUserId = $state<number | null>(null);
  /** После анимации закрытия профиля открыть расписание */
  let openScheduleAfterProfileClose = $state(false);
  /** После анимации закрытия расписания открыть профиль */
  let openProfileAfterScheduleClose = $state<number | null>(null);

  function clearScheduleCloseTimer() {
    if (scheduleCloseTimer != null) {
      clearTimeout(scheduleCloseTimer);
      scheduleCloseTimer = null;
    }
  }

  function clearProfileCloseTimer() {
    if (profileCloseTimer != null) {
      clearTimeout(profileCloseTimer);
      profileCloseTimer = null;
    }
  }

  function finishScheduleClose() {
    if (!scheduleActive) scheduleVisible = false;
    clearScheduleCloseTimer();
    const pendingId = openProfileAfterScheduleClose;
    if (pendingId != null) {
      openProfileAfterScheduleClose = null;
      actuallyOpenProfile(pendingId);
    }
  }

  function finishProfileClose() {
    if (!profileActive) {
      profileVisible = false;
      panelUserId = null;
      profilePanelUserId.set(null);
      resetProfilePanelHistory();
    }
    clearProfileCloseTimer();
    if (openScheduleAfterProfileClose) {
      openScheduleAfterProfileClose = false;
      actuallyOpenSchedule();
    }
  }

  function actuallyOpenSchedule() {
    if (scheduleVisible && scheduleActive) return;
    clearScheduleCloseTimer();
    scheduleVisible = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scheduleActive = true;
      });
    });
  }

  function openSchedule() {
    if (profileVisible) {
      // Сначала анимация закрытия профиля, потом расписание
      openScheduleAfterProfileClose = true;
      openProfileAfterScheduleClose = null;
      closeProfile(false);
      return;
    }
    actuallyOpenSchedule();
  }

  function closeSchedule(immediate = false) {
    if (!scheduleVisible) return;
    scheduleActive = false;
    clearScheduleCloseTimer();
    if (immediate) {
      scheduleVisible = false;
      const pendingId = openProfileAfterScheduleClose;
      if (pendingId != null) {
        openProfileAfterScheduleClose = null;
        actuallyOpenProfile(pendingId);
      }
      return;
    }
    scheduleCloseTimer = setTimeout(finishScheduleClose, SCHEDULE_ANIM_MS + 50);
  }

  function actuallyOpenProfile(userId: number) {
    clearProfileCloseTimer();
    panelUserId = userId;
    profilePanelUserId.set(userId);
    profilePanelOpen.set(true);
    if (profileVisible && profileActive) return;
    profileVisible = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        profileActive = true;
      });
    });
  }

  function openProfile(userId: number) {
    openScheduleAfterProfileClose = false;
    if (scheduleVisible) {
      // Сначала анимация закрытия расписания, потом профиль
      openProfileAfterScheduleClose = userId;
      closeSchedule(false);
      return;
    }
    actuallyOpenProfile(userId);
  }

  function closeProfile(immediate = false) {
    if (!profileVisible) {
      if (immediate) openScheduleAfterProfileClose = false;
      return;
    }
    profileActive = false;
    profilePanelOpen.set(false);
    clearProfileCloseTimer();
    if (immediate) {
      profileVisible = false;
      panelUserId = null;
      profilePanelUserId.set(null);
      resetProfilePanelHistory();
      if (openScheduleAfterProfileClose) {
        openScheduleAfterProfileClose = false;
        actuallyOpenSchedule();
      }
      return;
    }
    profileCloseTimer = setTimeout(finishProfileClose, SCHEDULE_ANIM_MS + 50);
  }

  function toggleSchedule() {
    if (scheduleVisible && scheduleActive) closeSchedule();
    else openSchedule();
  }

  function onScheduleTransitionEnd(e: TransitionEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== 'width') return;
    if (!scheduleActive) finishScheduleClose();
  }

  function onProfileTransitionEnd(e: TransitionEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== 'width') return;
    if (!profileActive) finishProfileClose();
  }

  const sidebarContextTab = $derived($activeSidebarTab);
  const searchTabActive = $derived(sidebarContextTab === 'search');

  function isActive(href: string): boolean {
    void sidebarContextTab;
    return isSidebarTabActive(href, currentPath ?? '');
  }

  const isChatPage = $derived(/^\/announcement\/[^/]+\/chat$/.test(currentPath ?? ''));
  const pageExtraClass = $derived(isChatPage ? 'page--chat' : undefined);

  $effect(() => {
    if (currentPath === '/schedule') {
      openSchedule();
      navigate('/overview');
    }
  });

  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Профиль закрывается только крестиком или расписанием — Esc только для расписания
      if (e.key === 'Escape' && scheduleVisible && scheduleActive) closeSchedule();
    };
    window.addEventListener('keydown', onKeyDown);

    const onProfilePanelOpen = (e: Event) => {
      const id = Number((e as CustomEvent<{ userId?: number }>).detail?.userId ?? 0);
      if (id > 0) openProfile(id);
    };
    const onProfilePanelClose = () => closeProfile();
    window.addEventListener('anix:profilePanelOpen', onProfilePanelOpen);
    window.addEventListener('anix:profilePanelClose', onProfilePanelClose);

    bindSearchHotkeys();
    void restoreAdminSession();

    const onProfileUpdated = () => {
      void checkTeamMembership();
    };
    window.addEventListener('anix:profileUpdated', onProfileUpdated);

    function loadSelfProfile() {
      if (!window.anixApi) {
        void checkTeamMembership();
        return;
      }
      window.anixApi.profile.self().then((data: any) => {
        const profile = data?.profile;
        if (!profile) {
          (window as any).__anixProfile = undefined;
          window.dispatchEvent(new CustomEvent('anix:profileUpdated'));
          return;
        }
        const pid = profile.id ?? profile['@id'];
        const idNum = typeof pid === 'number' ? pid : Number(pid);
        (window as any).__anixProfile = {
          id: Number.isFinite(idNum) && idNum > 0 ? idNum : undefined,
          login: profile.login ?? profile.nickname ?? undefined,
          avatar: profile.avatar ? resolveCdnAssetUrl(profile.avatar) : null,
        };
        window.dispatchEvent(new CustomEvent('anix:profileUpdated'));
        void checkTeamMembership();
      }).catch(() => {});
    }

    loadSelfProfile();
    const onAuthChanged = () => loadSelfProfile();
    window.addEventListener('anix:authChanged', onAuthChanged);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('anix:profileUpdated', onProfileUpdated);
      window.removeEventListener('anix:profilePanelOpen', onProfilePanelOpen);
      window.removeEventListener('anix:profilePanelClose', onProfilePanelClose);
      window.removeEventListener('anix:authChanged', onAuthChanged);
    };
  });

  async function onProfileClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!requireAuth()) return;
    const selfId = Number((window as { __anixProfile?: { id?: number } }).__anixProfile?.id ?? 0)
      || Number(await ensureProfileId() ?? 0);
    if (selfId) toggleProfilePanel(selfId);
  }
</script>

<div class="layout">
  <TitleBar
    onLobby={() => openLobbyModal()}
    onSchedule={toggleSchedule}
    scheduleOpen={scheduleActive}
    onNotifications={() => {
      if (!requireAuth()) return;
      openNotificationsModal();
    }}
    onSettings={() => openSettingsModal()}
    onProfile={onProfileClick}
    onSearchTab={navigateSearchTab}
    {searchTabActive}
    {onConnectionRetry}
  />

  <LobbyNowWatching />

  <div class="layout__body">
    <div class="sidebar-column">
      <aside class="sidebar">
        <nav class="sidebar__nav">
          {#each SIDEBAR_NAV as item}
            <UiV2Tooltip text={item.label} placement="right" class="sidebar__tooltip">
              <a
                href={item.href}
                class="sidebar__link"
                class:sidebar__link--active={isActive(item.href)}
                class:sidebar__link--downloads={item.href === '/downloads'}
                class:sidebar__link--guest-locked={item.href === '/bookmarks' && !$isAuthenticated}
                aria-label={item.label}
                onclick={(e) => {
                  closeSchedule();
                  e.preventDefault();
                  if (item.href === '/bookmarks' && !requireAuth()) {
                    (e.currentTarget as HTMLElement).blur();
                    return;
                  }
                  navigateSidebarTab(item.href);
                  (e.currentTarget as HTMLElement).blur();
                }}
              >
                {#if item.href === '/downloads'}
                  <span class="sidebar-dl-wrap">
                    {#if showDlProgress}
                      <svg class="sidebar-dl-ring" viewBox="0 0 36 36" aria-hidden="true">
                        <circle class="sidebar-dl-ring__bg" cx="18" cy="18" r="15" pathLength="100" />
                        <circle
                          class="sidebar-dl-ring__fill"
                          cx="18"
                          cy="18"
                          r="15"
                          pathLength="100"
                          stroke-dasharray="100 100"
                          stroke-dashoffset={dlRingOffset}
                        />
                      </svg>
                    {/if}
                    {@html item.icon}
                  </span>
                  {#if downloadsBadge > 0}
                    <span class="downloads-badge">{downloadsBadge > 9 ? '9+' : downloadsBadge}</span>
                  {/if}
                {:else}
                  {@html item.icon}
                {/if}
              </a>
            </UiV2Tooltip>
          {/each}
        </nav>
        <SidebarPins currentPath={currentPath} />
        <div class="sidebar__bottom">
          {#if $isTeamMember}
            <UiV2Tooltip text="Команда" placement="right" class="sidebar__tooltip">
              <button
                type="button"
                class="sidebar__link sidebar__link--social sidebar__link--admin"
                class:sidebar__link--active={currentPath.startsWith('/admin')}
                aria-label="Команда"
                onclick={(e) => {
                  closeSchedule();
                  openAdminArea();
                  (e.currentTarget as HTMLElement).blur();
                }}
              >
                <svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </button>
            </UiV2Tooltip>
          {/if}
          <UiV2Tooltip text="Discord" placement="right" class="sidebar__tooltip">
            <a
              href="https://discord.gg/qdFMFxzU9A"
              class="sidebar__link sidebar__link--social"
              aria-label="Discord"
              onclick={(e) => {
                e.preventDefault();
                window.electron?.openExternal?.('https://discord.gg/qdFMFxzU9A');
                (e.currentTarget as HTMLElement).blur();
              }}
            >
              <svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </a>
          </UiV2Tooltip>
          <UiV2Tooltip text="Boosty" placement="right" class="sidebar__tooltip">
            <a
              href="https://boosty.to/evt"
              class="sidebar__link sidebar__link--social sidebar__link--boosty"
              aria-label="Boosty"
              onclick={(e) => {
                e.preventDefault();
                window.electron?.openExternal?.('https://boosty.to/evt');
                (e.currentTarget as HTMLElement).blur();
              }}
            >
              <svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.5 2L4 13.5h7L8.5 22 20 10.5h-7L13.5 2z"/>
              </svg>
            </a>
          </UiV2Tooltip>
        </div>
      </aside>
    </div>

    <main class="layout__main">
      <div class="content-panel">
        <div class="content-panel__body">
          <Page scrollId="content" extraClass={pageExtraClass}>
            {@render children?.()}
          </Page>
        </div>
      </div>
    </main>

    {#if scheduleVisible}
      <aside
        class="schedule-panel-wrap"
        class:schedule-panel-wrap--open={scheduleActive}
        aria-label="Расписание"
        aria-hidden={!scheduleActive}
        ontransitionend={onScheduleTransitionEnd}
      >
        <div class="schedule-panel-shell">
          <SidebarSchedulePanel onClose={() => closeSchedule()} />
        </div>
      </aside>
    {:else if profileVisible && panelUserId}
      <aside
        class="schedule-panel-wrap schedule-panel-wrap--profile"
        class:schedule-panel-wrap--open={profileActive}
        aria-label="Профиль"
        aria-hidden={!profileActive}
        ontransitionend={onProfileTransitionEnd}
      >
        <div class="schedule-panel-shell schedule-panel-shell--profile">
          <SidebarProfilePanel userId={panelUserId} onClose={() => closeProfile()} />
        </div>
      </aside>
    {/if}
  </div>
</div>
