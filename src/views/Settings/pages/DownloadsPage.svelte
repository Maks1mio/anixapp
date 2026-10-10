<script lang="ts">
  /** Настройки загрузок (Android): качество по умолчанию, только по Wi-Fi, место на устройстве, очистка. */
  import { onMount } from 'svelte';
  import UiV2SettingsRow from '../../../components/uikit-v2/UiV2SettingsRow.svelte';
  import UiV2Toggle from '../../../components/uikit-v2/UiV2Toggle.svelte';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import { QUALITY_CHOICES, getDownloadQuality, setDownloadQuality } from '../../../utils/mobile-download-actions';
  import {
    downloadsAvailable,
    getWifiOnly,
    listDownloads,
    removeAllDownloads,
    setWifiOnly,
    storageInfo,
    type StorageInfo,
  } from '../../../native/anix-downloads';

  const available = downloadsAvailable();
  let quality = $state(getDownloadQuality());
  let wifiOnly = $state(false);
  let storage = $state<StorageInfo | null>(null);
  let count = $state(0);
  let confirmClear = $state(false);
  let clearing = $state(false);

  function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return '0 МБ';
    const gb = n / 1024 ** 3;
    return gb >= 1 ? `${gb.toFixed(1)} ГБ` : `${Math.round(n / 1024 ** 2)} МБ`;
  }

  async function refresh() {
    if (!available) return;
    wifiOnly = await getWifiOnly();
    storage = await storageInfo();
    count = (await listDownloads()).length;
  }

  function pickQuality(id: string) {
    quality = id;
    setDownloadQuality(id);
  }

  async function toggleWifi(checked: boolean) {
    wifiOnly = checked;
    wifiOnly = await setWifiOnly(checked);
  }

  async function clearAll() {
    if (!confirmClear) {
      confirmClear = true;
      return;
    }
    clearing = true;
    try {
      await removeAllDownloads();
      // Удаление идёт в DownloadService асинхронно — даём ему время и перечитываем.
      await new Promise((r) => setTimeout(r, 800));
      await refresh();
    } finally {
      clearing = false;
      confirmClear = false;
    }
  }

  onMount(() => void refresh());
</script>

<div class="uiv2-settings">
  {#if !available}
    <p class="uiv2-settings__status">Загрузки доступны только в Android-приложении.</p>
  {:else}
    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Качество</h3>
      <div class="uiv2-settings__group">
        <UiV2SettingsRow title="Качество по умолчанию" desc="Предлагается в диалоге скачивания; если серии нет в этом качестве — берётся ближайшее." />
        <div class="dl-settings__chips" role="radiogroup" aria-label="Качество по умолчанию">
          {#each QUALITY_CHOICES as q (q.id)}
            <button
              type="button"
              role="radio"
              aria-checked={quality === q.id}
              class="dl-settings__chip"
              class:dl-settings__chip--on={quality === q.id}
              onclick={() => pickQuality(q.id)}
            >
              <span class="dl-settings__chip-label">{q.label}</span>
              <span class="dl-settings__chip-hint">{q.hint}</span>
            </button>
          {/each}
        </div>
      </div>
    </section>

    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Сеть</h3>
      <div class="uiv2-settings__group">
        <UiV2SettingsRow title="Только по Wi-Fi" desc="Через мобильный интернет загрузки ждут и продолжатся при подключении к Wi-Fi.">
          <UiV2Toggle label="Только по Wi-Fi" checked={wifiOnly} onChange={(c) => void toggleWifi(c)} />
        </UiV2SettingsRow>
      </div>
    </section>

    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Хранилище</h3>
      <div class="uiv2-settings__group">
        <UiV2SettingsRow
          title="Скачанные серии"
          desc={storage
            ? `Занято: ${formatBytes(storage.cacheBytes)} · свободно на устройстве: ${formatBytes(storage.freeBytes)}`
            : 'Нет данных о хранилище'}
        >
          <span class="uiv2-settings__pill">{count}</span>
        </UiV2SettingsRow>
        <div class="dl-settings__actions">
          <UiV2Button
            label={clearing ? 'Удаление…' : confirmClear ? 'Точно удалить все?' : 'Удалить все загрузки'}
            variant="chrome"
            size="sm"
            disabled={clearing || count === 0}
            onclick={() => void clearAll()}
          />
          {#if confirmClear && !clearing}
            <UiV2Button label="Отмена" variant="chrome" size="sm" onclick={() => (confirmClear = false)} />
          {/if}
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .dl-settings__chips {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
    padding: 4px 16px 16px;
  }

  .dl-settings__chip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border: 1px solid var(--m-outline-variant, rgba(255, 255, 255, 0.16));
    border-radius: 12px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .dl-settings__chip--on {
    border-color: var(--m-primary, #d0bcff);
    background: var(--m-secondary-container, rgba(208, 188, 255, 0.16));
  }

  .dl-settings__chip-label {
    font-weight: 600;
  }

  .dl-settings__chip-hint {
    font-size: 13px;
    opacity: 0.7;
  }

  .dl-settings__actions {
    display: flex;
    gap: 8px;
    padding: 4px 16px 16px;
  }
</style>
