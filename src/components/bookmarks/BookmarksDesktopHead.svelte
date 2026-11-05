<script lang="ts">
  import UiV2RoundButton from '../uikit-v2/UiV2RoundButton.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../uikit-v2/UiV2PopupMenu.svelte';
  import { iconMoreHorizontal, iconDownload, iconFolder, iconHome } from '../icons';

  type Props = {
    title: string;
    login: string;
    avatarUrl: string;
    /** Строка под заголовком: «Смотрю · 3 тайтла» */
    summary: string;
    /** Свои закладки — есть экспорт/импорт и вкладка по умолчанию */
    isSelf: boolean;
    tabs: { id: string; label: string }[];
    defaultTab: string;
    onProfileClick: (e: MouseEvent) => void;
    onSetDefaultTab: (id: string) => void;
    onExport: () => void;
    onImport: () => void;
  };

  let {
    title,
    login,
    avatarUrl,
    summary,
    isSelf,
    tabs,
    defaultTab,
    onProfileClick,
    onSetDefaultTab,
    onExport,
    onImport,
  }: Props = $props();

  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuBtn = $state<HTMLElement | null>(null);

  const menuItems = $derived<UiV2PopupMenuItem[]>([
    { id: 'export', label: 'Экспорт закладок', icon: iconDownload(18) },
    { id: 'import', label: 'Импорт из Shikimori', icon: iconFolder(18) },
    {
      id: 'default-tab',
      label: 'Вкладка по умолчанию',
      icon: iconHome(18),
      dividerBefore: true,
      children: tabs.map((t) => ({
        id: `default:${t.id}`,
        label: t.label,
        type: 'radio' as const,
        checked: t.id === defaultTab,
        keepOpen: false,
      })),
    },
  ]);

  function openMenu(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    menuX = (rect.left + rect.right) / 2;
    menuY = (rect.top + rect.bottom) / 2;
    menuOpen = !menuOpen;
  }

  function onSelect(id: string) {
    if (id === 'export') onExport();
    else if (id === 'import') onImport();
    else if (id.startsWith('default:')) onSetDefaultTab(id.slice('default:'.length));
  }
</script>

<header class="bm-head">
  <button type="button" class="bm-head__profile" onclick={onProfileClick}>
    <span
      class="bm-head__avatar"
      style={avatarUrl ? `background-image:url('${avatarUrl}')` : undefined}
      aria-hidden="true"
    ></span>
    <span class="bm-head__text">
      <span class="bm-head__title">{title}</span>
      <span class="bm-head__meta">
        {#if login}<span class="bm-head__login">{login}</span>{/if}
        {#if login && summary}<span class="bm-head__dot" aria-hidden="true">·</span>{/if}
        {#if summary}<span>{summary}</span>{/if}
      </span>
    </span>
  </button>

  {#if isSelf}
    <div class="bm-head__actions" bind:this={menuBtn}>
      <UiV2RoundButton
        size="lg"
        label="Ещё"
        ariaHaspopup="menu"
        ariaExpanded={menuOpen}
        onclick={openMenu}
      >
        {@html iconMoreHorizontal(20)}
      </UiV2RoundButton>
    </div>
  {/if}
</header>

<UiV2PopupMenu
  open={menuOpen}
  x={menuX}
  y={menuY}
  placement="anchor"
  dropdown
  anchor={menuBtn}
  items={menuItems}
  onClose={() => (menuOpen = false)}
  {onSelect}
/>
