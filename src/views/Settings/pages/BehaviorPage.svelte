<script lang="ts">
  import { onMount } from 'svelte';

  let hasElectron = $state(false);
  let minimizeToTray = $state(false);
  let adaptiveAcceleration = $state(true);
  let behaviorLoaded = $state(false);

  async function loadBehavior() {
    if (!window.electron?.getSettings) return;
    hasElectron = true;
    const settings = await window.electron.getSettings();
    minimizeToTray = settings.minimizeToTray ?? false;
    adaptiveAcceleration = settings.adaptiveAcceleration !== false;
    behaviorLoaded = true;
  }

  function saveTray(checked: boolean) {
    minimizeToTray = checked;
    window.electron?.saveSettings?.({ minimizeToTray: checked });
  }

  function saveAccel(checked: boolean) {
    adaptiveAcceleration = checked;
    window.electron?.saveSettings?.({ adaptiveAcceleration: checked });
  }

  onMount(() => void loadBehavior());
</script>

<div class="settings-modal-content">
  {#if !hasElectron}
    <p class="settings-account-coming-soon">Настройки поведения доступны только в приложении Electron.</p>
  {:else if !behaviorLoaded}
    <div style="padding:16px;color:#737373;">Загрузка…</div>
  {:else}
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
</div>
