<script lang="ts">
  import {
    iconCopy,
    iconMessageCircle,
    iconMoreHorizontal,
    iconShare,
    iconStar,
  } from '../icons';
  import { showToast } from '../../stores/toast';
  import UiV2RoundButton from './UiV2RoundButton.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from './UiV2PopupMenu.svelte';

  export type UiV2DiscussItem = {
    id: number | string;
    title: string;
    titleOriginal?: string | null;
    posterUrl?: string | null;
    episodes?: string | number | null;
    year?: string | number | null;
    country?: string | null;
    rating?: number | null;
    ratingCount?: number | string | null;
    description?: string | null;
    commentCount: number;
  };

  type Props = {
    items: UiV2DiscussItem[];
    moreLabel?: string;
    menuItems?: UiV2PopupMenuItem[] | ((item: UiV2DiscussItem) => UiV2PopupMenuItem[]);
    onclick?: (item: UiV2DiscussItem) => void;
    onMore?: (item: UiV2DiscussItem, e: MouseEvent) => void;
    onMenuSelect?: (id: string, item: UiV2DiscussItem) => void;
    class?: string;
  };

  let {
    items,
    moreLabel = 'Ещё',
    menuItems,
    onclick,
    onMore,
    onMenuSelect,
    class: className = '',
  }: Props = $props();

  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuItemId = $state<number | string | null>(null);
  let copiedTitleId = $state<string | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  const menuItem = $derived(
    menuItemId == null ? null : (items.find((i) => i.id === menuItemId) ?? null),
  );

  function defaultMenuFor(item: UiV2DiscussItem): UiV2PopupMenuItem[] {
    const items: UiV2PopupMenuItem[] = [
      {
        id: 'share',
        label: 'Поделиться',
        icon: iconShare(18),
        children: [
          { id: 'copy-link', label: 'Копировать ссылку', icon: iconCopy(16), keepOpen: true },
          { id: 'copy-title', label: 'Копировать название', icon: iconCopy(16), keepOpen: true },
        ],
      },
    ];

    const titles: UiV2PopupMenuItem[] = [
      {
        id: 'copy-title-ru',
        label: item.title,
        icon: iconCopy(16),
        keepOpen: true,
      },
    ];
    const orig = item.titleOriginal?.trim();
    if (orig && orig !== item.title.trim()) {
      titles.push({
        id: 'copy-title-orig',
        label: orig,
        icon: iconCopy(16),
        keepOpen: true,
      });
    }
    if (titles.length) {
      items.push({
        id: 'titles',
        label: 'Названия',
        icon: iconCopy(18),
        children: titles.map((t) =>
          copiedTitleId === t.id ? { ...t, label: 'Скопировано' } : t,
        ),
        submenuWide: true,
      });
    }

    return items;
  }

  const resolvedMenu = $derived.by((): UiV2PopupMenuItem[] => {
    if (!menuItem) return [];
    if (typeof menuItems === 'function') return menuItems(menuItem);
    if (menuItems) return menuItems;
    return defaultMenuFor(menuItem);
  });

  const hasMenu = true;

  function ratingText(value: number | null | undefined): string | null {
    if (value == null || Number.isNaN(value)) return null;
    return Number.isInteger(value) ? value.toFixed(1) : String(Math.round(value * 100) / 100);
  }

  function formatComments(n: number): string {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    let word = 'комментариев';
    if (abs > 10 && abs < 20) word = 'комментариев';
    else if (last === 1) word = 'комментарий';
    else if (last >= 2 && last <= 4) word = 'комментария';
    return `${n.toLocaleString('ru-RU')} ${word}`;
  }

  function withEllipsis(text: string): string {
    const t = text.trim();
    if (!t) return t;
    if (/(?:\.\.\.|…)$/.test(t)) return t;
    return `${t}...`;
  }

  function metaLine(item: UiV2DiscussItem): string {
    return [item.episodes, item.year != null && item.year !== '' ? String(item.year) : null, item.country]
      .filter(Boolean)
      .join(' · ');
  }

  function openMenuAt(item: UiV2DiscussItem, clientX: number, clientY: number) {
    menuItemId = item.id;
    menuX = clientX;
    menuY = clientY;
    menuOpen = true;
  }

  function stopMore(item: UiV2DiscussItem, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onMore?.(item, e);
    if (!hasMenu) return;
    const btn = e.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    openMenuAt(item, r.left + r.width / 2, r.bottom + 4);
  }

  function onContextMenu(item: UiV2DiscussItem, e: MouseEvent) {
    if (!hasMenu) return;
    e.preventDefault();
    e.stopPropagation();
    openMenuAt(item, e.clientX, e.clientY);
  }

  function onActivate(item: UiV2DiscussItem) {
    if (menuOpen && menuItemId === item.id) return;
    onclick?.(item);
  }

  function onCardKeydown(item: UiV2DiscussItem, e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate(item);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function markCopied(id: string) {
    copiedTitleId = id;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      if (copiedTitleId === id) copiedTitleId = null;
      copyTimer = null;
    }, 1400);
  }

  async function handleMenuSelect(id: string) {
    const item = menuItem;
    if (!item) return;

    if (id === 'copy-title' || id === 'copy-title-ru') {
      const ok = await copyText(item.title.trim());
      if (ok) {
        markCopied(id === 'copy-title' ? 'copy-title-ru' : id);
        showToast('Название скопировано');
      }
      onMenuSelect?.(id, item);
      return;
    }
    if (id === 'copy-title-orig' && item.titleOriginal?.trim()) {
      const ok = await copyText(item.titleOriginal.trim());
      if (ok) {
        markCopied(id);
        showToast('Оригинальное название скопировано');
      }
      onMenuSelect?.(id, item);
      return;
    }
    if (id === 'copy-link') {
      showToast('Ссылка скопирована');
      onMenuSelect?.(id, item);
      return;
    }

    onMenuSelect?.(id, item);
  }
</script>

{#if items.length}
  <div class="uiv2-discuss {className}" role="list">
    {#each items as item (item.id)}
      {@const rate = ratingText(item.rating)}
      {@const meta = metaLine(item)}
      {@const desc = item.description?.trim() ? withEllipsis(item.description.trim()) : null}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
      <div
        class="uiv2-discuss__card"
        class:uiv2-discuss__card--menu-open={menuOpen && menuItemId === item.id}
        role="listitem"
        tabindex={onclick ? 0 : undefined}
        aria-label={onclick ? item.title : undefined}
        onclick={() => onActivate(item)}
        onkeydown={(e) => onCardKeydown(item, e)}
        oncontextmenu={(e) => onContextMenu(item, e)}
      >
        <span class="uiv2-discuss__poster">
          {#if item.posterUrl}
            <img src={item.posterUrl} alt="" loading="lazy" decoding="async" />
          {:else}
            <span class="uiv2-discuss__poster-fallback" aria-hidden="true"></span>
          {/if}
        </span>

        <span class="uiv2-discuss__content">
          <span class="uiv2-discuss__title-row">
            <span class="uiv2-discuss__titles">
              <span class="uiv2-discuss__title">{item.title}</span>
              {#if item.titleOriginal}
                <span class="uiv2-discuss__title-orig">{item.titleOriginal}</span>
              {/if}
            </span>
            {#if hasMenu}
              <span class="uiv2-discuss__more-slot">
                <UiV2RoundButton
                  size="sm"
                  label={moreLabel}
                  class="uiv2-discuss__more"
                  ariaHaspopup="menu"
                  ariaExpanded={menuOpen && menuItemId === item.id}
                  onclick={(e) => stopMore(item, e)}
                >
                  {@html iconMoreHorizontal(16)}
                </UiV2RoundButton>
              </span>
            {/if}
          </span>

          <span class="uiv2-discuss__stats">
            {#if rate}
              <span class="uiv2-discuss__score">
                <span class="uiv2-discuss__score-star" aria-hidden="true">{@html iconStar(12)}</span>
                <span class="uiv2-discuss__score-value">{rate}</span>
                {#if item.ratingCount != null && item.ratingCount !== ''}
                  <span class="uiv2-discuss__score-count">{item.ratingCount}</span>
                {/if}
              </span>
            {/if}
            {#if meta}
              <span class="uiv2-discuss__meta">{meta}</span>
            {/if}
          </span>

          {#if desc}
            <span class="uiv2-discuss__desc">{desc}</span>
          {/if}

          <span class="uiv2-discuss__comments">
            <span class="uiv2-discuss__comments-icon" aria-hidden="true">{@html iconMessageCircle(13)}</span>
            <span class="uiv2-discuss__comments-text">{formatComments(item.commentCount)}</span>
          </span>
        </span>
      </div>
    {/each}
  </div>
{/if}

{#if hasMenu}
  <UiV2PopupMenu
    open={menuOpen}
    x={menuX}
    y={menuY}
    items={resolvedMenu}
    onClose={() => {
      menuOpen = false;
      menuItemId = null;
    }}
    onSelect={handleMenuSelect}
  />
{/if}
