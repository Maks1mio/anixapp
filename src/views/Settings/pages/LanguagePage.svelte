<script lang="ts">
  /** Android: язык интерфейса и язык официального АниксПлеера (системный выбор языка приложения, Android 13+). */
  import { onMount } from 'svelte';
  import UiV2SettingsRow from '../../../components/uikit-v2/UiV2SettingsRow.svelte';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import { getAnixPlayerStatus } from '../../../utils/mobile-player';

  type LangPlugin = { openAnixPlayerLanguage?: () => Promise<{ opened?: 'locale' | 'details' | 'none' }> };

  let anixInstalled = $state<boolean | null>(null);
  let hint = $state('');

  onMount(async () => {
    try {
      anixInstalled = (await getAnixPlayerStatus())?.installed ?? false;
    } catch {
      anixInstalled = false;
    }
  });

  async function chooseAnixLanguage() {
    const p = (window as unknown as { Capacitor?: { Plugins?: { AnixPlayer?: LangPlugin } } }).Capacitor?.Plugins?.AnixPlayer;
    const r = await p?.openAnixPlayerLanguage?.().catch(() => null);
    hint = r?.opened === 'details'
      ? 'На этой версии Android язык АниксПлеера совпадает с языком системы.'
      : r?.opened === 'none'
        ? 'Не удалось открыть настройки языка.'
        : '';
  }
</script>

<div class="uiv2-settings">
  <section class="uiv2-settings__block">
    <h3 class="uiv2-settings__title">Интерфейс AnixApp</h3>
    <div class="uiv2-settings__group">
      <div class="lng__option" role="radiogroup" aria-label="Язык интерфейса">
        <button type="button" role="radio" aria-checked="true" class="lng__chip lng__chip--on">
          <span class="lng__chip-title">Русский</span>
          <span class="lng__chip-hint">Используется сейчас</span>
        </button>
      </div>
      <p class="lng__note">Другие языки интерфейса пока не поддерживаются.</p>
    </div>
  </section>

  <section class="uiv2-settings__block">
    <h3 class="uiv2-settings__title">АниксПлеер</h3>
    <div class="uiv2-settings__group">
      <UiV2SettingsRow
        title="Язык плеера"
        desc={anixInstalled === null
          ? 'Проверяем…'
          : anixInstalled
            ? 'Русский или English — выбирается в настройках Android для АниксПлеера.'
            : 'АниксПлеер не установлен. Установить его можно в разделе «Воспроизведение».'}
      >
        {#if anixInstalled}
          <UiV2Button label="Выбрать" variant="chrome" size="sm" onclick={chooseAnixLanguage} />
        {/if}
      </UiV2SettingsRow>
      {#if hint}<p class="lng__note">{hint}</p>{/if}
    </div>
  </section>
</div>

<style>
  .lng__option {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 12px 16px 4px;
  }

  .lng__chip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 64px;
    padding: 10px 12px;
    border: 1px solid var(--m-outline-variant, rgba(255, 255, 255, 0.16));
    border-radius: 12px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .lng__chip--on {
    border-color: var(--m-primary, #d0bcff);
    background: var(--m-secondary-container, rgba(208, 188, 255, 0.16));
  }

  .lng__chip-title { font-size: 16px; font-weight: 600; }
  .lng__chip-hint { font-size: 13px; opacity: 0.7; }

  .lng__note {
    margin: 0;
    padding: 8px 16px 12px;
    font-size: 13px;
    line-height: 1.45;
    opacity: 0.75;
  }
</style>
