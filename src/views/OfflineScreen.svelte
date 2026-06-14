<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Select from '../components/Select.svelte';
  import { API_ENDPOINT_OPTIONS, DEFAULT_API_ENDPOINT } from '../constants/apiEndpoints';

  interface Props {
    onRetry: () => void | Promise<void>;
  }

  let { onRetry }: Props = $props();

  let currentEndpoint = $state(DEFAULT_API_ENDPOINT);
  let endpointLoaded = $state(false);
  let switching = $state(false);

  type PingState = { ok: boolean; latencyMs: number | null };
  let pingState = $state<Record<string, PingState>>({});
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  async function loadEndpoint() {
    if (!window.anixApi) return;
    try {
      const url = (await window.anixApi.client.getBaseUrl()) as string;
      currentEndpoint = url || DEFAULT_API_ENDPOINT;
    } catch {
      currentEndpoint = DEFAULT_API_ENDPOINT;
    } finally {
      endpointLoaded = true;
      void pingOnce();
      pingInterval = setInterval(() => void pingOnce(), 3000);
    }
  }

  async function pingOnce() {
    if (!window.anixApi) return;
    const nextState: Record<string, PingState> = {};
    await Promise.all(
      API_ENDPOINT_OPTIONS.map(async (opt) => {
        try {
          const res = (await window.anixApi!.client.pingBaseUrl(opt.value)) as PingState;
          nextState[opt.value] = res;
        } catch {
          nextState[opt.value] = { ok: false, latencyMs: null };
        }
      })
    );
    pingState = nextState;
  }

  function pingLabel(value: string): string {
    const s = pingState[value];
    if (!s) return '';
    if (s.ok && typeof s.latencyMs === 'number') return `${s.latencyMs} мс`;
    if (!s.ok) return 'недоступен';
    return '';
  }

  const endpointOptions = $derived(
    API_ENDPOINT_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.label,
      desc: pingLabel(opt.value) || undefined,
    }))
  );

  async function changeEndpoint(value: string) {
    if (!window.anixApi || value === currentEndpoint || switching) return;
    switching = true;
    currentEndpoint = value;
    try {
      await window.anixApi.client.setBaseUrl(value);
      await onRetry();
    } finally {
      switching = false;
    }
  }

  onMount(() => void loadEndpoint());
  onDestroy(() => {
    if (pingInterval) clearInterval(pingInterval);
  });
</script>

<div class="layout">
  <div class="view-offline">
    <div class="view-offline__body">
      <div class="offline-card">
        <div class="offline-card__spinner" aria-hidden="true"></div>
        <h1 class="offline-card__title">Проверяем соединение с сервером…</h1>
        <p class="offline-card__text">С серверами Anixart сейчас могут быть проблемы. Пробуем подключиться.</p>
        <p class="offline-card__hint">Проверяем соединение каждые несколько секунд.</p>

        {#if endpointLoaded}
          <div class="offline-card__server">
            <p class="offline-card__server-label">Сменить сервер API</p>
            <p class="offline-card__server-desc">Выберите другой эндпоинт — пинг обновляется автоматически.</p>
            <Select
              options={endpointOptions}
              value={currentEndpoint}
              onChange={changeEndpoint}
              placeholder="Выберите сервер"
              disabled={switching}
            />
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
