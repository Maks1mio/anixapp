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
    onRefresh,
  }: Props = $props();

  let profileAvatar = $state('');
  let picking = $state(false);
  let hoverStar = $state(0);
  let busy = $state(false);

  const totalList = $derived(watchingCount + planCount + completedCount + holdOnCount + droppedCount);
  const lp = (n: number) => totalList > 0 ? (n / totalList) * 100 : 0;
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

<div class="release-page__section release-page__rating-block">
  <h2 class="release-page__block-title">Рейтинг</h2>

  <div class="release-page__rating-content">
    <div class="release-page__rating-main">
      <div class="release-page__rating-summary">
        <div class="release-page__rating-value">
          {grade != null && hasRating ? grade.toFixed(2) : '—'}
        </div>
        {#if voteCount > 0}
          <div class="release-page__rating-votes-label">{voteCount.toLocaleString('ru-RU')} голосов</div>
        {/if}
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
          {#if !canVote}
            <div class="release-page__rating-vote-stars" aria-hidden="true">
              {#each [1, 2, 3, 4, 5] as star}
                <span class="release-page__rating-vote-star">
                  {@html iconStar(18, false)}
                </span>
              {/each}
            </div>
            <span class="release-page__rating-vote-hint">Оценка недоступна для анонса</span>
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
                  {@html iconStar(20, star <= displayStars)}
                </button>
              {/each}
            </div>
            <span class="release-page__rating-vote-hint">Нажмите на звезду</span>
          {:else}
            <div class="release-page__rating-vote-stars" aria-hidden="true">
              {#each [1, 2, 3, 4, 5] as star}
                <span class="release-page__rating-vote-star" class:release-page__rating-vote-star--active={star <= yourVote}>
                  {@html iconStar(18, star <= yourVote)}
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
