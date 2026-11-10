<script lang="ts">
  import { onMount } from 'svelte';
  import { isTvMode } from '../../../platform/tv';
  import { isMobileMode } from '../../../platform/mobile';
  import {
    getNativeAcceleration,
    hasNativeAcceleration,
    setNativeAcceleration,
  } from '../../../native/anix-acceleration';
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

  type Props = {
    /** Встроено в другую страницу (телефон: «Воспроизведение») — без заглушки «нечего настраивать». */
    embedded?: boolean;
  };
  let { embedded = false }: Props = $props();

  /** Телефон: трея и флага ускорения окна нет — остаются только сведения о видеокарте. */
  const mobile = isMobileMode();
  let hasElectron = $state(false);
  /** Телефон: переключатель есть, если доступен плагин APK или (отладка в окне) настройка Electron. */
  let mobileAccelAvailable = $state(false);
  /** Значение, с которым запущено приложение: отличие от переключателя = нужен перезапуск. */
  let accelAtLaunch = $state(true);
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
    if (window.electron?.getSettings && !mobile) {
      hasElectron = true;
      const settings = await window.electron.getSettings();
      minimizeToTray = settings.minimizeToTray ?? false;
      adaptiveAcceleration = settings.adaptiveAcceleration !== false;
      behaviorLoaded = true;
    } else if (showTvMetrics || isNativeApk || mobile) {
      behaviorLoaded = true;
    }

    if (mobile) {
      if (hasNativeAcceleration()) {
        const st = await getNativeAcceleration();
        adaptiveAcceleration = st?.enabled ?? true;
        accelAtLaunch = st?.applied ?? adaptiveAcceleration;
        mobileAccelAvailable = true;
      } else if (window.electron?.getSettings) {
        const settings = await window.electron.getSettings();
        adaptiveAcceleration = settings.adaptiveAcceleration !== false;
        accelAtLaunch = adaptiveAcceleration;
        mobileAccelAvailable = true;
      }
    }

    debugMetrics = isDebugMetricsEnabled();
    if (isNativeApk) await loadDiagnostics();
  }

  function saveTray(checked: boolean) {
    minimizeToTray = checked;
    window.electron?.saveSettings?.({ minimizeToTray: checked });
    window.dispatchEvent(new CustomEvent('anix:minimizeToTrayChanged', {
      detail: { minimizeToTray: checked },
    }));
  }

  function saveAccel(checked: boolean) {
    adaptiveAcceleration = checked;
    if (mobile && hasNativeAcceleration()) {
      void setNativeAcceleration(checked);
      return;
    }
    window.electron?.saveSettings?.({ adaptiveAcceleration: checked });
  }

  function saveDebugMetrics(checked: boolean) {
    debugMetrics = checked;
    setDebugMetricsEnabled(checked);
  }

  onMount(() => void loadBehavior());
</script>

<div class="uiv2-settings">
  {#if !hasElectron && !showTvMetrics && !isNativeApk && !mobile}
    {#if !embedded}<p class="uiv2-settings__status">Здесь нечего настраивать в этой сборке.</p>{/if}
  {:else if !behaviorLoaded}
    <p class="uiv2-settings__status">Загрузка…</p>
  {:else}
    {#if isNativeApk || mobile}
      <section class="uiv2-settings__block">
        <h3 class="uiv2-settings__title">Видеокарта</h3>
        <div class="uiv2-settings__group">
          {#if mobileAccelAvailable}
            <UiV2SettingsRow
              title="Адаптивное ускорение"
              desc={adaptiveAcceleration !== accelAtLaunch
                ? 'Изменение вступит в силу после перезапуска приложения.'
                : 'Использовать видеокарту для обработки видео — без него не работает Anime4K. Выключите, если картинка мерцает или появляются артефакты.'}
            >
              <UiV2Toggle label="Адаптивное ускорение" checked={adaptiveAcceleration} onChange={saveAccel} />
            </UiV2SettingsRow>
          {/if}
          <UiV2SettingsRow
            title="Видеокарта для Anime4K"
            desc={isGpuAvailable()
              ? 'WebGPU доступен — Anime4K можно включить в «Воспроизведении».'
              : 'WebGPU недоступен — Anime4K на этом устройстве не включится. Подробности ниже.'}
          >
            <span class="uiv2-settings__pill">{isGpuAvailable() ? 'Доступно' : 'Нет WebGPU'}</span>
          </UiV2SettingsRow>
        </div>
      </section>

      {#if isNativeApk}
      <section class="uiv2-settings__block">
        <h3 class="uiv2-settings__title">Устройство и GPU</h3>
        <div class="uiv2-settings__group uiv2-settings__group--pad">
          {#if diagnosticsLoading}
            <p class="uiv2-settings__status">Сбор диагностики…</p>
          {:else if diagnosticLines.length === 0}
            <p class="uiv2-settings__status">Не удалось собрать сведения об устройстве.</p>
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
