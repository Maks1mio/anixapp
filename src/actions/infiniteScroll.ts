interface InfiniteScrollParams {
  onLoad: () => void;
  enabled?: () => boolean;
  root?: HTMLElement | null;
  rootMargin?: string;
}

export function infiniteScroll(node: HTMLElement, params: InfiniteScrollParams) {
  let current = params;
  let observer: IntersectionObserver | null = null;
  let isIntersecting = false;
  // Хранит последний ВЫЧИСЛЕННЫЙ результат enabled(), чтобы отловить переход false→true
  let lastEnabled = false;

  function evalEnabled(): boolean {
    return current.enabled ? current.enabled() : true;
  }

  function tryLoad() {
    if (!isIntersecting) return;
    if (!evalEnabled()) return;
    current.onLoad();
  }

  function setup() {
    observer?.disconnect();
    isIntersecting = false;
    lastEnabled = evalEnabled();

    observer = new IntersectionObserver(
      (entries) => {
        isIntersecting = entries[0]?.isIntersecting ?? false;
        if (isIntersecting) tryLoad();
      },
      {
        root: current.root ?? null,
        rootMargin: current.rootMargin ?? '120px',
      },
    );

    observer.observe(node);
  }

  setup();

  return {
    update(next: InfiniteScrollParams) {
      const rootChanged = next.root !== current.root;
      const marginChanged = next.rootMargin !== current.rootMargin;
      current = next;

      if (rootChanged || marginChanged) {
        setup();
        return;
      }

      const newEnabled = evalEnabled();

      // Если только что стало доступно И сентинел ещё виден — грузим следующую страницу.
      // lastEnabled — сохранённое значение предыдущего вызова, а не вычисленное из реактивного
      // состояния здесь и сейчас, поэтому переход false→true обнаруживается корректно.
      if (!lastEnabled && newEnabled) {
        tryLoad();
      }

      lastEnabled = newEnabled;
    },
    destroy() {
      observer?.disconnect();
      observer = null;
    },
  };
}
