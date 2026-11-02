<script lang="ts">
  import TvInputGlyph from './TvInputGlyph.svelte';
  import { tvInputDevice, type TvStick } from '../../services/tv-input';
  import { tvWheelIndex } from '../../tv/typingWheel';

  /** Круг символов под одним стиком: наклон выбирает сектор, триггер вводит. */
  interface Props {
    side: 'left' | 'right';
    chars: string[];
    stick: TvStick;
    /** Счётчик ввода с этого колеса — короткая вспышка выбранной буквы. */
    pulse?: number;
  }

  let { side, chars, stick, pulse = 0 }: Props = $props();

  const selected = $derived(tvWheelIndex(stick, chars.length));
  const step = $derived(360 / Math.max(chars.length, 1));
  /** Курсор следует за стиком, но не выходит за кольцо букв. */
  const cursor = $derived.by(() => {
    const len = Math.hypot(stick.x, stick.y);
    const k = len > 1 ? 1 / len : 1;
    return { x: stick.x * k * 34, y: stick.y * k * 34 };
  });
</script>

<div class="tv-wheel tv-wheel--{side}" class:tv-wheel--armed={selected >= 0}>
  <div class="tv-wheel__ring">
    {#if selected >= 0}
      <span class="tv-wheel__sector" style:--a="{selected * step}deg" style:--w="{step}deg" aria-hidden="true"></span>
    {/if}
    {#each chars as ch, i (ch)}
      <span
        class="tv-wheel__char"
        class:tv-wheel__char--on={i === selected}
        style:--a="{i * step}deg"
      >{ch}</span>
    {/each}
    <span class="tv-wheel__cursor" style:left="{50 + cursor.x}%" style:top="{50 + cursor.y}%" aria-hidden="true"></span>
    <span class="tv-wheel__center">
      {#key pulse}
        <span class="tv-wheel__picked" class:tv-wheel__picked--flash={pulse > 0}>{selected >= 0 ? chars[selected] : ''}</span>
      {/key}
    </span>
  </div>
  <span class="tv-wheel__hint">
    <TvInputGlyph button={side === 'left' ? 'prev-ep' : 'next-ep'} device={$tvInputDevice} />
    ввод
  </span>
</div>
