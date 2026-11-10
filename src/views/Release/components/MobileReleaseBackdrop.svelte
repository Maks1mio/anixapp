<script lang="ts">
  /**
   * Фон шапки релиза на телефоне и планшете: кадры из нашего каталога сменяют друг друга и медленно движутся.
   * Пока кадров нет — обложка. Следующий кадр сначала загружается, чтобы смена не показывала пустоту.
   */
  import { fade } from 'svelte/transition';

  interface Props {
    images: string[];
    fallback: string;
  }
  let { images, fallback }: Props = $props();

  const SLIDE_MS = 8000;
  const FADE_MS = 1600;

  let index = $state(0);
  const current = $derived(images.length ? images[index % images.length] : fallback);

  $effect(() => {
    const list = images;
    if (list.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let alive = true;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const next = (index + 1) % list.length;
      const image = new Image();
      image.onload = () => {
        if (alive) index = next;
      };
      image.src = list[next];
    }, SLIDE_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  });
</script>

<div class="m-release-bg" aria-hidden="true">
  {#key current}
    <div class="m-release-bg__slide" style="background-image:url({current})" transition:fade={{ duration: FADE_MS }}></div>
  {/key}
</div>

<style lang="scss">
  .m-release-bg__slide {
    position: absolute;
    inset: 0;
    background-position: center;
    background-size: cover;
    filter: brightness(0.2) saturate(0.9);
    animation: m-release-bg-drift 20s ease-in-out infinite alternate;
    will-change: transform;
  }

  @keyframes m-release-bg-drift {
    from { transform: scale(1.04) translate3d(-1.5%, 0, 0); }
    to { transform: scale(1.14) translate3d(1.5%, -1.5%, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .m-release-bg__slide { animation: none; }
  }
</style>
