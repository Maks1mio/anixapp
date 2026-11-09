<script lang="ts">
  /**
   * Фон витрины как ThemedContainerLayout в Android: картинка, поверх градиент, поверх парящие значки.
   * Значения плотности, размеров и скоростей взяты оттуда; Android считает в физических пикселях.
   */
  import { toCdnProxyUrl } from '../../utils/posterUrl';
  import { parseAnixColor, profileShowcaseBackground, type ProfileThemeFields } from '../../utils/profile-showcase-theme';

  interface Props {
    profile: ProfileThemeFields;
  }

  let { profile }: Props = $props();

  const ANDROID_DPR = 2.75;
  const DENSITY: Record<string, number> = { low: 0.02, medium: 0.04, high: 0.07 };
  const SIZES: Record<string, [number, number]> = { small: [25, 55], medium: [40, 90], large: [70, 140], ultra: [150, 250] };
  const SPEEDS: Record<string, number> = { low: 1, medium: 5, high: 10, ultra: 50 };

  interface Icon {
    x: number;
    y: number;
    rotation: number;
    size: number;
    alpha: number;
    vx: number;
    vy: number;
    spin: number;
  }

  const background = $derived(profileShowcaseBackground(profile, { backgroundUrlProxy: toCdnProxyUrl }));
  const hasIcons = $derived(!!profile?.theme_enabled && !!(profile.theme_icon_url || profile.theme_icon_res_name));

  let canvas = $state<HTMLCanvasElement | null>(null);

  function tinted(source: CanvasImageSource, size: number, color: string | null): HTMLCanvasElement {
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = size;
    const g = sprite.getContext('2d')!;
    g.drawImage(source, 0, 0, size, size);
    if (color) {
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, size, size);
    }
    return sprite;
  }

  type VectorIcon = { w: number; h: number; p: { d: string; e?: number; s?: number; n?: number }[] };

  /** Значок из ресурсов APK по имени. Как в Android: неизвестное имя — без значков. */
  async function vectorSprite(name: string, color: string | null): Promise<HTMLCanvasElement | null> {
    const { default: icons } = await import('../../assets/showcase-theme-icons.json');
    const icon = (icons as Record<string, VectorIcon>)[name];
    if (!icon) return null;
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 128;
    const g = sprite.getContext('2d')!;
    const k = 128 / Math.max(icon.w, icon.h);
    g.translate((128 - icon.w * k) / 2, (128 - icon.h * k) / 2);
    g.scale(k, k);
    g.fillStyle = g.strokeStyle = color ?? '#fff';
    for (const part of icon.p) {
      const path = new Path2D(part.d);
      if (!part.n) g.fill(path, part.e ? 'evenodd' : 'nonzero');
      if (part.s) {
        g.lineWidth = part.s;
        g.stroke(path);
      }
    }
    return sprite;
  }

  function imageSprite(src: string, color: string | null): Promise<HTMLCanvasElement | null> {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(tinted(image, 128, color));
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  /** Как у Glide: GIF узнаём по первым байтам, если файл нельзя прочитать — по адресу. */
  async function isGif(url: string): Promise<boolean> {
    try {
      const bytes = new Uint8Array(await (await fetch(toCdnProxyUrl(url))).arrayBuffer());
      return String.fromCharCode(...bytes.subarray(0, 3)) === 'GIF';
    } catch {
      return /\.gif($|[?#])/i.test(url);
    }
  }

  async function loadSprite(): Promise<HTMLCanvasElement | { gif: string } | null> {
    const color = parseAnixColor(profile.theme_icon_color);
    const name = profile.theme_icon_res_name?.trim();
    if (name) return vectorSprite(name, color);
    const url = profile.theme_icon_url;
    if (!url) return null;
    // GIF в Android не перекрашивается и играет сам; холст показал бы только первый кадр
    if (await isGif(url)) return { gif: toCdnProxyUrl(url) };
    return (await imageSprite(toCdnProxyUrl(url), color)) ?? imageSprite(url, color);
  }

  function makeIcons(height: number): Icon[] {
    const key = (v: unknown, fallback: string) => String(v ?? fallback).toLowerCase();
    const count = Math.max(1, Math.floor((DENSITY[key(profile.theme_icon_density, 'medium')] ?? 0.04) * height * ANDROID_DPR));
    const [min, max] = SIZES[key(profile.theme_icon_size, 'medium')] ?? SIZES.medium;
    const speed = SPEEDS[key(profile.theme_animation_speed, 'low')] ?? 1;
    const opacity = Number(profile.theme_icon_alpha ?? 0.5);
    const velocity = () => ((Math.random() - 0.5) * 30 * speed) / ANDROID_DPR;
    return Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      rotation: (Math.random() - 0.5) * 60,
      size: (min + Math.random() * (max - min)) / ANDROID_DPR,
      alpha: Math.random() * (Number.isFinite(opacity) ? opacity : 0.5),
      vx: velocity(),
      vy: velocity(),
      spin: (Math.random() - 0.5) * 15 * speed,
    }));
  }

  $effect(() => {
    const el = canvas;
    if (!el || !hasIcons) return;
    const g = el.getContext('2d');
    if (!g) return;
    const animated = !!profile.theme_animation_enabled && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let sprite: HTMLCanvasElement | null = null;
    let gif = '';
    let gifEls: HTMLImageElement[] = [];
    let icons: Icon[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let visible = true;
    let stopped = false;

    function syncGifs() {
      if (gifEls.length || !gif || !icons.length) return;
      gifEls = icons.map((icon) => {
        const img = document.createElement('img');
        img.src = gif;
        img.alt = '';
        img.style.cssText = `position:absolute;left:0;top:0;width:${icon.size}px;height:${icon.size}px;opacity:${icon.alpha};will-change:transform`;
        el!.parentElement?.append(img);
        return img;
      });
    }

    function draw() {
      if (gif) {
        syncGifs();
        icons.forEach((icon, i) => {
          const img = gifEls[i];
          if (img) img.style.transform = `translate3d(${icon.x * width - icon.size / 2}px, ${icon.y * height - icon.size / 2}px, 0) rotate(${icon.rotation}deg)`;
        });
        return;
      }
      if (!sprite || !width || !height || !g) return;
      const dpr = window.devicePixelRatio || 1;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, width, height);
      for (const icon of icons) {
        g.save();
        g.globalAlpha = icon.alpha;
        g.translate(icon.x * width, icon.y * height);
        g.rotate((icon.rotation * Math.PI) / 180);
        g.drawImage(sprite, -icon.size / 2, -icon.size / 2, icon.size, icon.size);
        g.restore();
      }
    }

    function step(now: number) {
      if (stopped || !visible) {
        frame = 0;
        return;
      }
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      for (const icon of icons) {
        icon.x += (icon.vx * dt) / width;
        icon.y += (icon.vy * dt) / height;
        icon.rotation += icon.spin * dt;
        const mx = icon.size / width;
        const my = icon.size / height;
        if (icon.x < -mx) icon.x = 1 + mx;
        else if (icon.x > 1 + mx) icon.x = -mx;
        if (icon.y < -my) icon.y = 1 + my;
        else if (icon.y > 1 + my) icon.y = -my;
      }
      draw();
      frame = requestAnimationFrame(step);
    }

    function run() {
      if (animated && !frame && (sprite || gif) && width && height) {
        last = 0;
        frame = requestAnimationFrame(step);
      }
    }

    function resize() {
      const canvasEl = el!;
      width = canvasEl.clientWidth;
      height = canvasEl.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvasEl.width = Math.round(width * dpr);
      canvasEl.height = Math.round(height * dpr);
      if (!icons.length && height) icons = makeIcons(height);
      draw();
      run();
    }

    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(el);
    const viewObserver = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) run();
    });
    viewObserver.observe(el);

    void loadSprite().then((next) => {
      if (stopped || !next) return;
      if (next instanceof HTMLCanvasElement) sprite = next;
      else gif = next.gif;
      resize();
    });

    return () => {
      stopped = true;
      for (const img of gifEls) img.remove();
      cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      viewObserver.disconnect();
    };
  });
</script>

{#if background || hasIcons}
  <div class="showcase-layer" style={background ? `background:${background}` : undefined} aria-hidden="true">
    {#if hasIcons}<canvas bind:this={canvas}></canvas>{/if}
  </div>
{/if}

<style lang="scss">
  .showcase-layer {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
