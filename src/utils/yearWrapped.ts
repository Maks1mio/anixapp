export const WRAPPED_YEAR = 2026;

/** 1 нояб — 31 дек указанного года */
export function isWrappedSeasonActive(year = WRAPPED_YEAR, now = new Date()): boolean {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('wrapped') === '1') return true;
    } catch {
      /* ignore */
    }
  }
  if (import.meta.env.DEV) return true;
  const y = now.getFullYear();
  if (y !== year) return false;
  const month = now.getMonth(); // 0-based
  return month >= 10; // ноябрь (10) и декабрь (11)
}

export function getSelfProfileId(): number | undefined {
  const id = (window as unknown as { __anixProfile?: { id?: number } }).__anixProfile?.id;
  return typeof id === 'number' && id > 0 ? id : undefined;
}

export function shouldShowWrappedBanner(): boolean {
  return false;
}
