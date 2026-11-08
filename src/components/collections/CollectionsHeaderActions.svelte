<script lang="ts">
  import { iconPlus } from '../icons';

  interface Props {
    /** Открыт режим «Мои» */
    myActive?: boolean;
    onMy: () => void;
    onCreate: () => void;
  }

  let { myActive = false, onMy, onCreate }: Props = $props();
</script>

<div class="collections-header-actions">
  <button
    type="button"
    class="collections-header-actions__btn"
    class:collections-header-actions__btn--active={myActive}
    aria-pressed={myActive}
    onclick={onMy}
  >Мои</button>
  <button
    type="button"
    class="collections-header-actions__btn collections-header-actions__btn--create"
    aria-label="Создать"
    onclick={onCreate}
  >
    {@html iconPlus(15)}
    <span>Создать</span>
  </button>
</div>
