<script lang="ts">
  interface Props {
    currentTime: string;
    totalTime:   string;
    progressPct: number;
    bufferedPct: number;
    onseek:      (e: MouseEvent) => void;
  }
  let { currentTime, totalTime, progressPct, bufferedPct, onseek }: Props = $props();
</script>

<div class="watch-page__timeline-row">

  <!-- Times above the bar -->
  <div class="watch-page__times">
    <span class="watch-page__time-label">{currentTime}</span>
    <span class="watch-page__time-label">{totalTime}</span>
  </div>

  <!-- Progress bar -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="watch-page__progress-wrap"
    onclick={onseek}
    role="slider"
    aria-valuenow={progressPct}
    tabindex="0"
  >
    <div
      class="watch-page__timeline"
      style="--progress-position:{progressPct}%; --loaded-position:{bufferedPct}%"
    >
      <div class="watch-page__timeline-loaded" style="width:{bufferedPct}%"></div>
      <div class="watch-page__progress-bar"    style="width:{progressPct}%"></div>
      <div class="watch-page__timeline-dot"></div>
    </div>
  </div>

</div>
