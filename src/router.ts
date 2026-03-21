/** Путь: в prod (file://) pathname — полный путь к файлу, поэтому опираемся на hash. Всегда с ведущим /. */
export function getPath(): string {
  const hash = window.location.hash || '';
  if (hash.startsWith('#/')) {
    const pathPart = hash.slice(2).split('?')[0]?.trim() || '';
    if (!pathPart) return '/';
    return pathPart.startsWith('/') ? pathPart : '/' + pathPart;
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return '/';
  }
  const p = window.location.pathname || '/';
  return p.startsWith('/') ? p : '/' + p;
}

/** Параметры страницы просмотра (из query в hash или из search) */
export function getWatchParams(): URLSearchParams {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const fromHash = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const fromSearch = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(fromHash || fromSearch);
}

/** Query-параметры страницы: в file:// они могут быть в hash (#/path?q=...) */
export function getSearchParams(): URLSearchParams {
  const hash = window.location.hash || '';
  const fromHash = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  if (fromHash) return new URLSearchParams(fromHash);
  return new URLSearchParams(window.location.search || '');
}
