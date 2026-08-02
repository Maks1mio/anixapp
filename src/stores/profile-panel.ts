import { derived, get, writable } from 'svelte/store';

export type ProfileHistoryEntry = {
  id: number;
  login: string;
};

/** Правая панель профиля (как расписание). */
export const profilePanelOpen = writable(false);
export const profilePanelUserId = writable<number | null>(null);

/** Стек переходов между профилями внутри панели. */
export const profilePanelHistory = writable<ProfileHistoryEntry[]>([]);
export const profilePanelHistoryIndex = writable(0);

/** Внутренний экран активного профиля: обзор, друзья, редактирование или история ника. */
export type ProfilePanelInnerView = 'overview' | 'friends' | 'edit' | 'loginHistory';
export const profilePanelInnerView = writable<ProfilePanelInnerView>('overview');

export const profilePanelCanBack = derived(
  [profilePanelHistory, profilePanelHistoryIndex],
  ([$h, $i]) => $i > 0,
);
export const profilePanelCanForward = derived(
  [profilePanelHistory, profilePanelHistoryIndex],
  ([$h, $i]) => $i < $h.length - 1,
);

function emitOpen(userId: number): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('anix:profilePanelOpen', { detail: { userId } }));
  }
}

function setCurrentUser(id: number): void {
  profilePanelUserId.set(id);
  profilePanelOpen.set(true);
  emitOpen(id);
}

/** Сброс истории (при закрытии панели из Layout). */
export function resetProfilePanelHistory(): void {
  profilePanelHistory.set([]);
  profilePanelHistoryIndex.set(0);
  profilePanelInnerView.set('overview');
}

/**
 * Открыть профиль в панели.
 * Если этот id уже есть в истории — переключает на него (без дубля в крошках).
 */
export function openProfilePanel(userId?: number, opts?: { login?: string }): void {
  const id = userId ?? Number((window as { __anixProfile?: { id?: number } }).__anixProfile?.id ?? 0);
  if (!Number.isFinite(id) || id <= 0) return;

  const login = (opts?.login ?? '').trim();
  const open = get(profilePanelOpen);
  const currentId = get(profilePanelUserId);

  if (open && currentId === id) {
    if (login) updateProfilePanelLogin(id, login);
    return;
  }

  if (!open) {
    profilePanelHistory.set([{ id, login }]);
    profilePanelHistoryIndex.set(0);
    setCurrentUser(id);
    return;
  }

  const hist = get(profilePanelHistory);
  const existingIdx = hist.findIndex((e) => e.id === id);
  if (existingIdx >= 0) {
    if (login) updateProfilePanelLogin(id, login);
    profilePanelHistoryIndex.set(existingIdx);
    setCurrentUser(id);
    return;
  }

  const idx = get(profilePanelHistoryIndex);
  const next = hist.slice(0, idx + 1);
  next.push({ id, login });
  profilePanelHistory.set(next);
  profilePanelHistoryIndex.set(next.length - 1);
  setCurrentUser(id);
}

/**
 * Открыть / закрыть панель для профиля.
 * Если панель уже показывает этого пользователя — закрывает.
 */
export function toggleProfilePanel(userId?: number, opts?: { login?: string }): void {
  const id = userId ?? Number((window as { __anixProfile?: { id?: number } }).__anixProfile?.id ?? 0);
  if (!Number.isFinite(id) || id <= 0) return;

  if (get(profilePanelOpen) && get(profilePanelUserId) === id) {
    closeProfilePanel();
    return;
  }
  openProfilePanel(id, opts);
}

export function profilePanelBack(): void {
  const idx = get(profilePanelHistoryIndex);
  if (idx <= 0) return;
  const next = idx - 1;
  const entry = get(profilePanelHistory)[next];
  if (!entry) return;
  profilePanelHistoryIndex.set(next);
  setCurrentUser(entry.id);
}

export function profilePanelForward(): void {
  const hist = get(profilePanelHistory);
  const idx = get(profilePanelHistoryIndex);
  if (idx >= hist.length - 1) return;
  const next = idx + 1;
  const entry = hist[next];
  if (!entry) return;
  profilePanelHistoryIndex.set(next);
  setCurrentUser(entry.id);
}

/** Перейти к записи истории по индексу (клик по нику). */
export function profilePanelGoTo(index: number): void {
  const hist = get(profilePanelHistory);
  if (index < 0 || index >= hist.length) return;
  if (index === get(profilePanelHistoryIndex)) return;
  const entry = hist[index];
  if (!entry) return;
  profilePanelHistoryIndex.set(index);
  setCurrentUser(entry.id);
}

/** Обновить логин в истории после загрузки профиля. */
export function updateProfilePanelLogin(userId: number, login: string): void {
  const name = login.trim();
  if (!name) return;
  profilePanelHistory.update((hist) =>
    hist.map((e) => (e.id === userId ? { ...e, login: name } : e)),
  );
}

export function closeProfilePanel(): void {
  profilePanelOpen.set(false);
  profilePanelUserId.set(null);
  resetProfilePanelHistory();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('anix:profilePanelClose'));
  }
}

export function setProfilePanelInnerView(view: ProfilePanelInnerView): void {
  profilePanelInnerView.set(view);
}

export function isProfilePanelOpen(): boolean {
  return get(profilePanelOpen);
}
