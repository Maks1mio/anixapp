<script lang="ts">
  /** Диалог «Скачать серии» (телефон): качество и охват (все / только недостающие). */
  import { QUALITY_CHOICES, getDownloadQuality, setDownloadQuality } from '../utils/mobile-download-actions';

  interface Props {
    title: string;
    total: number;
    missing: number;
    onConfirm: (quality: string, onlyMissing: boolean) => void;
    onClose: () => void;
  }
  let { title, total, missing, onConfirm, onClose }: Props = $props();

  let quality = $state(getDownloadQuality());
  let onlyMissing = $state(missing > 0 && missing < total);
  const nothing = $derived(missing === 0);

  function confirm() {
    setDownloadQuality(quality);
    onConfirm(quality, onlyMissing);
  }
</script>

<div class="m-dialog-scrim" role="presentation">
  <button type="button" class="m-dialog-scrim__bg" aria-label="Закрыть" onclick={onClose}></button>
  <div class="m-dialog" role="dialog" aria-modal="true" aria-label="Скачать серии">
    <h2 class="m-dialog__title">Скачать серии</h2>
    <p class="m-dialog__sub">{title}</p>

    <p class="m-dialog__label">Качество</p>
    <div class="m-dialog__chips" role="radiogroup">
      {#each QUALITY_CHOICES as q (q.id)}
        <button type="button" role="radio" aria-checked={quality === q.id} class="m-chipopt" class:m-chipopt--on={quality === q.id} onclick={() => (quality = q.id)}>
          <span>{q.label}</span>
          <small>{q.hint}</small>
        </button>
      {/each}
    </div>

    {#if missing > 0 && missing < total}
      <p class="m-dialog__label">Какие серии</p>
      <div class="m-dialog__options" role="radiogroup">
        <button type="button" role="radio" aria-checked={onlyMissing} class="m-option" class:m-option--selected={onlyMissing} onclick={() => (onlyMissing = true)}>
          <span class="m-option__title">Только недостающие</span>
          <span class="m-option__text">{missing} из {total}</span>
        </button>
        <button type="button" role="radio" aria-checked={!onlyMissing} class="m-option" class:m-option--selected={!onlyMissing} onclick={() => (onlyMissing = false)}>
          <span class="m-option__title">Все серии заново</span>
          <span class="m-option__text">{total} серий (уже скачанные пропускаются)</span>
        </button>
      </div>
    {:else if nothing}
      <p class="m-dialog__note">Все серии этой озвучки уже скачаны.</p>
    {:else}
      <p class="m-dialog__note">Будет скачано серий: {total}</p>
    {/if}

    <div class="m-dialog__actions">
      <button type="button" class="m-dialog__btn m-dialog__btn--ghost" onclick={onClose}>Отмена</button>
      <button type="button" class="m-dialog__btn" disabled={nothing} onclick={confirm}>Скачать</button>
    </div>
  </div>
</div>

<style lang="scss">
  .m-dialog-scrim {
    position: fixed; inset: 0; z-index: 85; display: flex; align-items: center; justify-content: center;
    padding: 0 var(--m-space-5); background: rgba(0, 0, 0, 0.6);
  }
  .m-dialog-scrim__bg { position: absolute; inset: 0; border: 0; background: none; padding: 0; }
  .m-dialog {
    position: relative; width: 100%; max-width: 420px; max-height: 90dvh; overflow-y: auto;
    padding: var(--m-space-5) var(--m-space-4) var(--m-space-4); border-radius: 28px;
    background: var(--m-surface-sheet); color: var(--m-text);
  }
  .m-dialog__title { margin: 0; padding: 0 var(--m-space-2); font: 400 22px/1.2 var(--m-font); }
  .m-dialog__sub { margin: 4px var(--m-space-2) var(--m-space-3); color: var(--m-text-2); font-size: 14px; }
  .m-dialog__label { margin: var(--m-space-4) var(--m-space-2) var(--m-space-2); color: var(--m-text-2); font-size: 13px; letter-spacing: 0.02em; }
  .m-dialog__chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--m-space-2); }
  .m-chipopt {
    display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 4px;
    border: 1.5px solid var(--m-outline-variant); border-radius: 14px; background: transparent; color: inherit; font: 500 15px var(--m-font);
    small { font-size: 10px; color: var(--m-text-3); font-weight: 400; }
    &--on { border-color: var(--m-text); background: var(--m-secondary-container); color: var(--m-on-secondary-container); small { color: inherit; opacity: 0.8; } }
  }
  .m-dialog__options { display: flex; flex-direction: column; gap: var(--m-space-2); }
  .m-option {
    display: flex; flex-direction: column; gap: 2px; text-align: left; width: 100%;
    padding: var(--m-space-3) var(--m-space-4); border-radius: 16px; border: 2px solid var(--m-outline-variant);
    background: transparent; color: inherit; font: inherit;
    &--selected { border-color: var(--m-text); }
    &__title { font-size: 16px; font-weight: 500; }
    &__text { font-size: 13px; color: var(--m-text-2); }
  }
  .m-dialog__note { margin: var(--m-space-4) var(--m-space-2) 0; color: var(--m-text-2); font-size: 14px; }
  .m-dialog__actions { display: flex; justify-content: flex-end; gap: var(--m-space-2); margin-top: var(--m-space-5); }
  .m-dialog__btn {
    border: 0; background: var(--m-text); color: #111; font: 500 15px var(--m-font); padding: 10px 22px; border-radius: 20px;
    &:disabled { opacity: 0.4; }
    &--ghost { background: none; color: var(--m-text); }
  }
</style>
