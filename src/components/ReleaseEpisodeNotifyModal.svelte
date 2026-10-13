<script lang="ts">
  import {
    iconBan,
    iconChevronRight,
    iconList,
    iconListChecks,
  } from './icons';
  import type { VoiceoverTypeOption } from '../utils/notification-preferences';
  import NotificationCheckboxDialog from './NotificationCheckboxDialog.svelte';

  export type ReleaseNotifyMode = 'none' | 'all' | 'selected';

  interface Props {
    open: boolean;
    releaseId: number;
    catalog: VoiceoverTypeOption[];
    selectedIds: number[];
    busy?: boolean;
    onClose: () => void;
    /** Persist selected type IDs (empty = off). */
    onSave: (typeIds: number[]) => void | Promise<void>;
  }

  let {
    open,
    releaseId: _releaseId,
    catalog,
    selectedIds,
    busy = false,
    onClose,
    onSave,
  }: Props = $props();

  let pickerOpen = $state(false);

  const mode = $derived.by((): ReleaseNotifyMode => {
    if (selectedIds.length === 0) return 'none';
    if (catalog.length > 0 && selectedIds.length >= catalog.length) return 'all';
    return 'selected';
  });

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget && !busy) onClose();
  }

  async function chooseNone() {
    await onSave([]);
  }

  async function chooseAll() {
    const ids = catalog.map((t) => t.id);
    await onSave(ids);
  }

  function openPicker() {
    pickerOpen = true;
  }

  async function confirmPicker(ids: number[]) {
    pickerOpen = false;
    await onSave(ids);
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="release-notify-modal-overlay"
    role="presentation"
    onclick={handleOverlayClick}
  >
    <div
      class="release-notify-modal uikit-v2"
      role="dialog"
      aria-modal="true"
      aria-label="Уведомления о новых сериях"
    >
      <h3 class="release-notify-modal__title">Уведомления о новых сериях</h3>
      <div class="release-notify-modal__options">
        <button
          type="button"
          class="release-notify-modal__option"
          class:release-notify-modal__option--on={mode === 'none'}
          disabled={busy}
          onclick={() => { void chooseNone(); }}
        >
          <span class="release-notify-modal__option-icon">{@html iconBan(20)}</span>
          <span class="release-notify-modal__option-label">Не получать</span>
        </button>
        <button
          type="button"
          class="release-notify-modal__option"
          class:release-notify-modal__option--on={mode === 'all'}
          disabled={busy || catalog.length === 0}
          onclick={() => { void chooseAll(); }}
        >
          <span class="release-notify-modal__option-icon">{@html iconList(20)}</span>
          <span class="release-notify-modal__option-label">От всех озвучек</span>
        </button>
        <button
          type="button"
          class="release-notify-modal__option"
          class:release-notify-modal__option--on={mode === 'selected'}
          disabled={busy || catalog.length === 0}
          onclick={openPicker}
        >
          <span class="release-notify-modal__option-icon">{@html iconListChecks(20)}</span>
          <span class="release-notify-modal__option-label">От выбранных</span>
          <span class="release-notify-modal__option-chevron">{@html iconChevronRight(18)}</span>
        </button>
      </div>
    </div>
  </div>

  <NotificationCheckboxDialog
    open={pickerOpen}
    title="Выберите озвучки"
    options={catalog.map((t) => ({ id: t.id, label: t.name }))}
    selectedIds={mode === 'selected' ? selectedIds : []}
    {busy}
    onClose={() => { pickerOpen = false; }}
    onConfirm={(ids) => { void confirmPicker(ids); }}
  />
{/if}
