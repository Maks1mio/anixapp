<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import UiV2Button from './UiV2Button.svelte';

  export type UiV2ChoiceOption = {
    value: string | number;
    label: string;
  };

  type Props = {
    title: string;
    options: UiV2ChoiceOption[];
    value: string | number;
    cancelLabel?: string;
    disabled?: boolean;
    onSelect?: (value: string | number) => void;
    onClose?: () => void;
  };

  let {
    title,
    options,
    value,
    cancelLabel = 'Отмена',
    disabled = false,
    onSelect,
    onClose,
  }: Props = $props();

  const titleId = `uiv2-choice-sheet-${Math.random().toString(36).slice(2, 9)}`;

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
  class="uiv2-choice-sheet"
  role="dialog"
  aria-modal="true"
  aria-labelledby={titleId}
  use:portal
>
  <button
    type="button"
    class="uiv2-choice-sheet__backdrop"
    aria-label="Закрыть"
    onclick={() => onClose?.()}
    transition:fade={{ duration: 160 }}
  ></button>

  <div
    class="uiv2-choice-sheet__panel"
    transition:scale={{ duration: 220, start: 0.94, easing: cubicOut }}
  >
    <h3 id={titleId} class="uiv2-choice-sheet__title">{title}</h3>

    <ul class="uiv2-choice-sheet__list" role="listbox" aria-label={title}>
      {#each options as opt (opt.value)}
        <li>
          <button
            type="button"
            class="uiv2-choice-sheet__option"
            class:uiv2-choice-sheet__option--on={value === opt.value}
            role="option"
            aria-selected={value === opt.value}
            {disabled}
            onclick={() => onSelect?.(opt.value)}
          >
            <span class="uiv2-choice-sheet__radio" aria-hidden="true"></span>
            <span class="uiv2-choice-sheet__label">{opt.label}</span>
          </button>
        </li>
      {/each}
    </ul>

    <UiV2Button
      label={cancelLabel}
      size="lg"
      block
      variant="chrome"
      onclick={() => onClose?.()}
    />
  </div>
</div>
