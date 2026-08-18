<script lang="ts">
  import UiV2Tooltip from '../../../components/uikit-v2/UiV2Tooltip.svelte';
  import type { SkipMarkKind, TimelineSausage } from '../_skipMarks';
  import { sausagePlayedPct, sausageRangeFill } from '../_skipMarks';
  import { fmtTime } from '../_utils';

  const SKIP_ROW_OUT_MS = 540;

  interface Props {
    currentTime: string;
    totalTime: string;
    progressPct: number;
    bufferedPct: number;
    bufferedRanges?: { startPct: number; endPct: number }[];
    duration?: number;
    sausages?: TimelineSausage[];
    skipPrompt?: SkipMarkKind | null;
    skipNextEp?: number | null;
    skipCountdownPct?: number;
    watchCountdownPct?: number;
    onseek: (e: MouseEvent) => void;
    onskipMark?: () => void;
    onwatchSkip?: () => void;
  }

  let {
    currentTime, progressPct, bufferedPct, bufferedRanges = [], duration = 0,
    sausages = [],
    skipPrompt = null, skipNextEp = null, skipCountdownPct = 0, watchCountdownPct = 0,
    onseek, onskipMark, onwatchSkip,
  }: Props = $props();

  let hovering = $state(false);
  let hoverPct = $state(0);
  const hoverTime = $derived(fmtTime((hoverPct / 100) * duration));

  let skipRowOn = $state(false);
  let skipRowIn = $state(false);
  let skipRowKind = $state<SkipMarkKind | null>(null);
  let skipRowNextEp = $state<number | null>(null);
  const wantSkipRow = $derived(!!skipPrompt);

  $effect(() => {
    if (skipPrompt) {
      skipRowKind = skipPrompt;
      skipRowNextEp = skipNextEp;
    }
  });

  $effect(() => {
    if (wantSkipRow) {
      skipRowOn = true;
      skipRowIn = false;
      const id = requestAnimationFrame(() => {
        skipRowIn = true;
      });
      return () => cancelAnimationFrame(id);
    }
    skipRowIn = false;
    if (!skipRowOn) return;
    const t = window.setTimeout(() => { skipRowOn = false; }, SKIP_ROW_OUT_MS);
    return () => window.clearTimeout(t);
  });

  const watchLabel = $derived(skipRowKind === 'ending' ? 'Смотреть эндинг' : 'Смотреть опенинг');
  const skipLabel = $derived(
    skipRowNextEp != null ? `Следующая серия ${skipRowNextEp}` : 'Пропустить',
  );
  const track = $derived(
    sausages.length > 0
      ? sausages
      : [{ id: 'all', startPct: 0, widthPct: 100, kind: 'content' as const }],
  );
  const bufferBands = $derived(
    bufferedRanges.length > 0
      ? bufferedRanges
      : bufferedPct > 0.2
        ? [{ startPct: 0, endPct: bufferedPct }]
        : [],
  );

  function hoverFromEvent(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0)) return;
    hoverPct = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    hovering = true;
  }
</script>

<div class="watch-page__timeline-row">
  {#if skipRowOn && onskipMark && onwatchSkip}
    <div
      class="watch-page__skip-row"
      class:watch-page__skip-row--in={skipRowIn}
      class:watch-page__skip-row--out={!skipRowIn}
    >
      <button
        type="button"
        class="watch-page__skip-watch"
        aria-label={watchLabel}
        onclick={(e) => { e.stopPropagation(); onwatchSkip(); }}
      >
        {#if watchCountdownPct > 0}
          <span
            class="watch-page__skip-watch-fill"
            style={`width:${watchCountdownPct}%`}
            aria-hidden="true"
          ></span>
        {/if}
        <span class="watch-page__skip-watch-label">{watchLabel}</span>
      </button>
      <button
        type="button"
        class="watch-page__skip-go"
        aria-label={skipLabel}
        onclick={(e) => { e.stopPropagation(); onskipMark(); }}
      >
        {#if skipCountdownPct > 0}
          <span
            class="watch-page__skip-go-fill"
            style={`width:${skipCountdownPct}%`}
            aria-hidden="true"
          ></span>
        {/if}
        <span class="watch-page__skip-go-label">{skipLabel}</span>
      </button>
    </div>
  {/if}

  <UiV2Tooltip
    text={hoverTime}
    placement="top"
    followCursor
    block
    showDelay={0}
    hideDelay={0}
    disabled={duration <= 0}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="watch-page__progress-wrap"
      onclick={onseek}
      onmousemove={hoverFromEvent}
      onmouseenter={hoverFromEvent}
      onmouseleave={() => { hovering = false; }}
      role="slider"
      aria-label="Позиция воспроизведения"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progressPct)}
      aria-valuetext={currentTime}
      tabindex="0"
    >
      <div class="watch-page__sausages">
        {#each track as s (s.id)}
          {@const played = sausagePlayedPct(s, progressPct)}
          <div
            class="watch-page__sausage"
            class:watch-page__sausage--opening={s.kind === 'opening'}
            class:watch-page__sausage--ending={s.kind === 'ending'}
            style={`flex-grow:${Math.max(s.widthPct, 0.35)}`}
          >
            {#each bufferBands as br (`${s.id}-${br.startPct}-${br.endPct}`)}
              {@const slice = sausageRangeFill(s, br.startPct, br.endPct)}
              {#if slice}
                <div
                  class="watch-page__sausage-buf"
                  class:watch-page__sausage-buf--skip={s.kind !== 'content'}
                  style={`left:${slice.leftPct}%;width:${slice.widthPct}%`}
                ></div>
              {/if}
            {/each}
            {#if played > 0.2}
              <div
                class="watch-page__sausage-play"
                class:watch-page__sausage-play--skip={s.kind !== 'content'}
                style={`width:${played}%`}
              ></div>
            {/if}
          </div>
        {/each}
      </div>
      {#if hovering && duration > 0}
        <div
          class="watch-page__seek-line"
          style={`left:${hoverPct}%`}
          aria-hidden="true"
        ></div>
      {/if}
    </div>
  </UiV2Tooltip>
</div>
