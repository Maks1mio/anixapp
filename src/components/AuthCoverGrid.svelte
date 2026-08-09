<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { buildPosterUrl, toCdnProxyUrl } from '../utils/posterUrl';

  const COLS = 9;
  const ROWS = 7;
  const TILE_COUNT = COLS * ROWS;
  const SWAP_MS = 2600;
  const SCROLL_S = 90;
  const FLIP_MS = 700;
  const FLIP_HALF = Math.round(FLIP_MS / 2);

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

  type Tile = {
    id: number;
    src: string;
    color: string;
    loaded: boolean;
    /** CSS rotate3d Y angle in deg */
    angle: number;
    flipping: boolean;
    flipGen: number;
  };

  let tiles = $state<Tile[]>([]);
  let pool = $state<string[]>([]);
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

  function makeTiles(urls: string[]): Tile[] {
    const next: Tile[] = [];
    for (let i = 0; i < TILE_COUNT; i += 1) {
      next.push({
        id: i,
        src: urls.length ? urls[i % urls.length]! : '',
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
      if (alt !== t.src) {
        t.src = alt;
        t.color = pickColor(Math.floor(Math.random() * PANEL_COLORS.length));
      }
    }
  }

  function collectReleasePosters(payload: unknown, urls: string[], seen: Set<string>) {
    const root = payload as { content?: unknown[]; releases?: unknown[] } | null;
    const list = (root?.content ?? root?.releases ?? []) as Record<string, unknown>[];
    for (const raw of list) {
      // nested release (watching/discussing wrappers)
      const release = (raw.release as Record<string, unknown> | undefined) ?? raw;
      const url = extractPoster(release);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
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

    const urls: string[] = [];
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
      tile.src = urls[i % urls.length]!;
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
    tiles = [...tiles];
    swapping = false;
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
