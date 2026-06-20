let cachedProfileId: number | null = null;

export async function ensureProfileId(): Promise<number | null> {
  if (typeof cachedProfileId === 'number') return cachedProfileId;
  if (!window.anixApi) return null;
  const selfRes = (await window.anixApi.profile.self()) as Record<string, unknown>;
  const profile = (selfRes?.profile ?? selfRes) as Record<string, unknown>;
  const profileId = profile?.id ?? profile?.['@id'];
  if (typeof profileId === 'number') cachedProfileId = profileId;
  return typeof profileId === 'number' ? profileId : null;
}

export function clearCachedProfileId(): void {
  cachedProfileId = null;
}
