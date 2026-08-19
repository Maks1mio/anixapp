<script lang="ts">
  import Select from '../../../components/Select.svelte';
  import type { SelectOption } from '../../../components/select';
  import {
    iconPlay,
    iconFlag,
    iconMessageCircle,
  } from '../../../components/icons';
  import TitleInfoTrigger from '../../../components/TitleInfoTrigger.svelte';
  import ReleaseMetaInfoIcon from './ReleaseMetaInfoIcon.svelte';
  import type { ReleaseMetaInfoRow } from '../_metaInfo';
  import { openReleaseMetaSearch } from '../../../utils/releaseMetaSearch';
  import type { ListStatusId } from '../_types';
  import { openImageLightbox, formatVoteCount } from '../_utils';
  import { toPosterDisplayUrl } from '../../../utils/posterUrl';

  interface Props {
    posterUrl:       string;
    title:           string;
    titleRu:         string;
    titleOriginal:   string;
    titleAlt:        string;
    ageRateText:     string;
    ageIsRestricted: boolean;
    isFavorite:      boolean;
    favoritesCount:  number;
    isViewBlocked:   boolean;
    noteHtml:        string;
    descHtml:        string;
    descClean:       string;
    descNeedsTruncate: boolean;
    descCollapsed:   boolean;
    metaInfoRows:    ReleaseMetaInfoRow[];
    playBtnText:     string;
    playBtnDisabled: boolean;
    episodeAddedText: string | null;
    currentStatus:   ListStatusId | null;
    selectOptions:   SelectOption[];
    onToggleFavorite: () => void;
    onWatch:          () => void;
    onSetStatus:      (v: string) => void;
    onToggleDesc:     () => void;
  }

  let {
    posterUrl, title, titleRu, titleOriginal, titleAlt, ageRateText, ageIsRestricted,
    isFavorite, favoritesCount,
    isViewBlocked,
    noteHtml, descHtml, descClean, descNeedsTruncate, descCollapsed,
    metaInfoRows, playBtnText, playBtnDisabled, episodeAddedText,
    currentStatus, selectOptions,
    onToggleFavorite, onWatch, onSetStatus, onToggleDesc,
  }: Props = $props();

  const displayPosterUrl = $derived(toPosterDisplayUrl(posterUrl, 'releaseHero'));

  let isWide = $state(typeof window !== 'undefined' ? window.matchMedia('(min-width: 961px)').matches : true);

  const favLabel = $derived(
    favoritesCount > 0 ? formatVoteCount(favoritesCount).replace(/\s/g, ' ') : '',
  );

  $effect(() => {
    const mq = window.matchMedia('(min-width: 961px)');
    const update = () => {
      isWide = mq.matches;
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });

  function scrollToComments() {
    document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

{#snippet posterBlock()}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="release-page__poster{posterUrl ? ' release-page__poster--clickable' : ''}"
    role={posterUrl ? 'button' : undefined}
    tabindex={posterUrl ? 0 : undefined}
    onclick={() => posterUrl && openImageLightbox(posterUrl)}
    onkeydown={(e) => e.key === 'Enter' && posterUrl && openImageLightbox(posterUrl)}
  >
    {#if displayPosterUrl}
      <img src={displayPosterUrl} alt={title} />
    {:else}
      <div class="release-page__poster-placeholder"></div>
    {/if}
  </div>
{/snippet}

{#snippet briefBlock()}
  <div class="release-page__head-brief">
    <div class="release-page__title-row">
      <TitleInfoTrigger
        titleRu={titleRu || title}
        titleEn={titleOriginal}
        {titleAlt}
        className="release-page__title-info"
      />
      <h1 class="release-page__title">{titleRu || title}</h1>
    </div>

    {#if titleOriginal && titleOriginal !== titleRu}
      <p class="release-page__title-en">
        {titleOriginal}
        <span class="{ageIsRestricted ? 'release-page__age release-page__age--restricted' : 'release-page__age'}">{ageRateText}</span>
      </p>
    {:else}
      <p class="release-page__title-en">
        <span class="{ageIsRestricted ? 'release-page__age release-page__age--restricted' : 'release-page__age'}">{ageRateText}</span>
      </p>
    {/if}
  </div>
{/snippet}

{#snippet actionsBlock()}
  <div class="release-page__actions">
    <div class="release-page__actions-status">
      <Select
        options={selectOptions}
        value={currentStatus ?? ''}
        placeholder="Не в списке"
        onChange={onSetStatus}
      />
    </div>

    <button
      type="button"
      class="release-page__actions-chip release-page__actions-chip--fav{isFavorite ? ' release-page__actions-chip--active' : ''}"
      title={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
      onclick={onToggleFavorite}
    >
      <span class="release-page__actions-chip-icon">{@html iconFlag(18, isFavorite)}</span>
      {#if favLabel}
        <span class="release-page__actions-chip-label">{favLabel}</span>
      {/if}
    </button>

    <button
      type="button"
      class="release-page__actions-chip release-page__actions-chip--comments"
      aria-label="Комментарии"
      onclick={scrollToComments}
    >
      <span class="release-page__actions-chip-icon">{@html iconMessageCircle(18)}</span>
    </button>
  </div>
{/snippet}

{#snippet playBlock()}
  <div class="release-page__play-slot">
    <div class="release-page__play-bar">
      <div class="release-page__play-row">
        <button
          type="button"
          class="release-page__btn release-page__btn--play{playBtnDisabled ? ' release-page__btn--disabled' : ''}"
          disabled={playBtnDisabled}
          title={playBtnText}
          onclick={onWatch}
        >
          {#if !playBtnDisabled}
            <span class="release-page__btn-icon">{@html iconPlay(20)}</span>
          {/if}
          <span class="release-page__btn-label">{playBtnText}</span>
        </button>
      </div>
    </div>

    {#if episodeAddedText && !playBtnDisabled}
      <p class="release-page__episode-added">{episodeAddedText}</p>
    {/if}
  </div>
{/snippet}

{#snippet bodyBlock()}
  <div class="release-page__head-body">
    {#if metaInfoRows.length > 0}
      <div class="release-page__meta-info release-page__meta-info--flat">
        {#each metaInfoRows as row}
          <div class="release-page__meta-info-row">
            <ReleaseMetaInfoIcon kind={row.kind} country={row.country} />
            <span class="release-page__meta-info-text">
              {#each row.segments as segment, index (index)}
                {#if segment.query != null && segment.searchBy != null}
                  <button
                    type="button"
                    class="release-page__meta-info-link"
                    onclick={() => openReleaseMetaSearch(segment.query!, segment.searchBy!)}
                  >
                    {segment.text}
                  </button>
                {:else}
                  {segment.text}
                {/if}
              {/each}
            </span>
          </div>
        {/each}
      </div>
    {/if}

    {#if isViewBlocked}
      <div class="release-page__note release-page__note--geo-warning" role="note">
        <strong>Недоступно в РФ.</strong>
        Этот тайтл официально заблокирован для просмотра в России. Вы можете попробовать воспроизвести
        на свой страх и риск — видео может не открыться или быть ограничено источником.
      </div>
    {:else if noteHtml}
      <div class="release-page__note">{@html noteHtml}</div>
    {/if}

    {#if descClean}
      <div
        class="release-page__desc{descCollapsed && descNeedsTruncate ? ' release-page__desc--collapsed' : ''}"
      >
        {@html descHtml}
      </div>
      {#if descNeedsTruncate}
        <button type="button" class="release-page__desc-toggle" onclick={onToggleDesc}>
          {descCollapsed ? 'Показать полностью' : 'Свернуть'}
        </button>
      {/if}
    {/if}
  </div>
{/snippet}

<div class="release-page__head" class:release-page__head--narrow={!isWide}>
  <div class="release-page__head-top">
    <div class="release-page__head-intro">
      {#if !isWide}
        <div class="release-page__head-hero">
          {@render posterBlock()}
        </div>
      {/if}
      {@render briefBlock()}
    </div>

    {@render actionsBlock()}

    {#if !isWide}
      {@render playBlock()}
    {/if}

    {#if isWide}
      {@render bodyBlock()}
    {/if}
  </div>

  {#if isWide}
    <div class="release-page__head-aside-play">
      {@render posterBlock()}
      {@render playBlock()}
    </div>
  {/if}

  {#if !isWide}
    {@render bodyBlock()}
  {/if}
</div>
