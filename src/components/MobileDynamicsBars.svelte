<script lang="ts">
  /**
   * «Динамика просмотра серий» на Android (как в Anixart): столбик на день, число над ним, дата снизу,
   * горизонтальная прокрутка; при открытии видны последние дни. Один ряд данных — без легенды.
   */
  interface Props {
    watchDynamics: unknown[];
  }
  let { watchDynamics }: Props = $props();

  const points = $derived.by(() =>
    watchDynamics
      .map((d) => {
        const row = d as { count?: number; timestamp?: number };
        const ts = Number(row.timestamp ?? 0);
        return { count: Math.max(0, Number(row.count ?? 0)), ms: ts < 1e12 ? ts * 1000 : ts };
      })
      .filter((p) => Number.isFinite(p.count) && p.ms > 0)
      .sort((a, b) => a.ms - b.ms),
  );
  const max = $derived(Math.max(1, ...points.map((p) => p.count)));

  function label(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  let track = $state<HTMLElement | null>(null);
  $effect(() => {
    if (track && points.length) track.scrollLeft = track.scrollWidth;
  });
</script>

<div class="m-dyn" bind:this={track} role="img" aria-label={`Серий по дням: ${points.map((p) => `${label(p.ms)} — ${p.count}`).join(', ')}`}>
  <div class="m-dyn__plot">
    {#each points as p (p.ms)}
      <div class="m-dyn__col">
        <span class="m-dyn__box">
          <span class="m-dyn__value">{p.count}</span>
          <span class="m-dyn__bar" style={`height:max(4px, calc((100% - 22px) * ${(p.count / max).toFixed(4)}))`}></span>
        </span>
        <span class="m-dyn__date">{label(p.ms)}</span>
      </div>
    {/each}
  </div>
</div>
