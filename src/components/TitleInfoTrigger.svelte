<script lang="ts">
  import { iconInfo, iconCopy, iconCheck } from './icons';
  import { parseAltTitles } from '../utils/titleInfo';
  import UiV2Tooltip from './uikit-v2/UiV2Tooltip.svelte';

  interface Props {
    titleRu?: string;
    titleEn?: string;
    titleAlt?: string;
    className?: string;
  }

  let { titleRu = '', titleEn = '', titleAlt = '', className = '' }: Props = $props();

  const ru = $derived(titleRu.trim());
  const en = $derived(titleEn.trim());
  const altTitles = $derived(parseAltTitles(titleAlt));
  const altText = $derived(altTitles.join('\n'));

  const showRu = $derived(!!ru);
  const showEn = $derived(!!en && en !== ru);
  const showAlt = $derived(altTitles.length > 0);
  const visible = $derived(showRu || showEn || showAlt);

  let copiedId = $state<string | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  async function copy(value: string, id: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      copiedId = id;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copiedId = null;
      }, 1400);
    } catch {
      /* ignore */
    }
  }

  function stopBubble(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }
</script>

{#if visible}
  <UiV2Tooltip
    class="title-info-trigger {className}"
    placement="bottom"
    interactive={true}
    showDelay={80}
    hideDelay={120}
  >
    <button
      type="button"
      class="title-info-trigger__btn"
      aria-label="Названия"
      onclick={stopBubble}
    >
      <span class="title-info-trigger__icon" aria-hidden="true">{@html iconInfo(16)}</span>
    </button>

    {#snippet content()}
      <div class="title-info-popover__inner uiv2-title-info">
        {#if showRu}
          <section class="uiv2-title-info__block">
            <div class="uiv2-title-info__head">
              <span class="uiv2-title-info__label">Название</span>
              <button
                type="button"
                class="uiv2-title-info__copy"
                class:uiv2-title-info__copy--done={copiedId === 'ru'}
                aria-label="Скопировать название"
                onclick={(e) => {
                  stopBubble(e);
                  void copy(ru, 'ru');
                }}
              >
                {@html copiedId === 'ru' ? iconCheck(14) : iconCopy(14)}
              </button>
            </div>
            <p class="uiv2-title-info__value">{ru}</p>
          </section>
        {/if}

        {#if showEn}
          <section class="uiv2-title-info__block">
            <div class="uiv2-title-info__head">
              <span class="uiv2-title-info__label">Оригинальное название</span>
              <button
                type="button"
                class="uiv2-title-info__copy"
                class:uiv2-title-info__copy--done={copiedId === 'en'}
                aria-label="Скопировать оригинальное название"
                onclick={(e) => {
                  stopBubble(e);
                  void copy(en, 'en');
                }}
              >
                {@html copiedId === 'en' ? iconCheck(14) : iconCopy(14)}
              </button>
            </div>
            <p class="uiv2-title-info__value">{en}</p>
          </section>
        {/if}

        {#if showAlt}
          <section class="uiv2-title-info__block">
            <div class="uiv2-title-info__head">
              <span class="uiv2-title-info__label">Альтернативные названия</span>
              <button
                type="button"
                class="uiv2-title-info__copy"
                class:uiv2-title-info__copy--done={copiedId === 'alt'}
                aria-label="Скопировать альтернативные названия"
                onclick={(e) => {
                  stopBubble(e);
                  void copy(altText, 'alt');
                }}
              >
                {@html copiedId === 'alt' ? iconCheck(14) : iconCopy(14)}
              </button>
            </div>
            <p class="uiv2-title-info__value">
              {#each altTitles as alt, i}
                {#if i > 0}<br />{/if}{alt}
              {/each}
            </p>
          </section>
        {/if}
      </div>
    {/snippet}
  </UiV2Tooltip>
{/if}
