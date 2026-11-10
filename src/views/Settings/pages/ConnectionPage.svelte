<script lang="ts">
  import UiV2EndpointSelect from '../../../components/uikit-v2/UiV2EndpointSelect.svelte';

  function onEndpointChange() {
    window.dispatchEvent(new CustomEvent('anix:offline'));
  }
</script>

<div class="uiv2-settings">
  {#if typeof window !== 'undefined' && typeof window.anixApi === 'undefined'}
    <p class="uiv2-settings__status">Подключение к Anixart недоступно в этой сборке.</p>
  {:else}
    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Сервер API</h3>
      <p class="uiv2-settings__desc">
        Через какой адрес приложение обращается к Anixart. Если записи и серии не грузятся — попробуйте другой сервер
        или резервный прокси AnixApp.
      </p>
      <UiV2EndpointSelect label="" ariaLabel="API-эндпоинт" onChange={onEndpointChange} />
    </section>
  {/if}
</div>
