export function renderNotifications(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-notifications';

  wrap.innerHTML = `
    <div class="view-header">
      <h1 class="view-header__title">Уведомления</h1>
      <p class="view-header__subtitle">Лента событий профиля</p>
    </div>
    <div class="notifications__content" id="notifications-list">
      <div class="notifications__loading">Загрузка…</div>
    </div>
  `;

  const listEl = wrap.querySelector('#notifications-list') as HTMLElement | null;

  if (!listEl) return wrap;

  if (!window.anixApi) {
    listEl.innerHTML = '<p class="notifications__error">API недоступно (только в Electron).</p>';
    return wrap;
  }

  window.anixApi.notification
    .all(0)
    .then((data: any) => {
      console.log('[Anix API] notifications', data);
      const content = (data?.content ?? []) as any[];
      listEl.innerHTML = '';
      if (!content.length) {
        listEl.innerHTML = '<p class="notifications__empty">Уведомлений пока нет.</p>';
        return;
      }
      content.sort((a, b) => (Number(b?.timestamp ?? 0) - Number(a?.timestamp ?? 0)));
      const list = document.createElement('ul');
      list.className = 'notifications__list';
      content.forEach((n) => {
        const li = document.createElement('li');
        li.className = 'notifications__item';
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
        const time = n.time || n.timestamp;
        li.innerHTML = `
          <div class="notifications__item-main">
            <span class="notifications__item-title">${escapeHtml(String(title))}</span>
            ${subtitle ? `<span class="notifications__item-sub">${escapeHtml(subtitle)}</span>` : ''}
            ${time ? `<span class="notifications__item-time">${new Date(time * 1000).toLocaleString()}</span>` : ''}
          </div>
        `;
        list.appendChild(li);
      });
      listEl.appendChild(list);
    })
    .catch((err: unknown) => {
      console.error(err);
      listEl.innerHTML = `<p class="notifications__error">Ошибка: ${String(err)}</p>`;
    });

  return wrap;
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
