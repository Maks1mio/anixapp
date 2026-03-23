<script lang="ts">
  interface Props {
    label: string;
  }

  let { label }: Props = $props();
</script>

<div class="dc-date-sep">
  <span>{label}</span>
</div>

<style lang="scss">
  @use '../../../styles/variables' as *;

  .dc-date-sep {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1.5rem 0 0.75rem;

    &::before,
    &::after {
      content: '';
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, transparent, $color-border 20%, $color-border 80%, transparent);
    }

    span {
      font-size: 0.7rem;
      font-weight: 700;
      color: $color-text-muted;
      white-space: nowrap;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
  }
</style>
