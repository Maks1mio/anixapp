<script lang="ts">
  import type { Snippet } from 'svelte';
  import Select from '../../../components/Select.svelte';
  import type { SelectOption } from '../../../components/select';
  import {
    iconPlay,
    iconFlag,
    iconMessageCircle,
    iconChevronDown,
    iconBellPlus,
    iconBellRing,
    iconMoreVertical,
    iconInfo,
    iconTriangleAlert,
  } from '../../../components/icons';
  import { showToast } from '../../../stores/toast';
  import { portal } from '../../../actions/portal';
  import MobileDownloadFlow from '../../../components/MobileDownloadFlow.svelte';
  import { downloadsAvailable } from '../../../native/anix-downloads';
  import { iconDownload, iconShare } from '../../../components/icons';
  import TitleInfoTrigger from '../../../components/TitleInfoTrigger.svelte';
  import ReleaseMetaInfoIcon from './ReleaseMetaInfoIcon.svelte';
  import type { ReleaseMetaInfoRow } from '../_metaInfo';
  import type { ListStatusId } from '../_types';
  import { openImageLightbox, formatVoteCount } from '../_utils';
import { requestOpenExternal } from '../../../utils/external-link';
  import { toPosterDisplayUrl } from '../../../utils/posterUrl';
  import AnimatedMediaOverlay from '../../../components/AnimatedMediaOverlay.svelte';
  import { isMobileMode } from '../../../platform/mobile';
  import { openSearchPage } from '../../../search-controller';

  interface Props {
    releaseId?:      number;
    posterUrl:       string;
    /** Anixart 11+: анимированный постер (видео) */
    posterAnimation?: string;
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
    notifyEnabled?:  boolean;
    showNotify?:     boolean;
    onToggleFavorite: () => void;
    onWatch:          () => void;
    onSetStatus:      (v: string) => void;
    onToggleDesc:     () => void;
    onOpenNotify?:    () => void;
    airDate?:          Snippet;
    /** TV: широкая шапка и кнопка статуса вместо Select */
    tvMode?:           boolean;
    statusButtonLabel?: string;
    onOpenStatusPicker?: () => void;
  }

  let {
    releaseId,
    posterUrl, posterAnimation, title, titleRu, titleOriginal, titleAlt, ageRateText, ageIsRestricted,
    isFavorite, favoritesCount,
    isViewBlocked,
    noteHtml, descHtml, descClean, descNeedsTruncate, descCollapsed,
    metaInfoRows, playBtnText, playBtnDisabled, episodeAddedText,
    currentStatus, selectOptions,
    notifyEnabled = false,
    showNotify = false,
    onToggleFavorite, onWatch, onSetStatus, onToggleDesc,
    onOpenNotify,
    airDate,
    tvMode = false,
    statusButtonLabel = 'В список',
    onOpenStatusPicker,
  }: Props = $props();

  const displayPosterUrl = $derived(toPosterDisplayUrl(posterUrl, 'releaseHero'));

  let mqWide = $state(
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 961px)').matches : true,
  );
  const isWide = $derived(tvMode || mqWide);

  const favLabel = $derived(
    favoritesCount > 0 ? formatVoteCount(favoritesCount).replace(/\s/g, ' ') : '',
  );

  $effect(() => {
    if (tvMode) return;
    const mq = window.matchMedia('(min-width: 961px)');
    const update = () => {
      mqWide = mq.matches;
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });

  // Липкая колонка «постер + Смотреть»: прилипает целиком у верхнего края; если не влезает
  // по высоте — нижним краем к низу окна (кнопка всегда видна, постер обрезается сверху).
  let asideEl = $state<HTMLElement | null>(null);
  $effect(() => {
    const aside = asideEl;
    if (!aside) return;
    const scroller = aside.closest<HTMLElement>('.page__scroll') ?? document.documentElement;
    const GAP = 12;
    const update = () => {
      const top = Math.min(GAP, scroller.clientHeight - aside.offsetHeight - GAP);
      aside.style.setProperty('--release-aside-sticky-top', `${top}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(aside);
    ro.observe(scroller);
    return () => ro.disconnect();
  });

  /** Цвета статусов — те же, что у пилюли селекта (uikit-v2.scss) */
  const STATUS_COLORS: Record<string, string> = {
    watching: '#6fa873',
    planned: '#a76fac',
    completed: '#6974ac',
    on_hold: '#d29742',
    dropped: '#c24e4d',
  };

  const statusOptions = $derived(
    selectOptions.map((o) => ({
      ...o,
      icon: `<span class="release-status-dot" style="--release-status-color:${STATUS_COLORS[o.value] ?? 'color-mix(in srgb, var(--uikit-v2-text) 35%, transparent)'}"></span>`,
    })),
  );

  const titleLength = $derived((titleRu || title).length);
  let titleEl = $state<HTMLElement | null>(null);
  let titleClamped = $state(false);

  // Полное название — в нативной подсказке, только если заголовок обрезан line-clamp
  $effect(() => {
    const el = titleEl;
    void titleLength;
    if (!el) return;
    const check = () => {
      titleClamped = el.scrollHeight - el.clientHeight > 2;
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  });

  let moreOpen = $state(false);
  let downloadOpen = $state(false);
  function currentReleaseId(): number {
    return parseInt(/release\/(\d+)/.exec(window.location.pathname)?.[1] ?? '0', 10);
  }

  /** Телефон: «⋮» рядом с «Воспроизвести» — поделиться ссылкой на релиз. */
  async function shareRelease() {
    const id = /release\/(\d+)/.exec(window.location.pathname)?.[1];
    if (!id) return;
    const url = `https://anixart.app/release/${id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: titleRu || title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast('Ссылка скопирована');
    } catch { /* пользователь закрыл диалог */ }
  }

  function scrollToComments() {
    document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Ссылки внутри описания/примечания (сырой HTML от API) перехватываем и отдаём
   * в `requestOpenExternal`: доверенные — модалка подтверждения, остальные — тост.
   * Без этого клик уходил в навигацию фрейма, и Electron открывал сайт во внешнем
   * браузере в обход проверки хостов.
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

{#snippet posterBlock()}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="release-page__poster{posterUrl ? ' release-page__poster--clickable' : ''}"
    data-tv-release-poster
    role={posterUrl ? 'button' : undefined}
    tabindex={posterUrl ? 0 : undefined}
    onclick={(e) => posterUrl && openImageLightbox(displayPosterUrl || posterUrl, e.currentTarget as HTMLElement)}
    onkeydown={(e) => {
      if (e.key === 'Enter' && posterUrl) {
        e.preventDefault();
        openImageLightbox(displayPosterUrl || posterUrl, e.currentTarget as HTMLElement);
      }
    }}
  >
    {#if displayPosterUrl}
      <img src={displayPosterUrl} alt={title} />
      <AnimatedMediaOverlay src={posterAnimation} />
    {:else}
      <div class="release-page__poster-placeholder"></div>
    {/if}
  </div>
{/snippet}

{#snippet briefBlock()}
  <div class="release-page__head-brief">
    <div class="release-page__title-row">
      <h1
        class="release-page__title"
        class:release-page__title--long={titleLength > 48}
        class:release-page__title--xlong={titleLength > 90}
        title={titleClamped ? (titleRu || title) : undefined}
        bind:this={titleEl}
      >{titleRu || title}</h1>
    </div>

    {#if titleOriginal && titleOriginal !== titleRu}
      <p class="release-page__title-en">
        <span class="release-page__title-en-text">{titleOriginal}</span>
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
    <div
      class="release-page__actions-status{currentStatus ? ` release-page__actions-status--${currentStatus}` : ''}"
    >
      {#if tvMode}
        <div class="uiv2-select">
          <div class="uiv2-select__field">
            <button
              type="button"
              class="uiv2-select__trigger"
              aria-haspopup="dialog"
              aria-label="Статус в списке"
              onclick={() => onOpenStatusPicker?.()}
            >
              <span class="uiv2-select__value">
                <span class="uiv2-select__value-main">
                  <span class="uiv2-select__value-label">{statusButtonLabel}</span>
                </span>
              </span>
              <span class="uiv2-select__chevron" aria-hidden="true">
                {@html iconChevronDown(16)}
              </span>
            </button>
          </div>
        </div>
      {:else}
        <Select
          options={statusOptions}
          panelClass="release-status-panel"
          value={currentStatus ?? ''}
          placeholder={isMobileMode() ? 'Не смотрю' : 'Не в списке'}
          onChange={onSetStatus}
        />
      {/if}
    </div>

    <button
      type="button"
      class="release-page__actions-chip release-page__actions-chip--fav{isFavorite ? ' release-page__actions-chip--active' : ''}"
      aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
      aria-pressed={isFavorite}
      onclick={onToggleFavorite}
    >
      <span class="release-page__actions-chip-icon">{@html iconFlag(18, isFavorite)}</span>
      {#if favLabel}
        <span class="release-page__actions-chip-label">{favLabel}</span>
      {/if}
    </button>

    {#if showNotify}
      <button
        type="button"
        class="release-page__actions-chip release-page__actions-chip--notify{notifyEnabled ? ' release-page__actions-chip--notify-on' : ''}"
        aria-label={notifyEnabled ? 'Уведомления о сериях включены' : 'Настроить уведомления о сериях'}
        onclick={() => onOpenNotify?.()}
      >
        <span class="release-page__actions-chip-icon">
          {@html notifyEnabled ? iconBellRing(18, true) : iconBellPlus(18)}
        </span>
      </button>
    {/if}

    <button
      type="button"
      class="release-page__actions-chip release-page__actions-chip--comments"
      aria-label="Комментарии"
      onclick={scrollToComments}
    >
      <span class="release-page__actions-chip-icon">{@html iconMessageCircle(18)}</span>
    </button>

    <TitleInfoTrigger
      titleRu={titleRu || title}
      titleEn={titleOriginal}
      {titleAlt}
      {releaseId}
    />
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
          data-tv-focus-priority="play"
        >
          {#if !playBtnDisabled}
            <span class="release-page__btn-icon">{@html iconPlay(20)}</span>
          {/if}
          <span class="release-page__btn-label">{playBtnText}</span>
        </button>
        {#if isMobileMode()}
          <button type="button" class="release-page__more" aria-label="Ещё" onclick={() => (moreOpen = true)}>
            {@html iconMoreVertical(22)}
          </button>
        {/if}
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
                {#if segment.airCalendar}
                  {@render airDate?.()}
                {:else if segment.query}
                  <button
                    type="button"
                    class="release-page__meta-info-link"
                    onclick={() => openSearchPage(segment.query!, 'releases', segment.searchBy ?? 0)}
                  >{segment.text}</button>
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
        <span class="release-page__note-icon" aria-hidden="true">{@html iconTriangleAlert(18)}</span>
        <div class="release-page__note-body">
          <strong>Недоступно в РФ.</strong>
          Этот тайтл официально заблокирован для просмотра в России. Вы можете попробовать воспроизвести
          на свой страх и риск — видео может не открыться или быть ограничено источником.
        </div>
      </div>
    {:else if noteHtml}
      <div class="release-page__note" role="note">
        <span class="release-page__note-icon" aria-hidden="true">{@html iconInfo(18)}</span>
        <div class="release-page__note-body" onclick={onRichTextClick}>{@html noteHtml}</div>
      </div>
    {/if}

    {#if descClean}
      <div
        class="release-page__desc{descCollapsed && descNeedsTruncate ? ' release-page__desc--collapsed' : ''}"
        onclick={onRichTextClick}
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
  {#if isMobileMode() && displayPosterUrl}
    <!-- Телефон: размытая обложка за шапкой, как в референсе -->
    <div class="m-release-bg" aria-hidden="true" style="background-image:url({displayPosterUrl})"></div>
  {/if}
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
    <div class="release-page__head-aside-play" bind:this={asideEl}>
      {@render posterBlock()}
      {@render playBlock()}
    </div>
  {/if}

  {#if !isWide}
    {@render bodyBlock()}
  {/if}
</div>

{#if moreOpen}
  <div class="m-sheet-scrim" role="presentation" use:portal>
    <button type="button" class="m-sheet-scrim__bg" aria-label="Закрыть" onclick={() => (moreOpen = false)}></button>
    <div class="m-sheet-menu" role="menu">
      {#if downloadsAvailable()}
        <button type="button" role="menuitem" onclick={() => { moreOpen = false; downloadOpen = true; }}>
          {@html iconDownload(22)}<span>Скачать серии…</span>
        </button>
      {/if}
      <button type="button" role="menuitem" onclick={() => { moreOpen = false; void shareRelease(); }}>
        {@html iconShare(22)}<span>Поделиться</span>
      </button>
    </div>
  </div>
{/if}

{#if downloadOpen}
  <MobileDownloadFlow
    releaseId={currentReleaseId()}
    releaseTitle={titleRu || title}
    onClose={() => (downloadOpen = false)}
  />
{/if}
