<script lang="ts">
  import { onMount } from 'svelte';
  import UiV2Toggle from '../../../components/uikit-v2/UiV2Toggle.svelte';
  import UiV2SettingsRow from '../../../components/uikit-v2/UiV2SettingsRow.svelte';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import {
    DEFAULT_PLAYER_HOTKEYS,
    REWIND_SECONDS_MAX,
    REWIND_SECONDS_MIN,
    REWIND_SECONDS_OPTIONS,
    SEEK_SECONDS_OPTIONS,
    formatHotkeyCode,
    formatSeekSeconds,
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
    MOBILE_ANIME4K_INTENSITIES,
    MOBILE_ANIME4K_TARGET_RES,
    MOBILE_ANIME4K_TYPES,
    clampAnime4kPresetForMobile,
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
  import { initWebGpuAvailability, getWebGpuUnavailableReason } from '../../../utils/webgpu-availability.svelte';
  import { isMac } from '../../../utils/platform';
  import { hasAppSettingsStore, loadAppSettings, saveAppSettings } from '../../../utils/app-settings';
  import { isMobileMode } from '../../../platform/mobile';

  const modKey = isMac ? '⌘' : 'Ctrl';
  /** Телефон: клавиатурных биндов и окон-инструментов нет — остаются только интервалы перемотки. */
  const touchOnly = isMobileMode();

  type BindField = PlayerHotkeyBindField;

  const HOTKEY_ROWS: { field: BindField; title: string; desc: string }[] = [
    { field: 'seekBackCode', title: 'Перемотка назад', desc: 'Клавиша для прыжка назад на заданное время. По умолчанию — ←.' },
    { field: 'seekForwardCode', title: 'Перемотка вперёд', desc: 'Клавиша для прыжка вперёд на заданное время. По умолчанию — →.' },
    { field: 'rewindCode', title: 'Пропуск на заданное время', desc: 'Прыжок вперёд на время из блока «Время пропуска». По умолчанию — X.' },
    { field: 'playPauseCode', title: 'Пауза / воспроизведение', desc: 'По умолчанию — пробел.' },
    { field: 'volumeUpCode', title: 'Громче', desc: 'По умолчанию — ↑.' },
    { field: 'volumeDownCode', title: 'Тише', desc: 'По умолчанию — ↓.' },
    { field: 'fullscreenCode', title: 'Полный экран', desc: 'По умолчанию — F.' },
    { field: 'alwaysOnTopCode', title: 'Поверх всех окон', desc: 'Закрепить окно плеера поверх остальных. По умолчанию — P.' },
  ];

  let gpuAvailable = $state(false);
  let gpuReason = $state<string | null>(null);
  let upscaleType = $state<Anime4kType>('off');
  let upscaleIntensity = $state<Anime4kIntensity>('optimal');
  let upscaleTargetRes = $state<Anime4kTargetRes>('1080');
  let audioSurround = $state<SurroundMode>('off');
  let playerDebugOverlay = $state(false);
  let adaptiveQualityByWindow = $state(false);
  let hotkeys = $state<PlayerHotkeysSettings>({ ...DEFAULT_PLAYER_HOTKEYS });
  let capturing = $state<BindField | null>(null);
  let playbackLoaded = $state(false);

  // Телефон и планшет: только лёгкие режимы, без «Максимум», разрешение обработки всегда 1080p
  const touchUi = isMobileMode();
  const typeOptions = touchUi ? MOBILE_ANIME4K_TYPES : ANIME4K_TYPES;
  const intensityOptions = touchUi ? MOBILE_ANIME4K_INTENSITIES : ANIME4K_INTENSITIES;
  const mappedUpscale = $derived(mapAnime4kPreset({ type: upscaleType, intensity: upscaleIntensity }));

  async function loadPlayback() {
    if (!hasAppSettingsStore()) return;
    gpuAvailable = await initWebGpuAvailability();
    gpuReason = gpuAvailable ? null : getWebGpuUnavailableReason();
    const settings = await loadAppSettings();
    const raw = normalizeAnime4kPreset(settings);
    const preset = touchUi ? clampAnime4kPresetForMobile(raw) : raw;
    upscaleType = preset.type;
    upscaleIntensity = preset.intensity;
    upscaleTargetRes = touchUi ? MOBILE_ANIME4K_TARGET_RES : normalizeAnime4kTargetRes(settings.upscaleTargetRes);
    audioSurround = normalizeSurroundMode(settings.audioSurround);
    playerDebugOverlay = settings.playerDebugOverlay === true;
    adaptiveQualityByWindow = settings.adaptiveQualityByWindow === true;
    hotkeys = normalizePlayerHotkeys(settings.playerHotkeys);
    playbackLoaded = true;
  }

  function saveUpscale() {
    const mapped = mapAnime4kPreset({ type: upscaleType, intensity: upscaleIntensity });
    saveAppSettings({
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
    saveAppSettings({ audioSurround });
    window.dispatchEvent(new CustomEvent('anix:surroundChanged', {
      detail: { audioSurround },
    }));
  }

  function savePlayerDebug() {
    saveAppSettings({ playerDebugOverlay });
    window.dispatchEvent(new CustomEvent('anix:playerDebugChanged', { detail: { playerDebugOverlay } }));
  }

  function saveAdaptiveQuality() {
    saveAppSettings({ adaptiveQualityByWindow });
    window.dispatchEvent(new CustomEvent('anix:adaptiveQualityChanged', { detail: { adaptiveQualityByWindow } }));
  }

  function saveHotkeys(next: PlayerHotkeysSettings) {
    const normalized = normalizePlayerHotkeys(next);
    hotkeys = { ...normalized };
    void saveAppSettings({ playerHotkeys: { ...normalized } });
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

  function onRewindSecondsChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      input.value = String(hotkeys.rewindSeconds);
      return;
    }
    saveHotkeys({ ...hotkeys, rewindSeconds: value });
  }

  onMount(() => {
    void loadPlayback();
    window.addEventListener('keydown', onCaptureKey, true);
    return () => window.removeEventListener('keydown', onCaptureKey, true);
  });
</script>

<div class="uiv2-settings uiv2-settings--playback">
  {#if !hasAppSettingsStore()}
    <p class="uiv2-settings__status">Настройки воспроизведения недоступны: хранилище настроек отключено.</p>
  {:else if !playbackLoaded}
    <p class="uiv2-settings__status">Загрузка…</p>
  {:else}
    <!-- Anime4K — главное отличие плеера, поэтому первым -->
    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Anime4K</h3>
      <p class="uiv2-settings__desc">
        Улучшает картинку в реальном времени через WebGPU: повышает резкость и убирает шум. Новых деталей не добавляет — проявляет имеющиеся.
      </p>
      {#if !gpuAvailable}
        <div class="uiv2-settings__notice uiv2-settings__notice--warn">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <circle cx="10" cy="10" r="8" />
            <line x1="10" y1="6" x2="10" y2="10.5" />
            <circle cx="10" cy="13.5" r=".7" fill="currentColor" stroke="none" />
          </svg>
          <span>
            На этом устройстве WebGPU недоступен — Anime4K не включится.
            {#if gpuReason}<br />{gpuReason}{/if}
          </span>
        </div>
      {/if}
      <div class="uiv2-settings__group uiv2-settings__group--pad" class:uiv2-settings__group--disabled={!gpuAvailable}>
        <p class="uiv2-settings__subhead">Режим</p>
        <div class="uiv2-settings__chips" role="radiogroup" aria-label="Режим Anime4K">
          {#each typeOptions as opt (opt.id)}
            <button
              type="button"
              role="radio"
              aria-checked={upscaleType === opt.id}
              class="uiv2-settings__chip"
              class:uiv2-settings__chip--on={upscaleType === opt.id}
              disabled={!gpuAvailable}
              onclick={() => { upscaleType = opt.id; saveUpscale(); }}
            >
              {opt.label}
              {#if opt.recommended}<span class="uiv2-settings__chip-star" aria-label="рекомендуется">★</span>{/if}
            </button>
          {/each}
        </div>
        {#if mappedUpscale.enabled}
          <p class="uiv2-settings__hint">{ANIME4K_TYPES.find((t) => t.id === upscaleType)?.hint}</p>
        {/if}

        <p class="uiv2-settings__subhead">Нагрузка на GPU</p>
        <div class="uiv2-settings__chips" role="radiogroup" aria-label="Нагрузка на GPU">
          {#each intensityOptions as opt (opt.id)}
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

        {#if !touchUi}
        <p class="uiv2-settings__subhead">Разрешение обработки</p>
        <div class="uiv2-settings__chips" role="radiogroup" aria-label="Разрешение обработки">
          {#each ANIME4K_TARGET_RES as opt (opt.id)}
            <button
              type="button"
              role="radio"
              aria-checked={upscaleTargetRes === opt.id}
              class="uiv2-settings__chip"
              class:uiv2-settings__chip--on={upscaleTargetRes === opt.id}
              disabled={!gpuAvailable || upscaleType === 'off'}
              onclick={() => { upscaleTargetRes = opt.id; saveUpscale(); }}
            >{opt.id === 'auto' ? 'Авто · под окно' : opt.label}</button>
          {/each}
        </div>
        {#if upscaleTargetRes === 'auto' && upscaleType !== 'off'}
          <p class="uiv2-settings__hint">«Авто» подстраивается под размер окна и может моргать при его изменении.</p>
        {/if}
        {/if}
      </div>
    </section>

    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Перемотка</h3>
      <div class="uiv2-settings__group">
        <UiV2SettingsRow
          stack
          title="Шаг перемотки"
          desc={touchOnly
            ? 'Кнопки перемотки в плеере. По умолчанию — 10 с.'
            : `Кнопки плеера и клавиши ${formatHotkeyCode(hotkeys.seekBackCode)} / ${formatHotkeyCode(hotkeys.seekForwardCode)}. По умолчанию — 10 с.`}
        >
          <div class="uiv2-settings__chips" role="group" aria-label="Шаг перемотки">
            {#each SEEK_SECONDS_OPTIONS as sec (sec)}
              <button
                type="button"
                class="uiv2-settings__chip"
                class:uiv2-settings__chip--on={hotkeys.seekSeconds === sec}
                aria-pressed={hotkeys.seekSeconds === sec}
                onclick={() => saveHotkeys({ ...hotkeys, seekSeconds: sec })}
              >{formatSeekSeconds(sec)}</button>
            {/each}
          </div>
        </UiV2SettingsRow>

        <UiV2SettingsRow
          stack
          title="Время пропуска"
          desc={touchOnly
            ? 'Прыжок вперёд кнопкой пропуска. По умолчанию — 1:25.'
            : `Кнопка пропуска и клавиша ${formatHotkeyCode(hotkeys.rewindCode)}. По умолчанию — 1:25.`}
        >
          <div class="uiv2-settings__chips" role="group" aria-label="Время пропуска">
            {#each REWIND_SECONDS_OPTIONS as sec (sec)}
              <button
                type="button"
                class="uiv2-settings__chip"
                class:uiv2-settings__chip--on={hotkeys.rewindSeconds === sec}
                aria-pressed={hotkeys.rewindSeconds === sec}
                onclick={() => saveHotkeys({ ...hotkeys, rewindSeconds: sec })}
              >{formatSeekSeconds(sec)}</button>
            {/each}
          </div>
          <label class="playback-rewind-custom">
            <span>Своё время</span>
            <input
              type="number"
              min={REWIND_SECONDS_MIN}
              max={REWIND_SECONDS_MAX}
              step="1"
              value={hotkeys.rewindSeconds}
              aria-label="Время пропуска в секундах"
              onchange={onRewindSecondsChange}
            />
            <span>сек</span>
          </label>
        </UiV2SettingsRow>
      </div>
    </section>

    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Объёмный звук</h3>
      <p class="uiv2-settings__desc">
        Кино HRTF, Imaging, Spatial, IRCAM и эквалайзер ±12 дБ. Тонкая настройка эквалайзера — в самом плеере.
      </p>
      <div class="uiv2-settings__group uiv2-settings__group--pad">
        <div class="uiv2-settings__chips" role="radiogroup" aria-label="Основные режимы">
          <button
            type="button"
            role="radio"
            aria-checked={audioSurround === 'off'}
            class="uiv2-settings__chip"
            class:uiv2-settings__chip--on={audioSurround === 'off'}
            onclick={() => { audioSurround = 'off'; saveSurround(); }}
          >{surroundModeDisplayLabel('off')}</button>
          <button
            type="button"
            role="radio"
            aria-checked={audioSurround === 'equalizer'}
            class="uiv2-settings__chip"
            class:uiv2-settings__chip--on={audioSurround === 'equalizer'}
            onclick={() => { audioSurround = 'equalizer'; saveSurround(); }}
          >{surroundModeDisplayLabel('equalizer', true)}</button>
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
                  onclick={() => { audioSurround = opt.id; saveSurround(); }}
                >
                  {surroundModeDisplayLabel(opt.id, true)}
                </button>
              {/if}
            {/each}
          </div>
        {/each}
        {#if audioSurround !== 'off'}
          {@const active = surroundModeMeta(audioSurround)}
          {#if active?.hint}
            <p class="uiv2-settings__hint">{active.hint}{active.lib ? ` · ${active.lib}` : ''}</p>
          {/if}
        {/if}
      </div>
    </section>

    {#if !touchOnly}
      <section class="uiv2-settings__block">
        <h3 class="uiv2-settings__title">Горячие клавиши</h3>
        <p class="uiv2-settings__desc">Нажмите на клавишу справа и затем новую комбинацию.</p>
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
            title="{modKey} + колёсико — скорость"
            desc="Плавно ускорять и замедлять видео. Текущая скорость показывается на экране плеера."
          >
            <UiV2Toggle
              label="{modKey} + колёсико — скорость"
              checked={hotkeys.ctrlWheelSpeed}
              onChange={(checked) => saveHotkeys({ ...hotkeys, ctrlWheelSpeed: checked })}
            />
          </UiV2SettingsRow>

          <UiV2SettingsRow
            title="Сбросить горячие клавиши"
            desc="Вернуть клавиши, шаг перемотки 10 с, пропуск 1:25 и {modKey} + колёсико."
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
    {/if}

    {#if !touchOnly}
    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Качество потока</h3>
      <div class="uiv2-settings__group">
        <UiV2SettingsRow
          title="Качество по размеру окна"
          desc="Автоматическое снижение разрешения при уменьшении окна плеера: 1080 → 720 → 480 → 360. Удобно для режима «поверх всех окон». По умолчанию выключено."
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
    {/if}

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

    {#if !touchOnly}
    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Инструменты разработки</h3>
      <div class="uiv2-settings__group">
        <UiV2SettingsRow
          title="Предпросмотр моделей"
          desc="Инструмент для сравнения фильтров (Deblur, Denoise, Restore, Upscale) на тестовых кадрах со слайдером «до/после» в реальном времени."
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
  {/if}
</div>

<style lang="scss">
  .playback-rewind-custom {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.45rem;
    font-size: 0.8125rem;
    color: var(--uiv2-fg-muted);

    input {
      width: 5.25rem;
      height: 1.9rem;
      padding: 0 0.6rem;
      border: 1px solid color-mix(in srgb, var(--uikit-v2-text) 16%, transparent);
      border-radius: 0.55rem;
      background: var(--uiv2-chrome-bg);
      color: var(--uiv2-chrome-fg);
      font: inherit;
      font-size: 0.8125rem;
      font-variant-numeric: tabular-nums;

      &:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--uikit-v2-accent) 55%, transparent);
        outline-offset: 2px;
      }
    }
  }
</style>
