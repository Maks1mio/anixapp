<script lang="ts">
  import { navigate } from '../../../stores/navigation';
  import RelatedReleaseRow from '../../../components/RelatedReleaseRow.svelte';
  import type { ReleaseCardData } from '../../../types/release';

  const PREVIEW_COUNT = 3;

  interface Props {
    releaseId: number;
    relatedId: number;
    items: ReleaseCardData[];
  }

  let { releaseId, relatedId, items }: Props = $props();

  const preview = $derived(items.slice(0, PREVIEW_COUNT));
  /** Android always shows link to RelatedFragment (chain view), not only when count > preview. */
  const showAllLink = $derived(relatedId > 0);
  const hasCurrent = $derived(preview.some((item) => item.id === releaseId));

  let sectionEl = $state<HTMLElement | undefined>();
  let currentRowEl = $state<HTMLElement | undefined>();
  let bgVisible = $state(false);
  let bgTop = $state(0);
  let bgWidth = $state(0);
  let bgHeight = $state(0);

  function getScrollEl(): HTMLElement | null {
    return sectionEl?.closest('.page__scroll') as HTMLElement | null;
  }

  function syncCurrentBg() {
    const section = sectionEl;
    const row = currentRowEl;
    if (!section || !row || !hasCurrent) {
      bgVisible = false;
      return;
    }

    bgTop = row.offsetTop;
    bgWidth = section.offsetWidth;
    bgHeight = row.offsetHeight;
    bgVisible = true;
  }

  $effect(() => {
    preview.length;
    releaseId;
    const row = currentRowEl;
    const scroll = getScrollEl();
    if (!row || !scroll || !hasCurrent) {
      bgVisible = false;
      return;
    }

    const update = () => requestAnimationFrame(syncCurrentBg);

    update();
    const ro = new ResizeObserver(update);
    ro.observe(row);
    ro.observe(scroll);

    scroll.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      scroll.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  });

  function relatedRowRef(node: HTMLElement, isCurrent: boolean) {
    function apply(active: boolean) {
      if (active) currentRowEl = node;
      else if (currentRowEl === node) currentRowEl = undefined;
    }

    apply(isCurrent);

    return {
      update(active: boolean) {
        apply(active);
      },
      destroy() {
        if (currentRowEl === node) currentRowEl = undefined;
      },
    };
  }
</script>

{#if preview.length > 0}
  <div class="release-page__section release-page__related" bind:this={sectionEl}>
    {#if bgVisible}
      <div
        class="release-page__section-bg"
        aria-hidden="true"
        style:top="{bgTop}px"
        style:width="{bgWidth}px"
        style:height="{bgHeight}px"
      ></div>
    {/if}

    <div class="release-page__block-header">
      <h2 class="release-page__block-title">Связанные релизы</h2>
      {#if showAllLink}
        <button
          type="button"
          class="release-page__block-link"
          onclick={() => navigate(`/release/${relatedId}/related?from=${releaseId}`)}
        >
          Показать всё
        </button>
      {/if}
    </div>

    <div class="release-page__related-list">
      {#each preview as item (item.id)}
        {@const isCurrent = item.id === releaseId}
        <div class="release-page__related-row" use:relatedRowRef={isCurrent}>
          <RelatedReleaseRow data={item} current={isCurrent} />
        </div>
      {/each}
    </div>
  </div>
{/if}
