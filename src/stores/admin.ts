import { writable, get } from 'svelte/store';
import { navigate } from './navigation';
import {
  unlockAdminSession,
  validateAdminSession,
  revokeAdminSession,
  setAdminToken,
  fetchUserRoles,
  FOUNDER_ID,
  type AdminSessionResult,
} from '../services/admin-api';

export const adminMode = writable(false);
export const adminPermissions = writable<string[]>([]);
export const adminRoles = writable<AdminSessionResult['roles']>([]);
/** Пользователь в списке команды (есть роль на бэкенде) */
export const isTeamMember = writable(false);

let sessionToken: string | null = null;

export function getAdminToken(): string | null {
  return sessionToken;
}

function applySession(data: AdminSessionResult): void {
  sessionToken = data.token;
  setAdminToken(data.token);
  adminMode.set(true);
  adminPermissions.set(data.permissions ?? []);
  adminRoles.set(data.roles ?? []);
}

async function persistSession(token: string, userId: number): Promise<void> {
  await window.electron?.adminSaveSession?.({ token, userId });
}

async function clearPersistedSession(): Promise<void> {
  await window.electron?.adminClearSession?.();
}

export async function restoreAdminSession(): Promise<boolean> {
  const saved = await window.electron?.adminGetSession?.();
  if (!saved?.token) return false;
  const valid = await validateAdminSession(saved.token);
  if (!valid) {
    await clearPersistedSession();
    return false;
  }
  applySession(valid);
  return true;
}

export async function unlockAdmin(password?: string): Promise<void> {
  const profile = (window as any).__anixProfile as { id?: number } | undefined;
  const userId = profile?.id;
  if (!userId) throw new Error('not logged in');

  const deviceId = await window.electron?.getDeviceId?.();
  const result = await unlockAdminSession({ userId, deviceId, password });
  applySession(result);
  await persistSession(result.token, userId);
}

export async function logoutAdminMode(): Promise<void> {
  if (sessionToken) {
    await revokeAdminSession(sessionToken).catch(() => {});
  }
  sessionToken = null;
  setAdminToken(null);
  adminMode.set(false);
  adminPermissions.set([]);
  adminRoles.set([]);
  await clearPersistedSession();
}

export function openAdminArea(): void {
  if (get(adminMode)) navigate('/admin/panel');
  else navigate('/admin');
}

export async function checkTeamMembership(): Promise<boolean> {
  const profile = (window as any).__anixProfile as { id?: number } | undefined;
  const rawId = profile?.id;
  const userId = typeof rawId === 'number' ? rawId : Number(rawId);
  if (!Number.isFinite(userId) || userId <= 0) {
    isTeamMember.set(false);
    return false;
  }
  if (userId === FOUNDER_ID) {
    isTeamMember.set(true);
    return true;
  }
  try {
    const { roles } = await fetchUserRoles(userId);
    const member = roles.length > 0;
    isTeamMember.set(member);
    return member;
  } catch {
    isTeamMember.set(false);
    return false;
  }
}
