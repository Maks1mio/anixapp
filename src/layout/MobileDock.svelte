<script lang="ts">
  /**
   * Нижняя панель телефона — шторка. Тянется туго; пересилив порог, отрывается от краёв в плавающую панель
   * с плитками остальных разделов. Подъём считается из одного числа --m-dock-p (0 — закрыта, 1 — открыта):
   * пока тянут, его задаёт палец, после отпускания — пружина, продолжающая скорость пальца.
   */
  import { untrack, type Snippet } from 'svelte';
  import { springTo } from '../utils/spring';
  import aquaUrl from '../assets/easter/aqua.png';
  import { navReorder, type NavReorderParams } from '../actions/navReorder';

  interface Props {
    open?: boolean;
    /** Страницу прокручивают вниз: панель уезжает за край экрана. */
    hidden?: boolean;
    /** В скрытых разделах есть новое: об этом говорит ручка шторки. */
    alert?: boolean;
    /** Сетка плиток повторяет верхний ряд: столько же колонок, сколько в нём разделов. */
    columns: number;
    bar: Snippet;
    more: Snippet;
    reorder: NavReorderParams;
    /** Идёт перестановка разделов: шторка не тянется. */
    locked: boolean;
  }
  let { open = $bindable(false), hidden = false, alert = false, columns, bar, more, reorder, locked }: Props = $props();

  const DRAG_START_PX = 8;
  /** Столько нужно протащить пальцем, чтобы шторка оторвалась. */
  const DETACH_PULL_PX = 72;
  /** Насколько она поднимается за это время: палец проходит много, панель мало — так ощущается усилие. */
  const DETACH_PROGRESS = 0.1;
  /** Взмах быстрее этого (px/мс) решает сам, куда идти, сколько бы ни протащили. */
  const FLICK_SPEED = 0.35;
  const OPEN_FROM_CLOSED_AT = 0.35;
  const STAY_OPEN_ABOVE = 0.6;
  const OVERPULL_RESISTANCE = 0.35;
  const DOCK_AT = 0.1;
  const BARS_SLIDE_MS = 280;
  /** Палец остановился перед отпусканием: скорость больше не считается. */
  const STALE_SPEED_MS = 80;
  const MAX_RELEASE_SPEED = 3;
  /** С этого числа колонок подписи не помещаются без уплотнения. */
  const DENSE_COLUMNS = 5;
  /** В закрытой шторке плиток не видно: увели палец выше панели — значит, тянут её саму. */
  const PULL_BEYOND_PX = 12;

  let moreHeight = $state(0);
  let dragProgress = $state<number | null>(null);
  let pulled = $state(false);
  const dragging = $derived(dragProgress != null);
  let springProgress = $state(0);
  const progress = $derived(dragProgress ?? springProgress);
  /** Прижимается к краям уже на подлёте, а не в момент отпускания. */
  const floating = $derived(dragging ? pulled : progress > DOCK_AT);

  const barsAway = $derived(hidden && !floating && !dragging);
  let sheetEl = $state<HTMLElement | null>(null);
  let slideFromY: number | null = null;
  let barsSlide: Animation | null = null;

  // Уезд при прокрутке запускается явно: от места, где панель видна сейчас, в том числе посреди прошлого движения
  $effect.pre(() => {
    void barsAway;
    untrack(() => {
      if (!sheetEl) return;
      slideFromY = sheetEl.getBoundingClientRect().top;
      barsSlide?.cancel();
    });
  });

  $effect(() => {
    void barsAway;
    untrack(() => {
      if (!sheetEl || slideFromY == null) return;
      const dy = slideFromY - sheetEl.getBoundingClientRect().top;
      slideFromY = null;
      if (dy === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      barsSlide = sheetEl.animate(
        { translate: [`0 ${dy}px`, '0 0'] },
        { duration: BARS_SLIDE_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    });
  });

  let springTarget = 0;
  let stopSpring = () => {};

  function settle(velocity: number) {
    stopSpring();
    springTarget = open ? 1 : 0;
    stopSpring = springTo(springProgress, springTarget, velocity, (value) => { springProgress = value; });
  }

  // Открыли или закрыли не жестом: выбрали раздел, системное «назад»
  $effect(() => {
    if ((open ? 1 : 0) !== springTarget) untrack(() => settle(0));
  });
  $effect(() => () => stopSpring());

  const reorderInDock = $derived<NavReorderParams>({
    ...reorder,
    isPanelPull: (_x, y, area) => !open && y < area.top - PULL_BEYOND_PX,
  });

  function sheetGesture(node: HTMLElement) {
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastTime = 0;
    let speed = 0;
    let detached = false;
    let startedDetached = false;
    /** От какой точки шторка идёт за пальцем: после отрыва или с места, где её поймали. */
    let origin = DETACH_PROGRESS;
    let originUp = DETACH_PULL_PX;
    let swallowClick = false;

    function onDown(e: PointerEvent) {
      swallowClick = false;
      if (e.button !== 0) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      lastY = e.clientY;
      lastTime = e.timeStamp;
      speed = 0;
    }

    function progressAfter(dy: number): number {
      const up = -dy;
      if (!detached && up >= DETACH_PULL_PX) {
        detached = true;
        pulled = true;
        navigator.vibrate?.(10);
      }
      if (!detached) return (Math.max(0, up) / DETACH_PULL_PX) * DETACH_PROGRESS;
      const next = origin + (up - originUp) / moreHeight;
      return next > 1 ? 1 + (next - 1) * OVERPULL_RESISTANCE : Math.max(0, next);
    }

    function onMove(e: PointerEvent) {
      if (e.pointerId !== pointerId || locked || moreHeight <= 0) return;
      const dy = e.clientY - startY;
      if (dragProgress == null) {
        if (Math.abs(dy) < DRAG_START_PX) return;
        if (Math.abs(e.clientX - startX) > Math.abs(dy)) {
          pointerId = null;
          return;
        }
        node.setPointerCapture(e.pointerId);
        stopSpring(); // можно поймать на лету
        startedDetached = springProgress > DETACH_PROGRESS;
        detached = startedDetached;
        origin = startedDetached ? springProgress : DETACH_PROGRESS;
        originUp = startedDetached ? 0 : DETACH_PULL_PX;
        pulled = startedDetached;
      }
      const elapsed = e.timeStamp - lastTime;
      if (elapsed > 0) speed = speed * 0.3 + ((e.clientY - lastY) / elapsed) * 0.7;
      lastY = e.clientY;
      lastTime = e.timeStamp;
      dragProgress = progressAfter(dy);
    }

    function shouldOpen(reached: number): boolean {
      if (!detached) return false;
      if (speed < -FLICK_SPEED) return true;
      if (speed > FLICK_SPEED) return false;
      return reached > (startedDetached ? STAY_OPEN_ABOVE : OPEN_FROM_CLOSED_AT);
    }

    function onUp(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (dragProgress == null) return;
      if (e.timeStamp - lastTime > STALE_SPEED_MS) speed = 0;
      const wasOpen = open;
      open = shouldOpen(dragProgress);
      if (open !== wasOpen) navigator.vibrate?.(8);
      springProgress = dragProgress;
      dragProgress = null;
      pulled = false;
      swallowClick = true;
      // Палец вниз уменьшает подъём; за секунду шторка проходит speed * 1000 / высоту своего хода
      const velocity = (-speed * 1000) / moreHeight;
      const limited = Math.max(-MAX_RELEASE_SPEED, Math.min(MAX_RELEASE_SPEED, velocity));
      // Уже за конечной точкой: дальше не разгоняем, иначе перелёт был бы слишком большим
      const beyond = (open ? 1 : 0) - springProgress;
      settle(beyond * limited > 0 || beyond === 0 ? limited : 0);
    }

    function onCancel(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (dragProgress == null) return;
      springProgress = dragProgress;
      dragProgress = null;
      pulled = false;
      settle(0);
    }

    // Протащили, начав с кнопки: это жест, а не нажатие на раздел
    function onClick(e: MouseEvent) {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    }

    node.addEventListener('pointerdown', onDown);
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onCancel);
    node.addEventListener('click', onClick, true);
    return {
      destroy() {
        node.removeEventListener('pointerdown', onDown);
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerup', onUp);
        node.removeEventListener('pointercancel', onCancel);
        node.removeEventListener('click', onClick, true);
      },
    };
  }
</script>

<div
  class="m-dock"
  class:m-dock--dragging={dragging}
  class:m-dock--floating={floating}
  class:m-dock--hidden={barsAway}
  style:--m-dock-p={progress}
  style:--m-dock-more-h={`${moreHeight}px`}
  style:--m-dock-cols={columns}
>
  <button
    type="button"
    class="m-dock__scrim"
    class:m-dock__scrim--on={open && !dragging}
    tabindex="-1"
    aria-label="Закрыть"
    onclick={() => { open = false; }}
  ></button>
  {#if progress > 1}
    <!-- Пасхалка: если сильно перетянуть шторку вверх, из-под неё выглядывает Аква -->
    <img class="m-dock__aqua" src={aquaUrl} alt="" draggable="false" />
  {/if}
  <nav class="m-dock__sheet" aria-label="Разделы" bind:this={sheetEl}>
    <div class="m-dock__panel" use:sheetGesture use:navReorder={reorderInDock}>
      <span class="m-dock__handle" class:m-dock__handle--alert={alert} aria-hidden="true"></span>
      <div class="m-navbar">{@render bar()}</div>
      <div class="m-dock__more" class:m-dock__more--dense={columns >= DENSE_COLUMNS} inert={!open && !dragging} bind:offsetHeight={moreHeight}>
        {@render more()}
      </div>
    </div>
  </nav>
</div>

<style lang="scss">
  $sheet-ease: cubic-bezier(0.22, 1, 0.36, 1);
  $safe-bottom: var(--safe-bottom);
  $float-gap: 12px;

  .m-dock {
    position: fixed;
    inset: 0;
    z-index: 30;
    pointer-events: none;
  }

  .m-dock__scrim {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 0;
    background: #000;
    opacity: calc(var(--m-dock-p) * 0.5);
    pointer-events: none;
  }

  .m-dock__scrim--on { pointer-events: auto; }

  /* Начинает подниматься не сразу: при обычном перелёте шторки её не видно */
  .m-dock__aqua {
    position: absolute;
    left: 50%;
    bottom: 0;
    width: min(72vw, 288px);
    height: auto;
    /* Выглядывает только по плечи: 35% картинки всегда остаётся за краем экрана */
    transform: translate(-50%, max(35%, calc(100% - max(0px, ((var(--m-dock-p) - 1) * var(--m-dock-more-h) - 40px) * 1.25))));
  }

  .m-dock__sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    transition:
      left 0.3s $sheet-ease,
      right 0.3s $sheet-ease,
      bottom 0.3s $sheet-ease;
    /* Свой слой заранее: иначе на тяжёлом списке начало скрытия теряет кадры */
    will-change: transform;
  }

  /* Оторвалась: отходит от краёв экрана и скругляется со всех сторон */
  .m-dock--floating .m-dock__sheet {
    left: $float-gap;
    right: $float-gap;
    bottom: calc(#{$float-gap} + #{$safe-bottom});
  }

  /* Тень не должна остаться у края экрана, поэтому запас сверх высоты панели */
  .m-dock--hidden .m-dock__sheet {
    transform: translateY(calc(var(--m-nav-h) + #{$safe-bottom} + 32px));
  }

  /* В закрытой панели видна навигация и полоса безопасной зоны под ней */
  .m-dock__panel {
    position: relative;
    border-radius: 20px 20px 0 0;
    background: var(--m-surface-sheet);
    box-shadow: 0 -6px 24px rgb(0 0 0 / 24%);
    transform: translateY(calc((var(--m-dock-more-h) - #{$safe-bottom}) * (1 - var(--m-dock-p))));
    pointer-events: auto;
    touch-action: none;
    user-select: none;
    transition: border-radius 0.3s $sheet-ease, box-shadow 0.3s $sheet-ease;
  }

  .m-dock--floating .m-dock__panel {
    border-radius: 28px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 45%);
  }

  /* Над панелью, а не внутри: внутри она наезжала на подсветку активного раздела */
  .m-dock__handle {
    position: absolute;
    top: -10px;
    left: 50%;
    width: 32px;
    height: 4px;
    margin-left: -16px;
    border-radius: 2px;
    background: var(--m-text-2);
    box-shadow: 0 1px 3px rgb(0 0 0 / 50%);
    transition: background 0.2s ease;
  }

  .m-dock__handle--alert { background: #e5484d; }

  .m-dock__more {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--m-dock-cols), minmax(0, 1fr));
    gap: var(--m-space-2);
    padding: var(--m-space-3);

    /* Разделитель проявляется вместе с плитками */
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: var(--m-gutter);
      right: var(--m-gutter);
      height: 1px;
      background: var(--m-divider);
      opacity: var(--m-dock-p);
    }
  }

  /* Плитки появляются друг за другом по мере подъёма шторки */
  .m-dock__more :global(.m-dock__tile) {
    --tile-p: clamp(0, calc((var(--m-dock-p) - 0.25 - var(--i) * 0.06) * 2.5), 1);
    display: flex;
    border-radius: var(--m-radius-lg);
    background: var(--m-surface-block);
    opacity: var(--tile-p);
    transform: translateY(calc((1 - var(--tile-p)) * 14px)) scale(calc(0.92 + var(--tile-p) * 0.08));
  }

  .m-dock__more--dense {
    gap: var(--m-space-1);
    padding: var(--m-space-2);
  }

  .m-dock__more :global(.m-nav-item__label) {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .m-dock__more--dense :global(.m-nav-item__label) { font-size: 11px; }

  /* Плитка поднятого раздела становится пустым местом с рамкой */
  .m-dock__more :global(.m-dock__tile:has(.m-nav-item--lifted)) { background: transparent; }
  .m-dock__more :global(.m-nav-item--lifted::after) { inset: 0; }

  .m-dock__more :global(.m-nav-item) { padding: var(--m-space-3) 0; }

  @media (prefers-reduced-motion: reduce) {
    .m-dock__sheet, .m-dock__panel { transition: none; }
  }

  /* Планшет: разделы в левой панели */
  @media (min-width: 600px) {
    :global(html.mobile-mode) .m-dock { display: none; }
  }
</style>
