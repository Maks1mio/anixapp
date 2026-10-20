<script lang="ts">
  import ReleaseCardUiV2 from '../../../components/ReleaseCardUiV2.svelte';
  import AppBadges from '../../../components/AppBadges.svelte';
  import UiV2ReleaseCarousel from '../../../components/uikit-v2/UiV2ReleaseCarousel.svelte';
  import { tick } from 'svelte';
  import { iconChevronLeft, iconChevronRight, iconStar, iconThumbsUp, iconX } from '../../../components/icons';
  import { restoreTvFocus, scheduleFocusTvOverlayContent } from '../../../services/tv-navigation';
  import { normalizeCommentsFromResponse } from '../../../utils/comment';
  import { resolveCdnAssetUrl } from '../../../utils/posterUrl';
  import type { ReleaseCardData } from '../../../types/release';
  import type { CommentData } from '../../../types/comment';
  import { formatCommentTime, stripHtmlToText } from '../_utils';
  import type { ReleaseCreditRow } from '../_types';

  interface Props {
    releaseId:      number;
    release:        Record<string, unknown>;
    infoRows:       ReleaseCreditRow[];
    grade:          number | null;
    hasRating:      boolean;
    voteCount:      number;
    votes:          [number, number, number, number, number];
    yourVote:       number;
    canVote:        boolean;
    listCounts:     { watching: number; planned: number; completed: number; onHold: number; dropped: number };
    screenshots:    string[];
    relatedTitle:   string;
    relatedCards:   ReleaseCardData[];
    recommendedCards: ReleaseCardData[];
    commentCount:   number;
    onOpenVotePicker: () => void;
  }

  let {
    releaseId,
    release,
    infoRows,
    grade,
    hasRating,
    voteCount,
    votes,
    yourVote,
    canVote,
    listCounts,
    screenshots,
    relatedTitle,
    relatedCards,
    recommendedCards,
    commentCount,
    onOpenVotePicker,
  }: Props = $props();

  // ── Рейтинг ────────────────────────────────────────────────────────────────
  const voteTotal = $derived(votes.reduce((sum, n) => sum + n, 0));
  const voteRows = $derived(
    [5, 4, 3, 2, 1].map((star) => {
      const count = votes[star - 1] ?? 0;
      return { star, count, pct: voteTotal > 0 ? (count / voteTotal) * 100 : 0 };
    }),
  );
  const listTotal = $derived(
    listCounts.watching + listCounts.planned + listCounts.completed + listCounts.onHold + listCounts.dropped,
  );
  const listRows = $derived([
    { key: 'watching',  label: 'Смотрят',     count: listCounts.watching },
    { key: 'planned',   label: 'В планах',    count: listCounts.planned },
    { key: 'completed', label: 'Просмотрено', count: listCounts.completed },
    { key: 'on-hold',   label: 'Отложено',    count: listCounts.onHold },
    { key: 'dropped',   label: 'Брошено',     count: listCounts.dropped },
  ].map((row) => ({ ...row, pct: listTotal > 0 ? (row.count / listTotal) * 100 : 0 })));
  const gradeStars = $derived(grade != null ? Math.round(grade) : 0);
  const voteCountLabel = $derived(
    voteCount > 0 ? `${voteCount.toLocaleString('ru-RU')} голосов` : 'Пока нет голосов',
  );
  const showRating = $derived(hasRating || listTotal > 0 || canVote);

  // ── Кадры ──────────────────────────────────────────────────────────────────
  const shots = $derived(screenshots.filter(Boolean).slice(0, 12));

  // TV-просмотрщик: ◀ ▶ листают, «Назад» закрывает, фокус возвращается на кадр.
  let viewerIndex = $state<number | null>(null);
  let viewerDir = $state<1 | -1>(1);
  let shotsRowEl = $state<HTMLElement | null>(null);

  function openShot(index: number) {
    viewerDir = 1;
    viewerIndex = index;
    void tick().then(() => scheduleFocusTvOverlayContent(10));
  }

  function stepShot(dir: 1 | -1) {
    if (viewerIndex == null || shots.length < 2) return;
    viewerDir = dir;
    viewerIndex = (viewerIndex + dir + shots.length) % shots.length;
  }

  function closeShot() {
    const index = viewerIndex;
    viewerIndex = null;
    if (index == null) return;
    restoreTvFocus(shotsRowEl?.querySelectorAll<HTMLElement>('.tv-release-body__shot')[index] ?? null);
  }

  $effect(() => {
    if (viewerIndex == null) return;
    // window capture срабатывает раньше document capture TV-навигации.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      stepShot(event.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // Соседние кадры — заранее в кэш, чтобы листание было мгновенным.
  $effect(() => {
    if (viewerIndex == null || shots.length < 2) return;
    for (const d of [-1, 1]) {
      const img = new Image();
      img.src = shots[(viewerIndex + d + shots.length) % shots.length];
    }
  });

  // ── Комментарии ────────────────────────────────────────────────────────────
  let comments = $state<CommentData[]>([]);
  let revealed = $state<Record<number, boolean>>({});

  $effect(() => {
    const preview = normalizeCommentsFromResponse(release);
    revealed = {};
    if (preview.length > 0 || !commentCount || !window.anixApi?.comments?.release) {
      comments = preview;
      return;
    }

    let cancelled = false;
    void window.anixApi.comments.release
      .list(releaseId, 0, 0)
      .then((data) => {
        if (!cancelled) comments = normalizeCommentsFromResponse(data as Record<string, unknown>);
      })
      .catch(() => {
        if (!cancelled) comments = [];
      });
    return () => {
      cancelled = true;
    };
  });

  const visibleComments = $derived(
    comments.filter((c) => !c.isDeleted && !c.parentCommentId && c.message.trim()).slice(0, 12),
  );

  function commentText(c: CommentData): string {
    return stripHtmlToText(c.message);
  }

  function toggleSpoiler(c: CommentData) {
    if (!c.isSpoiler) return;
    revealed = { ...revealed, [c.id]: !revealed[c.id] };
  }
</script>

<div class="tv-release-body">
  {#if infoRows.length > 0}
    <section class="tv-release-body__section" data-tv-release-section="info" aria-label="О тайтле">
      <h2 class="tv-release-body__title">О тайтле</h2>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="tv-release-body__panel tv-release-body__info" tabindex="0" role="group" aria-label="О тайтле">
        {#each infoRows as row (row.label)}
          <div class="tv-release-body__info-row" class:tv-release-body__info-row--wide={row.wide}>
            <span class="tv-release-body__info-label">{row.label}</span>
            <span class="tv-release-body__info-value">{row.value}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if showRating}
    <section class="tv-release-body__section" data-tv-release-section="rating" aria-label="Рейтинг">
      <h2 class="tv-release-body__title">Рейтинг</h2>
      <button
        type="button"
        class="tv-release-body__panel tv-release-body__rating"
        class:tv-release-body__rating--static={!canVote}
        aria-label={canVote ? 'Оценить релиз' : 'Рейтинг'}
        onclick={() => { if (canVote) onOpenVotePicker(); }}
      >
        <span class="tv-release-body__score">
          <span class="tv-release-body__score-value">{hasRating && grade != null ? grade.toFixed(2) : '—'}</span>
          <span class="tv-release-body__score-stars" aria-hidden="true">
            {#each [1, 2, 3, 4, 5] as star (star)}
              <span class:tv-release-body__score-star--on={star <= gradeStars}>{@html iconStar(22, star <= gradeStars)}</span>
            {/each}
          </span>
          <span class="tv-release-body__score-count">{voteCountLabel}</span>
          {#if canVote}
            <span class="tv-release-body__your-vote" class:tv-release-body__your-vote--set={yourVote > 0}>
              {#if yourVote > 0}
                {@html iconStar(18, true)} Ваша оценка: {yourVote}
              {:else}
                Нажмите, чтобы оценить
              {/if}
            </span>
          {/if}
        </span>

        <span class="tv-release-body__bars" aria-label="Распределение оценок">
          {#each voteRows as row (row.star)}
            <span class="tv-release-body__bar-row">
              <span class="tv-release-body__bar-label">{row.star}{@html iconStar(14, true)}</span>
              <span class="tv-release-body__bar-track">
                <span class="tv-release-body__bar-fill tv-release-body__bar-fill--vote" style:width="{row.pct}%"></span>
              </span>
              <span class="tv-release-body__bar-count">{row.count.toLocaleString('ru-RU')}</span>
            </span>
          {/each}
        </span>

        {#if listTotal > 0}
          <span class="tv-release-body__bars" aria-label="В списках">
            {#each listRows as row (row.key)}
              <span class="tv-release-body__bar-row tv-release-body__bar-row--list">
                <span class="tv-release-body__bar-label">{row.label}</span>
                <span class="tv-release-body__bar-track">
                  <span class="tv-release-body__bar-fill tv-release-body__bar-fill--{row.key}" style:width="{row.pct}%"></span>
                </span>
                <span class="tv-release-body__bar-count">{row.count.toLocaleString('ru-RU')}</span>
              </span>
            {/each}
          </span>
        {/if}
      </button>
    </section>
  {/if}

  {#if shots.length > 0}
    <section class="tv-release-body__section tv-release-body__section--row" data-tv-release-section="screenshots" aria-label="Кадры">
      <h2 class="tv-release-body__title">Кадры</h2>
      <div class="uiv2-carousel__scroll tv-release-body__row" bind:this={shotsRowEl}>
        {#each shots as url, i (url)}
          <button
            type="button"
            class="tv-release-page__shot tv-release-body__shot"
            aria-label="Кадр {i + 1}"
            onclick={() => openShot(i)}
          >
            <img src={url} alt="" loading="lazy" decoding="async" />
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if relatedCards.length > 0}
    <section class="tv-release-body__section tv-release-body__section--row" data-tv-release-section="related" aria-label="Связанные релизы">
      <h2 class="tv-release-body__title">
        Связанные релизы
        {#if relatedTitle}<span class="tv-release-body__title-sub">{relatedTitle}</span>{/if}
      </h2>
      <UiV2ReleaseCarousel measureKey={relatedCards.length} class="tv-release-carousel">
        {#each relatedCards as item (item.id)}
          <div class="uiv2-carousel__item" data-tv-release-id={item.id}>
            <ReleaseCardUiV2 data={item} variant="vertical" showMenu={false} />
          </div>
        {/each}
      </UiV2ReleaseCarousel>
    </section>
  {/if}

  {#if recommendedCards.length > 0}
    <section class="tv-release-body__section tv-release-body__section--row" data-tv-release-section="recommended" aria-label="Рекомендуем также">
      <h2 class="tv-release-body__title">Рекомендуем также</h2>
      <UiV2ReleaseCarousel measureKey={recommendedCards.length} class="tv-release-carousel">
        {#each recommendedCards as item (item.id)}
          <div class="uiv2-carousel__item" data-tv-release-id={item.id}>
            <ReleaseCardUiV2 data={item} variant="vertical" showMenu={false} />
          </div>
        {/each}
      </UiV2ReleaseCarousel>
    </section>
  {/if}

  {#if visibleComments.length > 0}
    <section class="tv-release-body__section tv-release-body__section--row" data-tv-release-section="comments" aria-label="Комментарии">
      <h2 class="tv-release-body__title">
        Комментарии
        {#if commentCount > 0}<span class="tv-release-body__title-sub">{commentCount.toLocaleString('ru-RU')}</span>{/if}
      </h2>
      <div class="uiv2-carousel__scroll tv-release-body__row">
        {#each visibleComments as c (c.id)}
          {@const hidden = c.isSpoiler && !revealed[c.id]}
          {@const avatar = c.profile.avatar ? resolveCdnAssetUrl(c.profile.avatar) : ''}
          <button
            type="button"
            class="tv-release-comment"
            class:tv-release-comment--spoiler={hidden}
            aria-label="Комментарий {c.profile.login}"
            onclick={() => toggleSpoiler(c)}
          >
            <span class="tv-release-comment__head">
              {#if avatar}
                <img class="tv-release-comment__avatar" src={avatar} alt="" loading="lazy" decoding="async" />
              {:else}
                <span class="tv-release-comment__avatar tv-release-comment__avatar--empty">{c.profile.login.slice(0, 1).toUpperCase()}</span>
              {/if}
              <span class="tv-release-comment__who">
                <span class="tv-release-comment__login">{c.profile.login} <AppBadges userId={c.profile.id} size="sm" /></span>
                <span class="tv-release-comment__time">
                  {formatCommentTime(c.timestamp)}{#if c.postedAtEpisode} · {c.postedAtEpisode} серия{/if}
                </span>
              </span>
            </span>
            <span class="tv-release-comment__text">{commentText(c)}</span>
            {#if hidden}
              <span class="tv-release-comment__spoiler">Спойлер — нажмите, чтобы показать</span>
            {/if}
            <span class="tv-release-comment__foot">
              <span class="tv-release-comment__votes" class:tv-release-comment__votes--neg={c.voteCount < 0}>
                {@html iconThumbsUp(18)} {c.voteCount}
              </span>
              {#if c.replyCount > 0}
                <span class="tv-release-comment__replies">{c.replyCount} ответ.</span>
              {/if}
            </span>
          </button>
        {/each}
      </div>
    </section>
  {/if}
</div>

{#if viewerIndex != null}
  <div class="tv-shot-viewer" role="dialog" aria-modal="true" aria-label="Кадры">
    <div class="tv-shot-viewer__stage">
      {#key viewerIndex}
        <img
          class="tv-shot-viewer__img"
          class:tv-shot-viewer__img--back={viewerDir < 0}
          src={shots[viewerIndex]}
          alt="Кадр {viewerIndex + 1}"
          decoding="async"
        />
      {/key}
    </div>

    <div class="tv-shot-viewer__bar">
      <span class="tv-shot-viewer__hint">
        <span class="tv-shot-viewer__key">{@html iconChevronLeft(20)}</span>
        <span class="tv-shot-viewer__key">{@html iconChevronRight(20)}</span>
        листать
      </span>
      <span class="tv-shot-viewer__count">{viewerIndex + 1} / {shots.length}</span>
      <button type="button" class="tv-shot-viewer__close" aria-label="Закрыть" onclick={closeShot}>
        {@html iconX(22)} Закрыть
      </button>
    </div>

    <div class="tv-shot-viewer__thumbs" aria-hidden="true">
      {#each shots as url, i (url)}
        <img
          class="tv-shot-viewer__thumb"
          class:tv-shot-viewer__thumb--on={i === viewerIndex}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
        />
      {/each}
    </div>
  </div>
{/if}
