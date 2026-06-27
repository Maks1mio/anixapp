import { resolveCdnAssetUrl } from '../../utils/posterUrl';

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
  return resolveCdnAssetUrl(raw);
}

export function isLottieBadgeUrl(url: string): boolean {
  return url.trim().toLowerCase().endsWith('.json');
}

/** «3 серия • 8 июн. в 17:31» для истории просмотра */
export function fmtHistoryEpisodeMeta(item: Record<string, unknown>): string {
  const ep = item.last_view_episode as { name?: string; position?: number } | undefined;
  let epLabel = '';
  if (ep?.name) {
    epLabel = ep.name;
  } else if (ep?.position) {
    epLabel = `${ep.position} серия`;
  }
  const ts = Number(item.last_view_timestamp ?? 0);
  if (!ts) return epLabel;

  const date = new Date(ts < 1e12 ? ts * 1000 : ts);
  const months = ['янв.', 'фев.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'нояб.', 'дек.'];
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const datePart = `${date.getDate()} ${months[date.getMonth()]} в ${time}`;
  return epLabel ? `${epLabel} • ${datePart}` : datePart;
}

/** «был(а) в сети 10 июн. в 01:40» */
export function fmtLastSeen(ts: number): string {
  if (!ts) return '';
  const date = new Date(ts < 1e12 ? ts * 1000 : ts);
  const months = ['янв.', 'фев.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'нояб.', 'дек.'];
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `был(а) в сети ${date.getDate()} ${months[date.getMonth()]} в ${time}`;
}
