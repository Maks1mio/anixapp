<script lang="ts">
  import { navigate } from '../stores/navigation';
  import { iconBookmark, iconFlag } from './icons';

  export interface CollectionCardData {
    id: number;
    title: string;
    image?: string;
    description?: string;
    releaseCount?: number;
    notesCount?: number;
    bookmarksCount?: number;
    /** Количество добавлений в избранное (favorites_count из API) */
    favoritesCount?: number;
    /** Коллекция добавлена в закладки текущего пользователя */
    isFavorite?: boolean;
  }

  let { data }: { data: CollectionCardData } = $props();

  const href = `/collection/${data.id}`;

  function handleClick(e: MouseEvent) {
    e.preventDefault();
    navigate(href);
  }
</script>

<article class="collection-card">
  <span class="collection-card__page collection-card__page--back-2" aria-hidden="true"></span>
  <span class="collection-card__page collection-card__page--back-1" aria-hidden="true"></span>
  <a {href} class="collection-card__link" onclick={handleClick}>
    <div class="collection-card__poster">
      {#if data.image}
        <img src={data.image} alt="" loading="lazy" />
      {:else}
        <div class="collection-card__poster-placeholder"></div>
      {/if}
      <div class="collection-card__badges">
        {#if typeof data.notesCount === 'number'}
          <div class="collection-card__badge">
            <span class="collection-card__badge-icon">💬</span>
            <span class="collection-card__badge-text">{data.notesCount}</span>
          </div>
        {/if}

        {#if typeof data.bookmarksCount === 'number'}
          <div class="collection-card__badge">
            <span class="collection-card__badge-icon">{@html iconBookmark(14)}</span>
            <span class="collection-card__badge-text">{data.bookmarksCount}</span>
          </div>
        {/if}

        {#if typeof data.favoritesCount === 'number'}
          <div
            class="collection-card__badge collection-card__badge--favorites{data.isFavorite
              ? ' collection-card__badge--in-bookmarks'
              : ''}"
          >
            <span class="collection-card__badge-icon">{@html iconFlag(14, !!data.isFavorite)}</span>
            <span class="collection-card__badge-text">{data.favoritesCount}</span>
          </div>
        {:else if data.isFavorite}
          <div class="collection-card__badge collection-card__badge--favorites collection-card__badge--in-bookmarks">
            <span class="collection-card__badge-icon">{@html iconFlag(14, true)}</span>
            <span class="collection-card__badge-text">В закладках</span>
          </div>
        {/if}
      </div>
    </div>
    <div class="collection-card__footer">
      <h3 class="collection-card__title">{data.title}</h3>
      {#if data.description}
        <p class="collection-card__desc">{data.description}</p>
      {/if}
      {#if typeof data.releaseCount === 'number'}
        <span class="collection-card__meta">{data.releaseCount} релизов</span>
      {/if}
    </div>
  </a>
</article>
