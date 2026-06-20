export const ZOOM_LEVELS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200] as const;

export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export const DEFAULT_ZOOM: ZoomLevel = 100;

export function normalizeZoom(value: number): ZoomLevel {
  const nearest = ZOOM_LEVELS.reduce((best, level) =>
    Math.abs(level - value) < Math.abs(best - value) ? level : best,
  ZOOM_LEVELS[0]);
  return nearest;
}

export function stepZoom(current: number, direction: 1 | -1): ZoomLevel {
  const normalized = normalizeZoom(current);
  const idx = ZOOM_LEVELS.indexOf(normalized);
  const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + direction));
  return ZOOM_LEVELS[next];
}
