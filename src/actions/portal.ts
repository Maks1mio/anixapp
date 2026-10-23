let locks = 0;

type PortalOptions = { lock?: boolean };

/**
 * Переносит узел в document.body (position: fixed внутри трансформированных предков считается от них)
 * и блокирует прокрутку страницы под открытой шторкой/диалогом.
 * Немодальным слоям (подсказки, промо-карточки) — `{ lock: false }`: они живут долго и не должны глушить скролл.
 */
export function portal(node: HTMLElement, options?: PortalOptions | string): { destroy: () => void } {
  document.body.appendChild(node);
  const lock = typeof options === 'object' ? options.lock !== false : true;
  if (lock) {
    locks += 1;
    document.documentElement.classList.add('m-scroll-lock');
  }
  return {
    destroy: () => {
      node.remove();
      if (!lock) return;
      locks = Math.max(0, locks - 1);
      if (locks === 0) document.documentElement.classList.remove('m-scroll-lock');
    },
  };
}
