<script lang="ts">
  import {
    EQ_BANDS,
    EQ_GAIN_MAX,
    EQ_GAIN_MIN,
    EQ_GAIN_STEP,
    formatEqGainBadge,
    type EqBandId,
    type EqGains,
  } from '../core/surround-audio';

  interface Props {
    gains: EqGains;
    level: number;
    onchange: (band: EqBandId, gainDb: number) => void;
    onchangeLevel: (gainDb: number) => void;
    onreset?: () => void;
  }

  let { gains, level, onchange, onchangeLevel, onreset }: Props = $props();

  let focusBand = $state<EqBandId | null>(null);
  let focusLevel = $state(false);

  const badgeDb = $derived.by(() => {
    if (focusLevel) return level;
    if (focusBand) return gains[focusBand] ?? 0;
    return level;
  });

  const badgeIsLevel = $derived(focusLevel || !focusBand);

  function pct(gain: number): number {
    const t = (gain - EQ_GAIN_MIN) / (EQ_GAIN_MAX - EQ_GAIN_MIN);
    return Math.max(0, Math.min(100, t * 100));
  }

  function onInput(band: EqBandId, e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    onchange(band, Number(el.value));
  }

  function onLevelInput(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    onchangeLevel(Number(el.value));
  }
</script>

<div class="eq-panel" role="group" aria-label="Эквалайзер">
  <div class="eq-panel__head">
    <span class="eq-panel__title">Эквалайзер</span>
    <div class="eq-panel__head-actions">
      {#if onreset}
        <button type="button" class="eq-panel__reset" onclick={() => onreset?.()}>Сброс</button>
      {/if}
      <span
        class="eq-panel__badge"
        class:eq-panel__badge--level={badgeIsLevel}
        aria-live="polite"
      >{badgeIsLevel ? `Level ${formatEqGainBadge(badgeDb)}` : formatEqGainBadge(badgeDb)}</span>
    </div>
  </div>

  <div class="eq-panel__body">
    <!-- Preamp / level — слева, визуально отделён от полос -->
    <label
      class="eq-band eq-band--level"
      class:eq-band--active={focusLevel}
      onpointerenter={() => { focusLevel = true; focusBand = null; }}
      onfocusin={() => { focusLevel = true; focusBand = null; }}
      onpointerleave={() => { focusLevel = false; }}
    >
      <div class="eq-band__track-wrap" style={`--eq-fill:${pct(level)}%`}>
        <span class="eq-band__rail" aria-hidden="true">
          <span class="eq-band__fill"></span>
        </span>
        <span class="eq-band__zero" aria-hidden="true"></span>
        <input
          type="range"
          class="eq-band__input"
          min={EQ_GAIN_MIN}
          max={EQ_GAIN_MAX}
          step={EQ_GAIN_STEP}
          value={level}
          aria-label="Усиление (level)"
          aria-valuemin={EQ_GAIN_MIN}
          aria-valuemax={EQ_GAIN_MAX}
          aria-valuenow={level}
          aria-valuetext={formatEqGainBadge(level)}
          oninput={onLevelInput}
          onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => e.stopPropagation()}
        />
      </div>
      <span class="eq-band__label">level</span>
    </label>

    <div class="eq-panel__scale" aria-hidden="true">
      <div class="eq-panel__scale-marks">
        <span class="eq-panel__scale-mark eq-panel__scale-mark--top">+12dB</span>
        <span class="eq-panel__scale-mark eq-panel__scale-mark--mid">0dB</span>
        <span class="eq-panel__scale-mark eq-panel__scale-mark--bot">−12dB</span>
      </div>
    </div>

    <div class="eq-panel__bands">
      {#each EQ_BANDS as band (band.id)}
        {@const gain = gains[band.id] ?? 0}
        <label
          class="eq-band"
          class:eq-band--active={focusBand === band.id}
          onpointerenter={() => { focusBand = band.id; focusLevel = false; }}
          onfocusin={() => { focusBand = band.id; focusLevel = false; }}
        >
          <div class="eq-band__track-wrap" style={`--eq-fill:${pct(gain)}%`}>
            <span class="eq-band__rail" aria-hidden="true">
              <span class="eq-band__fill"></span>
            </span>
            <span class="eq-band__zero" aria-hidden="true"></span>
            <input
              type="range"
              class="eq-band__input"
              min={EQ_GAIN_MIN}
              max={EQ_GAIN_MAX}
              step={EQ_GAIN_STEP}
              value={gain}
              aria-label={`${band.label} Hz`}
              aria-valuemin={EQ_GAIN_MIN}
              aria-valuemax={EQ_GAIN_MAX}
              aria-valuenow={gain}
              aria-valuetext={formatEqGainBadge(gain)}
              oninput={(e) => onInput(band.id, e)}
              onpointerdown={(e) => e.stopPropagation()}
              onclick={(e) => e.stopPropagation()}
            />
          </div>
          <span class="eq-band__label">{band.label}</span>
        </label>
      {/each}
    </div>
  </div>
</div>

<style>
  .eq-panel {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    min-width: 0;
    color: var(--uiv2-popup-fg, var(--uikit-v2-text));
  }

  .eq-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0 0.15rem;
  }

  .eq-panel__title {
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .eq-panel__head-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .eq-panel__reset {
    height: 1.45rem;
    padding: 0 0.5rem;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--uikit-v2-text) 10%, transparent);
    color: var(--uiv2-fg-muted, color-mix(in srgb, var(--uikit-v2-text) 70%, transparent));
    font-size: 0.6875rem;
    font-weight: 500;
    cursor: pointer;
  }

  .eq-panel__reset:hover {
    background: color-mix(in srgb, var(--uikit-v2-text) 16%, transparent);
    color: var(--uiv2-popup-fg, var(--uikit-v2-text));
  }

  .eq-panel__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 3.6rem;
    height: 1.45rem;
    padding: 0 0.55rem;
    border-radius: 0.45rem;
    background: color-mix(in srgb, var(--uikit-v2-text) 10%, transparent);
    color: var(--uiv2-popup-fg, var(--uikit-v2-text));
    font-size: 0.6875rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .eq-panel__badge--level {
    background: color-mix(in srgb, #fff 18%, transparent);
    color: #fff;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, #fff 28%, transparent);
    font-weight: 700;
  }

  .eq-panel__body {
    display: flex;
    gap: 0.35rem;
    align-items: flex-start;
  }

  .eq-panel__scale {
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
    width: 2.35rem;
    font-size: 0.625rem;
    line-height: 1;
    color: var(--uiv2-fg-muted, color-mix(in srgb, var(--uikit-v2-text) 55%, transparent));
    font-variant-numeric: tabular-nums;
    user-select: none;
  }

  .eq-panel__scale-marks {
    position: relative;
    height: 9.25rem;
    flex: 0 0 9.25rem;
  }

  .eq-panel__scale-mark {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
  }

  .eq-panel__scale-mark--top {
    top: 0.45rem;
    transform: translateY(-50%);
  }

  .eq-panel__scale-mark--mid {
    top: 50%;
    transform: translateY(-50%);
  }

  .eq-panel__scale-mark--bot {
    bottom: 0.45rem;
    transform: translateY(50%);
  }

  .eq-panel__bands {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.1rem;
    justify-content: space-between;
    padding-left: 0.35rem;
    border-left: 1px solid color-mix(in srgb, var(--uikit-v2-text) 12%, transparent);
  }

  .eq-band {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    flex: 1 1 0;
    min-width: 0;
    cursor: pointer;
  }

  .eq-band--level {
    flex: 0 0 1.85rem;
    margin-right: 0.1rem;
  }

  .eq-band--level .eq-band__rail {
    width: 0.4rem;
    background: color-mix(in srgb, #fff 22%, transparent);
  }

  .eq-band--level .eq-band__fill {
    background: #fff;
  }

  .eq-band--level .eq-band__input {
    width: 1.85rem;
  }

  .eq-band--level .eq-band__input::-webkit-slider-thumb {
    width: 1.05rem;
    height: 1.05rem;
    margin-left: -0.325rem;
    background: #fff;
    box-shadow:
      0 1px 5px rgba(0, 0, 0, 0.5),
      0 0 0 2px rgba(255, 255, 255, 0.35);
  }

  .eq-band--level .eq-band__input::-moz-range-thumb {
    width: 1.05rem;
    height: 1.05rem;
    background: #fff;
    box-shadow:
      0 1px 5px rgba(0, 0, 0, 0.5),
      0 0 0 2px rgba(255, 255, 255, 0.35);
  }

  .eq-band--level .eq-band__label {
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #fff;
    opacity: 0.92;
  }

  .eq-band__track-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 9.25rem;
  }

  .eq-band__rail {
    position: absolute;
    top: 0.45rem;
    bottom: 0.45rem;
    left: 50%;
    width: 0.28rem;
    transform: translateX(-50%);
    border-radius: 999px;
    background: color-mix(in srgb, var(--uikit-v2-text) 16%, transparent);
    overflow: hidden;
    pointer-events: none;
  }

  .eq-band__fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--eq-fill, 50%);
    border-radius: 999px;
    background: #fff;
  }

  .eq-band__zero {
    position: absolute;
    left: 18%;
    right: 18%;
    top: 50%;
    height: 1px;
    background: color-mix(in srgb, var(--uikit-v2-text) 18%, transparent);
    pointer-events: none;
    z-index: 1;
  }

  .eq-band__input {
    -webkit-appearance: none;
    appearance: none;
    writing-mode: vertical-lr;
    direction: rtl;
    width: 1.65rem;
    height: 9.25rem;
    margin: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
    position: relative;
    z-index: 2;
  }

  .eq-band__input::-webkit-slider-runnable-track {
    width: 0.28rem;
    border-radius: 999px;
    background: transparent;
  }

  .eq-band__input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 0.9rem;
    height: 0.9rem;
    margin-left: -0.31rem;
    border-radius: 50%;
    border: 0;
    background: #fff;
    opacity: 1;
    box-shadow:
      0 1px 4px color-mix(in srgb, #000 40%, transparent),
      0 0 0 1px color-mix(in srgb, var(--uikit-v2-text) 14%, transparent);
  }

  .eq-band--active .eq-band__input::-webkit-slider-thumb {
    background: #fff;
    box-shadow:
      0 1px 5px color-mix(in srgb, #000 45%, transparent),
      0 0 0 1px color-mix(in srgb, var(--uikit-v2-text) 18%, transparent);
  }

  .eq-band__input::-moz-range-track {
    width: 0.28rem;
    border-radius: 999px;
    background: transparent;
  }

  .eq-band__input::-moz-range-progress {
    width: 0.28rem;
    border-radius: 999px;
    background: transparent;
  }

  .eq-band__input::-moz-range-thumb {
    width: 0.9rem;
    height: 0.9rem;
    border: 0;
    border-radius: 50%;
    background: #fff;
    opacity: 1;
    box-shadow:
      0 1px 4px color-mix(in srgb, #000 40%, transparent),
      0 0 0 1px color-mix(in srgb, var(--uikit-v2-text) 14%, transparent);
  }

  .eq-band--active .eq-band__input::-moz-range-thumb {
    background: #fff;
  }

  .eq-band__label {
    font-size: 0.625rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--uiv2-fg-muted, color-mix(in srgb, var(--uikit-v2-text) 60%, transparent));
    line-height: 1;
    user-select: none;
  }

  .eq-band--active .eq-band__label {
    color: var(--uiv2-popup-fg, var(--uikit-v2-text));
  }
</style>
