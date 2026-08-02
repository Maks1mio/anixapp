/**
 * Adaptive stream quality from player window size.
 * Smaller window → lower max resolution (1080 → 720 → 480 → 360).
 */

/** Width thresholds (CSS px of player area) → max stream height. Highest match wins. */
export const ADAPTIVE_QUALITY_STEPS: ReadonlyArray<{ minWidth: number; maxHeight: number }> = [
  { minWidth: 1200, maxHeight: Number.POSITIVE_INFINITY }, // 1080+
  { minWidth: 900, maxHeight: 720 },
  { minWidth: 640, maxHeight: 480 },
  { minWidth: 0, maxHeight: 360 },
];

export function parseQualityHeight(label: string): number {
  const n = parseInt(String(label).replace(/p$/i, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function listSortedQualities(
  qualityMap: Record<string, string>,
): { key: string; height: number }[] {
  return Object.keys(qualityMap)
    .map((key) => ({ key, height: parseQualityHeight(key) }))
    .filter((x) => x.height > 0 && !!qualityMap[x.key])
    .sort((a, b) => b.height - a.height);
}

/** Max allowed stream height for a given player width. */
export function maxQualityForViewportWidth(viewportWidth: number): number {
  const w = Math.max(0, viewportWidth || 0);
  for (const step of ADAPTIVE_QUALITY_STEPS) {
    if (w >= step.minWidth) return step.maxHeight;
  }
  return 360;
}

/**
 * Pick a quality key for the current viewport.
 * Returns null if the map is empty / unusable.
 */
export function pickAdaptiveQuality(
  qualityMap: Record<string, string>,
  viewportWidth: number,
): string | null {
  const list = listSortedQualities(qualityMap);
  if (list.length === 0) return null;

  const maxAllowed = maxQualityForViewportWidth(viewportWidth);
  const atOrBelow = list.filter((x) => x.height <= maxAllowed);
  if (atOrBelow.length > 0) return atOrBelow[0].key;

  // Only higher than cap (e.g. 720-only source in a tiny window) — lowest available.
  return list[list.length - 1].key;
}

export function getPlayerViewportWidth(): number {
  const el =
    document.querySelector('.watch-page__player-wrap')
    ?? document.querySelector('.watch-page__player-area');
  if (el instanceof HTMLElement && el.clientWidth > 0) return el.clientWidth;
  return window.innerWidth || 0;
}
