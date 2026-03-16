import { navigate } from '../app';
import { renderPage } from '../components/page';
import { iconPlay, iconBookmark, iconDownload, iconCheck } from '../components/icons';

interface EpisodeNotification {
  type: 'episode';
  id: number;
  timestamp: number;
  is_new: boolean;
  is_pushed: boolean;
  episode?: {
    name?: string;
    position?: number;
    release?: {
      id?: number;
      title_ru?: string;
      image?: string;
    };
    source?: {
      name?: string;
      type?: { name?: string };
    };
  };
}

interface RelatedReleaseNotification {
  type: 'relatedRelease';
  id: number;
  timestamp: number;
  is_new: boolean;
  is_pushed: boolean;
  release?: {
    id?: number;
    title_ru?: string;
    image?: string;
  };
}

type AnyNotification = EpisodeNotification | RelatedReleaseNotification | any;

function formatTime(ts: number | undefined): string {
  if (!ts) return '';
  try {
    const now = new Date();
    const d = new Date(ts * 1000);
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    const plural = (n: number, one: string, few: string, many: string) => {
      const nAbs = Math.abs(n) % 100;
      const n1 = nAbs % 10;
      if (nAbs > 10 && nAbs < 20) return many;
      if (n1 === 1) return one;
      if (n1 >= 2 && n1 <= 4) return few;
      return many;
    };

    if (diffSec < 60) {
      const s = Math.max(1, diffSec);
      return `${s} ${plural(s, 'секунду', 'секунды', 'секунд')} назад`;
    }
    if (diffMin < 60) {
      const m = Math.max(1, diffMin);
      return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`;
    }
    if (diffHour < 24 && d.getDate() === now.getDate()) {
      const h = Math.max(1, diffHour);
      return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
    }

    const months = [
      'января',
      'февраля',
      'марта',
      'апреля',
      'мая',
      'июня',
      'июля',
      'августа',
      'сентября',
      'октября',
      'ноября',
      'декабря',
    ];

    const dd = d.getDate();
    const mm = months[d.getMonth()];
    const hh = d.getHours().toString().padStart(2, '0');
    const mi = d.getMinutes().toString().padStart(2, '0');

    const isSameYear = d.getFullYear() === now.getFullYear();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const dayBeforeYesterday = new Date(now);
    dayBeforeYesterday.setDate(now.getDate() - 2);

    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (isSameDay(d, yesterday)) {
      return `Вчера в ${hh}:${mi}`;
    }
    if (isSameDay(d, dayBeforeYesterday)) {
      return `Позавчера в ${hh}:${mi}`;
    }

    if (isSameYear) {
      // Текущий год: «10 марта в 03:00»
      return `${dd} ${mm} в ${hh}:${mi}`;
    }
    // Предыдущие года: «10 марта 2025 в 03:00»
    const yyyy = d.getFullYear();
    return `${dd} ${mm} ${yyyy} в ${hh}:${mi}`;
  } catch {
    return '';
  }
}

function escHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function openNotificationsModal(): void {
  // Если уже открыта панель уведомлений — просим существующий экземпляр
  // красиво закрыться через его own close(), чтобы отработала анимация.
  const existing = document.querySelector('.notifications-modal-overlay') as HTMLElement | null;
  if (existing) {
    const closer = (existing as any)._close as (() => void) | undefined;
    if (typeof closer === 'function') {
      closer();
    } else {
      existing.remove();
    }
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'notifications-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Уведомления');

  const panel = document.createElement('div');
  panel.className = 'notifications-modal-panel';
  panel.innerHTML = `
    <div class="notifications-modal__header">
      <h2 class="notifications-modal__title">Уведомления</h2>
      <button type="button" class="notifications-modal__close" aria-label="Закрыть"></button>
    </div>
    <div class="notifications-modal__body"></div>
  `;

  const body = panel.querySelector('.notifications-modal__body') as HTMLElement;
  const page = renderPage();
  page.classList.remove('page--padded');
  page.classList.add('notifications-modal__page');
  body.appendChild(page);
  const scrollRoot = page.querySelector('#content') as HTMLElement;
  scrollRoot.innerHTML = '<div class="notifications-modal__loading">Загрузка…</div>';

  // Слот для карточки обновления приложения (скачивание/готово).
  const appUpdateSlot = document.createElement('div');
  appUpdateSlot.className = 'notifications-modal__app-update-slot';
  scrollRoot.prepend(appUpdateSlot);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('notifications-modal-overlay--open'));

  let closed = false;
  let onDocumentClick: ((e: MouseEvent) => void) | null = null;

  function close() {
    if (closed) return;
    closed = true;
    overlay.classList.remove('notifications-modal-overlay--open');
    overlay.classList.add('notifications-modal-overlay--closing');
    const done = () => {
      if (!overlay.parentNode) return;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (onDocumentClick) {
        document.removeEventListener('click', onDocumentClick, true);
        onDocumentClick = null;
      }
      (overlay as any)._close = undefined;
    };
    overlay.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 260);
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  panel.querySelector('.notifications-modal__close')?.addEventListener('click', close);

  // Закрытие по клику вне панели, не блокируя сами клики:
  // слушаем document в capture‑фазе, но не мешаем событию дальше.
  onDocumentClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && panel.contains(target)) return;
    close();
  };
  document.addEventListener('click', onDocumentClick, true);

  // Делаем close() доступным для повторных вызовов из toggle‑логики.
  (overlay as any)._close = close;
  if (!window.anix) {
    scrollRoot.innerHTML = '<p class="notifications-modal__error">API недоступно (только в Electron).</p>';
    return;
  }

  window.anix
    .getNotifications(0)
    .then((data: any) => {
      console.log('[Anix API] notifications', data);
      const content = (data?.content ?? []) as AnyNotification[];
      if (content.length === 0) {
        scrollRoot.innerHTML = '<p class="notifications-modal__empty">Уведомлений пока нет.</p>';
        return;
      }

      // Сортируем уведомления по дате (timestamp) — новые сверху.
      content.sort((a: any, b: any) => {
        const ta = typeof a.timestamp === 'number' ? a.timestamp : 0;
        const tb = typeof b.timestamp === 'number' ? b.timestamp : 0;
        return tb - ta;
      });

      const list = document.createElement('div');
      list.className = 'notifications-modal__list';

      content.forEach((raw) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'notifications-modal__item';

        const type = raw.type as string;
        let title = 'Уведомление';
        let subtitle = '';
        let metaLeft = '';
        let image = '';
        let releaseId: number | undefined;
        let markerHtml = '';

        if (type === 'episode') {
          const n = raw as EpisodeNotification;
          const episode = n.episode;
          const release = episode?.release;
          releaseId = release?.id;
          image = release?.image || '';
          const epName = episode?.name || '';
          const pos = episode?.position;
          const posStr = typeof pos === 'number' ? `${pos} серия` : epName;
          title = release?.title_ru || posStr || 'Новый эпизод';
          subtitle = posStr ? `Новая серия · ${posStr}` : 'Новый эпизод';
          const sourceName = episode?.source?.name;
          const sourceType = episode?.source?.type?.name;
          metaLeft = [sourceName, sourceType].filter(Boolean).join(' · ');
          markerHtml = `<span class="notifications-modal__marker notifications-modal__marker--episode">${iconPlay(
            14,
          )}</span>`;
        } else if (type === 'relatedRelease') {
          const n = raw as RelatedReleaseNotification;
          const rel = n.release;
          releaseId = rel?.id;
          image = rel?.image || '';
          title = rel?.title_ru || 'Релиз';
          subtitle = 'Связанный релиз';
          markerHtml = `<span class="notifications-modal__marker notifications-modal__marker--related">${iconBookmark(
            13,
          )}</span>`;
        } else if ((raw as any).release) {
          const rel = (raw as any).release;
          releaseId = rel?.id;
          image = rel?.image || '';
          title = rel?.title_ru || 'Релиз';
          subtitle = 'Уведомление о релизе';
        } else {
          title = String((raw as any).title || 'Уведомление');
        }

        const timeStr = formatTime((raw as any).timestamp);
        const isNew = !!(raw as any).is_new;

        item.innerHTML = `
          ${
            image
              ? `<div class="notifications-modal__thumb" style="background-image:url('${escHtml(
                  image,
                )}');">${markerHtml}</div>`
              : `<div class="notifications-modal__thumb notifications-modal__thumb--placeholder">${markerHtml}</div>`
          }
          <div class="notifications-modal__content">
            <div class="notifications-modal__row">
              <span class="notifications-modal__title">${escHtml(title)}</span>
              ${isNew ? '<span class="notifications-modal__badge">Новое</span>' : ''}
            </div>
            ${subtitle ? `<div class="notifications-modal__subtitle">${escHtml(subtitle)}</div>` : ''}
            <div class="notifications-modal__meta">
              ${metaLeft ? `<span class="notifications-modal__meta-left">${escHtml(metaLeft)}</span>` : ''}
              ${timeStr ? `<span class="notifications-modal__meta-time">${escHtml(timeStr)}</span>` : ''}
            </div>
          </div>
        `;

        if (releaseId) {
          item.addEventListener('click', () => {
            close();
            navigate(`/release/${releaseId}`);
          });
        }

        list.appendChild(item);
      });

      scrollRoot.innerHTML = '';
      scrollRoot.appendChild(appUpdateSlot);
      scrollRoot.appendChild(list);
    })
    .catch((err: unknown) => {
      console.error(err);
      scrollRoot.innerHTML = `<p class="notifications-modal__error">Ошибка: ${String(err)}</p>`;
    });

  // Подписка на прогресс обновления приложения
  type AppUpdateProgress = import('../types/electron').AppUpdateProgress;
  let appUpdateCard: HTMLButtonElement | null = null;

  const onUpdateProgress = ((e: CustomEvent<AppUpdateProgress>) => {
    const data = e.detail;
    if (!data || !appUpdateSlot) return;

    if (!appUpdateCard) {
      appUpdateCard = document.createElement('button');
      appUpdateCard.type = 'button';
      appUpdateCard.className = 'notifications-modal__item notifications-modal__item--app-update';
      appUpdateSlot.appendChild(appUpdateCard);
    }

    if (data.state === 'downloading') {
      const percent = data.total > 0 ? Math.round((data.received / data.total) * 100) : data.percent || 0;
      appUpdateCard.innerHTML = `
        <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
          <span class="notifications-modal__marker notifications-modal__marker--update">${iconDownload(12)}</span>
        </div>
        <div class="notifications-modal__content">
          <div class="notifications-modal__row">
            <span class="notifications-modal__title">Скачивание обновления AnixApp</span>
          </div>
          <div class="notifications-modal__subtitle">Пожалуйста, подождите…</div>
          <div class="notifications-modal__progress">
            <div class="notifications-modal__progress-bar" style="width:${percent}%"></div>
          </div>
        </div>
      `;
      appUpdateCard.onclick = null;
    } else if (data.state === 'ready') {
      appUpdateCard.innerHTML = `
        <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
          <span class="notifications-modal__marker notifications-modal__marker--update-ready">${iconCheck(12)}</span>
        </div>
        <div class="notifications-modal__content">
          <div class="notifications-modal__row">
            <span class="notifications-modal__title">Обновление скачано</span>
            <span class="notifications-modal__badge">Готово</span>
          </div>
          <div class="notifications-modal__subtitle">
            Закройте приложение или нажмите на уведомление, чтобы начать установку.
          </div>
        </div>
      `;
      appUpdateCard.onclick = () => {
        window.electron?.installUpdate?.();
      };
    } else if (data.state === 'error') {
      const msg = data.errorMessage ? String(data.errorMessage) : '';
      appUpdateCard.innerHTML = `
        <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
          <span class="notifications-modal__marker notifications-modal__marker--update"></span>
        </div>
        <div class="notifications-modal__content">
          <div class="notifications-modal__row">
            <span class="notifications-modal__title">Ошибка при скачивании обновления</span>
          </div>
          <div class="notifications-modal__subtitle">
            Попробуйте ещё раз позже.${msg ? ` (${msg})` : ''}
          </div>
        </div>
      `;
      appUpdateCard.onclick = null;
    }
  }) as EventListener;

  window.addEventListener('app-update-progress', onUpdateProgress as EventListener);

  // Отписываемся при закрытии модалки
  const originalClose = (overlay as any)._close as (() => void) | undefined;
  const wrappedClose = () => {
    window.removeEventListener('app-update-progress', onUpdateProgress as EventListener);
    if (typeof originalClose === 'function') originalClose();
  };
  (overlay as any)._close = wrappedClose;
}

