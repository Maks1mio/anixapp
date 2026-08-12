<script lang="ts">
  type Props = {
    title: string;
    subtitle?: string;
    moreLabel?: string;
    onShowAll?: () => void;
    class?: string;
  };

  let {
    title,
    subtitle = '',
    moreLabel = 'Показать всё',
    onShowAll,
    class: className = '',
  }: Props = $props();
</script>

<header class="uiv2-section-head {className}">
  <div class="uiv2-section-head__text">
    <h3 class="uiv2-section-head__title">{title}</h3>
    {#if subtitle}
      <p class="uiv2-section-head__subtitle">{subtitle}</p>
    {/if}
  </div>
  {#if onShowAll}
    <button type="button" class="uiv2-section-head__more" onclick={onShowAll}>
      {moreLabel}
    </button>
  {/if}
</header>
