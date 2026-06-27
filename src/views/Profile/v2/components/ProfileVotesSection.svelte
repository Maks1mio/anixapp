<script lang="ts">
  import { navigate } from '../../../../stores/navigation';
  import { posterUrl } from '../../_utils';

  interface Props {
    items: Record<string, unknown>[];
    profileId: number;
    onViewAll?: () => void;
  }

  let { items, onViewAll }: Props = $props();
</script>

<div class="profile-v2__votes">
  {#if onViewAll}
    <div class="profile-v2__section-head">
      <button type="button" class="profile-v2__link" onclick={onViewAll}>Показать всё</button>
    </div>
  {/if}

  <div class="profile__hscroll">
    <div class="profile__hscroll-track">
      {#each items as item}
        <button type="button" class="profile__card" onclick={() => navigate(`/release/${item.id}`)}>
          {#if item.image}
            <div class="profile__card-poster" style="background-image:url('{posterUrl(String(item.image))}')"></div>
          {:else}
            <div class="profile__card-poster"></div>
          {/if}
          <div class="profile__card-body">
            <span class="profile__card-title">{item.title_ru || item.title_original || 'Без названия'}</span>
            {#if item.my_vote}
              <div class="profile__card-stars" aria-label="Оценка {item.my_vote} из 5">
                {#each Array.from({ length: 5 }, (_, i) => i) as i}
                  <svg width="10" height="10" viewBox="0 0 24 24"
                    fill={i < Number(item.my_vote) ? 'currentColor' : 'none'}
                    stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
                  </svg>
                {/each}
              </div>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  </div>
</div>
