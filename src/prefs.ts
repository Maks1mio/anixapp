export type CardLayout = 'wide' | 'mini';

const CARD_LAYOUT_KEY = 'anixapp.cardLayout';

export function getCardLayout(): CardLayout {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 'wide';
  }
  const stored = window.localStorage.getItem(CARD_LAYOUT_KEY);
  return stored === 'mini' ? 'mini' : 'wide';
}

export function setCardLayout(layout: CardLayout): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  window.localStorage.setItem(CARD_LAYOUT_KEY, layout);
}

