import {
  iconCheck,
  iconClipboardList,
  iconCopy,
  iconFlag,
} from '../components/icons';
import type { UiV2PopupMenuItem } from '../components/uikit-v2/UiV2PopupMenu.svelte';
import { parseAltTitles } from './titleInfo';

export type ReleaseMenuListStatus =
  | 'watching'
  | 'planned'
  | 'completed'
  | 'dropped'
  | 'on_hold';

export const RELEASE_MENU_LIST_STATUSES: { id: ReleaseMenuListStatus; label: string }[] = [
  { id: 'watching', label: 'Смотрю' },
  { id: 'planned', label: 'В планах' },
  { id: 'completed', label: 'Просмотрено' },
  { id: 'dropped', label: 'Брошено' },
  { id: 'on_hold', label: 'Отложено' },
];

export function releasePublicUrl(releaseId: number | string): string {
  return `https://anixart-app.com/release/${releaseId}`;
}

export function releaseStatusMenuLabel(status: ReleaseMenuListStatus | null | undefined): string {
  if (!status) return 'Не смотрю';
  return RELEASE_MENU_LIST_STATUSES.find((s) => s.id === status)?.label ?? 'Не смотрю';
}

export function buildReleaseTitleCopyItems(opts: {
  title: string;
  titleOriginal?: string | null;
  titleAlt?: string | null;
  copiedId?: string | null;
}): UiV2PopupMenuItem[] {
  const title = opts.title.trim();
  const titleOriginal = opts.titleOriginal?.trim() || null;
  const titleOriginalClean =
    titleOriginal && titleOriginal !== title ? titleOriginal : null;
  const altTitles = parseAltTitles(opts.titleAlt).filter(
    (t) => t !== title && t !== titleOriginalClean,
  );
  const copiedId = opts.copiedId ?? null;
  const items: UiV2PopupMenuItem[] = [];

  if (title) {
    items.push({ id: 'titles-label-ru', label: 'Название', type: 'label' });
    items.push({
      id: 'copy-title-ru',
      label: copiedId === 'copy-title-ru' ? 'Скопировано' : title,
      icon: copiedId === 'copy-title-ru' ? iconCheck(16) : iconCopy(16),
      keepOpen: true,
    });
  }
  if (titleOriginalClean) {
    items.push({
      id: 'titles-label-orig',
      label: 'Оригинал',
      type: 'label',
      dividerBefore: true,
    });
    items.push({
      id: 'copy-title-orig',
      label: copiedId === 'copy-title-orig' ? 'Скопировано' : titleOriginalClean,
      icon: copiedId === 'copy-title-orig' ? iconCheck(16) : iconCopy(16),
      keepOpen: true,
    });
  }
  if (altTitles.length) {
    items.push({
      id: 'titles-label-alt',
      label: 'Альтернативные',
      type: 'label',
      dividerBefore: true,
    });
    for (let i = 0; i < altTitles.length; i++) {
      const id = `copy-title-alt-${i}`;
      items.push({
        id,
        label: copiedId === id ? 'Скопировано' : altTitles[i],
        icon: copiedId === id ? iconCheck(16) : iconCopy(16),
        keepOpen: true,
      });
    }
  }
  return items;
}

export function buildReleaseDefaultMenuItems(opts: {
  isFavorite: boolean;
  listStatus?: ReleaseMenuListStatus | null;
  releaseId?: number | string | null;
  title: string;
  titleOriginal?: string | null;
  titleAlt?: string | null;
  copiedId?: string | null;
}): UiV2PopupMenuItem[] {
  const listStatus = opts.listStatus ?? null;
  const copiedId = opts.copiedId ?? null;
  const items: UiV2PopupMenuItem[] = [
    {
      id: 'favorite',
      label: opts.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное',
      icon: iconFlag(18, opts.isFavorite),
      keepOpen: true,
    },
    {
      id: 'status',
      label: releaseStatusMenuLabel(listStatus),
      icon: iconClipboardList(18),
      dividerBefore: true,
      children: [
        {
          id: 'status-none',
          label: 'Не смотрю',
          type: 'radio',
          checked: listStatus == null,
          keepOpen: true,
        },
        ...RELEASE_MENU_LIST_STATUSES.map((s) => ({
          id: `status-${s.id}`,
          label: s.label,
          type: 'radio' as const,
          checked: listStatus === s.id,
          keepOpen: true,
        })),
      ],
    },
  ];

  if (opts.releaseId != null && String(opts.releaseId).trim() !== '') {
    items.push({
      id: 'copy-link',
      label: copiedId === 'copy-link' ? 'Скопировано' : 'Копировать ссылку',
      icon: copiedId === 'copy-link' ? iconCheck(18) : iconCopy(18),
      dividerBefore: true,
      keepOpen: true,
    });
  }

  const titleCopyItems = buildReleaseTitleCopyItems({
    title: opts.title,
    titleOriginal: opts.titleOriginal,
    titleAlt: opts.titleAlt,
    copiedId,
  });
  if (titleCopyItems.length) {
    items.push({
      id: 'titles',
      label: 'Названия',
      icon: iconCopy(18),
      children: titleCopyItems,
      submenuWide: true,
    });
  }

  return items;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
