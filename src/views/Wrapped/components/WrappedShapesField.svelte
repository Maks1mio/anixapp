<script lang="ts" module>
  // Сырой SVG монограмм — встраиваем инлайном, перекрашиваем через CSS fill
  const SHAPE_MODULES = import.meta.glob('../assets/Monogram/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>;

  const SHAPE_SVGS: string[] = Object.entries(SHAPE_MODULES)
    .sort((a, b) => {
      const na = Number(a[0].match(/(\d+)\.svg$/)?.[1] ?? 0);
      const nb = Number(b[0].match(/(\d+)\.svg$/)?.[1] ?? 0);
      return na - nb;
    })
    .map(([, svg]) => svg);

  const PALETTE = ['#c8f24e', '#ff5ca8', '#ffd84d', '#4de1c2', '#b388ff', '#ff8a3c', '#ff5d73', '#5ce1c2'];

  type FieldShape = {
    svg: string;
    top: number;
    left: number;
    size: number;
    rotate: number;
    color: string;
    opacity: number;
    speed: number;
    float: number;
  };

  function makeRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function buildField(count: number, seed: number): FieldShape[] {
    const r = makeRng(seed);
    const shapes: FieldShape[] = [];
    if (!SHAPE_SVGS.length) return shapes;
    for (let i = 0; i < count; i++) {
      const band = (i / count) * 100;
      const top = band + r() * (100 / count);
      const leftEdge = r() < 0.5;
      const left = leftEdge ? -10 + r() * 24 : 66 + r() * 38;
      const size = 16 + r() * 30;
      const big = size > 34;
      shapes.push({
        svg: SHAPE_SVGS[Math.floor(r() * SHAPE_SVGS.length)],
        top,
        left,
        size,
        rotate: Math.floor(r() * 360),
        color: PALETTE[Math.floor(r() * PALETTE.length)],
        opacity: big ? 0.92 : 0.5 + r() * 0.35,
        speed: 0.05 + r() * 0.22,
        float: Math.floor(r() * 3),
      });
    }
    return shapes;
  }
</script>

<script lang="ts">
  // Случайная раскладка при каждом открытии «Итогов» (стабильна в пределах одного показа)
  const field = buildField(18, (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
</script>

<div class="wrapped-field" aria-hidden="true">
  {#each field as s, i}
    <span
      class="wrapped-field__shape"
      data-speed={s.speed}
      style="
        top:{s.top.toFixed(2)}%;
        left:{s.left.toFixed(2)}%;
        --s:{s.size.toFixed(1)}vmin;
        --rot:{s.rotate}deg;
        --shape-color:{s.color};
        --shape-opacity:{s.opacity.toFixed(2)};
        --i:{i};
      "
    >
      <span class="wrapped-field__inner wrapped-field__inner--float{s.float}">
        {@html s.svg}
      </span>
    </span>
  {/each}
</div>
