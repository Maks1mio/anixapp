<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    title?: string;
    /** Подпись для a11y (по умолчанию = title) */
    label?: string;
    /** Пилюля справа от заголовка */
    pill?: string;
    /** Отступ сверху при стеке карточек */
    spaced?: boolean;
    class?: string;
    children?: Snippet;
  };

  let {
    title = '',
    label = title || 'Карточка',
    pill,
    spaced = false,
    class: className = '',
    children,
  }: Props = $props();
</script>

<article
  class="uiv2-card {className}"
  class:uiv2-card--spaced={spaced}
  aria-label={label}
>
  {#if title || pill}
    <header class="uiv2-card__head">
      {#if title}
        <h3 class="uiv2-card__title">{title}</h3>
      {/if}
      {#if pill}
        <span class="uiv2-card__pill">{pill}</span>
      {/if}
    </header>
  {/if}
  {#if children}
    <div class="uiv2-card__body">
      {@render children()}
    </div>
  {/if}
</article>
