<script lang="ts">
  interface Props {
    currentTime: string;
    totalTime:   string;
    progressPct: number;
    bufferedPct: number;
    skipSegments?: Array<{ startPct: number; widthPct: number; kind: 'opening' | 'ending' }>;
    skipDotActive?: boolean;
    onseek:      (e: MouseEvent) => void;
  }
  let { currentTime, totalTime, progressPct, bufferedPct, skipSegments = [], skipDotActive = false, onseek }: Props = $props();
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
    aria-valuetext={skipSegments.length
      ? `${currentTime} из ${totalTime}, отмечены опенинг и эндинг`
      : undefined}
    tabindex="0"
  >
    <div
      class="watch-page__timeline"
      style="--progress-position:{progressPct}%; --loaded-position:{bufferedPct}%"
    >
      <div class="watch-page__timeline-loaded" style="width:{bufferedPct}%"></div>
      <div class="watch-page__progress-bar"    style="width:{progressPct}%"></div>
      {#each skipSegments as seg (seg.kind)}
        <div
          class="watch-page__timeline-skip"
          class:watch-page__timeline-skip--opening={seg.kind === 'opening'}
          class:watch-page__timeline-skip--ending={seg.kind === 'ending'}
          style="left:{seg.startPct}%; width:{seg.widthPct}%"
          title={seg.kind === 'opening' ? 'Опенинг' : 'Эндинг'}
        ></div>
      {/each}
      <div class="watch-page__timeline-dot" class:watch-page__timeline-dot--skip={skipDotActive}></div>
    </div>
  </div>

</div>
