<script lang="ts">
  import { navigate } from '../../../../stores/navigation';
  import { toPosterDisplayUrl } from '../../../../utils/posterUrl';

  interface Props {
    title:     string;
    items:     any[];
    type:      'vote' | 'history';
    onViewAll?: () => void;
  }

  let { title, items, type, onViewAll }: Props = $props();
</script>

<section class="profile__section">
  <div class="profile__section-hdr">
    <h2 class="profile__section-title">{title}</h2>
    {#if onViewAll}
      <button class="profile__view-all" onclick={onViewAll}>Показать всё</button>
    {/if}
  </div>

  <div class="profile__media-grid">
    {#each items as item}
      {@const thumb = item.image
        ? toPosterDisplayUrl(String(item.image), 'cardVertical')
        : ''}
      <button type="button" class="profile__card" onclick={() => navigate(`/release/${item.id}`)}>
        {#if thumb}
          <div class="profile__card-poster">
            <img src={thumb} alt="" loading="lazy" decoding="async" />
          </div>
        {:else}
          <div class="profile__card-poster"></div>
        {/if}

        <div class="profile__card-body">
          <span class="profile__card-title">{item.title_ru || item.title_original || 'Без названия'}</span>

          {#if type === 'vote' && item.my_vote}
            <div class="profile__card-stars">
              {#each Array.from({ length: 5 }, (_, i) => i) as i}
                <svg width="10" height="10" viewBox="0 0 24 24"
                  fill={i < item.my_vote ? 'currentColor' : 'none'}
                  stroke="currentColor" stroke-width="2">
                  <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
                </svg>
              {/each}
            </div>
          {/if}

          {#if type === 'history' && item.last_view_episode?.name}
            <span class="profile__card-sub">{item.last_view_episode.name}</span>
          {/if}
        </div>
      </button>
    {/each}
  </div>
</section>
