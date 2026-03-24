<script lang="ts">
  interface Props {
    paused:  boolean;
    onplay:  () => void;
  }

  let { paused, onplay }: Props = $props();
</script>

<div class="watch-page__center-play" class:watch-page__center-play--hidden={!paused}>
  <button
    type="button"
    class="watch-page__center-play-btn"
    aria-label="Воспроизвести"
    onclick={onplay}
  >
    <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  </button>
</div>
