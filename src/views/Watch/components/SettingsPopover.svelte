<script lang="ts">
  import {
    DEFAULT_PLAYBACK_RATE,
    PLAYBACK_RATE_MAX,
    PLAYBACK_RATE_MIN,
    PLAYBACK_RATE_STEP,
    PLAYBACK_RATE_WARN,
    clampPlaybackRate,
    formatPlaybackRate,
    stepPlaybackRate,
  } from '../../../utils/player-hotkeys';

  interface Props {
    gpuAvailable:       boolean;
    upscaleEnabled:     boolean;
    playbackRate:       number;
    aspectRatio:        string;
    availableQualities: Record<string, string>;
    currentQuality:     string;
    speedLocked?:       boolean;
    ontoggleUpscale:    () => void;
    onchangeRate:       (r: number) => void;
    onchangeAspect:     (a: string) => void;
    onchangeQuality:    (q: string) => void;
  }

  let {
    gpuAvailable, upscaleEnabled,
    playbackRate, aspectRatio,
    availableQualities, currentQuality,
    speedLocked = false,
    ontoggleUpscale, onchangeRate, onchangeAspect, onchangeQuality,
  }: Props = $props();

  const ASPECTS = [
    { value: 'auto', label: 'Авто' },
    { value: '16/9', label: '16:9' },
    { value: '4/3',  label: '4:3'  },
    { value: '21/9', label: '21:9' },
  ];

  const sortedQualities = $derived.by(() => {
    return Object.keys(availableQualities).sort((a, b) => {
      const numA = parseInt(a, 10) || 0;
      const numB = parseInt(b, 10) || 0;
      return numB - numA;
    });
  });

  const hasQualities = $derived(sortedQualities.length > 1);
  const rate = $derived(clampPlaybackRate(playbackRate));
  const isFast = $derived(rate > PLAYBACK_RATE_WARN);
  const canReset = $derived(rate !== DEFAULT_PLAYBACK_RATE);
  const fillPercent = $derived(
    ((rate - PLAYBACK_RATE_MIN) / (PLAYBACK_RATE_MAX - PLAYBACK_RATE_MIN)) * 100,
  );
  const warnMarkPercent = $derived(
    ((PLAYBACK_RATE_WARN - PLAYBACK_RATE_MIN) / (PLAYBACK_RATE_MAX - PLAYBACK_RATE_MIN)) * 100,
  );

  function setRate(next: number) {
    if (speedLocked) return;
    onchangeRate(clampPlaybackRate(next));
  }

  function onSliderInput(e: Event) {
    if (speedLocked) return;
    setRate(Number((e.target as HTMLInputElement).value));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="watch-panel watch-panel--settings">

  <div class="watch-panel__header">
    <span class="watch-panel__title">Настройки</span>
  </div>

  <div class="watch-panel__settings-body">

    {#if hasQualities}
      <div class="watch-panel__setting-row">
        <div class="watch-panel__setting-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          Качество
        </div>
        <div class="watch-panel__setting-chips">
          {#each sortedQualities as q (q)}
            <button
              type="button"
              class="watch-panel__chip {currentQuality === q ? 'watch-panel__chip--active' : ''}"
              onclick={(e) => { e.stopPropagation(); onchangeQuality(q); }}
            >{q}p</button>
          {/each}
        </div>
      </div>
    {/if}

    {#if gpuAvailable}
      <div class="watch-panel__setting-row watch-panel__setting-row--toggle">
        <div class="watch-panel__setting-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>
            <path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>
          </svg>
          Улучшение качества
        </div>
        <div
          role="switch"
          tabindex="0"
          aria-checked={upscaleEnabled}
          class="watch-panel__toggle {upscaleEnabled ? 'watch-panel__toggle--on' : ''}"
          onclick={(e) => { e.stopPropagation(); ontoggleUpscale(); }}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); ontoggleUpscale(); } }}
        ></div>
      </div>
    {/if}

    <div class="watch-panel__setting-row">
      <div class="watch-panel__setting-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="20" height="16" x="2" y="4" rx="2"/>
          <path d="M12 12H8"/>
          <path d="M17 9H7"/>
        </svg>
        Соотношение сторон
      </div>
      <div class="watch-panel__setting-chips">
        {#each ASPECTS as opt (opt.value)}
          <button
            type="button"
            class="watch-panel__chip {aspectRatio === opt.value ? 'watch-panel__chip--active' : ''}"
            onclick={(e) => { e.stopPropagation(); onchangeAspect(opt.value); }}
          >{opt.label}</button>
        {/each}
      </div>
    </div>

    <div class="watch-panel__setting-row">
      <div class="watch-panel__setting-label-row">
        <div class="watch-panel__setting-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15.6 2.7a10 10 0 1 0 5.7 5.7"/>
            <circle cx="12" cy="12" r="2"/>
            <path d="M13.4 10.6 19 5"/>
          </svg>
          Скорость
        </div>
        <button
          type="button"
          class="watch-speed__reset"
          disabled={!canReset || speedLocked}
          onclick={(e) => { e.stopPropagation(); setRate(DEFAULT_PLAYBACK_RATE); }}
        >Сброс</button>
      </div>

      <div class="watch-speed" class:watch-speed--fast={isFast && !speedLocked} class:watch-speed--locked={speedLocked}>
        <div class="watch-speed__value">{formatPlaybackRate(rate)}</div>
        {#if speedLocked}
          <p class="watch-speed__locked-hint" role="status">
            В совместном просмотре скорость всегда 1×.
          </p>
        {:else}
          <div class="watch-speed__row">
            <button
              type="button"
              class="watch-speed__step"
              aria-label="Замедлить"
              disabled={rate <= PLAYBACK_RATE_MIN}
              onclick={(e) => { e.stopPropagation(); setRate(stepPlaybackRate(rate, -1)); }}
            >−</button>
            <div class="watch-speed__track-wrap">
              <input
                type="range"
                class="watch-speed__input"
                style="--speed-fill: {fillPercent}%; --speed-warn: {warnMarkPercent}%"
                min={PLAYBACK_RATE_MIN}
                max={PLAYBACK_RATE_MAX}
                step={PLAYBACK_RATE_STEP}
                value={rate}
                aria-label="Скорость воспроизведения"
                aria-valuemin={PLAYBACK_RATE_MIN}
                aria-valuemax={PLAYBACK_RATE_MAX}
                aria-valuenow={rate}
                aria-valuetext={formatPlaybackRate(rate)}
                oninput={onSliderInput}
                onclick={(e) => e.stopPropagation()}
              />
            </div>
            <button
              type="button"
              class="watch-speed__step"
              aria-label="Ускорить"
              disabled={rate >= PLAYBACK_RATE_MAX}
              onclick={(e) => { e.stopPropagation(); setRate(stepPlaybackRate(rate, 1)); }}
            >+</button>
          </div>
          <div class="watch-speed__ends" aria-hidden="true">
            <span>{PLAYBACK_RATE_MIN}×</span>
            <span>{PLAYBACK_RATE_MAX}×</span>
          </div>
          {#if isFast}
            <p class="watch-speed__warn" role="status">
              Выше 2× плеер может не успевать буферизировать видео.
            </p>
          {/if}
        {/if}
      </div>
    </div>

  </div>
</div>
