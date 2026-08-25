<script lang="ts">
  import { onMount } from 'svelte';
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
    ANIME4K_TYPES,
    mapAnime4kPreset,
    normalizeAnime4kPreset,
    type Anime4kIntensity,
    type Anime4kType,
  } from '../../Watch/core/anime4k-presets';
  import {
    SURROUND_GROUPS,
    normalizeSurroundMode,
    surroundModeDisplayLabel,
    surroundModeMeta,
    type SurroundMode,
  } from '../../Watch/core/surround-audio';

  type BindField = PlayerHotkeyBindField;

  let gpuAvailable = $state(false);
  let upscaleType = $state<Anime4kType>('off');
  let upscaleIntensity = $state<Anime4kIntensity>('optimal');
  let audioSurround = $state<SurroundMode>('off');
  let playerDebugOverlay = $state(false);
  let adaptiveQualityByWindow = $state(false);
  let hotkeys = $state<PlayerHotkeysSettings>({ ...DEFAULT_PLAYER_HOTKEYS });
  let capturing = $state<BindField | null>(null);
  let playbackLoaded = $state(false);

  const mappedUpscale = $derived(mapAnime4kPreset({ type: upscaleType, intensity: upscaleIntensity }));

  async function loadPlayback() {
    if (!window.electron?.getSettings) return;
    gpuAvailable = 'gpu' in navigator;
    const settings = await window.electron.getSettings();
    const preset = normalizeAnime4kPreset(settings);
    upscaleType = preset.type;
    upscaleIntensity = preset.intensity;
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
    });
    window.electron?.sendUpscaleSettings?.({
      upscaleEnabled: mapped.enabled,
      upscaleMode: mapped.mode,
      upscaleType,
      upscaleIntensity,
    });
    window.dispatchEvent(new CustomEvent('anix:upscaleChanged', {
      detail: {
        upscaleEnabled: mapped.enabled,
        upscaleMode: mapped.mode,
        upscaleType,
        upscaleIntensity,
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

<div class="settings-modal-content">
  {#if !window.electron?.getSettings}
    <p class="settings-account-coming-soon">Настройки воспроизведения доступны только в приложении Electron.</p>
  {:else if !playbackLoaded}
    <div style="padding:16px;color:#737373;">Загрузка…</div>
  {:else}
    {#if !gpuAvailable}
      <div class="settings-upscale-notice settings-upscale-notice--warn">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="10" cy="10" r="8" />
          <line x1="10" y1="6" x2="10" y2="10.5" />
          <circle cx="10" cy="13.5" r=".7" fill="currentColor" stroke="none" />
        </svg>
        <span>Ваш GPU не поддерживает WebGPU — улучшение качества недоступно.</span>
      </div>
    {/if}

    <div class="settings-section">
      <p class="settings-section__label">Горячие клавиши</p>
      <div class="settings-section__body">
        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Перемотка назад</div>
            <div class="settings-row__desc">Клавиша для прыжка назад на заданное время.</div>
          </div>
          <div class="settings-row__control">
            <button
              type="button"
              class="settings-keybind-btn{capturing === 'seekBackCode' ? ' settings-keybind-btn--listen' : ''}"
              onclick={() => startCapture('seekBackCode')}
            >
              {capturing === 'seekBackCode' ? '…' : formatHotkeyCode(hotkeys.seekBackCode)}
            </button>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Перемотка вперёд</div>
            <div class="settings-row__desc">Клавиша для прыжка вперёд на заданное время.</div>
          </div>
          <div class="settings-row__control">
            <button
              type="button"
              class="settings-keybind-btn{capturing === 'seekForwardCode' ? ' settings-keybind-btn--listen' : ''}"
              onclick={() => startCapture('seekForwardCode')}
            >
              {capturing === 'seekForwardCode' ? '…' : formatHotkeyCode(hotkeys.seekForwardCode)}
            </button>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Пауза / воспроизведение</div>
            <div class="settings-row__desc">По умолчанию — пробел.</div>
          </div>
          <div class="settings-row__control">
            <button
              type="button"
              class="settings-keybind-btn{capturing === 'playPauseCode' ? ' settings-keybind-btn--listen' : ''}"
              onclick={() => startCapture('playPauseCode')}
            >
              {capturing === 'playPauseCode' ? '…' : formatHotkeyCode(hotkeys.playPauseCode)}
            </button>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Громче</div>
            <div class="settings-row__desc">По умолчанию — стрелка вверх.</div>
          </div>
          <div class="settings-row__control">
            <button
              type="button"
              class="settings-keybind-btn{capturing === 'volumeUpCode' ? ' settings-keybind-btn--listen' : ''}"
              onclick={() => startCapture('volumeUpCode')}
            >
              {capturing === 'volumeUpCode' ? '…' : formatHotkeyCode(hotkeys.volumeUpCode)}
            </button>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Тише</div>
            <div class="settings-row__desc">По умолчанию — стрелка вниз.</div>
          </div>
          <div class="settings-row__control">
            <button
              type="button"
              class="settings-keybind-btn{capturing === 'volumeDownCode' ? ' settings-keybind-btn--listen' : ''}"
              onclick={() => startCapture('volumeDownCode')}
            >
              {capturing === 'volumeDownCode' ? '…' : formatHotkeyCode(hotkeys.volumeDownCode)}
            </button>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Полный экран</div>
            <div class="settings-row__desc">По умолчанию — F.</div>
          </div>
          <div class="settings-row__control">
            <button
              type="button"
              class="settings-keybind-btn{capturing === 'fullscreenCode' ? ' settings-keybind-btn--listen' : ''}"
              onclick={() => startCapture('fullscreenCode')}
            >
              {capturing === 'fullscreenCode' ? '…' : formatHotkeyCode(hotkeys.fullscreenCode)}
            </button>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Поверх всех окон</div>
            <div class="settings-row__desc">Закрепить окно плеера поверх остальных. По умолчанию — P.</div>
          </div>
          <div class="settings-row__control">
            <button
              type="button"
              class="settings-keybind-btn{capturing === 'alwaysOnTopCode' ? ' settings-keybind-btn--listen' : ''}"
              onclick={() => startCapture('alwaysOnTopCode')}
            >
              {capturing === 'alwaysOnTopCode' ? '…' : formatHotkeyCode(hotkeys.alwaysOnTopCode)}
            </button>
          </div>
        </div>

        <div class="settings-row settings-row--stack">
          <div class="settings-row__info">
            <div class="settings-row__label">Время пропуска</div>
            <div class="settings-row__desc">На сколько секунд прыгать клавишами перемотки (по умолчанию ← / →).</div>
          </div>
          <div class="settings-seek-chips" role="group" aria-label="Время пропуска">
            {#each SEEK_SECONDS_OPTIONS as sec (sec)}
              <button
                type="button"
                class="settings-seek-chip{hotkeys.seekSeconds === sec ? ' settings-seek-chip--active' : ''}"
                aria-pressed={hotkeys.seekSeconds === sec}
                onclick={() => saveHotkeys({ ...hotkeys, seekSeconds: sec })}
              >{formatSeekLabel(sec)}</button>
            {/each}
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Ctrl + колёсико — скорость</div>
            <div class="settings-row__desc">Плавно ускорять и замедлять видео. Текущая скорость показывается на экране плеера.</div>
          </div>
          <div class="settings-row__control">
            <label class="settings-toggle-switch" aria-label="Ctrl + колёсико — скорость">
              <input
                type="checkbox"
                checked={hotkeys.ctrlWheelSpeed}
                onchange={(e) => saveHotkeys({ ...hotkeys, ctrlWheelSpeed: (e.target as HTMLInputElement).checked })}
              />
              <span class="settings-toggle-switch__track"></span>
              <span class="settings-toggle-switch__thumb"></span>
            </label>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Сбросить горячие клавиши</div>
            <div class="settings-row__desc">Вернуть ← / → / ↑ / ↓, пробел, F, P, 10 с и Ctrl + колёсико.</div>
          </div>
          <div class="settings-row__control">
            <button type="button" class="settings-btn settings-btn--secondary" onclick={() => saveHotkeys({ ...DEFAULT_PLAYER_HOTKEYS })}>
              Сбросить
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-upscale-notice">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <circle cx="10" cy="10" r="8" />
        <line x1="10" y1="9" x2="10" y2="14" />
        <circle cx="10" cy="6.5" r=".7" fill="currentColor" stroke="none" />
      </svg>
      <span>Технология Anime4K улучшает видео в реальном времени, используя WebGPU. Она повышает резкость, убирает шум и улучшает общую чёткость изображения. Не добавляет новых деталей — улучшает уже имеющиеся.</span>
    </div>

    <div class="settings-section">
      <p class="settings-section__label">Anime4K</p>
      <p class="settings-section__desc">Тип обработки и нагрузка — как в AnixPlayer. Без WebGPU пресеты недоступны.</p>
      <div class="settings-section__body">
        <div class="settings-a4k" class:settings-a4k--disabled={!gpuAvailable}>
          <div class="settings-a4k__row" role="radiogroup" aria-label="Тип улучшения">
            {#each ANIME4K_TYPES as opt (opt.id)}
              <button
                type="button"
                role="radio"
                aria-checked={upscaleType === opt.id}
                class="settings-a4k__chip {upscaleType === opt.id ? 'settings-a4k__chip--active' : ''}"
                disabled={!gpuAvailable}
                title={opt.recommended ? `${opt.hint} (рекомендуется)` : opt.hint}
                onclick={() => { upscaleType = opt.id; saveUpscale(); }}
              >
                {opt.label}
                {#if opt.recommended}<span class="settings-a4k__star">★</span>{/if}
              </button>
            {/each}
          </div>
          <div class="settings-a4k__row" role="radiogroup" aria-label="Нагрузка">
            {#each ANIME4K_INTENSITIES as opt (opt.id)}
              <button
                type="button"
                role="radio"
                aria-checked={upscaleIntensity === opt.id}
                class="settings-a4k__chip {upscaleIntensity === opt.id ? 'settings-a4k__chip--active' : ''}"
                disabled={!gpuAvailable || upscaleType === 'off'}
                onclick={() => { upscaleIntensity = opt.id; saveUpscale(); }}
              >{opt.label}</button>
            {/each}
          </div>
          {#if mappedUpscale.enabled}
            <p class="settings-a4k__hint">{ANIME4K_TYPES.find((t) => t.id === upscaleType)?.hint}</p>
          {/if}
        </div>
      </div>
    </div>

    <div class="settings-section">
      <p class="settings-section__label">Объёмный звук</p>
      <p class="settings-section__desc">
        Кино HRTF, Imaging, Spatial, IRCAM и графический эквалайзер (±12 дБ). Тонкая настройка EQ — в плеере.
      </p>
      <div class="settings-section__body">
        <div class="settings-a4k">
          <div class="settings-a4k__row" role="radiogroup" aria-label="Эквалайзер">
            <button
              type="button"
              role="radio"
              aria-checked={audioSurround === 'equalizer'}
              class="settings-a4k__chip {audioSurround === 'equalizer' ? 'settings-a4k__chip--active' : ''}"
              title="10 полос, ручная настройка ±12 дБ · в плеере"
              onclick={() => { audioSurround = 'equalizer'; saveSurround(); }}
            >{surroundModeDisplayLabel('equalizer', true)}</button>
          </div>
          <div class="settings-a4k__row" role="radiogroup" aria-label="Объёмный звук выкл">
            <button
              type="button"
              role="radio"
              aria-checked={audioSurround === 'off'}
              class="settings-a4k__chip {audioSurround === 'off' ? 'settings-a4k__chip--active' : ''}"
              onclick={() => { audioSurround = 'off'; saveSurround(); }}
            >{surroundModeDisplayLabel('off')}</button>
          </div>
          {#each SURROUND_GROUPS as group (group.label)}
            <p class="settings-a4k__hint" style="margin: 10px 0 6px;">{group.label}</p>
            <div class="settings-a4k__row" role="radiogroup" aria-label={group.label}>
              {#each group.modes as modeId (modeId)}
                {@const opt = surroundModeMeta(modeId)}
                {#if opt}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={audioSurround === opt.id}
                    class="settings-a4k__chip {audioSurround === opt.id ? 'settings-a4k__chip--active' : ''}"
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
      </div>
    </div>

    <div class="settings-section">
      <p class="settings-section__label">Качество потока</p>
      <div class="settings-section__body">
        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Качество по размеру окна</div>
            <div class="settings-row__desc">
              Чем меньше окно плеера, тем ниже поток: 1080 → 720 → 480 → 360.
              Удобно для режима «поверх всех окон». По умолчанию выключено.
            </div>
          </div>
          <div class="settings-row__control">
            <label class="settings-toggle-switch" aria-label="Качество по размеру окна">
              <input
                type="checkbox"
                checked={adaptiveQualityByWindow}
                onchange={(e) => {
                  adaptiveQualityByWindow = (e.target as HTMLInputElement).checked;
                  saveAdaptiveQuality();
                }}
              />
              <span class="settings-toggle-switch__track"></span>
              <span class="settings-toggle-switch__thumb"></span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <p class="settings-section__label">Отладка плеера</p>
      <div class="settings-section__body">
        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">HUD на экране плеера</div>
            <div class="settings-row__desc">Разрешение потока и окна, битрейт HLS, кадры, состояние Anime4K / WebGPU и размер canvas.</div>
          </div>
          <div class="settings-row__control">
            <label class="settings-toggle-switch" aria-label="Отладочный HUD плеера">
              <input
                type="checkbox"
                checked={playerDebugOverlay}
                onchange={(e) => {
                  playerDebugOverlay = (e.target as HTMLInputElement).checked;
                  savePlayerDebug();
                }}
              />
              <span class="settings-toggle-switch__track"></span>
              <span class="settings-toggle-switch__thumb"></span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <p class="settings-section__label">Инструменты разработки</p>
      <div class="settings-section__body">
        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Предпросмотр моделей</div>
            <div class="settings-row__desc">Открыть инструмент сравнения — 5 пресетов аниме, split-ползунок для сравнения оригинала и фильтра в реальном времени.</div>
          </div>
          <div class="settings-row__control">
            <button class="settings-btn settings-btn--primary" onclick={() => window.electron?.openUpscaleTool?.()}>
              Открыть
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
