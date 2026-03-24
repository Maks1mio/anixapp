<script lang="ts">
  import { onDestroy } from 'svelte';

  interface Props { watchDynamics: any[]; }
  let { watchDynamics }: Props = $props();

  type DynamicsPoint = { count: number; timestamp: number };

  function getDynamicsData(): DynamicsPoint[] {
    return (watchDynamics as Array<{ count?: number; timestamp?: number }>)
      .map(d => ({ count: Number(d.count ?? 0), timestamp: Number(d.timestamp ?? 0) }))
      .filter(d => Number.isFinite(d.count) && Number.isFinite(d.timestamp) && d.timestamp > 0);
  }

  function buildGeometry(data: DynamicsPoint[]) {
    const w = 800, h = 110, padL = 26, padR = 8, padT = 8, padB = 36;
    const maxVal = Math.max(...data.map(d => d.count), 1);
    const n = data.length;
    const iw = w - padL - padR;
    const ih = h - padT - padB;
    const px = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const py = (v: number) => padT + (1 - v / maxVal) * ih;
    const points = data.map((d, i) => ({ x: px(i), y: py(d.count), ...d }));
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${points[n - 1].x.toFixed(1)},${(h - padB).toFixed(1)} L${points[0].x.toFixed(1)},${(h - padB).toFixed(1)} Z`;
    return { w, h, padL, padR, padT, padB, ih, maxVal, points, linePath, areaPath };
  }

  function fmtTooltip(ts: number, count: number): string {
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    return `${count} серий · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function shouldShowLabel(index: number, total: number): boolean {
    const step = Math.max(1, Math.floor(total / 7));
    return index % step === 0 || index === total - 1;
  }

  let hoverIndex    = $state<number | null>(null);
  let svgEl         = $state<SVGSVGElement | null>(null);
  let tooltipEl: HTMLDivElement | null = null;

  function ensureTooltip() {
    if (tooltipEl || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'profile__chart-tooltip';
    el.style.display = 'none';
    document.body.appendChild(el);
    tooltipEl = el;
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none';
  }

  function onMouseMove(e: MouseEvent, chart: ReturnType<typeof buildGeometry>) {
    if (!svgEl || !chart.points.length) return;
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((e.clientX - rect.left) / rect.width) * chart.w;
    let nearest = 0, best = Infinity;
    for (let i = 0; i < chart.points.length; i++) {
      const dx = Math.abs(chart.points[i].x - x);
      if (dx < best) { best = dx; nearest = i; }
    }
    hoverIndex = nearest;
    ensureTooltip();
    if (!tooltipEl) return;
    const p = chart.points[nearest];
    tooltipEl.textContent = fmtTooltip(p.timestamp, p.count);
    tooltipEl.style.display = 'block';
    const tr = tooltipEl.getBoundingClientRect();
    const margin = 10;
    let left = e.clientX - tr.width / 2;
    const top = e.clientY - tr.height - 14;
    if (left < margin) left = margin;
    if (left + tr.width > window.innerWidth - margin) left = window.innerWidth - margin - tr.width;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top  = `${Math.max(margin, top)}px`;
  }

  onDestroy(() => {
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
  });

  const data  = $derived(getDynamicsData());
  const chart = $derived(data.length ? buildGeometry(data) : null);
</script>

{#if chart}
  <section class="profile__section">
    <h2 class="profile__section-title">Динамика просмотра</h2>
    <div class="profile__chart-wrap">
      <svg class="profile__chart-svg" viewBox="0 0 {chart.w} {chart.h}" preserveAspectRatio="none" bind:this={svgEl}>
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   style="stop-color: var(--color-accent)" stop-opacity="0.35"></stop>
            <stop offset="100%" style="stop-color: var(--color-accent)" stop-opacity="0.02"></stop>
          </linearGradient>
        </defs>

        {#each [0, 0.5, 1] as frac}
          {@const y   = chart.padT + (1 - frac) * chart.ih}
          {@const val = Math.round(chart.maxVal * frac)}
          <line stroke="#262626" stroke-dasharray="3 3" x1={chart.padL} y1={y} x2={chart.w - chart.padR} y2={y}></line>
          {#if val > 0}
            <text class="profile__chart-label" x="0" y={y + 3.5} text-anchor="start">{val}</text>
          {/if}
        {/each}

        <path d={chart.areaPath} fill="url(#chartGrad)"></path>
        <path class="profile__chart-line" d={chart.linePath}></path>

        {#if hoverIndex != null}
          {@const hp = chart.points[hoverIndex]}
          <line class="profile__chart-hover-line" x1={hp.x} y1={chart.padT} x2={hp.x} y2={chart.h - chart.padB}></line>
        {/if}

        {#each chart.points as p, i}
          <circle class="profile__chart-dot" cx={p.x} cy={p.y} r={hoverIndex === i ? 5 : 3.5}></circle>
        {/each}

        {#each chart.points as p, i}
          {#if shouldShowLabel(i, chart.points.length)}
            {@const dt = new Date(p.timestamp < 1e12 ? p.timestamp * 1000 : p.timestamp)}
            <text class="profile__chart-label" x={p.x} y={chart.h - chart.padB + 14} text-anchor="middle">
              {dt.getDate()}.{String(dt.getMonth() + 1).padStart(2, '0')}.{String(dt.getFullYear()).slice(-2)}
            </text>
          {/if}
        {/each}

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <rect
          class="profile__chart-overlay"
          x={chart.padL} y={chart.padT}
          width={chart.w - chart.padL - chart.padR}
          height={chart.h - chart.padT - chart.padB}
          onmousemove={(e) => onMouseMove(e, chart)}
          onmouseleave={() => { hoverIndex = null; hideTooltip(); }}
        ></rect>
      </svg>
    </div>
  </section>
{/if}
