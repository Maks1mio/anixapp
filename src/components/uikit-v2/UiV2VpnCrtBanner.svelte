<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import bannerArt from '../../assets/vpn/banner-art.png';
  import { portal } from '../../actions/portal';
  import { iconX } from '../icons';
  import { requestOpenExternal } from '../../utils/external-link';
  import {
    CrtScreenRenderer,
    CRT_ABERRATION_OPTIONS,
    CRT_MASK_TYPE_OPTIONS,
    CRT_SLIDER_FIELDS,
    CRT_VPN_STATES_PRESET,
    cloneCrtStates,
    formatCrtValue,
    isCrtScreenSupported,
    loadCrtVpnStates,
    mixCrtParams,
    saveCrtVpnStates,
    sanitizeCrtParams,
    sanitizeCrtStates,
    type CrtScreenParams,
    type CrtScreenStates,
    type CrtSliderKey,
  } from '../../utils/crtScreen';
  import {
    bannerIconSvg,
    cloneStates,
    composeVpnSponsorFrame,
    easeInOutCubic,
    loadVpnBannerStates,
    saveVpnBannerStates,
    sanitizeVpnBannerStates,
    sanitizeVpnOverlay,
    statesSignature,
    VPN_67_COPY,
    VPN_67_URL,
    VPN_BANNER_ICONS,
    VPN_BANNER_STATES_PRESET,
    type VpnBannerOverlay,
    type VpnBannerStates,
  } from '../../utils/vpnSponsorBanner';

  type Props = {
    href?: string;
    class?: string;
  };

  let { href = VPN_67_URL, class: className = '' }: Props = $props();

  const isDev = import.meta.env.DEV;
  const PRESET_REV = 'blocked-wifi-v1';
  const PRESET_REV_KEY = 'anixapp.vpnBannerPresetRev';
  const PANEL_GAP = 8;
  const PANEL_EDGE = 10;

  function shouldApplyPreset(): boolean {
    if (!isDev || typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(PRESET_REV_KEY) !== PRESET_REV;
    } catch {
      return true;
    }
  }

  function markPresetApplied(): void {
    try {
      localStorage.setItem(PRESET_REV_KEY, PRESET_REV);
    } catch {
      /* ignore */
    }
  }

  function initCrtStates(): CrtScreenStates {
    if (shouldApplyPreset()) {
      const next = cloneCrtStates(CRT_VPN_STATES_PRESET);
      if (isDev) saveCrtVpnStates(next);
      return next;
    }
    return isDev ? loadCrtVpnStates() : cloneCrtStates(CRT_VPN_STATES_PRESET);
  }

  function initOverlayStates(): VpnBannerStates {
    if (shouldApplyPreset()) {
      const next = cloneStates(VPN_BANNER_STATES_PRESET);
      if (isDev) saveVpnBannerStates(next);
      markPresetApplied();
      return next;
    }
    return isDev ? loadVpnBannerStates() : cloneStates(VPN_BANNER_STATES_PRESET);
  }

  let rootEl: HTMLAnchorElement | null = $state(null);
  let canvasEl: HTMLCanvasElement | null = $state(null);
  let gearEl: HTMLButtonElement | null = $state(null);
  let panelEl: HTMLDivElement | null = $state(null);
  let panelOpen = $state(false);
  let panelLeft = $state(0);
  let panelTop = $state(0);
  let panelReady = $state(false);
  let pointerDownInside = false;
  let choiceOpen = $state<'maskType' | 'aberrationScheme' | null>(null);
  let copyState = $state<'idle' | 'ok' | 'err'>('idle');
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let crtStates = $state<CrtScreenStates>(initCrtStates());
  let states = $state<VpnBannerStates>(initOverlayStates());
  let editHover = $state(false);
  let redrawBanner: (() => void) | null = null;
  const params = $derived(editHover ? crtStates.hover : crtStates.rest);
  const overlay = $derived(editHover ? states.hover : states.rest);
  const bannerAria = $derived(
    overlay.title.trim()
      ? `${overlay.kicker} ${overlay.title}. ${overlay.body} ${overlay.cta}`.trim()
      : VPN_67_COPY.aria,
  );

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('vpn banner art failed'));
      img.src = src;
    });
  }

  function persistCrt(next: CrtScreenParams) {
    const clean = sanitizeCrtParams(next);
    crtStates = editHover ? { ...crtStates, hover: clean } : { ...crtStates, rest: clean };
    if (isDev) saveCrtVpnStates(crtStates);
  }

  function setSlider(key: CrtSliderKey, raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    persistCrt({ ...params, [key]: value });
  }

  function setSelect(key: 'maskType' | 'aberrationScheme', raw: string) {
    persistCrt({ ...params, [key]: Number(raw) });
  }

  function setClip(on: boolean) {
    persistCrt({ ...params, clipToCurve: on });
  }

  function persistStates(next: VpnBannerStates) {
    states = sanitizeVpnBannerStates(next);
    if (isDev) saveVpnBannerStates(states);
  }

  function persistOverlay(next: VpnBannerOverlay) {
    const clean = sanitizeVpnOverlay(next);
    persistStates(editHover ? { ...states, hover: clean } : { ...states, rest: clean });
  }

  function setOverlayText(key: 'kicker' | 'title' | 'body' | 'cta', value: string) {
    persistOverlay({ ...overlay, [key]: value });
  }

  function setOverlayShift(key: 'textX' | 'textY' | 'textScale', raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    persistOverlay({ ...overlay, [key]: value });
  }

  function setOverlayIcon(id: string) {
    persistOverlay({ ...overlay, icon: id });
  }

  function resetParams() {
    crtStates = cloneCrtStates(CRT_VPN_STATES_PRESET);
    states = cloneStates(VPN_BANNER_STATES_PRESET);
    choiceOpen = null;
    if (isDev) {
      saveCrtVpnStates(crtStates);
      saveVpnBannerStates(states);
    }
  }

  async function copyParams() {
    const text = JSON.stringify(
      {
        crt: sanitizeCrtStates(crtStates),
        overlay: sanitizeVpnBannerStates(states),
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(text);
      copyState = 'ok';
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
        copyState = 'ok';
      } catch {
        copyState = 'err';
      }
    }
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyState = 'idle';
      copyTimer = null;
    }, 1600);
  }

  function closePanel() {
    panelOpen = false;
    panelReady = false;
    choiceOpen = null;
    queueMicrotask(() => gearEl?.focus());
  }

  function toggleChoice(key: 'maskType' | 'aberrationScheme') {
    choiceOpen = choiceOpen === key ? null : key;
  }

  function pickChoice(key: 'maskType' | 'aberrationScheme', value: number) {
    setSelect(key, String(value));
    choiceOpen = null;
  }

  async function updatePanelPosition() {
    const gear = gearEl;
    const panel = panelEl;
    if (!gear || !panel) return;
    await tick();
    const rect = gear.getBoundingClientRect();
    const width = panel.offsetWidth || 280;
    const height = panel.offsetHeight || 420;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.right + PANEL_GAP;
    if (left + width > vw - PANEL_EDGE) {
      left = rect.left - PANEL_GAP - width;
    }
    left = Math.min(Math.max(PANEL_EDGE, left), Math.max(PANEL_EDGE, vw - PANEL_EDGE - width));

    let top = rect.top;
    if (top + height > vh - PANEL_EDGE) {
      top = vh - PANEL_EDGE - height;
    }
    top = Math.max(PANEL_EDGE, top);

    panelLeft = Math.round(left);
    panelTop = Math.round(top);
    panelReady = true;
  }

  async function togglePanel(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (panelOpen) {
      closePanel();
      return;
    }
    panelOpen = true;
    panelReady = false;
    await updatePanelPosition();
    requestAnimationFrame(() => void updatePanelPosition());
    panelEl?.focus();
  }

  $effect(() => {
    if (!isDev || !panelOpen) return;
    void updatePanelPosition();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closePanel();
    };
    const onPtrDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (panelEl?.contains(t) || gearEl?.contains(t)) {
        pointerDownInside = true;
        return;
      }
      if (pointerDownInside) return;
      closePanel();
    };
    const onPtrUp = () => {
      pointerDownInside = false;
    };
    const onReposition = () => {
      void updatePanelPosition();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPtrDown, true);
    window.addEventListener('pointerup', onPtrUp, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPtrDown, true);
      window.removeEventListener('pointerup', onPtrUp, true);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  });

  $effect(() => {
    const root = rootEl;
    const canvas = canvasEl;
    if (!root || !canvas) return;

    let cancelled = false;
    let renderer: CrtScreenRenderer | null = null;
    let raf = 0;
    let source: HTMLCanvasElement | null = null;
    let art: HTMLImageElement | null = null;
    let visible = true;
    let reduced = false;
    let lastCssW = 0;
    let lastCssH = 0;
    let lastDpr = 0;
    let lastOverlayKey = '';
    let engine: 'none' | 'webgl' | '2d' = 'none';
    let pointerHover = false;
    let hoverT = 0;
    let lastTime = 0;

    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncReduced = () => {
      reduced = reduceMq.matches;
    };
    syncReduced();

    const stopLoop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const paintSource = (
      cssW: number,
      cssH: number,
      dpr: number,
      rest: VpnBannerOverlay,
      hover: VpnBannerOverlay,
      t: number,
    ) => {
      if (!art) return;
      const sw = Math.max(1, Math.round(cssW * dpr));
      const sh = Math.max(1, Math.round(cssH * dpr));
      if (!source) source = document.createElement('canvas');
      if (source.width !== sw || source.height !== sh) {
        source.width = sw;
        source.height = sh;
      }
      const ctx = source.getContext('2d', { alpha: true });
      if (!ctx) return;
      composeVpnSponsorFrame(ctx, art, sw, sh, rest, hover, t);
      renderer?.setSource(source);
    };

    const liveCrt = (): CrtScreenStates => untrack(() => cloneCrtStates(crtStates));
    const liveStates = (): VpnBannerStates => untrack(() => cloneStates(states));
    const settingsOpen = () => untrack(() => panelOpen);
    const previewHover = () => untrack(() => editHover);

    const paintFallback = (
      rest: VpnBannerOverlay,
      hover: VpnBannerOverlay,
      t: number,
      cssW: number,
      cssH: number,
      dpr: number,
    ) => {
      if (!art || engine !== '2d') return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      composeVpnSponsorFrame(ctx, art, canvas.width, canvas.height, rest, hover, t);
    };

    const drawFrame = (timeMs: number) => {
      if (!root.isConnected || !art || engine === 'none') return;
      const cssW = Math.max(1, root.clientWidth);
      const cssH = Math.max(1, root.clientHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const dt = lastTime ? Math.min(48, Math.max(0, timeMs - lastTime)) : 16;
      lastTime = timeMs;
      const target = previewHover() || pointerHover ? 1 : 0;
      const tau = 140;
      hoverT += (target - hoverT) * (1 - Math.exp(-dt / tau));
      if (Math.abs(target - hoverT) < 0.002) hoverT = target;
      const eased = easeInOutCubic(hoverT);
      const nextStates = liveStates();
      const overlayKey = `${statesSignature(nextStates)}|${eased.toFixed(3)}`;
      const sizeChanged = cssW !== lastCssW || cssH !== lastCssH || dpr !== lastDpr;
      if (sizeChanged) {
        lastCssW = cssW;
        lastCssH = cssH;
        lastDpr = dpr;
        renderer?.resize(cssW, cssH, dpr);
      }
      if (sizeChanged || overlayKey !== lastOverlayKey) {
        lastOverlayKey = overlayKey;
        if (engine === 'webgl') paintSource(cssW, cssH, dpr, nextStates.rest, nextStates.hover, eased);
        else paintFallback(nextStates.rest, nextStates.hover, eased, cssW, cssH, dpr);
      }
      if (engine !== 'webgl' || !renderer) return;
      const crt = liveCrt();
      const live = mixCrtParams(crt.rest, crt.hover, eased);
      const freeze = reduced && !settingsOpen();
      renderer.setParams(
        freeze
          ? { ...live, speed: 0, flicker: 0, jitter: 0, rollSpeed: 0 }
          : live,
      );
      renderer.render(freeze ? 0 : timeMs);
    };

    const loop = (now: number) => {
      raf = 0;
      if (cancelled || !visible || document.hidden) return;
      const freeze = reduced && !untrack(() => panelOpen);
      const target = untrack(() => editHover) || pointerHover ? 1 : 0;
      if (freeze) hoverT = target;
      drawFrame(now);
      const hoverBusy = Math.abs(target - hoverT) > 0.002;
      if (!freeze || hoverBusy) raf = requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (cancelled || raf || !visible || document.hidden) return;
      raf = requestAnimationFrame(loop);
    };

    const onReduceChange = () => {
      syncReduced();
      stopLoop();
      drawFrame(reduced && !panelOpen ? 0 : performance.now());
      startLoop();
    };

    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };

    const onPointerEnter = () => {
      pointerHover = true;
      startLoop();
    };
    const onPointerLeave = () => {
      pointerHover = false;
      startLoop();
    };

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (!visible) stopLoop();
        else startLoop();
      },
      { threshold: 0.12 },
    );
    io.observe(root);
    root.addEventListener('pointerenter', onPointerEnter);
    root.addEventListener('pointerleave', onPointerLeave);

    const ro = new ResizeObserver(() => {
      drawFrame(performance.now());
    });
    ro.observe(root);

    redrawBanner = () => {
      drawFrame(performance.now());
      if (settingsOpen() || !reduced) startLoop();
    };

    reduceMq.addEventListener('change', onReduceChange);
    document.addEventListener('visibilitychange', onVisibility);

    void (async () => {
      try {
        art = await loadImage(bannerArt);
        if (cancelled) return;

        try {
          if (isCrtScreenSupported()) {
            renderer = new CrtScreenRenderer(canvas);
            engine = 'webgl';
          }
        } catch (err) {
          console.warn('[vpn-crt-banner] webgl fallback', err);
          renderer = null;
        }
        if (!renderer) engine = '2d';

        lastCssW = 0;
        lastCssH = 0;
        lastDpr = 0;
        lastOverlayKey = '';
        drawFrame(performance.now());
        startLoop();

        try {
          if (document.fonts?.ready) await document.fonts.ready;
          await document.fonts?.load('700 24px "IBM Plex Sans"');
          if (cancelled) return;
          lastOverlayKey = '';
          drawFrame(performance.now());
        } catch {
          /* шрифт не обязателен */
        }
      } catch (err) {
        console.warn('[vpn-crt-banner]', err);
      }
    })();

    return () => {
      cancelled = true;
      if (redrawBanner) redrawBanner = null;
      stopLoop();
      io.disconnect();
      root.removeEventListener('pointerenter', onPointerEnter);
      root.removeEventListener('pointerleave', onPointerLeave);
      ro.disconnect();
      reduceMq.removeEventListener('change', onReduceChange);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer?.destroy();
    };
  });

  $effect(() => {
    overlay;
    states;
    crtStates;
    panelOpen;
    editHover;
    redrawBanner?.();
  });

  function onClick(e: MouseEvent) {
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    requestOpenExternal(href);
  }
</script>

<div class="uiv2-vpn-crt-wrap {className}">
  <a
    bind:this={rootEl}
    class="uiv2-vpn-crt"
    href={href}
    rel="noopener noreferrer"
    target="_blank"
    aria-label={bannerAria}
    onclick={onClick}
  >
    <canvas bind:this={canvasEl} class="uiv2-vpn-crt__canvas" aria-hidden="true"></canvas>
  </a>

  {#if isDev}
    <button
      bind:this={gearEl}
      type="button"
      class="uiv2-vpn-crt__gear"
      aria-haspopup="dialog"
      aria-expanded={panelOpen}
      aria-controls="uiv2-vpn-crt-panel"
      onclick={togglePanel}
    >
      Настройки
    </button>

    {#if panelOpen}
      <div
        id="uiv2-vpn-crt-panel"
        class="uiv2-vpn-crt-pop"
        class:uiv2-vpn-crt-pop--ready={panelReady}
        class:uiv2-vpn-crt-pop--choice={choiceOpen !== null}
        style={`left:${panelLeft}px;top:${panelTop}px`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="uiv2-vpn-crt-pop-title"
        tabindex="-1"
        bind:this={panelEl}
        use:portal
        transition:scale={{ duration: 160, start: 0.96, easing: cubicOut }}
      >
        <div class="uiv2-vpn-crt-pop__head">
          <p id="uiv2-vpn-crt-pop-title" class="uiv2-vpn-crt-pop__title">CRT Screen</p>
          <label class="uiv2-vpn-crt-hover">
            <input
              type="checkbox"
              checked={editHover}
              aria-label="Редактировать состояние :hover"
              onchange={(e) => {
                editHover = e.currentTarget.checked;
              }}
            />
            <span class="uiv2-vpn-crt-hover__box" aria-hidden="true"></span>
            :hover
          </label>
          <button type="button" class="uiv2-vpn-crt-pop__text-btn" onclick={copyParams}>
            {copyState === 'ok' ? 'Скопировано' : copyState === 'err' ? 'Ошибка' : 'Скопировать'}
          </button>
          <button type="button" class="uiv2-vpn-crt-pop__text-btn" onclick={resetParams}>
            Сбросить
          </button>
          <button
            type="button"
            class="uiv2-vpn-crt-pop__icon-btn"
            aria-label="Закрыть"
            onclick={closePanel}
          >
            {@html iconX(16)}
          </button>
        </div>

        <div class="uiv2-vpn-crt-pop__body">
          <p class="uiv2-vpn-crt-pop__section">{editHover ? 'Текст :hover' : 'Текст'}</p>
          <label class="uiv2-vpn-crt-text">
            <span class="uiv2-vpn-crt-row__label">Строка 1</span>
            <input
              class="uiv2-vpn-crt-text__input"
              type="text"
              value={overlay.kicker}
              oninput={(e) => setOverlayText('kicker', e.currentTarget.value)}
            />
          </label>
          <label class="uiv2-vpn-crt-text">
            <span class="uiv2-vpn-crt-row__label">Заголовок</span>
            <input
              class="uiv2-vpn-crt-text__input"
              type="text"
              value={overlay.title}
              oninput={(e) => setOverlayText('title', e.currentTarget.value)}
            />
          </label>
          <label class="uiv2-vpn-crt-text">
            <span class="uiv2-vpn-crt-row__label">Подзаголовок</span>
            <textarea
              class="uiv2-vpn-crt-text__input uiv2-vpn-crt-text__input--area"
              rows="2"
              value={overlay.body}
              oninput={(e) => setOverlayText('body', e.currentTarget.value)}
            ></textarea>
          </label>
          <label class="uiv2-vpn-crt-text">
            <span class="uiv2-vpn-crt-row__label">Призыв</span>
            <input
              class="uiv2-vpn-crt-text__input"
              type="text"
              value={overlay.cta}
              oninput={(e) => setOverlayText('cta', e.currentTarget.value)}
            />
          </label>
          <label class="uiv2-vpn-crt-row">
            <span class="uiv2-vpn-crt-row__label">Текст X</span>
            <input
              class="uiv2-vpn-crt-row__range"
              class:uiv2-vpn-crt-row__range--on={overlay.textX !== 0}
              type="range"
              min="-50"
              max="50"
              step="1"
              value={overlay.textX}
              oninput={(e) => setOverlayShift('textX', e.currentTarget.value)}
            />
            <span class="uiv2-vpn-crt-row__value">{Math.round(overlay.textX)}%</span>
          </label>
          <label class="uiv2-vpn-crt-row">
            <span class="uiv2-vpn-crt-row__label">Текст Y</span>
            <input
              class="uiv2-vpn-crt-row__range"
              class:uiv2-vpn-crt-row__range--on={overlay.textY !== 0}
              type="range"
              min="-50"
              max="50"
              step="1"
              value={overlay.textY}
              oninput={(e) => setOverlayShift('textY', e.currentTarget.value)}
            />
            <span class="uiv2-vpn-crt-row__value">{Math.round(overlay.textY)}%</span>
          </label>
          <label class="uiv2-vpn-crt-row">
            <span class="uiv2-vpn-crt-row__label">Текст Scale</span>
            <input
              class="uiv2-vpn-crt-row__range"
              class:uiv2-vpn-crt-row__range--on={overlay.textScale !== 100}
              type="range"
              min="50"
              max="180"
              step="1"
              value={overlay.textScale}
              oninput={(e) => setOverlayShift('textScale', e.currentTarget.value)}
            />
            <span class="uiv2-vpn-crt-row__value">{Math.round(overlay.textScale)}%</span>
          </label>
          <p class="uiv2-vpn-crt-pop__section">Иконка</p>
          <div class="uiv2-vpn-crt-icons" role="listbox" aria-label="Иконка баннера">
            {#each VPN_BANNER_ICONS as ic (ic.id)}
              <button
                type="button"
                class="uiv2-vpn-crt-icons__btn"
                class:uiv2-vpn-crt-icons__btn--on={overlay.icon === ic.id}
                role="option"
                aria-selected={overlay.icon === ic.id}
                title={ic.label}
                onclick={() => setOverlayIcon(ic.id)}
              >
                {@html bannerIconSvg(ic.id, 16)}
              </button>
            {/each}
          </div>

          <p class="uiv2-vpn-crt-pop__section">{editHover ? 'Шейдер :hover' : 'Шейдер'}</p>
          {#each CRT_SLIDER_FIELDS as field (field.key)}
            {#if field.key === 'maskPitch'}
              <div class="uiv2-vpn-crt-row">
                <span class="uiv2-vpn-crt-row__label">Mask type</span>
                <div class="uiv2-vpn-crt-choice">
                  <button
                    type="button"
                    class="uiv2-vpn-crt-choice__btn"
                    aria-haspopup="listbox"
                    aria-expanded={choiceOpen === 'maskType'}
                    onclick={() => toggleChoice('maskType')}
                  >
                    {CRT_MASK_TYPE_OPTIONS.find((o) => o.value === params.maskType)?.label ?? '—'}
                  </button>
                  {#if choiceOpen === 'maskType'}
                    <ul class="uiv2-vpn-crt-choice__menu" role="listbox">
                      {#each CRT_MASK_TYPE_OPTIONS as opt (opt.value)}
                        <li>
                          <button
                            type="button"
                            class="uiv2-vpn-crt-choice__opt"
                            class:uiv2-vpn-crt-choice__opt--on={params.maskType === opt.value}
                            onclick={() => pickChoice('maskType', opt.value)}
                          >
                            {opt.label}
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              </div>
            {/if}

            {#if field.key === 'scanlines'}
              <label class="uiv2-vpn-crt-row">
                <span class="uiv2-vpn-crt-row__label">Clip to curve</span>
                <span class="uiv2-vpn-crt-switch">
                  <input
                    type="checkbox"
                    checked={params.clipToCurve}
                    onchange={(e) => setClip(e.currentTarget.checked)}
                  />
                  <span class="uiv2-vpn-crt-switch__ui" aria-hidden="true"></span>
                </span>
              </label>
            {/if}

            {#if field.key === 'flicker'}
              <div class="uiv2-vpn-crt-row">
                <span class="uiv2-vpn-crt-row__label">Dispersion type</span>
                <div class="uiv2-vpn-crt-choice">
                  <button
                    type="button"
                    class="uiv2-vpn-crt-choice__btn"
                    aria-haspopup="listbox"
                    aria-expanded={choiceOpen === 'aberrationScheme'}
                    onclick={() => toggleChoice('aberrationScheme')}
                  >
                    {CRT_ABERRATION_OPTIONS.find((o) => o.value === params.aberrationScheme)?.label ?? '—'}
                  </button>
                  {#if choiceOpen === 'aberrationScheme'}
                    <ul class="uiv2-vpn-crt-choice__menu" role="listbox">
                      {#each CRT_ABERRATION_OPTIONS as opt (opt.value)}
                        <li>
                          <button
                            type="button"
                            class="uiv2-vpn-crt-choice__opt"
                            class:uiv2-vpn-crt-choice__opt--on={params.aberrationScheme === opt.value}
                            onclick={() => pickChoice('aberrationScheme', opt.value)}
                          >
                            {opt.label}
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              </div>
            {/if}

            <label class="uiv2-vpn-crt-row">
              <span class="uiv2-vpn-crt-row__label">{field.label}</span>
              <input
                class="uiv2-vpn-crt-row__range"
                class:uiv2-vpn-crt-row__range--on={
                  field.key === 'brightness' ? params[field.key] !== 0 : params[field.key] > field.min
                }
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={params[field.key]}
                oninput={(e) => setSlider(field.key, e.currentTarget.value)}
              />
              <span class="uiv2-vpn-crt-row__value">
                {formatCrtValue(field.key, params[field.key], field.unit)}
              </span>
            </label>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
