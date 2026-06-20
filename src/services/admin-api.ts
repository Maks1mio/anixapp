import { getApiBase } from './anixback-endpoint';

let adminToken: string | null = null;

export function setAdminToken(token: string | null): void {
  adminToken = token;
}

export function getAdminToken(): string | null {
  return adminToken;
}

export { getApiBase };

/** Anixart profile ID of the app founder */
export const FOUNDER_ID = 487033;

export interface UserRole {
  id: number;
  name: string;
  color: string;
}

export interface UserRolesResult {
  permissions: string[];
  roles: UserRole[];
}

export interface PermissionDef {
  slug: string;
  name: string;
  description: string;
}

export interface StaffMember {
  userId: number;
  roleSlug: string;
  roleName: string;
  color: string;
  assignedAt: string;
  permissions: string[];
  hasPassword: boolean;
}

export interface AdminSessionResult extends UserRolesResult {
  token: string;
  userId?: number;
}

function adminHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Admin-Token': token,
  };
}

function mapError(code: string): string {
  const messages: Record<string, string> = {
    'no staff access': 'Нет доступа к команде. Попросите основателя выдать роль.',
    'invalid password': 'Неверный пароль',
    'password required': 'Введите пароль',
      'password not set': 'Пароль не задан. Попросите администратора установить пароль.',
    forbidden: 'Недостаточно прав',
    'password required (min 8 chars)': 'Пароль обязателен (минимум 8 символов)',
    'new_password required (min 8 chars)': 'Новый пароль — минимум 8 символов',
    'current_password and new_password (min 8) required': 'Укажите текущий и новый пароль (мин. 8 символов)',
  };
  return messages[code] ?? code;
}

async function parseError(res: Response): Promise<Error> {
  const err = await res.json().catch(() => ({ error: 'request failed' }));
  return new Error(mapError(err.error ?? 'request failed'));
}

export async function unlockAdminSession(input: {
  userId: number;
  deviceId?: string;
  password?: string;
}): Promise<AdminSessionResult> {
  const res = await fetch(`${getApiBase()}/admin/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: input.userId,
      device_id: input.deviceId,
      password: input.password,
    }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function validateAdminSession(token: string): Promise<AdminSessionResult | null> {
  try {
    const res = await fetch(`${getApiBase()}/admin/session`, {
      headers: { 'X-Admin-Token': token },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { token, userId: data.userId, permissions: data.permissions ?? [], roles: data.roles ?? [] };
  } catch {
    return null;
  }
}

export async function revokeAdminSession(token: string): Promise<void> {
  await fetch(`${getApiBase()}/admin/session`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': token },
  });
}

export async function fetchPermissionDefs(token: string): Promise<PermissionDef[]> {
  const res = await fetch(`${getApiBase()}/admin/permissions`, { headers: adminHeaders(token) });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function fetchStaffList(token: string): Promise<StaffMember[]> {
  const res = await fetch(`${getApiBase()}/admin/staff`, { headers: adminHeaders(token) });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function createStaffMember(
  token: string,
  input: {
    userId: number;
    roleSlug: 'admin' | 'editor';
    password: string;
    permissions?: string[];
  }
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/staff`, {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify({
      user_id: input.userId,
      role_slug: input.roleSlug,
      password: input.password,
      permissions: input.permissions,
    }),
  });
  if (!res.ok) throw await parseError(res);
}

export async function updateStaffMember(
  token: string,
  userId: number,
  patch: { roleSlug?: 'admin' | 'editor'; permissions?: string[] }
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/staff/${userId}`, {
    method: 'PATCH',
    headers: adminHeaders(token),
    body: JSON.stringify({
      role_slug: patch.roleSlug,
      permissions: patch.permissions,
    }),
  });
  if (!res.ok) throw await parseError(res);
}

export async function resetStaffPermissions(token: string, userId: number): Promise<string[]> {
  const res = await fetch(`${getApiBase()}/admin/staff/${userId}/reset-permissions`, {
    method: 'POST',
    headers: adminHeaders(token),
  });
  if (!res.ok) throw await parseError(res);
  const data = await res.json();
  return data.permissions ?? [];
}

export async function setStaffPassword(
  token: string,
  userId: number,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/staff/${userId}/password`, {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!res.ok) throw await parseError(res);
}

export async function changeOwnPassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/password`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  if (!res.ok) throw await parseError(res);
}

export async function removeStaff(token: string, userId: number): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/staff/${userId}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
  });
  if (!res.ok && res.status !== 204) throw await parseError(res);
}

export async function fetchUserRoles(userId: number): Promise<UserRolesResult> {
  try {
    const res = await fetch(`${getApiBase()}/users/${userId}/roles`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { permissions: [], roles: [] };
    const data = await res.json();
    return {
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
      roles: Array.isArray(data.roles)
        ? data.roles.map((r: UserRole) => ({ id: r.id, name: r.name, color: r.color }))
        : [],
    };
  } catch {
    return { permissions: [], roles: [] };
  }
}

export async function fetchUserPermissions(userId: number): Promise<string[]> {
  const data = await fetchUserRoles(userId);
  return data.permissions;
}

/** @deprecated use createStaffMember */
export async function assignStaff(
  token: string,
  userId: number,
  roleSlug: 'admin' | 'editor'
): Promise<void> {
  await createStaffMember(token, { userId, roleSlug, password: 'changeme1' });
}
