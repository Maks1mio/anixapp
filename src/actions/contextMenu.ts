import {
  openFloatingMenu,
  type DotsMenuEntry,
} from '../components/dots-menu';

export interface ContextMenuParams {
  entries: DotsMenuEntry[] | ((event: MouseEvent) => DotsMenuEntry[]);
  onSelect: (id: string, event: MouseEvent) => void;
}

/** Svelte action: контекстное меню по ПКМ. */
export function contextMenu(node: HTMLElement, params: ContextMenuParams) {
  const handler = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const entries = typeof params.entries === 'function' ? params.entries(e) : params.entries;
    if (!entries.length) return;
    openFloatingMenu({
      entries,
      x: e.clientX,
      y: e.clientY,
      onSelect: (id) => params.onSelect(id, e),
    });
  };

  node.addEventListener('contextmenu', handler);
  return {
    update(next: ContextMenuParams) {
      params = next;
    },
    destroy() {
      node.removeEventListener('contextmenu', handler);
    },
  };
}
