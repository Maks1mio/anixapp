<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import Page from './Page.svelte';
  import { settingsModalInitialTab, settingsModalLastTab, settingsBossFightLock } from '../stores/modals';
  import AccountPage from '../views/Settings/pages/AccountPage.svelte';
  import AppearancePage from '../views/Settings/pages/AppearancePage.svelte';
  import ConnectionPage from '../views/Settings/pages/ConnectionPage.svelte';
  import BehaviorPage from '../views/Settings/pages/BehaviorPage.svelte';
  import NotificationsDevicePage from '../views/Settings/pages/NotificationsDevicePage.svelte';
  import PlaybackPage from '../views/Settings/pages/PlaybackPage.svelte';
  import DiscordRpcPage from '../views/Settings/pages/DiscordRpcPage.svelte';
  import AboutPage from '../views/Settings/pages/AboutPage.svelte';
  import UpdatePage from '../views/Settings/pages/UpdatePage.svelte';
  import DebugPage from '../views/Settings/pages/DebugPage.svelte';
  import DeveloperPage from '../views/Settings/pages/DeveloperPage.svelte';
  import UiV2BackBar from './uikit-v2/UiV2BackBar.svelte';
  import UiV2RoundButton from './uikit-v2/UiV2RoundButton.svelte';
  import SidebarPanelResizeHandle from './SidebarPanelResizeHandle.svelte';
  import {
    iconX,
    iconPalette,
    iconBell,
    iconPlay,
    iconGlobe,
    iconDownload,
    iconSlidersHorizontal,
    iconSignal,
    iconRefreshCw,
    iconClipboardList,
    iconCodeXml,
    iconGift,
    iconMessageCircle,
    iconLink,
    iconInfo,
    iconChevronRight,
  } from './icons';
  import { navigate } from '../stores/navigation';
  import { openSupportModal } from '../stores/support-promo';
  import { getProfilePanelWidthPx, setProfilePanelWidthPx } from '../prefs';
  import { requestOpenExternal } from '../utils/external-link';

  interface Props {
    onClose: () => void;
    /** Свой wrap/backdrop — экран входа без Layout. */
    standalone?: boolean;
    /** Экран входа без titlebar — панель от верхнего края. */
    flushTop?: boolean;
  }

  const { onClose, standalone = false, flushTop = false }: Props = $props();

  export type SettingsTab =
    | 'account'
    | 'appearance'
    | 'connection'
    | 'behavior'
    | 'notifications'
    | 'playback'
    | 'discord'
    | 'update'
    | 'debug'
    | 'developer'
    | 'about';

  const TAB_TITLES: Record<SettingsTab, string> = {
    account: 'Моя учётная запись',
    appearance: 'Внешний вид',
    connection: 'Соединение',
    behavior: 'Поведение',
    notifications: 'Уведомления',
    playback: 'Воспроизведение',
    discord: 'Discord Rich Presence',
    update: 'Обновление',
    debug: 'Отладка',
    developer: 'Разработчик',
    about: 'О программе',
  };

  /** Пункт меню: открывает вкладку настроек или выполняет действие (ссылка, другой экран). */
  type MenuRow = {
    tab?: SettingsTab;
    title: string;
    sub?: string;
    icon: (size?: number) => string;
    action?: () => void;
    external?: boolean;
  };

  /** Группы — как на экране настроек Android: приложение · система · о проекте. */
  const MENU_GROUPS: { title: string; rows: MenuRow[] }[] = [
    {
      title: 'Приложение',
      rows: [
        { tab: 'appearance', title: 'Внешний вид', sub: 'Тема, масштаб, вид списков и навигация', icon: iconPalette },
        { tab: 'notifications', title: 'Уведомления', sub: 'Баннеры, звук и типы уведомлений', icon: iconBell },
        { tab: 'playback', title: 'Воспроизведение', sub: 'Anime4K, звук и горячие клавиши', icon: iconPlay },
        { tab: 'connection', title: 'Соединение', sub: 'Сервер API', icon: iconGlobe },
        { title: 'Загрузки', sub: 'Скачанные серии для просмотра без сети', icon: iconDownload, action: () => { close(); navigate('/downloads'); } },
      ],
    },
    {
      title: 'Система',
      rows: [
        { tab: 'behavior', title: 'Поведение', sub: 'Трей, ускорение и сведения о GPU', icon: iconSlidersHorizontal },
        { tab: 'discord', title: 'Discord Rich Presence', sub: 'Что вы смотрите — в статусе Discord', icon: iconSignal },
        { tab: 'update', title: 'Обновление', sub: 'Проверка обновлений и история версий', icon: iconRefreshCw },
        { tab: 'debug', title: 'Отладка', sub: 'Логи приложения и сети', icon: iconClipboardList },
      ],
    },
    {
      title: 'AnixApp',
      rows: [
        { title: 'Поддержать AnixApp', icon: iconGift, action: () => openSupportModal() },
        { title: 'Канал в Telegram', icon: iconMessageCircle, external: true, action: () => requestOpenExternal('https://t.me/anixapp') },
        { title: 'Исходный код на GitHub', icon: iconLink, external: true, action: () => requestOpenExternal('https://github.com/Anixapp-Community/anixapp') },
        { tab: 'about', title: 'О программе', icon: iconInfo },
      ],
    },
  ];

  const isDev = import.meta.env.DEV;
  const PANEL_ANIM_MS = 340;

  const initialTab = get(settingsModalInitialTab) as SettingsTab | null;
  let screen = $state<SettingsTab | 'menu'>(
    initialTab && initialTab in TAB_TITLES ? initialTab : 'menu',
  );
  let sheetOpen = $state(false);
  let closing = $state(false);
  let panelWidthPx = $state(getProfilePanelWidthPx());
  let appVersion = $state('AnixApp');
  let componentsLine = $state('');
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let bossLocked = $state(false);

  $effect(() => {
    const unsub = settingsBossFightLock.subscribe((v) => {
      bossLocked = v;
    });
    return unsub;
  });

  const backSegments = $derived(
    screen === 'menu'
      ? [{ label: 'Настройки', active: true }]
      : [{ label: TAB_TITLES[screen], active: true }, { label: 'Настройки' }],
  );

  $effect(() => {
    const next = $settingsModalInitialTab;
    if (next && next in TAB_TITLES) screen = next as SettingsTab;
  });

  function close() {
    if (bossLocked) return;
    if (standalone) {
      if (closing) return;
      closing = true;
      sheetOpen = false;
      if (closeTimer != null) clearTimeout(closeTimer);
      closeTimer = setTimeout(onClose, PANEL_ANIM_MS + 50);
      return;
    }
    onClose();
  }

  function goMenu() {
    if (bossLocked) return;
    screen = 'menu';
  }

  function openTab(tab: SettingsTab) {
    if (bossLocked) return;
    screen = tab;
  }

  function onHeadBack() {
    if (bossLocked) return;
    if (screen === 'menu') close();
    else goMenu();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!standalone) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (bossLocked) {
        e.preventDefault();
        return;
      }
      close();
    }
  }

  onMount(() => {
    if (standalone) {
      document.addEventListener('keydown', handleKeydown);
      window.addEventListener('anix:settingsPanelRequestClose', close);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!closing) sheetOpen = true;
        });
      });
    }

    if (typeof window.electron?.getVersions === 'function') {
      void window.electron.getVersions().then((v) => {
        if (v.app) appVersion = `AnixApp v${v.app}`;
        const parts: string[] = [];
        if (v.electron) parts.push(`Electron ${v.electron}`);
        if (v.chrome) parts.push(`Chrome ${v.chrome}`);
        if (v.node) parts.push(`Node ${v.node}`);
        const apiVer = v.anixapi || v.anixartjs;
        if (apiVer) parts.push(`AnixApi ${apiVer}`);
        componentsLine = parts.join(' · ');
      }).catch(() => {});
    } else if (typeof window.electron?.getAppVersion === 'function') {
      void window.electron.getAppVersion().then((v: string) => {
        if (v) appVersion = `AnixApp v${v}`;
      }).catch(() => {});
    }
  });

  onDestroy(() => {
    if (screen !== 'menu') settingsModalLastTab.set(screen);
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('anix:settingsPanelRequestClose', close);
    if (closeTimer != null) clearTimeout(closeTimer);
  });
</script>

{#snippet panelBody()}
  <div
    class="profile-panel"
    class:profile-panel--boss-lock={bossLocked}
    role="dialog"
    aria-modal="true"
    aria-label="Настройки приложения"
  >
    <header class="profile-panel__chrome" aria-hidden={bossLocked}>
      <div class="profile-panel__close">
        <UiV2RoundButton label="Закрыть" onclick={close} disabled={bossLocked}>
          {@html iconX(18)}
        </UiV2RoundButton>
      </div>
    </header>

    <Page scrollId="settings-panel" extraClass="profile-panel__page" noPadding>
      <div class="profile-panel__edit-view">
        <header class="profile-panel__friends-head" aria-hidden={bossLocked}>
          <UiV2BackBar segments={backSegments} onBack={onHeadBack} />
        </header>

        {#if screen === 'menu'}
          <div class="profile-panel__edit-menu settings-menu">
            {#each MENU_GROUPS as group, gi (group.title)}
              {#if gi > 0}<div class="profile-panel__edit-divider" aria-hidden="true"></div>{/if}
              <h3 class="settings-menu__group">{group.title}</h3>
              {#each group.rows as row (row.title)}
                <button
                  type="button"
                  class="settings-menu__row"
                  onclick={() => (row.tab ? openTab(row.tab) : row.action?.())}
                >
                  <span class="settings-menu__icon" aria-hidden="true">{@html row.icon(20)}</span>
                  <span class="settings-menu__text">
                    <span class="settings-menu__title">{row.title}</span>
                    {#if row.tab === 'about'}
                      <span class="settings-menu__sub">{appVersion}</span>
                    {:else if row.sub}
                      <span class="settings-menu__sub">{row.sub}</span>
                    {/if}
                  </span>
                  {#if !row.external}
                    <span class="settings-menu__chevron" aria-hidden="true">{@html iconChevronRight(16)}</span>
                  {/if}
                </button>
              {/each}
            {/each}

            {#if isDev}
              <div class="profile-panel__edit-divider" aria-hidden="true"></div>
              <h3 class="settings-menu__group">Разработчик</h3>
              <button type="button" class="settings-menu__row" onclick={() => openTab('developer')}>
                <span class="settings-menu__icon" aria-hidden="true">{@html iconCodeXml(20)}</span>
                <span class="settings-menu__text">
                  <span class="settings-menu__title">Разработчик</span>
                  <span class="settings-menu__sub">Мосты и UI Kit</span>
                </span>
                <span class="settings-menu__chevron" aria-hidden="true">{@html iconChevronRight(16)}</span>
              </button>
            {/if}

            <div class="profile-panel__edit-divider" aria-hidden="true"></div>
            <!-- Как внизу настроек Android: только версия, ссылки — пунктами выше -->
            <div class="settings-panel__meta">
              <span>{appVersion}</span>
              {#if componentsLine}
                <p class="settings-panel__meta-components">{componentsLine}</p>
              {/if}
            </div>
          </div>
        {:else}
          <div
            class="settings-panel__page"
            class:settings-panel__page--fill={screen === 'debug'}
          >
            {#if screen === 'account'}
              <AccountPage />
            {:else if screen === 'appearance'}
              <AppearancePage />
            {:else if screen === 'connection'}
              <ConnectionPage />
            {:else if screen === 'behavior'}
              <BehaviorPage />
            {:else if screen === 'notifications'}
              <NotificationsDevicePage />
            {:else if screen === 'playback'}
              <PlaybackPage />
            {:else if screen === 'discord'}
              <DiscordRpcPage />
            {:else if screen === 'update'}
              <UpdatePage />
            {:else if screen === 'debug'}
              <DebugPage />
            {:else if screen === 'developer'}
              <DeveloperPage />
            {:else}
              <AboutPage />
            {/if}
          </div>
        {/if}
      </div>
    </Page>
  </div>
{/snippet}

{#if standalone}
  <button
    type="button"
    class="schedule-panel-backdrop"
    class:schedule-panel-backdrop--open={sheetOpen}
    class:schedule-panel-backdrop--flush-top={flushTop}
    class:schedule-panel-backdrop--locked={bossLocked}
    aria-label="Закрыть настройки"
    disabled={bossLocked}
    onclick={close}
  ></button>

  <aside
    class="schedule-panel-wrap schedule-panel-wrap--profile schedule-panel-wrap--settings"
    class:schedule-panel-wrap--open={sheetOpen}
    class:schedule-panel-wrap--flush-top={flushTop}
    aria-label="Настройки"
    aria-hidden={!sheetOpen}
  >
    <div class="schedule-panel-shell schedule-panel-shell--profile" style={`width: ${panelWidthPx}px`}>
      <div class="schedule-panel-shell__body">
        {@render panelBody()}
      </div>
      <SidebarPanelResizeHandle
        widthPx={panelWidthPx}
        label="Ширина настроек"
        onWidthChange={(w) => {
          panelWidthPx = w;
        }}
        onWidthCommit={(w) => {
          panelWidthPx = setProfilePanelWidthPx(w);
        }}
      />
    </div>
  </aside>
{:else}
  {@render panelBody()}
{/if}
