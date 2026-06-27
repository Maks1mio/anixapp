export type CardLayout = 'wide' | 'mini';
export type ProfileLayout = 'classic' | 'v2';

const CARD_LAYOUT_KEY = 'anixapp.cardLayout';
const PROFILE_LAYOUT_KEY = 'anixapp.profileLayout';

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
  window.dispatchEvent(new CustomEvent('anix:cardLayoutChanged', { detail: { layout } }));
}

export function getProfileLayout(): ProfileLayout {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 'v2';
  }
  const stored = window.localStorage.getItem(PROFILE_LAYOUT_KEY);
  return stored === 'classic' ? 'classic' : 'v2';
}

export function setProfileLayout(layout: ProfileLayout): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  window.localStorage.setItem(PROFILE_LAYOUT_KEY, layout);
  window.dispatchEvent(new CustomEvent('anix:profileLayoutChanged', { detail: { layout } }));
}

