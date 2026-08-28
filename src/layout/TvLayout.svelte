<script lang="ts">
  import type { Snippet } from 'svelte';
  import { navigateSidebarTab, navigate } from '../stores/navigation';
  import { isSidebarTabActive } from '../stores/tab-navigation';
  import { openSettingsModal } from '../stores/modals';
  import { requireAuth } from '../stores/auth';
  import { TV_NAV_ITEMS, tvNavHref, type TvNavItem } from '../tv/nav';
  import { returnTvFocusToContent } from '../services/tv-navigation';
  import Page from '../components/Page.svelte';

  interface Props {
    children?: Snippet;
    currentPath?: string;
  }

  let { children, currentPath = '/' }: Props = $props();

  function isActive(item: TvNavItem): boolean {
    const href = tvNavHref(item);
    if (!href) return false;
    return isSidebarTabActive(href, currentPath ?? '');
  }

  function activateNavItem(item: TvNavItem) {
    if ('action' in item && item.action === 'settings') {
      openSettingsModal();
      returnTvFocusToContent();
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

  function onNavClick(event: MouseEvent, item: TvNavItem) {
    event.preventDefault();
    activateNavItem(item);
  }
</script>

<div class="tv-layout">
  <div class="tv-layout__backdrop" aria-hidden="true"></div>

  <aside class="tv-layout__rail" aria-label="Навигация">
    <div class="tv-layout__rail-panel">
      <header class="tv-layout__brand">
        <span class="tv-layout__brand-leading">
          <img class="tv-layout__logo-mark" src="./logo/LogoTv1.svg" alt="AnixApp" width="89" height="71" />
        </span>
        <img class="tv-layout__logo-wordmark" src="./logo/LogoTv2.svg" alt="" width="246" height="74" aria-hidden="true" />
      </header>

      <nav class="tv-layout__nav">
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
  </aside>

  <main class="tv-layout__main" data-tv-content>
    <Page extraClass="page--tv" noPadding>
      {@render children?.()}
    </Page>
  </main>
</div>
