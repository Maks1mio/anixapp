<script lang="ts">
  import type { Snippet } from 'svelte';
  import { navigateSidebarTab, navigate } from '../stores/navigation';
  import { isSidebarTabActive } from '../stores/tab-navigation';
  import { settingsModalOpen } from '../stores/modals';
  import { requireAuth } from '../stores/auth';
  import { closeProfilePanel, profilePanelOpen, profilePanelUserId } from '../stores/profile-panel';
  import { TV_NAV_ITEMS, TV_PROFILE_NAV_ITEM, TV_POWER_NAV_ITEM, tvNavHref, type TvNavItem } from '../tv/nav';
  import { tvSystemMenuOpen } from '../services/tv-input';
  import { returnTvFocusToContent } from '../services/tv-navigation';
  import Page from '../components/Page.svelte';
  import UiV2MediaLightbox from '../components/uikit-v2/UiV2MediaLightbox.svelte';
  import TvPosterBackdrop from '../components/tv/TvPosterBackdrop.svelte';

  interface Props {
    children?: Snippet;
    currentPath?: string;
    /** Полноэкранный плеер — скрывает боковую панель. */
    immersive?: boolean;
  }

  let { children, currentPath = '/', immersive = false }: Props = $props();

  const routePath = $derived((currentPath ?? '/').split('?')[0] || '/');

  const isProfileRoute = $derived(routePath === '/profile' || /^\/profile\/\d+$/.test(routePath));
  /** Поиск, настройки и профиль — не вкладки сайдбара ПК: подсвечиваются только на своём маршруте. */
  const isStandaloneRoute = $derived(isProfileRoute || routePath === '/settings' || routePath === '/search');

  function isActive(item: TvNavItem): boolean {
    if ('action' in item && item.action === 'profile') return isProfileRoute;
    const href = tvNavHref(item);
    if (!href) return false;
    if (href === '/settings' || href === '/search') return routePath === href;
    if (isStandaloneRoute) return false;
    return isSidebarTabActive(href, currentPath ?? '');
  }

  function go(href: string) {
    if (href === routePath) {
      returnTvFocusToContent();
      return;
    }
    navigateSidebarTab(href);
    navigate(href);
    returnTvFocusToContent();
  }

  function activateNavItem(item: TvNavItem) {
    if ('action' in item && item.action === 'power') {
      tvSystemMenuOpen.set(true);
      return;
    }
    if ('action' in item && item.action === 'profile') {
      if (!requireAuth()) {
        returnTvFocusToContent();
        return;
      }
      go('/profile');
      return;
    }
    const href = tvNavHref(item);
    if (!href) return;
    if (href === '/bookmarks' && !requireAuth()) {
      returnTvFocusToContent();
      return;
    }
    go(href);
  }

  // На TV нет боковых панелей ПК: профиль и настройки — отдельные экраны.
  $effect(() => {
    if (!$profilePanelOpen) return;
    const id = $profilePanelUserId;
    closeProfilePanel();
    navigate(id ? `/profile/${id}` : '/profile');
  });

  $effect(() => {
    if (!$settingsModalOpen) return;
    settingsModalOpen.set(false);
    if (routePath !== '/settings') navigate('/settings');
  });

  function onNavClick(event: MouseEvent, item: TvNavItem) {
    event.preventDefault();
    activateNavItem(item);
  }
</script>

<div class="tv-layout" class:tv-layout--immersive={immersive}>
  <TvPosterBackdrop />
  <div class="tv-layout__backdrop" aria-hidden="true"></div>

  <aside class="tv-layout__rail" aria-label="Навигация">
    <div class="tv-layout__rail-panel">
      <header class="tv-layout__brand">
        <span class="tv-layout__brand-leading">
          <img class="tv-layout__logo-mark" src="./logo/LogoTv1.svg" alt="AnixApp" width="89" height="71" />
        </span>
        <img class="tv-layout__logo-wordmark" src="./logo/LogoTv2.svg" alt="" width="246" height="74" aria-hidden="true" />
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
          class="tv-layout__rail-item"
          data-tv-nav-id={TV_POWER_NAV_ITEM.id}
          data-tv-nav
          tabindex="-1"
          onclick={(e) => onNavClick(e, TV_POWER_NAV_ITEM)}
        >
          <span class="tv-layout__rail-item-leading">
            <span class="tv-layout__rail-icon" aria-hidden="true">{@html TV_POWER_NAV_ITEM.icon}</span>
            <span class="tv-layout__rail-active-mark" aria-hidden="true"></span>
          </span>
          <span class="tv-layout__rail-label">{TV_POWER_NAV_ITEM.label}</span>
        </button>
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

  <UiV2MediaLightbox />
</div>
