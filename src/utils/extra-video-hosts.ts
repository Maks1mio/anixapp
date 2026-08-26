const STORAGE_KEY = 'anixapp.extraVideoHosts';
const MAX_HOSTS = 150;

function normalizeHost(raw: string): string {
  const h = String(raw || '').trim().replace(/^www\./, '').toLowerCase();
  if (!h || h.length > 253 || /[^a-z0-9.-]/.test(h)) return '';
  if (h === 'localhost' || h.endsWith('.localhost')) return '';
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) return '';
  return h;
}

export function hostsFromMediaUrl(url: string): string[] {
  let host = '';
  try { host = new URL(url).hostname; } catch { return []; }
  const n = normalizeHost(host);
  if (!n) return [];
  const out = [n];
  const parts = n.split('.');
  if (parts.length >= 3) {
    const parent = parts.slice(-2).join('.');
    if (parent && parent !== n) out.push(parent);
  }
  return out;
}

export function readExtraVideoHosts(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const h = normalizeHost(String(item));
      if (!h || seen.has(h)) continue;
      seen.add(h);
      out.push(h);
      if (out.length >= MAX_HOSTS) break;
    }
    return out;
  } catch {
    return [];
  }
}

function writeExtraVideoHosts(hosts: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hosts.slice(0, MAX_HOSTS)));
  } catch { /* quota / private mode */ }
}

/** Запоминает CDN ролика в localStorage. Возвращает, были ли новые хосты. */
export function rememberVideoCdnFromUrl(url: string): boolean {
  const incoming = hostsFromMediaUrl(url);
  if (!incoming.length) return false;
  const current = readExtraVideoHosts();
  const seen = new Set(current);
  let added = false;
  for (const h of incoming) {
    if (seen.has(h)) continue;
    seen.add(h);
    current.push(h);
    added = true;
  }
  if (added) writeExtraVideoHosts(current);
  return added;
}

export async function syncExtraVideoHostsToMain(): Promise<void> {
  const hosts = readExtraVideoHosts();
  try {
    await window.electron?.setExtraVideoHosts?.(hosts);
  } catch { /* no electron */ }
}
