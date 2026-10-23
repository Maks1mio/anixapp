/**
 * Настройки приложения (плеер, апскейл, звук …): в Electron — через main-процесс,
 * в вебе / мобильной сборке — в localStorage под тем же контрактом AppSettings.
 */
import type { AppSettings } from '../types/electron';

const STORAGE_KEY = 'anix:appSettings';

function readLocal(): Partial<AppSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Есть ли где хранить настройки (Electron или localStorage). */
export function hasAppSettingsStore(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.electron?.getSettings) return true;
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export async function loadAppSettings(): Promise<Partial<AppSettings>> {
  if (typeof window === 'undefined') return {};
  if (window.electron?.getSettings) return (await window.electron.getSettings()) ?? {};
  return readLocal();
}

export function saveAppSettings(patch: Partial<AppSettings>): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.electron?.saveSettings) return window.electron.saveSettings(patch);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readLocal(), ...patch }));
  } catch {}
  return Promise.resolve();
}
