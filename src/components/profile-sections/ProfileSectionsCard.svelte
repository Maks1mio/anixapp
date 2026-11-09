<script lang="ts">
  /**
   * Разделы профиля как в Android 11 (item_profile_header_middle): «Статистика · Оценки релизов ·
   * Коллекции · Комментарии · Видео · Значки», закреплённый раздел первым, превью и «Показать все».
   * Всё собрано из uikit-v2: UiV2Tabs, UiV2ReleaseCarousel, ReleaseCardUiV2, CollectionCard, UiV2CommentThread.
   */
  import { navigate } from '../../stores/navigation';
  import { flip } from 'svelte/animate';
  import { tick } from 'svelte';
  import { prepareTabFade, swipeTabs } from '../../actions/swipeTabs';
  import { fetchThemePatch, type ProfileThemeFields } from '../../utils/profile-showcase-theme';
  import ShowcaseThemeLayer from './ShowcaseThemeLayer.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../uikit-v2/UiV2PopupMenu.svelte';
  import { isMobileMode } from '../../platform/mobile';
  import TabPeek from '../TabPeek.svelte';
  import { showToast } from '../../stores/toast';
  import { resolveCdnAssetUrl } from '../../utils/posterUrl';
  import { toPosterDisplayUrl } from '../../utils/posterUrl';
  import { fmtDate } from '../../views/Profile/_utils';
  import { mapCollectionCard } from '../../utils/collection';
  import { mapOverviewCommentWeek, type OverviewCommentWeekItem } from '../../utils/overview';
  import { resolveJacksonEntity } from '../../utils/jackson-refs';
  import ProfileStatsSection from '../../views/Profile/v2/components/ProfileStatsSection.svelte';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2ChoiceSheet from '../uikit-v2/UiV2ChoiceSheet.svelte';
  import UiV2ReleaseCarousel from '../uikit-v2/UiV2ReleaseCarousel.svelte';
  import CollectionCard from '../CollectionCard.svelte';
  import OverviewCommentsWeek from '../overview/OverviewCommentsWeek.svelte';
  import BadgeTile from '../profile-badges/BadgeTile.svelte';
  import BadgeDetailSheet from '../profile-badges/BadgeDetailSheet.svelte';
  import { iconArrowRight, iconGripVertical, iconPalette, iconPin, iconSettings, iconStar } from '../icons';
  import type { ApiBadge } from '../../types/api';

  type SectionId = 0 | 1 | 2 | 3 | 4 | 5;

  interface Props {
    profile: Record<string, unknown>;
    profileId: number;
    isMyProfile: boolean;
    /** Все значки: свой профиль — экран «Установка значка», чужой — коллекция для просмотра */
    onOpenBadges?: () => void;
    /** Сервер прислал новую тему витрины */
    onProfilePatched?: (patch: Record<string, unknown>) => void;
  }

  let { profile, profileId, isMyProfile, onOpenBadges, onProfilePatched }: Props = $props();

  const LABELS: Record<SectionId, string> = {
    0: 'Статистика',
    1: 'Оценки релизов',
    2: 'Коллекции',
    3: 'Комментарии',
    4: 'Видео',
    5: 'Значки',
  };

  /** Значки разделов как у чипов в Android */
  const CHIP_ICONS: Record<SectionId, string> = {
    0: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 20v-6"/><path d="M12 20V6"/><path d="M18 20v-10"/></svg>',
    1: iconStar(18, false),
    2: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a2 2 0 0 1 2-2h11"/></svg>',
    3: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    4: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/></svg>',
    5: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8"/></svg>',
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

  const votes = $derived(objects(profile.votes));
  const collections = $derived(objects(profile.collections_preview).map(mapCollectionCard));
  const comments = $derived(
    objects(profile.comments_preview)
      .map((c) => mapOverviewCommentWeek(c, profile))
      .filter((c): c is OverviewCommentWeekItem => !!c),
  );
  const videos = $derived(objects(profile.release_video_preview));
  const previewBadges = $derived(objects(profile.badges_preview) as unknown as ApiBadge[]);
  /** Порядок витрины после перетаскивания; остальные значки идут следом как пришли */
  let badgeOrder = $state<number[] | null>(null);
  const badges = $derived.by(() => {
    const order = badgeOrder;
    if (!order) return previewBadges;
    const rank = (b: ApiBadge) => {
      const i = order.indexOf(b.id);
      return i < 0 ? order.length : i;
    };
    return [...previewBadges].sort((a, b) => rank(a) - rank(b));
  });

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
  const peekSections = $derived.by(() => {
    const i = current == null ? -1 : sections.indexOf(current);
    return { prev: i < 0 ? undefined : sections[i - 1], next: i < 0 ? undefined : sections[i + 1] };
  });

  function swipeToSection(dir: 1 | -1): boolean {
    const next = current == null ? undefined : sections[sections.indexOf(current) + dir];
    if (next == null) return false;
    active = next;
    return true;
  }

  let chipsEl = $state<HTMLElement | null>(null);
  let statsHelpOpen = $state(false);
  const STATS_HELP = "Здесь собираются данные о количестве релизов в ваших списках, времени просмотра и ваших жанровых предпочтениях.\n\nПросмотренные серии, время и жанры рассчитывается ежедневно на основе релизов из вашего списка «Просмотрено».\n\nВаши жанровые предпочтения рассчитываются, если в списке «Просмотрено» есть не менее 10 релизов. Система анализирует все жанры этих аниме, вычисляет их процентное соотношение и показывает до 3-х самых популярных основных жанров, а также по одному для аудитории и тематики.\n\nНапример, вы посмотрели аниме «Самурай чамплу» (26 серий по 24 мин.) и добавили его в «Просмотрено». Только на следующий день к вашей статистике прибавится 10,4 часа и 26 серий, а жанры этого аниме будут учтены в общем подсчете предпочтений.\n\nОбратите внимание, что ваши списки просмотра доступны в нижнем меню «Закладки».";

  function selectSection(id: SectionId) {
    if (reordering || id === current || current == null) return;
    prepareTabFade(sections.indexOf(id) > sections.indexOf(current) ? 1 : -1);
    active = id;
  }

  // Выбранный чип не остаётся за краем ленты
  $effect(() => {
    const row = chipsEl;
    const id = current;
    if (!row || id == null) return;
    const chip = row.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (chip) row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
  });

  // ── Шестерёнка: тема, закреплённая секция, порядок значков ──
  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let themeSheetOpen = $state(false);
  let themeBusy = $state(false);
  let themes = $state<{ value: number; label: string }[]>([]);
  let selectedTheme = $state(1);

  const menuItems: UiV2PopupMenuItem[] = [
    { id: 'theme', label: 'Тема витрины', icon: iconPalette(20) },
    { id: 'pin', label: 'Закрепить секцию', icon: iconPin(20) },
    { id: 'reorder', label: 'Изменить порядок', icon: iconGripVertical(20) },
  ];

  function openMenu(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    menuX = rect.right;
    menuY = rect.bottom;
    menuOpen = true;
  }

  function onMenuSelect(id: string) {
    menuOpen = false;
    if (id === 'theme') void openThemeSheet();
    else if (id === 'pin') pinSheetOpen = true;
    else if (id === 'reorder') void startReorder();
  }

  async function openThemeSheet() {
    const api = window.anixApi?.settings;
    if (!api?.getProfileSettings) return;
    try {
      const settings = await api.getProfileSettings();
      const raw = Array.isArray(settings.available_themes) ? settings.available_themes : [];
      themes = (raw as { id?: number; name?: string }[])
        .map((t) => ({ value: num(t.id), label: String(t.name ?? `Тема ${t.id ?? ''}`) }))
        .filter((t) => t.value > 0);
      selectedTheme = num(settings.selected_theme_id) || 1;
      if (!themes.length) {
        showToast('Темы пока недоступны', 'err');
        return;
      }
      themeSheetOpen = true;
    } catch {
      showToast('Не удалось загрузить темы', 'err');
    }
  }

  async function selectTheme(id: number) {
    const api = window.anixApi?.settings;
    if (themeBusy || !api?.selectTheme) return;
    if (id === selectedTheme) {
      themeSheetOpen = false;
      return;
    }
    themeBusy = true;
    try {
      const res = await api.selectTheme(id);
      if (res?.code === 3) throw new Error('Тема недоступна');
      if (res?.code != null && res.code !== 0) throw new Error('Не удалось сменить витрину');
      selectedTheme = id;
      onProfilePatched?.(await fetchThemePatch(profileId, res?.theme as Record<string, unknown> | null | undefined));
      themeSheetOpen = false;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Не удалось сменить витрину', 'err');
    } finally {
      themeBusy = false;
    }
  }

  // ── Порядок значков на витрине ──
  let reordering = $state(false);
  let reorderBusy = $state(false);
  let dragId = $state<number | null>(null);
  let dragEl: HTMLElement | null = null;
  let grabX = 0;
  let grabY = 0;
  let dragX = 0;
  let dragY = 0;
  let lastSwap = 0;

  // ── Сетка значков: как в ProfileUiController, не меньше трёх колонок по 92dp ──
  const BADGE_MIN_WIDTH = 92;
  let badgeColumns = $state(4);
  const hasMoreBadges = $derived(counts[5] > badges.length || isMyProfile);
  /** Стрелка занимает последнюю ячейку: если ряды заполнены, вместо неё уходит последний незакреплённый значок */
  const gridBadges = $derived.by(() => {
    const last = badges[badges.length - 1];
    const full = badges.length > 0 && badges.length % badgeColumns === 0;
    return !reordering && hasMoreBadges && full && !last?.is_showcased ? badges.slice(0, -1) : badges;
  });

  function measureBadgeColumns(node: HTMLElement) {
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width > 0) badgeColumns = Math.max(3, Math.floor(width / BADGE_MIN_WIDTH));
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  const showcasedIds = $derived(badges.filter((b) => b.is_showcased).map((b) => b.id));

  async function startReorder() {
    if (showcasedIds.length < 2) {
      showToast('Закрепите хотя бы 2 значка, чтобы изменить порядок', 'info');
      return;
    }
    if (current !== 5 && current != null) {
      prepareTabFade(sections.indexOf(5) > sections.indexOf(current) ? 1 : -1);
      active = 5;
    }
    reordering = true;
    await tick();
  }

  async function finishReorder() {
    const api = window.anixApi?.settings;
    if (reorderBusy) return;
    if (!api?.reorderBadgeShowcase) {
      reordering = false;
      return;
    }
    reorderBusy = true;
    try {
      const res = await api.reorderBadgeShowcase(showcasedIds);
      if (res?.code !== 0) throw new Error();
      reordering = false;
    } catch {
      showToast('Не удалось обновить витрину. Попробуйте ещё раз.', 'err');
    } finally {
      reorderBusy = false;
    }
  }

  function placeDragged(x: number, y: number) {
    if (!dragEl) return;
    const rect = dragEl.getBoundingClientRect();
    dragX = x - grabX - (rect.left - dragX);
    dragY = y - grabY - (rect.top - dragY);
    dragEl.style.translate = `${dragX}px ${dragY}px`;
  }

  function onBadgeDown(e: PointerEvent, badge: ApiBadge) {
    if (!reordering || !badge.is_showcased || reorderBusy) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    el.setPointerCapture(e.pointerId);
    el.style.transition = 'none';
    dragEl = el;
    dragId = badge.id;
    grabX = e.clientX - rect.left;
    grabY = e.clientY - rect.top;
    dragX = 0;
    dragY = 0;
  }

  async function onBadgeMove(e: PointerEvent) {
    if (!dragEl || dragId == null) return;
    placeDragged(e.clientX, e.clientY);
    if (e.timeStamp - lastSwap < 160) return;
    const over = [...(dragEl.parentElement?.querySelectorAll<HTMLElement>('[data-badge-id]') ?? [])].find((el) => {
      if (el === dragEl) return false;
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (!over) return;
    const ids = [...showcasedIds];
    const to = ids.indexOf(Number(over.dataset.badgeId));
    const from = ids.indexOf(dragId);
    if (to < 0 || from < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    badgeOrder = ids;
    lastSwap = e.timeStamp;
    const { clientX, clientY } = e;
    await tick();
    placeDragged(clientX, clientY);
  }

  function onBadgeUp() {
    const el = dragEl;
    dragEl = null;
    dragId = null;
    if (!el) return;
    el.style.transition = 'translate 0.2s cubic-bezier(0.22, 0.8, 0.3, 1)';
    el.style.translate = '0 0';
    window.setTimeout(() => {
      el.style.removeProperty('transition');
      el.style.removeProperty('translate');
    }, 220);
  }

  const themed = $derived(!!(profile as ProfileThemeFields).theme_enabled);

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

  // ── Кнопка под разделом: появляется и исчезает вслед за свайпом ──
  let swipeTarget = $state<SectionId | null>(null);
  let swipeProgress = $state(0);
  let swipeMs = $state(0);
  let footHeight = $state(0);

  const hasAction = (id: SectionId) => id === 0 || (id !== 5 && counts[id] > 0);
  const actionLabel = (id: SectionId) => {
    if (id === 0) return 'Показать списки';
    return counts[id] > 0 ? `Показать все · ${counts[id]}` : 'Показать все';
  };
  const currentHasAction = $derived(current != null && hasAction(current));
  const footVisible = $derived.by(() => {
    const from = currentHasAction ? 1 : 0;
    if (swipeTarget == null) return from;
    return from + ((hasAction(swipeTarget) ? 1 : 0) - from) * swipeProgress;
  });
  /** Подпись меняется на середине свайпа; если кнопки не было, сразу показывает будущую */
  const footSection = $derived.by((): SectionId | null => {
    if (swipeTarget != null && hasAction(swipeTarget) && (swipeProgress >= 0.5 || !currentHasAction)) return swipeTarget;
    return current;
  });
  const footStyle = $derived.by(() => {
    const size = footHeight ? `height:${footVisible * footHeight}px;` : '';
    const motion = swipeTarget == null ? '' : `transition:${swipeMs ? `height ${swipeMs}ms ease, opacity ${swipeMs}ms ease, margin-top ${swipeMs}ms ease` : 'none'};`;
    return `${size}opacity:${footVisible};margin-top:${(footVisible - 1) * 0.75}rem;${motion}`;
  });

  function onSwipeProgress(dir: 1 | -1 | null, progress: number, ms: number) {
    if (dir == null || current == null) {
      swipeTarget = null;
      return;
    }
    swipeTarget = sections[sections.indexOf(current) + dir] ?? null;
    swipeProgress = progress;
    swipeMs = ms;
  }

  function runAction(id: SectionId) {
    if (id === 0) openLists();
    else showAll(id);
  }
</script>

{#snippet sectionBody(id: SectionId)}
      {#if id === 0}
        <div class="profile-panel__stats">
          <ProfileStatsSection {profile} {profileId} {isMyProfile} plain />
        </div>
        {#if isMyProfile}
          <button type="button" class="pp-sections__details" onclick={() => (statsHelpOpen = true)}>Узнать подробнее</button>
        {/if}
      {:else if id === 1}
        {#if votes.length}
          <ul class="profile-v2__recent-list">
            {#each votes as item (item.id)}
              {@const thumb = item.image ? toPosterDisplayUrl(String(item.image), 'profileRecent') : ''}
              <li>
                <button type="button" class="profile-v2__recent-row" onclick={() => navigate(`/release/${item.id}`)}>
                  <span class="profile-v2__recent-poster">{#if thumb}<img src={thumb} alt="" loading="lazy" decoding="async" />{/if}</span>
                  <span class="profile-v2__recent-body">
                    <span class="profile-v2__recent-title">{item.title_ru || item.title_original || 'Без названия'}</span>
                    <span class="profile-v2__recent-meta">★ {num(item.my_vote)}{#if num(item.voted_at)} · {fmtDate(num(item.voted_at))}{/if}</span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="pp-sections__empty">Оценок пока нет</p>
        {/if}
      {:else if id === 2}
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
      {:else if id === 3}
        {#if comments.length}
          <OverviewCommentsWeek items={comments} />
        {:else}
          <p class="pp-sections__empty">Комментариев пока нет</p>
        {/if}
      {:else if id === 4}
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
      {:else if id === 5}
        {#if badges.length}
          <div
            class="pp-sections__badges"
            class:pp-sections__badges--reorder={reordering}
            style={`grid-template-columns:repeat(${badgeColumns}, minmax(0, 1fr))`}
            use:measureBadgeColumns
          >
            {#each gridBadges as b, i (b.id)}
              <div
                class="pp-sections__badge"
                class:pp-sections__badge--wiggle={reordering && b.is_showcased && dragId !== b.id}
                class:pp-sections__badge--dragging={dragId === b.id}
                data-badge-id={b.is_showcased ? b.id : undefined}
                style={`--wiggle-delay:${-i * 90}ms`}
                animate:flip={{ duration: dragId === b.id ? 0 : 200 }}
                onpointerdown={(e) => onBadgeDown(e, b)}
                onpointermove={onBadgeMove}
                onpointerup={onBadgeUp}
                onpointercancel={onBadgeUp}
              >
                <BadgeTile badge={b} compact onclick={(x) => { if (!reordering) openBadge = x; }} />
              </div>
            {/each}
            {#if !reordering && hasMoreBadges}
              <button type="button" class="pp-sections__badges-more" aria-label="Все значки" onclick={() => showAll(5)}>
                {@html iconArrowRight(20)}
              </button>
            {/if}
          </div>
        {:else}
          <p class="pp-sections__empty">
            {isMyProfile ? 'Закрепите значки на витрине — они появятся здесь' : 'Значков пока нет'}
          </p>
        {/if}
      {/if}
{/snippet}

{#if sections.length && current != null}
  <section class="pp-sections uiv2-card" class:pp-sections--themed={themed} aria-label="Разделы профиля">
    <ShowcaseThemeLayer profile={profile as ProfileThemeFields} />
    <div class="pp-sections__head">
      <div class="pp-sections__chips" role="tablist" bind:this={chipsEl}>
        {#each sections as id (id)}
          <button
            type="button"
            class="pp-sections__chip"
            class:pp-sections__chip--on={id === current}
            role="tab"
            aria-selected={id === current}
            data-section={id}
            onclick={() => selectSection(id)}
          >
            <span class="pp-sections__chip-icon" aria-hidden="true">{@html CHIP_ICONS[id]}</span>
            {LABELS[id]}
          </button>
        {/each}
      </div>
      {#if reordering}
        <button type="button" class="pp-sections__done" disabled={reorderBusy} onclick={() => void finishReorder()}>Готово</button>
      {/if}
      {#if isMyProfile}
        <button type="button" class="pp-sections__gear" aria-label="Настройки витрины" aria-haspopup="menu" onclick={openMenu}>
          {@html iconSettings(22)}
        </button>
      {/if}
    </div>

    <div class="pp-sections__body" role="tabpanel" use:swipeTabs={{ onSwipe: swipeToSection, enabled: isMobileMode() && !reordering, activeId: String(current), followHeight: true, onSwipeProgress }}>
      {@render sectionBody(current)}
      {#if peekSections.prev != null && !reordering}<TabPeek dir={-1}>{@render sectionBody(peekSections.prev)}</TabPeek>{/if}
      {#if peekSections.next != null && !reordering}<TabPeek dir={1}>{@render sectionBody(peekSections.next)}</TabPeek>{/if}
    </div>

    <div class="pp-sections__foot" style={footStyle} inert={footVisible === 0 ? true : undefined}>
      <div bind:clientHeight={footHeight}>
        {#if footSection != null}
          {@const section = footSection}
          <UiV2Button label={actionLabel(section)} variant="chrome" block onclick={() => runAction(section)} />
        {/if}
      </div>
    </div>
  </section>
{/if}

{#if pinSheetOpen}
  <UiV2ChoiceSheet
    title="Закрепить секцию"
    options={pinOptions}
    value={pinned}
    disabled={pinBusy}
    onClose={() => (pinSheetOpen = false)}
    onSelect={(v) => void pinSection(Number(v))}
  />
{/if}

{#if statsHelpOpen}
  <UiV2ChoiceSheet
    title="Как работает статистика"
    summary={STATS_HELP}
    options={[]}
    value=""
    cancelLabel="Понятно"
    onClose={() => (statsHelpOpen = false)}
  />
{/if}

{#if themeSheetOpen}
  <UiV2ChoiceSheet
    title="Тема витрины"
    summary="Доступные темы зависят от предпочитаемых вами жанров, аудитории и тематик в статистике профиля. Для формирования этой статистики необходимо иметь не менее 10 релизов в списке «Просмотрено». Данные обновляются раз в сутки."
    options={themes}
    value={selectedTheme}
    disabled={themeBusy}
    onClose={() => (themeSheetOpen = false)}
    onSelect={(v) => void selectTheme(Number(v))}
  />
{/if}

<UiV2PopupMenu
  open={menuOpen}
  x={menuX}
  y={menuY}
  placement="anchor"
  items={menuItems}
  onClose={() => (menuOpen = false)}
  onSelect={onMenuSelect}
/>

{#if openBadge}
  <BadgeDetailSheet badge={openBadge} onClose={() => (openBadge = null)} />
{/if}

<style lang="scss">
  .pp-sections {
    position: relative;
    overflow: clip;
    container: pp-sections / inline-size;
    display: flex;
    flex-direction: column;
    /* = padding-top карточки: отступ над и под строкой вкладок одинаковый */
    gap: 0.75rem;
    /* Fade карусели под цвет карточки (по умолчанию — фон страницы) */
    --carousel-fade-color: color-mix(in srgb, var(--uikit-v2-text) 4%, var(--color-bg));
  }

  .pp-sections--themed {
    --carousel-fade-color: transparent;
  }

  .pp-sections > :global(:not(.showcase-layer)) {
    position: relative;
    z-index: 1;
  }

  /* Чипы разделов, как в Android */
  .pp-sections__head {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .pp-sections__chips {
    display: flex;
    flex: 1 1 auto;
    gap: 0.75rem;
    min-width: 0;
    overflow-x: auto;
    padding-right: 1.5rem;
    scrollbar-width: none;
    mask-image: linear-gradient(to left, transparent, #000 1.5rem);

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .pp-sections__chip {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 0.4rem;
    height: 2.25rem;
    padding: 0 0.75rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text) 28%, transparent);
    border-radius: 0.625rem;
    background: transparent;
    color: var(--uiv2-fg-muted);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }

  .pp-sections__chip--on {
    border-color: color-mix(in srgb, var(--uikit-v2-text) 55%, transparent);
    background: color-mix(in srgb, var(--uikit-v2-text) 8%, transparent);
    color: var(--uikit-v2-text);
    font-weight: 600;
  }

  .pp-sections__chip-icon {
    display: inline-flex;

    :global(svg) {
      width: 18px;
      height: 18px;
    }
  }

  .pp-sections__gear,
  .pp-sections__done {
    flex: none;
    border: 0;
    background: none;
    color: var(--uikit-v2-text);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .pp-sections__gear {
    display: inline-flex;
    padding: 0.4rem;
    border-radius: 50%;
    color: var(--uiv2-fg-muted);
  }

  .pp-sections__done {
    padding: 0.4rem 0.5rem;
  }

  .pp-sections__body {
    min-width: 0;
  }

  .pp-sections__foot {
    overflow: clip;
    transition: height 0.22s ease, opacity 0.22s ease, margin-top 0.22s ease;
  }

  .pp-sections__details {
    display: block;
    margin: 0.25rem auto 0;
    padding: 0.5rem 1rem;
    border: 0;
    background: none;
    color: var(--uikit-v2-text);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
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

  .pp-sections__badge {
    touch-action: auto;
  }

  .pp-sections__badges--reorder .pp-sections__badge[data-badge-id] {
    touch-action: none;
    cursor: grab;

    :global(.badge-tile) {
      pointer-events: none;
    }
  }

  .pp-sections__badge--wiggle {
    /* Значения из res/anim/shaking.xml */
    animation: pp-badge-wiggle 0.15s var(--wiggle-delay, 0ms) ease-in-out infinite alternate;
  }

  .pp-sections__badge--dragging {
    position: relative;
    z-index: 2;
    scale: 1.08;
    cursor: grabbing;
  }

  @keyframes pp-badge-wiggle {
    from { rotate: -2deg; }
    to { rotate: 2deg; }
  }

  @media (prefers-reduced-motion: reduce) {
    .pp-sections__badge--wiggle {
      animation: none;
    }
  }

  .pp-sections__badges-more {
    align-self: center;
    justify-self: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border: 0;
    border-radius: 50%;
    background: color-mix(in srgb, var(--uikit-v2-text) 12%, transparent);
    color: var(--uikit-v2-text);
    cursor: pointer;
  }

  /* Витрина значков */
  .pp-sections__badges {
    display: grid;
    gap: 0.5rem;
  }
</style>
