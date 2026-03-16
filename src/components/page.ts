/**
 * Обёртка страницы с кастомным вертикальным и горизонтальным скроллбаром.
 * Скроллбар появляется у края при приближении курсора, его можно тянуть.
 * id="content" на области скролла — сюда роутер вставляет контент.
 */
const SCROLLBAR_PROXIMITY = 40;
const THUMB_MIN = 24;

export function renderPage(): HTMLElement {
  const page = document.createElement('div');
  page.className = 'page page--padded';

  const scrollEl = document.createElement('div');
  scrollEl.id = 'content';
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
      return;
    }
    vVisible = true;
    vThumb.style.display = 'block';
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
      return;
    }
    hVisible = true;
    hThumb.style.display = 'block';
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

  // Drag vertical thumb
  vThumb.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDraggingV = true;
    setScrollbarsVisible(true);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    vThumb.classList.add('page__v-thumb--active');
    const startY = e.clientY;
    const startScrollTop = scrollEl.scrollTop;
    const trackHeight = vTrack.clientHeight;
    const { scrollHeight, clientHeight } = scrollEl;
    const maxScroll = scrollHeight - clientHeight;

    function onMove(ev: MouseEvent) {
      const dy = ev.clientY - startY;
      const ratio = maxScroll / (trackHeight - vThumb.offsetHeight);
      scrollEl.scrollTop = Math.max(0, Math.min(maxScroll, startScrollTop + dy * (ratio || 1)));
    }
    function onUp() {
      isDraggingV = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      addReleaseAnimation(vThumb, 'page__v-thumb--active', 'page__v-thumb--release');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Drag horizontal thumb
  hThumb.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDraggingH = true;
    setScrollbarsVisible(true);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    hThumb.classList.add('page__h-thumb--active');
    const startX = e.clientX;
    const startScrollLeft = scrollEl.scrollLeft;
    const trackWidth = hTrack.clientWidth;
    const { scrollWidth, clientWidth } = scrollEl;
    const maxScroll = scrollWidth - clientWidth;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const ratio = maxScroll / (trackWidth - hThumb.offsetWidth);
      scrollEl.scrollLeft = Math.max(0, Math.min(maxScroll, startScrollLeft + dx * (ratio || 1)));
    }
    function onUp() {
      isDraggingH = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      addReleaseAnimation(hThumb, 'page__h-thumb--active', 'page__h-thumb--release');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  requestAnimationFrame(updateScrollbars);
  return page;
}
