import { TV_LONGPRESS_ATTR, TV_LONGPRESS_EVENT } from '../services/tv-navigation';

/**
 * TV: удержание OK на элементе вызывает `handler` вместо обычного клика.
 * Короткое нажатие по-прежнему кликает (см. onActivateKeydown в tv-navigation).
 * `null` — выключить удержание для элемента.
 */
export function tvLongPress(node: HTMLElement, handler: (() => void) | null) {
  let current = handler;

  const sync = () => {
    if (current) node.setAttribute(TV_LONGPRESS_ATTR, '');
    else node.removeAttribute(TV_LONGPRESS_ATTR);
  };
  const onLongPress = () => current?.();

  sync();
  node.addEventListener(TV_LONGPRESS_EVENT, onLongPress);

  return {
    update(next: (() => void) | null) {
      current = next;
      sync();
    },
    destroy() {
      node.removeEventListener(TV_LONGPRESS_EVENT, onLongPress);
      node.removeAttribute(TV_LONGPRESS_ATTR);
    },
  };
}
