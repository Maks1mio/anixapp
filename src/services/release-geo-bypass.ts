/** Enrich geo-blocked release data via AnixBack server proxy (keeps is_view_blocked for UI warning). */

export async function enrichBlockedRelease(
  releaseId: number,
  raw: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!raw.is_view_blocked) return raw;

  const fetchBypass = window.electron?.fetchReleaseGeoBypass;
  if (!fetchBypass) return raw;

  try {
    const data = await fetchBypass(releaseId) as { release?: Record<string, unknown> } | Record<string, unknown>;
    const bypass = (data && typeof data === 'object' && 'release' in data && data.release)
      ? data.release
      : data;
    if (bypass && typeof bypass === 'object') {
      return { ...bypass, is_view_blocked: true };
    }
  } catch {
    /* keep partial direct response */
  }

  return raw;
}
