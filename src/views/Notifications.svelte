<script lang="ts">
  import { onMount } from 'svelte';

  interface NotificationItem {
    title: string;
    subtitle: string;
    time: number | null;
  }

  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let items = $state<NotificationItem[]>([]);

  function formatTime(ts: number): string {
    return new Date(ts * 1000).toLocaleString();
  }

  onMount(async () => {
    if (!window.anixApi) {
      errorMsg = 'API недоступно (только в Electron).';
      loadState = 'error';
      return;
    }

    try {
      const data = await window.anixApi.notification.all(0) as any;
      const content = (data?.content ?? []) as any[];
      if (!content.length) {
        loadState = 'empty';
        return;
      }

      content.sort((a, b) => Number(b?.timestamp ?? 0) - Number(a?.timestamp ?? 0));

      items = content.map((n: any) => {
        let title = n.title || n.text || 'Уведомление';
        let subtitle = '';
        if (n?.type === 'friend') {
          const login = n?.by_profile?.login ? String(n.by_profile.login) : 'Пользователь';
          title = login;
          const status = String(n?.status || '');
          subtitle = status === 'REQUEST'
            ? 'Заявка в друзья'
            : status === 'ACCEPT'
              ? 'Принял(а) вашу заявку'
              : 'Уведомление о друзьях';
        }
        return {
          title: String(title),
          subtitle,
          time: n.time || n.timestamp || null,
        };
      });

      loadState = 'ready';
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    }
  });
</script>

<div class="view view-notifications">
  <div class="view-header">
    <h1 class="view-header__title">Уведомления</h1>
    <p class="view-header__subtitle">Лента событий профиля</p>
  </div>

  <div class="notifications__content">
    {#if loadState === 'loading'}
      <div class="notifications__loading">Загрузка…</div>
    {:else if loadState === 'error'}
      <p class="notifications__error">Ошибка: {errorMsg}</p>
    {:else if loadState === 'empty'}
      <p class="notifications__empty">Уведомлений пока нет.</p>
    {:else}
      <ul class="notifications__list">
        {#each items as item}
          <li class="notifications__item">
            <div class="notifications__item-main">
              <span class="notifications__item-title">{item.title}</span>
              {#if item.subtitle}
                <span class="notifications__item-sub">{item.subtitle}</span>
              {/if}
              {#if item.time}
                <span class="notifications__item-time">{formatTime(item.time)}</span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
