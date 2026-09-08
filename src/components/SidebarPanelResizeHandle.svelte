<script lang="ts">
  import {
    clampSidebarPanelWidthPx,
    SIDEBAR_PANEL_WIDTH_MIN_PX,
  } from '../prefs';

  interface Props {
    widthPx: number;
    onWidthChange: (widthPx: number) => void;
    onWidthCommit?: (widthPx: number) => void;
    label?: string;
  }

  let {
    widthPx,
    onWidthChange,
    onWidthCommit,
    label = 'Изменить ширину панели',
  }: Props = $props();

  let dragging = $state(false);
  let bouncing = $state(false);
  let offsetY = $state(0);
  let startX = 0;
  let startWidth = 0;
  let bounceTimer: ReturnType<typeof setTimeout> | null = null;

  function maxWidth(): number {
    return clampSidebarPanelWidthPx(Number.POSITIVE_INFINITY);
  }

  function applyWidth(next: number) {
    onWidthChange(clampSidebarPanelWidthPx(next));
  }

  function clearBounceTimer() {
    if (bounceTimer != null) {
      clearTimeout(bounceTimer);
      bounceTimer = null;
    }
  }

  function followPointerY(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    const shell = el.closest('.schedule-panel-shell') as HTMLElement | null;
    const bounds = (shell ?? el.parentElement)?.getBoundingClientRect();
    if (!bounds) return;
    const centerY = bounds.top + bounds.height / 2;
    const half = el.offsetHeight / 2;
    const max = Math.max(0, bounds.height / 2 - half - 12);
    offsetY = Math.max(-max, Math.min(max, e.clientY - centerY));
  }

  function bounceHome() {
    clearBounceTimer();
    bouncing = false;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || offsetY === 0) {
      offsetY = 0;
      bouncing = false;
      return;
    }
    requestAnimationFrame(() => {
      bouncing = true;
      offsetY = 0;
      bounceTimer = setTimeout(() => {
        bouncing = false;
        bounceTimer = null;
      }, 650);
    });
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    clearBounceTimer();
    bouncing = false;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    dragging = true;
    startX = e.clientX;
    startWidth = widthPx;
    followPointerY(e);
    document.body.classList.add('is-sidebar-panel-resizing');
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    // Левый край панели: тянем влево — шире, вправо — уже
    applyWidth(startWidth + (startX - e.clientX));
    followPointerY(e);
  }

  function endDrag(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('is-sidebar-panel-resizing');
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    onWidthCommit?.(clampSidebarPanelWidthPx(widthPx));
    bounceHome();
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = e.shiftKey ? 32 : 16;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = clampSidebarPanelWidthPx(widthPx + step);
      onWidthChange(next);
      onWidthCommit?.(next);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = clampSidebarPanelWidthPx(widthPx - step);
      onWidthChange(next);
      onWidthCommit?.(next);
    } else if (e.key === 'Home') {
      e.preventDefault();
      const next = clampSidebarPanelWidthPx(SIDEBAR_PANEL_WIDTH_MIN_PX);
      onWidthChange(next);
      onWidthCommit?.(next);
    } else if (e.key === 'End') {
      e.preventDefault();
      const next = maxWidth();
      onWidthChange(next);
      onWidthCommit?.(next);
    }
  }
</script>

<div
  class="schedule-panel-resize"
  class:schedule-panel-resize--dragging={dragging}
  class:schedule-panel-resize--bounce={bouncing}
  style={`--resize-y: ${offsetY}px`}
  role="separator"
  aria-orientation="vertical"
  aria-valuenow={Math.round(widthPx)}
  aria-valuemin={SIDEBAR_PANEL_WIDTH_MIN_PX}
  aria-valuemax={maxWidth()}
  aria-label={label}
  tabindex="0"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={endDrag}
  onpointercancel={endDrag}
  onkeydown={onKeyDown}
>
  <span class="schedule-panel-resize__pill" aria-hidden="true">
    <span class="schedule-panel-resize__bar"></span>
    <span class="schedule-panel-resize__bar"></span>
  </span>
</div>
