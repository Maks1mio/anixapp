<script lang="ts">
  import { navigate } from '../../../../stores/navigation';
  import { fmtHistoryEpisodeMeta, posterUrl } from '../../_utils';

  interface Props { items: Record<string, unknown>[]; }
  let { items }: Props = $props();
</script>

<section class="profile-v2__recent">
  <ul class="profile-v2__recent-list">
    {#each items as item}
      <li>
        <button type="button" class="profile-v2__recent-row" onclick={() => navigate(`/release/${item.id}`)}>
          {#if item.image}
            <span
              class="profile-v2__recent-poster"
              style="background-image:url('{posterUrl(String(item.image))}')"
            ></span>
          {:else}
            <span class="profile-v2__recent-poster"></span>
          {/if}
          <span class="profile-v2__recent-body">
            <span class="profile-v2__recent-title">{item.title_ru || item.title_original || 'Без названия'}</span>
            <span class="profile-v2__recent-meta">{fmtHistoryEpisodeMeta(item)}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
</section>
