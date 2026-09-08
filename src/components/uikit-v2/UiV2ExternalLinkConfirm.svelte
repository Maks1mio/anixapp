<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import UiV2Button from './UiV2Button.svelte';
  import {
    cancelExternalLink,
    confirmExternalLink,
    externalLinkHost,
    pendingExternalUrl,
  } from '../../utils/external-link';

  const url = $derived($pendingExternalUrl);
  const host = $derived(url ? externalLinkHost(url) : '');
  const titleId = 'uiv2-ext-link-title';

  function onWindowKeydown(e: KeyboardEvent) {
    if (!url) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelExternalLink();
    }
  }
</script>

{#if url}
  <svelte:window onkeydown={onWindowKeydown} />

  <div
    class="uiv2-ext-link"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    use:portal
  >
    <button
      type="button"
      class="uiv2-ext-link__backdrop"
      aria-label="Закрыть"
      onclick={() => cancelExternalLink()}
      transition:fade={{ duration: 160 }}
    ></button>

    <div
      class="uiv2-ext-link__panel"
      transition:scale={{ duration: 220, start: 0.94, easing: cubicOut }}
    >
      <h3 id={titleId} class="uiv2-ext-link__title">Переход на другой сайт</h3>
      <p class="uiv2-ext-link__lead">
        Вы собираетесь открыть внешнюю ссылку в браузере. Убедитесь, что доверяете этому сайту.
      </p>
      <p class="uiv2-ext-link__host" title={url}>{host}</p>
      <p class="uiv2-ext-link__url">{url}</p>

      <div class="uiv2-ext-link__actions">
        <UiV2Button
          label="Отмена"
          size="lg"
          block
          variant="chrome"
          onclick={() => cancelExternalLink()}
        />
        <UiV2Button
          label="Открыть"
          size="lg"
          block
          variant="primary"
          onclick={() => void confirmExternalLink()}
        />
      </div>
    </div>
  </div>
{/if}
