<script lang="ts">
  import { tick } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import { iconArrowUpDown, iconCheck, iconChevronDown } from '../icons';

  export type UiV2SelectStatus = 'good' | 'medium' | 'bad' | 'offline' | 'neutral';

  export type UiV2SelectOption = {
    value: string;
    label: string;
    /** Подпись под label */
    desc?: string;
    /** Мета справа (ping, «42 ms») */
    hint?: string;
    /** HTML-иконка */
    icon?: string;
    /** Цветовой индикатор слева */
    status?: UiV2SelectStatus;
    /** Предупреждение под desc */
    warning?: string;
    disabled?: boolean;
  };

  type Props = {
    label?: string;
    placeholder?: string;
    options?: UiV2SelectOption[];
    value?: string | null;
    disabled?: boolean;
    id?: string;
    class?: string;
    /** Компактный триггер — только иконка (тулбары) */
    compact?: boolean;
    onChange?: (value: string) => void;
  };

  let {
    label,
    placeholder = 'Выберите…',
    options = [],
    value = $bindable(null),
    disabled = false,
    id = `uiv2-select-${Math.random().toString(36).slice(2, 9)}`,
    class: className = '',
    compact = false,
    onChange,
  }: Props = $props();

  const GAP = 8;
  const EDGE = 10;

  let triggerEl = $state<HTMLButtonElement | null>(null);
  let panelEl = $state<HTMLDivElement | null>(null);
  let open = $state(false);
  let panelLeft = $state(0);
  let panelTop = $state(0);
  let panelWidth = $state(0);
  let openDown = $state(true);
  let originY = $state('0%');

  const selected = $derived(options.find((o) => o.value === value) ?? null);
  const listboxId = $derived(`${id}-listbox`);
  const showLeading = $derived(options.some((o) => o.status || o.icon));
  const compactTitle = $derived(
    selected?.desc ? `${selected.label} · ${selected.desc}` : (selected?.label ?? placeholder),
  );

  function isTriggerVisible(): boolean {
    if (!triggerEl) return false;
    const r = triggerEl.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  }

  async function updatePanelPosition() {
    if (!triggerEl || !panelEl) return;
    await tick();

    const rect = triggerEl.getBoundingClientRect();
    panelWidth = compact ? 0 : rect.width;

    const panelHeight = panelEl.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;
    openDown = spaceBelow >= spaceAbove && spaceBelow >= Math.min(panelHeight, 180);
    originY = openDown ? '0%' : '100%';

    panelLeft = rect.left;
    panelTop = openDown ? rect.bottom + GAP : rect.top - GAP - panelHeight;

    const panelRect = panelEl.getBoundingClientRect();
    if (panelRect.right > window.innerWidth - EDGE) {
      panelLeft = Math.max(EDGE, window.innerWidth - EDGE - panelRect.width);
    }
    if (panelRect.left < EDGE) {
      panelLeft = EDGE;
    }

    const nextRect = panelEl.getBoundingClientRect();
    if (compact) {
      panelLeft = Math.max(EDGE, rect.right - nextRect.width);
    }
    if (nextRect.top < EDGE) {
      panelTop = EDGE;
    } else if (nextRect.bottom > window.innerHeight - EDGE) {
      panelTop = window.innerHeight - EDGE - nextRect.height;
    }
  }

  async function openPanel() {
    if (disabled || open) return;
    open = true;
    await tick();
    await updatePanelPosition();
    requestAnimationFrame(() => updatePanelPosition());
  }

  function closePanel() {
    open = false;
  }

  function togglePanel(e: MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
    if (open) closePanel();
    else openPanel();
  }

  function selectOption(opt: UiV2SelectOption) {
    if (opt.disabled) return;
    value = opt.value;
    onChange?.(opt.value);
    closePanel();
  }

  function onDocumentClick(e: MouseEvent) {
    const target = e.target as Node;
    if (triggerEl?.contains(target) || panelEl?.contains(target)) return;
    closePanel();
  }

  function onDocumentKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      closePanel();
      triggerEl?.focus();
    }
  }

  function onScrollOrResize() {
    if (!open) return;
    if (!isTriggerVisible()) {
      closePanel();
      return;
    }
    updatePanelPosition();
  }

  $effect(() => {
    if (!open) return;
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onDocumentKeydown, true);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('click', onDocumentClick, true);
      document.removeEventListener('keydown', onDocumentKeydown, true);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  });
</script>

<div
  class="uiv2-select {className}"
  class:uiv2-select--disabled={disabled}
  class:uiv2-select--open={open}
  class:uiv2-select--compact={compact}
>
  {#if label && !compact}
    <label class="uiv2-select__label" for="{id}-trigger">{label}</label>
  {/if}

  <div class="uiv2-select__field">
    <button
      bind:this={triggerEl}
      id="{id}-trigger"
      type="button"
      class="uiv2-select__trigger"
      class:uiv2-select__trigger--with-desc={!!selected?.desc && !compact}
      class:uiv2-select__trigger--compact={compact}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      aria-label={compact ? compactTitle : undefined}
      title={compact ? compactTitle : undefined}
      {disabled}
      onclick={togglePanel}
    >
      {#if compact}
        <span class="uiv2-select__compact-icon" aria-hidden="true">
          {@html iconArrowUpDown(18)}
        </span>
      {:else}
        <span class="uiv2-select__value">
          {#if selected}
            <span class="uiv2-select__value-main">
              {#if selected.status || selected.icon}
                <span class="uiv2-select__value-leading">
                  {#if selected.status}
                    <span class="uiv2-status-dot uiv2-status-dot--{selected.status}" aria-hidden="true"></span>
                  {/if}
                  {#if selected.icon}
                    <span class="uiv2-select__option-icon">{@html selected.icon}</span>
                  {/if}
                </span>
              {/if}
              <span class="uiv2-select__value-label">{selected.label}</span>
              {#if selected.hint}
                <span class="uiv2-select__value-hint">{selected.hint}</span>
              {/if}
            </span>
            {#if selected.desc}
              <span class="uiv2-select__value-desc">{selected.desc}</span>
            {/if}
          {:else}
            <span class="uiv2-select__value-label uiv2-select__value-label--placeholder">{placeholder}</span>
          {/if}
        </span>
        <span class="uiv2-select__chevron" aria-hidden="true">
          {@html iconChevronDown(16)}
        </span>
      {/if}
    </button>
  </div>
</div>

{#if open}
  <div class="uiv2-select__overlay" data-uiv2-select-portal use:portal>
    <div
      bind:this={panelEl}
      id={listboxId}
      class="uiv2-select__panel"
      class:uiv2-select__panel--up={!openDown}
      class:uiv2-select__panel--with-leading={showLeading}
      role="listbox"
      aria-labelledby="{id}-trigger"
      style:left="{panelLeft}px"
      style:top="{panelTop}px"
      style:width={compact ? undefined : `${panelWidth}px`}
      style:min-width={compact ? '15rem' : undefined}
      style:transform-origin="50% {originY}"
      transition:scale={{ duration: 200, start: 0.97, easing: cubicOut }}
    >
      <ul class="uiv2-select__list">
        {#each options as opt (opt.value)}
          <li class="uiv2-select__item">
            <button
              type="button"
              class="uiv2-select__option"
              class:uiv2-select__option--selected={value === opt.value}
              class:uiv2-select__option--disabled={opt.disabled}
              class:uiv2-select__option--with-desc={!!opt.desc || !!opt.warning}
              role="option"
              aria-selected={value === opt.value}
              disabled={opt.disabled}
              onclick={() => selectOption(opt)}
            >
              {#if showLeading}
                <span class="uiv2-select__option-leading">
                  {#if opt.status}
                    <span class="uiv2-status-dot uiv2-status-dot--{opt.status}" aria-hidden="true"></span>
                  {/if}
                  {#if opt.icon}
                    <span class="uiv2-select__option-icon">{@html opt.icon}</span>
                  {/if}
                </span>
              {/if}
              <span class="uiv2-select__option-body">
                <span class="uiv2-select__option-label">{opt.label}</span>
                {#if opt.desc}
                  <span class="uiv2-select__option-desc">{opt.desc}</span>
                {/if}
                {#if opt.warning}
                  <span class="uiv2-select__option-warning">{opt.warning}</span>
                {/if}
              </span>
              <span class="uiv2-select__option-trailing">
                {#if value !== opt.value && opt.hint}
                  <span class="uiv2-select__option-hint">{opt.hint}</span>
                {/if}
                {#if value === opt.value}
                  <span class="uiv2-select__option-check" aria-hidden="true">
                    {@html iconCheck(16)}
                  </span>
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
