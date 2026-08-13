<script lang="ts">
  import UiV2EndpointSelect from '../../../components/uikit-v2/UiV2EndpointSelect.svelte';

  function onEndpointChange() {
    window.dispatchEvent(new CustomEvent('anix:offline'));
  }
</script>

<div class="settings-modal-content">
  {#if typeof window !== 'undefined' && typeof window.anixApi === 'undefined'}
    <p class="settings-account-coming-soon">API доступно только в приложении Electron.</p>
  {:else}
    <div class="settings-section">
      <p class="settings-section__label">Эндпоинт API</p>
      <p class="settings-section__desc">Anixart — основные запросы приложения.</p>
      <UiV2EndpointSelect label="" placeholder="Выберите эндпоинт" onChange={onEndpointChange} />
    </div>
  {/if}
</div>
