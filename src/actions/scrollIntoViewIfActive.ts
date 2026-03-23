/**
 * Svelte action: scroll element into view when it becomes active (e.g. keyboard selection).
 * Useful for list items navigated with arrow keys.
 */
export function scrollIntoViewIfActive(
  node: HTMLElement,
  active: boolean
): { update?(active: boolean): void } {
  if (active) {
    queueMicrotask(() => {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
  return {
    update(next: boolean) {
      if (next) {
        queueMicrotask(() => {
          node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      }
    },
  };
}
