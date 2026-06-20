<script lang="ts">
  import { iconInfo, iconCopy } from './icons';
  import { parseAltTitles } from '../utils/titleInfo';

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
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <span
    class="title-info-trigger tooltip-trigger {className}"
    role="button"
    tabindex="0"
    aria-label="Названия"
    onclick={stopBubble}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') stopBubble(e as unknown as MouseEvent); }}
  >
    <span class="title-info-trigger__icon" aria-hidden="true">{@html iconInfo(16)}</span>
    <span
      class="tooltip title-info-popover tooltip--animated tooltip--below"
      role="tooltip"
    >
      <span class="title-info-popover__inner">
        {#if showRu}
          <section class="title-info-popover__block">
            <div class="title-info-popover__head">
              <span class="title-info-popover__label">Название</span>
              <button
                type="button"
                class="title-info-popover__copy{copiedId === 'ru' ? ' title-info-popover__copy--done' : ''}"
                aria-label="Скопировать название"
                onclick={(e) => {
                  stopBubble(e);
                  void copy(ru, 'ru');
                }}
              >
                {@html iconCopy(14)}
              </button>
            </div>
            <p class="title-info-popover__value">{ru}</p>
          </section>
        {/if}

        {#if showEn}
          <section class="title-info-popover__block">
            <div class="title-info-popover__head">
              <span class="title-info-popover__label">Оригинальное название</span>
              <button
                type="button"
                class="title-info-popover__copy{copiedId === 'en' ? ' title-info-popover__copy--done' : ''}"
                aria-label="Скопировать оригинальное название"
                onclick={(e) => {
                  stopBubble(e);
                  void copy(en, 'en');
                }}
              >
                {@html iconCopy(14)}
              </button>
            </div>
            <p class="title-info-popover__value">{en}</p>
          </section>
        {/if}

        {#if showAlt}
          <section class="title-info-popover__block">
            <div class="title-info-popover__head">
              <span class="title-info-popover__label">Альтернативные названия</span>
              <button
                type="button"
                class="title-info-popover__copy{copiedId === 'alt' ? ' title-info-popover__copy--done' : ''}"
                aria-label="Скопировать альтернативные названия"
                onclick={(e) => {
                  stopBubble(e);
                  void copy(altText, 'alt');
                }}
              >
                {@html iconCopy(14)}
              </button>
            </div>
            <p class="title-info-popover__value">
              {#each altTitles as alt, i}
                {#if i > 0}<br />{/if}{alt}
              {/each}
            </p>
          </section>
        {/if}
      </span>
    </span>
  </span>
{/if}
