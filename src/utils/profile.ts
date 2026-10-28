import { resolveCdnAssetUrl } from './posterUrl';
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

/**
 * Свой профиль в window.__anixProfile ({ id, login, avatar }) — его читают значки, Anix+, панели.
 * Шлёт anix:profileUpdated; без профиля (гость) сбрасывает значение. Возвращает, найден ли профиль.
 */
export async function loadSelfProfileGlobal(): Promise<boolean> {
  const w = window as unknown as { __anixProfile?: { id?: number; login?: string; avatar: string | null } };
  if (!window.anixApi) return false;
  try {
    const data = (await window.anixApi.profile.self()) as { profile?: Record<string, unknown> } | undefined;
    const profile = data?.profile;
    if (!profile) {
      w.__anixProfile = undefined;
      window.dispatchEvent(new CustomEvent('anix:profileUpdated'));
      return false;
    }
    const pid = profile.id ?? profile['@id'];
    const idNum = typeof pid === 'number' ? pid : Number(pid);
    w.__anixProfile = {
      id: Number.isFinite(idNum) && idNum > 0 ? idNum : undefined,
      login: (profile.login ?? profile.nickname ?? undefined) as string | undefined,
      avatar: profile.avatar ? resolveCdnAssetUrl(String(profile.avatar)) : null,
    };
    window.dispatchEvent(new CustomEvent('anix:profileUpdated'));
    return true;
  } catch {
    return false;
  }
}

/** Локально обновить свой профиль (после смены аватара / ника) и разослать anix:profileUpdated. */
export function patchSelfProfileGlobal(patch: { avatar?: string | null; login?: string }): void {
  const w = window as unknown as { __anixProfile?: { id?: number; login?: string; avatar: string | null } };
  if (!w.__anixProfile) return;
  const next = { ...w.__anixProfile };
  if ('avatar' in patch) next.avatar = patch.avatar ? resolveCdnAssetUrl(String(patch.avatar)) : null;
  if (patch.login) next.login = patch.login;
  w.__anixProfile = next;
  window.dispatchEvent(new CustomEvent('anix:profileUpdated'));
}
