<script lang="ts">
  import { untrack } from 'svelte';

  interface Props {
    initialName: string;
    onSave: (name: string) => void;
    onClose: () => void;
  }

  let { initialName, onSave, onClose }: Props = $props();
  let name = $state(untrack(() => initialName));

  function apply() {
    onSave(name.trim());
  }
</script>

<div class="home-filter-modal" role="dialog" aria-modal="true" aria-labelledby="home-rename-tab-title">
  <button type="button" class="home-filter-modal__backdrop" aria-label="Закрыть" onclick={onClose}></button>

  <div class="home-filter-modal__panel home-tab-rename-modal">
    <header class="home-filter-modal__head">
      <h2 id="home-rename-tab-title" class="home-filter-modal__title">Переименовать вкладку</h2>
      <button type="button" class="home-filter-modal__close" aria-label="Закрыть" onclick={onClose}>×</button>
    </header>

    <div class="home-tab-rename-modal__body">
      <label class="home-tab-rename-modal__label" for="home-tab-name">Название</label>
      <input
        id="home-tab-name"
        type="text"
        class="home-tab-rename-modal__input"
        bind:value={name}
        maxlength="32"
        placeholder="Моя вкладка"
      />
    </div>

    <footer class="home-filter-modal__foot">
      <button type="button" class="btn btn-secondary" onclick={onClose}>Отмена</button>
      <button type="button" class="btn btn-primary" onclick={apply}>Сохранить</button>
    </footer>
  </div>
</div>
