/**
 * Global UiKit V2 tooltips for leftover `title` / `data-tooltip` attributes.
 * Skips elements already wrapped in UiV2Tooltip.
 */

const GAP = 10;
const EDGE = 12;

let tipEl: HTMLElement | null = null;
let textEl: HTMLElement | null = null;
let activeEl: HTMLElement | null = null;
let savedTitle: string | null = null;
let listenersBound = false;

function ensureTip(): HTMLElement {
  if (tipEl && textEl && document.body.contains(tipEl)) return tipEl;

  const tip = document.createElement('div');
  tip.className = 'uiv2-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  tip.style.display = 'none';

  const text = document.createElement('span');
  text.className = 'uiv2-tooltip__text';
  tip.appendChild(text);
  document.body.appendChild(tip);

  tipEl = tip;
  textEl = text;
  return tip;
}

function layout(anchor: DOMRect): void {
  const tip = ensureTip();
  const tw = tip.offsetWidth || 200;
  const th = tip.offsetHeight || 28;
  const spaceAbove = anchor.top;
  const spaceBelow = window.innerHeight - anchor.bottom;
  const below = spaceBelow >= spaceAbove || spaceBelow >= th + GAP;

  let top = below ? anchor.bottom + GAP : anchor.top - th - GAP;
  let left = anchor.left + anchor.width / 2 - tw / 2;
  left = Math.max(EDGE, Math.min(left, window.innerWidth - EDGE - tw));
  top = Math.max(EDGE, Math.min(top, window.innerHeight - EDGE - th));

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.dataset.placement = below ? 'bottom' : 'top';
}

function show(text: string, anchor: DOMRect): void {
  const tip = ensureTip();
  if (textEl) textEl.textContent = text;
  tip.style.display = '';
  tip.setAttribute('aria-hidden', 'false');
  layout(anchor);
}

function hide(): void {
  if (!tipEl) return;
  tipEl.style.display = 'none';
  tipEl.setAttribute('aria-hidden', 'true');
  if (textEl) textEl.textContent = '';
}

function shouldSkip(el: Element): boolean {
  return Boolean(
    el.closest('.uiv2-tooltip__trigger')
    || el.closest('.uiv2-tooltip')
    || el.closest('.al-img-preview')
    || el.closest('.al-json__link--img'),
  );
}

function onEnter(e: Event): void {
  const target = (e.target as Element)?.closest?.('[data-tooltip],[title]');
  if (!(target instanceof HTMLElement)) return;
  if (target === activeEl) return;
  if (shouldSkip(target)) return;

  cleanup();

  let text = target.dataset.tooltip ?? '';
  if (!text) {
    const nat = target.getAttribute('title');
    if (!nat) return;
    text = nat;
    target.setAttribute('title', '');
    savedTitle = nat;
  }

  activeEl = target;
  show(text, target.getBoundingClientRect());
}

function onLeave(e: Event): void {
  if (!activeEl) return;
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

/** Call from any Electron window entry point. */
export function initTooltipSystem(): void {
  if (listenersBound) return;
  listenersBound = true;
  document.body.addEventListener('mouseenter', onEnter, true);
  document.body.addEventListener('mouseleave', onLeave, true);
  document.addEventListener('scroll', () => { cleanup(); hide(); }, { passive: true, capture: true });
  window.addEventListener('blur', () => { cleanup(); hide(); });
  window.addEventListener('resize', () => { cleanup(); hide(); });
}
