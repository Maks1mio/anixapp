<script lang="ts">
  import { onMount } from 'svelte';
  import Select from '../../../components/Select.svelte';
  import { iconTriangleAlert } from '../../../components/icons';

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

  let gpuAvailable = $state(false);
  let upscaleEnabled = $state(false);
  let upscaleMode = $state(15);
  let playerDebugOverlay = $state(false);
  let playbackLoaded = $state(false);

  async function loadPlayback() {
    if (!window.electron?.getSettings) return;
    gpuAvailable = 'gpu' in navigator;
    const settings = (await window.electron.getSettings()) as { upscaleEnabled?: boolean; upscaleMode?: number; playerDebugOverlay?: boolean };
    upscaleEnabled = settings.upscaleEnabled ?? false;
    upscaleMode = settings.upscaleMode ?? 15;
    playerDebugOverlay = settings.playerDebugOverlay === true;
    playbackLoaded = true;
  }

  function saveUpscale() {
    window.electron?.saveSettings?.({ upscaleEnabled, upscaleMode } as Parameters<NonNullable<typeof window.electron.saveSettings>>[0]);
    (window.electron as { sendUpscaleSettings?: (opts: object) => void })?.sendUpscaleSettings?.({ upscaleEnabled, upscaleMode });
    window.dispatchEvent(new CustomEvent('anix:upscaleChanged', { detail: { upscaleEnabled, upscaleMode } }));
  }

  function savePlayerDebug() {
    window.electron?.saveSettings?.({ playerDebugOverlay } as Parameters<NonNullable<typeof window.electron.saveSettings>>[0]);
    window.dispatchEvent(new CustomEvent('anix:playerDebugChanged', { detail: { playerDebugOverlay } }));
  }

  onMount(() => void loadPlayback());
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
            <button class="settings-btn settings-btn--primary" onclick={() => (window.electron as { openUpscaleTool?: () => void })?.openUpscaleTool?.()}>
              Открыть
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
