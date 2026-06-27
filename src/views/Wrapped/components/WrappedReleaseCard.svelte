<script lang="ts">
  import { navigate } from '../../../stores/navigation';
  import { releasePosterUrl, releaseTitle, type WrappedRelease } from '../shared/wrapped-utils';

  interface Props {
    release: WrappedRelease;
    meta?: string;
    rank?: number;
    size?: 'md' | 'lg';
    variant?: 'row' | 'poster';
    onclick?: () => void;
  }

  let {
    release,
    meta = '',
    rank,
    size = 'md',
    variant = 'row',
    onclick,
  }: Props = $props();

  const poster = $derived(releasePosterUrl(release));
  const title = $derived(releaseTitle(release));
  const id = $derived(Number(release.id ?? 0));

  function handleClick() {
    if (onclick) {
      onclick();
      return;
    }
    if (id > 0) navigate(`/release/${id}`);
  }
</script>

<button
  type="button"
  class="wrapped-release-card wrapped-release-card--{size}"
  class:wrapped-release-card--poster={variant === 'poster'}
  onclick={handleClick}
>
  {#if rank != null}
    <span class="wrapped-release-card__rank">{rank}</span>
  {/if}
  <div
    class="wrapped-release-card__poster"
    style={poster ? `background-image:url('${poster}')` : ''}
  ></div>
  <div class="wrapped-release-card__body">
    <span class="wrapped-release-card__title">{title}</span>
    {#if meta}
      <span class="wrapped-release-card__meta">{meta}</span>
    {/if}
  </div>
</button>
