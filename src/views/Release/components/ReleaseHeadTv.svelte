<script lang="ts">
  import { toPosterDisplayUrl } from '../../../utils/posterUrl';
  import { requestOpenExternal } from '../../../utils/external-link';
  import { iconBookmark, iconChevronDown, iconInfo, iconStar } from '../../../components/icons';
  import type { ReleaseCreditRow } from '../_types';

  interface Props {
    /** Постер релиза — рисуется как арт в правой части экрана. */
    artUrl:         string;
    title:          string;
    titleOriginal:  string;
    ageRateText:    string;
    ageIsRestricted: boolean;
    grade:          number | null;
    hasRating:      boolean;
    episodesText:   string;
    broadcastText:  string;
    durationText:   string;
    countrySeasonYear: string;
    genres:         string;
    descHtml:       string;
    descClean:      string;
    descNeedsTruncate: boolean;
    descCollapsed:  boolean;
    noteHtml:       string;
    isViewBlocked:  boolean;
    statusLabel:    string;
    voteCount:      number;
    yourVote:       number;
    canVote:        boolean;
    playDisabled:   boolean;
    playSubtitle:   string;
    qualityLabels:  string[];
    isFavorite:     boolean;
    credits:        ReleaseCreditRow[];
    onOpenStatusPicker: () => void;
    onOpenVotePicker:   () => void;
    onWatch:            () => void;
    onToggleFavorite:   () => void;
    onToggleDesc:       () => void;
  }

  let {
    artUrl,
    title,
    titleOriginal,
    ageRateText,
    ageIsRestricted,
    grade,
    hasRating,
    episodesText,
    broadcastText,
    durationText,
    countrySeasonYear,
    genres,
    descHtml,
    descClean,
    descNeedsTruncate,
    descCollapsed,
    noteHtml,
    isViewBlocked,
    statusLabel,
    voteCount,
    yourVote,
    canVote,
    playDisabled,
    playSubtitle,
    qualityLabels,
    isFavorite,
    credits,
    onOpenStatusPicker,
    onOpenVotePicker,
    onWatch,
    onToggleFavorite,
    onToggleDesc,
  }: Props = $props();

  const art = $derived(toPosterDisplayUrl(artUrl, 'releaseHero'));
  const collapsed = $derived(descCollapsed && descNeedsTruncate);
  const voteCountLabel = $derived(
    voteCount > 0 ? `${voteCount.toLocaleString('ru-RU')} голосов` : 'Нет голосов',
  );
  const qualityText = $derived(qualityLabels.length ? qualityLabels.join(' / ') : '');
  const episodesLine = $derived([episodesText, broadcastText].filter(Boolean).join(' - '));

  /**
   * Ссылки в описании/примечании (сырой HTML от API) не должны уводить фрейм
   * на внешний сайт: перехватываем и отдаём в `requestOpenExternal`.
   */
  function onRichTextClick(e: MouseEvent) {
    const target = e.target instanceof Element ? e.target.closest('a') : null;
    if (!target) return;
    const href = target.getAttribute('href');
    e.preventDefault();
    e.stopPropagation();
    if (!href) return;
    requestOpenExternal(href);
  }
</script>

<div class="tv-release-hero" data-tv-release-section="hero">
  <div class="tv-release-hero__art" data-tv-release-poster aria-hidden="true">
    {#if art}
      <img src={art} alt="" decoding="async" fetchpriority="high" />
    {/if}
    <div class="tv-release-hero__art-scrim"></div>
  </div>

  <div class="tv-release-hero__main">
    <h1 class="tv-release-hero__title">{title}</h1>

    <div class="tv-release-hero__sub">
      <span class="tv-release-hero__age" class:tv-release-hero__age--restricted={ageIsRestricted}>
        {ageRateText}
      </span>
      {#if titleOriginal && titleOriginal !== title}
        <span class="tv-release-hero__original">{titleOriginal}</span>
      {/if}
    </div>

    {#if (hasRating && grade != null) || episodesText || durationText || countrySeasonYear}
      <div class="tv-release-hero__facts">
        {#if hasRating && grade != null}
          <span class="tv-release-hero__score">{grade.toFixed(2)}</span>
        {/if}
        {#if episodesLine}
          <span class="tv-release-hero__fact">{episodesLine}</span>
        {/if}
        {#if durationText}
          <span class="tv-release-hero__fact">{durationText}</span>
        {/if}
        {#if countrySeasonYear}
          <span class="tv-release-hero__fact">{countrySeasonYear}</span>
        {/if}
      </div>
    {/if}

    {#if genres}
      <p class="tv-release-hero__genres">{genres}</p>
    {/if}

    {#if descClean}
      <div class="tv-release-hero__desc" class:tv-release-hero__desc--collapsed={collapsed}>
        <div class="tv-release-hero__desc-text" onclick={onRichTextClick}>{@html descHtml}</div>
        {#if descNeedsTruncate}
          <button type="button" class="tv-release-hero__more" onclick={onToggleDesc}>
            {descCollapsed ? 'Показать больше...' : 'Свернуть'}
          </button>
        {/if}
      </div>
    {/if}

    {#if isViewBlocked}
      <div class="tv-release-hero__note tv-release-hero__note--warn" role="note">
        <span class="tv-release-hero__note-icon">{@html iconInfo(22)}</span>
        <div class="tv-release-hero__note-text">
          <strong>Недоступно в РФ.</strong> Этот тайтл официально заблокирован для просмотра в России.
          Вы можете попробовать воспроизвести на свой страх и риск — видео может не открыться или быть
          ограничено источником.
        </div>
      </div>
    {:else if noteHtml}
      <div class="tv-release-hero__note">
        <span class="tv-release-hero__note-icon">{@html iconInfo(22)}</span>
        <div class="tv-release-hero__note-text" onclick={onRichTextClick}>{@html noteHtml}</div>
      </div>
    {/if}
  </div>

  <div class="tv-release-hero__bar">
    <div class="tv-release-hero__cards">
      <button type="button" class="tv-release-hero__card tv-release-hero__card--status" onclick={onOpenStatusPicker}>
        <span class="tv-release-hero__card-label">Категория</span>
        <span class="tv-release-hero__card-value">{statusLabel}</span>
        <span class="tv-release-hero__card-icon" aria-hidden="true">{@html iconChevronDown(24)}</span>
      </button>

      <button
        type="button"
        class="tv-release-hero__card tv-release-hero__card--vote"
        class:tv-release-hero__card--disabled={!canVote}
        disabled={!canVote}
        onclick={onOpenVotePicker}
      >
        <span class="tv-release-hero__card-label">Оценить</span>
        <span class="tv-release-hero__card-value">{canVote ? voteCountLabel : 'Недоступно'}</span>
        <span
          class="tv-release-hero__card-icon tv-release-hero__card-icon--star"
          class:tv-release-hero__card-icon--on={yourVote > 0}
          aria-hidden="true"
        >{@html iconStar(26, yourVote > 0)}</span>
      </button>
    </div>

    <div class="tv-release-hero__actions">
      <button
        type="button"
        class="tv-release-hero__play"
        class:tv-release-hero__play--disabled={playDisabled}
        disabled={playDisabled}
        title={playSubtitle || 'Смотреть'}
        onclick={onWatch}
      >
        <span class="tv-release-hero__play-title">{playDisabled ? 'Скоро' : 'Смотреть'}</span>
        {#if !playDisabled && playSubtitle}
          <span class="tv-release-hero__play-sub">{playSubtitle}</span>
        {/if}
        {#if !playDisabled && qualityText}
          <span class="tv-release-hero__quality">{qualityText}</span>
        {/if}
      </button>

      <button
        type="button"
        class="tv-release-hero__fav"
        class:tv-release-hero__fav--on={isFavorite}
        aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
        onclick={onToggleFavorite}
      >
        {@html iconBookmark(28)}
      </button>

      {#if credits.length > 0}
        <div class="tv-release-hero__credits">
          {#each credits as row (row.label)}
            <div class="tv-release-hero__credit">
              <span class="tv-release-hero__credit-label">{row.label}:</span>
              <span class="tv-release-hero__credit-value">{row.value}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Под hero есть ещё секции (о тайтле, рейтинг, кадры…) — подсказываем пультом «вниз». -->
  <div class="tv-release-hero__scroll-hint" aria-hidden="true">
    <span>Подробнее</span>
    <span class="tv-release-hero__scroll-hint-icon">{@html iconChevronDown(26)}</span>
  </div>
</div>
