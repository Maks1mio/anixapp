<script lang="ts">
  import { navigate } from '../../../../stores/navigation';
  import { posterUrl } from '../../_utils';

  interface Props {
    friends: Record<string, unknown>[];
    totalCount: number;
    profileId: number;
    hasMore?: boolean;
  }

  let { friends, totalCount, profileId, hasMore = false }: Props = $props();

  const previewNames = $derived(
    friends.slice(0, 2).map((f) => String(f.login ?? '')).filter(Boolean),
  );

  const namesLine = $derived.by(() => {
    if (!previewNames.length) return '';
    const base = previewNames.join(', ');
    if (totalCount > previewNames.length || hasMore) return `${base} и другие`;
    return base;
  });
</script>

<button
  type="button"
  class="profile-v2__friends-strip"
  onclick={() => navigate(`/profile/${profileId}/friends`)}
>
  <div class="profile-v2__friends-strip-text">
    <strong>{totalCount} {totalCount === 1 ? 'друг' : totalCount < 5 ? 'друга' : 'друзей'}</strong>
    {#if namesLine}
      <span>{namesLine}</span>
    {/if}
  </div>

  <div class="profile-v2__friends-stack" aria-hidden="true">
    {#each friends.slice(0, 4) as fr, i}
      <span class="profile-v2__friends-stack-item" style="--stack-index:{i}">
        <span
          class="profile-v2__friends-stack-av"
          style={fr.avatar ? `background-image:url('${posterUrl(String(fr.avatar))}')` : ''}
        ></span>
        {#if fr.is_online}
          <span class="profile-v2__friends-stack-online"></span>
        {/if}
      </span>
    {/each}
  </div>
</button>
