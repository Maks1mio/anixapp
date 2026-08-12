<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { connectionKind, setConnectionChecking } from '../stores/connection';
  import UiV2EndpointSelect from './uikit-v2/UiV2EndpointSelect.svelte';

  interface Props {
    onRetry?: () => void | Promise<void>;
  }

  let { onRetry }: Props = $props();

  let panelOpen = $state(false);
  let switching = $state(false);

  const kind = $derived($connectionKind);
  const visible = $derived(kind !== 'ok');

  const label = $derived(
    kind === 'net'
      ? 'Соединение с интернетом потеряно'
      : kind === 'checking'
        ? 'Проверяем соединение…'
        : 'Плохое соединение с сервером',
  );

  const tone = $derived(kind === 'net' ? 'net' : 'server');

  async function changeEndpoint(value: string) {
    if (!window.anixApi || switching) return;
    switching = true;
    setConnectionChecking();
    try {
      await window.anixApi.client.setBaseUrl(value);
      await onRetry?.();
    } finally {
      switching = false;
    }
  }

  function togglePanel(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (kind === 'net') {
      void onRetry?.();
      return;
    }
    panelOpen = !panelOpen;
  }

  function isInsideSelectPortal(node: Node | null): boolean {
    return node instanceof Element && !!node.closest('[data-uiv2-select-portal]');
  }

  function onDocPointerDown(e: PointerEvent) {
    if (!panelOpen) return;
    const t = e.target as Node | null;
    if (!t) return;
    if (rootEl?.contains(t)) return;
    if (isInsideSelectPortal(t)) return;
    panelOpen = false;
  }

  let rootEl = $state<HTMLDivElement | null>(null);

  onMount(() => {
    document.addEventListener('pointerdown', onDocPointerDown, true);
  });

  onDestroy(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true);
  });
</script>

{#if visible}
  <div
    class="conn-banner"
    class:conn-banner--server={tone === 'server'}
    class:conn-banner--net={tone === 'net'}
    class:conn-banner--open={panelOpen}
    bind:this={rootEl}
  >
    <button
      type="button"
      class="conn-banner__chip"
      aria-expanded={panelOpen}
      aria-haspopup="dialog"
      title={label}
      onclick={togglePanel}
    >
      <span class="conn-banner__icon" aria-hidden="true">
        {#if kind === 'checking'}
          <span class="conn-banner__spin"></span>
        {:else}
          <span class="conn-banner__ring"></span>
        {/if}
      </span>
      <span class="conn-banner__text">{label}</span>
    </button>

    {#if panelOpen && kind !== 'net'}
      <div class="conn-banner__panel" role="dialog" aria-label="Сменить сервер API">
        <p class="conn-banner__panel-title">Сменить сервер API</p>
        <p class="conn-banner__panel-desc">Пинг обновляется автоматически</p>
        <UiV2EndpointSelect
          label=""
          persist={false}
          pingIntervalMs={1000}
          disabled={switching}
          onChange={changeEndpoint}
        />
      </div>
    {/if}
  </div>
{/if}
