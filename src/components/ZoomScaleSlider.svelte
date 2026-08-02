<script lang="ts">
  import { ZOOM_LEVELS, normalizeZoom, type ZoomLevel } from '../utils/zoom';

  interface Props {
    value: number;
    onChange: (value: ZoomLevel) => void;
  }

  let { value, onChange }: Props = $props();

  const levels = ZOOM_LEVELS;
  const maxIndex = levels.length - 1;
  const current = $derived(normalizeZoom(value));
  const sliderIndex = $derived(levels.indexOf(current));
  const fillPercent = $derived((sliderIndex / maxIndex) * 100);

  function handleInput(e: Event) {
    const idx = Number((e.target as HTMLInputElement).value);
    onChange(levels[idx]);
  }
</script>

<div class="zoom-scale">
  <div class="zoom-scale__row">
    <input
      type="range"
      class="zoom-scale__input"
      style="--zoom-fill: {fillPercent}%"
      min="0"
      max={maxIndex}
      step="1"
      value={sliderIndex}
      aria-label="Уровень масштабирования"
      aria-valuemin={levels[0]}
      aria-valuemax={levels[maxIndex]}
      aria-valuenow={current}
      aria-valuetext="{current}%"
      oninput={handleInput}
    />
    <span class="zoom-scale__value" aria-hidden="true">{current}%</span>
  </div>

  <div class="zoom-scale__ends" aria-hidden="true">
    <span>{levels[0]}%</span>
    <span>{levels[maxIndex]}%</span>
  </div>
</div>
