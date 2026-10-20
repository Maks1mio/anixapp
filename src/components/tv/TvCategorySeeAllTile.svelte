<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import { iconChevronRight } from '../icons';

  interface Props {
    label: string;
    tabId: string;
    /** Куда вести вместо `/home/:tabId` (например, полный список закладок). */
    href?: string;
    text?: string;
  }

  let { label, tabId, href, text = 'Посмотреть всю категорию' }: Props = $props();

  function openCategory(e?: Event) {
    e?.preventDefault();
    navigate(href ?? `/home/${tabId}`);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openCategory();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="tv-category-see-all uiv2-anime-card uiv2-anime-card--vertical"
  role="button"
  tabindex="0"
  aria-label="{text}: {label}"
  onclick={openCategory}
  onkeydown={onKeydown}
>
  <div class="uiv2-anime-card__poster tv-category-see-all__poster">
    <span class="tv-category-see-all__icon" aria-hidden="true">{@html iconChevronRight(28)}</span>
    <span class="tv-category-see-all__text">{text}</span>
  </div>
  <div class="uiv2-anime-card__body">
    <h3 class="uiv2-anime-card__title">{label}</h3>
  </div>
</div>
