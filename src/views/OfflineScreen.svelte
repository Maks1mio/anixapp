<script lang="ts">
  import UiV2EndpointSelect from '../components/uikit-v2/UiV2EndpointSelect.svelte';

  interface Props {
    onRetry: () => void | Promise<void>;
  }

  let { onRetry }: Props = $props();

  let switching = $state(false);

  async function changeEndpoint(_value: string) {
    if (switching) return;
    switching = true;
    try {
      await onRetry();
    } finally {
      switching = false;
    }
  }
</script>

<div class="layout">
  <div class="view-offline">
    <div class="view-offline__body">
      <div class="offline-card">
        <div class="offline-card__spinner" aria-hidden="true"></div>
        <h1 class="offline-card__title">Проверяем соединение с сервером…</h1>
        <p class="offline-card__text">С серверами Anixart сейчас могут быть проблемы. Пробуем подключиться.</p>
        <p class="offline-card__hint">Проверяем соединение каждые несколько секунд.</p>

        <div class="offline-card__server">
          <p class="offline-card__server-label">Сменить сервер API</p>
          <p class="offline-card__server-desc">Выберите другой эндпоинт — пинг обновляется автоматически.</p>
          <UiV2EndpointSelect
            label=""
            placeholder="Выберите сервер"
            disabled={switching}
            onChange={changeEndpoint}
          />
        </div>
      </div>
    </div>
  </div>
</div>
