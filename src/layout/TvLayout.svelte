<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { navigateSidebarTab, navigate } from '../stores/navigation';
  import { isSidebarTabActive } from '../stores/tab-navigation';
  import { openSettingsModal, settingsModalOpen } from '../stores/modals';
  import { requireAuth } from '../stores/auth';
  import {
    closeProfilePanel,
    profilePanelOpen,
    profilePanelUserId,
    toggleProfilePanel,
  } from '../stores/profile-panel';
  import { TV_NAV_ITEMS, TV_PROFILE_NAV_ITEM, tvNavHref, type TvNavItem } from '../tv/nav';
  import { returnTvFocusToContent } from '../services/tv-navigation';
  import { ensureProfileId } from '../utils/profile';
  import Page from '../components/Page.svelte';
  import UiV2MediaLightbox from '../components/uikit-v2/UiV2MediaLightbox.svelte';
  import TvPosterBackdrop from '../components/tv/TvPosterBackdrop.svelte';
  import SidebarProfilePanel from '../components/SidebarProfilePanel.svelte';
  import SettingsModal from '../components/SettingsModal.svelte';
  import SidebarPanelResizeHandle from '../components/SidebarPanelResizeHandle.svelte';
  import { getProfilePanelWidthPx, setProfilePanelWidthPx } from '../prefs';

  interface Props {
    children?: Snippet;
    currentPath?: string;
    /** Полноэкранный плеер — скрывает боковую панель. */
    immersive?: boolean;
  }

  let { children, currentPath = '/', immersive = false }: Props = $props();

  let profileVisible = $state(false);
  let profileActive = $state(false);
  let settingsVisible = $state(false);
  let settingsActive = $state(false);
  let openSettingsAfterProfileClose = $state(false);
  let openProfileAfterSettingsClose = $state(false);
  let profilePanelWidthPx = $state(getProfilePanelWidthPx());

  function isActive(item: TvNavItem): boolean {
    if ('action' in item && item.action === 'settings') {
      return settingsActive;
    }
    if ('action' in item && item.action === 'profile') {
      return $profilePanelOpen;
    }
    const href = tvNavHref(item);
    if (!href) return false;
    return isSidebarTabActive(href, currentPath ?? '');
  }

  function closeProfile() {
    closeProfilePanel();
    returnTvFocusToContent();
  }

  function actuallyOpenSettings() {
    settingsVisible = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        settingsActive = true;
      });
    });
  }

  function closeSettings(immediate = false) {
    if (!settingsVisible) return;
    if (!settingsActive && !immediate) return;
    settingsActive = false;
    settingsModalOpen.set(false);
    if (immediate) {
      settingsVisible = false;
      if (openProfileAfterSettingsClose) {
        openProfileAfterSettingsClose = false;
        void activateProfileAfterSettings();
      }
      return;
    }
    window.setTimeout(() => {
      if (settingsActive) return;
      settingsVisible = false;
      if (openProfileAfterSettingsClose) {
        openProfileAfterSettingsClose = false;
        void activateProfileAfterSettings();
      }
    }, 360);
  }

  async function activateProfileAfterSettings() {
    if (!requireAuth()) {
      returnTvFocusToContent();
      return;
    }
    const selfId = Number((window as { __anixProfile?: { id?: number } }).__anixProfile?.id ?? 0)
      || Number(await ensureProfileId() ?? 0);
    if (!selfId) {
      returnTvFocusToContent();
      return;
    }
    toggleProfilePanel(selfId);
    returnTvFocusToContent();
  }

  async function activateProfile() {
    if (settingsVisible) {
      openProfileAfterSettingsClose = true;
      openSettingsAfterProfileClose = false;
      closeSettings(false);
      return;
    }
    if (!requireAuth()) {
      returnTvFocusToContent();
      return;
    }
    const selfId = Number((window as { __anixProfile?: { id?: number } }).__anixProfile?.id ?? 0)
      || Number(await ensureProfileId() ?? 0);
    if (!selfId) {
      returnTvFocusToContent();
      return;
    }
    toggleProfilePanel(selfId);
    returnTvFocusToContent();
  }

  function activateNavItem(item: TvNavItem) {
    if ('action' in item && item.action === 'settings') {
      openSettingsModal();
      returnTvFocusToContent();
      return;
    }
    if ('action' in item && item.action === 'profile') {
      void activateProfile();
      return;
    }
    const href = tvNavHref(item);
    if (!href) return;
    if (href === '/bookmarks' && !requireAuth()) {
      returnTvFocusToContent();
      return;
    }
    if (href === currentPath) {
      returnTvFocusToContent();
      return;
    }
    navigateSidebarTab(href);
    navigate(href);
    returnTvFocusToContent();
  }

  $effect(() => {
    if ($settingsModalOpen) {
      if (settingsVisible && settingsActive) return;
      if (profileVisible) {
        openSettingsAfterProfileClose = true;
        closeProfilePanel();
        return;
      }
      actuallyOpenSettings();
      return;
    }
    if (settingsVisible && settingsActive) closeSettings();
  });

  function onNavClick(event: MouseEvent, item: TvNavItem) {
    event.preventDefault();
    activateNavItem(item);
  }

  onMount(() => {
    const onProfilePanelOpen = () => {
      profileVisible = true;
      requestAnimationFrame(() => {
        profileActive = true;
      });
    };
    const onProfilePanelClose = () => {
      profileActive = false;
      window.setTimeout(() => {
        profileVisible = false;
        if (openSettingsAfterProfileClose) {
          openSettingsAfterProfileClose = false;
          actuallyOpenSettings();
        }
      }, 360);
    };

    window.addEventListener('anix:profilePanelOpen', onProfilePanelOpen);
    window.addEventListener('anix:profilePanelClose', onProfilePanelClose);

    return () => {
      window.removeEventListener('anix:profilePanelOpen', onProfilePanelOpen);
      window.removeEventListener('anix:profilePanelClose', onProfilePanelClose);
    };
  });
</script>

<div class="tv-layout" class:tv-layout--immersive={immersive}>
  <TvPosterBackdrop />
  <div class="tv-layout__backdrop" aria-hidden="true"></div>

  <aside class="tv-layout__rail" aria-label="Навигация">
    <div class="tv-layout__rail-panel">
      <header class="tv-layout__brand">
        <span class="tv-layout__brand-leading">
          <img class="tv-layout__logo-mark" src="/logo/LogoTv1.svg" alt="AnixApp" width="89" height="71" />
        </span>
        <img class="tv-layout__logo-wordmark" src="/logo/LogoTv2.svg" alt="" width="246" height="74" aria-hidden="true" />
      </header>

      <div class="tv-layout__rail-body">
        <nav class="tv-layout__nav" aria-label="Разделы">
          {#each TV_NAV_ITEMS as item (item.id)}
            <button
              type="button"
              class="tv-layout__rail-item"
              class:tv-layout__rail-item--active={isActive(item)}
              data-tv-nav-id={item.id}
              data-tv-nav
              tabindex="-1"
              onclick={(e) => onNavClick(e, item)}
            >
              <span class="tv-layout__rail-item-leading">
                <span class="tv-layout__rail-icon" aria-hidden="true">{@html item.icon}</span>
                <span class="tv-layout__rail-active-mark" aria-hidden="true"></span>
              </span>
              <span class="tv-layout__rail-label">{item.label}</span>
            </button>
          {/each}
        </nav>
      </div>

      <footer class="tv-layout__rail-footer">
        <button
          type="button"
          class="tv-layout__rail-item tv-layout__rail-item--profile"
          class:tv-layout__rail-item--active={isActive(TV_PROFILE_NAV_ITEM)}
          data-tv-nav-id={TV_PROFILE_NAV_ITEM.id}
          data-tv-nav
          tabindex="-1"
          onclick={(e) => onNavClick(e, TV_PROFILE_NAV_ITEM)}
        >
          <span class="tv-layout__rail-item-leading">
            <span class="tv-layout__rail-icon" aria-hidden="true">{@html TV_PROFILE_NAV_ITEM.icon}</span>
            <span class="tv-layout__rail-active-mark" aria-hidden="true"></span>
          </span>
          <span class="tv-layout__rail-label">{TV_PROFILE_NAV_ITEM.label}</span>
        </button>
      </footer>
    </div>
  </aside>

  <main class="tv-layout__main" data-tv-content>
    <Page extraClass="page--tv" noPadding>
      {@render children?.()}
    </Page>
  </main>

  {#if (profileVisible && $profilePanelUserId) || settingsVisible}
    <button
      type="button"
      class="schedule-panel-backdrop"
      class:schedule-panel-backdrop--open={profileActive || settingsActive}
      aria-label="Закрыть панель"
      onclick={() => {
        if (profileActive) closeProfile();
        else if (settingsActive) closeSettings();
      }}
    ></button>
  {/if}

  {#if profileVisible && $profilePanelUserId}
    <aside
      class="schedule-panel-wrap schedule-panel-wrap--profile tv-layout__profile-panel"
      class:schedule-panel-wrap--open={profileActive}
      aria-label="Профиль"
      aria-hidden={!profileActive}
    >
      <div class="schedule-panel-shell schedule-panel-shell--profile" style={`width: ${profilePanelWidthPx}px`}>
        <div class="schedule-panel-shell__body">
          <SidebarProfilePanel userId={$profilePanelUserId} onClose={() => closeProfile()} />
        </div>
        <SidebarPanelResizeHandle
          widthPx={profilePanelWidthPx}
          label="Ширина профиля"
          onWidthChange={(w) => {
            profilePanelWidthPx = w;
          }}
          onWidthCommit={(w) => {
            profilePanelWidthPx = setProfilePanelWidthPx(w);
          }}
        />
      </div>
    </aside>
  {:else if settingsVisible}
    <aside
      class="schedule-panel-wrap schedule-panel-wrap--profile tv-layout__profile-panel"
      class:schedule-panel-wrap--open={settingsActive}
      aria-label="Настройки"
      aria-hidden={!settingsActive}
    >
      <div class="schedule-panel-shell schedule-panel-shell--profile" style={`width: ${profilePanelWidthPx}px`}>
        <div class="schedule-panel-shell__body">
          <SettingsModal onClose={() => closeSettings()} />
        </div>
        <SidebarPanelResizeHandle
          widthPx={profilePanelWidthPx}
          label="Ширина настроек"
          onWidthChange={(w) => {
            profilePanelWidthPx = w;
          }}
          onWidthCommit={(w) => {
            profilePanelWidthPx = setProfilePanelWidthPx(w);
          }}
        />
      </div>
    </aside>
  {/if}

  <UiV2MediaLightbox />
</div>
