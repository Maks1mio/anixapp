/**
 * UI Kit V2 — кастомный скролл (вертикальный / горизонтальный).
 *
 * Ожидает внутри root:
 *   - viewport: `.uiv2-scroll-area__viewport` или `[data-uiv2-scroll]`
 *   - v-track / v-thumb, h-track / h-thumb (опционально по axis)
 */

export type Uiv2ScrollAxis = 'y' | 'x' | 'both';

export type Uiv2CustomScrollOptions = {
  axis?: Uiv2ScrollAxis;
  viewportSelector?: string;
};

const DEFAULT_VIEWPORT = '.uiv2-scroll-area__viewport, [data-uiv2-scroll]';
const SCROLLBAR_PROXIMITY = 36;
const THUMB_MIN = 20;
const SCROLLBAR_SHOW_DURATION = 1200;

function resolveViewport(root: HTMLElement, selector: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(selector);
}

export function uiv2CustomScroll(
  root: HTMLElement,
  options: Uiv2CustomScrollOptions = {},
): { destroy(): void; update(next: Uiv2CustomScrollOptions): void } {
  let axis: Uiv2ScrollAxis = options.axis ?? 'y';
  let viewportSelector = options.viewportSelector ?? DEFAULT_VIEWPORT;

  const vTrack = root.querySelector<HTMLElement>('.uiv2-scroll-area__v-track');
  const vThumb = root.querySelector<HTMLElement>('.uiv2-scroll-area__v-thumb');
  const hTrack = root.querySelector<HTMLElement>('.uiv2-scroll-area__h-track');
  const hThumb = root.querySelector<HTMLElement>('.uiv2-scroll-area__h-thumb');

  let scrollEl: HTMLElement | null = null;
  let vVisible = false;
  let hVisible = false;
  let scrollbarsVisible = false;
  let isDraggingV = false;
  let isDraggingH = false;
  let scrollbarHideTimeout: ReturnType<typeof setTimeout> | null = null;
  let ro: ResizeObserver | null = null;
  let mo: MutationObserver | null = null;

  let dragPointerId: number | null = null;
  let dragRaf = 0;
  let dragAxis: 'v' | 'h' | null = null;
  let dragGrabOffsetRatio = 0;
  let dragThumbEl: HTMLElement | null = null;

  function axisAllowsV() {
    return axis === 'y' || axis === 'both';
  }

  function axisAllowsH() {
    return axis === 'x' || axis === 'both';
  }

  function applyAxisClasses() {
    root.classList.toggle('uiv2-scroll-area--y', axisAllowsV());
    root.classList.toggle('uiv2-scroll-area--x', axisAllowsH());
  }

  function bindViewport() {
    scrollEl = resolveViewport(root, viewportSelector);
    if (!scrollEl) return false;
    scrollEl.setAttribute('data-uiv2-scroll', '');
    scrollEl.setAttribute('data-page-scroll', '');
    return true;
  }

  function setScrollbarsVisible(visible: boolean) {
    const shouldShow = visible || isDraggingV || isDraggingH;
    if (shouldShow === scrollbarsVisible) return;
    scrollbarsVisible = shouldShow;
    root.classList.toggle('uiv2-scroll-area--v-visible', scrollbarsVisible && vVisible);
    root.classList.toggle('uiv2-scroll-area--h-visible', scrollbarsVisible && hVisible);
  }

  function scheduleScrollbarHide() {
    if (scrollbarHideTimeout) clearTimeout(scrollbarHideTimeout);
    scrollbarHideTimeout = setTimeout(() => {
      scrollbarHideTimeout = null;
      if (!isDraggingV && !isDraggingH) setScrollbarsVisible(false);
    }, SCROLLBAR_SHOW_DURATION);
  }

  function updateVThumb() {
    if (!scrollEl || !vTrack || !vThumb || !axisAllowsV()) {
      if (vThumb) vThumb.style.display = 'none';
      vVisible = false;
      if (vTrack) vTrack.style.pointerEvents = 'none';
      return;
    }

    const { scrollHeight, clientHeight, scrollTop } = scrollEl;
    const trackHeight = vTrack.clientHeight;
    if (scrollHeight <= clientHeight + 1) {
      vThumb.style.display = 'none';
      vVisible = false;
      vTrack.style.pointerEvents = 'none';
      return;
    }

    vVisible = true;
    vThumb.style.display = 'block';
    vTrack.style.pointerEvents = 'auto';
    const ratio = clientHeight / scrollHeight;
    const thumbHeight = Math.max(THUMB_MIN, Math.round(trackHeight * ratio));
    const maxTop = trackHeight - thumbHeight;
    const thumbTop = maxTop > 0 ? (scrollTop / (scrollHeight - clientHeight)) * maxTop : 0;
    vThumb.style.height = `${thumbHeight}px`;
    vThumb.style.transform = `translateY(${thumbTop}px)`;
  }

  function updateHThumb() {
    if (!scrollEl || !hTrack || !hThumb || !axisAllowsH()) {
      if (hThumb) hThumb.style.display = 'none';
      hVisible = false;
      if (hTrack) hTrack.style.pointerEvents = 'none';
      return;
    }

    const { scrollWidth, clientWidth, scrollLeft } = scrollEl;
    const trackWidth = hTrack.clientWidth;
    const overflowX = getComputedStyle(scrollEl).overflowX;
    if (overflowX === 'hidden' || overflowX === 'clip' || scrollWidth <= clientWidth + 1) {
      hThumb.style.display = 'none';
      hVisible = false;
      hTrack.style.pointerEvents = 'none';
      return;
    }

    hVisible = true;
    hThumb.style.display = 'block';
    hTrack.style.pointerEvents = 'auto';
    const ratio = clientWidth / scrollWidth;
    const thumbWidth = Math.max(THUMB_MIN, Math.round(trackWidth * ratio));
    const maxLeft = trackWidth - thumbWidth;
    const thumbLeft = maxLeft > 0 ? (scrollLeft / (scrollWidth - clientWidth)) * maxLeft : 0;
    hThumb.style.width = `${thumbWidth}px`;
    hThumb.style.transform = `translateX(${thumbLeft}px)`;
  }

  function updateScrollbars() {
    updateVThumb();
    updateHThumb();
    root.classList.toggle('uiv2-scroll-area--has-h-scroll', hVisible);
    setScrollbarsVisible(scrollbarsVisible);
  }

  function applyDraggingStyles(on: boolean) {
    root.classList.toggle('uiv2-scroll-area--dragging', on);
    document.body.classList.toggle('uiv2-scroll-dragging', on);
    document.body.style.userSelect = on ? 'none' : '';
  }

  function computeTargetScroll(axisDir: 'v' | 'h', clientPos: number): number {
    if (!scrollEl) return 0;
    if (axisDir === 'v') {
      if (!vTrack || !vThumb) return scrollEl.scrollTop;
      const trackRect = vTrack.getBoundingClientRect();
      const trackHeight = vTrack.clientHeight;
      const thumbHeight = vThumb.offsetHeight;
      const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
      const yInTrack = clientPos - trackRect.top;
      const desiredThumbTop = Math.max(0, Math.min(maxThumbTop, yInTrack - thumbHeight / 2));
      const { scrollHeight, clientHeight } = scrollEl;
      const maxScroll = Math.max(0, scrollHeight - clientHeight);
      return maxThumbTop > 0 ? (desiredThumbTop / maxThumbTop) * maxScroll : 0;
    }
    if (!hTrack || !hThumb) return scrollEl.scrollLeft;
    const trackRect = hTrack.getBoundingClientRect();
    const trackWidth = hTrack.clientWidth;
    const thumbWidth = hThumb.offsetWidth;
    const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
    const xInTrack = clientPos - trackRect.left;
    const desiredThumbLeft = Math.max(0, Math.min(maxThumbLeft, xInTrack - thumbWidth / 2));
    const { scrollWidth, clientWidth } = scrollEl;
    const maxScroll = Math.max(0, scrollWidth - clientWidth);
    return maxThumbLeft > 0 ? (desiredThumbLeft / maxThumbLeft) * maxScroll : 0;
  }

  function addReleaseAnimation(thumb: HTMLElement, activeClass: string, releaseClass: string) {
    thumb.classList.add(releaseClass);
    const onEnd = () => {
      thumb.removeEventListener('animationend', onEnd);
      thumb.classList.remove(releaseClass, activeClass);
    };
    thumb.addEventListener('animationend', onEnd);
  }

  function cancelDrag() {
    if (!dragAxis) return;
    isDraggingV = false;
    isDraggingH = false;
    applyDraggingStyles(false);
    if (dragAxis === 'v' && vThumb) {
      addReleaseAnimation(vThumb, 'uiv2-scroll-area__v-thumb--active', 'uiv2-scroll-area__v-thumb--release');
    }
    if (dragAxis === 'h' && hThumb) {
      addReleaseAnimation(hThumb, 'uiv2-scroll-area__h-thumb--active', 'uiv2-scroll-area__h-thumb--release');
    }
    try {
      if (dragThumbEl && dragPointerId != null) dragThumbEl.releasePointerCapture?.(dragPointerId);
    } catch {
      /* noop */
    }
    dragAxis = null;
    dragPointerId = null;
    dragThumbEl = null;
    if (dragRaf) cancelAnimationFrame(dragRaf);
    dragRaf = 0;
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('pointercancel', onPointerUp, true);
    document.removeEventListener('contextmenu', onContextMenu, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', cancelDrag);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') cancelDrag();
  }

  function onPointerMove(ev: PointerEvent) {
    if (!scrollEl || dragPointerId == null || ev.pointerId !== dragPointerId) return;
    if (dragRaf) return;
    dragRaf = requestAnimationFrame(() => {
      dragRaf = 0;
      if (dragAxis === 'v' && vTrack && vThumb) {
        updateVThumb();
        const trackRect = vTrack.getBoundingClientRect();
        const trackHeight = vTrack.clientHeight;
        const currentThumbHeight = vThumb.offsetHeight;
        const grabOffsetPx = Math.max(0, Math.min(currentThumbHeight, dragGrabOffsetRatio * currentThumbHeight));
        const maxThumbTop = Math.max(0, trackHeight - currentThumbHeight);
        const yInTrack = ev.clientY - trackRect.top;
        const desiredThumbTop = Math.max(0, Math.min(maxThumbTop, yInTrack - grabOffsetPx));
        const { scrollHeight, clientHeight } = scrollEl!;
        const maxScroll = Math.max(0, scrollHeight - clientHeight);
        const denom = maxThumbTop || 1;
        scrollEl!.scrollTop = (desiredThumbTop / denom) * maxScroll;
      } else if (dragAxis === 'h' && hTrack && hThumb) {
        updateHThumb();
        const trackRect = hTrack.getBoundingClientRect();
        const trackWidth = hTrack.clientWidth;
        const currentThumbWidth = hThumb.offsetWidth;
        const grabOffsetPx = Math.max(0, Math.min(currentThumbWidth, dragGrabOffsetRatio * currentThumbWidth));
        const maxThumbLeft = Math.max(0, trackWidth - currentThumbWidth);
        const xInTrack = ev.clientX - trackRect.left;
        const desiredThumbLeft = Math.max(0, Math.min(maxThumbLeft, xInTrack - grabOffsetPx));
        const { scrollWidth, clientWidth } = scrollEl!;
        const maxScroll = Math.max(0, scrollWidth - clientWidth);
        const denom = maxThumbLeft || 1;
        scrollEl!.scrollLeft = (desiredThumbLeft / denom) * maxScroll;
      }
    });
  }

  function onPointerUp(ev: PointerEvent) {
    if (dragPointerId == null || ev.pointerId !== dragPointerId) return;
    cancelDrag();
  }

  function onContextMenu() {
    cancelDrag();
  }

  function onKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Escape') cancelDrag();
  }

  function onLostPointerCapture(ev: PointerEvent) {
    if (dragPointerId == null || ev.pointerId !== dragPointerId) return;
    cancelDrag();
  }

  function onVTrackPointerDown(e: PointerEvent) {
    if (!vThumb || !vTrack || vThumb.contains(e.target as Node)) return;
    if (!scrollEl || !e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (scrollEl.scrollHeight <= scrollEl.clientHeight) return;
    e.preventDefault();
    e.stopPropagation();
    const targetScroll = computeTargetScroll('v', e.clientY);
    startDrag('v', e, { grabOffsetRatio: 0.5, captureEl: vTrack, animateTo: targetScroll });
  }

  function onHTrackPointerDown(e: PointerEvent) {
    if (!hThumb || !hTrack || hThumb.contains(e.target as Node)) return;
    if (!scrollEl || !e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const overflowX = getComputedStyle(scrollEl).overflowX;
    if (overflowX === 'hidden' || overflowX === 'clip' || scrollEl.scrollWidth <= scrollEl.clientWidth) return;
    e.preventDefault();
    e.stopPropagation();
    const targetScroll = computeTargetScroll('h', e.clientX);
    startDrag('h', e, { grabOffsetRatio: 0.5, captureEl: hTrack, animateTo: targetScroll });
  }

  function onVThumbPointerDown(e: PointerEvent) {
    startDrag('v', e);
  }

  function onHThumbPointerDown(e: PointerEvent) {
    startDrag('h', e);
  }

  type StartDragOptions = {
    grabOffsetRatio?: number;
    captureEl?: HTMLElement;
    animateTo?: number;
  };

  function startDrag(axisDir: 'v' | 'h', e: PointerEvent, opts: StartDragOptions = {}) {
    if (!scrollEl || !e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    if (axisDir === 'v') {
      if (!vThumb || scrollEl.scrollHeight <= scrollEl.clientHeight) return;
    } else if (!hThumb) {
      return;
    } else {
      const overflowX = getComputedStyle(scrollEl).overflowX;
      if (overflowX === 'hidden' || overflowX === 'clip' || scrollEl.scrollWidth <= scrollEl.clientWidth) return;
    }

    e.preventDefault();
    e.stopPropagation();
    dragAxis = axisDir;
    dragPointerId = e.pointerId;
    setScrollbarsVisible(true);
    applyDraggingStyles(true);

    const thumb = axisDir === 'v' ? vThumb! : hThumb!;
    thumb.classList.add(axisDir === 'v' ? 'uiv2-scroll-area__v-thumb--active' : 'uiv2-scroll-area__h-thumb--active');
    if (opts.grabOffsetRatio != null) {
      dragGrabOffsetRatio = opts.grabOffsetRatio;
    } else {
      const thumbRect = thumb.getBoundingClientRect();
      if (axisDir === 'v') {
        dragGrabOffsetRatio = thumbRect.height > 0 ? (e.clientY - thumbRect.top) / thumbRect.height : 0;
      } else {
        dragGrabOffsetRatio = thumbRect.width > 0 ? (e.clientX - thumbRect.left) / thumbRect.width : 0;
      }
    }
    if (axisDir === 'v') {
      isDraggingV = true;
    } else {
      isDraggingH = true;
    }
    const captureEl = opts.captureEl ?? thumb;
    dragThumbEl = captureEl;
    captureEl.setPointerCapture?.(e.pointerId);
    captureEl.addEventListener('lostpointercapture', onLostPointerCapture, { once: true });

    if (opts.animateTo != null) {
      // Клик по треку — мгновенно; плавность только у стрелок карусели.
      const prop = axisDir === 'v' ? 'scrollTop' : 'scrollLeft';
      scrollEl[prop] = opts.animateTo;
      updateScrollbars();
    }

    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', cancelDrag);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  function onMouseMove(e: MouseEvent) {
    const rect = root.getBoundingClientRect();
    const nearRight = e.clientX >= rect.right - SCROLLBAR_PROXIMITY;
    const nearBottom = e.clientY >= rect.bottom - SCROLLBAR_PROXIMITY;
    const onScrollbar =
      !!(vTrack?.contains(e.target as Node)) ||
      !!(hTrack?.contains(e.target as Node));
    setScrollbarsVisible(nearRight || nearBottom || onScrollbar);
  }

  function onMouseLeave(e: MouseEvent) {
    const related = e.relatedTarget as Node | null;
    const leavingToScrollbar =
      related &&
      ((vTrack?.contains(related) ?? false) || (hTrack?.contains(related) ?? false));
    if (!leavingToScrollbar && !isDraggingV && !isDraggingH) setScrollbarsVisible(false);
  }

  function onWheel() {
    setScrollbarsVisible(true);
    scheduleScrollbarHide();
  }

  function onVTrackWheel(e: WheelEvent) {
    if (!scrollEl) return;
    scrollEl.scrollTop += e.deltaY;
    e.preventDefault();
    setScrollbarsVisible(true);
    scheduleScrollbarHide();
  }

  function onHTrackWheel(e: WheelEvent) {
    if (!scrollEl) return;
    scrollEl.scrollLeft += e.deltaX || e.deltaY;
    e.preventDefault();
    setScrollbarsVisible(true);
    scheduleScrollbarHide();
  }

  function attachListeners() {
    if (!scrollEl) return;

    scrollEl.addEventListener('scroll', updateScrollbars);
    scrollEl.addEventListener('wheel', onWheel, { passive: true });
    vTrack?.addEventListener('wheel', onVTrackWheel, { passive: false });
    hTrack?.addEventListener('wheel', onHTrackWheel, { passive: false });
    root.addEventListener('mousemove', onMouseMove);
    root.addEventListener('mouseleave', onMouseLeave);
    vThumb?.addEventListener('pointerdown', onVThumbPointerDown);
    hThumb?.addEventListener('pointerdown', onHThumbPointerDown);
    vTrack?.addEventListener('pointerdown', onVTrackPointerDown);
    hTrack?.addEventListener('pointerdown', onHTrackPointerDown);

    ro = new ResizeObserver(updateScrollbars);
    ro.observe(scrollEl);
    if (scrollEl.parentElement) ro.observe(scrollEl.parentElement);

    mo = new MutationObserver(updateScrollbars);
    mo.observe(scrollEl, { childList: true, subtree: true });

    requestAnimationFrame(updateScrollbars);
  }

  function detachListeners() {
    cancelDrag();
    if (scrollbarHideTimeout) clearTimeout(scrollbarHideTimeout);

    if (scrollEl) {
      scrollEl.removeEventListener('scroll', updateScrollbars);
      scrollEl.removeEventListener('wheel', onWheel);
    }
    vTrack?.removeEventListener('wheel', onVTrackWheel);
    hTrack?.removeEventListener('wheel', onHTrackWheel);
    root.removeEventListener('mousemove', onMouseMove);
    root.removeEventListener('mouseleave', onMouseLeave);
    vThumb?.removeEventListener('pointerdown', onVThumbPointerDown);
    hThumb?.removeEventListener('pointerdown', onHThumbPointerDown);
    vTrack?.removeEventListener('pointerdown', onVTrackPointerDown);
    hTrack?.removeEventListener('pointerdown', onHTrackPointerDown);
    ro?.disconnect();
    mo?.disconnect();
    ro = null;
    mo = null;
    root.classList.remove('uiv2-scroll-area--dragging');
    document.body.classList.remove('uiv2-scroll-dragging');
    document.body.style.userSelect = '';
  }

  function mount(next: Uiv2CustomScrollOptions) {
    axis = next.axis ?? 'y';
    viewportSelector = next.viewportSelector ?? DEFAULT_VIEWPORT;
    applyAxisClasses();
    detachListeners();
    if (!bindViewport()) return;
    attachListeners();
  }

  mount(options);

  return {
    update(next: Uiv2CustomScrollOptions) {
      mount({ axis, viewportSelector, ...next });
    },
    destroy() {
      detachListeners();
      scrollEl = null;
    },
  };
}
