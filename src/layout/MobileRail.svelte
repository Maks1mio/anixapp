<script lang="ts">
  /**
   * Панель разделов планшета. Если потянуть её от края, она с усилием отрывается, сжимается в капсулу и идёт
   * за пальцем; отпущенная встаёт к ближайшей стороне экрана. Сторону читают отступы страниц (--m-rail-left/right).
   */
  import type { Snippet } from 'svelte';
  import { scrollEdges } from '../actions/sheet';
  import { navReorder, type NavReorderParams } from '../actions/navReorder';
  import { mobileRailSide, setMobileRailSide, type MobileRailSide } from '../stores/mobile-nav';

  interface Props {
    list: Snippet;
    footer: Snippet;
    reorder: NavReorderParams;
    /** Идёт перестановка разделов: панель не тянется. */
    locked: boolean;
  }
  let { list, footer, reorder, locked }: Props = $props();

  const DRAG_START_PX = 8;
  const DETACH_PULL_PX = 72;
  const PULL_RESISTANCE = 0.25;
  const CAPSULE_W = 72;
  const CAPSULE_H = 380;
  const SCREEN_MARGIN = 8;
  const PAGE_SLIDE_MS = 300;
  /** Разделы переставляют только внутри панели: вывели палец за неё — значит, тянут её саму. */
  const PULL_BEYOND_PX = 12;

  let pull = $state(0);
  let capsule = $state<{ x: number; y: number } | null>(null);
  /** Высота капсулы: телефон боком ниже 380px — капсула не должна упираться в строку состояния */
  let capsuleH = $state(CAPSULE_H);
  let listEl = $state<HTMLElement | null>(null);

  const side = $derived($mobileRailSide);
  const targetSide = $derived<MobileRailSide>(capsule ? nearestSide(capsule.x) : side);
  const offsetX = $derived(capsule ? capsule.x - CAPSULE_W / 2 : side === 'left' ? pull : -pull);
  const offsetY = $derived(capsule ? capsule.y - capsuleH / 2 : 0);

  const reorderInRail = $derived<NavReorderParams>({
    ...reorder,
    isPanelPull: (x, _y, area) => x < area.left - PULL_BEYOND_PX || x > area.right + PULL_BEYOND_PX,
  });

  function nearestSide(x: number): MobileRailSide {
    return x < window.innerWidth / 2 ? 'left' : 'right';
  }

  /** Системные отступы (строка состояния, вырез камеры, жестовая полоса) — их задаёт MainActivity */
  function safeInsets() {
    const cs = getComputedStyle(document.documentElement);
    const read = (name: string) => Number.parseFloat(cs.getPropertyValue(name)) || 0;
    return { top: read('--safe-top'), right: read('--safe-right'), bottom: read('--safe-bottom'), left: read('--safe-left') };
  }

  /** Центр капсулы внутри безопасной области: не заезжает под строку состояния и вырез камеры */
  function clamp(value: number, half: number, from: number, to: number): number {
    return Math.min(Math.max(value, from + half + SCREEN_MARGIN), to - half - SCREEN_MARGIN);
  }

  function capsulePoint(e: PointerEvent) {
    const safe = safeInsets();
    capsuleH = Math.min(CAPSULE_H, window.innerHeight - safe.top - safe.bottom - SCREEN_MARGIN * 2);
    return {
      x: clamp(e.clientX, CAPSULE_W / 2, safe.left, window.innerWidth - safe.right),
      y: clamp(e.clientY, capsuleH / 2, safe.top, window.innerHeight - safe.bottom),
    };
  }

  /** Что двигать вместе со страницей: прямых детей, иначе у position: fixed внутри сменится точка отсчёта. */
  const PAGE_PARTS = '.m-app__scroll > :not(.m-topbar), .m-app__scroll > .m-topbar > *, .m-fullscreen--profile, .m-topbar--float';
  let appliedSide: MobileRailSide | null = null;
  let pageSlides: Animation[] = [];

  /**
   * Ширина страницы при смене стороны не меняется, поэтому раскладка пересчитывается один раз,
   * а сам сдвиг идёт через translate: плавная анимация отступов перекладывала бы весь список на каждом кадре.
   */
  function slidePage(shift: number, applySide: () => void) {
    const parts = [...document.querySelectorAll<HTMLElement>(PAGE_PARTS)];
    const current = parts.map((el) => Number.parseFloat(getComputedStyle(el).translate) || 0);
    for (const slide of pageSlides) slide.cancel();
    applySide();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pageSlides = [];
      return;
    }
    pageSlides = parts.map((el, i) => el.animate(
      { translate: [`${current[i] + shift}px`, '0px'] },
      { duration: PAGE_SLIDE_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    ));
  }

  $effect(() => {
    const root = document.documentElement;
    // Во время перетаскивания сторона берётся по капсуле: страница заранее освобождает место под панель
    const next = targetSide;
    const applySide = () => root.classList.toggle('m-rail-right', next === 'right');
    if (appliedSide != null && appliedSide !== next) {
      const railWidth = Number.parseFloat(getComputedStyle(root).getPropertyValue('--m-rail-w')) || 0;
      slidePage(next === 'right' ? railWidth : -railWidth, applySide);
    } else {
      applySide();
    }
    appliedSide = next;
    return () => root.classList.remove('m-rail-right');
  });

  function pullGesture(node: HTMLElement) {
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startScrollTop = 0;
    /** Жест определяется по первому движению: от края тянут панель, вдоль неё листают список. */
    let mode: 'pull' | 'scroll' | null = null;
    let swallowClick = false;

    function onDown(e: PointerEvent) {
      swallowClick = false;
      if (e.button !== 0) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startScrollTop = listEl?.scrollTop ?? 0;
      mode = null;
    }

    function onMove(e: PointerEvent) {
      if (e.pointerId !== pointerId || locked) return;
      if (capsule) {
        capsule = capsulePoint(e);
        return;
      }
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!mode) {
        if (Math.hypot(dx, dy) < DRAG_START_PX) return;
        mode = Math.abs(dy) > Math.abs(dx) ? 'scroll' : 'pull';
        node.setPointerCapture(e.pointerId);
      }
      if (mode === 'scroll') {
        if (listEl) listEl.scrollTop = startScrollTop - dy;
        return;
      }
      const outward = side === 'left' ? dx : -dx;
      if (outward >= DETACH_PULL_PX) {
        pull = 0;
        capsule = capsulePoint(e);
        navigator.vibrate?.(10);
      } else {
        pull = Math.max(0, outward) * PULL_RESISTANCE;
      }
    }

    function settle(e: PointerEvent, commit: boolean) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (commit && capsule) setMobileRailSide(nearestSide(capsule.x));
      if (mode) swallowClick = true;
      capsule = null;
      pull = 0;
    }

    const onUp = (e: PointerEvent) => settle(e, true);
    const onCancel = (e: PointerEvent) => settle(e, false);

    // Панель потянули, начав с кнопки: это жест, а не нажатие на раздел
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

<nav
  class="m-rail"
  class:m-rail--pulled={pull > 0}
  class:m-rail--capsule={!!capsule}
  aria-label="Разделы"
  style:--rail-base={capsule ? '0px' : undefined}
  style:--rail-dx={`${offsetX}px`}
  style:--rail-dy={`${offsetY}px`}
  style:--capsule-w={`${CAPSULE_W}px`}
  style:--capsule-h={`${capsuleH}px`}
  use:pullGesture
>
  <div class="m-rail__list" bind:this={listEl} use:scrollEdges use:navReorder={reorderInRail}>
    {@render list()}
  </div>
  <div class="m-rail__footer">
    {@render footer()}
  </div>
</nav>

<style lang="scss">
  $sheet-ease: cubic-bezier(0.22, 1, 0.36, 1);
  /* Затухающая пружина: панель чуть перелетает и успокаивается. В браузере без linear() останется обычная кривая */
  $spring: linear(0, 0.16, 0.452, 0.715, 0.894, 0.992, 1.032, 1.038, 1.03, 1.019, 1.009, 1.003, 1, 0.999, 0.999, 0.999, 0.999, 1, 1, 1, 1, 1, 1, 1, 1);

  /* Телефон: разделы в нижней панели */
  .m-rail { display: none; }

  @media (min-width: 600px) {
    .m-rail {
      --rail-base: 0px;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 30;
      /* Под вырезом камеры (альбомная) — тот же фон панели, разделы правее выреза */
      width: calc(var(--m-rail-w) + var(--safe-left));
      height: calc(100dvh * var(--m-vh-fix, 1));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      /* Отступ под вырез — у списка и подвала, а не у панели: фон и линия над профилем идут до самого края */
      --rail-inset-l: var(--safe-left);
      --rail-inset-r: 0px;
      padding: 0 0 calc(var(--safe-bottom) + var(--m-space-3));
      /* Во всю высоту экрана, под строкой состояния: скругляется только нижний внутренний угол,
         верхний скруглённый угол рядом со значками строки состояния выглядел обрубком */
      border-radius: 0 0 20px 0;
      background: var(--m-surface-sheet);
      transform: translate(calc(var(--rail-base) + var(--rail-dx)), var(--rail-dy));
      /* Все жесты панели свои, включая прокрутку списка: браузер не должен забирать палец себе */
      touch-action: none;
      transition:
        width 0.3s $sheet-ease,
        height 0.3s $sheet-ease,
        border-radius 0.3s $sheet-ease,
        padding-bottom 0.3s $sheet-ease,
        box-shadow 0.3s $sheet-ease,
        transform 0.32s $sheet-ease;
      transition-duration: 0.5s, 0.5s, 0.3s, 0.3s, 0.3s, 0.5s;
      transition-timing-function: $spring, $spring, $sheet-ease, $sheet-ease, $sheet-ease, $spring;

      /* flex-basis: в таб-баре .m-nav-item растягивается на ширину, здесь — стопкой по высоте */
      :global(.m-nav-item) { flex: none; width: 100%; padding: 8px 0; font-size: 12px; transition: padding 0.3s $sheet-ease; }
      :global(.m-nav-item__pill) { width: 56px; }
      :global(.m-nav-item__label) {
        max-width: 100%;
        max-height: 20px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition: max-height 0.3s $sheet-ease, opacity 0.2s ease;
      }
    }

    :global(html.m-rail-right) .m-rail {
      --rail-base: calc(100vw - var(--m-rail-w) - var(--safe-right));
      --rail-inset-l: 0px;
      --rail-inset-r: var(--safe-right);
      width: calc(var(--m-rail-w) + var(--safe-right));
      border-radius: 0 0 0 20px;
    }

    /* Пока тянут, панель идёт за пальцем без запаздывания */
    .m-rail--pulled { transition: width 0.3s $sheet-ease, height 0.3s $sheet-ease; }

    :global(html.mobile-mode) .m-rail.m-rail--capsule {
      width: var(--capsule-w);
      height: var(--capsule-h);
      padding-bottom: var(--m-space-2);
      /* Капсула плавает по экрану — отступ под вырез ей не нужен, иначе разделы съезжают к краю */
      --rail-inset-l: 0px;
      --rail-inset-r: 0px;
      border-radius: 36px;
      box-shadow: 0 12px 40px rgb(0 0 0 / 45%);
      /* В капсуле нет строки состояния сверху — разделы начинаются у её края */
      .m-rail__list { padding-top: var(--m-space-3); }
      transition:
        width 0.3s $sheet-ease,
        height 0.3s $sheet-ease,
        border-radius 0.3s $sheet-ease,
        box-shadow 0.3s $sheet-ease,
        transform 0.1s linear;

      :global(.m-nav-item) { padding: 6px 0; }
      :global(.m-nav-item__label) { max-height: 0; opacity: 0; }
    }

    /* Разделы не влезли по высоте: у края, за которым они продолжаются, — затухание и линия */
    .m-rail__list {
      --edge-top: 0px;
      --edge-bottom: 0px;
      flex: 1;
      min-height: 0;
      /* Отступ внутри списка: при прокрутке разделы доходят до самого верха, а не обрываются раньше */
      /* Центр первого раздела — на уровне центра поиска в верхней панели (safe-top + 12 + 48/2):
         12 сверху + 8 отступ пункта + 16 половина плашки */
      padding: calc(var(--safe-top) + var(--m-space-3)) var(--rail-inset-r) 0 var(--rail-inset-l);
      transition: padding 0.3s $sheet-ease;
      overflow-y: auto;
      scrollbar-width: none;
      /* Запрет с панели не действует внутри прокручиваемого блока: браузер забирал палец и отменял жест */
      touch-action: none;
      mask-image: linear-gradient(
        to bottom,
        transparent 0,
        #000 var(--edge-top),
        #000 calc(100% - var(--edge-bottom)),
        transparent 100%
      );
    }
    :global(.m-rail__list[data-more-above]) { --edge-top: calc(var(--safe-top) + 24px); }
    :global(.m-rail__list[data-more-below]) { --edge-bottom: 24px; }

    .m-rail__footer {
      flex: none;
      padding: var(--m-space-2) var(--rail-inset-r) 0 var(--rail-inset-l);
      transition: padding 0.3s $sheet-ease;
    }

    /* Телефон боком (≈400px по высоте): плотнее, чтобы все разделы влезали без обрезанной подписи */
    @media (max-height: 480px) {
      .m-rail { padding-bottom: calc(var(--safe-bottom) + var(--m-space-1)); }
      .m-rail :global(.m-nav-item) { padding: 3px 0; }
      /* по-прежнему вровень с поиском: 17 + 3 отступ пункта + 16 половина плашки = 36 */
      .m-rail__list { padding-top: calc(var(--safe-top) + 17px); }
      .m-rail__footer { padding-top: var(--m-space-1); }
    }
    :global(.m-rail__list[data-more-below] + .m-rail__footer) { box-shadow: 0 -1px 0 var(--m-outline-variant); }
  }

  @media (prefers-reduced-motion: reduce) {
    .m-rail { transition: none; }
  }
</style>
