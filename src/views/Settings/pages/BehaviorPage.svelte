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
  import UiV2Toggle from '../../../components/uikit-v2/UiV2Toggle.svelte';
  import UiV2SettingsRow from '../../../components/uikit-v2/UiV2SettingsRow.svelte';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';

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

<div class="uiv2-settings">
  {#if !hasElectron && !showTvMetrics && !isNativeApk}
    <p class="uiv2-settings__status">Настройки поведения доступны только в приложении Electron.</p>
  {:else if !behaviorLoaded}
    <p class="uiv2-settings__status">Загрузка…</p>
  {:else}
    {#if isNativeApk}
      <section class="uiv2-settings__block">
        <h3 class="uiv2-settings__title">Производительность</h3>
        <div class="uiv2-settings__group">
          <UiV2SettingsRow
            title="Адаптивное ускорение"
            desc="GPU-флаги Chromium включены в APK. Anime4K: {isGpuAvailable() ? 'WebGPU доступен' : 'WebGPU недоступен'}."
          >
            <span class="uiv2-settings__pill">{isGpuAvailable() ? 'WebGPU OK' : 'Нет GPU'}</span>
          </UiV2SettingsRow>
        </div>
      </section>

      <section class="uiv2-settings__block">
        <h3 class="uiv2-settings__title">Устройство и GPU</h3>
        <div class="uiv2-settings__group uiv2-settings__group--pad">
          {#if diagnosticsLoading}
            <p class="uiv2-settings__status">Сбор диагностики…</p>
          {:else if diagnosticLines.length === 0}
            <p class="uiv2-settings__status">Диагностика недоступна (нет native-моста AnixDevice).</p>
          {:else}
            <dl class="uiv2-settings__diag">
              {#each diagnosticLines as line (line.key)}
                <div class="uiv2-settings__diag-row">
                  <dt class="uiv2-settings__diag-key">{line.key}</dt>
                  <dd class="uiv2-settings__diag-val">{line.value}</dd>
                </div>
              {/each}
            </dl>
          {/if}

          {#if diagnosticTips.length > 0}
            <div class="uiv2-settings__tips" aria-label="Рекомендации для Anime4K">
              <p class="uiv2-settings__tips-title">Anime4K — что делать</p>
              <ul>
                {#each diagnosticTips as tip}
                  <li>{tip}</li>
                {/each}
              </ul>
            </div>
          {/if}

          <UiV2Button
            label={diagnosticsLoading ? 'Обновление…' : 'Обновить диагностику'}
            variant="chrome"
            size="sm"
            disabled={diagnosticsLoading}
            onclick={() => void loadDiagnostics()}
          />
        </div>
      </section>
    {/if}

    {#if showTvMetrics}
      <section class="uiv2-settings__block">
        <h3 class="uiv2-settings__title">TV-интерфейс</h3>
        <div class="uiv2-settings__group">
          <UiV2SettingsRow
            title="Показывать Local metrics"
            desc="Панель с LCP, CLS, INP и сетевыми запросами внизу экрана. По умолчанию выключена."
          >
            <UiV2Toggle
              label="Показывать Local metrics"
              checked={debugMetrics}
              onChange={saveDebugMetrics}
            />
          </UiV2SettingsRow>
        </div>
      </section>
    {/if}

    {#if hasElectron}
      <section class="uiv2-settings__block">
        <h3 class="uiv2-settings__title">Окно</h3>
        <div class="uiv2-settings__group">
          <UiV2SettingsRow
            title="Сворачивать в трей при закрытии"
            desc="Окно скрывается в системный трей вместо выхода"
          >
            <UiV2Toggle label="Сворачивать в трей" checked={minimizeToTray} onChange={saveTray} />
          </UiV2SettingsRow>
          <UiV2SettingsRow
            title="Адаптивное ускорение"
            desc="Использовать аппаратное ускорение (GPU). Может повысить производительность, но иногда вызывает артефакты. Требуется перезапуск."
          >
            <UiV2Toggle label="Адаптивное ускорение" checked={adaptiveAcceleration} onChange={saveAccel} />
          </UiV2SettingsRow>
        </div>
      </section>
    {/if}
  {/if}
</div>
