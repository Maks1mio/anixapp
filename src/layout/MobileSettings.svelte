<script lang="ts">
  /**
   * Настройки на телефоне — по структуре экрана настроек Anixart (preference_main.xml): тулбар «назад + заголовок»,
   * список разделов с иконками, разделители-группы. Внутри разделов — те же страницы, что и в desktop
   * (PlaybackPage, ConnectionPage …), перекрашенные под список настроек Android в mobile-settings.scss.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { settingsModalInitialTab } from '../stores/modals';
  import { navigate } from '../stores/navigation';
  import { isAuthenticated } from '../stores/auth';
  import { hasQrScanner } from '../native/anix-qr';
  import { pushBackHandler } from '../platform/mobile-back';
  import { getMobilePlayerPrefs, setMobilePlayerPrefs, type MobilePlayerKind } from '../utils/mobile-player';
  import { requestOpenExternal } from '../utils/external-link';
  import {
    iconArrowLeft,
    iconBell,
    iconPlay,
    iconPalette,
    iconGlobe,
    iconDownload,
    iconGift,
    iconInfo,
    iconLink,
    iconMessageCircle,
    iconQrCode,
    iconSignal,
    iconRefreshCw,
    iconClipboardList,
    iconCodeXml,
    iconChevronRight,
  } from '../components/icons';
  import NotificationsDevicePage from '../views/Settings/pages/NotificationsDevicePage.svelte';
  import PlaybackPage from '../views/Settings/pages/PlaybackPage.svelte';
  import ConnectionPage from '../views/Settings/pages/ConnectionPage.svelte';
  import MobileSupport from './MobileSupport.svelte';
  import MobileQrSignIn from './MobileQrSignIn.svelte';
  import AboutPage from '../views/Settings/pages/AboutPage.svelte';
  import AppearancePage from '../views/Settings/pages/AppearancePage.svelte';
  import BehaviorPage from '../views/Settings/pages/BehaviorPage.svelte';
  import DeveloperPage from '../views/Settings/pages/DeveloperPage.svelte';

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

  type Screen =
    | 'menu'
    | 'notifications'
    | 'playback'
    | 'appearance'
    | 'connection'
    | 'qr'
    | 'discord'
    | 'update'
    | 'debug'
    | 'developer'
    | 'support'
    | 'about';

  const TITLES: Record<Screen, string> = {
    menu: 'Настройки',
    notifications: 'Уведомления',
    playback: 'Воспроизведение',
    appearance: 'Внешний вид',
    connection: 'Соединение',
    qr: 'Вход по QR',
    discord: 'Discord Rich Presence',
    update: 'Обновление',
    debug: 'Отладка',
    developer: 'Разработчик',
    support: 'Anix+',
    about: 'О программе',
  };

  /** Те же группы, пункты и подписи, что в настройках ПК (SettingsModal) — плюс вход по QR, которого на ПК нет. */
  type MenuItem = {
    screen?: Screen;
    title: string;
    sub?: string;
    icon: (s: number) => string;
    action?: () => void;
    /** Внешняя ссылка — без стрелки перехода */
    external?: boolean;
  };
  const appVersionLabel = `AnixApp ${__ANIXAPP_VERSION__ ? `v${__ANIXAPP_VERSION__}` : ''}`.trim();
  const MENU: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Приложение',
      items: [
        { screen: 'appearance', title: 'Внешний вид', sub: 'Тема, вид списков и вкладка закладок', icon: iconPalette },
        { screen: 'notifications', title: 'Уведомления', sub: 'Баннеры, звук и типы уведомлений', icon: iconBell },
        { screen: 'playback', title: 'Воспроизведение', sub: 'Плеер, Anime4K и перемотка', icon: iconPlay },
        { screen: 'connection', title: 'Соединение', sub: 'Сервер API', icon: iconGlobe },
        { title: 'Загрузки', sub: 'Скачанные серии для просмотра без сети', icon: iconDownload, action: () => { onClose(); navigate('/downloads'); } },
        // Разрешить вход можно только из своего аккаунта и только там, где есть камера
        ...(hasQrScanner() && get(isAuthenticated)
          ? [{ screen: 'qr' as const, title: 'Вход по QR', sub: 'Войти на ПК или TV по коду с экрана', icon: iconQrCode }]
          : []),
      ],
    },
    {
      title: 'Система',
      items: [
        { screen: 'discord', title: 'Discord Rich Presence', sub: 'Что вы смотрите — в статусе Discord', icon: iconSignal },
        { screen: 'update', title: 'Обновление', sub: 'Версия приложения и новые выпуски', icon: iconRefreshCw },
        { screen: 'debug', title: 'Отладка', sub: 'Логи приложения и сети', icon: iconClipboardList },
      ],
    },
    {
      title: 'AnixApp',
      items: [
        { screen: 'support', title: 'Поддержать AnixApp', icon: iconGift },
        { title: 'Канал в Telegram', icon: iconMessageCircle, external: true, action: () => requestOpenExternal('https://t.me/anixapp') },
        { title: 'Исходный код на GitHub', icon: iconLink, external: true, action: () => requestOpenExternal('https://github.com/Maks1mio/anixapp') },
        { screen: 'about', title: 'О программе', sub: appVersionLabel, icon: iconInfo },
      ],
    },
    ...(import.meta.env.DEV
      ? [{ title: 'Разработчик', items: [{ screen: 'developer' as const, title: 'Разработчик', sub: 'Мосты и UI Kit', icon: iconCodeXml }] }]
      : []),
  ];

  /** Вкладки desktop-настроек, у которых есть мобильный аналог. */
  const FROM_DESKTOP_TAB: Record<string, Screen> = {
    notifications: 'notifications',
    playback: 'playback',
    appearance: 'appearance',
    connection: 'connection',
    // На телефоне сведения о видеокарте живут в «Воспроизведении»
    behavior: 'playback',
    discord: 'discord',
    update: 'update',
    debug: 'debug',
    developer: 'developer',
    support: 'support',
    about: 'about',
  };

  const initial = get(settingsModalInitialTab);
  let screen = $state<Screen>((initial && FROM_DESKTOP_TAB[initial]) || 'menu');
  let bodyEl = $state<HTMLElement | null>(null);

  function open(next: Screen) {
    screen = next;
    bodyEl?.scrollTo(0, 0);
  }

  function back() {
    if (screen === 'menu') onClose();
    else open('menu');
  }

  // ── Списочные настройки (как CustomListPreference: диалог с радиокнопками) ───────────────
  type ChoiceOption = { value: string; label: string; hint?: string };
  type Choice = { title: string; options: ChoiceOption[]; value: string; onPick: (v: string) => void };
  let choice = $state<Choice | null>(null);

  const PLAYER_OPTIONS: ChoiceOption[] = [
    { value: 'builtin', label: 'Встроенный плеер', hint: 'Простой и удобный, не требует отдельного скачивания' },
    { value: 'web', label: 'Веб-плеер', hint: 'Просмотр в плеере источника' },
    { value: 'external', label: 'Сторонний плеер', hint: 'Любой плеер, установленный на устройстве' },
  ];

  let playerPrefs = $state(getMobilePlayerPrefs());

  const labelOf = (opts: ChoiceOption[], v: string) => opts.find((o) => o.value === v)?.label ?? '';

  function pickPlayer() {
    choice = {
      title: 'Плеер',
      options: PLAYER_OPTIONS,
      value: playerPrefs.kind,
      onPick: (v) => {
        playerPrefs = { ...playerPrefs, kind: v as MobilePlayerKind };
        setMobilePlayerPrefs(playerPrefs);
      },
    };
  }

  function toggleAskPlayer() {
    playerPrefs = { ...playerPrefs, ask: !playerPrefs.ask };
    setMobilePlayerPrefs(playerPrefs);
  }



  function choose(v: string) {
    choice?.onPick(v);
    choice = null;
  }

  onMount(() =>
    pushBackHandler(() => {
      if (choice) choice = null;
      else back();
      return true;
    }),
  );
</script>

<div class="m-settings">
  <header class="m-pref-bar">
    <button type="button" class="m-pref-bar__back" onclick={back} aria-label="Назад">{@html iconArrowLeft(24)}</button>
    <h1 class="m-pref-bar__title">{TITLES[screen]}</h1>
  </header>

  <div class="m-settings__body" bind:this={bodyEl}>
    {#if screen === 'menu'}
      {#each MENU as group, gi (group.title)}
        {#if gi > 0}<div class="m-pref-sep" role="separator"></div>{/if}
        <h2 class="m-pref-group">{group.title}</h2>
        {#each group.items as item (item.title)}
          <button
            type="button"
            class="m-pref m-pref--icon"
            onclick={() => (item.screen ? open(item.screen) : item.action?.())}
          >
            <span class="m-pref__icon">{@html item.icon(24)}</span>
            <span class="m-pref__text">
              <span class="m-pref__title">{item.title}</span>
              {#if item.sub}<span class="m-pref__summary">{item.sub}</span>{/if}
            </span>
            {#if !item.external}
              <span class="m-pref__chevron" aria-hidden="true">{@html iconChevronRight(18)}</span>
            {/if}
          </button>
        {/each}
      {/each}
      <p class="m-pref-version">AnixApp Mobile {__ANIXAPP_VERSION__ ? `v${__ANIXAPP_VERSION__}` : ''}</p>

    {:else if screen === 'playback'}
      <button type="button" class="m-pref" onclick={pickPlayer}>
        <span class="m-pref__text">
          <span class="m-pref__title">Плеер</span>
          <span class="m-pref__summary">{labelOf(PLAYER_OPTIONS, playerPrefs.kind)}</span>
        </span>
      </button>
      <button type="button" class="m-pref" role="switch" aria-checked={playerPrefs.ask} onclick={toggleAskPlayer}>
        <span class="m-pref__text">
          <span class="m-pref__title">Спрашивать перед просмотром</span>
          <span class="m-pref__summary">Показывать выбор плеера перед каждой серией</span>
        </span>
        <span class="m-switch" class:m-switch--on={playerPrefs.ask} aria-hidden="true"></span>
      </button>
      <!-- Адаптивное ускорение и видеокарта (на ПК — в «Поведении»): от них зависит Anime4K -->
      <div class="m-settings__desktop"><BehaviorPage embedded /></div>
      <h2 class="m-pref-cat">Встроенный плеер</h2>
      <div class="m-settings__desktop"><PlaybackPage /></div>

    {:else if screen === 'appearance'}
      <div class="m-settings__desktop"><AppearancePage /></div>

    {:else if screen === 'notifications'}
      <div class="m-settings__desktop"><NotificationsDevicePage /></div>
    {:else if screen === 'connection'}
      <div class="m-settings__desktop"><ConnectionPage /></div>
    {:else if screen === 'discord'}
      <div class="m-pref-note">
        <p>Статус в Discord показывает AnixApp на компьютере: ему нужен запущенный Discord на том же устройстве.</p>
        <p>На телефоне Discord не даёт приложениям менять статус, поэтому здесь настраивать нечего. Включите статус в AnixApp на ПК — его увидят и в мобильном Discord.</p>
      </div>
    {:else if screen === 'update'}
      <div class="m-pref-note">
        <p>Установлена версия <b>{appVersionLabel}</b>.</p>
        <p>На телефоне AnixApp обновляется установкой нового APK. Свежие выпуски и список изменений — на странице релизов.</p>
      </div>
      <button
        type="button"
        class="m-pref"
        onclick={() => requestOpenExternal('https://github.com/Maks1mio/anixapp/releases')}
      >
        <span class="m-pref__text">
          <span class="m-pref__title">Открыть страницу релизов</span>
          <span class="m-pref__summary">github.com/Maks1mio/anixapp/releases</span>
        </span>
      </button>
    {:else if screen === 'debug'}
      <div class="m-pref-note">
        <p>Подробный журнал запросов и ошибок ведёт AnixApp на ПК. На телефоне есть диагностика устройства: модель GPU, WebGPU и готовность Anime4K.</p>
      </div>
      <button type="button" class="m-pref" onclick={() => open('playback')}>
        <span class="m-pref__text">
          <span class="m-pref__title">Диагностика устройства</span>
          <span class="m-pref__summary">Воспроизведение → Видеокарта</span>
        </span>
        <span class="m-pref__chevron" aria-hidden="true">{@html iconChevronRight(18)}</span>
      </button>
    {:else if screen === 'developer'}
      <div class="m-settings__desktop"><DeveloperPage /></div>
    {:else if screen === 'qr'}
      <MobileQrSignIn />
    {:else if screen === 'support'}
      <MobileSupport />
    {:else}
      <div class="m-settings__desktop"><AboutPage /></div>
    {/if}
  </div>

  {#if choice}
    <div class="m-pref-dialog-scrim" role="presentation">
      <button type="button" class="m-pref-dialog-scrim__bg" aria-label="Закрыть" onclick={() => (choice = null)}></button>
      <div class="m-pref-dialog" role="dialog" aria-modal="true" aria-label={choice.title}>
        <h2 class="m-pref-dialog__title">{choice.title}</h2>
        <div class="m-pref-dialog__list" role="radiogroup">
          {#each choice.options as o (o.value)}
            <button
              type="button"
              class="m-pref-radio"
              role="radio"
              aria-checked={choice.value === o.value}
              onclick={() => choose(o.value)}
            >
              <span class="m-pref-radio__dot" class:m-pref-radio__dot--on={choice.value === o.value}></span>
              <span class="m-pref-radio__text">
                <span>{o.label}</span>
                {#if o.hint}<small>{o.hint}</small>{/if}
              </span>
            </button>
          {/each}
        </div>
        <div class="m-pref-dialog__actions">
          <button type="button" onclick={() => (choice = null)}>Отмена</button>
        </div>
      </div>
    </div>
  {/if}
</div>
