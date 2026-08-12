<script lang="ts">
  import {
    iconBookOpen,
    iconCalendar,
    iconCheck,
    iconClipboardList,
    iconCopy,
    iconFilm,
    iconFlag,
    iconMoreHorizontal,
    iconPalette,
    iconShare,
    iconStar,
    iconTags,
    iconTv,
  } from '../icons';
  import UiV2RoundButton from './UiV2RoundButton.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from './UiV2PopupMenu.svelte';
  import { parseAltTitles } from '../../utils/titleInfo';
  import { showToast } from '../../stores/toast';

  export type UiV2AnimeCardVariant = 'vertical' | 'horizontal';

  export type UiV2AnimeCardMetaKind =
    | 'category'
    | 'source'
    | 'studio'
    | 'author'
    | 'director'
    | 'season'
    | 'genre';

  export type UiV2AnimeCardListStatus =
    | 'watching'
    | 'planned'
    | 'completed'
    | 'dropped'
    | 'on_hold';

  const LIST_STATUSES: { id: UiV2AnimeCardListStatus; label: string }[] = [
    { id: 'watching', label: 'Смотрю' },
    { id: 'planned', label: 'В планах' },
    { id: 'completed', label: 'Просмотрено' },
    { id: 'dropped', label: 'Брошено' },
    { id: 'on_hold', label: 'Отложено' },
  ];

  const STATUS_BADGE: Record<UiV2AnimeCardListStatus, { label: string; tone: string }> = {
    watching: { label: 'смотрю', tone: 'watching' },
    planned: { label: 'в планах', tone: 'planned' },
    completed: { label: 'просмотрено', tone: 'completed' },
    on_hold: { label: 'отложено', tone: 'on-hold' },
    dropped: { label: 'брошено', tone: 'dropped' },
  };

  type Props = {
    variant?: UiV2AnimeCardVariant;
    title: string;
    posterUrl?: string | null;
    /** Число серий или готовая строка («6 эп.») */
    episodes?: number | string | null;
    year?: number | string | null;
    rating?: number | string | null;
    ratingCount?: number | string | null;
    country?: string | null;
    genres?: string[];
    description?: string | null;
    /** Доп. факты для широкой горизонтальной карточки */
    status?: string | null;
    studio?: string | null;
    source?: string | null;
    author?: string | null;
    director?: string | null;
    duration?: number | string | null;
    category?: string | null;
    favoritesCount?: number | null;
    titleOriginal?: string | null;
    /** Альтернативные названия (title_alt) */
    titleAlt?: string | null;
    /** 1 зима … 4 осень */
    season?: number | null;
    /** unix sec, для вычисления сезона если season пустой */
    airedOnDate?: number | null;
    isFavorite?: boolean;
    listStatus?: UiV2AnimeCardListStatus | null;
    moreLabel?: string;
    /** Пункты меню «⋯» / ПКМ. Если не заданы — кнопки меню нет. */
    menuItems?: UiV2PopupMenuItem[];
    class?: string;
    onclick?: (e: MouseEvent) => void;
    onMore?: (e: MouseEvent) => void;
    onMenuSelect?: (id: string) => void;
    onFavoriteChange?: (next: boolean) => void;
    onListStatusChange?: (next: UiV2AnimeCardListStatus | null) => void;
    onGenreClick?: (genre: string, e: MouseEvent) => void;
    onMetaClick?: (kind: UiV2AnimeCardMetaKind, value: string, e: MouseEvent) => void;
  };

  let {
    variant = 'vertical',
    title,
    posterUrl = null,
    episodes = null,
    year = null,
    rating = null,
    ratingCount = null,
    country = null,
    genres = [],
    description = null,
    status = null,
    studio = null,
    source = null,
    author = null,
    director = null,
    duration = null,
    category = null,
    favoritesCount = null,
    titleOriginal = null,
    titleAlt = null,
    season = null,
    airedOnDate = null,
    isFavorite = false,
    listStatus = null,
    moreLabel = 'Ещё',
    menuItems,
    class: className = '',
    onclick,
    onMore,
    onMenuSelect,
    onFavoriteChange,
    onListStatusChange,
    onGenreClick,
    onMetaClick,
  }: Props = $props();

  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let copiedTitleId = $state<string | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let localFavorite = $state(false);
  let localListStatus = $state<UiV2AnimeCardListStatus | null>(null);

  $effect(() => {
    localFavorite = !!isFavorite;
    localListStatus = listStatus ?? null;
  });

  const titleOriginalClean = $derived(
    titleOriginal?.trim() && titleOriginal.trim() !== title.trim() ? titleOriginal.trim() : null,
  );
  const altTitles = $derived(
    parseAltTitles(titleAlt).filter((t) => {
      const ru = title.trim();
      return t !== ru && t !== titleOriginalClean;
    }),
  );

  const titleCopyItems = $derived.by((): UiV2PopupMenuItem[] => {
    const items: UiV2PopupMenuItem[] = [];
    if (title.trim()) {
      items.push({
        id: 'titles-label-ru',
        label: 'Название',
        type: 'label',
      });
      items.push({
        id: 'copy-title-ru',
        label: copiedTitleId === 'copy-title-ru' ? 'Скопировано' : title.trim(),
        icon: copiedTitleId === 'copy-title-ru' ? iconCheck(16) : iconCopy(16),
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
        label: copiedTitleId === 'copy-title-orig' ? 'Скопировано' : titleOriginalClean,
        icon: copiedTitleId === 'copy-title-orig' ? iconCheck(16) : iconCopy(16),
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
          label: copiedTitleId === id ? 'Скопировано' : altTitles[i],
          icon: copiedTitleId === id ? iconCheck(16) : iconCopy(16),
          keepOpen: true,
        });
      }
    }
    return items;
  });

  const statusLabel = $derived(
    localListStatus
      ? (LIST_STATUSES.find((s) => s.id === localListStatus)?.label ?? 'Не смотрю')
      : 'Не смотрю',
  );

  const posterStatusBadge = $derived(
    localListStatus ? STATUS_BADGE[localListStatus] : null,
  );

  const defaultMenuItems = $derived.by((): UiV2PopupMenuItem[] => {
    const items: UiV2PopupMenuItem[] = [
      {
        id: 'favorite',
        label: localFavorite ? 'Убрать из избранного' : 'Добавить в избранное',
        icon: iconFlag(18, localFavorite),
        keepOpen: true,
      },
      {
        id: 'status',
        label: statusLabel,
        icon: iconClipboardList(18),
        dividerBefore: true,
        children: [
          {
            id: 'status-none',
            label: 'Не смотрю',
            type: 'radio',
            checked: localListStatus == null,
            keepOpen: true,
          },
          ...LIST_STATUSES.map((s) => ({
            id: `status-${s.id}`,
            label: s.label,
            type: 'radio' as const,
            checked: localListStatus === s.id,
            keepOpen: true,
          })),
        ],
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
    ];
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
  });

  const resolvedMenu = $derived(
    menuItems ?? (onMore || onMenuSelect || onFavoriteChange || onListStatusChange ? defaultMenuItems : []),
  );
  const hasMenu = $derived(resolvedMenu.length > 0);

  function episodesLabel(value: number | string | null | undefined): string | null {
    if (value == null || value === '') return null;
    if (typeof value === 'string') {
      return /эп/i.test(value) ? value : `${value} эп.`;
    }
    return `${value} эп.`;
  }

  function ratingLabel(value: number | string | null | undefined): string | null {
    if (value == null || value === '') return null;
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value.toFixed(1) : String(Math.round(value * 100) / 100);
    }
    return String(value);
  }

  function durationLabel(value: number | string | null | undefined): string | null {
    if (value == null || value === '') return null;
    if (typeof value === 'string') return value;
    return `${value} мин`;
  }

  function formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 10_000) return `${Math.round(n / 1000)}K`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
  }

  function seasonName(value: number | null | undefined): string {
    switch (value) {
      case 1: return 'зима';
      case 2: return 'весна';
      case 3: return 'лето';
      case 4: return 'осень';
      default: return '';
    }
  }

  function seasonFromAiredOn(ts: number | null | undefined): number | null {
    if (ts == null || ts <= 0) return null;
    const m = new Date(ts * 1000).getUTCMonth();
    if (m === 11 || m <= 1) return 1;
    if (m <= 4) return 2;
    if (m <= 7) return 3;
    return 4;
  }

  function withEllipsis(text: string): string {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t) return t;
    if (/(?:\.\.\.|…)$/.test(t)) return t;
    return `${t}...`;
  }

  const isAnnounce = $derived(/^анонс$/i.test(String(status ?? '').trim()));

  const resolvedSeason = $derived.by(() => {
    if (season != null && season >= 1 && season <= 4) return season;
    const fromAired = seasonFromAiredOn(airedOnDate);
    if (fromAired != null) return fromAired;
    // Анонс без season в API — чаще указывают зиму ближайшего года
    if (isAnnounce && year != null && year !== '') return 1;
    return null;
  });

  const seasonLabel = $derived.by(() => {
    const name = seasonName(resolvedSeason);
    const y = year != null && year !== '' ? String(year) : '';
    if (name && y) return `${name} ${y} г.`;
    if (y) return `${y} г.`;
    if (name) return name;
    return null;
  });

  const ep = $derived(episodesLabel(episodes));
  const rate = $derived(ratingLabel(rating));
  const dur = $derived(durationLabel(duration));
  const descriptionText = $derived(description ? withEllipsis(description) : null);

  const verticalMetaLeft = $derived(
    [ep, year != null && year !== '' ? String(year) : null].filter(Boolean) as string[],
  );

  const horizontalMeta = $derived(
    [
      ep,
      year != null && year !== '' ? String(year) : null,
      country ? String(country) : null,
      status,
      dur,
    ]
      .filter(Boolean)
      .join(' · '),
  );

  type MetaLink = {
    kind: UiV2AnimeCardMetaKind;
    label: string;
    value: string;
    icon: string;
  };

  const metaLinks = $derived.by((): MetaLink[] => {
    const rows: MetaLink[] = [];
    if (category) rows.push({ kind: 'category', label: 'тип', value: category, icon: iconTv(14) });
    if (source) rows.push({ kind: 'source', label: 'источник', value: source, icon: iconBookOpen(14) });
    if (studio) rows.push({ kind: 'studio', label: 'студия', value: studio, icon: iconPalette(14) });
    if (author) rows.push({ kind: 'author', label: 'автор', value: author, icon: iconBookOpen(14) });
    if (director) rows.push({ kind: 'director', label: 'режиссёр', value: director, icon: iconFilm(14) });
    return rows;
  });

  const hasMetaLinks = $derived(metaLinks.length > 0);
  const favoritesLabel = $derived(
    favoritesCount != null && favoritesCount > 0 ? formatCount(favoritesCount) : null,
  );

  function onCardKeydown(e: KeyboardEvent) {
    if (!onclick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick(e as unknown as MouseEvent);
    }
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
    if (id === 'favorite') {
      const next = !localFavorite;
      localFavorite = next;
      onFavoriteChange?.(next);
      onMenuSelect?.(id);
      return;
    }

    if (id === 'status-none') {
      localListStatus = null;
      onListStatusChange?.(null);
      onMenuSelect?.(id);
      return;
    }

    const statusMatch = /^status-(watching|planned|completed|dropped|on_hold)$/.exec(id);
    if (statusMatch) {
      const next = statusMatch[1] as UiV2AnimeCardListStatus;
      localListStatus = next;
      onListStatusChange?.(next);
      onMenuSelect?.(id);
      return;
    }

    if (id === 'copy-title' || id === 'copy-title-ru') {
      const ok = await copyText(title.trim());
      if (ok) {
        markCopied(id === 'copy-title' ? 'copy-title-ru' : id);
        showToast('Название скопировано');
      }
      onMenuSelect?.(id);
      return;
    }
    if (id === 'copy-title-orig' && titleOriginalClean) {
      const ok = await copyText(titleOriginalClean);
      if (ok) {
        markCopied(id);
        showToast('Оригинальное название скопировано');
      }
      onMenuSelect?.(id);
      return;
    }
    const altMatch = /^copy-title-alt-(\d+)$/.exec(id);
    if (altMatch) {
      const value = altTitles[Number(altMatch[1])];
      if (value) {
        const ok = await copyText(value);
        if (ok) {
          markCopied(id);
          showToast('Название скопировано');
        }
      }
      onMenuSelect?.(id);
      return;
    }
    onMenuSelect?.(id);
  }

  function stopGenre(genre: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onGenreClick?.(genre, e);
    onMetaClick?.('genre', genre, e);
  }

  function stopMeta(kind: UiV2AnimeCardMetaKind, value: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onMetaClick?.(kind, value, e);
  }

  const canLinkMeta = $derived(!!onMetaClick);
  const canLinkGenre = $derived(!!(onGenreClick || onMetaClick));
</script>

{#if variant === 'vertical'}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="uiv2-anime-card uiv2-anime-card--vertical {className}"
    class:uiv2-anime-card--menu-open={menuOpen}
    role={onclick ? 'button' : 'group'}
    tabindex={onclick ? 0 : undefined}
    aria-label={onclick ? title : undefined}
    onclick={onclick}
    onkeydown={onCardKeydown}
    oncontextmenu={onContextMenu}
  >
    <div class="uiv2-anime-card__poster">
      {#if posterUrl}
        <img src={posterUrl} alt="" loading="lazy" decoding="async" />
      {:else}
        <span class="uiv2-anime-card__poster-fallback" aria-hidden="true"></span>
      {/if}
      <span class="uiv2-anime-card__poster-veil" aria-hidden="true"></span>
      {#if hasMenu}
        <span class="uiv2-anime-card__more-slot">
          <UiV2RoundButton
            size="sm"
            label={moreLabel}
            class="uiv2-anime-card__more"
            ariaHaspopup="menu"
            ariaExpanded={menuOpen}
            onclick={stopMore}
          >
            {@html iconMoreHorizontal(16)}
          </UiV2RoundButton>
        </span>
      {/if}
      {#if posterStatusBadge}
        <div
          class="uiv2-anime-card__status-badge uiv2-anime-card__status-badge--{posterStatusBadge.tone}"
        >{posterStatusBadge.label}</div>
      {/if}
    </div>
    <div class="uiv2-anime-card__body">
      <h3 class="uiv2-anime-card__title">{title}</h3>
      {#if isAnnounce}
        <p class="uiv2-anime-card__meta">
          <span class="uiv2-anime-card__meta-text">Анонс{seasonLabel ? ` ${seasonLabel}` : ''}</span>
          {#if localFavorite}
            <span class="uiv2-anime-card__favorite" aria-label="В избранном">{@html iconFlag(12, true)}</span>
          {/if}
        </p>
      {:else if verticalMetaLeft.length || rate || localFavorite}
        <p class="uiv2-anime-card__meta">
          {#each verticalMetaLeft as part, i (part)}
            {#if i > 0}<span class="uiv2-anime-card__meta-sep" aria-hidden="true">·</span>{/if}
            <span class="uiv2-anime-card__meta-text">{part}</span>
          {/each}
          {#if rate}
            {#if verticalMetaLeft.length}
              <span class="uiv2-anime-card__meta-sep" aria-hidden="true">·</span>
            {/if}
            <span class="uiv2-anime-card__score uiv2-anime-card__score--inline">
              <span class="uiv2-anime-card__score-star" aria-hidden="true">{@html iconStar(11)}</span>
              <span class="uiv2-anime-card__score-value">{rate}</span>
            </span>
          {/if}
          {#if localFavorite}
            <span class="uiv2-anime-card__favorite" aria-label="В избранном">{@html iconFlag(12, true)}</span>
          {/if}
        </p>
      {/if}
    </div>
  </div>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="uiv2-anime-card uiv2-anime-card--horizontal {className}"
    class:uiv2-anime-card--menu-open={menuOpen}
    role={onclick ? 'button' : 'group'}
    tabindex={onclick ? 0 : undefined}
    aria-label={onclick ? title : undefined}
    onclick={onclick}
    onkeydown={onCardKeydown}
    oncontextmenu={onContextMenu}
  >
    <div class="uiv2-anime-card__media">
      <div class="uiv2-anime-card__poster uiv2-anime-card__poster--h">
        {#if posterUrl}
          <img src={posterUrl} alt="" loading="lazy" decoding="async" />
        {:else}
          <span class="uiv2-anime-card__poster-fallback" aria-hidden="true"></span>
        {/if}
        <span class="uiv2-anime-card__poster-veil" aria-hidden="true"></span>
      </div>
      {#if posterStatusBadge}
        <div
          class="uiv2-anime-card__status-badge uiv2-anime-card__status-badge--below uiv2-anime-card__status-badge--{posterStatusBadge.tone}"
        >{posterStatusBadge.label}</div>
      {/if}
    </div>

    <div class="uiv2-anime-card__content">
      <div class="uiv2-anime-card__title-row">
        <div class="uiv2-anime-card__titles">
          <h3 class="uiv2-anime-card__title uiv2-anime-card__title--h">{title}</h3>
          {#if titleOriginal}
            <p class="uiv2-anime-card__title-orig">{titleOriginal}</p>
          {/if}
        </div>
        {#if hasMenu}
          <span class="uiv2-anime-card__more-slot uiv2-anime-card__more-slot--inline">
            <UiV2RoundButton
              size="sm"
              label={moreLabel}
              class="uiv2-anime-card__more uiv2-anime-card__more--plain"
              ariaHaspopup="menu"
              ariaExpanded={menuOpen}
              onclick={stopMore}
            >
              {@html iconMoreHorizontal(16)}
            </UiV2RoundButton>
          </span>
        {/if}
      </div>

      <div class="uiv2-anime-card__stats">
        {#if isAnnounce}
          <span class="uiv2-anime-card__season-chip">
            <span class="uiv2-anime-card__season-chip-icon" aria-hidden="true">{@html iconCalendar(13)}</span>
            <span class="uiv2-anime-card__season-chip-text">
              Анонс{seasonLabel ? ` ${seasonLabel}` : ''}
            </span>
          </span>
          {#if localFavorite}
            <span class="uiv2-anime-card__favorite uiv2-anime-card__favorite--h" aria-label="В избранном">{@html iconFlag(16, true)}</span>
          {/if}
        {:else}
          {#if rate}
            <span class="uiv2-anime-card__score">
              <span class="uiv2-anime-card__score-star" aria-hidden="true">{@html iconStar(12)}</span>
              <span class="uiv2-anime-card__score-value">{rate}</span>
              {#if ratingCount != null && ratingCount !== ''}
                <span class="uiv2-anime-card__score-count">{ratingCount}</span>
              {/if}
            </span>
          {/if}
          {#if localFavorite}
            <span class="uiv2-anime-card__favorite uiv2-anime-card__favorite--h" aria-label="В избранном">{@html iconFlag(16, true)}</span>
          {/if}
          {#if horizontalMeta}
            <span class="uiv2-anime-card__meta uiv2-anime-card__meta--inline">{horizontalMeta}</span>
          {/if}
          {#if favoritesLabel}
            <span class="uiv2-anime-card__meta uiv2-anime-card__meta--inline">избр. {favoritesLabel}</span>
          {/if}
        {/if}
      </div>

      {#if descriptionText}
        <p class="uiv2-anime-card__desc">{descriptionText}</p>
      {/if}

      {#if hasMetaLinks || genres.length}
        <div class="uiv2-anime-card__meta-panel">
          <div class="uiv2-anime-card__meta-lines">
            {#each metaLinks as link (link.kind)}
              <p class="uiv2-anime-card__meta-line">
                <span class="uiv2-anime-card__meta-line-icon" aria-hidden="true">{@html link.icon}</span>
                <span class="uiv2-anime-card__meta-line-body">
                  <span class="uiv2-anime-card__meta-line-label">{link.label}:</span>
                  {#if canLinkMeta}
                    <button
                      type="button"
                      class="uiv2-anime-card__link"
                      onclick={(e) => stopMeta(link.kind, link.value, e)}
                    >{link.value}</button>
                  {:else}
                    <span class="uiv2-anime-card__link uiv2-anime-card__link--static">{link.value}</span>
                  {/if}
                </span>
              </p>
            {/each}

            {#if genres.length}
              <div class="uiv2-anime-card__meta-line uiv2-anime-card__meta-line--tags">
                <span class="uiv2-anime-card__meta-line-icon" aria-hidden="true">{@html iconTags(14)}</span>
                <div class="uiv2-anime-card__meta-line-body">
                  <span class="uiv2-anime-card__meta-line-label">жанры:</span>
                  <p class="uiv2-anime-card__tags-list">
                    {#each genres as genre, i (genre)}
                      {#if i > 0}<span class="uiv2-anime-card__tag-sep">, </span>{/if}
                      {#if canLinkGenre}
                        <button
                          type="button"
                          class="uiv2-anime-card__link"
                          onclick={(e) => stopGenre(genre, e)}
                        >{genre}</button>
                      {:else}
                        <span class="uiv2-anime-card__link uiv2-anime-card__link--static">{genre}</span>
                      {/if}
                    {/each}
                  </p>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

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
