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
  import DeveloperPage  from '../views/Settings/pages/DeveloperPage.svelte';
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
    Tv,
    ScrollText,
    Activity,
    Code2,
  } from 'lucide';

  interface Props {
    onClose: () => void;
  }

  const { onClose }: Props = $props();

  export type SettingsTab = 'account' | 'appearance' | 'connection' | 'behavior' | 'playback' | 'discord' | 'developer' | 'about';

  const TAB_TITLES: Record<SettingsTab, string> = {
    account:    'Моя учётная запись',
    appearance: 'Внешний вид',
    connection: 'Соединение',
    behavior:   'Поведение',
    playback:   'Воспроизведение',
    discord:    'Discord RPC',
    developer:  'Разработчик',
    about:      'О программе',
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
      icons: { User, Palette, Globe, SlidersHorizontal, Info, LogOut, Star, ExternalLink, Pencil, Tv, ScrollText, Activity, Code2 },
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

        {#if isDev}
          <div class="settings-nav__sep"></div>
          <p class="settings-nav__section">Разработчик</p>
          <button
            class="settings-nav__item settings-nav__item--icon"
            class:settings-nav__item--active={activeTab === 'developer'}
            onclick={() => { activeTab = 'developer'; }}
          >
            <i data-lucide="code-2"></i><span>Разработчик</span>
          </button>
        {/if}

        <div class="settings-nav__sep"></div>

        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'about'}
          onclick={() => { activeTab = 'about'; }}
        >
          <i data-lucide="info"></i><span>О программе</span>
        </button>

      </div>

      <div class="settings-sidebar__footer-section">
        <button class="settings-nav__item settings-nav__item--logout" id="s-logout" onclick={handleLogout}>
          <i data-lucide="log-out"></i>
          <span>Выйти</span>
        </button>
        <div class="settings-sidebar__meta">
          <span class="settings-sidebar__meta-version" id="s-version">AnixApp</span>
          <button type="button" class="settings-sidebar__meta-icon" id="s-github-link" title="GitHub" onclick={handleGithubLink}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
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
          {:else if activeTab === 'developer'}
            <DeveloperPage />
          {:else if activeTab === 'about'}
            <AboutPage />
          {/if}
        </Page>
      </div>
    </div>

  </div>
</div>
