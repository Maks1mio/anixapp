<script lang="ts">
  import { untrack } from 'svelte';
  import ScrollArea from './ScrollArea.svelte';

  interface TabOption {
    id: string;
    label: string;
    desc: string;
  }

  interface Props {
    options: TabOption[];
    value: string;
    onSave: (tabId: string) => void;
    onClose: () => void;
    title?: string;
    subtitle?: string;
  }

  let {
    options,
    value,
    onSave,
    onClose,
    title = 'Изменить вкладку по умолч.',
    subtitle = 'Выбранная вкладка будет открываться при запуске приложения',
  }: Props = $props();
  let picked = $state(untrack(() => value));

  function apply() {
    onSave(picked);
  }
</script>

<div class="home-filter-modal" role="dialog" aria-modal="true" aria-labelledby="home-default-tab-title">
  <button type="button" class="home-filter-modal__backdrop" aria-label="Закрыть" onclick={onClose}></button>

  <div class="home-filter-modal__panel home-default-tab-modal">
    <header class="home-filter-modal__head">
      <div>
        <h2 id="home-default-tab-title" class="home-filter-modal__title">{title}</h2>
        <p class="home-default-tab-modal__sub">{subtitle}</p>
      </div>
      <button type="button" class="home-filter-modal__close" aria-label="Закрыть" onclick={onClose}>×</button>
    </header>

    <ScrollArea extraClass="home-default-tab-modal__body">
      <div class="home-default-tab-modal__list">
        {#each options as opt (opt.id)}
          <label class="home-default-tab-modal__option">
            <input type="radio" name="default-tab" value={opt.id} bind:group={picked} />
            <span class="home-default-tab-modal__option-body">
              <span class="home-default-tab-modal__option-label">{opt.label}</span>
              <span class="home-default-tab-modal__option-desc">{opt.desc}</span>
            </span>
          </label>
        {/each}
      </div>
    </ScrollArea>

    <footer class="home-filter-modal__foot home-default-tab-modal__foot">
      <button type="button" class="btn btn-secondary" onclick={onClose}>Отмена</button>
      <button type="button" class="btn btn-primary" onclick={apply}>Сохранить</button>
    </footer>
  </div>
</div>
