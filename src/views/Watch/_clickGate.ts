/** Как на YouTube: один клик — пауза, два — полный экран, без двойного play/pause. */
const DEFAULT_DELAY_MS = 260;

export type ClickOrDblclickHandlers = {
  onSingle: () => void;
  onDouble: () => void;
  delayMs?: number;
};

export function createClickOrDblclick(handlers: ClickOrDblclickHandlers) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current = handlers;

  function dispose() {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
  }

  return {
    set(next: ClickOrDblclickHandlers) {
      current = next;
    },
    handle(event?: MouseEvent) {
      if (event && event.button !== 0) return;
      if (timer != null) {
        dispose();
        current.onDouble();
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        current.onSingle();
      }, current.delayMs ?? DEFAULT_DELAY_MS);
    },
    dispose,
  };
}
