<script lang="ts">
  import {
    iconCopy,
    iconFlag,
    iconFilm,
    iconLock,
    iconMessageCircle,
    iconMoreHorizontal,
    iconShare,
    iconTrash2,
  } from '../icons';
  import UiV2RoundButton from './UiV2RoundButton.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from './UiV2PopupMenu.svelte';

  export type UiV2CollectionCardData = {
    id: number | string;
    title: string;
    image?: string | null;
    description?: string | null;
    releaseCount?: number | null;
    notesCount?: number | null;
    favoritesCount?: number | null;
    isFavorite?: boolean;
    isPrivate?: boolean;
  };

  type Props = {
    data: UiV2CollectionCardData;
    /** grid — текст под обложкой; cover — заголовок на обложке */
    variant?: 'grid' | 'cover';
    moreLabel?: string;
    menuItems?: UiV2PopupMenuItem[];
    onclick?: (data: UiV2CollectionCardData) => void;
    onMore?: (e: MouseEvent) => void;
    onMenuSelect?: (id: string) => void;
    class?: string;
  };

  let {
    data,
    variant = 'cover',
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
  let localFavorite = $state(false);
  let localFavoritesCount = $state(0);

  $effect(() => {
    localFavorite = !!data.isFavorite;
    localFavoritesCount = typeof data.favoritesCount === 'number' ? data.favoritesCount : 0;
  });

  const defaultMenuItems = $derived.by((): UiV2PopupMenuItem[] => [
    {
      id: 'favorite',
      label: localFavorite ? 'Убрать из избранного' : 'Добавить в избранное',
      icon: iconFlag(18, localFavorite),
      keepOpen: true,
    },
    {
      id: 'share',
      label: 'Поделиться',
      icon: iconShare(18),
      dividerBefore: true,
      children: [
        { id: 'copy-link', label: 'Копировать ссылку', icon: iconCopy(16), keepOpen: true },
        { id: 'copy-title', label: 'Копировать название', icon: iconCopy(16), keepOpen: true },
      ],
    },
    {
      id: 'remove',
      label: 'Скрыть',
      icon: iconTrash2(18),
      danger: true,
      dividerBefore: true,
    },
  ]);

  const resolvedMenu = $derived(
    menuItems ?? (onMore || onMenuSelect ? defaultMenuItems : []),
  );
  const hasMenu = $derived(resolvedMenu.length > 0);

  const showFavoritesMeta = $derived(
    typeof data.favoritesCount === 'number' || localFavorite || localFavoritesCount > 0,
  );

  const hasCoverMeta = $derived(
    typeof data.releaseCount === 'number' ||
      typeof data.notesCount === 'number' ||
      showFavoritesMeta,
  );

  function formatCount(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (value >= 10_000) return `${Math.round(value / 1000)}K`;
    if (value >= 1_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(value);
  }

  function releaseWord(n: number): string {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return 'релизов';
    if (last === 1) return 'релиз';
    if (last >= 2 && last <= 4) return 'релиза';
    return 'релизов';
  }

  function openMenuAt(clientX: number, clientY: number) {
    menuX = clientX;
    menuY = clientY;
    menuOpen = true;
  }

  function stopMore(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onMore?.(e);
    if (hasMenu) {
      const btn = e.currentTarget as HTMLElement;
      const r = btn.getBoundingClientRect();
      openMenuAt(r.left + r.width / 2, r.bottom + 4);
    }
  }

  function onContextMenu(e: MouseEvent) {
    if (!hasMenu) return;
    e.preventDefault();
    e.stopPropagation();
    openMenuAt(e.clientX, e.clientY);
  }

  function onActivate(e: MouseEvent) {
    if (menuOpen) return;
    e.preventDefault();
    onclick?.(data);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick?.(data);
    }
  }

  function handleMenuSelect(id: string) {
    if (id === 'favorite') {
      const next = !localFavorite;
      localFavorite = next;
      localFavoritesCount = Math.max(0, localFavoritesCount + (next ? 1 : -1));
    }
    onMenuSelect?.(id);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<article
  class="uiv2-collection uiv2-collection--{variant} {className}"
  class:uiv2-collection--menu-open={menuOpen}
  role={onclick ? 'button' : 'group'}
  tabindex={onclick ? 0 : undefined}
  aria-label={onclick ? data.title : undefined}
  onclick={onclick ? onActivate : undefined}
  onkeydown={onclick ? onKeydown : undefined}
  oncontextmenu={onContextMenu}
>
  <div class="uiv2-collection__stack" aria-hidden="true">
    <span class="uiv2-collection__sheet uiv2-collection__sheet--back"></span>
    <span class="uiv2-collection__sheet uiv2-collection__sheet--mid"></span>
  </div>

  <div class="uiv2-collection__card">
    <div class="uiv2-collection__media">
      {#if data.image}
        <img src={data.image} alt="" loading="lazy" decoding="async" />
      {:else}
        <span class="uiv2-collection__media-fallback" aria-hidden="true"></span>
      {/if}
      <span class="uiv2-collection__veil" aria-hidden="true"></span>

      <div class="uiv2-collection__top">
        {#if data.isPrivate}
          <span class="uiv2-collection__lock" title="Приватная коллекция" aria-label="Приватная">
            <UiV2RoundButton
              size="sm"
              label="Приватная"
              class="uiv2-collection__more uiv2-collection__lock-btn"
              disabled
            >
              {@html iconLock(16)}
            </UiV2RoundButton>
          </span>
        {:else}
          <span class="uiv2-collection__top-spacer" aria-hidden="true"></span>
        {/if}
        {#if hasMenu}
          <span class="uiv2-collection__more-slot">
            <UiV2RoundButton
              size="sm"
              label={moreLabel}
              class="uiv2-collection__more"
              ariaHaspopup="menu"
              ariaExpanded={menuOpen}
              onclick={stopMore}
            >
              {@html iconMoreHorizontal(16)}
            </UiV2RoundButton>
          </span>
        {/if}
      </div>

      {#if variant === 'cover'}
        <div class="uiv2-collection__cover-text">
          <h3 class="uiv2-collection__title uiv2-collection__title--cover">{data.title}</h3>
          {#if hasCoverMeta}
            <p class="uiv2-collection__cover-meta">
              {#if typeof data.releaseCount === 'number'}
                <span class="uiv2-collection__meta-item">
                  <span class="uiv2-collection__meta-icon" aria-hidden="true">{@html iconFilm(13)}</span>
                  <span class="uiv2-collection__meta-text">{data.releaseCount} {releaseWord(data.releaseCount)}</span>
                </span>
              {/if}
              {#if typeof data.notesCount === 'number'}
                {#if typeof data.releaseCount === 'number'}
                  <span class="uiv2-collection__meta-sep" aria-hidden="true">·</span>
                {/if}
                <span class="uiv2-collection__meta-item">
                  <span class="uiv2-collection__meta-icon" aria-hidden="true">{@html iconMessageCircle(13)}</span>
                  <span class="uiv2-collection__meta-text">{formatCount(data.notesCount)}</span>
                </span>
              {/if}
              {#if showFavoritesMeta}
                {#if typeof data.releaseCount === 'number' || typeof data.notesCount === 'number'}
                  <span class="uiv2-collection__meta-sep" aria-hidden="true">·</span>
                {/if}
                <span
                  class="uiv2-collection__meta-item"
                  class:uiv2-collection__meta-item--fav={localFavorite}
                >
                  <span class="uiv2-collection__meta-icon" aria-hidden="true">{@html iconFlag(13, localFavorite)}</span>
                  <span class="uiv2-collection__meta-text">{formatCount(localFavoritesCount)}</span>
                </span>
              {/if}
            </p>
          {/if}
        </div>
      {/if}
    </div>

    {#if variant === 'grid'}
      <div class="uiv2-collection__body">
        <h3 class="uiv2-collection__title">{data.title}</h3>
        {#if data.description}
          <p class="uiv2-collection__desc">{data.description}</p>
        {/if}
        {#if hasCoverMeta}
          <p class="uiv2-collection__stat">
            {#if typeof data.releaseCount === 'number'}
              <span class="uiv2-collection__meta-item">
                <span class="uiv2-collection__meta-icon" aria-hidden="true">{@html iconFilm(13)}</span>
                <span class="uiv2-collection__meta-text">{data.releaseCount} в коллекции</span>
              </span>
            {/if}
            {#if typeof data.notesCount === 'number'}
              {#if typeof data.releaseCount === 'number'}
                <span class="uiv2-collection__meta-sep" aria-hidden="true">·</span>
              {/if}
              <span class="uiv2-collection__meta-item">
                <span class="uiv2-collection__meta-icon" aria-hidden="true">{@html iconMessageCircle(13)}</span>
                <span class="uiv2-collection__meta-text">{formatCount(data.notesCount)}</span>
              </span>
            {/if}
            {#if showFavoritesMeta}
              {#if typeof data.releaseCount === 'number' || typeof data.notesCount === 'number'}
                <span class="uiv2-collection__meta-sep" aria-hidden="true">·</span>
              {/if}
              <span
                class="uiv2-collection__meta-item"
                class:uiv2-collection__meta-item--fav={localFavorite}
              >
                <span class="uiv2-collection__meta-icon" aria-hidden="true">{@html iconFlag(13, localFavorite)}</span>
                <span class="uiv2-collection__meta-text">{formatCount(localFavoritesCount)}</span>
              </span>
            {/if}
          </p>
        {/if}
      </div>
    {/if}
  </div>
</article>

{#if hasMenu}
  <UiV2PopupMenu
    open={menuOpen}
    x={menuX}
    y={menuY}
    items={resolvedMenu}
    onClose={() => { menuOpen = false; }}
    onSelect={handleMenuSelect}
  />
{/if}
