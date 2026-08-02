/** Переносит ноду в document.body — нужно для fixed-оверлеев внутри transform/overflow. */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
}
