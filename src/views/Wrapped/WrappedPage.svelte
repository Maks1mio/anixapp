<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import gsap from 'gsap';
  import { navigate } from '../../stores/navigation';
  import { WRAPPED_YEAR } from '../../utils/yearWrapped';
  import { loadWrappedData, type WrappedData, type WrappedLoadState } from './shared/wrapped-load';
  import WrappedScreenHost, { type WrappedScreenId } from './components/WrappedScreenHost.svelte';
  import { buildRewindSteps, sameRewindScene, type RewindStep } from './shared/rewind-steps';
  import {
    animateProgressBar,
    createGsapContext,
    hideRewindLayer,
    prefersReducedMotion,
    revealRewindLayer,
    swapRewindContent,
    transitionRewindScenes,
  } from './shared/wrapped-animations';

  interface Props {
    year?: number;
  }

  let { year = WRAPPED_YEAR }: Props = $props();

  let loadState = $state<WrappedLoadState>('loading');
  let errorMsg = $state('');
  let data = $state<WrappedData | null>(null);
  let steps = $state<RewindStep[]>([{ screenId: 'welcome' }]);
  let stepIndex = $state(0);
  let reduced = prefersReducedMotion();
  let transitioning = $state(false);

  let rootEl = $state<HTMLElement | null>(null);
  let viewportEl = $state<HTMLElement | null>(null);
  let loadingPulseEl = $state<HTMLElement | null>(null);
  let progressEl = $state<HTMLElement | null>(null);

  let gsapCtx: { revert: () => void } | null = null;

  function goHome() {
    navigate('/');
  }

  function layerAt(i: number): HTMLElement | null {
    if (!viewportEl) return null;
    return (viewportEl.querySelectorAll('.rewind-layer')[i] as HTMLElement) ?? null;
  }

  function sectionAt(i: number): HTMLElement | null {
    return layerAt(i)?.querySelector('.rewind-screen') as HTMLElement | null;
  }

  function setProgress(index: number) {
    if (!progressEl) return;
    const dots = [...progressEl.querySelectorAll('.wrapped-progress__dot')] as HTMLElement[];
    animateProgressBar(dots, index, reduced);
  }

  async function goToStep(next: number) {
    if (transitioning || next === stepIndex || next < 0 || next >= steps.length) return;
    const outIdx = stepIndex;
    const inIdx = next;
    const outStep = steps[outIdx];
    const inStep = steps[inIdx];
    const outLayer = layerAt(outIdx);
    const inLayer = layerAt(inIdx);
    const outSec = sectionAt(outIdx);
    const inSec = sectionAt(inIdx);
    if (!outSec || !inSec || !inLayer) return;

    transitioning = true;
    stepIndex = inIdx;
    setProgress(inIdx);

    gsap.set(inLayer, { autoAlpha: 1, visibility: 'visible', pointerEvents: 'none', zIndex: 2 });

    try {
      if (sameRewindScene(outStep, inStep)) {
        await swapRewindContent(outSec, inSec, reduced);
      } else {
        await transitionRewindScenes(outSec, inSec, reduced);
      }
    } finally {
      if (outLayer) gsap.set(outLayer, { autoAlpha: 0, visibility: 'hidden', pointerEvents: 'none', zIndex: 0 });
      gsap.set(inLayer, { pointerEvents: 'auto', zIndex: 1 });
      transitioning = false;
    }
  }

  function goNext() {
    goToStep(Math.min(stepIndex + 1, steps.length - 1));
  }

  function goPrev() {
    goToStep(Math.max(stepIndex - 1, 0));
  }

  function isScrollableStep(index = stepIndex): boolean {
    return steps[index]?.screenId === 'preferences';
  }

  function scrollableSection(index = stepIndex): HTMLElement | null {
    const sec = sectionAt(index);
    if (!sec?.classList.contains('rewind-screen--scrollable')) return null;
    return sec;
  }

  function scrollPrefsBy(delta: number, behavior: ScrollBehavior = reduced ? 'auto' : 'smooth') {
    const sec = scrollableSection();
    if (!sec) return false;
    sec.scrollBy({ top: delta, behavior });
    return true;
  }

  function prefsAtBottom(sec: HTMLElement): boolean {
    return sec.scrollTop + sec.clientHeight >= sec.scrollHeight - 12;
  }

  function prefsAtTop(sec: HTMLElement): boolean {
    return sec.scrollTop <= 12;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (loadState !== 'ready' || !data) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      goHome();
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      const sec = scrollableSection();
      if (sec && !prefsAtBottom(sec)) {
        e.preventDefault();
        scrollPrefsBy(sec.clientHeight * 0.72);
        return;
      }
      e.preventDefault();
      goNext();
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      const sec = scrollableSection();
      if (sec && !prefsAtTop(sec)) {
        e.preventDefault();
        scrollPrefsBy(-sec.clientHeight * 0.72);
        return;
      }
      e.preventDefault();
      goPrev();
    } else if (e.key === ' ' || e.key === 'Enter') {
      const sec = scrollableSection();
      if (sec && !prefsAtBottom(sec)) {
        e.preventDefault();
        scrollPrefsBy(sec.clientHeight * 0.85);
        return;
      }
      e.preventDefault();
      goNext();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goPrev();
    } else if (e.key === 'Home') {
      e.preventDefault();
      goToStep(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      goToStep(steps.length - 1);
    }
  }

  function handleViewportClick(e: MouseEvent) {
    if (transitioning) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, textarea, select, [data-share-skip]')) return;
    // На scrollable-экранах клик не листает кадры — только точки / стрелки / «Дальше»
    if (isScrollableStep() || t.closest('.rewind-screen--scrollable')) return;
    const rect = viewportEl?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.28) goPrev();
    else goNext();
  }

  async function initLayers() {
    await tick();
    for (let i = 0; i < steps.length; i++) {
      const layer = layerAt(i);
      const sec = sectionAt(i);
      if (!layer || !sec) continue;
      hideRewindLayer(sec);
      gsap.set(layer, {
        autoAlpha: i === 0 ? 1 : 0,
        visibility: i === 0 ? 'visible' : 'hidden',
        pointerEvents: i === 0 ? 'auto' : 'none',
        zIndex: i === 0 ? 1 : 0,
      });
    }
    const first = sectionAt(0);
    if (first) await revealRewindLayer(first, '', reduced);
    setProgress(0);
  }

  onMount(async () => {
    gsapCtx = createGsapContext(rootEl, () => {});

    if (loadingPulseEl && !reduced) {
      gsap.to(loadingPulseEl, {
        scale: 1.15,
        opacity: 1,
        duration: 0.9,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }

    const result = await loadWrappedData(year);
    loadState = result.state;
    errorMsg = result.error ?? '';
    data = result.data ?? null;

    if (data) {
      steps = buildRewindSteps(data, result.state);
    }

    await tick();
    await initLayers();
  });

  onDestroy(() => {
    gsapCtx?.revert();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="wrapped-page rewind-page" bind:this={rootEl}>
  {#if loadState === 'loading'}
    <div class="wrapped-page__loading">
      <div class="wrapped-page__loading-pulse" bind:this={loadingPulseEl}></div>
      <p>Загружаем итоги {year}…</p>
    </div>
  {:else if loadState === 'error'}
    <div class="wrapped-page__state">
      <h2>Не удалось загрузить</h2>
      <p>{errorMsg}</p>
      <button type="button" class="wrapped-btn wrapped-btn--primary" onclick={goHome}>На главную</button>
    </div>
  {:else if data}
    <header class="wrapped-page__top wrapped-page__top--rewind">
      <div class="wrapped-page__top-right">
        <span class="wrapped-page__counter">{stepIndex + 1} / {steps.length}</span>
        <button type="button" class="wrapped-page__close" onclick={goHome} aria-label="Закрыть итоги">
          ×
        </button>
      </div>
    </header>

    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="rewind-viewport"
      bind:this={viewportEl}
      onclick={handleViewportClick}
      role="presentation"
    >
      {#each steps as step, i (i)}
        <div class="rewind-layer" class:is-active={i === stepIndex}>
          <WrappedScreenHost
            screenId={step.screenId}
            bingeStep={step.bingeStep ?? 0}
            {data}
            onHome={goHome}
          />
        </div>
      {/each}
    </div>

    {#if steps.length > 1}
      <nav class="wrapped-page__dots" bind:this={progressEl} aria-label="Навигация по разделам">
        {#each steps as _, i (i)}
          <button
            type="button"
            class="wrapped-progress__dot"
            class:is-active={i <= stepIndex}
            class:is-current={i === stepIndex}
            aria-label="Кадр {i + 1}"
            aria-current={i === stepIndex}
            onclick={() => goToStep(i)}
          ></button>
        {/each}
      </nav>

      {#if stepIndex < steps.length - 1}
        <div class="rewind-advance-hint" aria-hidden="true">
          <span>Дальше</span>
          <span class="rewind-advance-hint__arrow">→</span>
        </div>
      {/if}
    {/if}
  {/if}
</div>
