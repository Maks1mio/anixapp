<script lang="ts">
  import { showToast } from '../stores/toast';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from './uikit-v2/UiV2PopupMenu.svelte';
  import {
    listSocialLinks,
    openSocialLink,
    SOCIAL_ICONS,
    type ProfileSocialPages,
    type ProfileSocialLink,
  } from '../utils/profile-social';

  interface Props {
    pages: ProfileSocialPages;
    onClose: () => void;
  }

  let { pages, onClose }: Props = $props();

  const links = $derived(listSocialLinks(pages));
  // keepOpen: закрывает onSelect — при ошибке копирования шторка остаётся
  const menuItems = $derived(links.map((link): UiV2PopupMenuItem => ({
    id: link.id,
    label: link.label,
    icon: SOCIAL_ICONS[link.id],
    keepOpen: true,
  })));

  async function onSelect(link: ProfileSocialLink) {
    const result = await openSocialLink(link);
    if (result === 'copied') showToast(`Discord: ${link.value} скопирован`);
    else if (result === 'error' && link.copy) showToast('Не удалось скопировать', 'err');
    if (result !== 'error' || !link.copy) onClose();
  }
</script>

<UiV2PopupMenu
  open
  sheet
  sheetInPlace
  x={0}
  y={0}
  title="Отправить сообщение"
  items={menuItems}
  emptyLabel="Соцсети скрыты или не указаны"
  {onClose}
  onSelect={(id) => {
    const link = links.find((row) => row.id === id);
    if (link) void onSelect(link);
  }}
/>
