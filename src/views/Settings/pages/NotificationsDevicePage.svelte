<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import UiV2Toggle from '../../../components/uikit-v2/UiV2Toggle.svelte';
  import UiV2SettingsRow from '../../../components/uikit-v2/UiV2SettingsRow.svelte';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import UiV2Select, { type UiV2SelectOption } from '../../../components/uikit-v2/UiV2Select.svelte';
  import NotificationPreferencesPanel from '../../../components/NotificationPreferencesPanel.svelte';
  import { iconVolume2, iconVolumeX } from '../../../components/icons';
  import {
    deviceNotificationSettings,
    loadDeviceNotificationSettings,
    saveDeviceNotificationSettings,
    previewNotificationSound,
    sendTestDeviceNotification,
    previewNotificationCorner,
    endNotificationCornerPreview,
    buildCornerPreviewItems,
    hasDeviceNotifications,
    type CornerPreviewItem,
  } from '../../../stores/device-notifications';
  import {
    BANNER_STYLE_OPTIONS,
    type NotificationBannerStyle,
    type NotificationKindId,
  } from '../../../utils/notification-kinds';
  import { resolveCdnAssetUrl } from '../../../utils/posterUrl';
  import type {
    NotificationBannerPosition,
    NotificationSoundOption,
  } from '../../../types/electron';

  const PREVIEW_IMAGE = resolveCdnAssetUrl(
    'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
  ) || 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg';

  let hasElectron = $state(false);
  let loaded = $state(false);
  let sounds = $state<NotificationSoundOption[]>([]);
  let previewing = $state(false);
  /** Угол под курсором — показываем стек примеров. */
  let hoverPosition = $state<NotificationBannerPosition | null>(null);
  /** Отложенный конец превью угла — чтобы не гаснуть при переходе между точками. */
  let cornerPreviewLeaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Персонализированные примеры: друзья / избранное. */
  let stylePreviewPool = $state<CornerPreviewItem[]>([
    {
      title: 'Серия',
      body: 'Вышла «11 серия» «Необъятный океан 3» · JAM CLUB',
      kind: 'episode',
      image: PREVIEW_IMAGE,
    },
    {
      title: 'Комментарий',
      body: '«PIKA_4Y»: зацени новую серию!',
      kind: 'comment',
      image: PREVIEW_IMAGE,
    },
    {
      title: 'Друзья',
      body: '«FlexHunterZ» добавил вас в друзья',
      kind: 'friend',
      image: PREVIEW_IMAGE,
    },
  ]);

  const settings = $derived($deviceNotificationSettings);
  const stylePreviewItems = $derived(stylePreviewPool.slice(0, 3));

  function onBannerStyleChange(value: string) {
    save({ bannerStyle: value as NotificationBannerStyle });
  }

  function cancelCornerPreviewLeave() {
    if (cornerPreviewLeaveTimer) {
      clearTimeout(cornerPreviewLeaveTimer);
      cornerPreviewLeaveTimer = null;
    }
  }

  function onCornerHover(pos: NotificationBannerPosition) {
    if (!settings.desktopEnabled || !hasElectron) return;
    hoverPosition = pos;
    cancelCornerPreviewLeave();
    void previewNotificationCorner(pos);
  }

  function onCornerLeave() {
    hoverPosition = null;
    cancelCornerPreviewLeave();
    cornerPreviewLeaveTimer = setTimeout(() => {
      cornerPreviewLeaveTimer = null;
      void endNotificationCornerPreview();
    }, 140);
  }

  function emphasizeQuotes(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/«([^»]+)»/g, '<b>«$1»</b>');
  }

  const POSITIONS: { id: NotificationBannerPosition; label: string }[] = [
    { id: 'top-left', label: 'Сверху слева' },
    { id: 'top-right', label: 'Сверху справа' },
    { id: 'bottom-left', label: 'Снизу слева' },
    { id: 'bottom-right', label: 'Снизу справа' },
  ];

  const soundOptions = $derived<UiV2SelectOption[]>(
    sounds.map((s) => ({ value: s.id, label: s.label, desc: s.desc })),
  );

  const styleOptions = $derived<UiV2SelectOption[]>(
    BANNER_STYLE_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.desc })),
  );

  function testKind(kind: NotificationKindId) {
    void previewNotificationSound(settings.soundId);
    void sendTestDeviceNotification(kind);
  }

  const volumePercent = $derived(Math.round(settings.volume));
  const previewCorner = $derived(hoverPosition ?? settings.position);
  const previewCount = $derived(settings.bannerCount);

  function save(patch: Parameters<typeof saveDeviceNotificationSettings>[0]) {
    return saveDeviceNotificationSettings(patch);
  }

  async function load() {
    hasElectron = hasDeviceNotifications();
    if (hasElectron) {
      await loadDeviceNotificationSettings();
      try {
        sounds = (await window.electron?.notifications?.listSounds?.()) ?? [];
      } catch {
        sounds = [];
      }
      try {
        const items = await buildCornerPreviewItems();
        if (items.length) stylePreviewPool = items;
      } catch {
        /* fallback samples остаются */
      }
    }
    loaded = true;
  }

  function onSoundChange(value: string) {
    save({ soundId: value });
    if (value !== 'off' && value !== 'system') void previewNotificationSound(value);
  }

  async function preview() {
    if (previewing) return;
    previewing = true;
    try {
      await previewNotificationSound(settings.soundId);
    } finally {
      setTimeout(() => { previewing = false; }, 400);
    }
  }

  function onVolumeInput(e: Event) {
    save({ volume: Number((e.target as HTMLInputElement).value) });
  }

  function onVolumeCommit(e: Event) {
    const value = Number((e.target as HTMLInputElement).value);
    save({ volume: value });
    void previewNotificationSound(settings.soundId);
  }

  onMount(() => void load());

  onDestroy(() => {
    cancelCornerPreviewLeave();
    void endNotificationCornerPreview();
  });
</script>

<div class="uiv2-settings">
  {#if !loaded}
    <p class="uiv2-settings__status">Загрузка…</p>
  {:else}
    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Что получать</h3>
      <p class="uiv2-settings__desc">Типы событий аккаунта — серии, записи, комментарии и жалобы</p>
      <div class="notif-prefs-wrap">
        <NotificationPreferencesPanel embedded />
      </div>
    </section>

    {#if !hasElectron}
      <p class="uiv2-settings__status">
        Тосты, баннеры и звук устройства доступны только в приложении Electron.
      </p>
    {:else}
      {#if settings.muted}
        <div class="uiv2-settings__notice" role="status">
          Режим «Не беспокоить» включён — уведомления устройства скрыты, события остаются в колокольчике.
        </div>
      {/if}

      <section class="uiv2-settings__block">
        <h3 class="uiv2-settings__title">Системная интеграция</h3>
        <div class="uiv2-settings__group">
          <UiV2SettingsRow
            title="Уведомления устройства"
            desc="Показывать уведомления вне приложения — даже когда окно свёрнуто"
          >
            <UiV2Toggle
              label="Уведомления устройства"
              checked={settings.desktopEnabled}
              onChange={(v) => save({ desktopEnabled: v })}
            />
          </UiV2SettingsRow>

          <UiV2SettingsRow
            title="Уведомления Windows"
            desc="Нативные тосты операционной системы (Центр уведомлений)"
          >
            <UiV2Toggle
              label="Уведомления Windows"
              checked={settings.useNativeNotifications}
              disabled={!settings.desktopEnabled}
              onChange={(v) => save({ useNativeNotifications: v })}
            />
          </UiV2SettingsRow>

          <UiV2SettingsRow
            title="Баннеры приложения"
            desc="Всплывающие карточки в углу экрана поверх других окон"
          >
            <UiV2Toggle
              label="Баннеры приложения"
              checked={settings.customBannersEnabled}
              disabled={!settings.desktopEnabled}
              onChange={(v) => save({ customBannersEnabled: v })}
            />
          </UiV2SettingsRow>

          <UiV2SettingsRow
            title="Режим «Не беспокоить»"
            desc="Скрывать всё, кроме счётчика в колокольчике"
          >
            <UiV2Toggle
              label="Не беспокоить"
              checked={settings.muted}
              onChange={(v) => save({ muted: v })}
            />
          </UiV2SettingsRow>
        </div>
      </section>

      <section class="uiv2-settings__block">
        <h3 class="uiv2-settings__title">Отображение</h3>
        <div class="uiv2-settings__group">
          <UiV2SettingsRow title="Внешний вид баннера" stack>
            <UiV2Select
              options={styleOptions}
              value={settings.bannerStyle}
              disabled={!settings.desktopEnabled}
              ariaLabel="Внешний вид баннера"
              onChange={onBannerStyleChange}
            />
            <div
              class="notif-style-live"
              class:notif-style-live--disabled={!settings.desktopEnabled}
              data-style={settings.bannerStyle}
              data-position={settings.position}
              aria-live="polite"
            >
              <div
                class="notif-style-live__stack notif-style-live__stack--{settings.position.startsWith('top') ? 'top' : 'bottom'}"
              >
                {#each stylePreviewItems as sample, i (sample.kind + settings.bannerStyle)}
                  {@const img = sample.image || PREVIEW_IMAGE}
                  {@const fullMedia = sample.kind === 'episode' || sample.kind === 'related' || sample.kind === 'release'}
                  <article
                    class="notif-style-live__card notif-style-live__card--{settings.bannerStyle}"
                    class:notif-style-live__card--full-media={settings.bannerStyle === 'full' && fullMedia}
                    class:notif-style-live__card--full-social={settings.bannerStyle === 'full' && !fullMedia}
                    data-kind={sample.kind}
                    style="animation-delay: {i * 45}ms"
                  >
                    {#if settings.bannerStyle === 'full' && fullMedia}
                      <span class="notif-style-live__media" style="background-image:url('{img}')"></span>
                      <span class="notif-style-live__scrim" aria-hidden="true"></span>
                    {:else if settings.bannerStyle === 'full'}
                      <span class="notif-style-live__avatar" style="background-image:url('{img}')"></span>
                    {:else if settings.bannerStyle === 'compact'}
                      <span class="notif-style-live__wash" style="background-image:url('{img}')" aria-hidden="true"></span>
                      <span class="notif-style-live__tint" aria-hidden="true"></span>
                      <span class="notif-style-live__thumb" style="background-image:url('{img}')"></span>
                    {:else}
                      <span class="notif-style-live__wash" style="background-image:url('{img}')" aria-hidden="true"></span>
                      <span class="notif-style-live__tint" aria-hidden="true"></span>
                    {/if}
                    <span class="notif-style-live__main">
                      <span class="notif-style-live__kind">{sample.title}</span>
                      <span class="notif-style-live__body">{@html emphasizeQuotes(sample.body)}</span>
                      {#if settings.bannerStyle === 'full'}
                        <span class="notif-style-live__time">только что</span>
                      {/if}
                    </span>
                  </article>
                {/each}
              </div>
              <p class="notif-style-live__hint">
                Меняйте стиль выше — превью обновляется сразу.
              </p>
            </div>
          </UiV2SettingsRow>

          <UiV2SettingsRow
            title="Показывать текст уведомления"
            desc="В баннере и системном тосте. Выключите, чтобы скрыть содержимое"
          >
            <UiV2Toggle
              label="Превью текста"
              checked={settings.showPreview}
              disabled={!settings.desktopEnabled}
              onChange={(v) => save({ showPreview: v })}
            />
          </UiV2SettingsRow>

          <UiV2SettingsRow
            title="Показывать, когда приложение открыто"
            desc="По умолчанию уведомления не дублируются, если вы уже в приложении"
          >
            <UiV2Toggle
              label="Показывать в фокусе"
              checked={settings.showWhenFocused}
              disabled={!settings.desktopEnabled}
              onChange={(v) => save({ showWhenFocused: v })}
            />
          </UiV2SettingsRow>

          <UiV2SettingsRow
            title="Мигать иконкой в панели задач"
            desc="Привлекать внимание, когда окно не в фокусе"
          >
            <UiV2Toggle
              label="Мигать в панели задач"
              checked={settings.flashTaskbar}
              disabled={!settings.desktopEnabled}
              onChange={(v) => save({ flashTaskbar: v })}
            />
          </UiV2SettingsRow>
        </div>
      </section>

      <section class="uiv2-settings__block">
        <h3 class="uiv2-settings__title">Расположение на экране</h3>
        <div class="uiv2-settings__group">
          <div class="notif-position" role="radiogroup" aria-label="Положение баннеров на экране">
            <div
              class="notif-position__screen"
              onmouseleave={onCornerLeave}
            >
              <span class="notif-position__monitor" aria-hidden="true">
                <svg width="88" height="60" viewBox="0 0 88 60" fill="none" focusable="false">
                  <rect x="2" y="2" width="84" height="50" rx="5" stroke="currentColor" stroke-width="2.5" opacity="0.55" />
                  <rect x="7" y="7" width="74" height="40" rx="3" fill="currentColor" opacity="0.08" />
                  <path d="M30 56h28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.55" />
                  <path d="M44 52v4" stroke="currentColor" stroke-width="2.5" opacity="0.55" />
                </svg>
              </span>

              <!-- Мини-индикатор в схеме; полный стек — на реальном экране при hover -->
              <div
                class="notif-position__preview notif-position__preview--{previewCorner}"
                aria-hidden="true"
              >
                {#each Array(previewCount) as _, i (i)}
                  <span
                    class="notif-position__toast"
                    style="animation-delay: {i * 40}ms"
                  ></span>
                {/each}
              </div>

              {#each POSITIONS as pos (pos.id)}
                <button
                  type="button"
                  class="notif-position__corner notif-position__corner--{pos.id}"
                  class:notif-position__corner--on={settings.position === pos.id}
                  class:notif-position__corner--hover={hoverPosition === pos.id}
                  role="radio"
                  aria-checked={settings.position === pos.id}
                  aria-label={pos.label}
                  disabled={!settings.desktopEnabled}
                  onmouseenter={() => onCornerHover(pos.id)}
                  onfocus={() => onCornerHover(pos.id)}
                  onblur={onCornerLeave}
                  onclick={() => {
                    save({ position: pos.id });
                    onCornerHover(pos.id);
                  }}
                >
                  <span class="notif-position__dot"></span>
                </button>
              {/each}
            </div>
            <p class="notif-position__caption">
              {POSITIONS.find((p) => p.id === previewCorner)?.label ?? 'Снизу справа'}
              · наведите на угол —
              {previewCount}
              {previewCount === 1 ? 'баннер' : previewCount < 5 ? 'баннера' : 'баннеров'}
              на экране
            </p>
          </div>

          <div class="uiv2-settings__row uiv2-settings__row--stack">
            <div class="uiv2-settings__row-info">
              <p class="uiv2-settings__row-title">Количество уведомлений</p>
              <p class="uiv2-settings__row-desc">Сколько баннеров показывать одновременно</p>
            </div>
            <div class="notif-count" role="radiogroup" aria-label="Количество уведомлений">
              {#each [1, 2, 3, 4, 5] as n (n)}
                <button
                  type="button"
                  class="notif-count__btn"
                  class:notif-count__btn--on={settings.bannerCount === n}
                  role="radio"
                  aria-checked={settings.bannerCount === n}
                  disabled={!settings.desktopEnabled}
                  onclick={() => {
                    void (async () => {
                      await save({ bannerCount: n });
                      const corner = hoverPosition ?? settings.position;
                      if (corner) await previewNotificationCorner(corner);
                    })();
                  }}
                >
                  <span class="notif-count__num">{n}</span>
                  <span class="notif-count__bar" aria-hidden="true"></span>
                </button>
              {/each}
            </div>
          </div>

          <UiV2SettingsRow
            title="Поверх других окон"
            desc="Баннеры остаются видимыми поверх полноэкранных приложений"
          >
            <UiV2Toggle
              label="Поверх всех окон"
              checked={settings.alwaysOnTop}
              disabled={!settings.desktopEnabled}
              onChange={(v) => save({ alwaysOnTop: v })}
            />
          </UiV2SettingsRow>
        </div>
      </section>

      <section class="uiv2-settings__block">
        <h3 class="uiv2-settings__title">Звук</h3>
        <div class="uiv2-settings__group">
          <UiV2SettingsRow
            title="Разрешить звук"
            desc="Проигрывать звук при новом уведомлении"
          >
            <UiV2Toggle
              label="Звук уведомлений"
              checked={settings.soundEnabled}
              disabled={!settings.desktopEnabled}
              onChange={(v) => save({ soundEnabled: v })}
            />
          </UiV2SettingsRow>

          <UiV2SettingsRow title="Звук уведомления" stack>
            <div class="notif-sound">
              <UiV2Select
                options={soundOptions}
                value={settings.soundId}
                disabled={!settings.desktopEnabled || !settings.soundEnabled}
                ariaLabel="Звук уведомления"
                onChange={onSoundChange}
              />
              <UiV2Button
                label={previewing ? 'Играет…' : 'Прослушать'}
                variant="chrome"
                size="sm"
                disabled={!settings.soundEnabled || settings.soundId === 'off' || settings.soundId === 'system'}
                onclick={() => void preview()}
              />
            </div>
          </UiV2SettingsRow>

          <UiV2SettingsRow title="Громкость" stack>
            <div class="notif-volume">
              <span class="notif-volume__icon" aria-hidden="true">
                {@html settings.volume <= 0 ? iconVolumeX(18) : iconVolume2(18)}
              </span>
              <input
                class="notif-volume__range"
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.volume}
                disabled={!settings.desktopEnabled || !settings.soundEnabled}
                aria-label="Громкость звука уведомлений"
                oninput={onVolumeInput}
                onchange={onVolumeCommit}
              />
              <span class="notif-volume__value">{volumePercent}%</span>
            </div>
          </UiV2SettingsRow>
        </div>
      </section>

      <section class="uiv2-settings__block">
        <div class="uiv2-settings__group">
          <UiV2SettingsRow
            title="Проверить уведомление"
            desc="Пример серии с текущим стилем и звуком"
          >
            <UiV2Button
              label="Проверить"
              variant="primary"
              size="sm"
              disabled={!settings.desktopEnabled}
              onclick={() => testKind('episode')}
            />
          </UiV2SettingsRow>
        </div>
      </section>
    {/if}
  {/if}
</div>
