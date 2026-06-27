<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Select from '../../../components/Select.svelte';
  import {
    ANIXBACK_ENDPOINT_OPTIONS,
    DEFAULT_ANIXBACK_MODE,
    originForMode,
    type AnixbackEndpointMode,
  } from '../../../constants/anixbackEndpoints';
  import {
    getAnixbackEndpointMode,
    initAnixbackEndpoint,
    pingAnixbackOrigin,
    setAnixbackEndpoint,
  } from '../../../services/anixback-endpoint';

  type PingState = { ok: boolean; latencyMs: number | null };

  let anixbackMode = $state<AnixbackEndpointMode>(DEFAULT_ANIXBACK_MODE);
  let anixbackPing = $state<Record<string, PingState>>({});
  let anixbackPingInterval: ReturnType<typeof setInterval> | null = null;

  async function pingAnixbackOnce() {
    const next: Record<string, PingState> = {};
    await Promise.all(
      ANIXBACK_ENDPOINT_OPTIONS.map(async (opt) => {
        next[opt.value] = await pingAnixbackOrigin(opt.origin);
      }),
    );
    anixbackPing = next;
  }

  async function setAnixback(value: string) {
    const mode = value as AnixbackEndpointMode;
    anixbackMode = mode;
    await setAnixbackEndpoint(mode);
    void pingAnixbackOnce();
  }

  function pingLabel(map: Record<string, PingState>, key: string): string {
    const s = map[key];
    if (!s) return '';
    if (s.ok && typeof s.latencyMs === 'number') return `${s.latencyMs} мс`;
    if (!s.ok) return 'недоступен';
    return '';
  }

  const anixbackOptions = $derived(
    ANIXBACK_ENDPOINT_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.label,
      desc: pingLabel(anixbackPing, opt.value) || undefined,
    })),
  );

  const anixbackCurrentOrigin = $derived(originForMode(anixbackMode));

  onMount(async () => {
    await initAnixbackEndpoint();
    anixbackMode = getAnixbackEndpointMode();
    void pingAnixbackOnce();
    anixbackPingInterval = setInterval(() => void pingAnixbackOnce(), 2000);
  });

  onDestroy(() => {
    if (anixbackPingInterval) clearInterval(anixbackPingInterval);
  });
</script>

<div class="settings-section developer-anixback">
  <p class="settings-section__label">AnixBack</p>
  <p class="settings-section__desc">
    Объявления, чат, лобби. Сейчас: <code>{anixbackCurrentOrigin}</code>
  </p>
  <div class="settings-section__body">
    <div class="settings-row settings-row--column">
      <div class="settings-row__info">
        <div class="settings-row__label">Сервер AnixBack</div>
        <div class="settings-row__desc">Эндпоинт для объявлений, чата и лобби.</div>
      </div>
      <div class="settings-row__control settings-row__control--wide">
        <Select
          options={anixbackOptions}
          value={anixbackMode}
          onChange={setAnixback}
          placeholder="Выберите сервер"
        />
      </div>
    </div>
  </div>
</div>
