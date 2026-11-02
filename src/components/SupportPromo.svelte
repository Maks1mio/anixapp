<script lang="ts">
  /**
   * Одноразовое уведомление после входа: «можно поддержать проект и получить значок навсегда».
   * Показывается рядом с алмазом в боковой панели (стрелка на него); без панели — в углу.
   * Крестик / «Не сейчас» — больше не показывать; значок / «Подробнее» — модалка Anix+.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { fade } from 'svelte/transition';
  import UiV2Button from './uikit-v2/UiV2Button.svelte';
  import { portal } from '../actions/portal';
  import { isAuthenticated } from '../stores/auth';
  import { isSupportPromoSeen, markSupportPromoSeen, openSupportModal } from '../stores/support-promo';
  import teer3 from '../assets/media/Teer 3.png';

  const SHOW_DELAY_MS = 4000;
  const GAP = 12;

  let visible = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Anchored next to the sidebar diamond; null → fallback corner. */
  let anchor = $state<{ side: 'right' | 'left'; x: number; bottom: number; arrowBottom: number; maxWidth: number } | null>(null);

  function place() {
    const btn = document.querySelector<HTMLElement>('.sidebar__link--support');
    const r = btn?.getBoundingClientRect();
    if (!r || r.width === 0) {
      anchor = null;
      return;
    }
    // Sidebar on the left → popover to the right of the diamond, and vice versa.
    const side = r.left < window.innerWidth / 2 ? 'right' : 'left';
    const bottom = Math.max(GAP, window.innerHeight - r.bottom - 6);
    anchor = {
      side,
      x: side === 'right' ? r.right + GAP : window.innerWidth - r.left + GAP,
      bottom,
      arrowBottom: window.innerHeight - (r.top + r.height / 2) - bottom - 7,
      maxWidth: side === 'right' ? window.innerWidth - r.right - GAP * 2 : r.left - GAP * 2,
    };
    // Not enough room next to the sidebar (narrow window) → corner placement.
    if (anchor.maxWidth < 240) anchor = null;
  }

  function schedule() {
    if (visible || timer || isSupportPromoSeen() || !get(isAuthenticated)) return;
    timer = setTimeout(() => {
      timer = null;
      if (isSupportPromoSeen() || !get(isAuthenticated)) return;
      place();
      visible = true;
    }, SHOW_DELAY_MS);
  }

  function dismiss() {
    visible = false;
    markSupportPromoSeen();
  }

  function details() {
    visible = false;
    openSupportModal();
  }

  onMount(() => {
    // Fires right away and again after login.
    const unsub = isAuthenticated.subscribe(() => schedule());
    const onResize = () => visible && place();
    window.addEventListener('resize', onResize);
    return () => {
      unsub();
      window.removeEventListener('resize', onResize);
      if (timer) clearTimeout(timer);
    };
  });
</script>

{#if visible}
  <aside
    class="support-promo"
    class:support-promo--anchored={!!anchor}
    class:support-promo--left={anchor?.side === 'left'}
    style:left={anchor?.side === 'right' ? `${anchor.x}px` : undefined}
    style:right={anchor?.side === 'left' ? `${anchor.x}px` : undefined}
    style:bottom={anchor ? `${anchor.bottom}px` : undefined}
    style:--arrow-bottom={anchor ? `${anchor.arrowBottom}px` : undefined}
    style:max-width={anchor ? `${anchor.maxWidth}px` : undefined}
    aria-label="Поддержать AnixApp"
    use:portal={{ lock: false }}
    transition:fade={{ duration: 180 }}
  >
    <button type="button" class="support-promo__badge" aria-label="Подробнее об Anix+" onclick={details}>
      <img src={teer3} alt="" width="28" height="28" />
    </button>
    <div class="support-promo__body">
      <p class="support-promo__title">Значок Anix+ навсегда</p>
      <p class="support-promo__text">Поддержите AnixApp — и у вашего ника появится значок, который увидят все.</p>
      <div class="support-promo__actions">
        <UiV2Button label="Подробнее" size="sm" variant="primary" onclick={details} />
        <UiV2Button label="Не сейчас" size="sm" variant="ghost" onclick={dismiss} />
      </div>
    </div>
    <button type="button" class="support-promo__close" aria-label="Закрыть и больше не показывать" onclick={dismiss}>
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </aside>
{/if}

<style>
  .support-promo {
    position: fixed;
    right: 1.25rem;
    bottom: 1.25rem;
    z-index: 10030;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    width: min(calc(100vw - 2rem), 20rem);
    padding: 0.85rem 2.2rem 0.85rem 0.85rem;
    border-radius: 16px;
    border: 1px solid var(--uiv2-panel-border);
    /* Сплошной фон: лежит поверх контента без затемнения */
    background: var(--uikit-v2-elevated, #1c1c1e);
    box-shadow: var(--uiv2-popup-shadow, var(--uiv2-panel-shadow));
  }

  :global(html.mobile-mode) .support-promo:not(.support-promo--anchored) {
    right: 1rem;
    bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));
  }

  /* Стрелка к алмазу в боковой панели */
  .support-promo--anchored::before {
    content: '';
    position: absolute;
    left: -7px;
    bottom: var(--arrow-bottom, 1rem);
    width: 12px;
    height: 12px;
    background: var(--uikit-v2-elevated, #1c1c1e);
    border-left: 1px solid var(--uiv2-panel-border);
    border-bottom: 1px solid var(--uiv2-panel-border);
    transform: rotate(45deg);
  }

  .support-promo--anchored.support-promo--left::before {
    left: auto;
    right: -7px;
    transform: rotate(-135deg);
  }

  .support-promo__badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border: 1px solid var(--uiv2-border-subtle);
    border-radius: 12px;
    background: var(--uiv2-surface-subtle);
    cursor: pointer;
  }

  .support-promo__badge:hover {
    background: var(--uiv2-hover-bg);
  }

  .support-promo__badge img {
    object-fit: contain;
  }

  .support-promo__body {
    min-width: 0;
  }

  .support-promo__title {
    margin: 0 0 0.2rem;
    font-weight: 650;
    font-size: 0.93rem;
    color: var(--uikit-v2-text);
  }

  .support-promo__text {
    margin: 0 0 0.65rem;
    font-size: 0.83rem;
    line-height: 1.4;
    color: var(--uiv2-fg-muted);
  }

  .support-promo__actions {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .support-promo__close {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--uiv2-fg-muted);
    cursor: pointer;
  }

  .support-promo__close:hover {
    background: var(--uiv2-hover-bg);
    color: var(--uikit-v2-text);
  }

  .support-promo__close svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .support-promo__badge:focus-visible,
  .support-promo__close:focus-visible {
    outline: 2px solid var(--uikit-v2-accent);
    outline-offset: 2px;
  }
</style>
