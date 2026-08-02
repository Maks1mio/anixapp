<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import { requireAuth } from '../../stores/auth';
  import { iconLayoutGrid } from '../icons';
  import { clearCollectionEditorDraft } from '../../utils/collection';

  interface Props {
    onCreate?: () => void;
    /** Скрыть ссылку «Мои коллекции» (например, на странице /collections/my) */
    showMyCollections?: boolean;
  }

  let { onCreate, showMyCollections = true }: Props = $props();

  function handleCreate() {
    if (!requireAuth()) return;
    if (onCreate) onCreate();
    else {
      clearCollectionEditorDraft();
      navigate('/collections/create');
    }
  }

  function handleMy() {
    if (!requireAuth()) return;
    navigate('/collections/my');
  }
</script>

<div class="collections-header-actions">
  <button type="button" class="collections-header-actions__btn collections-header-actions__btn--primary" onclick={handleCreate}>
    <span class="collections-header-actions__icon collections-header-actions__icon--circle" aria-hidden="true">+</span>
    <span>Создать коллекцию</span>
  </button>
  {#if showMyCollections}
    <button type="button" class="collections-header-actions__btn collections-header-actions__btn--secondary" onclick={handleMy}>
      <span class="collections-header-actions__icon" aria-hidden="true">{@html iconLayoutGrid(18)}</span>
      <span>Мои коллекции</span>
    </button>
  {/if}
</div>
