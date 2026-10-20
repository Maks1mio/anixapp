<script lang="ts">
  /**
   * Разделы профиля как в Android 10.5 (item_profile_header_middle): «Статистика · Оценки релизов ·
   * Коллекции · Комментарии · Видео · Значки», закреплённый раздел первым, превью и «Показать все».
   * Всё собрано из uikit-v2: UiV2Tabs, UiV2ReleaseCarousel, ReleaseCardUiV2, CollectionCard, UiV2CommentThread.
   */
  import { navigate } from '../../stores/navigation';
  import { showToast } from '../../stores/toast';
  import { resolveCdnAssetUrl } from '../../utils/posterUrl';
  import { mapReleaseRawToCard } from '../../utils/release-card';
  import { mapCollectionCard } from '../../utils/collection';
  import { mapOverviewCommentWeek, type OverviewCommentWeekItem } from '../../utils/overview';
  import { resolveJacksonEntity } from '../../utils/jackson-refs';
  import ProfileStatsSection from '../../views/Profile/v2/components/ProfileStatsSection.svelte';
  import UiV2Tabs from '../uikit-v2/UiV2Tabs.svelte';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2RoundButton from '../uikit-v2/UiV2RoundButton.svelte';
  import UiV2ChoiceSheet from '../uikit-v2/UiV2ChoiceSheet.svelte';
  import UiV2ReleaseCarousel from '../uikit-v2/UiV2ReleaseCarousel.svelte';
  import ReleaseCardUiV2 from '../ReleaseCardUiV2.svelte';
  import CollectionCard from '../CollectionCard.svelte';
  import OverviewCommentsWeek from '../overview/OverviewCommentsWeek.svelte';
  import BadgeTile from '../profile-badges/BadgeTile.svelte';
  import BadgeDetailSheet from '../profile-badges/BadgeDetailSheet.svelte';
  import { iconPin } from '../icons';
  import type { ApiBadge } from '../../types/api';
  import type { ReleaseCardData } from '../../types/release';

  type SectionId = 0 | 1 | 2 | 3 | 4 | 5;

  interface Props {
    profile: Record<string, unknown>;
    profileId: number;
    isMyProfile: boolean;
    /** Все значки: свой профиль — экран «Установка значка», чужой — коллекция для просмотра */
    onOpenBadges?: () => void;
  }

  let { profile, profileId, isMyProfile, onOpenBadges }: Props = $props();

  const LABELS: Record<SectionId, string> = {
    0: 'Статистика',
    1: 'Оценки релизов',
    2: 'Коллекции',
    3: 'Комментарии',
    4: 'Видео',
    5: 'Значки',
  };

  const num = (v: unknown) => Number(v ?? 0) || 0;

  /**
   * Превью-списки профиля: Jackson отдаёт повторно встреченные объекты числом (`[{…@id:20}, 21, 22]`).
   * Разворачиваем по дереву профиля, неразрешённые выкидываем, дубли по id убираем (ключи each).
   */
  function objects(v: unknown): Record<string, unknown>[] {
    if (!Array.isArray(v)) return [];
    const seen = new Set<number>();
    const out: Record<string, unknown>[] = [];
    for (const item of v) {
      const obj =
        item && typeof item === 'object' && !Array.isArray(item) && (item as { id?: unknown }).id != null
          ? (item as Record<string, unknown>)
          : resolveJacksonEntity(item, profile);
      const id = num(obj?.id);
      if (!obj || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      out.push(obj);
    }
    return out;
  }

  const statsHidden = $derived(!!profile.is_stats_hidden && !isMyProfile);
  const countsHidden = $derived(!!profile.is_counts_hidden && !isMyProfile);

  const votes = $derived(
    objects(profile.votes).map(
      (v): ReleaseCardData => ({ ...mapReleaseRawToCard(v), myVote: num(v.my_vote) || undefined }),
    ),
  );
  const collections = $derived(objects(profile.collections_preview).map(mapCollectionCard));
  const comments = $derived(
    objects(profile.comments_preview)
      .map((c) => mapOverviewCommentWeek(c, profile))
      .filter((c): c is OverviewCommentWeekItem => !!c),
  );
  const videos = $derived(objects(profile.release_video_preview));
  const badges = $derived(objects(profile.badges_preview) as unknown as ApiBadge[]);

  /** В профиле нет общего числа оценок — как ProfileStatsSection, берём total_count первой страницы */
  let votesTotal = $state(0);
  $effect(() => {
    const id = profileId;
    const api = window.anixApi?.profile;
    if (!id || countsHidden || !api?.getVotedReleases) return;
    let cancelled = false;
    void api
      .getVotedReleases(id, 0, 1)
      .then((data: { total_count?: number }) => {
        if (!cancelled) votesTotal = Number(data?.total_count ?? 0) || 0;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  const counts = $derived<Record<SectionId, number>>({
    0: 0,
    1: votesTotal || votes.length,
    2: num(profile.collection_count) || collections.length,
    3: num(profile.comment_count) || comments.length,
    4: num(profile.video_count) || videos.length,
    5: num(profile.badge_count) || badges.length,
  });

  let pinned = $state<number>(-1);
  $effect(() => {
    pinned = num(profile.pinned_section_id);
  });

  /** Как в приложении: при скрытой статистике/счётчиках чужого профиля эти разделы не показываются */
  const sections = $derived.by(() => {
    const all: SectionId[] = [0, 1, 2, 3, 4, 5];
    const visible = all.filter((id) => {
      if (id === 0) return !statsHidden;
      if (id === 5) return isMyProfile || counts[5] > 0;
      return !countsHidden;
    });
    const p = visible.find((id) => id === pinned);
    return p == null ? visible : [p, ...visible.filter((id) => id !== p)];
  });

  let active = $state<SectionId | null>(null);
  const current = $derived<SectionId | null>(
    active != null && sections.includes(active) ? active : (sections[0] ?? null),
  );
  const tabs = $derived(sections.map((id) => ({ id: String(id), label: LABELS[id] })));

  let pinSheetOpen = $state(false);
  let pinBusy = $state(false);
  let openBadge = $state<ApiBadge | null>(null);

  async function pinSection(id: number) {
    const api = window.anixApi?.settings;
    if (pinBusy || !api?.pinProfileSection) return;
    pinBusy = true;
    try {
      const res = await api.pinProfileSection(id);
      if (res?.code != null && res.code !== 0) throw new Error();
      pinned = id;
      active = id as SectionId;
      pinSheetOpen = false;
      showToast(`Раздел «${LABELS[id as SectionId]}» закреплён`);
    } catch {
      showToast('Не удалось закрепить раздел', 'err');
    } finally {
      pinBusy = false;
    }
  }

  /** Списки профиля (Android: «Показать списки») */
  function openLists() {
    navigate(isMyProfile ? '/bookmarks?tab=watching' : `/bookmarks?tab=watching&user=${profileId}`);
  }

  function showAll(id: SectionId) {
    if (id === 5) {
      onOpenBadges?.();
      return;
    }
    if (id === 1) {
      navigate(isMyProfile ? '/bookmarks?tab=votes' : `/bookmarks?tab=votes&user=${profileId}`);
      return;
    }
    const tail = id === 2 ? 'collections' : id === 3 ? 'comments' : 'videos';
    navigate(isMyProfile ? `/profile/${tail}` : `/profile/${profileId}/${tail}`);
  }

  const pinOptions = $derived(sections.map((id) => ({ value: id, label: LABELS[id] })));
  const allLabel = $derived(
    current != null && counts[current] > 0 ? `Показать все · ${counts[current]}` : 'Показать все',
  );
</script>

{#if sections.length && current != null}
  <section class="pp-sections uiv2-card" aria-label="Разделы профиля">
    <UiV2Tabs
      class="uiv2-tabs--static pp-sections__tabs"
      {tabs}
      activeId={String(current)}
      onChange={(id) => (active = Number(id) as SectionId)}
    >
      {#snippet rightActions()}
        {#if isMyProfile}
          <UiV2RoundButton
            label="Закреплённый раздел"
            title="Закреплённый раздел"
            size="sm"
            onclick={() => (pinSheetOpen = true)}
          >
            {@html iconPin(16)}
          </UiV2RoundButton>
        {/if}
      {/snippet}
    </UiV2Tabs>

    <div class="pp-sections__body" role="tabpanel">
      {#if current === 0}
        <div class="profile-panel__stats">
          <ProfileStatsSection {profile} {profileId} {isMyProfile} plain />
        </div>
      {:else if current === 1}
        {#if votes.length}
          <UiV2ReleaseCarousel measureKey={votes.length}>
            {#each votes as item (item.id)}
              <div class="uiv2-carousel__item">
                <ReleaseCardUiV2 data={item} variant="vertical" />
              </div>
            {/each}
          </UiV2ReleaseCarousel>
        {:else}
          <p class="pp-sections__empty">Оценок пока нет</p>
        {/if}
      {:else if current === 2}
        {#if collections.length}
          <UiV2ReleaseCarousel measureKey={collections.length} class="pp-sections__carousel--wide">
            {#each collections as c (c.id)}
              <div class="uiv2-carousel__item">
                <CollectionCard data={c} />
              </div>
            {/each}
          </UiV2ReleaseCarousel>
        {:else}
          <p class="pp-sections__empty">Коллекций пока нет</p>
        {/if}
      {:else if current === 3}
        {#if comments.length}
          <OverviewCommentsWeek items={comments} />
        {:else}
          <p class="pp-sections__empty">Комментариев пока нет</p>
        {/if}
      {:else if current === 4}
        {#if videos.length}
          <UiV2ReleaseCarousel measureKey={videos.length} class="pp-sections__carousel--wide">
            {#each videos as v (v.id)}
              {@const img = v.image ? resolveCdnAssetUrl(String(v.image)) : ''}
              <div class="uiv2-carousel__item">
                <button type="button" class="pp-sections__video" onclick={() => showAll(4)}>
                  <span class="pp-sections__video-img">{#if img}<img src={img} alt="" loading="lazy" />{/if}</span>
                  <span class="pp-sections__video-title">{String(v.title ?? '')}</span>
                </button>
              </div>
            {/each}
          </UiV2ReleaseCarousel>
        {:else}
          <p class="pp-sections__empty">Видео пока нет</p>
        {/if}
      {:else if current === 5}
        {#if badges.length}
          <div class="pp-sections__badges">
            {#each badges as b (b.id)}
              <BadgeTile badge={b} compact onclick={(x) => (openBadge = x)} />
            {/each}
          </div>
        {:else}
          <p class="pp-sections__empty">
            {isMyProfile ? 'Закрепите значки на витрине — они появятся здесь' : 'Значков пока нет'}
          </p>
        {/if}
      {/if}
    </div>

    {#if current === 0}
      <UiV2Button label="Показать списки" variant="chrome" block onclick={openLists} />
    {:else if counts[current] > 0 || (current === 5 && isMyProfile)}
      <UiV2Button label={allLabel} variant="chrome" block onclick={() => showAll(current)} />
    {/if}
  </section>
{/if}

{#if pinSheetOpen}
  <UiV2ChoiceSheet
    title="Закреплённый раздел"
    options={pinOptions}
    value={pinned}
    disabled={pinBusy}
    onClose={() => (pinSheetOpen = false)}
    onSelect={(v) => void pinSection(Number(v))}
  />
{/if}

{#if openBadge}
  <BadgeDetailSheet badge={openBadge} onClose={() => (openBadge = null)} />
{/if}

<style lang="scss">
  .pp-sections {
    container: pp-sections / inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  /* Вкладки внутри карточки: без sticky/фона, fade-градиенты под цвет карточки */
  .pp-sections :global(.uiv2-tabs.pp-sections__tabs) {
    --uikit-v2-bg: color-mix(in srgb, var(--uikit-v2-text) 4%, var(--color-bg));
    margin: -0.2rem -0.15rem 0;
    padding: 0 0 0.1rem;
    background: transparent;
  }

  .pp-sections__body {
    min-width: 0;
  }

  .pp-sections__empty {
    margin: 0;
    padding: 1.2rem 0.5rem;
    color: var(--uiv2-fg-muted);
    font-size: 0.84rem;
    text-align: center;
  }

  /* Коллекции и видео шире постеров */
  .pp-sections :global(.pp-sections__carousel--wide .uiv2-carousel__item) {
    flex-basis: 15rem;
    width: 15rem;
  }

  .pp-sections__video {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .pp-sections__video-img {
    overflow: hidden;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    background: var(--uiv2-surface-raised);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .pp-sections__video-title {
    display: -webkit-box;
    overflow: hidden;
    font-size: 0.8rem;
    font-weight: 600;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* Витрина значков */
  .pp-sections__badges {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;

    @container pp-sections (min-width: 520px) {
      grid-template-columns: repeat(auto-fill, minmax(4.4rem, 1fr));
    }
  }
</style>
