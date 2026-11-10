<script lang="ts">
  import UiV2PopupMenu from './uikit-v2/UiV2PopupMenu.svelte';
  import {
    iconBan,
    iconCopy,
    iconEye,
    iconEyeOff,
    iconLoginHistory,
    iconShare,
  } from './icons';

  export type ProfileMoreAction =
    | 'loginHistory'
    | 'share'
    | 'copyLink'
    | 'muteBlog'
    | 'block';

  interface Props {
    isMyProfile: boolean;
    /** Блог профиля уже скрыт из ленты. */
    blogMuted?: boolean;
    /** Пользователь уже в чёрном списке. */
    blocked?: boolean;
    onClose: () => void;
    onAction: (id: ProfileMoreAction) => void;
  }

  let { isMyProfile, blogMuted = false, blocked = false, onClose, onAction }: Props = $props();

  type Item = {
    id: ProfileMoreAction;
    label: string;
    icon: string;
    danger?: boolean;
  };

  const items = $derived.by((): Item[] => {
    const base: Item[] = [
      { id: 'loginHistory', label: 'История никнейма', icon: iconLoginHistory(22) },
      { id: 'share', label: 'Поделиться', icon: iconShare(22) },
      { id: 'copyLink', label: 'Скопировать ссылку', icon: iconCopy(22) },
    ];
    if (isMyProfile) return base;
    return [
      ...base,
      {
        id: 'muteBlog',
        label: blogMuted ? 'Отменить скрытие блога' : 'Скрыть блог из ленты',
        icon: blogMuted ? iconEye(22) : iconEyeOff(22),
      },
      { id: 'block', label: blocked ? 'Разблокировать' : 'Заблокировать', icon: iconBan(22), danger: true },
    ];
  });
</script>

<!-- Меню само вызывает onClose после выбора -->
<UiV2PopupMenu
  open
  sheet
  sheetInPlace
  x={0}
  y={0}
  {items}
  {onClose}
  onSelect={(id) => onAction(id as ProfileMoreAction)}
/>
