/**
 * Экспорт закладок как в Anixart (Настройки → Данные): сервер отдаёт релизы выбранных
 * списков, таблицу CSV или текстовый файл собирает клиент.
 */

/** profile_lists_values из Anixart: 0 — избранное, 1–5 — статусы. */
export const EXPORT_PROFILE_LISTS = [
  { value: 0, label: 'Избранное' },
  { value: 1, label: 'Смотрю' },
  { value: 2, label: 'В планах' },
  { value: 3, label: 'Просмотрено' },
  { value: 4, label: 'Отложено' },
  { value: 5, label: 'Брошено' },
] as const;

/** Дополнительные столбцы (индексы как в Anixart). */
export const EXPORT_EXTRA_FIELDS = [
  { value: 0, label: 'Оригинальное название' },
  { value: 1, label: 'Альтернативные названия' },
  { value: 2, label: 'Избранное и статус просмотра' },
  { value: 3, label: 'Моя оценка' },
] as const;

/** sort в export/bookmarks. */
export const EXPORT_SORTS = [
  { value: 0, label: 'По названию' },
  { value: 1, label: 'По статусу просмотра' },
  { value: 2, label: 'По оценке' },
] as const;

export type ExportFormat = 'csv' | 'txt';

const LIST_STATUS: Record<number, string> = {
  1: 'Смотрю',
  2: 'В планах',
  3: 'Просмотрено',
  4: 'Отложено',
  5: 'Брошено',
};

type ExportRelease = {
  title_ru?: string | null;
  title_original?: string | null;
  title_alt?: string | null;
  is_favorite?: boolean;
  profile_list_status?: number | null;
  your_vote?: number | null;
};

function quoted(value: string): string {
  // CSV: кавычки внутри значения удваиваются
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildBookmarksExport(
  releases: unknown[],
  format: ExportFormat,
  extraFields: number[],
): string {
  const txt = format === 'txt';
  const withOriginal = extraFields.includes(0);
  const withAlt = extraFields.includes(1);
  const withStatus = extraFields.includes(2);
  const withVote = extraFields.includes(3);

  const header = ['#', 'Русское название'];
  if (withOriginal) header.push('Оригинальное название');
  if (withAlt) header.push('Альтернативные названия');
  if (withStatus) header.push('Добавлено в избранное', 'Статус просмотра');
  if (withVote) header.push('Моя оценка');

  const rows = releases.map((raw, i) => {
    const r = (raw ?? {}) as ExportRelease;
    const row = [String(i + 1)];
    const ru = r.title_ru?.trim();
    row.push(ru ? quoted(ru) : txt ? 'Не указано русское название' : 'Не указано');
    if (withOriginal) {
      const orig = r.title_original?.trim();
      row.push(orig ? quoted(orig) : txt ? 'Не указано оригинальное название' : 'Не указано');
    }
    if (withAlt) {
      const alt = r.title_alt?.trim();
      row.push(alt ? quoted(alt.replace(/\n/g, ', ')) : txt ? 'Не указаны альтернативные названия' : 'Не указаны');
    }
    if (withStatus) {
      if (r.is_favorite) row.push(txt ? 'В избранном' : 'Добавлено');
      else row.push(txt ? 'Не добавлено в избранное' : 'Не добавлено');
      row.push(LIST_STATUS[r.profile_list_status ?? 0] ?? 'Не смотрю');
    }
    if (withVote) {
      row.push(typeof r.your_vote === 'number' ? `${r.your_vote} из 5` : 'Не оценено');
    }
    return row;
  });

  if (txt) return rows.map((row) => row.join(' / ')).join('\n') + '\n';
  return [header, ...rows].map((row) => row.join(',')).join('\n') + '\n';
}

export function downloadTextFile(text: string, fileName: string, mime: string): void {
  // BOM — чтобы Excel открыл кириллицу в CSV без кракозябр
  const blob = new Blob(['﻿', text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
