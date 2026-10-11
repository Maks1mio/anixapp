<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { buildPosterUrl, toCdnProxyUrl } from '../utils/posterUrl';
  import { scoreTone } from '../utils/score-tone';

  const COLS = 9;
  const ROWS = 7;
  const TILE_COUNT = COLS * ROWS;
  const SWAP_MS = 2600;
  const SCROLL_S = 90;
  const FLIP_MS = 700;
  const FLIP_HALF = Math.round(FLIP_MS / 2);
  /** Сколько оценка видна на перевёрнутой обложке */
  const SCORE_SHOW_MS = 3800;

  const PANEL_COLORS = [
    '#3b2a2c',
    '#2a323c',
    '#2c3830',
    '#3a3228',
    '#2e2a38',
    '#38302e',
    '#24363a',
    '#3a2832',
    '#2f3428',
    '#322a2a',
  ];

  type Poster = { src: string; grade: number | null };

  type Tile = {
    id: number;
    src: string;
    /** Оценка тайтла (0–5) — показывается после переворота */
    grade: number | null;
    showScore: boolean;
    color: string;
    loaded: boolean;
    /** CSS rotate3d Y angle in deg */
    angle: number;
    flipping: boolean;
    flipGen: number;
  };

  let tiles = $state<Tile[]>([]);
  let pool = $state<Poster[]>([]);
  let reduced = $state(false);
  let swapping = $state(false);

  function pickColor(i: number): string {
    return PANEL_COLORS[i % PANEL_COLORS.length]!;
  }

  function extractPoster(raw: Record<string, unknown>): string | null {
    // Только обложка релиза (poster), без banner/image/background
    const p = raw.poster as Record<string, { url?: string }> | undefined;
    const posterRaw =
      p?.medium?.url
      ?? p?.original?.url
      ?? p?.small?.url
      ?? (typeof raw.poster === 'string' ? raw.poster : undefined);
    if (!posterRaw || typeof posterRaw !== 'string') return null;

    const lower = posterRaw.toLowerCase();
    if (
      lower.includes('/banners/')
      || lower.includes('/banner')
      || lower.includes('/screenshots/')
      || lower.includes('/collections/')
      || lower.includes('/background')
    ) {
      return null;
    }

    const built = buildPosterUrl(posterRaw);
    return built ? toCdnProxyUrl(built) : null;
  }

  function shuffleInPlace<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }

  function makeTiles(posters: Poster[]): Tile[] {
    const next: Tile[] = [];
    for (let i = 0; i < TILE_COUNT; i += 1) {
      const p = posters.length ? posters[i % posters.length]! : null;
      next.push({
        id: i,
        src: p?.src ?? '',
        grade: p?.grade ?? null,
        showScore: false,
        color: pickColor(i + Math.floor(Math.random() * 3)),
        loaded: false,
        angle: 0,
        flipping: false,
        flipGen: 0,
      });
    }
    return next;
  }

  function markLoaded(id: number) {
    const t = tiles.find((x) => x.id === id);
    if (t) t.loaded = true;
  }

  function markFailed(id: number) {
    const t = tiles.find((x) => x.id === id);
    if (!t) return;
    t.loaded = false;
    if (pool.length > 1) {
      const alt = pool[Math.floor(Math.random() * pool.length)]!;
      if (alt.src !== t.src) {
        t.src = alt.src;
        t.grade = alt.grade;
        t.color = pickColor(Math.floor(Math.random() * PANEL_COLORS.length));
      }
    }
  }

  function collectReleasePosters(payload: unknown, urls: Poster[], seen: Set<string>) {
    const root = payload as { content?: unknown[]; releases?: unknown[] } | null;
    const list = (root?.content ?? root?.releases ?? []) as Record<string, unknown>[];
    for (const raw of list) {
      // nested release (watching/discussing wrappers)
      const release = (raw.release as Record<string, unknown> | undefined) ?? raw;
      const url = extractPoster(release);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const g = Number(release.grade);
      urls.push({ src: url, grade: Number.isFinite(g) && g > 0 ? g : null });
    }
  }

  async function loadPosters() {
    if (!window.anixApi?.discover) return;
    // Только ленты релизов с постерами — без interesting (баннеры/фоны)
    const results = await Promise.allSettled([
      window.anixApi.discover.recommendations(0),
      window.anixApi.discover.watching(0),
      window.anixApi.discover.discussing(),
    ]);

    const urls: Poster[] = [];
    const seen = new Set<string>();
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      collectReleasePosters(result.value, urls, seen);
    }

    if (!urls.length) return;
    shuffleInPlace(urls);
    pool = urls;

    const base = tiles.length ? tiles : makeTiles([]);
    for (let i = 0; i < TILE_COUNT; i += 1) {
      const tile = base[i]!;
      tile.src = urls[i % urls.length]!.src;
      tile.grade = urls[i % urls.length]!.grade;
      tile.showScore = false;
      tile.loaded = false;
      tile.color = pickColor(i + Math.floor(Math.random() * PANEL_COLORS.length));
    }
    tiles = [...base];
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function flipPair() {
    if (reduced || swapping || tiles.length < 4) return;

    const a = Math.floor(Math.random() * tiles.length);
    let b = Math.floor(Math.random() * tiles.length);
    if (a === b) b = (b + 1) % tiles.length;

    const tileA = tiles[a]!;
    const tileB = tiles[b]!;
    if (tileA.flipping || tileB.flipping) return;

    swapping = true;
    const dir = Math.random() > 0.5 ? 1 : -1;

    // Phase 1: rotate3d to edge (90deg)
    tileA.flipping = true;
    tileB.flipping = true;
    tileA.flipGen += 1;
    tileB.flipGen += 1;
    tileA.angle = dir * 90;
    tileB.angle = dir * -90;
    tiles = [...tiles];

    await wait(FLIP_HALF);

    // Swap content while edge-on
    tileA.showScore = false;
    tileB.showScore = false;
    const gradeA = tileA.grade;
    tileA.grade = tileB.grade;
    tileB.grade = gradeA;
    const srcA = tileA.src;
    const loadedA = tileA.loaded;
    const colorA = tileA.color;
    tileA.src = tileB.src;
    tileA.loaded = tileB.loaded;
    tileA.color = tileB.color;
    tileB.src = srcA;
    tileB.loaded = loadedA;
    tileB.color = colorA;

    // Jump to opposite edge without transition, then open back to 0
    tileA.flipping = false;
    tileB.flipping = false;
    tileA.angle = dir * -90;
    tileB.angle = dir * 90;
    tiles = [...tiles];
    await tick();
    await wait(32);

    tileA.flipping = true;
    tileB.flipping = true;
    tileA.flipGen += 1;
    tileB.flipGen += 1;
    tileA.angle = 0;
    tileB.angle = 0;
    tiles = [...tiles];

    await wait(FLIP_HALF);

    tileA.flipping = false;
    tileB.flipping = false;
    // После переворота — оценка в углу, через несколько секунд гаснет
    tileA.showScore = tileA.grade != null;
    tileB.showScore = tileB.grade != null;
    tiles = [...tiles];
    swapping = false;
    const genA = tileA.flipGen;
    const genB = tileB.flipGen;
    setTimeout(() => {
      if (tileA.flipGen === genA) tileA.showScore = false;
      if (tileB.flipGen === genB) tileB.showScore = false;
      tiles = [...tiles];
    }, SCORE_SHOW_MS);
  }

  function formatGrade(g: number): string {
    return g.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  onMount(() => {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    tiles = makeTiles([]);
    void loadPosters();

    if (reduced) return;

    // Stagger first flips so motion starts soon after open
    const kickoff = setTimeout(() => {
      void flipPair();
    }, 1200);

    const swapTimer = setInterval(() => {
      void flipPair();
    }, SWAP_MS);

    return () => {
      clearTimeout(kickoff);
      clearInterval(swapTimer);
    };
  });
</script>

<div
  class="auth-cover-stage"
  class:auth-cover-stage--static={reduced}
  aria-hidden="true"
  style={`--auth-cover-cols:${COLS};--auth-cover-scroll:${SCROLL_S}s;--auth-cover-flip:${FLIP_HALF}ms`}
>
  <div class="auth-cover-grid">
    <div class="auth-cover-grid__track">
      {#each [0, 1] as copy (copy)}
        <div class="auth-cover-grid__page">
          {#each tiles as tile (`${copy}-${tile.id}`)}
            <div
              class="auth-cover-tile"
              class:auth-cover-tile--loaded={tile.loaded}
              class:auth-cover-tile--flipping={tile.flipping}
              data-tile={tile.id}
              style={`--tile-color:${tile.color};--tile-i:${tile.id}`}
            >
              <div
                class="auth-cover-tile__face"
                style={`transform: rotate3d(0, 1, 0, ${tile.angle}deg)`}
              >
                <div class="auth-cover-tile__panel"></div>
                {#if tile.src}
                  <img
                    class="auth-cover-tile__img"
                    src={tile.src}
                    alt=""
                    loading={copy === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    draggable="false"
                    onload={() => markLoaded(tile.id)}
                    onerror={() => markFailed(tile.id)}
                  />
                {/if}
                {#if tile.showScore && tile.grade != null && tile.loaded}
                  <span class="auth-cover-tile__score" data-tone={scoreTone(tile.grade)}>
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" /></svg>
                    {formatGrade(tile.grade)}
                  </span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
  <div class="auth-cover-stage__fade auth-cover-stage__fade--top"></div>
  <div class="auth-cover-stage__fade auth-cover-stage__fade--bottom"></div>
  <div class="auth-cover-stage__fade auth-cover-stage__fade--right"></div>
</div>

<style>
  /* Оценка на перевёрнутой обложке: те же цвета, что у значка оценки на карточках */
  .auth-cover-tile__score {
    position: absolute;
    top: 6%;
    left: 6%;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 6px;
    border-radius: 999px;
    font: 700 11px/1.3 var(--m-font, inherit);
    font-variant-numeric: tabular-nums;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    animation: auth-score-in 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
    pointer-events: none;
  }
  .auth-cover-tile__score[data-tone='low'] { background: #d32f2f; color: #fff; }
  .auth-cover-tile__score[data-tone='midlow'] { background: #f57c00; color: #1c1b1f; }
  .auth-cover-tile__score[data-tone='mid'] { background: #fbc02d; color: #1c1b1f; }
  .auth-cover-tile__score[data-tone='high'] { background: #9ccc65; color: #1c1b1f; }
  .auth-cover-tile__score[data-tone='top'] { background: #2e7d32; color: #fff; }

  @keyframes auth-score-in {
    from { opacity: 0; transform: translateY(-4px) scale(0.85); }
    to { opacity: 1; transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .auth-cover-tile__score { animation: none; }
  }
</style>
