/** Split API title_alt into separate alternative titles. */
export function parseAltTitles(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,;|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
