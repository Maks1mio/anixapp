export function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const d = Math.floor(h / 24);
  if (d >= 1) {
    const rem = h % 24;
    return rem > 0 ? `${d} д. ${rem} ч.` : `${d} д.`;
  }
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} ч. ${m} мин.` : `${m} мин.`;
}

export function fmtDate(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts < 1e12 ? ts * 1000 : ts);
  const months = ['янв.','фев.','мар.','апр.','мая','июн.','июл.','авг.','сен.','окт.','ноя.','дек.'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtRelative(ts: number): string {
  if (!ts) return '';
  const ms   = ts < 1e12 ? ts * 1000 : ts;
  const diff = Date.now() - ms;
  const min  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (min < 1)   return 'только что';
  if (min < 60)  return `${min} мин. назад`;
  if (hours < 24) return `${hours} ч. назад`;
  if (days < 7)  return `${days} д. назад`;
  return fmtDate(ts);
}

export function posterUrl(raw: string | undefined): string {
  if (!raw) return '';
  const s = raw.trim();
  if (!s || s === 'null') return '';
  if (s.startsWith('http')) return s;
  return `https://s.anixmirai.com/posters/${s}`;
}

export function isLottieBadgeUrl(url: string): boolean {
  return url.trim().toLowerCase().endsWith('.json');
}
