<script lang="ts">
  import { onMount } from 'svelte';
  import { navigateSidebarTab } from '../stores/navigation';
  import { isSidebarTabActive } from '../stores/tab-navigation';
  import { isAuthenticated, requireAuth } from '../stores/auth';
  import { activeDownloadsCount, downloadsOverallProgress } from '../stores/downloads';
  import { iconChevronDown } from './icons';
  import UiV2Tooltip from './uikit-v2/UiV2Tooltip.svelte';
  import {
    sidebarNavFolderIconSvg,
    type SidebarNavItemDef,
  } from '../constants/sidebar-nav';
  import type { SidebarNavRailEntry } from '../prefs';

  interface Props {
    entries: SidebarNavRailEntry[];
    currentPath?: string;
    side?: 'left' | 'right';
    onNavigate?: () => void;
  }

  let {
    entries,
    currentPath = '/',
    side = 'left',
    onNavigate,
  }: Props = $props();

  const downloadsBadge = $derived($activeDownloadsCount);
  const dlProgress = $derived($downloadsOverallProgress);
  const showDlProgress = $derived(dlProgress > 0 && downloadsBadge > 0);
  const dlRingOffset = $derived(100 - dlProgress);
  const tooltipPlacement = $derived(side === 'right' ? 'left' : 'right');
  const chevronDown = iconChevronDown(12);

  let hoverFolderId = $state<string | null>(null);
  let reducedMotion = $state(false);

  onMount(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { reducedMotion = mq.matches; };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  function isActive(href: string): boolean {
    return isSidebarTabActive(href, currentPath);
  }

  function activeChildOf(children: SidebarNavItemDef[]): SidebarNavItemDef | null {
    return children.find((c) => isActive(c.href)) ?? null;
  }

  function isFolderExpanded(id: string): boolean {
    return hoverFolderId === id;
  }

  function openFolder(id: string) {
    hoverFolderId = id;
  }

  function closeFolder(id: string) {
    if (hoverFolderId === id) hoverFolderId = null;
  }

  function onFolderFocusOut(e: FocusEvent, id: string) {
    const root = e.currentTarget as HTMLElement;
    const next = e.relatedTarget as Node | null;
    if (next && root.contains(next)) return;
    closeFolder(id);
  }

  function goTo(item: SidebarNavItemDef, e: MouseEvent) {
    onNavigate?.();
    e.preventDefault();
    if (item.href === '/bookmarks' && !requireAuth()) {
      (e.currentTarget as HTMLElement).blur();
      return;
    }
    navigateSidebarTab(item.href);
    (e.currentTarget as HTMLElement).blur();
  }

  function collageIcons(children: SidebarNavItemDef[]): SidebarNavItemDef[] {
    return children.slice(0, 4);
  }
</script>

{#snippet tabIcon(item: SidebarNavItemDef)}
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
    {#if item.beta}
      <span class="uiv2-sidenav__beta" aria-hidden="true">β</span>
    {/if}
  {/if}
{/snippet}

<nav
  class="uiv2-sidenav"
  class:uiv2-sidenav--right={side === 'right'}
  class:uiv2-sidenav--reduced={reducedMotion}
  aria-label={side === 'right' ? 'Навигация справа' : 'Навигация'}
>
  {#each entries as entry (entry.kind === 'item' ? entry.item.id : entry.id)}
    {#if entry.kind === 'item'}
      {@const item = entry.item}
      {@const on = isActive(item.href)}
      <UiV2Tooltip
        text={item.beta ? '' : item.label}
        title={item.beta ? item.label : ''}
        meta={item.beta ? 'beta' : undefined}
        placement={tooltipPlacement}
        class="uiv2-sidenav__tip"
      >
        <a
          href={`#${item.href === '/' ? '/' : item.href}`}
          class="uiv2-sidenav__tab"
          class:uiv2-sidenav__tab--active={on}
          class:uiv2-sidenav__tab--downloads={item.href === '/downloads'}
          class:uiv2-sidenav__tab--guest={item.href === '/bookmarks' && !$isAuthenticated}
          aria-label={item.beta ? `${item.label} (beta)` : item.label}
          aria-current={on ? 'page' : undefined}
          onclick={(e) => goTo(item, e)}
        >
          {@render tabIcon(item)}
        </a>
      </UiV2Tooltip>
    {:else}
      {@const expanded = isFolderExpanded(entry.id)}
      {@const activeTab = activeChildOf(entry.children)}
      {@const collage = collageIcons(entry.children)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="uiv2-sidenav__folder"
        class:uiv2-sidenav__folder--open={expanded}
        onmouseenter={() => openFolder(entry.id)}
        onmouseleave={() => closeFolder(entry.id)}
        onfocusin={() => openFolder(entry.id)}
        onfocusout={(e) => onFolderFocusOut(e, entry.id)}
      >
        <div class="uiv2-sidenav__shell" role="group" aria-label={entry.name}>
          <UiV2Tooltip
            text={activeTab && !expanded ? activeTab.label : entry.name}
            placement={tooltipPlacement}
            class="uiv2-sidenav__tip uiv2-sidenav__tip--face"
          >
            <!-- Фиксированный слот: коллаж ↔ иконка папки без схлопывания hitbox -->
            <div class="uiv2-sidenav__face">
              <button
                type="button"
                class="uiv2-sidenav__pack"
                class:uiv2-sidenav__pack--current={!!activeTab}
                tabindex={expanded ? -1 : 0}
                aria-hidden={expanded}
                aria-label={activeTab && !expanded ? activeTab.label : entry.name}
                aria-expanded={expanded}
              >
                {#if activeTab}
                  <span class="uiv2-sidenav__pack-solo" aria-hidden="true">
                    {@render tabIcon(activeTab)}
                  </span>
                {:else if collage.length > 0}
                  <span class="uiv2-sidenav__pack-grid" aria-hidden="true">
                    {#each collage as cell (cell.id)}
                      <span class="uiv2-sidenav__pack-cell">{@html cell.icon}</span>
                    {/each}
                    {#each Array(Math.max(0, 4 - collage.length)) as _, i (i)}
                      <span class="uiv2-sidenav__pack-cell uiv2-sidenav__pack-cell--empty"></span>
                    {/each}
                  </span>
                {:else}
                  <span class="uiv2-sidenav__pack-solo" aria-hidden="true">
                    {@html sidebarNavFolderIconSvg(entry.iconId, 16)}
                  </span>
                {/if}
              </button>

              <button
                type="button"
                class="uiv2-sidenav__bundle-head"
                tabindex={expanded ? 0 : -1}
                aria-hidden={!expanded}
                aria-label={entry.name}
                aria-expanded={expanded}
              >
                {@html sidebarNavFolderIconSvg(entry.iconId, 16)}
              </button>
            </div>
          </UiV2Tooltip>

          <span
            class="uiv2-sidenav__arrow"
            class:uiv2-sidenav__arrow--open={expanded}
            aria-hidden="true"
          >{@html chevronDown}</span>

          <div class="uiv2-sidenav__list-body" aria-hidden={!expanded}>
            <div class="uiv2-sidenav__list-inner">
              {#each entry.children as child, i (child.id)}
                {@const childOn = isActive(child.href)}
                <div class="uiv2-sidenav__child-wrap" style={`--uiv2-sidenav-i:${i}`}>
                  <UiV2Tooltip
                    text={child.beta ? '' : child.label}
                    title={child.beta ? child.label : ''}
                    meta={child.beta ? 'beta' : undefined}
                    placement={tooltipPlacement}
                    class="uiv2-sidenav__tip"
                  >
                    <a
                      href={`#${child.href === '/' ? '/' : child.href}`}
                      class="uiv2-sidenav__tab uiv2-sidenav__tab--child"
                      class:uiv2-sidenav__tab--active={childOn}
                      class:uiv2-sidenav__tab--downloads={child.href === '/downloads'}
                      class:uiv2-sidenav__tab--guest={child.href === '/bookmarks' && !$isAuthenticated}
                      tabindex={expanded ? 0 : -1}
                      aria-label={child.beta ? `${child.label} (beta)` : child.label}
                      aria-current={childOn ? 'page' : undefined}
                      onclick={(e) => goTo(child, e)}
                    >
                      {@render tabIcon(child)}
                    </a>
                  </UiV2Tooltip>
                </div>
              {:else}
                <span class="uiv2-sidenav__folder-empty" title="Пусто — добавьте вкладки в настройках"></span>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/each}
</nav>
