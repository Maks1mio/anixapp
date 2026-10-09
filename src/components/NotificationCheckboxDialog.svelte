<script lang="ts">
  import { tick } from 'svelte';
  import UiV2ScrollArea from './uikit-v2/UiV2ScrollArea.svelte';
  import { iconSearch } from './icons';

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
    /** Показывать поле поиска (по умолчанию — если опций много). */
    searchable?: boolean;
    onClose: () => void;
    onConfirm: (ids: number[]) => void;
  }

  let {
    open,
    title,
    options,
    selectedIds,
    busy = false,
    searchable,
    onClose,
    onConfirm,
  }: Props = $props();

  let draft = $state<number[]>([]);
  let query = $state('');
  let searchInputEl = $state<HTMLInputElement | null>(null);
  let wasOpen = false;

  const showSearch = $derived(searchable ?? options.length >= 8);

  const filteredOptions = $derived.by(() => {
    const q = query.trim().toLocaleLowerCase('ru');
    if (!q) return options;
    return options.filter((opt) => opt.label.toLocaleLowerCase('ru').includes(q));
  });

  $effect(() => {
    if (!open) {
      wasOpen = false;
      return;
    }
    draft = [...selectedIds];
    if (!wasOpen) {
      wasOpen = true;
      query = '';
      if (showSearch) {
        void tick().then(() => searchInputEl?.focus());
      }
    }
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
      {#if showSearch}
        <label class="notif-check-dialog__search">
          <span class="notif-check-dialog__search-icon" aria-hidden="true">{@html iconSearch(16)}</span>
          <input
            bind:this={searchInputEl}
            class="notif-check-dialog__search-input"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="Поиск"
            aria-label="Поиск"
            bind:value={query}
            disabled={busy}
          />
        </label>
      {/if}
      <UiV2ScrollArea class="notif-check-dialog__scroll" padding="0.25rem 0.35rem 0.5rem">
        <div class="notif-check-dialog__list">
          {#each filteredOptions as opt (opt.id)}
            <label class="notif-check-dialog__row">
              <input
                type="checkbox"
                checked={draft.includes(opt.id)}
                disabled={busy}
                onchange={() => toggle(opt.id)}
              />
              <span>{opt.label}</span>
            </label>
          {:else}
            <p class="notif-check-dialog__empty">Ничего не найдено</p>
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
