/**
 * Телефон и планшет: удержание пальца вызывает `handler` вместо обычного нажатия.
 * Сдвиг отменяет удержание, чтобы список можно было прокручивать. `null` — выключить.
 */
const HOLD_MS = 450;
const MOVE_CANCEL_PX = 10;

export function touchLongPress(node: HTMLElement, handler: (() => void) | null) {
  let current = handler;
  let timer = 0;
  let startX = 0;
  let startY = 0;
  let fired = false;

  const cancel = () => window.clearTimeout(timer);

  function onDown(e: PointerEvent) {
    fired = false;
    if (!current || e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    cancel();
    timer = window.setTimeout(() => {
      fired = true;
      navigator.vibrate?.(12);
      current?.();
    }, HOLD_MS);
  }

  function onMove(e: PointerEvent) {
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_CANCEL_PX) cancel();
  }

  // После удержания отпускание пальца не должно считаться нажатием
  function onClick(e: MouseEvent) {
    if (!fired) return;
    fired = false;
    e.preventDefault();
    e.stopPropagation();
  }

  function onContextMenu(e: Event) {
    if (current) e.preventDefault();
  }

  node.addEventListener('pointerdown', onDown);
  node.addEventListener('pointermove', onMove);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('click', onClick, true);
  node.addEventListener('contextmenu', onContextMenu);
  return {
    update(next: (() => void) | null) {
      current = next;
    },
    destroy() {
      cancel();
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', cancel);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('click', onClick, true);
      node.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
