<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import UiV2Select, { type UiV2SelectOption } from './UiV2Select.svelte';
  import {
    API_ENDPOINT_OPTIONS,
    BACKUP_API_PROXY,
    BACKUP_API_PROXY_LABEL,
    SELECTABLE_API_ENDPOINTS,
    isBackupApiProxy,
    normalizeSelectableApiEndpoint,
    DEFAULT_API_ENDPOINT,
  } from '../../constants/apiEndpoints';
  import {
    endpointFlagIconHtml,
    staticEndpointCountry,
  } from '../../utils/endpointCountry';
  import {
    endpointHostLabel,
    endpointPingStatus,
    endpointStatusDesc,
    isBlockedRfEndpoint,
    pingEndpointStates,
    resolveEndpointCountries,
    type EndpointCountryInfo,
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
  let geoState = $state<Record<string, EndpointCountryInfo>>({});
  let backupActive = $state(false);
  let backupConnections = $state<number | null>(null);
  let backupTunnel = $state<{
    ready?: boolean;
    label?: string | null;
    latencyMs?: number | null;
    exitLabel?: string | null;
    gatewayHost?: string | null;
    gatewayIp?: string | null;
    upstreamHost?: string | null;
    upstreamIp?: string | null;
    error?: string | null;
  } | null>(null);
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let connectionsTimer: ReturnType<typeof setInterval> | null = null;
  let pingGen = 0;
  let hopsRootEl: HTMLElement | null = $state(null);
  let hopPathD = $state('');
  let hopPathLen = $state(0);
  let hopActivePathD = $state('');
  let hopActivePathLen = $state(0);

  function buildVerticalPath(pts: Array<{ x: number; y: number }>): string {
    if (pts.length < 2) return '';
    const x = pts[0].x;
    let d = `M ${x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 1; i < pts.length; i += 1) {
      d += ` L ${x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
    }
    return d;
  }

  function updateHopPolyline() {
    if (!backupSelected) {
      hopPathD = '';
      hopPathLen = 0;
      hopActivePathD = '';
      hopActivePathLen = 0;
      return;
    }
    const root = hopsRootEl;
    if (!root) {
      hopPathD = '';
      hopPathLen = 0;
      hopActivePathD = '';
      hopActivePathLen = 0;
      return;
    }
    const dots = root.querySelectorAll<HTMLElement>('[data-hop-dot]');
    if (dots.length < 2) {
      hopPathD = '';
      hopPathLen = 0;
      hopActivePathD = '';
      hopActivePathLen = 0;
      return;
    }
    const rootBox = root.getBoundingClientRect();
    const pts = Array.from(dots).map((el) => {
      const box = el.getBoundingClientRect();
      return {
        x: box.left + box.width / 2 - rootBox.left,
        y: box.top + box.height / 2 - rootBox.top,
      };
    });
    hopPathD = buildVerticalPath(pts);
    hopPathLen = Math.max(40, Math.round(pts[pts.length - 1].y - pts[0].y));

    // Color only through contiguous OK hops; rest stays grey track.
    let lastOk = -1;
    for (let i = 0; i < backupHops.length; i += 1) {
      if (backupHops[i]?.tone === 'ok') lastOk = i;
      else break;
    }
    if (lastOk >= 1) {
      const activePts = pts.slice(0, lastOk + 1);
      hopActivePathD = buildVerticalPath(activePts);
      hopActivePathLen = Math.max(24, Math.round(activePts[activePts.length - 1].y - activePts[0].y));
    } else {
      hopActivePathD = '';
      hopActivePathLen = 0;
    }
  }

  const endpointUrls = API_ENDPOINT_OPTIONS.map((o) => o.value);
  const allPingUrls = [...endpointUrls, BACKUP_API_PROXY];
  const backupSelected = $derived(isBackupApiProxy(value));

  function geoFor(url: string): EndpointCountryInfo {
    return geoState[url] ?? staticEndpointCountry(url);
  }

  const options = $derived<UiV2SelectOption[]>(
    SELECTABLE_API_ENDPOINTS.map((opt) => {
      const blocked = isBlockedRfEndpoint(opt.value);
      const state = pingState[opt.value];
      const geo = geoFor(opt.value);
      const isBackup = isBackupApiProxy(opt.value);
      const status = hasApi
        ? isBackup && backupTunnel
          ? backupTunnel.ready === false || backupTunnel.error
            ? 'offline'
            : backupTunnel.ready
              ? 'good'
              : endpointPingStatus(state)
          : endpointPingStatus(state)
        : blocked
          ? 'offline'
          : 'neutral';
      return {
        value: opt.value,
        label: isBackup ? BACKUP_API_PROXY_LABEL : endpointHostLabel(opt.label),
        desc: hasApi
          ? isBackup && typeof backupTunnel?.latencyMs === 'number'
            ? `${geo.countryName || 'прокси'} · ${backupTunnel.latencyMs} мс`
            : endpointStatusDesc(opt.value, state, geo)
          : blocked
            ? endpointStatusDesc(opt.value, { ok: false, latencyMs: null }, geo)
            : endpointStatusDesc(opt.value, undefined, geo),
        icon: endpointFlagIconHtml(geo.countryCode),
        status,
        disabled: blocked && hasApi && !!state && !state.ok,
      };
    }),
  );

  const backupPing = $derived(pingState[BACKUP_API_PROXY]);
  const backupPingTone = $derived.by((): 'good' | 'medium' | 'bad' | 'offline' | 'neutral' => {
    if (!backupSelected) return 'neutral';
    if (backupTunnel?.error || backupTunnel?.ready === false) return 'offline';
    const ms =
      typeof backupTunnel?.latencyMs === 'number'
        ? backupTunnel.latencyMs
        : typeof backupPing?.latencyMs === 'number' && backupPing.ok
          ? backupPing.latencyMs
          : null;
    if (typeof ms === 'number') {
      if (ms < 150) return 'good';
      if (ms < 300) return 'medium';
      return 'bad';
    }
    if (backupPing?.ok === false) return 'offline';
    return 'neutral';
  });
  const backupHostLabel = $derived(
    backupTunnel?.label?.trim() || BACKUP_API_PROXY_LABEL,
  );
  const backupLatencyMs = $derived.by(() => {
    if (typeof backupTunnel?.latencyMs === 'number') return backupTunnel.latencyMs;
    if (typeof backupPing?.latencyMs === 'number' && backupPing.ok) return backupPing.latencyMs;
    return null;
  });
  const backupLatencyText = $derived.by(() => {
    if (typeof backupLatencyMs === 'number') return null;
    if (backupTunnel?.error || backupPing?.ok === false) return 'Нет соединения';
    if (backupActive) return 'Сейчас используется';
    return backupSelected ? 'Резервный путь готов' : 'Выключен';
  });

  /** Once path is fully up — keep hop colors stable; health goes to ping text only. */
  let hopsPathLatched = $state(false);

  type HopTone = 'ok' | 'pending' | 'fail' | 'idle';

  type BackupHop = {
    id: string;
    name: string;
    detail: string;
    flagHtml?: string;
    hiddenIcon?: boolean;
    tone: HopTone;
    statusText: string;
  };

  const backupHops = $derived.by((): BackupHop[] => {
    const ready = backupTunnel?.ready === true && !backupTunnel?.error;
    const gatewayHost = backupTunnel?.gatewayHost?.trim() || 'api.anixapp.com';
    const gatewayIp = backupTunnel?.gatewayIp?.trim();
    const exitLabel = backupTunnel?.exitLabel?.trim() || 'Tunnel';
    const upstreamHost = backupTunnel?.upstreamHost?.trim() || 'api.anixart.tv';
    const upstreamIp = backupTunnel?.upstreamIp?.trim();
    const gatewayGeo = geoFor(`https://${gatewayHost}`);
    const upstreamGeo = staticEndpointCountry(`https://${upstreamHost}`);

    const pathUp =
      hopsPathLatched
      || (ready && !!backupTunnel?.upstreamHost);

    if (pathUp) {
      return [
        {
          id: 'gateway',
          name: gatewayHost,
          detail: gatewayIp ? `ip:${gatewayIp}` : 'ip:…',
          flagHtml: endpointFlagIconHtml(gatewayGeo.countryCode),
          tone: 'ok',
          statusText: 'Подключено',
        },
        {
          id: 'ss',
          name: 'Shadowsocks',
          detail: 'скрыто от злых глаз',
          hiddenIcon: true,
          tone: 'ok',
          statusText: 'Подключено',
        },
        {
          id: 'exit',
          name: exitLabel,
          detail: 'туннель активен',
          tone: 'ok',
          statusText: 'Подключено',
        },
        {
          id: 'upstream',
          name: upstreamHost,
          detail: upstreamIp ? `ip:${upstreamIp}` : 'ip:…',
          flagHtml: endpointFlagIconHtml(upstreamGeo.countryCode),
          tone: 'ok',
          statusText: 'Ответ получен',
        },
      ];
    }

    const gatewayUp = ready || backupPing?.ok === true;
    const tunnelPending = backupSelected && !ready;

    const hops: BackupHop[] = [
      {
        id: 'gateway',
        name: gatewayHost,
        detail: gatewayIp ? `ip:${gatewayIp}` : 'ip:…',
        flagHtml: endpointFlagIconHtml(gatewayGeo.countryCode),
        tone: gatewayUp ? 'ok' : 'pending',
        statusText: gatewayUp ? 'Подключено' : 'Подключение…',
      },
      {
        id: 'ss',
        name: 'Shadowsocks',
        detail: 'скрыто от злых глаз',
        hiddenIcon: true,
        tone: ready ? 'ok' : tunnelPending || gatewayUp ? 'pending' : 'idle',
        statusText: ready
          ? 'Подключено'
          : tunnelPending || gatewayUp
            ? 'Подключение…'
            : 'Ожидание',
      },
      {
        id: 'exit',
        name: exitLabel,
        detail: ready ? 'туннель активен' : 'ожидание туннеля',
        tone: ready ? 'ok' : 'idle',
        statusText:
          ready ? 'Подключено' : 'Ожидание',
      },
      {
        id: 'upstream',
        name: upstreamHost,
        detail: upstreamIp ? `ip:${upstreamIp}` : 'ip:…',
        flagHtml: endpointFlagIconHtml(upstreamGeo.countryCode),
        tone: ready && backupTunnel?.upstreamHost ? 'ok' : ready ? 'pending' : 'idle',
        statusText:
          ready && backupTunnel?.upstreamHost
            ? 'Ответ получен'
            : ready
              ? 'Ожидание ответа…'
              : 'Ожидание',
      },
    ];

    let sawBreak = false;
    return hops.map((hop) => {
      if (hop.tone === 'ok') return hop;
      if (!sawBreak) {
        sawBreak = true;
        if (hop.tone === 'idle') {
          return { ...hop, tone: 'pending' as HopTone, statusText: 'Подключение…' };
        }
        return hop;
      }
      return { ...hop, tone: 'idle' as HopTone, statusText: 'Ожидание' };
    });
  });

  $effect(() => {
    if (!backupSelected) {
      hopsPathLatched = false;
      return;
    }
    if (
      backupTunnel?.ready === true
      && !backupTunnel?.error
      && backupTunnel.upstreamHost
    ) {
      hopsPathLatched = true;
    }
  });

  $effect(() => {
    void backupHops;
    void backupSelected;
    void hopsPathLatched;
    queueMicrotask(() => updateHopPolyline());
  });

  $effect(() => {
    const el = hopsRootEl;
    if (!backupSelected || !el || typeof ResizeObserver === 'undefined') {
      if (!backupSelected) {
        hopPathD = '';
        hopPathLen = 0;
        hopActivePathD = '';
        hopActivePathLen = 0;
      }
      return;
    }
    const obs = new ResizeObserver(() => updateHopPolyline());
    obs.observe(el);
    updateHopPolyline();
    return () => obs.disconnect();
  });

  function applyPingResult(url: string, state: EndpointPingState) {
    pingState = { ...pingState, [url]: state };
  }

  function applyGeoResult(url: string, geo: EndpointCountryInfo) {
    geoState = { ...geoState, [url]: geo };
  }

  function applyBackupStatus(status: {
    enabled?: boolean;
    active?: boolean;
    connections?: number | null;
    tunnel?: typeof backupTunnel;
  } | null | undefined) {
    if (!status) return;
    if (typeof status.active === 'boolean') backupActive = status.active;
    if (typeof status.connections === 'number') {
      backupConnections = Math.max(0, Math.floor(status.connections));
    }
    if (status.tunnel !== undefined) {
      backupTunnel = status.tunnel ?? null;
    }
  }

  async function loadBackupConnections() {
    if (!backupSelected || !window.anixApi?.client?.getBackupProxy) return;
    try {
      applyBackupStatus(await window.anixApi.client.getBackupProxy());
    } catch {
      /* leave previous */
    }
  }

  /** Sync tunnel stats while backup endpoint is selected. */
  async function loadBackupStatus(force = false) {
    if ((!force && !backupSelected) || !window.anixApi?.client?.getBackupProxy) return;
    try {
      applyBackupStatus(await window.anixApi.client.getBackupProxy());
    } catch {
      /* noop */
    }
  }

  function stopBackupPolling() {
    if (connectionsTimer) {
      clearInterval(connectionsTimer);
      connectionsTimer = null;
    }
    backupTunnel = null;
    backupConnections = null;
    backupActive = false;
    hopsPathLatched = false;
    hopPathD = '';
    hopPathLen = 0;
    hopActivePathD = '';
    hopActivePathLen = 0;
  }

  function startBackupPolling() {
    if (connectionsTimer || !hasApi) return;
    void loadBackupConnections();
    connectionsTimer = setInterval(() => void loadBackupConnections(), 5_000);
  }

  async function loadGeoOnce() {
    if (!window.anixApi?.client?.endpointGeo) {
      for (const url of allPingUrls) applyGeoResult(url, staticEndpointCountry(url));
      return;
    }
    await resolveEndpointCountries(
      endpointUrls,
      async (url) => {
        const res = await window.anixApi!.client.endpointGeo(url);
        return {
          countryCode: res?.countryCode ?? null,
          countryName: res?.countryName ?? null,
        };
      },
      applyGeoResult,
    );
    applyGeoResult(BACKUP_API_PROXY, staticEndpointCountry(BACKUP_API_PROXY));
  }

  async function pingOnce() {
    if (!window.anixApi) return;
    const gen = ++pingGen;
    // Always ping selectable endpoints including backup (for the dropdown).
    await pingEndpointStates(
      allPingUrls,
      (url) => window.anixApi!.client.pingBaseUrl(url) as Promise<EndpointPingState>,
      (url, state) => {
        if (gen === pingGen) applyPingResult(url, state);
      },
    );
  }

  async function init() {
    hasApi = typeof window !== 'undefined' && !!window.anixApi;

    if (!hasApi) {
      for (const url of allPingUrls) applyGeoResult(url, staticEndpointCountry(url));
      ready = true;
      return;
    }

    void loadGeoOnce();
    void pingOnce();

    try {
      const current = (await window.anixApi!.client.getBaseUrl()) as string;
      value = normalizeSelectableApiEndpoint(current || DEFAULT_API_ENDPOINT);
      if (current && current !== value && persist) {
        await window.anixApi.client.setBaseUrl(value);
      }
    } catch {
      value = DEFAULT_API_ENDPOINT;
    } finally {
      ready = true;
    }

    if (isBackupApiProxy(value)) {
      void loadBackupStatus(true);
      startBackupPolling();
    } else {
      stopBackupPolling();
    }

    pingTimer = setInterval(() => void pingOnce(), pingIntervalMs);
  }

  async function handleChange(next: string) {
    const selected = normalizeSelectableApiEndpoint(next);
    value = selected;
    const usingBackup = isBackupApiProxy(selected);
    try {
      await onChange?.(selected);
    } catch {
      /* noop */
    }
    if (!persist || !window.anixApi) {
      if (usingBackup) startBackupPolling();
      else stopBackupPolling();
      return;
    }
    try {
      await window.anixApi.client.setBaseUrl(selected);
      if (usingBackup) {
        startBackupPolling();
        await loadBackupStatus(true);
      } else {
        stopBackupPolling();
      }
    } catch {
      /* noop */
    }
  }

  function onBackupProxyEvent(e: Event) {
    if (!backupSelected) return;
    const detail = (e as CustomEvent).detail;
    applyBackupStatus(detail);
  }

  onMount(() => {
    void init();
    window.addEventListener('anix:backupProxy', onBackupProxyEvent);
  });

  onDestroy(() => {
    pingGen += 1;
    if (pingTimer) clearInterval(pingTimer);
    if (connectionsTimer) clearInterval(connectionsTimer);
    window.removeEventListener('anix:backupProxy', onBackupProxyEvent);
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
      options={SELECTABLE_API_ENDPOINTS.map((opt) => {
        const geo = geoFor(opt.value);
        const blocked = isBlockedRfEndpoint(opt.value);
        const isBackup = isBackupApiProxy(opt.value);
        return {
          value: opt.value,
          label: isBackup ? BACKUP_API_PROXY_LABEL : endpointHostLabel(opt.label),
          desc: blocked
            ? endpointStatusDesc(opt.value, { ok: false, latencyMs: null }, geo)
            : endpointStatusDesc(opt.value, undefined, geo),
          icon: endpointFlagIconHtml(geo.countryCode),
          status: (blocked ? 'offline' : 'neutral') as const,
          disabled: blocked,
        };
      })}
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

  {#if backupSelected}
    <div
      class="uiv2-endpoint-backup"
      class:uiv2-endpoint-backup--active={backupActive || backupSelected}
    >
      <div class="uiv2-endpoint-backup__card uiv2-endpoint-backup__card--path">
        <div class="uiv2-endpoint-backup__card-top">
          <div class="uiv2-endpoint-backup__meta">
            <span class="uiv2-endpoint-backup__host">{backupHostLabel}</span>
            <span class="uiv2-endpoint-backup__desc" data-ping={backupPingTone}>
              {#if typeof backupLatencyMs === 'number'}
                Время ответа:
                <span class="uiv2-endpoint-backup__ping-ms">{backupLatencyMs} мс</span>
              {:else}
                {backupLatencyText}
              {/if}
            </span>
          </div>
          <div
            class="uiv2-endpoint-backup__count"
            title="Уникальные клиенты за 5 мин. Пинг эндпоинтов не считается."
          >
            <span class="uiv2-endpoint-backup__count-num">
              {backupConnections == null ? '—' : backupConnections}
            </span>
            <span class="uiv2-endpoint-backup__count-label">онлайн</span>
          </div>
        </div>

        <div
          class="uiv2-endpoint-backup__hops-wrap"
          class:uiv2-endpoint-backup__hops-wrap--live={hopActivePathD.length > 0 || hopsPathLatched}
          bind:this={hopsRootEl}
        >
          {#if hopPathD}
            <svg class="uiv2-endpoint-backup__path" aria-hidden="true">
              <path class="uiv2-endpoint-backup__path-track" d={hopPathD} fill="none" />
              {#if hopActivePathD}
                <path class="uiv2-endpoint-backup__path-active" d={hopActivePathD} fill="none" />
                <path
                  class="uiv2-endpoint-backup__path-flow"
                  d={hopActivePathD}
                  fill="none"
                  pathLength={hopActivePathLen || 100}
                  style={`--hop-path-len: ${hopActivePathLen || 100}`}
                />
              {/if}
            </svg>
          {/if}
          <ol class="uiv2-endpoint-backup__hops">
            {#each backupHops as hop (hop.id)}
              <li
                class="uiv2-endpoint-backup__hop"
                class:uiv2-endpoint-backup__hop--ok={hop.tone === 'ok'}
                class:uiv2-endpoint-backup__hop--pending={hop.tone === 'pending'}
                class:uiv2-endpoint-backup__hop--fail={hop.tone === 'fail'}
                class:uiv2-endpoint-backup__hop--idle={hop.tone === 'idle'}
              >
                <span class="uiv2-endpoint-backup__hop-rail" aria-hidden="true">
                  <span class="uiv2-endpoint-backup__hop-dot" data-hop-dot></span>
                </span>
                <div class="uiv2-endpoint-backup__hop-body">
                  <span class="uiv2-endpoint-backup__hop-name">{hop.name}</span>
                  {#if hop.hiddenIcon}
                    <span class="uiv2-endpoint-backup__hop-secret" aria-hidden="true" title="скрыто">?</span>
                  {:else if hop.flagHtml}
                    <span class="uiv2-endpoint-backup__hop-flag">{@html hop.flagHtml}</span>
                  {/if}
                  <span class="uiv2-endpoint-backup__hop-detail">{hop.detail}</span>
                  <span class="uiv2-endpoint-backup__hop-state">{hop.statusText}</span>
                </div>
              </li>
            {/each}
          </ol>
        </div>
      </div>

      <p class="uiv2-endpoint-backup__warn">
        Для регионов, где Anixart недоступен напрямую. Для повседневной работы лучше VPN и прямой эндпоинт.
      </p>
    </div>
  {/if}
</div>
