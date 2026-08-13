<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import { requireAuth } from '../../stores/auth';
  import { toCdnProxyUrl } from '../../utils/posterUrl';
  import { episodesLabel, type OverviewDiscussItem } from '../../utils/overview';
  import { notifyFavoritesChanged } from '../../utils/favorites-events';
  import { applyReleaseListStatus } from '../../utils/release-list-status';
  import type { ReleaseMenuListStatus } from '../../utils/release-menu-v2';
  import UiV2DiscussList, { type UiV2DiscussItem } from '../uikit-v2/UiV2DiscussList.svelte';

  interface Props {
    items: OverviewDiscussItem[];
  }

  let { items }: Props = $props();

  const v2Items = $derived.by((): UiV2DiscussItem[] =>
    items.map((item) => ({
      id: item.id ?? 0,
      title: item.titleRu || item.titleEn || 'Без названия',
      titleOriginal: item.titleEn,
      titleAlt: item.titleAlt,
      posterUrl: toCdnProxyUrl(item.poster || ''),
      episodes: episodesLabel(item.episodesReleased, item.episodesTotal) || null,
      year: item.year,
      country: item.country,
      rating: item.rating,
      ratingCount: item.voteCount,
      description: item.description,
      commentCount: item.commentPerDayCount,
      isFavorite: item.isFavorite,
      listStatus: item.listStatus ?? null,
      status: item.status,
      statusId: item.statusId,
      season: item.season,
    })),
  );

  function openRelease(item: UiV2DiscussItem) {
    navigate(`/release/${item.id}`);
  }

  function handleFavoriteChange(next: boolean, item: UiV2DiscussItem) {
    const id = Number(item.id);
    if (!requireAuth() || !id) return;
    const api = window.anixApi;
    if (!api) return;
    (next ? api.release.addFavorite(id) : api.release.removeFavorite(id))
      .then(() => notifyFavoritesChanged())
      .catch(() => {});
  }

  function handleListStatusChange(next: ReleaseMenuListStatus | null, item: UiV2DiscussItem) {
    const id = Number(item.id);
    if (!requireAuth() || !id) return;
    applyReleaseListStatus(id, next, item.listStatus ?? null).catch(() => {});
  }
</script>

{#if v2Items.length > 0}
  <UiV2DiscussList
    items={v2Items}
    onclick={openRelease}
    onFavoriteChange={handleFavoriteChange}
    onListStatusChange={handleListStatusChange}
  />
{/if}
