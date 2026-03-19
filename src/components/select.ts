import { iconChevronDown } from './icons';
import { renderPage } from './page';

export interface SelectOption {
  value: string;
  label: string;
  desc?: string;
  disabled?: boolean;
}

export interface SelectOptions {
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  id?: string;
}

const DROPDOWN_CLASS = 'custom-select__dropdown';
const DROPDOWN_OPEN = 'custom-select__dropdown--open';
const DROPDOWN_CLOSING = 'custom-select__dropdown--closing';

const SELECT_GAP = 8;
const SELECT_EDGE = 8;

/** Глобальная ссылка — одновременно открыт только один селектор. */
let activeSelectClose: (() => void) | null = null;

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

  dropdown.style.width = `${rect.width}px`;
  dropdown.style.top = `${rect.bottom + SELECT_GAP}px`;

  const spaceLeft = rect.left - SELECT_EDGE;
  const spaceRight = vw - rect.right - SELECT_EDGE;
  const openToRight = spaceRight >= spaceLeft;
  dropdown.style.left = openToRight ? `${rect.left}px` : `${Math.max(SELECT_EDGE, rect.right - rect.width)}px`;

  let listRect = dropdown.getBoundingClientRect();
  const spaceBelow = vh - (rect.bottom + SELECT_GAP);
  const spaceAbove = rect.top - SELECT_GAP;
  const fitsBelow = listRect.height <= spaceBelow;
  const fitsAbove = listRect.height <= spaceAbove;

  if (!fitsBelow && fitsAbove) {
    dropdown.style.top = `${rect.top - SELECT_GAP - listRect.height}px`;
  } else {
    dropdown.style.top = `${rect.bottom + SELECT_GAP}px`;
  }

  listRect = dropdown.getBoundingClientRect();
  if (listRect.right > vw - SELECT_EDGE) {
    dropdown.style.left = `${Math.max(SELECT_EDGE, rect.right - listRect.width)}px`;
    listRect = dropdown.getBoundingClientRect();
  }
  if (listRect.left < SELECT_EDGE) {
    dropdown.style.left = `${SELECT_EDGE}px`;
  }

  // Сдвиг по вертикали, если выпадающий список всё ещё вылезает (с отступом)
  const r2 = dropdown.getBoundingClientRect();
  let top = parseFloat(dropdown.style.top);
  if (r2.top < SELECT_EDGE) top += SELECT_EDGE - r2.top;
  else if (r2.bottom > vh - SELECT_EDGE) top -= r2.bottom - (vh - SELECT_EDGE);
  dropdown.style.top = `${top}px`;
}

function createDropdown(
  options: SelectOption[],
  value: string | null,
  trigger: HTMLElement,
  onSelect: (value: string) => void,
  onClosed: () => void
): () => void {
  const dropdown = document.createElement('div');
  dropdown.className = DROPDOWN_CLASS;
  dropdown.setAttribute('role', 'listbox');

  // Page component — кастомный скролл
  const pageEl = renderPage({ scrollId: '', noPadding: true });
  pageEl.classList.add('custom-select__page');

  const listEl = pageEl.querySelector<HTMLElement>('[data-page-scroll]')!;
  listEl.classList.add('custom-select__list');

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

    item.addEventListener('click', () => {
      if (opt.disabled) return;
      onSelect(opt.value);
      handleClose();
    });
    listEl.appendChild(item);
  });

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
  requestAnimationFrame(() => requestAnimationFrame(() => {
    dropdown.classList.add(DROPDOWN_OPEN);
    // Прокрутить до выбранного элемента
    if (selectedItem) selectedItem.scrollIntoView({ block: 'nearest' });
  }));
  document.addEventListener('click', closeOnOutside);
  document.addEventListener('keydown', closeOnEscape);
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  activeSelectClose = handleClose;
  return handleClose;
}

export function renderSelect(opts: SelectOptions): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'custom-select';
  if (opts.id) wrap.id = opts.id;

  const label = opts.label;
  const options = opts.options;
  let currentValue = opts.value;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const triggerText = document.createElement('span');
  triggerText.className = 'custom-select__trigger-text';

  const triggerIcon = document.createElement('span');
  triggerIcon.className = 'custom-select__trigger-icon';
  triggerIcon.setAttribute('aria-hidden', 'true');
  triggerIcon.innerHTML = iconChevronDown(20);

  function updateTriggerLabel() {
    const selected = options.find((o) => o.value === currentValue);
    triggerText.innerHTML = '';
    if (selected) {
      const labelSpan = document.createElement('span');
      labelSpan.className = 'custom-select__trigger-label';
      labelSpan.textContent = selected.label;
      triggerText.appendChild(labelSpan);
      if (selected.desc) {
        const descSpan = document.createElement('span');
        descSpan.className = 'custom-select__trigger-desc';
        descSpan.textContent = selected.desc;
        triggerText.appendChild(descSpan);
      }
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'custom-select__trigger-label';
      placeholder.textContent = opts.placeholder ?? 'Выберите…';
      triggerText.appendChild(placeholder);
    }
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  let isOpen = false;
  let closeDropdown: (() => void) | null = null;

  const openDropdown = () => {
    if (isOpen) {
      closeDropdown?.();
      return;
    }
    activeSelectClose?.();
    isOpen = true;
    trigger.setAttribute('aria-expanded', 'true');
    closeDropdown = createDropdown(
      options,
      currentValue,
      trigger,
      (value) => {
        currentValue = value;
        updateTriggerLabel();
        opts.onChange(value);
      },
      () => {
        isOpen = false;
        closeDropdown = null;
        trigger.setAttribute('aria-expanded', 'false');
      }
    );
  };

  trigger.appendChild(triggerText);
  trigger.appendChild(triggerIcon);
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) closeDropdown?.();
    else openDropdown();
  });

  if (label) {
    const labelEl = document.createElement('label');
    labelEl.className = 'custom-select__label';
    labelEl.textContent = label;
    wrap.appendChild(labelEl);
  }
  wrap.appendChild(trigger);
  updateTriggerLabel();

  return wrap;
}
