<script lang="ts">
  interface Props {
    title: string;
    subtitle?: string;
    showAllLabel?: string;
    onShowAll?: () => void;
  }

  let { title, subtitle = '', showAllLabel = 'Показать всё', onShowAll }: Props = $props();
</script>

<header class="overview-section-head">
  <div class="overview-section-head__text">
    <h2 class="overview-section-head__title">{title}</h2>
    {#if subtitle}
      <p class="overview-section-head__subtitle">{subtitle}</p>
    {/if}
  </div>
  {#if onShowAll}
    <button type="button" class="overview-section-head__more" onclick={onShowAll}>
      {showAllLabel}
    </button>
  {/if}
</header>
