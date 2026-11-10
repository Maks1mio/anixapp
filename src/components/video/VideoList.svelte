<script lang="ts">
  /** Список видео строками (RecyclerView из item_video_list): профиль, «все видео» */
  import VideoListItem from './VideoListItem.svelte';
  import type { ReleaseVideoItem } from '../../views/Release/_videoUtils';

  interface Props {
    videos: ReleaseVideoItem[];
    onFavoriteChange?: (video: ReleaseVideoItem, isFavorite: boolean) => void;
  }

  let { videos, onFavoriteChange }: Props = $props();
</script>

<div class="video-list">
  {#each videos as video (video.id)}
    <VideoListItem {video} {onFavoriteChange} />
  {/each}
</div>

<style lang="scss">
  .video-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }
</style>
