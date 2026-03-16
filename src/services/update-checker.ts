const GITHUB_RELEASES_URL = 'https://api.github.com/repos/Maks1mio/anixapp/releases/latest';

export interface UpdateInfo {
  version: string;
  url: string;
  body: string | null;
}

function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/** При ошибке (404, сеть, неверный JSON) возвращаем null — обновление не показываем. */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return null; // 404, 500 и т.д. — не показывать обновление
    const data = (await res.json()) as { tag_name?: string; html_url?: string; body?: string | null };
    const latest = (data.tag_name ?? data.name ?? '').replace(/^v/i, '').trim();
    const url = data.html_url ?? `https://github.com/Maks1mio/anixapp/releases`;
    if (!latest || !isNewerVersion(latest, currentVersion)) return null;
    return {
      version: latest,
      url,
      body: typeof data.body === 'string' ? data.body : null,
    };
  } catch {
    return null;
  }
}
