<script lang="ts">
  /** Настройки воспроизведения на Android: плеер по умолчанию, вопрос перед серией, пропуски опенинга. */
  import UiV2SettingsRow from '../../../components/uikit-v2/UiV2SettingsRow.svelte';
  import UiV2Toggle from '../../../components/uikit-v2/UiV2Toggle.svelte';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import { getMobilePlayerPrefs, setMobilePlayerPrefs, type MobilePlayerKind } from '../../../utils/mobile-player';

  const OPTIONS: { id: MobilePlayerKind; title: string; hint: string }[] = [
    { id: 'builtin', title: 'Встроенный', hint: 'Без отдельного скачивания' },
    { id: 'web', title: 'Веб-плеер', hint: 'Плеер источника' },
    { id: 'anix', title: 'АниксПлеер', hint: 'Отдельное приложение' },
    { id: 'external', title: 'Сторонний', hint: 'VLC, mpv и другие' },
  ];

  let prefs = $state(getMobilePlayerPrefs());
  let skipCleared = $state(false);

  function setKind(kind: MobilePlayerKind) {
    prefs = { ...prefs, kind };
    setMobilePlayerPrefs(prefs);
  }

  function setAsk(ask: boolean) {
    prefs = { ...prefs, ask };
    setMobilePlayerPrefs(prefs);
  }

  function clearSkipPrefs() {
    try { localStorage.removeItem('anixapp_skip_auto_pref'); } catch { /* ignore */ }
    skipCleared = true;
  }
</script>

<div class="uiv2-settings">
  <section class="uiv2-settings__block">
    <h3 class="uiv2-settings__title">Плеер по умолчанию</h3>
    <div class="uiv2-settings__group">
      <div class="mpb__chips" role="radiogroup" aria-label="Плеер по умолчанию">
        {#each OPTIONS as o (o.id)}
          <button
            type="button"
            role="radio"
            aria-checked={prefs.kind === o.id}
            class="mpb__chip"
            class:mpb__chip--on={prefs.kind === o.id}
            onclick={() => setKind(o.id)}
          >
            <span class="mpb__chip-title">{o.title}</span>
            <span class="mpb__chip-hint">{o.hint}</span>
          </button>
        {/each}
      </div>
      <UiV2SettingsRow title="Спрашивать каждый раз" desc="Показывать выбор плеера перед началом серии.">
        <UiV2Toggle label="Спрашивать каждый раз" checked={prefs.ask} onChange={setAsk} />
      </UiV2SettingsRow>
    </div>
  </section>

  <section class="uiv2-settings__block">
    <h3 class="uiv2-settings__title">Опенинги и эндинги</h3>
    <div class="uiv2-settings__group">
      <UiV2SettingsRow title="Сбросить выбор пропуска" desc="Плеер снова спросит, пропускать ли опенинг и эндинг в каждом тайтле.">
        <UiV2Button label={skipCleared ? 'Сброшено' : 'Сбросить'} variant="chrome" size="sm" disabled={skipCleared} onclick={clearSkipPrefs} />
      </UiV2SettingsRow>
    </div>
  </section>
</div>

<style>
  .mpb__chips {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 12px 16px;
  }

  .mpb__chip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 56px;
    padding: 10px 12px;
    border: 1px solid var(--m-outline-variant, rgba(255, 255, 255, 0.16));
    border-radius: 12px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .mpb__chip--on {
    border-color: var(--m-primary, #d0bcff);
    background: var(--m-secondary-container, rgba(208, 188, 255, 0.16));
  }

  .mpb__chip-title { font-weight: 600; }
  .mpb__chip-hint { font-size: 13px; opacity: 0.7; }
</style>
