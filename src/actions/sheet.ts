/** Общее поведение шторок (.uiv2-menu-sheet): высота по текущему уровню и закрытие потягиванием вниз. */

const DRAG_CLOSE_PX = 90;

/** Отмечает на target, есть ли содержимое выше и ниже видимой части viewport. */
function markEdges(viewport: HTMLElement, target: HTMLElement) {
  target.toggleAttribute('data-more-above', viewport.scrollTop > 0);
  target.toggleAttribute('data-more-below', viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1);
}

/** Для обычного прокручиваемого списка: те же отметки на нём самом (стили решают, что показать у края). */
export function scrollEdges(node: HTMLElement) {
  const update = () => markEdges(node, node);
  update();
  const ro = new ResizeObserver(update);
  ro.observe(node);
  for (const child of node.children) ro.observe(child);
  node.addEventListener('scroll', update, { passive: true });
  return {
    destroy() {
      ro.disconnect();
      node.removeEventListener('scroll', update);
    },
  };
}

/**
 * На viewport уровня: сообщает высоту содержимого, показывает выбранный пункт и отмечает на теле шторки,
 * есть ли что-то выше и ниже видимой части (там появляются разделители). Первый ребёнок node — содержимое.
 */
export function sheetPage(node: HTMLElement, onHeight: (height: number) => void) {
  const inner = node.firstElementChild as HTMLElement;
  const body = node.closest<HTMLElement>('.uiv2-menu-sheet__body');
  const updateEdges = () => {
    if (body) markEdges(node, body);
  };
  const measure = () => {
    onHeight(inner.offsetHeight);
    updateEdges();
  };
  measure();
  const ro = new ResizeObserver(measure);
  ro.observe(inner);
  // Сам viewport меняется вместе с высотой шторки: только края, иначе уходящий уровень вернул бы свою высоту
  const edges = new ResizeObserver(updateEdges);
  edges.observe(node);
  node.addEventListener('scroll', updateEdges, { passive: true });
  const frame = requestAnimationFrame(() => {
    const checked = node.querySelector<HTMLElement>('.uiv2-popup-menu__item--checked');
    if (checked) {
      node.scrollTop += checked.getBoundingClientRect().top - node.getBoundingClientRect().top - node.clientHeight / 2;
    }
  });
  return {
    destroy() {
      ro.disconnect();
      edges.disconnect();
      cancelAnimationFrame(frame);
      node.removeEventListener('scroll', updateEdges);
    },
  };
}

interface SheetDragParams {
  panel: () => HTMLElement | null;
  onClose: () => void;
}

/** Вешается на шапку шторки: панель идёт за пальцем, далеко вниз — закрытие, иначе возврат. */
export function sheetDrag(node: HTMLElement, params: SheetDragParams) {
  let current = params;
  let start: number | null = null;

  function onDown(e: PointerEvent) {
    if ((e.target as Element).closest('button, input')) return;
    const panel = current.panel();
    if (!panel) return;
    start = e.clientY;
    node.setPointerCapture(e.pointerId);
    panel.style.transition = 'none';
  }

  function onMove(e: PointerEvent) {
    const panel = current.panel();
    if (start == null || !panel) return;
    panel.style.transform = `translateY(${Math.max(0, e.clientY - start)}px)`;
  }

  function onUp(e: PointerEvent) {
    const panel = current.panel();
    if (start == null || !panel) return;
    const distance = e.clientY - start;
    start = null;
    panel.style.transition = 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)';
    if (distance > DRAG_CLOSE_PX) current.onClose();
    else panel.style.transform = '';
  }

  node.addEventListener('pointerdown', onDown);
  node.addEventListener('pointermove', onMove);
  node.addEventListener('pointerup', onUp);
  node.addEventListener('pointercancel', onUp);
  return {
    update(next: SheetDragParams) {
      current = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
    },
  };
}
