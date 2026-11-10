<script lang="ts">
  import { untrack } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { settingsModalOpen, notificationsModalOpen } from '../stores/modals';
  import UiV2Card from './uikit-v2/UiV2Card.svelte';
  import UiV2ScrollArea from './uikit-v2/UiV2ScrollArea.svelte';
  import UiV2Button from './uikit-v2/UiV2Button.svelte';
  import UiV2Toggle from './uikit-v2/UiV2Toggle.svelte';

  type Props = { currentPath: string; onClose: () => void };
  let { currentPath, onClose }: Props = $props();

  type PageItem = { route: string; name: string; open?: () => void };
  type PageGroup = { title: string; items: PageItem[] };

  /** Подписи параметров маршрутов (`:release` и т.п.); `announcement` — строковый id, остальные числовые. */
  const PARAM_LABELS: Record<string, string> = {
    release: 'ID релиза',
    comment: 'ID комментария',
    profile: 'ID профиля',
    collection: 'ID коллекции',
    article: 'ID записи',
    channel: 'ID канала',
    announcement: 'ID объявления',
  };
  const STRING_PARAMS = new Set(['announcement']);

  /** Все маршруты из App.svelte → appRoutes(). */
  const groups: PageGroup[] = [
    {
      title: 'Главные',
      items: [
        { route: '/', name: 'Home' },
        { route: '/overview', name: 'Overview' },
        { route: '/schedule', name: 'Overview (расписание)' },
        { route: '/overview/popular', name: 'Popular' },
        { route: '/catalog', name: 'Catalog' },
        { route: '/feed', name: 'Feed' },
        { route: '/article/:article', name: 'Feed (статья)' },
        { route: '/channel/:channel', name: 'Feed (канал)' },
        { route: '/downloads', name: 'Downloads' },
        { route: '/fluo', name: 'Fluo' },
        { route: '/agent', name: 'Agent' },
      ],
    },
    {
      title: 'Релиз',
      items: [
        { route: '/release/:release', name: 'Release' },
        { route: '/release/:release/related', name: 'Related' },
        { route: '/release/:release/comments', name: 'ReleaseComments' },
        { route: '/release/:release/comment/:comment/replies', name: 'ReleaseCommentReplies' },
        { route: '/watch', name: 'Watch (плеер)' },
        { route: '/announcement/:announcement/chat', name: 'AnnouncementChat' },
      ],
    },
    {
      title: 'Коллекции',
      items: [
        { route: '/collections', name: 'CollectionsList' },
        { route: '/collections/my', name: 'MyCollections' },
        { route: '/collections/create', name: 'CollectionEditor (создание)' },
        { route: '/collections/edit/:collection', name: 'CollectionEditor (правка)' },
        { route: '/collection/:collection', name: 'Collection' },
      ],
    },
    {
      title: 'Профиль',
      items: [
        { route: '/bookmarks', name: 'Bookmarks' },
        { route: '/profile/votes', name: 'Bookmarks (оценки)' },
        { route: '/profile/lists', name: 'Bookmarks (списки)' },
        { route: '/profile/:profile/votes', name: 'Bookmarks (оценки юзера)' },
        { route: '/profile/:profile/lists', name: 'Bookmarks (списки юзера)' },
        { route: '/profile/:profile/friends', name: 'ProfileFriends' },
        { route: '/profile/:profile/collections', name: 'CollectionsList (пользователь)' },
        { route: '/profile/:profile/comments', name: 'ProfileComments' },
        { route: '/profile/:profile/videos', name: 'ProfileVideos' },
      ],
    },
    {
      title: 'Служебные',
      items: [
        { route: '/admin', name: 'AdminLogin' },
        { route: '/admin/panel', name: 'AdminPanel' },
        { route: '/uikit', name: 'Uikit' },
        { route: '/uikit-v2', name: 'UikitV2' },
        { route: '/feed/composer', name: 'FeedComposerWindow' },
      ],
    },
    {
      title: 'Модалки',
      items: [
        { route: 'modal:settings', name: 'SettingsModal', open: () => settingsModalOpen.set(true) },
        { route: 'modal:notifications', name: 'NotificationsModal', open: () => notificationsModalOpen.set(true) },
      ],
    },
  ];

  const MARKS_KEY = 'anix:dev-pages-marks';
  const PARAMS_KEY = 'anix:dev-pages-params';

  function loadJson<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : fallback;
      return valid(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key: string, value: unknown) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage недоступен — живёт до перезапуска */
    }
  }

  function paramNames(route: string): string[] {
    return [...route.matchAll(/:(\w+)/g)].map((m) => m[1]);
  }

  function routeRegex(route: string): RegExp {
    const body = route.replace(/:(\w+)/g, (_, name: string) => (STRING_PARAMS.has(name) ? '([^/]+)' : '(\\d+)'));
    return new RegExp('^' + body + '$');
  }

  /** Значения параметров из текущего адреса — чтобы поля сразу были заполнены. */
  function paramsFromPath(path: string): Record<string, string> {
    for (const item of groups.flatMap((g) => g.items)) {
      const names = paramNames(item.route);
      if (!names.length) continue;
      const m = path.match(routeRegex(item.route));
      if (m) return Object.fromEntries(names.map((n, i) => [n, m[i + 1]]));
    }
    return {};
  }

  let marks = $state<string[]>(
    loadJson<string[]>(MARKS_KEY, [], (v): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')),
  );
  let params = $state<Record<string, string>>({
    ...loadJson<Record<string, string>>(
      PARAMS_KEY,
      {},
      (v): v is Record<string, string> => !!v && typeof v === 'object' && !Array.isArray(v),
    ),
    ...untrack(() => paramsFromPath(currentPath)),
  });
  /** Строка с раскрытыми полями параметров. */
  let expanded = $state<string | null>(null);
  let copied = $state(false);

  $effect(() => saveJson(MARKS_KEY, marks));
  $effect(() => saveJson(PARAMS_KEY, params));

  function toggleMark(route: string, next: boolean) {
    marks = next ? [...marks, route] : marks.filter((r) => r !== route);
  }

  function paramValid(name: string): boolean {
    const v = (params[name] ?? '').trim();
    return STRING_PARAMS.has(name) ? v.length > 0 : /^\d+$/.test(v);
  }

  function resolveRoute(route: string): string | null {
    const names = paramNames(route);
    if (!names.every(paramValid)) return null;
    return route.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent(params[name].trim()));
  }

  function matchesCurrent(route: string): boolean {
    return routeRegex(route).test(currentPath);
  }

  function openItem(item: PageItem) {
    if (item.open) {
      item.open();
      return;
    }
    const target = resolveRoute(item.route);
    if (target) navigate(target);
  }

  function onRowClick(item: PageItem) {
    if (!item.open && paramNames(item.route).length) {
      expanded = expanded === item.route ? null : item.route;
      return;
    }
    openItem(item);
  }

  async function copyMarks() {
    const text = groups
      .flatMap((g) => g.items)
      .filter((i) => marks.includes(i.route))
      .map((i) => `${i.route} — ${i.name}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      window.setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard недоступен */
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<aside class="dev-pages" aria-label="Все страницы">
  <UiV2Card title="Страницы" pill={`к удалению: ${marks.length}`}>
    <div class="dev-pages__tools">
      <UiV2Button
        size="sm"
        label={copied ? 'Скопировано' : 'Копировать'}
        disabled={marks.length === 0}
        onclick={copyMarks}
      />
      <UiV2Button size="sm" variant="ghost" label="Сброс" disabled={marks.length === 0} onclick={() => (marks = [])} />
    </div>
  </UiV2Card>

  <UiV2ScrollArea class="dev-pages__scroll">
    {#each groups as group (group.title)}
      <UiV2Card title={group.title} spaced>
        <ul class="dev-pages__list">
          {#each group.items as item (item.route)}
            {@const marked = marks.includes(item.route)}
            {@const names = item.open ? [] : paramNames(item.route)}
            {@const isOpen = expanded === item.route}
            <li
              class="dev-pages__row"
              class:dev-pages__row--current={!item.open && matchesCurrent(item.route)}
              class:dev-pages__row--marked={marked}
            >
              <div class="dev-pages__line">
                <button
                  type="button"
                  class="dev-pages__link"
                  aria-expanded={names.length ? isOpen : undefined}
                  onclick={() => onRowClick(item)}
                >
                  <span class="dev-pages__name">{item.name}</span>
                  <span class="dev-pages__route">{item.route}</span>
                </button>
                <UiV2Toggle
                  label={`Удалить ${item.name}`}
                  checked={marked}
                  onChange={(next) => toggleMark(item.route, next)}
                />
              </div>
              {#if isOpen}
                <div class="dev-pages__params">
                  {#each names as name, i (name)}
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                      class="dev-pages__param"
                      type="text"
                      inputmode={STRING_PARAMS.has(name) ? 'text' : 'numeric'}
                      placeholder={PARAM_LABELS[name] ?? name}
                      aria-label={PARAM_LABELS[name] ?? name}
                      autofocus={i === 0}
                      bind:value={params[name]}
                      onkeydown={(e) => {
                        if (e.key === 'Enter') openItem(item);
                      }}
                    />
                  {/each}
                  <UiV2Button
                    size="sm"
                    variant="primary"
                    label="Открыть"
                    disabled={resolveRoute(item.route) == null}
                    onclick={() => openItem(item)}
                  />
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      </UiV2Card>
    {/each}
  </UiV2ScrollArea>
</aside>

<style>
  .dev-pages {
    position: fixed;
    top: 0.5rem;
    bottom: 0.5rem;
    left: 0.5rem;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: min(360px, calc(100vw - 1rem));
    padding: 0.5rem;
    border-radius: 24px;
    background: var(--uiv2-panel-bg);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.5);
  }

  .dev-pages :global(.dev-pages__scroll) {
    flex: 1;
    min-height: 0;
  }

  .dev-pages__tools {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .dev-pages__list {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dev-pages__row {
    padding: 0.2rem 0.3rem;
    border-radius: 12px;
  }

  .dev-pages__line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .dev-pages__row--current {
    background: var(--uiv2-surface-raised);
  }

  .dev-pages__row--marked .dev-pages__name {
    color: #ff6b6b;
    text-decoration: line-through;
  }

  .dev-pages__link {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    padding: 0.15rem 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .dev-pages__name {
    font-size: 0.85rem;
  }

  .dev-pages__route {
    overflow: hidden;
    max-width: 100%;
    color: var(--uiv2-fg-muted);
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dev-pages__params {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0 0.2rem;
  }

  .dev-pages__param {
    flex: 1 1 7rem;
    min-width: 0;
    padding: 0.35rem 0.6rem;
    border: 0;
    border-radius: 999px;
    background: var(--uiv2-surface-raised);
    color: inherit;
    font: inherit;
    font-size: 0.8rem;
    outline: none;
  }
</style>
