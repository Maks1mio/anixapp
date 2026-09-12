<script lang="ts">
  import { onMount } from 'svelte';
  import UiV2VpnCrtBanner from './UiV2VpnCrtBanner.svelte';
  import {
    adEmbedUrlById,
    adEmbedUrlBySlot,
    fetchAdEmbed,
    type CrtAdVisual,
  } from '../../services/ads-api';
  import { requestOpenExternal } from '../../utils/external-link';
  import type { CrtScreenStates } from '../../utils/crtScreen';
  import type { VpnBannerStates } from '../../utils/vpnSponsorBanner';

  type Props = {
    href?: string;
    class?: string;
    slotId?: string;
    adId?: string;
    creative?: CrtAdVisual | null;
    imageUrl?: string | null;
    width?: string;
    height?: string;
    aspectRatio?: string;
    /** Режим редактора — нативный канвас, не iframe */
    editable?: boolean;
    hideGear?: boolean;
    enableDrag?: boolean;
    editHover?: boolean;
    onCreativeChange?: (next: { crt: CrtScreenStates; overlay: VpnBannerStates }) => void;
  };

  let {
    href = '',
    class: className = '',
    slotId = '',
    adId = '',
    creative = null,
    imageUrl = null,
    width = '',
    height = '',
    aspectRatio = '',
    editable = false,
    hideGear = false,
    enableDrag = false,
    editHover = $bindable(false),
    onCreativeChange,
  }: Props = $props();

  const useEditor = $derived(Boolean(editable || onCreativeChange));
  const embedSrc = $derived(
    useEditor
      ? ''
      : adId
        ? adEmbedUrlById(adId)
        : slotId
          ? adEmbedUrlBySlot(slotId)
          : '',
  );

  let metaW = $state('100%');
  let metaH = $state('auto');
  let metaAr = $state('16 / 11');
  let title = $state('Реклама');

  const boxStyle = $derived.by(() => {
    const w = width || creative?.width || metaW || '100%';
    const h = height || creative?.height || metaH || '';
    const ar = aspectRatio || creative?.aspectRatio || metaAr || '16 / 11';
    const parts = [`width:${w}`];
    if (h && h !== 'auto') parts.push(`height:${h}`, 'aspect-ratio:auto');
    else parts.push(`aspect-ratio:${ar}`);
    return parts.join(';');
  });

  $effect(() => {
    if (useEditor || !slotId || adId) return;
    let cancelled = false;
    void fetchAdEmbed(slotId)
      .then((row) => {
        if (cancelled || !row) return;
        metaW = row.width || '100%';
        metaH = row.height || 'auto';
        metaAr = row.aspectRatio || '16 / 11';
        title = row.title || 'Реклама';
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  onMount(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data !== 'object') return;
      if ((data as { type?: string }).type !== 'anix-ad-click') return;
      const link = String((data as { href?: string }).href ?? '').trim();
      if (!link) return;
      requestOpenExternal(link);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });
</script>

{#if useEditor}
  <UiV2VpnCrtBanner
    {href}
    class={className}
    {creative}
    {imageUrl}
    {width}
    {height}
    {aspectRatio}
    editable={true}
    {hideGear}
    {enableDrag}
    bind:editHover
    {onCreativeChange}
  />
{:else if embedSrc}
  <div class="uiv2-crt-ad-iframe-wrap {className}" style={boxStyle}>
    <iframe
      class="uiv2-crt-ad-iframe"
      src={embedSrc}
      title={title}
      loading="lazy"
      referrerpolicy="no-referrer"
      allow="autoplay"
    ></iframe>
  </div>
{:else}
  <UiV2VpnCrtBanner
    {href}
    class={className}
    {slotId}
    {creative}
    {imageUrl}
    {width}
    {height}
    {aspectRatio}
  />
{/if}

<style>
  .uiv2-crt-ad-iframe-wrap {
    position: relative;
    max-width: 100%;
    overflow: hidden;
    border-radius: 14px;
    border: 1px solid #595959;
    background: #050506;
  }

  .uiv2-crt-ad-iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
</style>
