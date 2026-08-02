<script lang="ts">
  import { onDestroy } from 'svelte';

  interface Props {
    watchDynamics: any[];
    /** Без обёртки profile__section — для v2 */
    embedded?: boolean;
    /** Скрыть блок 65/пик/дни — когда метрики рисует родитель */
    hideSummary?: boolean;
    /** Без чисел на оси Y */
    hideYLabels?: boolean;
  }
  let { watchDynamics, embedded = false, hideSummary = false, hideYLabels = false }: Props = $props();

  type DynamicsPoint = { count: number; timestamp: number };

  const GRAD_ID = `profile-dyn-grad-${Math.random().toString(36).slice(2, 9)}`;
  const GLOW_ID = `profile-dyn-glow-${Math.random().toString(36).slice(2, 9)}`;

  function getDynamicsData(): DynamicsPoint[] {
    return (watchDynamics as Array<{ count?: number; timestamp?: number }>)
      .map((d) => ({ count: Number(d.count ?? 0), timestamp: Number(d.timestamp ?? 0) }))
      .filter((d) => Number.isFinite(d.count) && Number.isFinite(d.timestamp) && d.timestamp > 0)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /** Catmull-Rom → cubic bezier path (y clamped to chart band) */
  function smoothLinePath(pts: { x: number; y: number }[], yMin: number, yMax: number): string {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
    if (pts.length === 2) {
      return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
    }

    const clampY = (y: number) => Math.min(yMax, Math.max(yMin, y));
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  function buildGeometry(data: DynamicsPoint[]) {
    const w = 720;
    const h = hideYLabels ? 168 : 196;
    const padL = hideYLabels ? 10 : 42;
    const padR = 14;
    const padT = hideYLabels ? 12 : 18;
    const padB = hideYLabels ? 24 : 38;
    const maxVal = Math.max(...data.map((d) => d.count), 1);
    const n = data.length;
    const iw = w - padL - padR;
    const ih = h - padT - padB;
    const gap = n > 1 ? Math.min(6, iw / n * 0.28) : 0;
    const barW = n > 1 ? Math.max(3, (iw - gap * (n - 1)) / n) : Math.min(28, iw * 0.2);
    const baseline = padT + ih;

    const px = (i: number) => {
      if (n <= 1) return padL + iw / 2;
      return padL + i * (barW + gap) + barW / 2;
    };
    const py = (v: number) => padT + (1 - v / maxVal) * ih;

    const points = data.map((d, i) => {
      const x = px(i);
      const y = py(d.count);
      const barH = Math.max(d.count > 0 ? 3 : 0, baseline - y);
      return {
        x,
        y,
        barX: x - barW / 2,
        barY: baseline - barH,
        barW,
        barH,
        ...d,
      };
    });

    const linePath = smoothLinePath(points, padT, baseline);
    const areaPath = points.length
      ? `${linePath} L${points[n - 1].x.toFixed(1)},${baseline.toFixed(1)} L${points[0].x.toFixed(1)},${baseline.toFixed(1)} Z`
      : '';

    const yTicks = [0, 0.5, 1].map((frac) => ({
      frac,
      y: padT + (1 - frac) * ih,
      val: Math.round(maxVal * frac),
    }));

    return { w, h, padL, padR, padT, padB, ih, baseline, maxVal, points, linePath, areaPath, yTicks };
  }

  function fmtDateShort(ts: number): string {
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function fmtDateLong(ts: number): string {
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function episodeWord(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'серия';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'серии';
    return 'серий';
  }

  function shouldShowLabel(index: number, total: number): boolean {
    if (total <= 7) return true;
    const step = Math.max(1, Math.ceil(total / 6));
    return index % step === 0 || index === total - 1;
  }

  let hoverIndex = $state<number | null>(null);
  let svgEl = $state<SVGSVGElement | null>(null);
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

  function onMouseMove(e: MouseEvent, geo: ReturnType<typeof buildGeometry>) {
    if (!svgEl || !geo.points.length) return;
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((e.clientX - rect.left) / rect.width) * geo.w;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < geo.points.length; i++) {
      const dx = Math.abs(geo.points[i].x - x);
      if (dx < best) {
        best = dx;
        nearest = i;
      }
    }
    hoverIndex = nearest;
    ensureTooltip();
    if (!tooltipEl) return;
    const p = geo.points[nearest];
    tooltipEl.innerHTML = `<strong>${p.count}</strong> ${episodeWord(p.count)}<span>${fmtDateLong(p.timestamp)}</span>`;
    tooltipEl.style.display = 'block';
    const tr = tooltipEl.getBoundingClientRect();
    const margin = 10;
    let left = e.clientX - tr.width / 2;
    const top = e.clientY - tr.height - 14;
    if (left < margin) left = margin;
    if (left + tr.width > window.innerWidth - margin) left = window.innerWidth - margin - tr.width;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${Math.max(margin, top)}px`;
  }

  onDestroy(() => {
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
  });

  const data = $derived(getDynamicsData());
  const chart = $derived(data.length ? buildGeometry(data) : null);
  const summary = $derived.by(() => {
    if (!data.length) return null;
    const total = data.reduce((s, d) => s + d.count, 0);
    const peak = data.reduce((best, d) => (d.count > best.count ? d : best), data[0]);
    const activeDays = data.filter((d) => d.count > 0).length;
    return { total, peak, activeDays };
  });
</script>

{#snippet chartSvg()}
  {#if chart}
    <svg
      class="profile__chart-svg"
      viewBox="0 0 {chart.w} {chart.h}"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Динамика просмотра серий"
      bind:this={svgEl}
    >
      <defs>
        <linearGradient id={GRAD_ID} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--color-accent)" stop-opacity="0.45"></stop>
          <stop offset="55%" stop-color="var(--color-accent)" stop-opacity="0.12"></stop>
          <stop offset="100%" stop-color="var(--color-accent)" stop-opacity="0"></stop>
        </linearGradient>
        <filter id={GLOW_ID} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="blur"></feGaussianBlur>
          <feMerge>
            <feMergeNode in="blur"></feMergeNode>
            <feMergeNode in="SourceGraphic"></feMergeNode>
          </feMerge>
        </filter>
      </defs>

      {#each chart.yTicks as tick}
        <line
          class="profile__chart-grid"
          x1={chart.padL}
          y1={tick.y}
          x2={chart.w - chart.padR}
          y2={tick.y}
        ></line>
        {#if !hideYLabels && (tick.val > 0 || tick.frac === 0)}
          <text class="profile__chart-label profile__chart-label--y" x={chart.padL - 6} y={tick.y + 3.5} text-anchor="end">
            {tick.val}
          </text>
        {/if}
      {/each}

      {#each chart.points as p, i}
        <rect
          class="profile__chart-bar"
          class:profile__chart-bar--active={hoverIndex === i}
          class:profile__chart-bar--empty={p.count === 0}
          x={p.barX}
          y={p.barY}
          width={p.barW}
          height={p.barH}
          rx={Math.min(3, p.barW / 2)}
        ></rect>
      {/each}

      <path class="profile__chart-area" d={chart.areaPath} fill="url(#{GRAD_ID})"></path>
      <path class="profile__chart-line" d={chart.linePath} filter="url(#{GLOW_ID})"></path>

      {#if hoverIndex != null}
        {@const hp = chart.points[hoverIndex]}
        <line
          class="profile__chart-hover-line"
          x1={hp.x}
          y1={chart.padT}
          x2={hp.x}
          y2={chart.baseline}
        ></line>
        <circle class="profile__chart-dot-ring" cx={hp.x} cy={hp.y} r="7"></circle>
        <circle class="profile__chart-dot profile__chart-dot--active" cx={hp.x} cy={hp.y} r="3.5"></circle>
      {/if}

      {#each chart.points as p, i}
        {#if shouldShowLabel(i, chart.points.length)}
          <text
            class="profile__chart-label profile__chart-label--x"
            class:profile__chart-label--active={hoverIndex === i}
            x={p.x}
            y={chart.h - 10}
            text-anchor="middle"
          >
            {fmtDateShort(p.timestamp)}
          </text>
        {/if}
      {/each}

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <rect
        class="profile__chart-overlay"
        x={chart.padL}
        y={chart.padT}
        width={chart.w - chart.padL - chart.padR}
        height={chart.h - chart.padT - chart.padB}
        onmousemove={(e) => onMouseMove(e, chart)}
        onmouseleave={() => {
          hoverIndex = null;
          hideTooltip();
        }}
      ></rect>
    </svg>
  {/if}
{/snippet}

{#if chart && summary}
  {#if embedded}
    <div class="profile__chart">
      {#if !hideSummary}
        <div class="profile__chart-summary" aria-hidden="true">
          <div class="profile__chart-stat">
            <span class="profile__chart-stat-value">{summary.total}</span>
            <span class="profile__chart-stat-label">всего</span>
          </div>
          <div class="profile__chart-stat">
            <span class="profile__chart-stat-value">{summary.peak.count}</span>
            <span class="profile__chart-stat-label">пик · {fmtDateShort(summary.peak.timestamp)}</span>
          </div>
          <div class="profile__chart-stat">
            <span class="profile__chart-stat-value">{summary.activeDays}</span>
            <span class="profile__chart-stat-label">активных дней</span>
          </div>
        </div>
      {/if}
      <div class="profile__chart-wrap">
        {@render chartSvg()}
      </div>
    </div>
  {:else}
    <section class="profile__section">
      <h2 class="profile__section-title">Динамика просмотра</h2>
      <div class="profile__chart">
        <div class="profile__chart-summary" aria-hidden="true">
          <div class="profile__chart-stat">
            <span class="profile__chart-stat-value">{summary.total}</span>
            <span class="profile__chart-stat-label">всего</span>
          </div>
          <div class="profile__chart-stat">
            <span class="profile__chart-stat-value">{summary.peak.count}</span>
            <span class="profile__chart-stat-label">пик · {fmtDateShort(summary.peak.timestamp)}</span>
          </div>
          <div class="profile__chart-stat">
            <span class="profile__chart-stat-value">{summary.activeDays}</span>
            <span class="profile__chart-stat-label">активных дней</span>
          </div>
        </div>
        <div class="profile__chart-wrap">
          {@render chartSvg()}
        </div>
      </div>
    </section>
  {/if}
{/if}
