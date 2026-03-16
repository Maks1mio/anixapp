/**
 * Компонент «три точки» — выпадающее меню, привязанное к круглой кнопке.
 *
 * Логика позиционирования:
 * - Горизонталь: правый край меню совпадает с правым краем кнопки (меню уходит влево).
 *   Если при этом меню вылезает за левый край — clamp к EDGE.
 * - Вертикаль: вниз от кнопки; если не влезает — вверх. Финальный clamp по вертикали.
 * - Все расчёты через clientWidth/clientHeight (без скроллбара).
 * - GAP между кнопкой и меню, EDGE — минимальный отступ от любого края экрана.
 */

import { iconMoreHorizontal } from './icons';

/* ———— Типы ———— */

export interface DotsMenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
}

export interface DotsMenuDivider {
  type: 'divider';
}

export interface DotsMenuLabel {
  type: 'label';
  text: string;
}

export type DotsMenuEntry = DotsMenuItem | DotsMenuDivider | DotsMenuLabel;

export interface DotsMenuOptions {
  entries: DotsMenuEntry[];
  onSelect: (id: string) => void;
  iconSize?: number;
}

/* ———— Константы ———— */

const GAP = 8;
const EDGE = 8;

/** Глобальная ссылка на функцию закрытия текущего открытого меню. */
let activeClose: (() => void) | null = null;

/** Закрыть любое открытое dots-menu (вызывается перед открытием нового). */
export function closeActiveDotsMenu(): void {
  activeClose?.();
}

/* ———— Позиционирование ———— */

function position(dropdown: HTMLElement, btn: HTMLElement): void {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const br = btn.getBoundingClientRect();

  dropdown.style.left = '0px';
  dropdown.style.top = '0px';
  const dr = dropdown.getBoundingClientRect();
  const mw = dr.width;
  const mh = dr.height;

  const btnCenter = (br.left + br.right) / 2;
  let x: number;
  if (btnCenter < vw / 2) {
    // Кнопка в левой половине — меню вправо от кнопки
    x = br.left;
  } else {
    // Кнопка в правой половине — меню влево от кнопки
    x = br.right - mw;
  }
  if (x < EDGE) x = EDGE;
  if (x + mw > vw - EDGE) x = vw - EDGE - mw;

  let y = br.bottom + GAP;
  const fitsBelow = y + mh <= vh - EDGE;
  const fitsAbove = br.top - GAP - mh >= EDGE;
  if (!fitsBelow && fitsAbove) {
    y = br.top - GAP - mh;
  }
  if (y < EDGE) y = EDGE;
  if (y + mh > vh - EDGE) y = vh - EDGE - mh;

  dropdown.style.left = `${x}px`;
  dropdown.style.top = `${y}px`;
}

/** Кнопка видна в области прокрутки? */
function isTriggerVisible(btn: HTMLElement): boolean {
  const r = btn.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
}

/* ———— Создание выпадающего списка ———— */

function createPanel(
  entries: DotsMenuEntry[],
  btn: HTMLElement,
  onSelect: (id: string) => void,
  onClosed: () => void,
): () => void {
  const panel = document.createElement('div');
  panel.className = 'dots-menu__panel';
  panel.setAttribute('role', 'menu');

  const list = document.createElement('div');
  list.className = 'dots-menu__list';

  for (const entry of entries) {
    if ((entry as DotsMenuDivider).type === 'divider') {
      const d = document.createElement('div');
      d.className = 'dots-menu__divider';
      list.appendChild(d);
      continue;
    }
    if ((entry as DotsMenuLabel).type === 'label') {
      const d = document.createElement('div');
      d.className = 'dots-menu__label';
      d.textContent = (entry as DotsMenuLabel).text;
      list.appendChild(d);
      continue;
    }
    const item = entry as DotsMenuItem;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'dots-menu__item';
    if (item.disabled) el.classList.add('dots-menu__item--disabled');
    el.setAttribute('role', 'menuitem');
    el.setAttribute('data-id', item.id);

    if (item.icon) {
      el.innerHTML =
        `<span class="dots-menu__item-icon">${item.icon}</span>` +
        `<span class="dots-menu__item-text">${esc(item.label)}</span>`;
    } else {
      el.textContent = item.label;
    }

    el.addEventListener('click', () => {
      if (item.disabled) return;
      onSelect(item.id);
      close();
    });
    list.appendChild(el);
  }

  panel.appendChild(list);
  document.body.appendChild(panel);
  position(panel, btn);

  requestAnimationFrame(() =>
    requestAnimationFrame(() => panel.classList.add('dots-menu__panel--open')),
  );

  const onOutside = (e: MouseEvent) => {
    if (panel.contains(e.target as Node) || btn.contains(e.target as Node)) return;
    close();
  };
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const onScrollResize = () => {
    if (!document.body.contains(panel)) return;
    if (!isTriggerVisible(btn)) {
      close();
      return;
    }
    position(panel, btn);
  };

  document.addEventListener('click', onOutside);
  document.addEventListener('keydown', onEsc);
  window.addEventListener('scroll', onScrollResize, true);
  window.addEventListener('resize', onScrollResize);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    if (activeClose === close) activeClose = null;
    panel.classList.remove('dots-menu__panel--open');
    panel.classList.add('dots-menu__panel--closing');
    document.removeEventListener('click', onOutside);
    document.removeEventListener('keydown', onEsc);
    window.removeEventListener('scroll', onScrollResize, true);
    window.removeEventListener('resize', onScrollResize);
    const done = () => {
      panel.removeEventListener('transitionend', done);
      panel.remove();
      onClosed();
    };
    panel.addEventListener('transitionend', done);
    // Fallback: если transitionend не сработал (элемент уже невидим)
    setTimeout(done, 250);
  }

  activeClose = close;
  return close;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ———— Публичный рендер ———— */

export function renderDotsMenu(opts: DotsMenuOptions): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'dots-menu';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dots-menu__trigger';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = iconMoreHorizontal(opts.iconSize ?? 20);

  let isOpen = false;
  let closePanel: (() => void) | null = null;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen) {
      closePanel?.();
      return;
    }
    // Закрыть любое другое открытое dots-menu
    closeActiveDotsMenu();
    isOpen = true;
    btn.setAttribute('aria-expanded', 'true');
    closePanel = createPanel(opts.entries, btn, opts.onSelect, () => {
      isOpen = false;
      closePanel = null;
      btn.setAttribute('aria-expanded', 'false');
    });
  });

  wrap.appendChild(btn);
  return wrap;
}
