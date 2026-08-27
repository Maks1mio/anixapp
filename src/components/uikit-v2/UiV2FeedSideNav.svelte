<script lang="ts">
  export type UiV2FeedSideNavItem = {
    id: string;
    label: string;
    icon?: string;
  };

  export type UiV2FeedSideNavTopic = {
    id: number | null;
    label: string;
    avatar?: string | null;
  };

  type Props = {
    navItems: UiV2FeedSideNavItem[];
    activeNavId?: string;
    topics?: UiV2FeedSideNavTopic[];
    activeTopicId?: number | null;
    topicsTitle?: string;
    onNav?: (id: string) => void;
    onTopic?: (id: number | null) => void;
    class?: string;
  };

  let {
    navItems,
    activeNavId = '',
    topics = [],
    activeTopicId = null,
    topicsTitle = 'Подписки',
    onNav,
    onTopic,
    class: className = '',
  }: Props = $props();
</script>

<aside class="uiv2-feed-side {className}" aria-label="Навигация ленты">
  <nav class="uiv2-feed-side__nav" aria-label="Разделы ленты">
    {#each navItems as item (item.id)}
      <button
        type="button"
        class="uiv2-feed-side__item"
        class:uiv2-feed-side__item--active={activeNavId === item.id}
        onclick={() => onNav?.(item.id)}
      >
        {#if item.icon}
          <span class="uiv2-feed-side__item-icon" aria-hidden="true">{@html item.icon}</span>
        {/if}
        <span class="uiv2-feed-side__item-label">{item.label}</span>
      </button>
    {/each}
  </nav>

  {#if topics.length > 0}
    <section class="uiv2-feed-side__section">
      <h3 class="uiv2-feed-side__section-title">{topicsTitle}</h3>
      <ul class="uiv2-feed-side__topics">
        {#each topics as topic (topic.id ?? 'all')}
          <li>
            <button
              type="button"
              class="uiv2-feed-side__topic"
              class:uiv2-feed-side__topic--active={activeTopicId === topic.id}
              onclick={() => onTopic?.(topic.id)}
            >
              <span
                class="uiv2-feed-side__topic-avatar"
                class:uiv2-feed-side__topic-avatar--empty={!topic.avatar}
                style={topic.avatar ? `background-image:url('${topic.avatar}')` : undefined}
                aria-hidden="true"
              ></span>
              <span class="uiv2-feed-side__topic-label">{topic.label}</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</aside>
