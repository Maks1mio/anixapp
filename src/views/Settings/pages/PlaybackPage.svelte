<script lang="ts">
  import { onMount } from 'svelte';
  import UiV2Toggle from '../../../components/uikit-v2/UiV2Toggle.svelte';
  import UiV2SettingsRow from '../../../components/uikit-v2/UiV2SettingsRow.svelte';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import {
    DEFAULT_PLAYER_HOTKEYS,
    SEEK_SECONDS_OPTIONS,
    formatHotkeyCode,
    isBindableKeyCode,
    normalizePlayerHotkeys,
    rebindPlayerHotkey,
    type PlayerHotkeyBindField,
    type PlayerHotkeysSettings,
  } from '../../../utils/player-hotkeys';
  import {
    ANIME4K_INTENSITIES,
    ANIME4K_TARGET_RES,
    ANIME4K_TYPES,
    mapAnime4kPreset,
    normalizeAnime4kPreset,
    normalizeAnime4kTargetRes,
    type Anime4kIntensity,
    type Anime4kTargetRes,
    type Anime4kType,
  } from '../../Watch/core/anime4k-presets';
  import {
    SURROUND_GROUPS,
    normalizeSurroundMode,
    surroundModeDisplayLabel,
    surroundModeMeta,
    type SurroundMode,
  } from '../../Watch/core/surround-audio';
  import { initWebGpuAvailability } from '../../../utils/webgpu-availability.svelte';

  type BindField = PlayerHotkeyBindField;

  const HOTKEY_ROWS: { field: BindField; title: string; desc: string }[] = [
    { field: 'seekBackCode', title: 'Перемотка назад', desc: 'Клавиша для прыжка назад на заданное время.' },
    { field: 'seekForwardCode', title: 'Перемотка вперёд', desc: 'Клавиша для прыжка вперёд на заданное время.' },
    { field: 'playPauseCode', title: 'Пауза / воспроизведение', desc: 'По умолчанию — пробел.' },
    { field: 'volumeUpCode', title: 'Громче', desc: 'По умолчанию — стрелка вверх.' },
    { field: 'volumeDownCode', title: 'Тише', desc: 'По умолчанию — стрелка вниз.' },
    { field: 'fullscreenCode', title: 'Полный экран', desc: 'По умолчанию — F.' },
    { field: 'alwaysOnTopCode', title: 'Поверх всех окон', desc: 'Закрепить окно плеера поверх остальных. По умолчанию — P.' },
  ];

  let gpuAvailable = $state(false);
  let upscaleType = $state<Anime4kType>('off');
  let upscaleIntensity = $state<Anime4kIntensity>('optimal');
  let upscaleTargetRes = $state<Anime4kTargetRes>('1080');
  let audioSurround = $state<SurroundMode>('off');
  let playerDebugOverlay = $state(false);
  let adaptiveQualityByWindow = $state(false);
  let hotkeys = $state<PlayerHotkeysSettings>({ ...DEFAULT_PLAYER_HOTKEYS });
  let capturing = $state<BindField | null>(null);
  let playbackLoaded = $state(false);

  const mappedUpscale = $derived(mapAnime4kPreset({ type: upscaleType, intensity: upscaleIntensity }));

  async function loadPlayback() {
    if (!window.electron?.getSettings) return;
    gpuAvailable = await initWebGpuAvailability();
    const settings = await window.electron.getSettings();
    const preset = normalizeAnime4kPreset(settings);
    upscaleType = preset.type;
    upscaleIntensity = preset.intensity;
    upscaleTargetRes = normalizeAnime4kTargetRes(settings.upscaleTargetRes);
    audioSurround = normalizeSurroundMode(settings.audioSurround);
    playerDebugOverlay = settings.playerDebugOverlay === true;
    adaptiveQualityByWindow = settings.adaptiveQualityByWindow === true;
    hotkeys = normalizePlayerHotkeys(settings.playerHotkeys);
    playbackLoaded = true;
  }

  function saveUpscale() {
    const mapped = mapAnime4kPreset({ type: upscaleType, intensity: upscaleIntensity });
    window.electron?.saveSettings?.({
      upscaleEnabled: mapped.enabled,
      upscaleMode: mapped.mode,
      upscaleType,
      upscaleIntensity,
      upscaleTargetRes,
    });
    window.electron?.sendUpscaleSettings?.({
      upscaleEnabled: mapped.enabled,
      upscaleMode: mapped.mode,
      upscaleType,
      upscaleIntensity,
      upscaleTargetRes,
    });
    window.dispatchEvent(new CustomEvent('anix:upscaleChanged', {
      detail: {
        upscaleEnabled: mapped.enabled,
        upscaleMode: mapped.mode,
        upscaleType,
        upscaleIntensity,
        upscaleTargetRes,
      },
    }));
  }

  function saveSurround() {
    window.electron?.saveSettings?.({ audioSurround });
    window.dispatchEvent(new CustomEvent('anix:surroundChanged', {
      detail: { audioSurround },
    }));
  }

  function savePlayerDebug() {
    window.electron?.saveSettings?.({ playerDebugOverlay });
    window.dispatchEvent(new CustomEvent('anix:playerDebugChanged', { detail: { playerDebugOverlay } }));
  }

  function saveAdaptiveQuality() {
    window.electron?.saveSettings?.({ adaptiveQualityByWindow });
    window.dispatchEvent(new CustomEvent('anix:adaptiveQualityChanged', { detail: { adaptiveQualityByWindow } }));
  }

  function saveHotkeys(next: PlayerHotkeysSettings) {
    const normalized = normalizePlayerHotkeys(next);
    hotkeys = { ...normalized };
    void window.electron?.saveSettings?.({ playerHotkeys: { ...normalized } });
    window.electron?.sendPlayerHotkeys?.(normalized);
    window.dispatchEvent(new CustomEvent('anix:playerHotkeysChanged', { detail: { ...normalized } }));
  }

  function startCapture(field: BindField) {
    capturing = field;
  }

  function onCaptureKey(e: KeyboardEvent) {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') {
      capturing = null;
      return;
    }
    if (!isBindableKeyCode(e.code)) return;
    const field = capturing;
    capturing = null;
    saveHotkeys(rebindPlayerHotkey(hotkeys, field, e.code));
  }

  function formatSeekLabel(sec: number): string {
    if (sec < 60) return `${sec} с`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s === 0 ? `${m} мин` : `${m}:${String(s).padStart(2, '0')}`;
  }

  onMount(() => {
    void loadPlayback();
    window.addEventListener('keydown', onCaptureKey, true);
    return () => window.removeEventListener('keydown', onCaptureKey, true);
  });
</script>

<div class="uiv2-settings">
  {#if !window.electron?.getSettings}
    <p class="uiv2-settings__status">Настройки воспроизведения доступны только в приложении Electron.</p>
  {:else if !playbackLoaded}
    <p class="uiv2-settings__status">Загрузка…</p>
  {:else}
    {#if !gpuAvailable}
      <div class="uiv2-settings__notice uiv2-settings__notice--warn">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <circle cx="10" cy="10" r="8" />
          <line x1="10" y1="6" x2="10" y2="10.5" />
          <circle cx="10" cy="13.5" r=".7" fill="currentColor" stroke="none" />
        </svg>
        <span>Ваш GPU не поддерживает WebGPU — улучшение качества недоступно.</span>
      </div>
    {/if}

    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Горячие клавиши</h3>
      <div class="uiv2-settings__group">
        {#each HOTKEY_ROWS as row (row.field)}
          <UiV2SettingsRow title={row.title} desc={row.desc}>
            <button
              type="button"
              class="uiv2-settings__keybind"
              class:uiv2-settings__keybind--listen={capturing === row.field}
              aria-label={row.title}
              onclick={() => startCapture(row.field)}
            >
              {capturing === row.field ? '…' : formatHotkeyCode(hotkeys[row.field])}
            </button>
          </UiV2SettingsRow>
        {/each}

        <UiV2SettingsRow
          stack
          title="Время пропуска"
          desc="На сколько секунд прыгать клавишами перемотки (по умолчанию ← / →)."
        >
          <div class="uiv2-settings__chips" role="group" aria-label="Время пропуска">
            {#each SEEK_SECONDS_OPTIONS as sec (sec)}
              <button
                type="button"
                class="uiv2-settings__chip"
                class:uiv2-settings__chip--on={hotkeys.seekSeconds === sec}
                aria-pressed={hotkeys.seekSeconds === sec}
                onclick={() => saveHotkeys({ ...hotkeys, seekSeconds: sec })}
              >{formatSeekLabel(sec)}</button>
            {/each}
          </div>
        </UiV2SettingsRow>

        <UiV2SettingsRow
          title="Ctrl + колёсико — скорость"
          desc="Плавно ускорять и замедлять видео. Текущая скорость показывается на экране плеера."
        >
          <UiV2Toggle
            label="Ctrl + колёсико — скорость"
            checked={hotkeys.ctrlWheelSpeed}
            onChange={(checked) => saveHotkeys({ ...hotkeys, ctrlWheelSpeed: checked })}
          />
        </UiV2SettingsRow>

        <UiV2SettingsRow
          title="Сбросить горячие клавиши"
          desc="Вернуть ← / → / ↑ / ↓, пробел, F, P, 10 с и Ctrl + колёсико."
        >
          <UiV2Button
            label="Сбросить"
            variant="chrome"
            size="sm"
            onclick={() => saveHotkeys({ ...DEFAULT_PLAYER_HOTKEYS })}
          />
        </UiV2SettingsRow>
      </div>
    </section>

    <div class="uiv2-settings__notice">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
        <circle cx="10" cy="10" r="8" />
        <line x1="10" y1="9" x2="10" y2="14" />
        <circle cx="10" cy="6.5" r=".7" fill="currentColor" stroke="none" />
      </svg>
      <span>Технология Anime4K улучшает видео в реальном времени, используя WebGPU. Она повышает резкость, убирает шум и улучшает общую чёткость изображения. Не добавляет новых деталей — улучшает уже имеющиеся.</span>
    </div>

    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Anime4K</h3>
      <p class="uiv2-settings__desc">Тип обработки и нагрузка — как в AnixPlayer. Без WebGPU пресеты недоступны.</p>
      <div class="uiv2-settings__group uiv2-settings__group--pad" class:uiv2-settings__group--disabled={!gpuAvailable}>
        <div class="uiv2-settings__chips" role="radiogroup" aria-label="Целевое разрешение">
          {#each ANIME4K_TARGET_RES as opt (opt.id)}
            <button
              type="button"
              role="radio"
              aria-checked={upscaleTargetRes === opt.id}
              class="uiv2-settings__chip"
              class:uiv2-settings__chip--on={upscaleTargetRes === opt.id}
              disabled={!gpuAvailable || upscaleType === 'off'}
              title={opt.id === 'auto' ? 'Под размер окна · может вызывать моргание' : `Рендер ${opt.label}`}
              onclick={() => { upscaleTargetRes = opt.id; saveUpscale(); }}
            >{opt.id === 'auto' ? 'Авто · под окно' : opt.label}</button>
          {/each}
        </div>
        <div class="uiv2-settings__chips" role="radiogroup" aria-label="Тип улучшения">
          {#each ANIME4K_TYPES as opt (opt.id)}
            <button
              type="button"
              role="radio"
              aria-checked={upscaleType === opt.id}
              class="uiv2-settings__chip"
              class:uiv2-settings__chip--on={upscaleType === opt.id}
              disabled={!gpuAvailable}
              title={opt.recommended ? `${opt.hint} (рекомендуется)` : opt.hint}
              onclick={() => { upscaleType = opt.id; saveUpscale(); }}
            >
              {opt.label}
              {#if opt.recommended}<span class="uiv2-settings__chip-star">★</span>{/if}
            </button>
          {/each}
        </div>
        <div class="uiv2-settings__chips" role="radiogroup" aria-label="Нагрузка">
          {#each ANIME4K_INTENSITIES as opt (opt.id)}
            <button
              type="button"
              role="radio"
              aria-checked={upscaleIntensity === opt.id}
              class="uiv2-settings__chip"
              class:uiv2-settings__chip--on={upscaleIntensity === opt.id}
              disabled={!gpuAvailable || upscaleType === 'off'}
              onclick={() => { upscaleIntensity = opt.id; saveUpscale(); }}
            >{opt.label}</button>
          {/each}
        </div>
        {#if mappedUpscale.enabled}
          <p class="uiv2-settings__hint">{ANIME4K_TYPES.find((t) => t.id === upscaleType)?.hint}</p>
        {/if}
      </div>
    </section>

    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Объёмный звук</h3>
      <p class="uiv2-settings__desc">
        Кино HRTF, Imaging, Spatial, IRCAM и графический эквалайзер (±12 дБ). Тонкая настройка EQ — в плеере.
      </p>
      <div class="uiv2-settings__group uiv2-settings__group--pad">
        <div class="uiv2-settings__chips" role="radiogroup" aria-label="Эквалайзер">
          <button
            type="button"
            role="radio"
            aria-checked={audioSurround === 'equalizer'}
            class="uiv2-settings__chip"
            class:uiv2-settings__chip--on={audioSurround === 'equalizer'}
            title="10 полос, ручная настройка ±12 дБ · в плеере"
            onclick={() => { audioSurround = 'equalizer'; saveSurround(); }}
          >{surroundModeDisplayLabel('equalizer', true)}</button>
        </div>
        <div class="uiv2-settings__chips" role="radiogroup" aria-label="Объёмный звук выкл">
          <button
            type="button"
            role="radio"
            aria-checked={audioSurround === 'off'}
            class="uiv2-settings__chip"
            class:uiv2-settings__chip--on={audioSurround === 'off'}
            onclick={() => { audioSurround = 'off'; saveSurround(); }}
          >{surroundModeDisplayLabel('off')}</button>
        </div>
        {#each SURROUND_GROUPS as group (group.label)}
          <p class="uiv2-settings__subhead">{group.label}</p>
          <div class="uiv2-settings__chips" role="radiogroup" aria-label={group.label}>
            {#each group.modes as modeId (modeId)}
              {@const opt = surroundModeMeta(modeId)}
              {#if opt}
                <button
                  type="button"
                  role="radio"
                  aria-checked={audioSurround === opt.id}
                  class="uiv2-settings__chip"
                  class:uiv2-settings__chip--on={audioSurround === opt.id}
                  title={(opt.hint ?? opt.label) + (opt.lib ? ` · ${opt.lib}` : '')}
                  onclick={() => { audioSurround = opt.id; saveSurround(); }}
                >
                  {surroundModeDisplayLabel(opt.id, true)}
                </button>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    </section>

    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Качество потока</h3>
      <div class="uiv2-settings__group">
        <UiV2SettingsRow
          title="Качество по размеру окна"
          desc="Чем меньше окно плеера, тем ниже поток: 1080 → 720 → 480 → 360. Удобно для режима «поверх всех окон». По умолчанию выключено."
        >
          <UiV2Toggle
            label="Качество по размеру окна"
            checked={adaptiveQualityByWindow}
            onChange={(checked) => {
              adaptiveQualityByWindow = checked;
              saveAdaptiveQuality();
            }}
          />
        </UiV2SettingsRow>
      </div>
    </section>

    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Отладка плеера</h3>
      <div class="uiv2-settings__group">
        <UiV2SettingsRow
          title="HUD на экране плеера"
          desc="Разрешение потока и окна, битрейт HLS, кадры, состояние Anime4K / WebGPU и размер canvas."
        >
          <UiV2Toggle
            label="Отладочный HUD плеера"
            checked={playerDebugOverlay}
            onChange={(checked) => {
              playerDebugOverlay = checked;
              savePlayerDebug();
            }}
          />
        </UiV2SettingsRow>
      </div>
    </section>

    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Инструменты разработки</h3>
      <div class="uiv2-settings__group">
        <UiV2SettingsRow
          title="Предпросмотр моделей"
          desc="Открыть инструмент сравнения — 5 пресетов аниме, split-ползунок для сравнения оригинала и фильтра в реальном времени."
        >
          <UiV2Button
            label="Открыть"
            variant="primary"
            size="sm"
            onclick={() => window.electron?.openUpscaleTool?.()}
          />
        </UiV2SettingsRow>
      </div>
    </section>
  {/if}
</div>
