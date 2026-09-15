<script lang="ts">
  import { requestOpenExternal } from '../../utils/external-link';
  import { toFeedImageUrl } from '../../utils/posterUrl';

  type Props = {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    siteName?: string;
  };

  let {
    title = '',
    description = '',
    image = '',
    url = '',
    siteName = '',
  }: Props = $props();

  const heading = $derived(title.trim() || url.trim() || 'Ссылка');
  const host = $derived(siteName.trim() || hostFromUrl(url));
  const imageSrc = $derived(toFeedImageUrl(image));

  function hostFromUrl(value: string): string {
    try {
      return new URL(value).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  function openLink(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (url) requestOpenExternal(url);
  }
</script>

{#if url || title || image}
  <a
    class="uiv2-feed-embed"
    href={url || undefined}
    rel="noopener noreferrer"
    data-post-action
    onclick={openLink}
  >
    {#if imageSrc}
      <span
        class="uiv2-feed-embed__image"
        style={`background-image:url('${imageSrc}')`}
        aria-hidden="true"
      ></span>
    {/if}
    <span class="uiv2-feed-embed__copy">
      {#if host}
        <span class="uiv2-feed-embed__site">{host}</span>
      {/if}
      <span class="uiv2-feed-embed__title">{heading}</span>
      {#if description}
        <span class="uiv2-feed-embed__desc">{description}</span>
      {/if}
    </span>
  </a>
{/if}
