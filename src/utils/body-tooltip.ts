/**
 * Global body-level tooltip system.
 * Intercepts [title] and [data-tooltip] on any element.
 * Renders a single fixed tooltip div at the top of the DOM — never clipped.
 */

const GAP = 8;
const MARGIN = 10;

let tipEl: HTMLElement | null = null;
let activeEl: HTMLElement | null = null;
let savedTitle: string | null = null;
let listenersBound = false;
let stylesReady = false;

function el(): HTMLElement | null {
  return (tipEl ??= document.getElementById('ui-tooltip-root'));
}

function ensureRoot(): HTMLElement | null {
  let tip = el();
  if (tip) return tip;
  tip = document.createElement('div');
  tip.id = 'ui-tooltip-root';
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);
  tipEl = tip;
  return tip;
}

function show(text: string, anchor: DOMRect): void {
  const tip = ensureRoot();
  if (!tip) return;

  tip.textContent = text;
  tip.setAttribute('aria-hidden', 'false');

  // Measure while invisible (styles keep it opacity/visibility hidden until --visible)
  const tw = tip.offsetWidth || 200;
  const th = tip.offsetHeight || 28;

  const below = anchor.top < th + GAP + MARGIN;
  const top = below ? anchor.bottom + GAP : anchor.top - th - GAP;
  let left = anchor.left + anchor.width / 2 - tw / 2;
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - MARGIN - tw));

  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
  tip.style.setProperty('--tip-from-y', below ? '4px' : '-4px');

  tip.classList.add('ui-tooltip--visible');
}

function hide(): void {
  const tip = el();
  if (!tip) return;
  tip.classList.remove('ui-tooltip--visible');
  tip.textContent = '';
  tip.removeAttribute('style');
  tip.setAttribute('aria-hidden', 'true');
}

function onEnter(e: Event): void {
  const target = (e.target as Element)?.closest?.('[data-tooltip],[title]');
  if (!(target instanceof HTMLElement)) return;
  if (target === activeEl) return;

  // Restore any previously stolen title
  cleanup();

  let text = target.dataset.tooltip ?? '';
  if (!text) {
    const nat = target.getAttribute('title');
    if (!nat) return;
    text = nat;
    // Suppress native browser tooltip by clearing the attribute temporarily
    target.setAttribute('title', '');
    savedTitle = nat;
  }

  activeEl = target;
  show(text, target.getBoundingClientRect());
}

function onLeave(e: Event): void {
  if (!activeEl) return;
  // Ignore if pointer moved into a child of the active element
  const rel = (e as MouseEvent).relatedTarget as Node | null;
  if (rel && activeEl.contains(rel)) return;
  cleanup();
  hide();
}

function cleanup(): void {
  if (activeEl && savedTitle !== null) {
    activeEl.setAttribute('title', savedTitle);
  }
  savedTitle = null;
  activeEl = null;
}

export function initBodyTooltip(): void {
  if (listenersBound) return;
  listenersBound = true;
  document.body.addEventListener('mouseenter', onEnter, true);
  document.body.addEventListener('mouseleave', onLeave, true);
  // Also hide on scroll / navigation so tooltip doesn't float away
  document.addEventListener('scroll', () => { cleanup(); hide(); }, { passive: true, capture: true });
  window.addEventListener('blur', () => { cleanup(); hide(); });
}

function ensureStyles(): void {
  if (stylesReady || document.getElementById('ui-tooltip-styles')) {
    stylesReady = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'ui-tooltip-styles';
  style.textContent = `
    #ui-tooltip-root {
      position: fixed;
      z-index: 10003;
      top: 0;
      left: 0;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 500;
      line-height: 1.4;
      color: var(--color-text, #e8e8e8);
      background: var(--color-surface, #2a2a2a);
      border: 1px solid var(--color-border, rgba(255,255,255,0.12));
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      pointer-events: none;
      white-space: nowrap;
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0;
      visibility: hidden;
      transform: translateY(var(--tip-from-y, -4px));
      transition: opacity 0.15s ease, transform 0.15s ease, visibility 0s linear 0.15s;
    }
    #ui-tooltip-root.ui-tooltip--visible {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
      transition: opacity 0.15s ease, transform 0.15s ease, visibility 0s linear 0s;
    }
  `;
  document.head.appendChild(style);
  stylesReady = true;
}

/** Call this from any Electron window entry point.
 *  Creates the tooltip div + injects CSS if not already present. */
export function initTooltipSystem(): void {
  ensureRoot();
  ensureStyles();
  initBodyTooltip();
}
