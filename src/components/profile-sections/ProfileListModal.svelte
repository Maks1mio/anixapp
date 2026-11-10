<script lang="ts">
  /**
   * «Показать все» витрины профиля на ПК: полный список (комментарии, видео) в окне поверх приложения.
   * Окно выносится в body: панель профиля лежит в слое с transform, и fixed внутри неё прилипал бы к панели.
   * Тело — `.page__scroll`: списки сами подгружают страницы по прокрутке ближайшего такого контейнера.
   */
  import type { Snippet } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import { iconX } from '../icons';

  interface Props {
    title: string;
    onClose: () => void;
    children: Snippet;
  }

  let { title, onClose, children }: Props = $props();

  const titleId = `pp-list-modal-${Math.random().toString(36).slice(2, 8)}`;

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="uiv2-choice-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} use:portal>
  <button
    type="button"
    class="uiv2-choice-sheet__backdrop"
    aria-label="Закрыть"
    onclick={onClose}
    transition:fade={{ duration: 160 }}
  ></button>

  <div class="uiv2-choice-sheet__panel pp-list-modal" transition:scale={{ duration: 220, start: 0.96, easing: cubicOut }}>
    <header class="pp-list-modal__head">
      <h2 id={titleId} class="pp-list-modal__title">{title}</h2>
      <button type="button" class="pp-list-modal__close" aria-label="Закрыть" onclick={onClose}>
        {@html iconX(18)}
      </button>
    </header>
    <div class="pp-list-modal__body page__scroll">
      {@render children()}
    </div>
  </div>
</div>

<style lang="scss">
  .pp-list-modal {
    display: flex;
    flex-direction: column;
    width: min(100%, 44rem);
    height: min(86vh, 48rem);
    padding: 0;
    overflow: hidden;
  }

  .pp-list-modal__head {
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1rem 0.5rem 1.25rem;
  }

  .pp-list-modal__title {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--uikit-v2-text);
    font-size: 1.15rem;
    font-weight: 700;
  }

  .pp-list-modal__close {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: color-mix(in srgb, var(--uikit-v2-text) 8%, transparent);
    color: var(--uikit-v2-text);
    cursor: pointer;

    &:hover,
    &:focus-visible {
      background: color-mix(in srgb, var(--uikit-v2-text) 14%, transparent);
    }
  }

  .pp-list-modal__body {
    /* Липкие вкладки и прочие «фоновые» плашки внутри — в цвет окна, а не страницы под ним */
    --uikit-v2-bg: var(--uiv2-panel-bg);
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 1.25rem 1.25rem;
    overscroll-behavior: contain;
  }
</style>
