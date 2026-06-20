<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import { clearCollectionEditorDraft } from '../../utils/collection';

  interface Props {
    onClick?: () => void;
  }

  let { onClick }: Props = $props();

  function handleClick() {
    if (onClick) onClick();
    else {
      clearCollectionEditorDraft();
      navigate('/collections/create');
    }
  }
</script>

<button type="button" class="collections-fab" onclick={handleClick} aria-label="Создать коллекцию">
  <span class="collections-fab__icon" aria-hidden="true">+</span>
  <span class="collections-fab__label">Создать</span>
</button>
