<script lang="ts">
  import ReleaseCardUiV2 from './ReleaseCardUiV2.svelte';
  import type { ReleaseCardData } from '../types/release';
  import { navigate } from '../stores/navigation';
  import { toCdnProxyUrl } from '../utils/posterUrl';

  interface Props {
    data: ReleaseCardData;
    isFirst?: boolean;
    isLast?: boolean;
    isCurrent?: boolean;
    /** Компактная строка, как в Anixart на странице релиза (только телефон) */
    compact?: boolean;
    /** Строка страницы «Связанные релизы» на телефоне, как в Anixart: постер, чипы «сезон год» и «тип», описание */
    mobileCard?: boolean;
  }

  let {
    data,
    isFirst = false,
    isLast = false,
    isCurrent = false,
    compact = false,
    mobileCard = false,
  }: Props = $props();

  // compact: постер, название, «год • оценка ★ тип», у текущего — «Вы здесь»
  const metaYear = $derived(data.year ? `${data.year} год` : '');
  const metaRating = $derived(data.rating ? `${Math.round(data.rating * 10) / 10} ★` : '');

  const SEASONS = ['', 'зима', 'весна', 'лето', 'осень'];
  const LIST_LABELS: Record<string, string> = {
    watching: 'смотрю', planned: 'в планах', completed: 'просмотрено', on_hold: 'отложено', dropped: 'брошено',
  };
  const seasonChip = $derived(
    data.year ? `${data.season ? `${SEASONS[data.season] ?? ''} ` : ''}${data.year} г.`.trim() : '',
  );
  const episodesLabel = $derived.by(() => {
    const rel = data.episodesReleased;
    const total = data.episodesTotal;
    if (rel && total && rel !== total) return `${rel} из ${total} эп`;
    if (total || rel) return `${total || rel} эп`;
    return '';
  });

  function open() {
    if (!isCurrent && data.id) navigate(`/release/${data.id}`);
  }
</script>

{#if compact}
  <button type="button" class="m-related" class:m-related--current={isCurrent} onclick={open}>
    <span class="m-related__poster">
      {#if data.poster}<img src={toCdnProxyUrl(data.poster)} alt="" loading="lazy" decoding="async" />{/if}
    </span>
    <span class="m-related__body">
      <span class="m-related__title">{data.titleRu || data.titleEn || 'Без названия'}</span>
      <span class="m-related__meta">
        {[metaYear, metaRating].filter(Boolean).join(' • ')}
        {#if data.category}<span class="m-related__type">{data.category}</span>{/if}
      </span>
    </span>
    {#if isCurrent}<span class="m-related__here">Вы здесь</span>{/if}
  </button>
{:else if mobileCard}
  <button
    type="button"
    class="m-related-card"
    class:m-related-card--last={isLast}
    class:m-related-card--current={isCurrent}
    aria-current={isCurrent ? 'page' : undefined}
    onclick={open}
  >
    <span class="m-related-card__poster">
      {#if data.poster}<img src={toCdnProxyUrl(data.poster)} alt="" loading="lazy" decoding="async" />{/if}
      {#if data.listStatus}
        <span class="m-related-card__badge m-related-card__badge--{data.listStatus}">{LIST_LABELS[data.listStatus]}</span>
      {/if}
    </span>
    <span class="m-related-card__body">
      <span class="m-related-card__title">{data.titleRu || data.titleEn || 'Без названия'}</span>
      <span class="m-related-card__meta">{[episodesLabel, metaRating].filter(Boolean).join(' • ')}</span>
      {#if seasonChip || data.category || isCurrent}
        <span class="m-related-card__chips">
          {#if isCurrent}<span class="m-related-card__here">Вы здесь</span>{/if}
          {#if seasonChip}<span>{seasonChip}</span>{/if}
          {#if data.category}<span>{data.category}</span>{/if}
        </span>
      {/if}
      {#if data.description}<span class="m-related-card__desc">{data.description}</span>{/if}
    </span>
  </button>
{:else}

<div
  class="related-v2-row"
  class:related-v2-row--first={isFirst}
  class:related-v2-row--last={isLast}
  class:related-v2-row--current={isCurrent}
>
  <div class="related-v2-row__rail" aria-hidden="true">
    {#if !isFirst}
      <span class="related-v2-row__line related-v2-row__line--top"></span>
    {:else}
      <span class="related-v2-row__spacer"></span>
    {/if}
    <span class="related-v2-row__node"></span>
    {#if !isLast}
      <span class="related-v2-row__line related-v2-row__line--bottom"></span>
    {:else}
      <span class="related-v2-row__spacer"></span>
    {/if}
  </div>

  <div class="related-v2-row__card">
    <ReleaseCardUiV2 data={data} variant="horizontal" disableOpen={isCurrent} />
  </div>
</div>
{/if}
