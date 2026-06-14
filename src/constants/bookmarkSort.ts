/** Значения sort из API Anixart (как в мобильном приложении). */
export const BOOKMARK_SORT_OPTIONS = [
  { value: 1, label: 'По добавлению', desc: 'От новых к старым' },
  { value: 2, label: 'По добавлению', desc: 'От старых к новым' },
  { value: 3, label: 'По году выхода', desc: 'От новых к старым' },
  { value: 4, label: 'По году выхода', desc: 'От старых к новым' },
  { value: 5, label: 'По названию', desc: 'От Я до А' },
  { value: 6, label: 'По названию', desc: 'От А до Я' },
  { value: 7, label: 'По рейтингу', desc: 'От высокого к низкому' },
  { value: 8, label: 'По рейтингу', desc: 'От низкого к высокому' },
] as const;

export const DEFAULT_BOOKMARK_SORT = 1;

export function bookmarkSortSelectOptions() {
  return BOOKMARK_SORT_OPTIONS.map((o) => ({
    value: String(o.value),
    label: o.label,
    desc: o.desc,
  }));
}

export function bookmarkSortShortLabel(sort: number): string {
  return BOOKMARK_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'По добавлению';
}

export function bookmarkSortTitle(sort: number): string {
  const o = BOOKMARK_SORT_OPTIONS.find((x) => x.value === sort);
  return o ? `${o.label} · ${o.desc}` : 'Сортировка';
}
