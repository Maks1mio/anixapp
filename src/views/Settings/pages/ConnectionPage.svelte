<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Select from '../../../components/Select.svelte';
  import { API_ENDPOINT_OPTIONS, DEFAULT_API_ENDPOINT } from '../../../constants/apiEndpoints';

  let currentEndpoint = $state('');
  let endpointLoaded = $state(false);
  let endpointLoadError = $state(false);
  type PingState = { ok: boolean; latencyMs: number | null };
  let pingState = $state<Record<string, PingState>>({});
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  async function loadEndpoint() {
    if (!window.anixApi) return;
    try {
      const url = (await window.anixApi.client.getBaseUrl()) as string;
      currentEndpoint = url || DEFAULT_API_ENDPOINT;
      endpointLoaded = true;
      endpointLoadError = false;
      void pingOnce();
      pingInterval = setInterval(() => void pingOnce(), 1000);
    } catch {
      endpointLoaded = true;
      endpointLoadError = true;
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

  function setEndpoint(value: string) {
    currentEndpoint = value;
    window.anixApi?.client?.setBaseUrl(value);
    window.dispatchEvent(new CustomEvent('anix:offline'));
  }

  function pingLabel(map: Record<string, PingState>, key: string): string {
    const s = map[key];
    if (!s) return '';
    if (s.ok && typeof s.latencyMs === 'number') return `${s.latencyMs} мс`;
    if (!s.ok) return 'недоступен';
    return '';
  }

  const endpointOptions = $derived(
    API_ENDPOINT_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.label,
      desc: pingLabel(pingState, opt.value) || undefined,
    }))
  );

  onMount(() => void loadEndpoint());
  onDestroy(() => {
    if (pingInterval) clearInterval(pingInterval);
  });
</script>

<div class="settings-modal-content">
  {#if typeof window !== 'undefined' && typeof window.anixApi === 'undefined'}
    <p class="settings-account-coming-soon">API доступно только в приложении Electron.</p>
  {:else if !endpointLoaded}
    <div class="settings-section">
      <p class="settings-section__label">Эндпоинт API</p>
      <div style="font-size:0.875rem;color:#737373;">Загрузка…</div>
    </div>
  {:else if endpointLoadError}
    <div class="settings-section">
      <p class="settings-section__label">Эндпоинт API</p>
      <p style="font-size:0.875rem;color:#737373;">Не удалось загрузить текущий эндпоинт.</p>
    </div>
  {:else}
    <div class="settings-section">
      <p class="settings-section__label">Эндпоинт API</p>
      <p class="settings-section__desc">Anixart — основные запросы приложения.</p>
      <Select
        options={endpointOptions}
        value={currentEndpoint}
        onChange={setEndpoint}
        placeholder="Выберите эндпоинт"
      />
    </div>
  {/if}
</div>
