<script lang="ts">
  import { onMount } from 'svelte';
  import { getPath } from '../../router';
  import { currentPath } from '../../stores/navigation';
  import { isTvWatchPath } from '../../tv/keepAlive';
  import {
    formatCls,
    formatMs,
    getDebugMetricsSnapshot,
    isDebugMetricsEnabled,
    ratingCls,
    ratingMs,
    startDebugMetricsFps,
    type DebugMetricsSnapshot,
    type MetricRating,
  } from '../../services/debug-metrics';

  const TICK_MS = typeof document !== 'undefined' && document.documentElement.classList.contains('tv-android')
    ? 1000
    : 400;

  let enabled = $state(false);
  let snap = $state<DebugMetricsSnapshot | null>(null);
  const route = $derived($currentPath || getPath());
  const immersive = $derived(isTvWatchPath(route));

  function ratingLabel(rating: MetricRating): string {
    if (rating === 'good') return 'good';
    if (rating === 'mid') return 'needs work';
    if (rating === 'poor') return 'poor';
    return 'no data';
  }

  function statusClass(rating: MetricRating): string {
    return `tv-dbg-card--${rating}`;
  }

  function reqClass(status: number, ms: number): string {
    if (status === 0 || status >= 400) return 'tv-dbg-req--err';
    if (ms >= 1000) return 'tv-dbg-req--slow';
    return '';
  }

  onMount(() => {
    let stopFps = () => {};
    let intervalId = 0;

    const stop = () => {
      if (intervalId) window.clearInterval(intervalId);
      intervalId = 0;
      stopFps();
      stopFps = () => {};
      snap = null;
    };

    const start = () => {
      stop();
      stopFps = startDebugMetricsFps();
      const tick = () => {
        snap = getDebugMetricsSnapshot();
      };
      tick();
      intervalId = window.setInterval(tick, TICK_MS);
    };

    enabled = isDebugMetricsEnabled();
    if (enabled) start();

    const onChange = (event: Event) => {
      const next = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      enabled = typeof next === 'boolean' ? next : isDebugMetricsEnabled();
      if (enabled) start();
      else stop();
    };

    window.addEventListener('anix:debugMetricsChanged', onChange);
    return () => {
      window.removeEventListener('anix:debugMetricsChanged', onChange);
      stop();
    };
  });
</script>

{#if enabled && snap}
  <div class="tv-dbg" class:tv-dbg--flush={immersive} aria-hidden="true">
    <div class="tv-dbg__head">
      <strong>Local metrics</strong>
      <span>
        {snap.capacitor ? 'APK' : 'web'}
        · {snap.host}
        · {route || snap.path}
        · {Math.round(snap.uptimeS)}s
      </span>
    </div>

    <div class="tv-dbg__vitals">
      <article class="tv-dbg-card {statusClass(ratingMs(snap.lcpMs, 2500, 4000))}">
        <h3>Largest Contentful Paint (LCP)</h3>
        <p class="tv-dbg-card__value">{formatMs(snap.lcpMs)}</p>
        <p>Your local LCP value is {ratingLabel(ratingMs(snap.lcpMs, 2500, 4000))}.</p>
        <p class="tv-dbg-card__meta">LCP element {snap.lcpTag || '—'}</p>
      </article>

      <article class="tv-dbg-card {statusClass(ratingCls(snap.cls))}">
        <h3>Cumulative Layout Shift (CLS)</h3>
        <p class="tv-dbg-card__value">{formatCls(snap.cls)}</p>
        <p>Your local CLS value is {ratingLabel(ratingCls(snap.cls))}.</p>
        <p class="tv-dbg-card__meta">Worst cluster {snap.clsShifts} shift</p>
      </article>

      <article class="tv-dbg-card {statusClass(ratingMs(snap.inpMs, 200, 500))}">
        <h3>Interaction to Next Paint (INP)</h3>
        <p class="tv-dbg-card__value">{formatMs(snap.inpMs)}</p>
        {#if snap.inpMs == null}
          <p>Interact with the page to measure INP.</p>
        {:else}
          <p>Your local INP value is {ratingLabel(ratingMs(snap.inpMs, 200, 500))}.</p>
        {/if}
        <p class="tv-dbg-card__meta">{snap.inpName || 'no interaction yet'}</p>
      </article>
    </div>

    <div class="tv-dbg__cols">
      <section class="tv-dbg-panel">
        <h3>Load</h3>
        <dl>
          <div><dt>TTFB</dt><dd class={statusClass(ratingMs(snap.ttfbMs, 800, 1800))}>{formatMs(snap.ttfbMs)}</dd></div>
          <div><dt>FCP</dt><dd class={statusClass(ratingMs(snap.fcpMs, 1800, 3000))}>{formatMs(snap.fcpMs)}</dd></div>
          <div><dt>DCL</dt><dd>{formatMs(snap.dclMs)}</dd></div>
          <div><dt>Load</dt><dd>{formatMs(snap.loadMs)}</dd></div>
          <div><dt>FPS</dt><dd class={statusClass(snap.fps >= 50 ? 'good' : snap.fps >= 30 ? 'mid' : snap.fps > 0 ? 'poor' : 'na')}>{snap.fps || '—'}</dd></div>
          <div>
            <dt>Heap</dt>
            <dd>
              {#if snap.heapUsedMb != null}
                {snap.heapUsedMb.toFixed(0)} / {snap.heapLimitMb?.toFixed(0) ?? '—'} MB
              {:else}
                —
              {/if}
            </dd>
          </div>
          <div><dt>Resources</dt><dd>{snap.resCount} · {snap.transferKb >= 1024 ? `${(snap.transferKb / 1024).toFixed(1)} MB` : `${snap.transferKb.toFixed(0)} KB`}</dd></div>
          <div><dt>Long tasks</dt><dd>{snap.longTasks}{snap.longTaskMaxMs ? ` · max ${formatMs(snap.longTaskMaxMs)}` : ''}</dd></div>
          <div><dt>Images</dt><dd>{snap.imageCount} · avg {formatMs(snap.imageAvgMs)}{snap.imageFail ? ` · fail ${snap.imageFail}` : ''}</dd></div>
          <div><dt>Media</dt><dd>{snap.mediaCount} · avg {formatMs(snap.mediaAvgMs)} · last {formatMs(snap.mediaLastMs)}{snap.mediaErrors ? ` · err ${snap.mediaErrors}` : ''}</dd></div>
        </dl>
      </section>

      <section class="tv-dbg-panel tv-dbg-panel--reqs">
        <h3>Requests</h3>
        {#if snap.requests.length === 0}
          <p class="tv-dbg-empty">No API / slow / failed requests yet.</p>
        {:else}
          <ul>
            {#each snap.requests as row (row.id)}
              <li class={reqClass(row.status, row.ms)}>
                <span class="tv-dbg-req__status">{row.status || 'ERR'}</span>
                <span class="tv-dbg-req__method">{row.method}</span>
                <span class="tv-dbg-req__label">{row.error ? `${row.label} · ${row.error}` : row.label}</span>
                <span class="tv-dbg-req__ms">{formatMs(row.ms)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  </div>
{/if}

<style>
  .tv-dbg {
    position: fixed;
    left: calc(var(--tv-rail-collapsed-w, 5.25rem) + 0.6rem);
    right: 0.6rem;
    bottom: 0.55rem;
    z-index: 22000;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.55rem 0.65rem 0.6rem;
    border-radius: 0.7rem;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-sans);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  }

  .tv-dbg__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    color: #fff;
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .tv-dbg__head strong {
    font-size: 0.92rem;
    font-weight: 700;
  }

  .tv-dbg__head span {
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tv-dbg__vitals {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.4rem;
  }

  .tv-dbg-card {
    min-height: 5.6rem;
    padding: 0.45rem 0.55rem 0.5rem;
    border-radius: 0.5rem;
    background: var(--color-surface);
  }

  .tv-dbg-card h3,
  .tv-dbg-panel h3 {
    margin: 0;
    font-size: 0.68rem;
    font-weight: 650;
    color: #fff;
  }

  .tv-dbg-card p {
    margin: 0.15rem 0 0;
    font-size: 0.62rem;
    line-height: 1.25;
    color: var(--color-text-muted);
  }

  .tv-dbg-card__value {
    margin-top: 0.2rem !important;
    font-size: 1.35rem !important;
    font-weight: 750;
    line-height: 1.1;
    color: var(--color-text);
  }

  .tv-dbg-card--good .tv-dbg-card__value { color: var(--color-success); }
  .tv-dbg-card--mid .tv-dbg-card__value { color: var(--color-accent); }
  .tv-dbg-card--poor .tv-dbg-card__value { color: var(--color-error); }

  .tv-dbg-card__meta {
    color: var(--color-text) !important;
  }

  .tv-dbg__cols {
    display: grid;
    grid-template-columns: minmax(16rem, 0.9fr) minmax(0, 1.2fr);
    gap: 0.4rem;
  }

  .tv-dbg-panel {
    padding: 0.45rem 0.55rem 0.5rem;
    border-radius: 0.5rem;
    background: var(--color-surface);
    min-width: 0;
  }

  .tv-dbg-panel dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.18rem 0.6rem;
    margin: 0.35rem 0 0;
  }

  .tv-dbg-panel dl div {
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
    font-size: 0.62rem;
    line-height: 1.3;
  }

  .tv-dbg-panel dt {
    color: var(--color-text-muted);
  }

  .tv-dbg-panel dd {
    margin: 0;
    color: #fff;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  :global(.tv-dbg-panel dd.tv-dbg-card--good) { color: var(--color-success); }
  :global(.tv-dbg-panel dd.tv-dbg-card--mid) { color: var(--color-accent); }
  :global(.tv-dbg-panel dd.tv-dbg-card--poor) { color: var(--color-error); }

  .tv-dbg-empty {
    margin: 0.4rem 0 0;
    font-size: 0.62rem;
    color: var(--color-text-muted);
  }

  .tv-dbg-panel--reqs ul {
    list-style: none;
    margin: 0.3rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
  }

  .tv-dbg-panel--reqs li {
    display: grid;
    grid-template-columns: 2.4rem 2.4rem minmax(0, 1fr) 3.4rem;
    gap: 0.3rem;
    font-size: 0.68rem;
    line-height: 1.25;
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
  }

  .tv-dbg-req__status { color: var(--color-success); }
  .tv-dbg-req__method { color: var(--color-text-muted); }
  .tv-dbg-req__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #fff;
  }
  .tv-dbg-req__ms { text-align: right; color: var(--color-text-muted); }

  .tv-dbg-req--err .tv-dbg-req__status,
  .tv-dbg-req--err .tv-dbg-req__ms { color: var(--color-error); }
  .tv-dbg-req--slow .tv-dbg-req__ms { color: var(--color-accent); }

  .tv-dbg--flush {
    left: 0.6rem;
  }
</style>
