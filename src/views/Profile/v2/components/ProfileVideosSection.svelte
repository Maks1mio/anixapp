<script lang="ts">
  import { navigate } from '../../../../stores/navigation';
  import { posterUrl } from '../../_utils';

  interface Props { items: Record<string, unknown>[]; }
  let { items }: Props = $props();
</script>

<div class="profile-v2__videos">
  <div class="profile__hscroll">
    <div class="profile__hscroll-track profile-v2__video-track">
      {#each items as item}
        {@const releaseId = item.release_id ?? (item.release as { id?: number } | undefined)?.id}
        <button
          type="button"
          class="profile-v2__video-card"
          onclick={() => releaseId && navigate(`/release/${releaseId}`)}
        >
          {#if item.image || item.preview}
            <div
              class="profile-v2__video-thumb"
              style="background-image:url('{posterUrl(String(item.image ?? item.preview))}')"
            ></div>
          {:else}
            <div class="profile-v2__video-thumb"></div>
          {/if}
          <span class="profile-v2__video-title">{item.title ?? item.name ?? 'Видео'}</span>
        </button>
      {/each}
    </div>
  </div>
</div>
