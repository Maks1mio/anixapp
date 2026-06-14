<script lang="ts">
  import Select from '../../../components/Select.svelte';
  import type { SelectOption } from '../../../components/select';
  import { iconPlay, iconStar } from '../../../components/icons';
  import type { ListStatusId } from '../_types';
  import { openImageLightbox, formatVoteCount } from '../_utils';

  interface Props {
    // Data
    posterUrl:       string;
    title:           string;
    titleRu:         string;
    titleOriginal:   string;
    ageRateText:     string;
    ageIsRestricted: boolean;
    grade:           number | null;
    voteCount:       number;
    hasRating:       boolean;
    ratingBg:        string;
    ratingTextColor: string;
    isFavorite:      boolean;
    favoritesCount:  number;
    noteHtml:        string;
    descHtml:        string;
    descClean:       string;
    descNeedsTruncate: boolean;
    descCollapsed:   boolean;
    metaInfoRows:    Array<{ icon: string; text: string }>;
    playBtnText:     string;
    playBtnDisabled: boolean;
    currentStatus:   ListStatusId | null;
    selectOptions:   SelectOption[];
    // Callbacks
    onToggleFavorite: () => void;
    onWatch:          () => void;
    onSetStatus:      (v: string) => void;
    onToggleDesc:     () => void;
  }

  let {
    posterUrl, title, titleRu, titleOriginal, ageRateText, ageIsRestricted,
    grade, voteCount, hasRating, ratingBg, ratingTextColor,
    isFavorite, favoritesCount,
    noteHtml, descHtml, descClean, descNeedsTruncate, descCollapsed,
    metaInfoRows, playBtnText, playBtnDisabled,
    currentStatus, selectOptions,
    onToggleFavorite, onWatch, onSetStatus, onToggleDesc,
  }: Props = $props();
</script>

<div class="release-page__head">

  <!-- ── Left: poster + play + status ── -->
  <div class="release-page__left">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="release-page__poster{posterUrl ? ' release-page__poster--clickable' : ''}"
      role={posterUrl ? 'button' : undefined}
      tabindex={posterUrl ? 0 : undefined}
      onclick={() => posterUrl && openImageLightbox(posterUrl)}
      onkeydown={(e) => e.key === 'Enter' && posterUrl && openImageLightbox(posterUrl)}
    >
      {#if posterUrl}
        <img src={posterUrl} alt={title} />
      {:else}
        <div class="release-page__poster-placeholder"></div>
      {/if}
    </div>

    <div class="release-page__play-row">
      <button
        type="button"
        class="release-page__btn release-page__btn--play{playBtnDisabled ? ' release-page__btn--disabled' : ''}"
        disabled={playBtnDisabled}
        onclick={onWatch}
      >
        {#if !playBtnDisabled}
          <span class="release-page__btn-icon">{@html iconPlay(20)}</span>
        {/if}
        <span>{playBtnText}</span>
      </button>
    </div>

    <div class="release-page__status-selector">
      <Select
        options={selectOptions}
        value={currentStatus ?? ''}
        placeholder="Добавить в список"
        onChange={onSetStatus}
      />
    </div>
  </div>

  <!-- ── Right: info ── -->
  <div class="release-page__info">
    <div class="release-page__title-row">
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

    <!-- Rating chip + favourite -->
    <div class="release-page__meta-row">
      {#if hasRating && grade != null}
        <span class="release-page__rating" style="background:{ratingBg};color:{ratingTextColor}">
          {grade.toFixed(2)}
          {@html iconStar(14, true)}
          <span class="release-page__rating-votes">{formatVoteCount(voteCount)}</span>
        </span>
      {/if}

      <button
        type="button"
        class="release-page__fav-btn{isFavorite ? ' release-page__fav-btn--active' : ''}"
        title={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
        onclick={onToggleFavorite}
      >
        <span>
          <svg width="18" height="18" viewBox="0 0 24 24"
            fill={isFavorite ? 'currentColor' : 'none'}
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
          </svg>
        </span>
        <span>{favoritesCount > 0 ? formatVoteCount(favoritesCount) : ''}</span>
      </button>
    </div>

    {#if noteHtml}
      <div class="release-page__note">{@html noteHtml}</div>
    {/if}

    {#if descClean}
      <div
        class="release-page__desc{descCollapsed && descNeedsTruncate ? ' release-page__desc--collapsed' : ''}"
        style={descCollapsed && descNeedsTruncate ? 'max-height:6.6em;overflow:hidden' : ''}
      >
        {@html descHtml}
      </div>
      {#if descNeedsTruncate}
        <button type="button" class="release-page__desc-toggle" onclick={onToggleDesc}>
          {descCollapsed ? 'Показать полностью' : 'Свернуть'}
        </button>
      {/if}
    {/if}

    {#if metaInfoRows.length > 0}
      <div class="release-page__meta-info">
        {#each metaInfoRows as row}
          <div class="release-page__meta-info-row">
            <span class="release-page__meta-info-icon">{row.icon}</span>
            <span class="release-page__meta-info-text">{row.text}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
