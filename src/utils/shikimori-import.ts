import type { BookmarksImportBody } from '../types/api';

/** Списки Anixart, в которые можно положить «Пересматриваю» (его в Anixart нет). */
export type ImportTargetList = 'watching' | 'plans' | 'completed' | 'holdOn' | 'dropped';

export const IMPORT_TARGET_LISTS: { value: ImportTargetList; label: string }[] = [
  { value: 'watching', label: 'Смотрю' },
  { value: 'plans', label: 'В планах' },
  { value: 'completed', label: 'Просмотрено' },
  { value: 'holdOn', label: 'Отложено' },
  { value: 'dropped', label: 'Брошено' },
];

export type ShikimoriParsed = {
  watching: number[];
  plans: number[];
  completed: number[];
  holdOn: number[];
  dropped: number[];
  rewatching: number[];
};

const STATUS_TO_LIST: Record<string, keyof ShikimoriParsed> = {
  watching: 'watching',
  planned: 'plans',
  completed: 'completed',
  on_hold: 'holdOn',
  dropped: 'dropped',
  rewatching: 'rewatching',
};

/** Разбор JSON-выгрузки Shikimori (Профиль → Список аниме и манги → Экспорт → JSON). */
export function parseShikimoriExport(text: string): ShikimoriParsed {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('not-array');
  const out: ShikimoriParsed = { watching: [], plans: [], completed: [], holdOn: [], dropped: [], rewatching: [] };
  for (const row of data) {
    if (!row || typeof row !== 'object') throw new Error('not-object');
    const rec = row as Record<string, unknown>;
    const id = Number(rec.target_id);
    const list = STATUS_TO_LIST[String(rec.status ?? '')];
    if (!Number.isFinite(id) || id <= 0 || !list) continue;
    out[list].push(id);
  }
  return out;
}

export function countShikimori(parsed: ShikimoriParsed): number {
  return Object.values(parsed).reduce((sum, ids) => sum + ids.length, 0);
}

export function buildImportBody(parsed: ShikimoriParsed, rewatchingTo: ImportTargetList): BookmarksImportBody {
  const body: BookmarksImportBody = {
    watching: [...parsed.watching],
    plans: [...parsed.plans],
    completed: [...parsed.completed],
    holdOn: [...parsed.holdOn],
    dropped: [...parsed.dropped],
    selected_importer_name: 'Shikimori',
  };
  body[rewatchingTo].push(...parsed.rewatching);
  for (const key of ['watching', 'plans', 'completed', 'holdOn', 'dropped'] as const) {
    body[key] = [...new Set(body[key])];
  }
  return body;
}
