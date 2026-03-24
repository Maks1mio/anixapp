export const LIST_STATUSES = [
  { id: 'watching',  label: 'Смотрю' },
  { id: 'planned',   label: 'В планах' },
  { id: 'completed', label: 'Просмотрено' },
  { id: 'dropped',   label: 'Брошено' },
  { id: 'on_hold',   label: 'Отложено' },
] as const;

export type ListStatusId = (typeof LIST_STATUSES)[number]['id'];
