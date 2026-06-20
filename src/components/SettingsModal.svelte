<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import Page from './Page.svelte';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import { settingsModalInitialTab } from '../stores/modals';
  import AccountPage    from '../views/Settings/pages/AccountPage.svelte';
  import AppearancePage from '../views/Settings/pages/AppearancePage.svelte';
  import ConnectionPage from '../views/Settings/pages/ConnectionPage.svelte';
  import BehaviorPage   from '../views/Settings/pages/BehaviorPage.svelte';
  import PlaybackPage   from '../views/Settings/pages/PlaybackPage.svelte';
  import DiscordRpcPage from '../views/Settings/pages/DiscordRpcPage.svelte';
  import AboutPage      from '../views/Settings/pages/AboutPage.svelte';
  import LogsPage       from '../views/Settings/pages/LogsPage.svelte';
  import UiKitPage      from '../views/Settings/pages/UiKitPage.svelte';
  import {
    createIcons,
    User,
    Palette,
    Globe,
    SlidersHorizontal,
    Info,
    LayoutGrid,
    LogOut,
    Star,
    ExternalLink,
    Pencil,
    Github,
    Tv,
    ScrollText,
    Activity,
  } from 'lucide';

  interface Props {
    onClose: () => void;
  }

  const { onClose }: Props = $props();

  export type SettingsTab = 'account' | 'appearance' | 'connection' | 'behavior' | 'playback' | 'discord' | 'uikit' | 'about' | 'logs';

  const TAB_TITLES: Record<SettingsTab, string> = {
    account:    'Моя учётная запись',
    appearance: 'Внешний вид',
    connection: 'Соединение',
    behavior:   'Поведение',
    playback:   'Воспроизведение',
    discord:    'Discord RPC',
    uikit:      'UI Kit',
    about:      'О программе',
    logs:       'Журнал событий',
  };

  const isDev = import.meta.env.DEV;

  const initialTab = get(settingsModalInitialTab) as SettingsTab | null;
  let activeTab = $state<SettingsTab>(initialTab ?? 'appearance');
  let overlayEl = $state<HTMLElement | null>(null);
  let sidebarScrollEl = $state<HTMLElement | null>(null);

  const profile = (window as any).__anixProfile as { id?: number; login?: string; avatar?: string | null } | undefined;
  const loginDisplay = profile?.login ?? '—';
  const avatarStyle = profile?.avatar ? `background-image: url('${resolveCdnAssetUrl(profile.avatar)}')` : '';

  function initIcons(root: HTMLElement): void {
    createIcons({
      icons: { User, Palette, Globe, SlidersHorizontal, Info, LayoutGrid, LogOut, Star, ExternalLink, Pencil, Github, Tv, ScrollText, Activity },
      root,
    });
  }

  // Tab switching is now handled by Svelte {#if} blocks in the template.
  // Each tab is a separate component in views/Settings/pages/.

  // ── close / keyboard ──────────────────────────────────────────────────────────
  function close() {
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === overlayEl) close();
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);

    // Version in sidebar footer
    const versionEl = overlayEl?.querySelector('#s-version') as HTMLElement | null;
    const compEl = overlayEl?.querySelector('#s-components') as HTMLElement | null;

    if (typeof window.electron?.getVersions === 'function') {
      window.electron.getVersions().then((v: any) => {
        if (v.app && versionEl) versionEl.textContent = `AnixApp v${v.app}`;
        if (compEl) {
          const parts: string[] = [];
          if (v.electron) parts.push(`Electron ${v.electron}`);
          if (v.chrome) parts.push(`Chrome ${v.chrome}`);
          if (v.node) parts.push(`Node ${v.node}`);
          const apiVer = v.anixapi || v.anixartjs;
          if (apiVer) parts.push(`<a href="#" class="settings-sidebar__meta-link" data-url="https://github.com/Maks1mio/anixapi">AnixApi ${apiVer}</a>`);
          compEl.innerHTML = parts.join(' · ');
          compEl.querySelectorAll<HTMLAnchorElement>('.settings-sidebar__meta-link').forEach((a) => {
            a.addEventListener('click', (e) => {
              e.preventDefault();
              const url = a.dataset.url;
              if (url) window.electron?.openExternal?.(url);
            });
          });
        }
      }).catch(() => {});
    } else if (typeof window.electron?.getAppVersion === 'function') {
      window.electron.getAppVersion().then((v: string) => {
        if (versionEl) versionEl.textContent = `AnixApp v${v}`;
      }).catch(() => {});
    }

    // Lucide icons in sidebar
    if (overlayEl) initIcons(overlayEl);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });

  function handleLogout() {
    if (window.anixApi) {
      close();
      window.anixApi.auth.logout().then(() => {
        window.location.reload();
      });
    }
  }

  function handleGithubLink(e: Event) {
    e.preventDefault();
    window.electron?.openExternal?.('https://github.com/Maks1mio/anixapp');
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="settings-overlay settings-overlay--open"
  role="dialog"
  aria-modal="true"
  aria-label="Настройки"
  tabindex="-1"
  bind:this={overlayEl}
  onclick={handleOverlayClick}
>
  <div class="settings-panel">

    <aside class="settings-sidebar">
      <div class="settings-sidebar__scroll" bind:this={sidebarScrollEl}>

        <button
          class="settings-sidebar__user settings-nav__item"
          class:settings-nav__item--active={activeTab === 'account'}
          onclick={() => { activeTab = 'account'; }}
        >
          <div class="settings-sidebar__avatar" style={avatarStyle} id="s-av"></div>
          <div class="settings-sidebar__user-info">
            <span class="settings-sidebar__username">{loginDisplay}</span>
            <span class="settings-sidebar__user-sub">Редактировать профи… <i data-lucide="pencil"></i></span>
          </div>
        </button>

        <div class="settings-nav__sep"></div>

        <p class="settings-nav__section">Настройки приложения</p>
        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'appearance'}
          onclick={() => { activeTab = 'appearance'; }}
        >
          <i data-lucide="palette"></i><span>Внешний вид</span>
        </button>
        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'connection'}
          onclick={() => { activeTab = 'connection'; }}
        >
          <i data-lucide="globe"></i><span>Соединение</span>
        </button>
        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'behavior'}
          onclick={() => { activeTab = 'behavior'; }}
        >
          <i data-lucide="sliders-horizontal"></i><span>Поведение</span>
        </button>
        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'playback'}
          onclick={() => { activeTab = 'playback'; }}
        >
          <i data-lucide="tv"></i><span>Воспроизведение</span>
        </button>
        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'discord'}
          onclick={() => { activeTab = 'discord'; }}
        >
          <i data-lucide="activity"></i><span>Discord RPC</span>
        </button>

        <div class="settings-nav__sep"></div>

        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'about'}
          onclick={() => { activeTab = 'about'; }}
        >
          <i data-lucide="info"></i><span>О программе</span>
        </button>
        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'logs'}
          onclick={() => { activeTab = 'logs'; }}
        >
          <i data-lucide="scroll-text"></i><span>Журнал событий</span>
        </button>

        {#if isDev}
          <button
            class="settings-nav__item settings-nav__item--icon"
            class:settings-nav__item--active={activeTab === 'uikit'}
            onclick={() => { activeTab = 'uikit'; }}
          >
            <i data-lucide="layout-grid"></i><span>UI Kit</span>
          </button>
        {/if}

      </div>

      <div class="settings-sidebar__footer-section">
        <button class="settings-nav__item settings-nav__item--logout" id="s-logout" onclick={handleLogout}>
          <i data-lucide="log-out"></i>
          <span>Выйти</span>
        </button>
        <div class="settings-sidebar__meta">
          <span class="settings-sidebar__meta-version" id="s-version">AnixApp</span>
          <button type="button" class="settings-sidebar__meta-icon" id="s-github-link" title="GitHub" onclick={handleGithubLink}>
            <i data-lucide="github"></i>
          </button>
        </div>
        <div class="settings-sidebar__meta-components" id="s-components"></div>
      </div>
    </aside>

    <div class="settings-content">
      <div class="settings-content__header">
        <h1 class="settings-content__title">{TAB_TITLES[activeTab]}</h1>
        <button class="settings-close-btn" aria-label="Закрыть" onclick={close}></button>
      </div>
      <div class="settings-content__page-wrap">
        <Page scrollId="settings-scroll" noPadding={true} extraClass="settings-page">
          {#if activeTab === 'account'}
            <AccountPage />
          {:else if activeTab === 'appearance'}
            <AppearancePage />
          {:else if activeTab === 'connection'}
            <ConnectionPage />
          {:else if activeTab === 'behavior'}
            <BehaviorPage />
          {:else if activeTab === 'playback'}
            <PlaybackPage />
          {:else if activeTab === 'discord'}
            <DiscordRpcPage />
          {:else if activeTab === 'about'}
            <AboutPage />
          {:else if activeTab === 'logs'}
            <LogsPage />
          {:else if activeTab === 'uikit'}
            <UiKitPage />
          {/if}
        </Page>
      </div>
    </div>

  </div>
</div>
