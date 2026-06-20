<script lang="ts">
  import {
    iconFilm,
    iconGlobe,
    iconTv,
    iconPalette,
    iconBookOpen,
    iconTags,
  } from '../../../components/icons';
  import { countryToFlagCode } from '../../../utils/countryFlags';
  import type { ReleaseMetaIconKind } from '../_metaInfo';

  interface Props {
    kind: ReleaseMetaIconKind;
    country?: string;
  }

  let { kind, country }: Props = $props();

  const flagCode = $derived(kind === 'country' ? countryToFlagCode(country) : null);
  const META_ICON_SIZE = 16;
</script>

<span class="release-page__meta-info-icon" aria-hidden="true">
  {#if flagCode}
    <span class="fi fi-{flagCode} release-page__meta-info-flag"></span>
  {:else if kind === 'country'}
    {@html iconGlobe(META_ICON_SIZE)}
  {:else if kind === 'episodes'}
    {@html iconFilm(META_ICON_SIZE)}
  {:else if kind === 'category'}
    {@html iconTv(META_ICON_SIZE)}
  {:else if kind === 'credits'}
    {@html iconPalette(META_ICON_SIZE)}
  {:else if kind === 'source'}
    {@html iconBookOpen(META_ICON_SIZE)}
  {:else if kind === 'genres'}
    {@html iconTags(META_ICON_SIZE)}
  {/if}
</span>
