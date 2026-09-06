<script lang="ts">
  import { onMount } from 'svelte';
  import { isTvMode } from '../../../platform/tv';
  import { isCapacitorNative } from '../../../native/anix-api-native';
  import { isGpuAvailable } from '../../../utils/webgpu-availability.svelte';
  import { isDebugMetricsEnabled, setDebugMetricsEnabled } from '../../../services/debug-metrics';
  import {
    refreshDeviceDiagnostics,
    type DiagnosticLine,
  } from '../../../services/device-diagnostics';

  let hasElectron = $state(false);
  let isNativeApk = $state(false);
  let minimizeToTray = $state(false);
  let adaptiveAcceleration = $state(true);
  let behaviorLoaded = $state(false);
  let debugMetrics = $state(false);
  let diagnosticsLoading = $state(false);
  let diagnosticLines = $state<DiagnosticLine[]>([]);
  let diagnosticTips = $state<string[]>([]);
  const showTvMetrics = isTvMode();

  async function loadDiagnostics() {
    if (!isCapacitorNative()) return;
    diagnosticsLoading = true;
    try {
      const result = await refreshDeviceDiagnostics();
      diagnosticLines = result.lines;
      diagnosticTips = result.tips;
    } finally {
      diagnosticsLoading = false;
    }
  }

  async function loadBehavior() {
    isNativeApk = isCapacitorNative();
    if (window.electron?.getSettings) {
      hasElectron = true;
      const settings = await window.electron.getSettings();
      minimizeToTray = settings.minimizeToTray ?? false;
      adaptiveAcceleration = settings.adaptiveAcceleration !== false;
      behaviorLoaded = true;
    } else if (showTvMetrics || isNativeApk) {
      behaviorLoaded = true;
    }

    debugMetrics = isDebugMetricsEnabled();
    if (isNativeApk) await loadDiagnostics();
  }

  function saveTray(checked: boolean) {
    minimizeToTray = checked;
    window.electron?.saveSettings?.({ minimizeToTray: checked });
  }

  function saveAccel(checked: boolean) {
    adaptiveAcceleration = checked;
    window.electron?.saveSettings?.({ adaptiveAcceleration: checked });
  }

  function saveDebugMetrics(checked: boolean) {
    debugMetrics = checked;
    setDebugMetricsEnabled(checked);
  }

  onMount(() => void loadBehavior());
</script>

<div class="settings-modal-content">
  {#if !hasElectron && !showTvMetrics && !isNativeApk}
    <p class="settings-account-coming-soon">Настройки поведения доступны только в приложении Electron.</p>
  {:else if !behaviorLoaded}
    <div style="padding:16px;color:#737373;">Загрузка…</div>
  {:else}
    {#if isNativeApk}
      <div class="settings-section">
        <p class="settings-section__label">Производительность</p>
        <div class="settings-section__body">
          <div class="settings-row">
            <div class="settings-row__info">
              <div class="settings-row__label">Адаптивное ускорение</div>
              <div class="settings-row__desc">
                GPU-флаги Chromium включены в APK.
                Anime4K: {isGpuAvailable() ? 'WebGPU доступен' : 'WebGPU недоступен'}.
              </div>
            </div>
            <div class="settings-row__control">
              <span class="settings-row__desc">{isGpuAvailable() ? 'WebGPU OK' : 'Нет GPU'}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <p class="settings-section__label">Устройство и GPU</p>
        <div class="settings-section__body behavior-diagnostics">
          {#if diagnosticsLoading}
            <p class="behavior-diagnostics__hint">Сбор диагностики…</p>
          {:else if diagnosticLines.length === 0}
            <p class="behavior-diagnostics__hint">Диагностика недоступна (нет native-моста AnixDevice).</p>
          {:else}
            <dl class="behavior-diagnostics__list">
              {#each diagnosticLines as line (line.key)}
                <div class="behavior-diagnostics__row">
                  <dt class="behavior-diagnostics__key">{line.key}</dt>
                  <dd class="behavior-diagnostics__val">{line.value}</dd>
                </div>
              {/each}
            </dl>
          {/if}

          {#if diagnosticTips.length > 0}
            <div class="behavior-diagnostics__tips" aria-label="Рекомендации для Anime4K">
              <p class="behavior-diagnostics__tips-title">Anime4K — что делать</p>
              <ul>
                {#each diagnosticTips as tip}
                  <li>{tip}</li>
                {/each}
              </ul>
            </div>
          {/if}

          <button
            type="button"
            class="behavior-diagnostics__refresh"
            disabled={diagnosticsLoading}
            onclick={() => void loadDiagnostics()}
          >
            {diagnosticsLoading ? 'Обновление…' : 'Обновить диагностику'}
          </button>
        </div>
      </div>
    {/if}

    {#if showTvMetrics}
      <div class="settings-section">
        <p class="settings-section__label">TV-интерфейс</p>
        <div class="settings-section__body">
          <div class="settings-row">
            <div class="settings-row__info">
              <div class="settings-row__label">Показывать Local metrics</div>
              <div class="settings-row__desc">Панель с LCP, CLS, INP и сетевыми запросами внизу экрана. По умолчанию выключена.</div>
            </div>
            <div class="settings-row__control">
              <label class="settings-toggle-switch" aria-label="Показывать Local metrics">
                <input type="checkbox" checked={debugMetrics} onchange={(e) => saveDebugMetrics((e.target as HTMLInputElement).checked)} />
                <span class="settings-toggle-switch__track"></span>
                <span class="settings-toggle-switch__thumb"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
    {/if}

    {#if hasElectron}
      <div class="settings-section">
        <p class="settings-section__label">Окно</p>
        <div class="settings-section__body">
          <div class="settings-row">
            <div class="settings-row__info">
              <div class="settings-row__label">Сворачивать в трей при закрытии</div>
              <div class="settings-row__desc">Окно скрывается в системный трей вместо выхода</div>
            </div>
            <div class="settings-row__control">
              <label class="settings-toggle-switch" aria-label="Сворачивать в трей">
                <input type="checkbox" checked={minimizeToTray} onchange={(e) => saveTray((e.target as HTMLInputElement).checked)} />
                <span class="settings-toggle-switch__track"></span>
                <span class="settings-toggle-switch__thumb"></span>
              </label>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row__info">
              <div class="settings-row__label">Адаптивное ускорение</div>
              <div class="settings-row__desc">Использовать аппаратное ускорение (GPU). Может повысить производительность, но иногда вызывает артефакты. Требуется перезапуск.</div>
            </div>
            <div class="settings-row__control">
              <label class="settings-toggle-switch" aria-label="Адаптивное ускорение">
                <input type="checkbox" checked={adaptiveAcceleration} onchange={(e) => saveAccel((e.target as HTMLInputElement).checked)} />
                <span class="settings-toggle-switch__track"></span>
                <span class="settings-toggle-switch__thumb"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .behavior-diagnostics {
    padding: 12px 16px 16px;
  }

  .behavior-diagnostics__hint {
    margin: 0;
    color: #737373;
    font-size: 14px;
  }

  .behavior-diagnostics__list {
    margin: 0;
    max-height: 42vh;
    overflow-y: auto;
  }

  .behavior-diagnostics__row {
    display: grid;
    grid-template-columns: minmax(120px, 34%) 1fr;
    gap: 10px 16px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .behavior-diagnostics__key {
    margin: 0;
    color: #a3a3a3;
    font-size: 13px;
    font-weight: 500;
  }

  .behavior-diagnostics__val {
    margin: 0;
    color: #e5e5e5;
    font-size: 13px;
    line-height: 1.4;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .behavior-diagnostics__tips {
    margin-top: 16px;
    padding: 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
  }

  .behavior-diagnostics__tips-title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: #f5f5f5;
  }

  .behavior-diagnostics__tips ul {
    margin: 0;
    padding-left: 18px;
    color: #d4d4d4;
    font-size: 13px;
    line-height: 1.45;
  }

  .behavior-diagnostics__refresh {
    margin-top: 14px;
    padding: 8px 14px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    background: transparent;
    color: #e5e5e5;
    font-size: 14px;
    cursor: pointer;
  }

  .behavior-diagnostics__refresh:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
