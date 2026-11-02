<script lang="ts">
  import { onMount } from 'svelte';
  import { requireAuth } from '../../../stores/auth';
  import { resolveCdnAssetUrl } from '../../../utils/posterUrl';
  import { iconStar } from '../../../components/icons';
  import { notifyVotesChanged } from '../../../utils/favorites-events';

  interface Props {
    releaseId: number;
    grade: number | null;
    hasRating: boolean;
    voteCount: number;
    vote1: number;
    vote2: number;
    vote3: number;
    vote4: number;
    vote5: number;
    yourVote: number;
    watchingCount: number;
    planCount: number;
    completedCount: number;
    holdOnCount: number;
    droppedCount: number;
    /** false для анонсов — нельзя ставить оценку */
    canVote?: boolean;
    /** Анонс: как в Anixart — без рейтинга, только «N пользователей планируют…» и списки */
    isAnnounce?: boolean;
    onRefresh: () => void | Promise<void>;
  }

  let {
    releaseId,
    grade,
    hasRating,
    voteCount,
    vote1,
    vote2,
    vote3,
    vote4,
    vote5,
    yourVote,
    watchingCount,
    planCount,
    completedCount,
    holdOnCount,
    droppedCount,
    canVote = true,
    isAnnounce = false,
    onRefresh,
  }: Props = $props();

  let profileAvatar = $state('');
  let picking = $state(false);
  let hoverStar = $state(0);
  let busy = $state(false);

  const totalList = $derived(watchingCount + planCount + completedCount + holdOnCount + droppedCount);
  const lp = (n: number) => totalList > 0 ? (n / totalList) * 100 : 0;
  /** Как в Anixart: у анонса «Смотрю» и «Просмотрено» не считаются */
  const announceTotal = $derived(planCount + holdOnCount + droppedCount);
  const ap = (n: number) => announceTotal > 0 ? (n / announceTotal) * 100 : 0;
  const announceLists = $derived(
    [
      { id: 'planned', label: 'В планах', count: planCount },
      { id: 'on_hold', label: 'Отложено', count: holdOnCount },
      { id: 'dropped', label: 'Брошено', count: droppedCount },
    ].filter((l) => l.count > 0),
  );

  function pluralRu(n: number, one: string, few: string, many: string): string {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  const announcePlanText = $derived(
    `${planCount.toLocaleString('ru-RU')} ${pluralRu(planCount, 'пользователь', 'пользователя', 'пользователей')} `
      + (planCount % 10 === 1 && planCount % 100 !== 11 ? 'планирует' : 'планируют'),
  );
  const ratingText = $derived(
    grade != null && hasRating ? grade.toFixed(2).replace(/\.?0+$/, '') : '—',
  );
  const hasYourVote = $derived(yourVote > 0);
  const showPicker = $derived(canVote && (!hasYourVote || picking));
  const displayStars = $derived(showPicker ? (hoverStar || 0) : yourVote);

  $effect(() => {
    yourVote;
    picking = false;
    hoverStar = 0;
  });

  onMount(async () => {
    try {
      const data = await window.anixApi?.profile?.self?.() as { profile?: { avatar?: string } } | null | undefined;
      profileAvatar = resolveCdnAssetUrl(data?.profile?.avatar?.trim() ?? '');
    } catch { /* ignore */ }
  });

  async function submitVote(stars: number) {
    if (!canVote) return;
    if (!requireAuth()) return;
    if (!window.anixApi || busy || stars < 1 || stars > 5) return;
    busy = true;
    try {
      await window.anixApi.release.vote(releaseId, stars);
      notifyVotesChanged({ releaseId });
      picking = false;
      hoverStar = 0;
      await onRefresh();
    } catch { /* ignore */ }
    finally {
      busy = false;
    }
  }

  async function startChangeVote() {
    if (!canVote) return;
    if (!requireAuth()) return;
    if (!window.anixApi || busy || !hasYourVote) return;
    busy = true;
    try {
      await window.anixApi.release.deleteVote(releaseId);
      notifyVotesChanged({ releaseId });
      picking = true;
      hoverStar = 0;
      await onRefresh();
    } catch { /* ignore */ }
    finally {
      busy = false;
    }
  }
</script>

{#if isAnnounce}
  {#if announceTotal > 0}
    <div class="release-page__section release-page__announce-stats">
      <h2 class="release-page__block-title">В списках у людей</h2>

      <div class="release-page__announce-plan">
        <span class="release-page__announce-plan-icon" aria-hidden="true">
          <svg class="release-page__announce-clock" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="10" />
            <line class="release-page__announce-clock-hour" x1="12" y1="12" x2="12" y2="8" />
            <line class="release-page__announce-clock-minute" x1="12" y1="12" x2="12" y2="5.5" />
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <div class="release-page__announce-plan-text">
          <span class="release-page__announce-plan-count">{announcePlanText}</span>
          <span class="release-page__announce-plan-sub">смотреть этот релиз</span>
        </div>
      </div>

      <div class="release-page__announce-bar">
        {#each announceLists as l (l.id)}
          <div
            class="release-page__list-stats-seg release-page__list-stats-seg--{l.id}"
            style="flex-basis:{ap(l.count)}%"
          ></div>
        {/each}
      </div>

      <div class="release-page__announce-legend">
        {#each announceLists as l (l.id)}
          <div class="release-page__announce-legend-item release-page__announce-legend-item--{l.id}">
            <i aria-hidden="true"></i>
            <span class="release-page__announce-legend-label">{l.label}</span>
            <span class="release-page__announce-legend-count">{l.count.toLocaleString('ru-RU')}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
{:else}
<div class="release-page__section release-page__rating-block">
  <h2 class="release-page__block-title">Рейтинг</h2>

  <div class="release-page__rating-layout">
    <div class="release-page__rating-content">
      <div class="release-page__rating-summary">
        <div class="release-page__rating-value">
          {ratingText}
        </div>
        {#if voteCount > 0}
          <div class="release-page__rating-votes-label">{voteCount.toLocaleString('ru-RU')} голосов</div>
        {/if}
      </div>

      <div class="release-page__rating-bars">
        {#each [5, 4, 3, 2, 1] as star}
          {@const v = star === 5 ? vote5 : star === 4 ? vote4 : star === 3 ? vote3 : star === 2 ? vote2 : vote1}
          {@const pct = voteCount > 0 ? (v / voteCount) * 100 : 0}
          <div class="release-page__rating-bar-row">
            <span class="release-page__rating-bar-label">{star}</span>
            <div class="release-page__rating-bar-track">
              <div class="release-page__rating-bar-fill" style="width:{pct}%"></div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div
      class="release-page__rating-vote"
      class:release-page__rating-vote--busy={busy}
      class:release-page__rating-vote--disabled={!canVote}
    >
      <div
        class="release-page__rating-vote-avatar{profileAvatar ? ' release-page__rating-vote-avatar--img' : ''}"
        style={profileAvatar ? `background-image:url(${profileAvatar})` : ''}
        aria-hidden="true"
      ></div>

      <div class="release-page__rating-vote-body">
        <span class="release-page__rating-vote-title">Ваша оценка</span>
        {#if !canVote}
          <div class="release-page__rating-vote-stars" aria-hidden="true">
            {#each [1, 2, 3, 4, 5] as star}
              <span class="release-page__rating-vote-star">
                {@html iconStar(34, false)}
              </span>
            {/each}
          </div>
          <span class="release-page__rating-vote-hint">Оценка недоступна</span>
        {:else if showPicker}
          <div
            class="release-page__rating-stars"
            role="group"
            aria-label="Поставить оценку"
            onmouseleave={() => { hoverStar = 0; }}
          >
            {#each [1, 2, 3, 4, 5] as star}
              <button
                type="button"
                class="release-page__rating-star"
                class:release-page__rating-star--active={star <= displayStars}
                disabled={busy}
                aria-label="{star} из 5"
                onmouseenter={() => { hoverStar = star; }}
                onclick={() => submitVote(star)}
              >
                {@html iconStar(34, star <= displayStars)}
              </button>
            {/each}
          </div>
        {:else}
          <div class="release-page__rating-vote-stars" aria-hidden="true">
            {#each [1, 2, 3, 4, 5] as star}
              <span class="release-page__rating-vote-star" class:release-page__rating-vote-star--active={star <= yourVote}>
                {@html iconStar(34, star <= yourVote)}
              </span>
            {/each}
          </div>
          <div class="release-page__rating-vote-meta">
            <span class="release-page__rating-vote-label">Вы проголосовали</span>
            <button type="button" class="release-page__rating-vote-change" disabled={busy} onclick={startChangeVote}>
              Изменить
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if totalList > 0}
    <div class="release-page__list-stats">
      <div class="release-page__list-stats-bar">
        <div class="release-page__list-stats-seg release-page__list-stats-seg--watching" style="width:{lp(watchingCount)}%" title="Смотрю: {watchingCount.toLocaleString('ru-RU')}"></div>
        <div class="release-page__list-stats-seg release-page__list-stats-seg--planned" style="width:{lp(planCount)}%" title="В планах: {planCount.toLocaleString('ru-RU')}"></div>
        <div class="release-page__list-stats-seg release-page__list-stats-seg--completed" style="width:{lp(completedCount)}%" title="Просмотрено: {completedCount.toLocaleString('ru-RU')}"></div>
        <div class="release-page__list-stats-seg release-page__list-stats-seg--on_hold" style="width:{lp(holdOnCount)}%" title="Отложено: {holdOnCount.toLocaleString('ru-RU')}"></div>
        <div class="release-page__list-stats-seg release-page__list-stats-seg--dropped" style="width:{lp(droppedCount)}%" title="Брошено: {droppedCount.toLocaleString('ru-RU')}"></div>
      </div>
      <div class="release-page__list-stats-legend">
        <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--watching"><i></i> Смотрю — {watchingCount.toLocaleString('ru-RU')}</span>
        <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--planned"><i></i> В планах — {planCount.toLocaleString('ru-RU')}</span>
        <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--completed"><i></i> Просмотрено — {completedCount.toLocaleString('ru-RU')}</span>
        <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--on_hold"><i></i> Отложено — {holdOnCount.toLocaleString('ru-RU')}</span>
        <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--dropped"><i></i> Брошено — {droppedCount.toLocaleString('ru-RU')}</span>
      </div>
    </div>
  {/if}
</div>
{/if}
