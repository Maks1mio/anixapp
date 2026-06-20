<script lang="ts">
  import { ZOOM_LEVELS, normalizeZoom, type ZoomLevel } from '../utils/zoom';

  interface Props {
    value: number;
    onChange: (value: ZoomLevel) => void;
  }

  let { value, onChange }: Props = $props();

  const levels = ZOOM_LEVELS;
  const maxIndex = levels.length - 1;

  const sliderIndex = $derived(levels.indexOf(normalizeZoom(value)));
  const fillPercent = $derived((sliderIndex / maxIndex) * 100);

  function handleInput(e: Event) {
    const idx = Number((e.target as HTMLInputElement).value);
    onChange(levels[idx]);
  }
</script>

<div class="zoom-scale">
  <div class="zoom-scale__ticks" aria-hidden="true">
    {#each levels as level, i}
      <span
        class="zoom-scale__tick"
        class:zoom-scale__tick--active={level === normalizeZoom(value)}
        class:zoom-scale__tick--default={level === 100}
        style="left: {(i / maxIndex) * 100}%"
      >
        {level}
      </span>
    {/each}
  </div>

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
    aria-valuenow={normalizeZoom(value)}
    aria-valuetext="{normalizeZoom(value)}%"
    oninput={handleInput}
  />
</div>
