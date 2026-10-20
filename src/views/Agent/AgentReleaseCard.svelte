<script lang="ts">
  import type { AgentReleaseCard } from '../../services/agent-api';
  import { resolveCdnAssetUrl } from '../../utils/posterUrl';
  import { iconStar } from '../../components/icons';

  interface Props {
    release: AgentReleaseCard;
    onOpen: (id: number) => void;
  }
  let { release, onOpen }: Props = $props();

  const poster = $derived(release.image ? resolveCdnAssetUrl(release.image) : '');
  const meta = $derived([release.year, release.category].filter(Boolean).join(' · '));
  let broken = $state(false);
</script>

<button type="button" class="agent-card" onclick={() => onOpen(release.id)} title={release.title_original ?? release.title}>
  <span class="agent-card__poster">
    {#if poster && !broken}
      <img src={poster} alt="" loading="lazy" onerror={() => (broken = true)} />
    {:else}
      <span class="agent-card__poster-fallback">{release.title.slice(0, 1)}</span>
    {/if}
    {#if release.grade != null}
      <span class="agent-card__grade">{@html iconStar(11)} {release.grade.toFixed(2)}</span>
    {/if}
  </span>
  <span class="agent-card__body">
    <span class="agent-card__title">{release.title}</span>
    {#if meta}<span class="agent-card__meta">{meta}</span>{/if}
    {#if release.episodes || release.status}
      <span class="agent-card__meta">{[release.status, release.episodes ? `${release.episodes} эп.` : ''].filter(Boolean).join(' · ')}</span>
    {/if}
    {#if release.genres.length}
      <span class="agent-card__genres">{release.genres.slice(0, 3).join(', ')}</span>
    {/if}
  </span>
</button>

<style>
  .agent-card {
    display: flex;
    flex-direction: column;
    width: 9.5rem;
    flex: none;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 8%, transparent);
    border-radius: 0.85rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 4%, transparent);
    color: var(--uikit-v2-text, #fff);
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease;
  }

  .agent-card:hover,
  .agent-card:focus-visible {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--uikit-v2-accent, #8f7bff) 55%, transparent);
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 7%, transparent);
    outline: none;
  }

  .agent-card__poster {
    position: relative;
    display: block;
    aspect-ratio: 2 / 3;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 6%, transparent);
  }

  .agent-card__poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .agent-card__poster-fallback {
    display: grid;
    place-items: center;
    height: 100%;
    font-size: 2rem;
    font-weight: 700;
    color: var(--uikit-v2-muted, #999);
  }

  .agent-card__grade {
    position: absolute;
    left: 0.4rem;
    top: 0.4rem;
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.15rem 0.4rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.62);
    color: #ffd36e;
    font-size: 0.72rem;
    font-weight: 700;
    backdrop-filter: blur(6px);
  }

  .agent-card__body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.55rem 0.6rem 0.65rem;
    min-width: 0;
  }

  .agent-card__title {
    font-size: 0.82rem;
    font-weight: 650;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .agent-card__meta,
  .agent-card__genres {
    font-size: 0.72rem;
    color: var(--uikit-v2-muted, #999);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
