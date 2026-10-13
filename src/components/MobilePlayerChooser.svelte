<script lang="ts">
  /** Диалог «Выберите плеер» (телефон): веб-плеер, АниксПлеер, встроенный, сторонний + «Спрашивать всегда». */
  import { getMobilePlayerPrefs, type MobilePlayerKind } from '../utils/mobile-player';

  interface Props {
    onChoose: (kind: MobilePlayerKind, ask: boolean) => void;
    onClose: () => void;
  }
  let { onChoose, onClose }: Props = $props();

  const initial = getMobilePlayerPrefs();
  let kind = $state<MobilePlayerKind>(initial.kind);
  let ask = $state(initial.ask);

  const OPTIONS: { id: MobilePlayerKind; title: string; text: string; beta?: boolean; warning?: string }[] = [
    { id: 'web', title: 'Веб-плеер', text: 'Просмотр в плеере источника. Стандартный вариант.' },
    { id: 'anix', title: 'АниксПлеер', text: 'Наш самый продвинутый плеер с наилучшим качеством.', beta: true },
    { id: 'builtin', title: 'Встроенный плеер', text: 'Простой и удобный, не требует отдельного скачивания.' },
    {
      id: 'external',
      title: 'Сторонний плеер',
      text: 'Просмотр в любом плеере, который установлен на вашем устройстве.',
      warning: 'Не помечается просмотренным в приложении при выборе серий в плеере.',
    },
  ];
</script>

<div class="m-dialog-scrim" role="presentation">
  <button type="button" class="m-dialog-scrim__bg" aria-label="Закрыть" onclick={onClose}></button>
  <div class="m-dialog" role="dialog" aria-modal="true" aria-label="Выберите плеер">
    <h2 class="m-dialog__title">Выберите плеер</h2>
    <div class="m-dialog__options" role="radiogroup">
      {#each OPTIONS as o (o.id)}
        <button
          type="button"
          role="radio"
          aria-checked={kind === o.id}
          class="m-option"
          class:m-option--selected={kind === o.id}
          onclick={() => (kind = o.id)}
        >
          <span class="m-option__title">
            {o.title}
            {#if o.beta}<span class="m-option__beta">BETA</span>{/if}
          </span>
          <span class="m-option__text">{o.text}</span>
          {#if o.warning}<span class="m-option__warning">{o.warning}</span>{/if}
        </button>
      {/each}
    </div>
    <label class="m-dialog__check">
      <input type="checkbox" bind:checked={ask} />
      <span class="m-dialog__box" aria-hidden="true"></span>
      <span>Спрашивать всегда</span>
    </label>
    <div class="m-dialog__actions">
      <button type="button" class="m-dialog__btn" onclick={() => onChoose(kind, ask)}>Продолжить</button>
    </div>
  </div>
</div>

<style lang="scss">
  .m-dialog-scrim {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--m-space-5);
    background: rgba(0, 0, 0, 0.6);
  }
  .m-dialog-scrim__bg { position: absolute; inset: 0; border: 0; background: none; padding: 0; }
  .m-dialog {
    position: relative;
    width: 100%;
    max-width: 420px;
    max-height: 90dvh;
    overflow-y: auto;
    padding: var(--m-space-5) var(--m-space-4) var(--m-space-4);
    border-radius: 28px;
    background: var(--m-surface-sheet);
    color: var(--m-text);
  }
  .m-dialog__title { margin: 0 0 var(--m-space-4); padding: 0 var(--m-space-2); font: 400 24px/1.2 var(--m-font); }
  .m-dialog__options { display: flex; flex-direction: column; gap: var(--m-space-3); }
  .m-option {
    display: flex; flex-direction: column; gap: 4px; text-align: left; width: 100%;
    padding: var(--m-space-4) var(--m-space-5); border-radius: 20px;
    border: 2px solid var(--m-outline-variant); background: transparent; color: inherit; font: inherit;
    &--selected { border-color: var(--m-text); }
    &__title { display: flex; align-items: center; gap: var(--m-space-2); font-size: 20px; font-weight: 500; }
    &__beta {
      padding: 1px 8px; border-radius: 6px; background: var(--m-text); color: #111;
      font-size: 13px; font-weight: 500; letter-spacing: 0.02em;
    }
    &__text { font-size: 17px; line-height: 1.3; color: var(--m-text-2); }
    &__warning {
      margin-top: 6px; padding: var(--m-space-2) var(--m-space-3); border-radius: 12px;
      background: color-mix(in srgb, var(--m-danger) 14%, transparent);
      color: color-mix(in srgb, var(--m-danger) 78%, var(--m-text));
      font-size: 15px; font-weight: 500; line-height: 1.3;
    }
  }
  .m-dialog__check {
    display: flex; align-items: center; gap: var(--m-space-3);
    margin: var(--m-space-4) 0 0; padding: var(--m-space-4) var(--m-space-2) 0;
    border-top: 1px solid var(--m-divider); font-size: 18px;
    input { position: absolute; opacity: 0; pointer-events: none; }
  }
  .m-dialog__box {
    position: relative; flex: none; width: 24px; height: 24px; border-radius: 4px; border: 2px solid var(--m-text-2);
  }
  .m-dialog__check input:checked + .m-dialog__box {
    background: var(--m-text); border-color: var(--m-text);
    &::after {
      content: ''; position: absolute; left: 6px; top: 1px; width: 7px; height: 13px;
      border: solid #111; border-width: 0 3px 3px 0; transform: rotate(45deg);
    }
  }
  .m-dialog__actions { display: flex; justify-content: flex-end; margin-top: var(--m-space-6); }
  .m-dialog__btn {
    border: 0; background: none; color: var(--m-text); font: 500 18px var(--m-font); padding: var(--m-space-3) var(--m-space-4);
  }
</style>
