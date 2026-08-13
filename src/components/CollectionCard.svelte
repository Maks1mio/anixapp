<script lang="ts">
  import { navigate } from '../stores/navigation';
  import { requireAuth } from '../stores/auth';
  import { notifyBookmarksChanged } from '../utils/favorites-events';
  import UiV2CollectionCard from './uikit-v2/UiV2CollectionCard.svelte';

  export interface CollectionCardData {
    id: number;
    title: string;
    image?: string;
    description?: string;
    releaseCount?: number;
    notesCount?: number;
    bookmarksCount?: number;
    favoritesCount?: number;
    isFavorite?: boolean;
    isPrivate?: boolean;
  }

  interface Props {
    data: CollectionCardData;
    variant?: 'grid' | 'cover';
  }

  let { data, variant = 'grid' }: Props = $props();

  function handleClick() {
    navigate(`/collection/${data.id}`);
  }

  function handleFavoriteChange(next: boolean) {
    if (!requireAuth() || !data.id) return;
    const api = window.anixApi;
    if (!api) return;
    (next ? api.collection.addFavorite(data.id) : api.collection.removeFavorite(data.id))
      .then(() => notifyBookmarksChanged({ kind: 'collections' }))
      .catch(() => {});
  }
</script>

<UiV2CollectionCard
  data={{
    id: data.id,
    title: data.title,
    image: data.image,
    description: data.description,
    releaseCount: data.releaseCount ?? data.bookmarksCount,
    notesCount: data.notesCount,
    favoritesCount: data.favoritesCount,
    isFavorite: data.isFavorite,
    isPrivate: data.isPrivate,
  }}
  {variant}
  onclick={handleClick}
  onFavoriteChange={handleFavoriteChange}
/>
