<script lang="ts">
  import { navigate } from '../stores/navigation';
  import { iconFlag, iconMessageCircle } from './icons';

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

  interface Props {
    data: CollectionCardData;
    /** cover — заголовок поверх постера (как в ленте); grid — текст под картинкой */
    variant?: 'grid' | 'cover';
  }

  let { data, variant = 'grid' }: Props = $props();

  const href = `/collection/${data.id}`;

  function handleClick(e: MouseEvent) {
    e.preventDefault();
    navigate(href);
  }

  function formatCount(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (value >= 10_000) return `${Math.round(value / 1000)}K`;
    if (value >= 1_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(value);
  }
</script>

<article class="collection-card collection-card--{variant}">
  <div class="collection-card__stack">
    <span class="collection-card__stack-head" aria-hidden="true"></span>
    <span class="collection-card__stack-sheet" aria-hidden="true"></span>

    <a {href} class="collection-card__link" onclick={handleClick}>
      <div class="collection-card__media">
        {#if data.image}
          <img src={data.image} alt="" loading="lazy" class="collection-card__image" />
        {:else}
          <div class="collection-card__image collection-card__image--placeholder"></div>
        {/if}

        <div class="collection-card__badges">
          {#if typeof data.notesCount === 'number'}
            <div class="collection-card__badge collection-card__badge--comments">
              <span class="collection-card__badge-count">{formatCount(data.notesCount)}</span>
              <span class="collection-card__badge-icon">{@html iconMessageCircle(15)}</span>
            </div>
          {/if}

          {#if typeof data.favoritesCount === 'number'}
            <div
              class="collection-card__badge collection-card__badge--flags{data.isFavorite
                ? ' collection-card__badge--flags-active'
                : ''}"
            >
              <span class="collection-card__badge-count">{formatCount(data.favoritesCount)}</span>
              <span class="collection-card__badge-icon">{@html iconFlag(15, !!data.isFavorite)}</span>
            </div>
          {:else if data.isFavorite}
            <div class="collection-card__badge collection-card__badge--flags collection-card__badge--flags-active">
              <span class="collection-card__badge-icon">{@html iconFlag(15, true)}</span>
            </div>
          {/if}
        </div>

        {#if variant === 'cover'}
          <div class="collection-card__overlay">
            <h3 class="collection-card__title collection-card__title--overlay">{data.title}</h3>
          </div>
        {/if}
      </div>

      {#if variant === 'grid'}
        <div class="collection-card__body">
          <h3 class="collection-card__title">{data.title}</h3>
          <p class="collection-card__desc">{data.description ?? ''}</p>
        </div>
      {/if}
    </a>
  </div>
</article>
