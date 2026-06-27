<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { WrappedScreenId } from './WrappedScreenHost.svelte';
  import { sceneFor } from '../shared/rewind-scenes';
  import RewindLogo from './RewindLogo.svelte';
  import RewindShape from './RewindShape.svelte';
  import RewindDecor from './RewindDecor.svelte';

  interface Props {
    id: WrappedScreenId;
    children: Snippet;
    align?: 'center' | 'start';
    /** На welcome/binge логотип только внутри hero, не в углу */
    hideCornerLogo?: boolean;
    /** Длинный контент — скролл внутри кадра, без обрезки */
    scrollable?: boolean;
  }

  let { id, children, align = 'center', hideCornerLogo = false, scrollable = false }: Props = $props();

  const scene = $derived(sceneFor(id));
  const hasHero = $derived(scene.shape !== 'none');
</script>

<section
  class="wrapped-screen rewind-screen rewind-screen--{id} rewind-screen--{scene.shape}"
  class:rewind-screen--flat={!hasHero}
  class:rewind-screen--start={align === 'start'}
  class:rewind-screen--scrollable={scrollable}
  data-screen-id={id}
  style="--rw-bg:{scene.bg}; --rw-ink:{scene.ink}; --rw-ink-soft:{scene.inkSoft}; --rw-hero:{scene.hero}; --rw-logo:{scene.logo};"
>
  <span class="rewind-screen__veil" data-rw-veil></span>

  {#if !hideCornerLogo}
    <span class="rewind-screen__logo" data-rw-logo>
      <RewindLogo color={scene.logo} />
    </span>
  {/if}

  <RewindDecor items={scene.decor} />

  {#if hasHero}
    <div class="rewind-stage">
      <div class="rewind-stage__shape" data-rw-shape>
        <RewindShape shape={scene.shape} color={scene.hero} />
      </div>
      <div class="rewind-stage__content rewind-stage__content--{scene.shape}">
        {@render children()}
      </div>
    </div>
  {:else}
    <div class="rewind-flat">
      {@render children()}
    </div>
  {/if}
</section>
