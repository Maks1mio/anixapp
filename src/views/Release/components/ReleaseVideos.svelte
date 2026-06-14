<script lang="ts">
  import { onMount } from 'svelte';
  import {
    formatVideoDate,
    normalizeStreamingPlatforms,
    normalizeVideo,
    normalizeVideoBlocks,
    videoAuthor,
    videoEmbedUrl,
    type ReleaseVideoBlockData,
    type ReleaseVideoItem,
    type ReleaseStreamingPlatform,
  } from '../_videoUtils';

  interface Props {
    releaseId: number;
    releaseTitle: string;
  }

  let { releaseId, releaseTitle }: Props = $props();

  let loading = $state(true);
  let blocks = $state<ReleaseVideoBlockData[]>([]);
  let streamingPlatforms = $state<ReleaseStreamingPlatform[]>([]);
  let expanded = $state(false);
  let activeCategoryId = $state<number | null>(null);
  let categoryVideos = $state<ReleaseVideoItem[]>([]);
  let categoryLoading = $state(false);
  let playingVideo = $state<ReleaseVideoItem | null>(null);

  const hasContent = $derived(blocks.length > 0 || streamingPlatforms.length > 0);
  const activeBlock = $derived(blocks.find((b) => b.category.id === activeCategoryId) ?? null);
  const activeCategoryName = $derived(activeBlock?.category.name ?? '');
  const embedSrc = $derived(playingVideo ? videoEmbedUrl(playingVideo) : '');

  async function loadVideos() {
    if (!window.anixApi) return;
    loading = true;
    try {
      const data = await window.anixApi.release.getVideos(releaseId) as Record<string, unknown>;
      blocks = normalizeVideoBlocks(data.blocks);
      streamingPlatforms = normalizeStreamingPlatforms(data.streaming_platforms);
    } catch {
      blocks = [];
      streamingPlatforms = [];
    } finally {
      loading = false;
    }
  }

  async function loadCategoryVideos(categoryId: number, seed: ReleaseVideoItem[]) {
    if (!window.anixApi) {
      categoryVideos = seed;
      return;
    }
    categoryLoading = true;
    categoryVideos = seed;
    try {
      for (const page of [0, 1]) {
        const data = await window.anixApi.release.getVideoInCategory(releaseId, categoryId, page) as Record<string, unknown>;
        const content = Array.isArray(data.content) ? data.content : [];
        if (!content.length) break;
        const mapped = content.map((v) => normalizeVideo(v as Record<string, unknown>));
        categoryVideos = page === 0 ? mapped : [...categoryVideos, ...mapped];
        if (content.length < 25) break;
      }
    } catch {
      categoryVideos = seed;
    } finally {
      categoryLoading = false;
    }
  }

  function openCategory(categoryId: number) {
    activeCategoryId = categoryId;
    expanded = false;
    playingVideo = null;
    const block = blocks.find((b) => b.category.id === categoryId);
    void loadCategoryVideos(categoryId, block?.videos ?? []);
  }

  function showAll() {
    expanded = true;
    activeCategoryId = null;
    playingVideo = null;
    categoryVideos = [];
  }

  function closeCategory() {
    activeCategoryId = null;
    categoryVideos = [];
    playingVideo = null;
  }

  function collapseAll() {
    expanded = false;
    activeCategoryId = null;
    categoryVideos = [];
    playingVideo = null;
  }

  function playVideo(video: ReleaseVideoItem) {
    playingVideo = video;
  }

  function closePlayer() {
    playingVideo = null;
  }

  function openPlatform(url: string) {
    if (window.electron?.openExternal) window.electron.openExternal(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }

  onMount(() => {
    void loadVideos();
  });
</script>

{#if loading}
  <!-- skeleton omitted -->
{:else if hasContent}
  <div class="release-page__section release-page__videos">
    <div class="release-page__block-header release-page__videos-header">
      <h2 class="release-page__block-title">Видео</h2>
      {#if !expanded && !activeCategoryId && blocks.length > 0}
        <button type="button" class="release-page__block-link" onclick={showAll}>Показать все</button>
      {:else if expanded || activeCategoryId}
        <button type="button" class="release-page__block-link" onclick={collapseAll}>Свернуть</button>
      {/if}
    </div>

    {#if streamingPlatforms.length > 0 && (expanded || !activeCategoryId)}
      <div class="release-page__video-platforms">
        {#each streamingPlatforms as platform (platform.id)}
          <button
            type="button"
            class="release-page__video-platform"
            onclick={() => openPlatform(platform.url)}
          >
            {#if platform.icon}
              <img src={platform.icon} alt="" loading="lazy" decoding="async" />
            {/if}
            <span>{platform.name}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if playingVideo && embedSrc}
      <div class="release-page__video-player">
        <div class="release-page__video-player-frame">
          <iframe
            src={embedSrc}
            title={playingVideo.title || 'Видео'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          ></iframe>
        </div>
        <div class="release-page__video-player-meta">
          <span class="release-page__video-player-title">{playingVideo.title}</span>
          <button type="button" class="release-page__video-player-close" onclick={closePlayer}>Закрыть</button>
        </div>
      </div>
    {/if}

    {#if expanded}
      {#each blocks as block (block.category.id)}
        <div class="release-page__video-block">
          <h3 class="release-page__video-block-title">{block.category.name}</h3>
          <div class="release-page__video-scroll">
            {#each block.videos as video (video.id)}
              <button type="button" class="release-page__video-thumb" onclick={() => playVideo(video)}>
                {#if video.image}
                  <img src={video.image} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                {/if}
                {#if video.hosting?.icon}
                  <span class="release-page__video-host-icon">
                    <img src={video.hosting.icon} alt="" />
                  </span>
                {/if}
                <span class="release-page__video-thumb-label">{video.title}</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    {:else if activeCategoryId}
      <div class="release-page__video-category-head">
        <button type="button" class="release-page__video-back" onclick={closeCategory} aria-label="Назад">←</button>
        <span>{activeCategoryName}</span>
      </div>

      <div class="release-page__video-list">
        {#if categoryLoading && categoryVideos.length === 0}
          <div class="release-page__video-list-loading">Загрузка…</div>
        {:else}
          {#each categoryVideos as video (video.id)}
            <button
              type="button"
              class="release-page__video-row"
              class:release-page__video-row--active={playingVideo?.id === video.id}
              onclick={() => playVideo(video)}
            >
              <div class="release-page__video-row-poster">
                {#if video.image}
                  <img src={video.image} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                {/if}
                {#if video.hosting?.icon}
                  <span class="release-page__video-host-icon">
                    <img src={video.hosting.icon} alt="" />
                  </span>
                {/if}
              </div>
              <div class="release-page__video-row-body">
                <span class="release-page__video-row-title">{video.title}</span>
                <span class="release-page__video-row-meta">
                  {videoAuthor(video)}
                  {#if video.timestamp}
                    <span aria-hidden="true"> · </span>{formatVideoDate(video.timestamp)}
                  {/if}
                </span>
                <span class="release-page__video-row-release">{releaseTitle}</span>
                {#if video.category?.name}
                  <span class="release-page__video-row-tag">{video.category.name}</span>
                {/if}
              </div>
            </button>
          {/each}
        {/if}
      </div>
    {:else if blocks.length > 0}
      <div class="release-page__video-categories">
        {#each blocks as block (block.category.id)}
          {@const cover = block.videos[0]?.image}
          <button
            type="button"
            class="release-page__video-category-card"
            onclick={() => openCategory(block.category.id)}
          >
            <div class="release-page__video-category-poster">
              {#if cover}
                <img src={cover} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
              {:else}
                <div class="release-page__video-category-placeholder"></div>
              {/if}
            </div>
            <span class="release-page__video-category-label">{block.category.name}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
