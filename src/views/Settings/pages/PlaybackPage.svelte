<script lang="ts">
  import { onMount } from 'svelte';
  import Select from '../../../components/Select.svelte';
  import { iconTriangleAlert } from '../../../components/icons';
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

  const UPSCALE_MODES = [
    { id: 14, label: 'ModeA [Preset]', desc: 'Быстрый пресет с умеренным восстановлением и апскейлом.' },
    { id: 15, label: 'ModeB [Preset]', desc: 'Сбалансированный пресет с акцентом на детализацию.' },
    { id: 16, label: 'ModeC [Preset]', desc: 'Качественный пресет с более агрессивным улучшением.' },
    { id: 17, label: 'ModeA+A [Preset]', desc: 'Расширенный ModeA с дополнительной обработкой.' },
    { id: 18, label: 'ModeB+B [Preset]', desc: 'Улучшенный ModeB, обеспечивает более высокое качество.' },
    { id: 19, label: 'ModeC+A [Preset]', desc: 'Комбинированный пресет с высокой чёткостью и восстановлением.' },
    { id: 0, label: 'DoG [Deblur]', desc: 'Удаление размытия и усиление границ с помощью фильтра разности Гауссиан.' },
    { id: 1, label: 'BilateralMean [Denoise]', desc: 'Снижение шума без потери резкости с помощью билинейного среднего.' },
    { id: 2, label: 'CNNM [Restore]', desc: 'Нейросетевое восстановление с умеренной глубиной, хорошо для общего улучшения.' },
    { id: 3, label: 'CNNSoftM [Restore]', desc: 'Более мягкое восстановление, минимизирующее артефакты и перегибы.' },
    { id: 4, label: 'CNNSoftVLM [Restore]', desc: 'Очень лёгкое и мягкое восстановление, подходит для слабых устройств.' },
    { id: 5, label: 'CNNVL [Restore]', desc: 'Восстановление с малой задержкой и быстрой обработкой.' },
    { id: 6, label: 'CNNUL [Restore]', desc: 'Универсальное восстановление с акцентом на стабильность.' },
    { id: 7, label: 'GANUUL [Restore]', desc: 'GAN-реконструкция изображения для высокого качества.' },
    { id: 8, label: 'CNNx2M [Upscale]', desc: 'Апскейл ×2 с сохранением структуры кадра.' },
    { id: 9, label: 'CNNx2VL [Upscale]', desc: 'Быстрый апскейл ×2 для слабых систем.' },
    { id: 10, label: 'DenoiseCNNx2VL [Upscale]', desc: 'Апскейл ×2 с предварительным шумоподавлением.' },
    { id: 11, label: 'CNNx2UL [Upscale]', desc: 'Универсальный сбалансированный апскейл ×2.' },
    { id: 12, label: 'GANx3L [Upscale]', desc: 'GAN апскейл ×3 для высокого качества.' },
    { id: 13, label: 'GANx4UUL [Upscale]', desc: 'GAN апскейл ×4 — максимальное качество.' },
  ];

  type BindField = PlayerHotkeyBindField;

  let gpuAvailable = $state(false);
  let upscaleEnabled = $state(false);
  let upscaleMode = $state(15);
  let playerDebugOverlay = $state(false);
  let adaptiveQualityByWindow = $state(false);
  let hotkeys = $state<PlayerHotkeysSettings>({ ...DEFAULT_PLAYER_HOTKEYS });
  let capturing = $state<BindField | null>(null);
  let playbackLoaded = $state(false);

  async function loadPlayback() {
    if (!window.electron?.getSettings) return;
    gpuAvailable = 'gpu' in navigator;
    const settings = await window.electron.getSettings();
    upscaleEnabled = settings.upscaleEnabled ?? false;
    upscaleMode = settings.upscaleMode ?? 15;
    playerDebugOverlay = settings.playerDebugOverlay === true;
    adaptiveQualityByWindow = settings.adaptiveQualityByWindow === true;
    hotkeys = normalizePlayerHotkeys(settings.playerHotkeys);
    playbackLoaded = true;
  }

  function saveUpscale() {
    window.electron?.saveSettings?.({ upscaleEnabled, upscaleMode });
    window.electron?.sendUpscaleSettings?.({ upscaleEnabled, upscaleMode });
    window.dispatchEvent(new CustomEvent('anix:upscaleChanged', { detail: { upscaleEnabled, upscaleMode } }));
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
      <p class="settings-section__label">Улучшение качества (Anime4K / WebGPU)</p>
      <div class="settings-section__body">
        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Включить улучшение качества</div>
            <div class="settings-row__desc">Активирует улучшение через GPU с использованием WebGPU и Anime4K.</div>
          </div>
          <div class="settings-row__control">
            <label class="settings-toggle-switch" aria-label="Улучшение качества">
              <input
                type="checkbox"
                checked={upscaleEnabled}
                disabled={!gpuAvailable}
                onchange={(e) => {
                  upscaleEnabled = (e.target as HTMLInputElement).checked;
                  saveUpscale();
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
      <p class="settings-section__label">Режим улучшения</p>
      <Select
        options={UPSCALE_MODES.map((m) => ({
          value: String(m.id),
          label: m.label,
          desc: m.desc,
          warning: m.label.includes('[Upscale]') ? 'Модель сложная, может привести к зависанию' : undefined,
        }))}
        value={String(upscaleMode)}
        onChange={(v) => {
          upscaleMode = Number(v);
          saveUpscale();
        }}
        disabled={!gpuAvailable || !upscaleEnabled}
      />
      {#if [8, 9, 10, 11, 12, 13].includes(upscaleMode)}
        <div class="settings-upscale-warning">
          <span class="settings-upscale-warning__icon" aria-hidden="true">{@html iconTriangleAlert(14)}</span>
          <span>Модель сложная, может привести к зависанию</span>
        </div>
      {/if}
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
