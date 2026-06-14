<script lang="ts">
  import { iconChevronDown, iconTriangleAlert, iconArrowUpDown } from './icons';
  import { renderPage } from './page';
  import SelectEnhanced from './SelectEnhanced.svelte';
  import type { SelectProps } from './Select.svelte.ts';

  let {
    label,
    placeholder = 'Выберите…',
    options = [],
    sections = [],
    value = null,
    values = [],
    onChange,
    onValuesChange,
    className,
    id,
    disabled = false,
    compact = false,
    enhanced = false,
    searchable = false,
    multi = false,
    variant = 'default',
    startYear = null,
    endYear = null,
    onYearRangeChange,
    emptyValue = '0',
    resetValue,
  }: SelectProps = $props();

  const useEnhanced = $derived(
    !compact && (
      enhanced ||
      multi ||
      searchable ||
      variant === 'yearRange' ||
      (sections?.length ?? 0) > 0
    ),
  );

  // ── Classic (compact toolbar + simple lists) ──────────────────────────────
  const DROPDOWN_CLASS = 'custom-select__dropdown';
  const DROPDOWN_OPEN = 'custom-select__dropdown--open';
  const DROPDOWN_CLOSING = 'custom-select__dropdown--closing';
  const SELECT_GAP = 8;
  const SELECT_EDGE = 8;

  let activeSelectClose: (() => void) | null = null;
  let isOpen = $state(false);
  let closeDropdown: (() => void) | null = null;
  let triggerEl: HTMLButtonElement;

  const selectedOption = $derived(options.find((o) => o.value === value) ?? null);
  const compactTitle = $derived(
    selectedOption?.desc
      ? `${selectedOption.label} · ${selectedOption.desc}`
      : (selectedOption?.label ?? placeholder)
  );

  function isTriggerVisible(trigger: HTMLElement): boolean {
    const r = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  }

  function updateDropdownPosition(dropdown: HTMLElement, trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    dropdown.style.width = compact ? 'auto' : `${rect.width}px`;
    if (compact) dropdown.style.minWidth = '15rem';
    dropdown.style.top = `${rect.bottom + SELECT_GAP}px`;

    const spaceLeft = rect.left - SELECT_EDGE;
    const spaceRight = vw - rect.right - SELECT_EDGE;
    const openToRight = compact ? false : spaceRight >= spaceLeft;
    dropdown.style.left = openToRight ? `${rect.left}px` : `${Math.max(SELECT_EDGE, rect.right - rect.width)}px`;

    let listRect = dropdown.getBoundingClientRect();
    const spaceBelow = vh - (rect.bottom + SELECT_GAP);
    const spaceAbove = rect.top - SELECT_GAP;
    const fitsBelow = listRect.height <= spaceBelow;
    const fitsAbove = listRect.height <= spaceAbove;

    if (!fitsBelow && fitsAbove) {
      dropdown.style.top = `${rect.top + SELECT_GAP - listRect.height}px`;
    } else {
      dropdown.style.top = `${rect.bottom + SELECT_GAP}px`;
    }

    listRect = dropdown.getBoundingClientRect();
    if (listRect.right > vw - SELECT_EDGE) {
      dropdown.style.left = `${Math.max(SELECT_EDGE, rect.right - listRect.width)}px`;
    }
    if (listRect.left < SELECT_EDGE) {
      dropdown.style.left = `${SELECT_EDGE}px`;
    }

    const r2 = dropdown.getBoundingClientRect();
    let top = parseFloat(dropdown.style.top);
    if (r2.top < SELECT_EDGE) top += SELECT_EDGE - r2.top;
    else if (r2.bottom > vh - SELECT_EDGE) top -= r2.bottom - (vh - SELECT_EDGE);
    dropdown.style.top = `${top}px`;
  }

  function createDropdown(
    trigger: HTMLElement,
    onSelect: (v: string) => void,
    onClosed: () => void,
  ): () => void {
    const dropdown = document.createElement('div');
    dropdown.className = DROPDOWN_CLASS;
    dropdown.setAttribute('role', 'listbox');

    const pageEl = renderPage({ noPadding: true, extraClass: 'custom-select__page' });
    const scrollEl = pageEl.querySelector('.page__scroll')!;
    const listEl = document.createElement('div');
    listEl.className = 'custom-select__list';

    let selectedItem: HTMLElement | null = null;

    options.forEach((opt) => {
      const item = document.createElement('div');
      item.className = 'custom-select__option';
      if (opt.disabled) item.classList.add('custom-select__option--disabled');
      if (opt.value === value) {
        item.classList.add('custom-select__option--selected');
        selectedItem = item;
      }
      item.setAttribute('role', 'option');
      item.setAttribute('data-value', opt.value);

      if (opt.desc) {
        item.classList.add('custom-select__option--with-desc');
        const labelEl = document.createElement('span');
        labelEl.className = 'custom-select__option-label';
        labelEl.textContent = opt.label;
        const descEl = document.createElement('span');
        descEl.className = 'custom-select__option-desc';
        descEl.textContent = opt.desc;
        item.appendChild(labelEl);
        item.appendChild(descEl);
      } else {
        item.textContent = opt.label;
      }
      if (opt.warning) {
        item.classList.add('custom-select__option--with-warning');
        const warnEl = document.createElement('span');
        warnEl.className = 'custom-select__option-warning';
        warnEl.innerHTML = `<span class="custom-select__option-warning-icon" aria-hidden="true">${iconTriangleAlert(12)}</span><span class="custom-select__option-warning-text">${opt.warning}</span>`;
        item.appendChild(warnEl);
      }

      item.addEventListener('click', () => {
        if (opt.disabled) return;
        onSelect(opt.value);
        handleClose();
      });
      listEl.appendChild(item);
    });

    scrollEl.appendChild(listEl);
    dropdown.appendChild(pageEl);

    function onScrollOrResize() {
      if (!document.body.contains(dropdown)) return;
      if (!isTriggerVisible(trigger)) {
        handleClose();
        return;
      }
      updateDropdownPosition(dropdown, trigger);
    }

    let closed = false;
    function handleClose() {
      if (closed) return;
      closed = true;
      if (activeSelectClose === handleClose) activeSelectClose = null;
      dropdown.classList.remove(DROPDOWN_OPEN);
      dropdown.classList.add(DROPDOWN_CLOSING);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      document.removeEventListener('click', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
      const onEnd = () => {
        dropdown.removeEventListener('transitionend', onEnd);
        dropdown.remove();
        onClosed();
      };
      dropdown.addEventListener('transitionend', onEnd);
      setTimeout(onEnd, 250);
    }

    const closeOnOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdown.contains(target) || trigger.contains(target)) return;
      handleClose();
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };

    document.body.appendChild(dropdown);
    updateDropdownPosition(dropdown, trigger);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        dropdown.classList.add(DROPDOWN_OPEN);
        if (selectedItem) (selectedItem as HTMLElement).scrollIntoView({ block: 'nearest' });
      }),
    );
    document.addEventListener('click', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    activeSelectClose = handleClose;
    return handleClose;
  }

  function handleTriggerClick(e: MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
    if (isOpen) {
      closeDropdown?.();
    } else {
      activeSelectClose?.();
      isOpen = true;
      closeDropdown = createDropdown(
        triggerEl,
        (val) => { onChange?.(val); },
        () => {
          isOpen = false;
          closeDropdown = null;
        },
      );
    }
  }
</script>

{#if useEnhanced}
  <SelectEnhanced
    {label}
    placeholder={placeholder === 'Выберите…' ? 'Неважно' : placeholder}
    {options}
    {sections}
    value={value ?? '0'}
    {values}
    {multi}
    {searchable}
    {disabled}
    {variant}
    {startYear}
    {endYear}
    onChange={(v) => onChange?.(v)}
    onValuesChange={(v) => onValuesChange?.(v)}
    onYearRangeChange={(a, b) => onYearRangeChange?.(a, b)}
    {emptyValue}
    {resetValue}
  />
{:else}
  <div class="custom-select{className ? ' ' + className : ''}{disabled ? ' custom-select--disabled' : ''}" {id}>
    {#if label}
      <label class="custom-select__label" for="{id ?? 'select'}-trigger">{label}</label>
    {/if}
    <button
      bind:this={triggerEl}
      id="{id ?? 'select'}-trigger"
      type="button"
      class="custom-select__trigger{compact ? ' custom-select__trigger--compact' : ''}"
      aria-haspopup="listbox"
      aria-expanded={isOpen ? 'true' : 'false'}
      aria-disabled={disabled ? 'true' : undefined}
      aria-label={compact ? compactTitle : undefined}
      title={compact ? compactTitle : undefined}
      disabled={disabled}
      onclick={handleTriggerClick}
    >
      {#if compact}
        <span class="custom-select__trigger-compact-icon" aria-hidden="true">
          {@html iconArrowUpDown(18)}
        </span>
      {:else}
        <span class="custom-select__trigger-text">
          {#if selectedOption}
            <span class="custom-select__trigger-label">{selectedOption.label}</span>
            {#if selectedOption.desc}
              <span class="custom-select__trigger-desc">{selectedOption.desc}</span>
            {/if}
          {:else}
            <span class="custom-select__trigger-label">{placeholder}</span>
          {/if}
        </span>
        <span class="custom-select__trigger-icon" aria-hidden="true">
          {@html iconChevronDown(20)}
        </span>
      {/if}
    </button>
  </div>
{/if}
