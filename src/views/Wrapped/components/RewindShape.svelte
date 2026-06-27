<script lang="ts" module>
  function starPath(spikes: number, innerRatio: number): string {
    const cx = 50;
    const cy = 50;
    const R = 50;
    const r = R * innerRatio;
    const step = Math.PI / spikes;
    let d = '';
    for (let i = 0; i < spikes * 2; i++) {
      const rad = i % 2 === 0 ? R : r;
      const a = i * step - Math.PI / 2;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
    }
    return `${d}Z`;
  }

  const STAR = starPath(18, 0.76);

  // Цветок-«облако» из 4 крупных лепестков (assets/Monogram/1.svg)
  const FLOWER =
    'M270 540C120.883 540 0 419.117 0 270C0 120.883 120.883 0 270 0C419.117 0 540 120.883 540 270C540 120.883 660.883 0 810 0C959.117 0 1080 120.883 1080 270C1080 419.117 959.117 540 810 540C959.117 540 1080 660.883 1080 810C1080 959.117 959.117 1080 810 1080C660.883 1080 540 959.117 540 810C540 959.117 419.117 1080 270 1080C120.883 1080 0 959.117 0 810C0 660.883 120.883 540 270 540Z';

  // Баннер-стрелка со ступенчатыми краями (сцена «Тайтлы»)
  const ARROW =
    'M8 8 L30 8 L30 0 L70 0 L70 8 L92 8 L100 30 L92 52 L70 52 L70 60 L30 60 L30 52 L8 52 L0 30 Z';
</script>

<script lang="ts">
  import type { RewindHeroShape } from '../shared/rewind-scenes';

  interface Props {
    shape: RewindHeroShape;
    color: string;
  }
  let { shape, color }: Props = $props();

  const viewBox = $derived(
    shape === 'flower' ? '0 0 1080 1080' : shape === 'arrow' ? '0 0 100 60' : '0 0 100 100',
  );
  const d = $derived(shape === 'flower' ? FLOWER : shape === 'arrow' ? ARROW : STAR);
</script>

{#if shape !== 'none'}
  <svg
    class="rewind-hero rewind-hero--{shape}"
    {viewBox}
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
  >
    <path {d} fill={color} />
  </svg>
{/if}

<style>
  .rewind-hero {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
</style>
