<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import UiV2Select, { type UiV2SelectOption } from './UiV2Select.svelte';
  import { API_ENDPOINT_OPTIONS, DEFAULT_API_ENDPOINT } from '../../constants/apiEndpoints';
  import {
    endpointHostLabel,
    endpointPingHint,
    endpointPingStatus,
    isBlockedRfEndpoint,
    pingEndpointStates,
    type EndpointPingState,
  } from '../../utils/endpointPing';

  type Props = {
    label?: string;
    /** Сохранять выбор через anixApi.client.setBaseUrl */
    persist?: boolean;
    /** Интервал обновления ping, мс */
    pingIntervalMs?: number;
    disabled?: boolean;
    class?: string;
    onChange?: (value: string) => void | Promise<void>;
  };

  let {
    label = 'Эндпоинт API',
    persist = true,
    pingIntervalMs = 1500,
    disabled = false,
    class: className = '',
    onChange,
  }: Props = $props();

  let value = $state(DEFAULT_API_ENDPOINT);
  let ready = $state(false);
  let hasApi = $state(false);
  let pingState = $state<Record<string, EndpointPingState>>({});
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let pingGen = 0;

  const endpointUrls = API_ENDPOINT_OPTIONS.map((o) => o.value);

  const options = $derived<UiV2SelectOption[]>(
    API_ENDPOINT_OPTIONS.map((opt) => {
      const blocked = isBlockedRfEndpoint(opt.value);
      const state = pingState[opt.value];
      const status = hasApi ? endpointPingStatus(state) : blocked ? 'offline' : 'neutral';
      return {
        value: opt.value,
        label: endpointHostLabel(opt.label),
        desc: blocked
          ? 'Заблокирован в РФ'
          : hasApi
            ? endpointPingHint(state)
            : undefined,
        status,
        disabled: blocked && hasApi && !!state && !state.ok,
      };
    }),
  );

  function applyPingResult(url: string, state: EndpointPingState) {
    pingState = { ...pingState, [url]: state };
  }

  async function pingOnce() {
    if (!window.anixApi) return;
    const gen = ++pingGen;
    await pingEndpointStates(
      endpointUrls,
      (url) => window.anixApi!.client.pingBaseUrl(url) as Promise<EndpointPingState>,
      (url, state) => {
        if (gen === pingGen) applyPingResult(url, state);
      },
    );
  }

  async function init() {
    hasApi = typeof window !== 'undefined' && !!window.anixApi;
    if (!hasApi) {
      ready = true;
      return;
    }

    void pingOnce();

    try {
      const current = (await window.anixApi!.client.getBaseUrl()) as string;
      value = current || DEFAULT_API_ENDPOINT;
    } catch {
      value = DEFAULT_API_ENDPOINT;
    } finally {
      ready = true;
    }

    pingTimer = setInterval(() => void pingOnce(), pingIntervalMs);
  }

  async function handleChange(next: string) {
    value = next;
    try {
      await onChange?.(next);
    } catch {
      /* noop */
    }
    if (!persist || !window.anixApi) return;
    try {
      await window.anixApi.client.setBaseUrl(next);
    } catch {
      /* noop */
    }
  }

  onMount(() => {
    void init();
  });

  onDestroy(() => {
    pingGen += 1;
    if (pingTimer) clearInterval(pingTimer);
  });
</script>

<div class="uiv2-endpoint-select {className}">
  {#if !ready}
    <div class="uiv2-endpoint-select__loading">Проверяем эндпоинты…</div>
  {:else if !hasApi}
    <p class="uiv2-endpoint-select__fallback">
      Live ping доступен только в приложении Electron.
    </p>
    <UiV2Select
      {label}
      options={API_ENDPOINT_OPTIONS.map((opt) => ({
        value: opt.value,
        label: endpointHostLabel(opt.label),
        desc: isBlockedRfEndpoint(opt.value) ? 'Заблокирован в РФ' : undefined,
        status: isBlockedRfEndpoint(opt.value) ? 'offline' as const : 'neutral' as const,
        disabled: isBlockedRfEndpoint(opt.value),
      }))}
      bind:value
      placeholder="Выберите эндпоинт"
    />
  {:else}
    <UiV2Select
      {label}
      {options}
      bind:value
      {disabled}
      placeholder="Выберите эндпоинт"
      onChange={handleChange}
    />
  {/if}
</div>
