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
  import { pushBackHandler } from '../platform/mobile-back';
  import { getMobilePlayerPrefs, setMobilePlayerPrefs, type MobilePlayerKind } from '../utils/mobile-player';
  import {
    getCardLayout,
    setCardLayout,
    getDefaultBookmarksTab,
    setDefaultBookmarksTab,
    type BookmarksTabId,
    type CardLayout,
  } from '../prefs';
  import { requestOpenExternal } from '../utils/external-link';
  import { getAllThemes, getActiveThemeId, applyThemeById } from '../services/themes';
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
    iconMoon,
  } from '../components/icons';
  import NotificationPreferencesPanel from '../components/NotificationPreferencesPanel.svelte';
  import PlaybackPage from '../views/Settings/pages/PlaybackPage.svelte';
  import ConnectionPage from '../views/Settings/pages/ConnectionPage.svelte';
  import MobileSupport from './MobileSupport.svelte';
  import AboutPage from '../views/Settings/pages/AboutPage.svelte';

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

  type Screen = 'menu' | 'notifications' | 'playback' | 'appearance' | 'connection' | 'support' | 'about';

  const TITLES: Record<Screen, string> = {
    menu: 'Настройки',
    notifications: 'Уведомления',
    playback: 'Воспроизведение',
    appearance: 'Внешний вид',
    connection: 'Соединение',
    support: 'Anix+',
    about: 'О приложении',
  };

  type MenuItem = { screen?: Screen; title: string; icon: (s: number) => string; action?: () => void };
  const MENU: MenuItem[][] = [
    [
      { screen: 'notifications', title: 'Уведомления', icon: iconBell },
      { screen: 'playback', title: 'Воспроизведение', icon: iconPlay },
      { screen: 'appearance', title: 'Внешний вид', icon: iconPalette },
      { screen: 'connection', title: 'Соединение', icon: iconGlobe },
      { title: 'Загрузки', icon: iconDownload, action: () => { onClose(); navigate('/downloads'); } },
    ],
    [
      { screen: 'support', title: 'Поддержать AnixApp', icon: iconGift },
      { title: 'Канал в Telegram', icon: iconMessageCircle, action: () => requestOpenExternal('https://t.me/anixapp') },
      { title: 'Исходный код на GitHub', icon: iconLink, action: () => requestOpenExternal('https://github.com/Maks1mio/anixapp') },
      { screen: 'about', title: 'О приложении', icon: iconInfo },
    ],
  ];

  /** Вкладки desktop-настроек, у которых есть мобильный аналог. */
  const FROM_DESKTOP_TAB: Record<string, Screen> = {
    notifications: 'notifications',
    playback: 'playback',
    appearance: 'appearance',
    connection: 'connection',
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
    { value: 'anix', label: 'АниксПлеер', hint: 'Наш самый продвинутый плеер с наилучшим качеством' },
    { value: 'web', label: 'Веб-плеер', hint: 'Просмотр в плеере источника' },
    { value: 'external', label: 'Сторонний плеер', hint: 'Любой плеер, установленный на устройстве' },
  ];
  const LAYOUT_OPTIONS: ChoiceOption[] = [
    { value: 'wide', label: 'Списком' },
    { value: 'mini', label: 'Карточками' },
  ];
  const BOOKMARKS_OPTIONS: ChoiceOption[] = [
    { value: 'watching', label: 'Смотрю' },
    { value: 'planned', label: 'В планах' },
    { value: 'completed', label: 'Просмотрено' },
    { value: 'on_hold', label: 'Отложено' },
    { value: 'dropped', label: 'Брошено' },
    { value: 'collections', label: 'Коллекции' },
    { value: 'history', label: 'История' },
    { value: 'votes', label: 'Оценки' },
    { value: 'favorites', label: 'Избранное' },
  ];

  let themeId = $state(getActiveThemeId());
  /** Те же темы, что и на ПК: встроенные + пользовательские (на телефоне — в палитре Anixart, см. themes.ts). */
  const themeOptions = (): ChoiceOption[] =>
    getAllThemes().map((t) => ({
      value: t.id,
      label: t.name,
      hint: t.id === 'auto' ? 'Как в системе' : t.builtIn ? undefined : 'Пользовательская',
    }));

  function pickTheme() {
    choice = {
      title: 'Тема',
      options: themeOptions(),
      value: themeId,
      onPick: (v) => {
        applyThemeById(v);
        themeId = v;
      },
    };
  }

  let playerPrefs = $state(getMobilePlayerPrefs());
  let cardLayout = $state<CardLayout>(getCardLayout());
  let bookmarksTab = $state<BookmarksTabId>(getDefaultBookmarksTab());

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

  function pickLayout() {
    choice = {
      title: 'Вид списков релизов',
      options: LAYOUT_OPTIONS,
      value: cardLayout,
      onPick: (v) => {
        cardLayout = v as CardLayout;
        setCardLayout(cardLayout);
      },
    };
  }

  function pickBookmarksTab() {
    choice = {
      title: 'Вкладка закладок по умолчанию',
      options: BOOKMARKS_OPTIONS,
      value: bookmarksTab,
      onPick: (v) => { bookmarksTab = setDefaultBookmarksTab(v); },
    };
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
      <div class="m-pref-space"></div>
      <button type="button" class="m-pref m-pref--icon" onclick={pickTheme}>
        <span class="m-pref__icon">{@html iconMoon(24)}</span>
        <span class="m-pref__text">
          <span class="m-pref__title">Тема</span>
          <span class="m-pref__summary">{labelOf(themeOptions(), themeId)}</span>
        </span>
      </button>
      {#each MENU as group (group[0].title)}
        <div class="m-pref-sep" role="separator"></div>
        {#each group as item (item.title)}
          <button
            type="button"
            class="m-pref m-pref--icon"
            onclick={() => (item.screen ? open(item.screen) : item.action?.())}
          >
            <span class="m-pref__icon">{@html item.icon(24)}</span>
            <span class="m-pref__text"><span class="m-pref__title">{item.title}</span></span>
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
      <h2 class="m-pref-cat">Встроенный плеер</h2>
      <div class="m-settings__desktop"><PlaybackPage /></div>

    {:else if screen === 'appearance'}
      <button type="button" class="m-pref" onclick={pickTheme}>
        <span class="m-pref__text">
          <span class="m-pref__title">Тема</span>
          <span class="m-pref__summary">{labelOf(themeOptions(), themeId)}</span>
        </span>
      </button>
      <button type="button" class="m-pref" onclick={pickLayout}>
        <span class="m-pref__text">
          <span class="m-pref__title">Вид списков релизов</span>
          <span class="m-pref__summary">{labelOf(LAYOUT_OPTIONS, cardLayout)}</span>
        </span>
      </button>
      <button type="button" class="m-pref" onclick={pickBookmarksTab}>
        <span class="m-pref__text">
          <span class="m-pref__title">Вкладка закладок по умолчанию</span>
          <span class="m-pref__summary">{labelOf(BOOKMARKS_OPTIONS, bookmarksTab)}</span>
        </span>
      </button>

    {:else if screen === 'notifications'}
      <div class="m-settings__desktop"><NotificationPreferencesPanel embedded /></div>
    {:else if screen === 'connection'}
      <div class="m-settings__desktop"><ConnectionPage /></div>
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
