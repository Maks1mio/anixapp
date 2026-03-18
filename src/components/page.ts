/**
 * Обёртка страницы с кастомным вертикальным и горизонтальным скроллбаром.
 * Скроллбар появляется у края при приближении курсора, его можно тянуть.
 * id="content" на области скролла — сюда роутер вставляет контент.
 */
const SCROLLBAR_PROXIMITY = 40;
const THUMB_MIN = 24;

export interface PageOptions {
  /** ID for the scroll element. Defaults to 'content' (used by the router). */
  scrollId?: string;
  /** Extra CSS class(es) to add to the root .page element. */
  extraClass?: string;
  /** If true, omits the `page--padded` class. */
  noPadding?: boolean;
}

export function renderPage(opts?: PageOptions): HTMLElement {
  const page = document.createElement('div');
  const classes = ['page'];
  if (!opts?.noPadding) classes.push('page--padded');
  if (opts?.extraClass) classes.push(opts.extraClass);
  page.className = classes.join(' ');

  const scrollEl = document.createElement('div');
  if (opts?.scrollId !== undefined) {
    if (opts.scrollId) scrollEl.id = opts.scrollId;
  } else {
    scrollEl.id = 'content';
  }
  scrollEl.className = 'page__scroll';
  scrollEl.setAttribute('data-page-scroll', '');

  const vTrack = document.createElement('div');
  vTrack.className = 'page__v-track';
  const vThumb = document.createElement('div');
  vThumb.className = 'page__v-thumb';
  vTrack.appendChild(vThumb);

  const hTrack = document.createElement('div');
  hTrack.className = 'page__h-track';
  const hThumb = document.createElement('div');
  hThumb.className = 'page__h-thumb';
  hTrack.appendChild(hThumb);

  page.appendChild(scrollEl);
  page.appendChild(vTrack);
  page.appendChild(hTrack);

  let vVisible = false;
  let hVisible = false;
  let scrollbarsVisible = false;
  let isDraggingV = false;
  let isDraggingH = false;
  let scrollbarHideTimeout: ReturnType<typeof setTimeout> | null = null;
  const SCROLLBAR_SHOW_DURATION = 1200;

  function setScrollbarsVisible(visible: boolean) {
    const shouldShow = visible || isDraggingV || isDraggingH;
    if (shouldShow === scrollbarsVisible) return;
    scrollbarsVisible = shouldShow;
    page.classList.toggle('page--v-scrollbar-visible', scrollbarsVisible && vVisible);
    page.classList.toggle('page--h-scrollbar-visible', scrollbarsVisible && hVisible);
  }

  function scheduleScrollbarHide() {
    if (scrollbarHideTimeout) clearTimeout(scrollbarHideTimeout);
    scrollbarHideTimeout = setTimeout(() => {
      scrollbarHideTimeout = null;
      if (!isDraggingV && !isDraggingH) setScrollbarsVisible(false);
    }, SCROLLBAR_SHOW_DURATION);
  }

  function updateVThumb() {
    const { scrollHeight, clientHeight, scrollTop } = scrollEl;
    const trackHeight = vTrack.clientHeight;
    if (scrollHeight <= clientHeight) {
      vThumb.style.display = 'none';
      vVisible = false;
      // Prevent phantom interactions when there's no overflow.
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
    vThumb.style.setProperty('--thumb-y', `${thumbTop}px`);
    vThumb.style.transform = `translateY(${thumbTop}px)`;
  }

  function updateHThumb() {
    const { scrollWidth, clientWidth, scrollLeft } = scrollEl;
    const trackWidth = hTrack.clientWidth;
    const overflowX = typeof getComputedStyle !== 'undefined' ? getComputedStyle(scrollEl).overflowX : '';
    if (overflowX === 'hidden' || scrollWidth <= clientWidth) {
      hThumb.style.display = 'none';
      hVisible = false;
      // Prevent phantom interactions when there's no overflow.
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
    hThumb.style.setProperty('--thumb-x', `${thumbLeft}px`);
    hThumb.style.transform = `translateX(${thumbLeft}px)`;
  }

  function updateScrollbars() {
    updateVThumb();
    updateHThumb();
    page.classList.toggle('page--has-h-scroll', hVisible);
    setScrollbarsVisible(scrollbarsVisible);
  }

  scrollEl.addEventListener('scroll', updateScrollbars);
  const ro = new ResizeObserver(updateScrollbars);
  ro.observe(scrollEl);
  const mo = new MutationObserver(updateScrollbars);
  mo.observe(scrollEl, { childList: true, subtree: true });

  page.addEventListener('mousemove', (e) => {
    const rect = page.getBoundingClientRect();
    const nearRight = e.clientX >= rect.right - SCROLLBAR_PROXIMITY;
    const nearBottom = e.clientY >= rect.bottom - SCROLLBAR_PROXIMITY;
    const onScrollbar = vTrack.contains(e.target as Node) || hTrack.contains(e.target as Node);
    setScrollbarsVisible(nearRight || nearBottom || onScrollbar);
  });
  page.addEventListener('mouseleave', (e) => {
    const related = e.relatedTarget as Node | null;
    const leavingToScrollbar = related && (vTrack.contains(related) || hTrack.contains(related));
    if (!leavingToScrollbar && !isDraggingV && !isDraggingH) setScrollbarsVisible(false);
  });

  // Показывать скроллбар при прокрутке страницы колёсиком
  scrollEl.addEventListener('wheel', () => {
    setScrollbarsVisible(true);
    scheduleScrollbarHide();
  }, { passive: true });

  // Колёсико над треком — прокручивать страницу
  vTrack.addEventListener('wheel', (e) => {
    scrollEl.scrollTop += e.deltaY;
    e.preventDefault();
    setScrollbarsVisible(true);
    scheduleScrollbarHide();
  }, { passive: false });
  hTrack.addEventListener('wheel', (e) => {
    scrollEl.scrollLeft += e.deltaX;
    e.preventDefault();
    setScrollbarsVisible(true);
    scheduleScrollbarHide();
  }, { passive: false });

  function addReleaseAnimation(thumb: HTMLElement, activeClass: string, releaseClass: string) {
    thumb.classList.add(releaseClass);
    const onEnd = () => {
      thumb.removeEventListener('animationend', onEnd);
      thumb.classList.remove(releaseClass, activeClass);
    };
    thumb.addEventListener('animationend', onEnd);
  }

  // Drag state helpers (fix "phantom drag" when pointerup is missed)
  let dragPointerId: number | null = null;
  let dragRaf = 0;
  let dragAxis: 'v' | 'h' | null = null;
  let dragGrabOffsetRatio = 0;
  let dragThumbEl: HTMLElement | null = null;

  function applyDraggingStyles(on: boolean) {
    document.body.style.cursor = on ? 'grabbing' : '';
    document.body.style.userSelect = on ? 'none' : '';
  }

  function cancelDrag() {
    if (!dragAxis) return;
    isDraggingV = false;
    isDraggingH = false;
    applyDraggingStyles(false);
    if (dragAxis === 'v') addReleaseAnimation(vThumb, 'page__v-thumb--active', 'page__v-thumb--release');
    if (dragAxis === 'h') addReleaseAnimation(hThumb, 'page__h-thumb--active', 'page__h-thumb--release');
    try {
      if (dragThumbEl && dragPointerId != null) dragThumbEl.releasePointerCapture?.(dragPointerId);
    } catch (_) {}
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
    if (dragPointerId == null || ev.pointerId !== dragPointerId) return;
    if (dragRaf) return;
    dragRaf = requestAnimationFrame(() => {
      dragRaf = 0;
      if (dragAxis === 'v') {
        updateVThumb();
        const trackRect = vTrack.getBoundingClientRect();
        const trackHeight = vTrack.clientHeight;
        const currentThumbHeight = vThumb.offsetHeight;
        const grabOffsetPx = Math.max(0, Math.min(currentThumbHeight, dragGrabOffsetRatio * currentThumbHeight));
        const maxThumbTop = Math.max(0, trackHeight - currentThumbHeight);
        const yInTrack = ev.clientY - trackRect.top;
        const desiredThumbTop = Math.max(0, Math.min(maxThumbTop, yInTrack - grabOffsetPx));
        const { scrollHeight, clientHeight } = scrollEl;
        const maxScroll = Math.max(0, scrollHeight - clientHeight);
        const denom = maxThumbTop || 1;
        scrollEl.scrollTop = (desiredThumbTop / denom) * maxScroll;
      } else if (dragAxis === 'h') {
        updateHThumb();
        const trackRect = hTrack.getBoundingClientRect();
        const trackWidth = hTrack.clientWidth;
        const currentThumbWidth = hThumb.offsetWidth;
        const grabOffsetPx = Math.max(0, Math.min(currentThumbWidth, dragGrabOffsetRatio * currentThumbWidth));
        const maxThumbLeft = Math.max(0, trackWidth - currentThumbWidth);
        const xInTrack = ev.clientX - trackRect.left;
        const desiredThumbLeft = Math.max(0, Math.min(maxThumbLeft, xInTrack - grabOffsetPx));
        const { scrollWidth, clientWidth } = scrollEl;
        const maxScroll = Math.max(0, scrollWidth - clientWidth);
        const denom = maxThumbLeft || 1;
        scrollEl.scrollLeft = (desiredThumbLeft / denom) * maxScroll;
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

  function startDrag(axis: 'v' | 'h', e: PointerEvent) {
    // Only primary pointer + left button (prevents phantom drags via right click / pen hover / etc.)
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // If there's no actual overflow, do not allow dragging at all.
    if (axis === 'v') {
      if (scrollEl.scrollHeight <= scrollEl.clientHeight) return;
    } else {
      const overflowX = typeof getComputedStyle !== 'undefined' ? getComputedStyle(scrollEl).overflowX : '';
      if (overflowX === 'hidden' || scrollEl.scrollWidth <= scrollEl.clientWidth) return;
    }
    e.preventDefault();
    dragAxis = axis;
    dragPointerId = e.pointerId;
    setScrollbarsVisible(true);
    applyDraggingStyles(true);
    if (axis === 'v') {
      isDraggingV = true;
      vThumb.classList.add('page__v-thumb--active');
      const thumbRect = vThumb.getBoundingClientRect();
      dragGrabOffsetRatio = thumbRect.height > 0 ? (e.clientY - thumbRect.top) / thumbRect.height : 0;
      dragThumbEl = vThumb;
      vThumb.setPointerCapture?.(e.pointerId);
      vThumb.addEventListener('lostpointercapture', onLostPointerCapture, { once: true });
    } else {
      isDraggingH = true;
      hThumb.classList.add('page__h-thumb--active');
      const thumbRect = hThumb.getBoundingClientRect();
      dragGrabOffsetRatio = thumbRect.width > 0 ? (e.clientX - thumbRect.left) / thumbRect.width : 0;
      dragThumbEl = hThumb;
      hThumb.setPointerCapture?.(e.pointerId);
      hThumb.addEventListener('lostpointercapture', onLostPointerCapture, { once: true });
    }
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', cancelDrag);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  // Drag vertical thumb
  vThumb.addEventListener('pointerdown', (e) => startDrag('v', e));
  // Drag horizontal thumb
  hThumb.addEventListener('pointerdown', (e) => startDrag('h', e));

  requestAnimationFrame(updateScrollbars);
  return page;
}
