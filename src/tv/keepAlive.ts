const CAT_PREFIX = 'home-cat:';
const RELEASE_PREFIX = 'release:';
const MAX_KEEP = 8;
const MAX_KEEP_ANDROID = 3;

function maxKeep(): number {
  if (typeof window !== 'undefined'
    && (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
    return MAX_KEEP_ANDROID;
  }
  return MAX_KEEP;
}

export function tvKeepAliveKey(path: string): string | null {
  const p = (path.split('?')[0] || '/').replace(/\/+$/, '') || '/';
  if (p === '/watch') return 'watch';
  const rel = p.match(/^\/release\/(\d+)$/);
  if (rel) return `${RELEASE_PREFIX}${rel[1]}`;
  if (p === '/') return 'home';
  const cat = p.match(/^\/home\/([^/]+)$/);
  if (cat) return `${CAT_PREFIX}${cat[1]}`;
  if (p === '/overview' || p === '/schedule') return 'overview';
  if (p === '/feed') return 'feed';
  if (p === '/overview/popular') return 'popular';
  if (p === '/bookmarks') return 'bookmarks';
  if (p === '/search') return 'search';
  return null;
}

export function rememberTvKeepAlive(kept: string[], path: string): string[] {
  const key = tvKeepAliveKey(path);
  if (!key || kept.includes(key)) return kept;

  const next = [...kept, key];
  while (next.length > maxKeep()) {
    const drop = next.findIndex((entry) => entry !== 'home');
    if (drop < 0) break;
    next.splice(drop, 1);
  }
  return next;
}

export function tvKeptCategoryIds(kept: string[]): string[] {
  return kept
    .filter((key) => key.startsWith(CAT_PREFIX))
    .map((key) => key.slice(CAT_PREFIX.length));
}

export function tvKeptReleaseIds(kept: string[]): string[] {
  return kept
    .filter((key) => key.startsWith(RELEASE_PREFIX))
    .map((key) => key.slice(RELEASE_PREFIX.length));
}

export function isTvReleasePath(path: string): boolean {
  return /^\/release\/\d+/.test((path.split('?')[0] || '/').replace(/\/+$/, '') || '/');
}

export function isTvWatchPath(path: string): boolean {
  return (path.split('?')[0] || '/').replace(/\/+$/, '') === '/watch';
}
