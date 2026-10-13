let locks = 0;

/**
 * Переносит узел в document.body (position: fixed внутри трансформированных предков считается от них)
 * и блокирует прокрутку страницы под открытой шторкой/диалогом.
 */
export function portal(node: HTMLElement): { destroy: () => void } {
  document.body.appendChild(node);
  locks += 1;
  document.documentElement.classList.add('m-scroll-lock');
  return {
    destroy: () => {
      node.remove();
      locks = Math.max(0, locks - 1);
      if (locks === 0) document.documentElement.classList.remove('m-scroll-lock');
    },
  };
}
