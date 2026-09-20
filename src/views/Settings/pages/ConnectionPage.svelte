<script lang="ts">
  import UiV2EndpointSelect from '../../../components/uikit-v2/UiV2EndpointSelect.svelte';

  function onEndpointChange() {
    window.dispatchEvent(new CustomEvent('anix:offline'));
  }
</script>

<div class="uiv2-settings">
  {#if typeof window !== 'undefined' && typeof window.anixApi === 'undefined'}
    <p class="uiv2-settings__status">API доступно только в приложении Electron.</p>
  {:else}
    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Эндпоинт API</h3>
      <p class="uiv2-settings__desc">
        Прямые Anixart-хосты или резерв AnixApp proxy (backend → туннель → Anixart).
      </p>
      <UiV2EndpointSelect label="" ariaLabel="Эндпоинт API" onChange={onEndpointChange} />
    </section>
  {/if}
</div>
