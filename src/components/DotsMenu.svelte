<script lang="ts">
  import { iconMoreHorizontal } from './icons';

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

  interface Props {
    entries: DotsMenuEntry[];
    onSelect: (id: string) => void;
    iconSize?: number;
  }

  let { entries, onSelect, iconSize = 20 }: Props = $props();

  const GAP = 8;
  const EDGE = 8;

  let activeClose: (() => void) | null = null;
  let isOpen = $state(false);
  let closePanel: (() => void) | null = null;
  let btnEl: HTMLButtonElement;

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
      x = br.left;
    } else {
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

  function isTriggerVisible(btn: HTMLElement): boolean {
    const r = btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  }

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function createPanel(
    btn: HTMLElement,
    onSelectFn: (id: string) => void,
    onClosed: () => void
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
        onSelectFn(item.id);
        close();
      });
      list.appendChild(el);
    }

    panel.appendChild(list);
    document.body.appendChild(panel);
    position(panel, btn);

    requestAnimationFrame(() =>
      requestAnimationFrame(() => panel.classList.add('dots-menu__panel--open'))
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
      setTimeout(done, 250);
    }

    activeClose = close;
    return close;
  }

  function handleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen) {
      closePanel?.();
      return;
    }
    activeClose?.();
    isOpen = true;
    closePanel = createPanel(btnEl, onSelect, () => {
      isOpen = false;
      closePanel = null;
    });
  }
</script>

<div class="dots-menu">
  <button
    bind:this={btnEl}
    type="button"
    class="dots-menu__trigger"
    aria-haspopup="true"
    aria-expanded={isOpen ? 'true' : 'false'}
    onclick={handleClick}
  >
    {@html iconMoreHorizontal(iconSize)}
  </button>
</div>
