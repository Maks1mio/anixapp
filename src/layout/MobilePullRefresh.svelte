<script lang="ts">
  /**
   * Обновление страницы потягиванием вниз: у верхнего края прокрутки плашка выезжает и сдвигает интерфейс,
   * а когда оттянули достаточно, показывает, что страница обновится. Ставится первым ребёнком каркаса.
   */
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { iconArrowDown } from '../components/icons';
  import { springTo } from '../utils/spring';

  interface Props {
    enabled: boolean;
    onRefresh: () => void;
  }
  let { enabled, onRefresh }: Props = $props();

  /** Сколько пикселей занимает плашка в момент готовности и пока идёт обновление. */
  const READY_PX = 72;
  /** Предел: чем дальше тянут, тем туже идёт. */
  const MAX_PX = 160;
  const PULL_SOFTNESS = 0.55;
  /** Сигнала об окончании загрузки у страниц нет: столько показываем, что обновление идёт. */
  const REFRESHING_MS = 800;

  const LABELS = {
    pull: 'Потяните, чтобы обновить',
    ready: 'Отпустите, чтобы обновить',
    refreshing: 'Обновляем…',
  };

  let root = $state<HTMLElement | null>(null);
  let offset = $state(0);
  let stage = $state<keyof typeof LABELS>('pull');
  const progress = $derived(Math.min(1, Math.max(0, offset) / READY_PX));

  let shifted: HTMLElement[] = [];
  let stopSpring = () => {};
  let holdTimer = 0;

  function setOffset(value: number) {
    offset = value;
    for (const el of shifted) el.style.translate = value > 0 ? `0 ${value}px` : '';
  }

  function collapse() {
    stopSpring();
    stopSpring = springTo(offset, 0, 0, (value) => {
      setOffset(value);
      if (value === 0) stage = 'pull';
    });
  }

  function release() {
    stopSpring();
    if (offset < READY_PX) {
      stage = 'pull';
      collapse();
      return;
    }
    stage = 'refreshing';
    stopSpring = springTo(offset, READY_PX, 0, setOffset);
    onRefresh();
    holdTimer = window.setTimeout(collapse, REFRESHING_MS);
  }

  /** Страница, которую можно потянуть: у её прокрутки и вложенных в неё блоков под пальцем нет сдвига. */
  function pullableScroller(target: Element, host: HTMLElement): HTMLElement | null {
    if (target.closest('.m-search-history, .m-fullscreen--page, .agent-page, input[type="range"]')) return null;
    const scroller = target.closest<HTMLElement>('.page__scroll');
    if (!scroller || !host.contains(scroller)) return null;
    for (let el: Element | null = target; el && el !== scroller; el = el.parentElement) {
      if (el.scrollTop > 0) return null;
    }
    return scroller.scrollTop <= 0 ? scroller : null;
  }

  $effect(() => {
    const host = root?.parentElement;
    if (!host) return;
    let touchId: number | null = null;
    let startX = 0;
    let startY = 0;
    let pulling = false;
    let scroller: HTMLElement | null = null;

    const ownTouch = (e: TouchEvent) => [...e.changedTouches].find((t) => t.identifier === touchId);

    function onStart(e: TouchEvent) {
      touchId = null;
      if (!enabled || e.touches.length !== 1 || stage === 'refreshing' || offset > 1) return;
      scroller = pullableScroller(e.target as Element, host!);
      if (!scroller) return;
      touchId = e.touches[0].identifier;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      pulling = false;
    }

    function onMove(e: TouchEvent) {
      const touch = touchId == null ? undefined : ownTouch(e);
      if (!touch) return;
      const dy = touch.clientY - startY;
      if (!pulling) {
        const dx = touch.clientX - startX;
        if (dx === 0 && dy === 0) return;
        if (dy <= 0 || Math.abs(dx) > dy || !e.cancelable) {
          touchId = null;
          return;
        }
        pulling = true;
        stopSpring();
        const page = scroller!.closest<HTMLElement>('.m-fullscreen--profile')
          ?? scroller!.closest<HTMLElement>('.m-app__scroll');
        const floatBar = page?.classList.contains('m-app__scroll') ? host!.querySelector<HTMLElement>('.m-topbar--float') : null;
        shifted = [page, floatBar].filter((el): el is HTMLElement => !!el);
      }
      if (e.cancelable) e.preventDefault();
      const next = MAX_PX * (1 - Math.exp((-Math.max(0, dy) * PULL_SOFTNESS) / MAX_PX));
      setOffset(next);
      const nextStage = next >= READY_PX ? 'ready' : 'pull';
      if (nextStage === 'ready' && stage !== 'ready') navigator.vibrate?.(10);
      stage = nextStage;
    }

    function onEnd(e: TouchEvent) {
      if (touchId == null || !ownTouch(e)) return;
      touchId = null;
      if (pulling) release();
    }

    host.addEventListener('touchstart', onStart, { passive: true });
    host.addEventListener('touchmove', onMove, { passive: false });
    host.addEventListener('touchend', onEnd);
    host.addEventListener('touchcancel', onEnd);
    return () => {
      host.removeEventListener('touchstart', onStart);
      host.removeEventListener('touchmove', onMove);
      host.removeEventListener('touchend', onEnd);
      host.removeEventListener('touchcancel', onEnd);
    };
  });

  $effect(() => () => {
    stopSpring();
    window.clearTimeout(holdTimer);
  });
</script>

<div
  bind:this={root}
  class="m-ptr"
  class:m-ptr--ready={stage !== 'pull'}
  class:m-ptr--refreshing={stage === 'refreshing'}
  aria-live="polite"
  style:--ptr-offset={`${Math.max(0, offset)}px`}
  style:--ptr-p={progress}
>
  {#if offset > 0}
    <div class="m-ptr__pill">
      <span class="m-ptr__icon" aria-hidden="true">
        <svg class="m-ptr__ring" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" pathLength="100" stroke-dasharray={`${stage === 'refreshing' ? 28 : progress * 100} 100`} />
        </svg>
        <span class="m-ptr__arrow">{@html iconArrowDown(16)}</span>
      </span>
      {#key stage}
        <span class="m-ptr__label" in:fly={{ y: 8, duration: 180, easing: cubicOut }}>{LABELS[stage]}</span>
      {/key}
    </div>
  {/if}
</div>

<style lang="scss">
  $sheet-ease: cubic-bezier(0.22, 1, 0.36, 1);

  /* Заполняет место над сдвинутым интерфейсом; выше страницы и профиля, ниже панелей разделов */
  .m-ptr {
    position: absolute;
    top: 0;
    left: var(--m-rail-left);
    right: var(--m-rail-right);
    z-index: 25;
    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(var(--ptr-offset) + env(safe-area-inset-top));
    padding-top: env(safe-area-inset-top);
    overflow: hidden;
    background: var(--m-bg);
    pointer-events: none;
  }

  .m-ptr__pill {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--m-space-2);
    height: 48px;
    padding: 0 var(--m-space-5) 0 6px;
    border-radius: var(--m-radius-pill);
    background: var(--m-surface-sheet);
    color: var(--m-text-2);
    opacity: var(--ptr-p);
    transform: scale(calc(0.86 + var(--ptr-p) * 0.14));
    transition: background 0.2s ease, color 0.2s ease;
  }

  .m-ptr--ready .m-ptr__pill {
    background: var(--m-secondary-container);
    color: var(--m-on-secondary-container);
  }

  .m-ptr__icon {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
  }

  .m-ptr__ring {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);

    circle {
      fill: none;
      stroke: currentcolor;
      stroke-width: 2.5;
      stroke-linecap: round;
    }
  }

  .m-ptr--refreshing .m-ptr__ring { animation: m-ptr-spin 0.8s linear infinite; }

  .m-ptr__arrow {
    display: flex;
    transition: transform 0.28s $sheet-ease, opacity 0.2s ease;
  }

  .m-ptr--ready .m-ptr__arrow { transform: rotate(180deg); }
  .m-ptr--refreshing .m-ptr__arrow { opacity: 0; }

  .m-ptr__label {
    font: 500 14px/20px var(--m-font);
    white-space: nowrap;
  }

  @keyframes m-ptr-spin {
    to { transform: rotate(270deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .m-ptr--refreshing .m-ptr__ring { animation-duration: 2.4s; }
  }
</style>
