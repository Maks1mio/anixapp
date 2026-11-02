<script lang="ts">
  import { iconX } from '../icons';

  export interface TvChoiceOption {
    value: string;
    label: string;
    hint?: string;
  }

  /**
   * Список вариантов поверх экрана в стиле TV-диалогов релиза.
   * «Назад» закрывает его через кнопку «Закрыть» (см. CLOSE_SELECTORS в tv-navigation).
   */
  interface Props {
    title: string;
    options: TvChoiceOption[];
    value?: string;
    /** Диалог-подтверждение: первый пункт — действие, второй — отмена. */
    danger?: boolean;
    onSelect: (value: string) => void;
    onClose: () => void;
  }

  let { title, options, value = '', danger = false, onSelect, onClose }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="tv-release-page__dialog tv-choice"
  role="dialog"
  aria-modal="true"
  aria-label={title}
  tabindex="-1"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
  <div class="tv-release-page__dialog-panel tv-choice__panel">
    <div class="tv-release-page__dialog-head">
      <h2>{title}</h2>
      <button type="button" class="tv-release-page__dialog-close" aria-label="Закрыть" onclick={onClose}>
        {@html iconX(18)}
      </button>
    </div>
    <div class="tv-release-page__dialog-list">
      {#each options as option, i (option.value)}
        <button
          type="button"
          class="tv-release-page__dialog-item tv-choice__item"
          class:tv-release-page__dialog-item--on={option.value === value}
          class:tv-choice__item--danger={danger && i === 0}
          onclick={() => onSelect(option.value)}
        >
          <span>{option.label}</span>
          {#if option.hint}<span class="tv-choice__hint">{option.hint}</span>{/if}
        </button>
      {/each}
    </div>
  </div>
</div>
