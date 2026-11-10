/**
 * Обновление мобильной сборки: последний релиз GitHub (Anixapp-Community/anixapp) и его APK «AnixApp-Mobile-*.apk».
 * Обновление предлагается, если версия в релизе отличается от установленной и не старше её.
 * Скачивание и установка — через плагин AnixUpdater; без него открывается страница релиза.
 */
import { get, writable } from 'svelte/store';
import { cancelApkDownload, canInstallApk, downloadApk, hasNativeUpdater, installApk } from '../native/anix-updater';
import { requestOpenExternal } from '../utils/external-link';
import { showToast } from './toast';

export const RELEASES_URL = 'https://github.com/Anixapp-Community/anixapp/releases';
const LATEST_API = 'https://api.github.com/repos/Anixapp-Community/anixapp/releases/latest';
const CACHE_KEY = 'anixapp:mobile-update-cache';
const DISMISS_KEY = 'anixapp:mobile-update-dismissed';
const CACHE_TTL_MS = 30 * 60 * 1000;

export type MobileRelease = {
  version: string;
  tag: string;
  url: string;
  publishedAt: string | null;
  body: string | null;
  apkUrl: string | null;
  apkName: string | null;
  apkSize: number;
};

export type MobileUpdateState = {
  status: 'idle' | 'checking' | 'ready' | 'error';
  checkedAt: number | null;
  latest: MobileRelease | null;
  /** Есть версия новее/другая, чем установлена, и у неё есть APK */
  available: boolean;
  error: string | null;
  download: { state: 'idle' | 'downloading' | 'downloaded' | 'error'; percent: number; received: number; total: number; path: string | null };
  dismissed: string | null;
};

export const currentAppVersion = String(__ANIXAPP_VERSION__ || '').replace(/^v/i, '').trim();

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export const mobileUpdate = writable<MobileUpdateState>({
  status: 'idle',
  checkedAt: null,
  latest: null,
  available: false,
  error: null,
  download: { state: 'idle', percent: 0, received: 0, total: 0, path: null },
  dismissed: readDismissed(),
});

function core(v: string): number[] {
  return v.replace(/^v/i, '').split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
}

/** <0 — a старше b, 0 — номера равны, >0 — a новее. */
function compareCore(a: string, b: string): number {
  const x = core(a);
  const y = core(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function isDifferentVersion(latest: string, current: string): boolean {
  if (!latest || !current) return false;
  if (latest === current) return false;
  return compareCore(latest, current) >= 0;
}

function parseRelease(data: Record<string, unknown>): MobileRelease | null {
  const tag = String(data.tag_name ?? '');
  const assets = Array.isArray(data.assets) ? (data.assets as Record<string, unknown>[]) : [];
  const apk = assets.find((a) => /^AnixApp-Mobile-.*\.apk$/i.test(String(a.name ?? '')));
  const fromAsset = apk ? String(apk.name).match(/^AnixApp-Mobile-(.+?)(?:-alpha|-beta)?\.apk$/i)?.[1] : null;
  const version = (fromAsset || tag).replace(/^v/i, '').trim();
  if (!version) return null;
  return {
    version,
    tag,
    url: typeof data.html_url === 'string' ? data.html_url : RELEASES_URL,
    publishedAt: typeof data.published_at === 'string' ? data.published_at : null,
    body: typeof data.body === 'string' ? data.body : null,
    apkUrl: apk && typeof apk.browser_download_url === 'string' ? apk.browser_download_url : null,
    apkName: apk ? String(apk.name) : null,
    apkSize: apk && typeof apk.size === 'number' ? apk.size : 0,
  };
}

function applyLatest(latest: MobileRelease | null, checkedAt: number) {
  mobileUpdate.update((s) => ({
    ...s,
    status: 'ready',
    checkedAt,
    latest,
    error: null,
    available: !!latest?.apkUrl && isDifferentVersion(latest.version, currentAppVersion),
  }));
}

let inflight: Promise<void> | null = null;

export function checkMobileUpdate(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as { at: number; latest: MobileRelease } | null;
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        applyLatest(cached.latest, cached.at);
        return Promise.resolve();
      }
    } catch {
      // ignore
    }
  }
  mobileUpdate.update((s) => ({ ...s, status: 'checking', error: null }));
  inflight = (async () => {
    try {
      const res = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(res.status === 403 ? 'GitHub временно ограничил запросы' : `GitHub ответил ${res.status}`);
      const latest = parseRelease((await res.json()) as Record<string, unknown>);
      const at = Date.now();
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at, latest }));
      } catch {
        // ignore
      }
      applyLatest(latest, at);
    } catch (e) {
      mobileUpdate.update((s) => ({
        ...s,
        status: 'error',
        error: e instanceof Error ? e.message : 'Не удалось проверить обновления',
      }));
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function installMobileUpdate(): Promise<void> {
  const s = get(mobileUpdate);
  const latest = s.latest;
  if (!latest?.apkUrl) {
    requestOpenExternal(latest?.url ?? RELEASES_URL);
    return;
  }
  if (!hasNativeUpdater()) {
    requestOpenExternal(latest.apkUrl);
    return;
  }
  if (s.download.state === 'downloading') return;

  let path = s.download.state === 'downloaded' ? s.download.path : null;
  if (!path) {
    mobileUpdate.update((st) => ({
      ...st,
      download: { state: 'downloading', percent: 0, received: 0, total: latest.apkSize, path: null },
    }));
    try {
      path = await downloadApk(latest.apkUrl, latest.apkName ?? `AnixApp-Mobile-${latest.version}.apk`, (p) => {
        mobileUpdate.update((st) => ({
          ...st,
          download: {
            ...st.download,
            percent: p.percent >= 0 ? p.percent : st.download.percent,
            received: p.received,
            total: p.total > 0 ? p.total : st.download.total,
          },
        }));
      });
      mobileUpdate.update((st) => ({ ...st, download: { ...st.download, state: 'downloaded', percent: 100, path } }));
    } catch (e) {
      const cancelled = (e as { code?: string })?.code === 'CANCELLED' || String((e as Error)?.message) === 'cancelled';
      mobileUpdate.update((st) => ({
        ...st,
        download: { state: cancelled ? 'idle' : 'error', percent: 0, received: 0, total: 0, path: null },
      }));
      if (!cancelled) showToast('Не удалось скачать обновление', 'err');
      return;
    }
  }
  try {
    const res = await installApk(path);
    if (res.needsPermission) {
      showToast('Разрешите установку приложений для AnixApp — установка продолжится сама', 'info', 5000);
      resumeInstallAfterPermission(path);
    }
  } catch {
    mobileUpdate.update((st) => ({ ...st, download: { state: 'idle', percent: 0, received: 0, total: 0, path: null } }));
    showToast('Не удалось открыть установщик', 'err');
  }
}

/**
 * Вернулись с экрана «Установка неизвестных приложений»: если разрешение дали — сразу открываем установщик.
 * Не дали — ничего не делаем (иначе экран настроек открывался бы снова и снова).
 */
let resumeHandler: (() => void) | null = null;
function resumeInstallAfterPermission(path: string): void {
  if (resumeHandler) document.removeEventListener('visibilitychange', resumeHandler);
  const handler = () => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', handler);
    resumeHandler = null;
    void (async () => {
      if (!(await canInstallApk())) return;
      try {
        await installApk(path);
      } catch {
        showToast('Не удалось открыть установщик', 'err');
      }
    })();
  };
  resumeHandler = handler;
  document.addEventListener('visibilitychange', handler);
}

export function cancelMobileUpdate(): void {
  void cancelApkDownload();
}

export function dismissMobileUpdate(): void {
  const v = get(mobileUpdate).latest?.version ?? null;
  if (!v) return;
  try {
    localStorage.setItem(DISMISS_KEY, v);
  } catch {
    // ignore
  }
  mobileUpdate.update((s) => ({ ...s, dismissed: v }));
}

export function formatBytes(n: number): string {
  if (!n) return '';
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`;
}
