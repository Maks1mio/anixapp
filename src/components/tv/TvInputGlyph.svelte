<script lang="ts" module>
  export type TvGlyphButton =
    | 'select'
    | 'back'
    | 'menu'
    | 'search'
    | 'prev'
    | 'next'
    | 'navigate'
    | 'play'
    | 'prev-ep'
    | 'next-ep';
</script>

<script lang="ts">
  import type { TvInputDevice } from '../../services/tv-input';
  import { untrack } from 'svelte';
  import { TV_LONGPRESS_MS } from '../../services/tv-navigation';

  interface Props {
    button: TvGlyphButton;
    device: TvInputDevice;
    /** Удержание кнопки — кольцо вокруг глифа. */
    hold?: boolean;
    /** Кнопку держат прямо сейчас — кольцо заполняется за время удержания. */
    filling?: boolean;
  }

  let { button, device, hold = false, filling = false }: Props = $props();

  type Shape = 'key' | 'round' | 'pill' | 'shoulder' | 'trigger';
  /** Скругление плашки — кольцо удержания повторяет его. */
  const SHAPE_RADIUS: Record<Shape, string> = {
    key: 'round(0.5rem, 1px)',
    round: '0.95rem',
    pill: '0.95rem',
    shoulder: '0.5rem',
    trigger: '0.5rem',
  };

  // Полоса подсказок выравнивает текст по дробным пикселям — кольцо удержания
  // сдвигаем на целый пиксель, иначе рамка сглаживается неравномерно.
  let wrapEl = $state<HTMLElement | null>(null);
  let snapX = $state(0);

  $effect(() => {
    if (!hold || !wrapEl) return;
    const el = wrapEl;
    const snap = () => {
      const dpr = window.devicePixelRatio || 1;
      const x = (el.getBoundingClientRect().x - untrack(() => snapX)) * dpr;
      snapX = (Math.round(x) - x) / dpr;
    };
    snap();
    // Позиция зависит от соседних подсказок — следим за размером всей группы.
    const ro = new ResizeObserver(snap);
    ro.observe(el.closest('.tv-hint-bar__group') ?? el);
    window.addEventListener('resize', snap);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', snap);
    };
  });

  const shape = $derived.by((): Shape => {
    if (button === 'navigate' && device !== 'keyboard') return 'round';
    if (device === 'keyboard') return 'key';
    if (device !== 'remote' && (button === 'prev' || button === 'next')) return 'shoulder';
    if (device !== 'remote' && (button === 'prev-ep' || button === 'next-ep')) return 'trigger';
    if (button === 'menu' && device === 'playstation') return 'pill';
    return 'round';
  });

  const KEYBOARD: Record<TvGlyphButton, string> = {
    select: 'Enter',
    back: 'Esc',
    menu: 'F1',
    search: 'F3',
    prev: 'F6',
    next: 'F7',
    navigate: '↑↓←→',
    play: 'Space',
    'prev-ep': 'PgUp',
    'next-ep': 'PgDn',
  };

  const XBOX_FACE: Partial<Record<TvGlyphButton, { label: string; color: string }>> = {
    select: { label: 'A', color: '#6cbf3f' },
    back: { label: 'B', color: '#e5483b' },
    search: { label: 'Y', color: '#f0be2a' },
    play: { label: 'X', color: '#3d8fe8' },
  };

  const SHOULDER: Partial<Record<TvGlyphButton, Record<'xbox' | 'playstation', string>>> = {
    prev: { xbox: 'LB', playstation: 'L1' },
    next: { xbox: 'RB', playstation: 'R1' },
  };

  const TRIGGER: Partial<Record<TvGlyphButton, Record<'xbox' | 'playstation', string>>> = {
    'prev-ep': { xbox: 'LT', playstation: 'L2' },
    'next-ep': { xbox: 'RT', playstation: 'R2' },
  };

  const PS_COLOR: Partial<Record<TvGlyphButton, string>> = {
    select: '#7ea7ee',
    back: '#f2666a',
    search: '#3fcfa0',
    play: '#e48fc5',
  };
</script>

<span
  class="tv-glyph-wrap"
  class:tv-glyph-wrap--hold={hold}
  bind:this={wrapEl}
  style:transform={hold && snapX ? `translateX(${snapX}px)` : undefined}
  style:--glyph-r={SHAPE_RADIUS[shape]}
  style:--hold-ms="{TV_LONGPRESS_MS}ms"
>
{#if hold}
  <span class="tv-glyph-ring" class:tv-glyph-ring--filling={filling} aria-hidden="true"></span>
{/if}
{#if button === 'navigate' && device !== 'keyboard'}
  <!-- D-pad: пульт и крестовина геймпада -->
  <span class="tv-glyph tv-glyph--round">
    <svg viewBox="0 0 16 16" width="1.05em" height="1.05em" fill="currentColor">
      <path d="M8 1.6l1.9 2.5H6.1zM8 14.4l-1.9-2.5h3.8zM1.6 8l2.5-1.9v3.8zM14.4 8l-2.5 1.9V6.1z" />
      <circle cx="8" cy="8" r="1.6" opacity="0.55" />
    </svg>
  </span>
{:else if device === 'keyboard'}
  <kbd class="tv-glyph tv-glyph--key">{KEYBOARD[button]}</kbd>
{:else if device === 'remote'}
  <span class="tv-glyph tv-glyph--round">
    {#if button === 'select'}
      <span class="tv-glyph__ok">OK</span>
    {:else}
      <svg viewBox="0 0 16 16" width="0.95em" height="0.95em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 4L3 7l3 3" />
        <path d="M3 7h6.5a3.5 3.5 0 0 1 0 7H8" />
      </svg>
    {/if}
  </span>
{:else if SHOULDER[button]}
  <span class="tv-glyph tv-glyph--shoulder">{SHOULDER[button]![device]}</span>
{:else if TRIGGER[button]}
  <span class="tv-glyph tv-glyph--shoulder tv-glyph--trigger">{TRIGGER[button]![device]}</span>
{:else if button === 'menu'}
  <span class="tv-glyph tv-glyph--round" class:tv-glyph--pill={device === 'playstation'}>
    <svg viewBox="0 0 16 16" width="0.85em" height="0.85em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 4.5h10M3 8h10M3 11.5h10" />
    </svg>
  </span>
{:else if device === 'xbox'}
  <span class="tv-glyph tv-glyph--round tv-glyph--face" style:color={XBOX_FACE[button]?.color}>
    {XBOX_FACE[button]?.label}
  </span>
{:else}
  <span class="tv-glyph tv-glyph--round tv-glyph--face" style:color={PS_COLOR[button]}>
    <svg viewBox="0 0 16 16" width="0.8em" height="0.8em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      {#if button === 'select'}
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
      {:else if button === 'back'}
        <circle cx="8" cy="8" r="5" />
      {:else if button === 'play'}
        <rect x="3.5" y="3.5" width="9" height="9" rx="0.5" />
      {:else}
        <path d="M8 2.8l5.3 9.4H2.7z" />
      {/if}
    </svg>
  </span>
{/if}
</span>

<style lang="scss">
  .tv-glyph-wrap {
    position: relative;
    display: inline-flex;
  }

  // Отступ 2px + рамка 3px: целые пиксели, иначе зазор в 1px сглаживается неровно.
  .tv-glyph-wrap--hold {
    padding: 5px;
  }

  // Кольцо удержания: концентрично плашке (радиус + 5px). Заполнение — conic-градиент по --hold-p,
  // маской оставлена только рамка толщиной в padding.
  .tv-glyph-ring {
    position: absolute;
    inset: 0;
    padding: 3px;
    border-radius: calc(var(--glyph-r) + 5px);
    background: conic-gradient(var(--uikit-v2-accent, #e5483b) var(--hold-p), rgba(255, 255, 255, 0.35) 0);
    mask:
      linear-gradient(#000 0 0) content-box exclude,
      linear-gradient(#000 0 0);
    pointer-events: none;
    --hold-p: 0%;
  }

  .tv-glyph-ring--filling {
    --hold-p: 100%;
    transition: --hold-p var(--hold-ms) linear;
  }

  @property --hold-p {
    syntax: '<percentage>';
    inherits: false;
    initial-value: 0%;
  }

  // Плашки в стиле TV-диалогов (.tv-release-page__dialog-close): мягкий фон, скругление.
  .tv-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    // Размеры плашек — в целых пикселях (TV-масштаб даёт дробный rem), чтобы кольцо ложилось ровно.
    height: round(1.9rem, 2px);
    background: rgba(255, 255, 255, 0.1);
    color: var(--uikit-v2-text, #fff);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0;
    text-transform: none;
  }

  .tv-glyph--key {
    min-width: round(1.9rem, 2px);
    padding: 0 round(0.55rem, 1px);
    border-radius: round(0.5rem, 1px);
  }

  .tv-glyph--round {
    width: round(1.9rem, 2px);
    border-radius: 50%;
    font-size: 0.95rem;
  }

  .tv-glyph--face {
    font-weight: 700;
  }

  .tv-glyph--pill {
    width: 2.5rem;
    border-radius: 0.95rem;
  }

  .tv-glyph--shoulder {
    min-width: 2.4rem;
    padding: 0 0.5rem;
    border-radius: 0.65rem 0.65rem 0.35rem 0.35rem;
  }

  // Курки (LT/RT, L2/R2): скругление сверху, как у самой кнопки.
  .tv-glyph--trigger {
    border-radius: 0.85rem 0.85rem 0.4rem 0.4rem;
  }

  .tv-glyph__ok {
    font-size: 0.68rem;
    font-weight: 700;
  }
</style>
