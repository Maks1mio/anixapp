<script lang="ts">
  import { navigate } from '../stores/navigation';
  import { requireAuth } from '../stores/auth';
  import { toCdnProxyUrl } from '../utils/posterUrl';
  import { iconTrash2 } from './icons';
  import UiV2AnimeCard, {
    type UiV2AnimeCardListStatus,
  } from './uikit-v2/UiV2AnimeCard.svelte';
  import type { UiV2PopupMenuItem } from './uikit-v2/UiV2PopupMenu.svelte';
  import { notifyFavoritesChanged } from '../utils/favorites-events';
  import { applyReleaseListStatus } from '../utils/release-list-status';
  import type { ReleaseCardData } from '../types/release';

  interface Props {
    data: ReleaseCardData;
    variant?: 'vertical' | 'horizontal';
    cardVariant?: 'default' | 'history';
    onDeleteFromHistory?: (id: number) => void;
    /** Не открывать релиз по клику (текущий в related-цепочке) */
    disableOpen?: boolean;
  }

  let {
    data,
    variant = 'horizontal',
    cardVariant = 'default',
    onDeleteFromHistory,
    disableOpen = false,
  }: Props = $props();

  const id = $derived(data.id);
  const isHistory = $derived(cardVariant === 'history' || !!data.historyView);
  const title = $derived(data.titleRu || data.titleEn || 'Без названия');
  const genres = $derived(
    data.genres
      ?.split(',')
      .map((g) => g.trim())
      .filter(Boolean) ?? [],
  );

  const historyMenu = $derived.by((): UiV2PopupMenuItem[] | undefined =>
    isHistory
      ? [
          {
            id: 'delete-history',
            label: 'Удалить из истории',
            icon: iconTrash2(18),
          },
        ]
      : undefined,
  );

  function openRelease(e: MouseEvent) {
    if (disableOpen || !id) return;
    e.preventDefault();
    navigate(`/release/${id}`);
  }

  function handleFavoriteChange(next: boolean) {
    if (!requireAuth() || !id) return;
    const api = window.anixApi;
    if (!api) return;
    (next ? api.release.addFavorite(id) : api.release.removeFavorite(id))
      .then(() => notifyFavoritesChanged())
      .catch(() => {});
  }

  function handleListStatusChange(next: UiV2AnimeCardListStatus | null) {
    if (!requireAuth() || !id) return;
    applyReleaseListStatus(id, next, data.listStatus ?? null).catch(() => {});
  }

  function handleMenuSelect(menuId: string) {
    if (menuId === 'delete-history' && id) onDeleteFromHistory?.(id);
  }
</script>

<UiV2AnimeCard
  {variant}
  {title}
  releaseId={id}
  posterUrl={toCdnProxyUrl(data.poster || '')}
  episodes={data.episodesReleased ?? data.episodesTotal ?? null}
  year={data.year}
  country={data.country}
  rating={data.rating}
  ratingCount={data.voteCount}
  {genres}
  description={data.description}
  status={data.status}
  statusId={data.statusId}
  studio={data.studio}
  source={data.source}
  author={data.author}
  director={data.director}
  duration={data.duration}
  category={data.category}
  favoritesCount={data.favoritesCount}
  season={data.season}
  airedOnDate={data.airedOnDate}
  titleOriginal={data.titleEn}
  titleAlt={data.titleAlt}
  isFavorite={data.isFavorite}
  listStatus={data.listStatus ?? null}
  myVote={data.myVote ?? null}
  historyView={data.historyView ?? null}
  prependMenuItems={historyMenu}
  onclick={openRelease}
  onFavoriteChange={handleFavoriteChange}
  onListStatusChange={handleListStatusChange}
  onMenuSelect={handleMenuSelect}
/>
