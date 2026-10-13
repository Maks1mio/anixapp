<script lang="ts">
  import UiV2ScrollArea from './uikit-v2/UiV2ScrollArea.svelte';

  interface Option {
    id: number;
    label: string;
  }

  interface Props {
    open: boolean;
    title: string;
    options: Option[];
    selectedIds: number[];
    busy?: boolean;
    onClose: () => void;
    onConfirm: (ids: number[]) => void;
  }

  let {
    open,
    title,
    options,
    selectedIds,
    busy = false,
    onClose,
    onConfirm,
  }: Props = $props();

  let draft = $state<number[]>([]);

  $effect(() => {
    if (open) draft = [...selectedIds];
  });

  function toggle(id: number) {
    if (draft.includes(id)) draft = draft.filter((x) => x !== id);
    else draft = [...draft, id];
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget && !busy) onClose();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="notif-check-dialog-overlay"
    role="presentation"
    onclick={handleOverlayClick}
  >
    <div
      class="notif-check-dialog uikit-v2"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <h3 class="notif-check-dialog__title">{title}</h3>
      <UiV2ScrollArea class="notif-check-dialog__scroll" padding="0.25rem 0.35rem 0.5rem">
        <div class="notif-check-dialog__list">
          {#each options as opt (opt.id)}
            <label class="notif-check-dialog__row">
              <input
                type="checkbox"
                checked={draft.includes(opt.id)}
                disabled={busy}
                onchange={() => toggle(opt.id)}
              />
              <span>{opt.label}</span>
            </label>
          {/each}
        </div>
      </UiV2ScrollArea>
      <div class="notif-check-dialog__actions">
        <button type="button" class="notif-check-dialog__btn" disabled={busy} onclick={onClose}>
          Отмена
        </button>
        <button
          type="button"
          class="notif-check-dialog__btn notif-check-dialog__btn--primary"
          disabled={busy || draft.length === 0}
          onclick={() => onConfirm([...draft].sort((a, b) => a - b))}
        >
          Выбрать
        </button>
      </div>
    </div>
  </div>
{/if}
