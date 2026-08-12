<script lang="ts">
  import UiV2Skeleton from './UiV2Skeleton.svelte';

  type Props = {
    variant?: 'vertical' | 'horizontal';
    class?: string;
  };

  let { variant = 'vertical', class: className = '' }: Props = $props();
</script>

{#if variant === 'vertical'}
  <article
    class="uiv2-anime-card-skeleton uiv2-anime-card-skeleton--vertical {className}"
    aria-busy="true"
    aria-label="Загрузка карточки"
  >
    <UiV2Skeleton tag="div" class="uiv2-anime-card-skeleton__poster" rounded="lg" />
    <UiV2Skeleton tag="div" class="uiv2-anime-card-skeleton__title" rounded="sm" />
    <UiV2Skeleton tag="div" class="uiv2-anime-card-skeleton__meta" rounded="sm" />
  </article>
{:else}
  <article
    class="uiv2-anime-card-skeleton uiv2-anime-card-skeleton--horizontal {className}"
    aria-busy="true"
    aria-label="Загрузка карточки"
  >
    <UiV2Skeleton tag="div" class="uiv2-anime-card-skeleton__poster-h" rounded="lg" />
    <div class="uiv2-anime-card-skeleton__body-h">
      <UiV2Skeleton tag="div" class="uiv2-anime-card-skeleton__title-h" rounded="sm" />
      <UiV2Skeleton tag="div" class="uiv2-anime-card-skeleton__subtitle-h" rounded="sm" />
      <UiV2Skeleton tag="div" class="uiv2-anime-card-skeleton__line-h" rounded="sm" />
      <UiV2Skeleton tag="div" class="uiv2-anime-card-skeleton__line-h uiv2-anime-card-skeleton__line-h--short" rounded="sm" />
      <UiV2Skeleton tag="div" class="uiv2-anime-card-skeleton__desc-h" rounded="sm" />
    </div>
  </article>
{/if}
