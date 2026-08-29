export type TvLanCredentials = { login: string; password: string };

type AnixTvLanNative = {
  start?: () => string;
  stop?: () => void;
  getUrl?: () => string;
};

function nativeBridge(): AnixTvLanNative | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { AnixTvLan?: AnixTvLanNative }).AnixTvLan ?? null;
}

export async function startTvLanLogin(): Promise<{ url: string | null; error?: string }> {
  const native = nativeBridge();
  if (native?.start) {
    try {
      const url = String(native.start() || '').trim();
      return url ? { url } : { url: null, error: 'no_url' };
    } catch (err) {
      return { url: null, error: String(err) };
    }
  }

  const electron = window.electron;
  if (electron?.startTvLanLogin) {
    try {
      return await electron.startTvLanLogin();
    } catch (err) {
      return { url: null, error: String(err) };
    }
  }

  return { url: null, error: 'unavailable' };
}

export async function stopTvLanLogin(): Promise<void> {
  nativeBridge()?.stop?.();
  await window.electron?.stopTvLanLogin?.();
}

export function subscribeTvLanCredentials(onCreds: (creds: TvLanCredentials) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<TvLanCredentials>).detail;
    const login = String(detail?.login ?? '').trim();
    const password = String(detail?.password ?? '');
    if (login && password) onCreds({ login, password });
  };
  window.addEventListener('anix:tv-lan-login', handler);

  const offElectron = window.electron?.onTvLanCredentials?.((detail) => {
    const login = String(detail?.login ?? '').trim();
    const password = String(detail?.password ?? '');
    if (login && password) onCreds({ login, password });
  });

  return () => {
    window.removeEventListener('anix:tv-lan-login', handler);
    offElectron?.();
  };
}
