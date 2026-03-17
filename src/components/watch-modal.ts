/**
 * Модальное окно выбора серии, озвучки и воспроизведения.
 * По кнопке «Воспроизвести» открывает окно плеера (через electron.openPlayerWindow).
 */

import { renderPage } from './page';
import { renderSelect } from './select';
import { getCurrentRoomId, getCurrentParticipants, proposeAnimeChange, getLastPlayback } from '../services/lobby-state';

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatNum(n: number): string {
  return n.toLocaleString('ru-RU');
}

function ensureHttps(url: string): string {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/^http:\/\//i, 'https://');
}

/** Нормализует число из API (number, string или поле episode_count / episodeCount) */
function normalizeEpisodeCount(d: Record<string, unknown>): number | null {
  const raw = d.episode_count ?? d.episodeCount ?? d.episodes_count ?? d.episodesCount;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/** SVG-иконка микрофона для студий без аватарки */
const micIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;

export interface WatchModalOptions {
  releaseId: number;
  releaseTitle: string;
  onOpenPlayer: (url: string) => void;
}

export function openWatchModal(options: WatchModalOptions): void {
  const { releaseId, releaseTitle, onOpenPlayer } = options;
  const api = window.anix;
  if (!api?.getDubbers) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'watch-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const page = renderPage();
  page.classList.remove('page--padded');
  page.classList.add('watch-modal__page');
  const scrollEl = page.querySelector('.page__scroll') as HTMLElement;
  if (scrollEl) scrollEl.removeAttribute('id');

  const viewSources = document.createElement('div');
  viewSources.className = 'watch-modal__view watch-modal__view--sources';
  viewSources.innerHTML = `
    <div class="watch-modal__col watch-modal__col--sources">
      <h3 class="watch-modal__col-title">Озвучка</h3>
      <div class="watch-modal__loading" data-sources-load>Загрузка…</div>
      <div class="watch-modal__list watch-modal__sources" data-sources-list hidden></div>
    </div>
  `;

  const viewEpisodes = document.createElement('div');
  viewEpisodes.className = 'watch-modal__view watch-modal__view--episodes';
  viewEpisodes.hidden = true;
  viewEpisodes.innerHTML = `
    <div class="watch-modal__back-row">
      <button type="button" class="watch-modal__back" data-watch-back aria-label="Назад к выбору озвучки">← Назад</button>
    </div>
    <div class="watch-modal__episodes-toolbar">
      <div class="watch-modal__episodes-search">
        <input
          type="number"
          min="1"
          class="watch-modal__episodes-search-input"
          data-episodes-search
          placeholder="Найти серию по номеру"
        />
        <button type="button" class="watch-modal__episodes-search-btn" data-episodes-search-btn>
          Найти
        </button>
      </div>
      <button
        type="button"
        class="watch-modal__episodes-last-watched-btn"
        data-episodes-last-watched
      >
        К последней отмеченной
      </button>
    </div>
    <div class="watch-modal__source-selector-wrap" data-source-selector-wrap hidden></div>
    <div class="watch-modal__col watch-modal__col--episodes">
      <h3 class="watch-modal__col-title">Серии <span class="watch-modal__col-count" data-episodes-count></span></h3>
      <div class="watch-modal__loading" data-episodes-load>Загрузка…</div>
      <div class="watch-modal__list watch-modal__episodes" data-episodes-list hidden></div>
    </div>
  `;

  if (scrollEl) {
    scrollEl.appendChild(viewSources);
    scrollEl.appendChild(viewEpisodes);
  }

  const isInLobbyWithOthers = (): boolean => {
    const roomId = getCurrentRoomId();
    if (!roomId) return false;
    const participants = getCurrentParticipants();
    return participants.length > 1;
  };

  overlay.innerHTML = `
    <div class="watch-modal__backdrop"></div>
    <div class="watch-modal__panel">
      <div class="watch-modal__head">
        <h2 class="watch-modal__title" data-watch-title>Выбор озвучки</h2>
        <button type="button" class="watch-modal__close" aria-label="Закрыть"></button>
      </div>
      <div class="watch-modal__body"></div>
    </div>
  `;

  const body = overlay.querySelector('.watch-modal__body') as HTMLElement;
  if (body) {
    body.appendChild(page);
  }

  const backdrop = overlay.querySelector('.watch-modal__backdrop');
  const closeBtn = overlay.querySelector('.watch-modal__close');
  const backBtn = overlay.querySelector('[data-watch-back]') as HTMLButtonElement;
  const titleEl = overlay.querySelector('[data-watch-title]') as HTMLElement | null;
  const sourceSelectorWrap = overlay.querySelector('[data-source-selector-wrap]') as HTMLElement;
  const episodesLoad = overlay.querySelector('[data-episodes-load]') as HTMLElement;
  const episodesList = overlay.querySelector('[data-episodes-list]') as HTMLElement;
  const episodesCountEl = overlay.querySelector('[data-episodes-count]') as HTMLElement;
  const episodesSearchInput = overlay.querySelector('[data-episodes-search]') as HTMLInputElement | null;
  const episodesSearchBtn = overlay.querySelector('[data-episodes-search-btn]') as HTMLButtonElement | null;
  const episodesLastWatchedBtn = overlay.querySelector('[data-episodes-last-watched]') as HTMLButtonElement | null;
  const sourcesLoad = overlay.querySelector('[data-sources-load]') as HTMLElement;
  const sourcesList = overlay.querySelector('[data-sources-list]') as HTMLElement;

  /** Запускает анимацию входа для вью */
  function animateViewIn(el: HTMLElement, direction: 'forward' | 'back' = 'forward') {
    const cls = direction === 'forward'
      ? 'watch-modal__view--entering'
      : 'watch-modal__view--entering-back';
    el.classList.remove('watch-modal__view--entering', 'watch-modal__view--entering-back');
    // Force reflow to restart animation
    void (el as HTMLElement & { offsetWidth: number }).offsetWidth;
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }

  function showSourcesView() {
    viewSources.hidden = false;
    viewEpisodes.hidden = true;
    if (titleEl) titleEl.textContent = 'Выбор озвучки';
    animateViewIn(viewSources, 'back');
  }
  function showEpisodesView() {
    viewSources.hidden = true;
    viewEpisodes.hidden = false;
    if (titleEl) titleEl.textContent = 'Выбор эпизода';
    animateViewIn(viewEpisodes, 'forward');
  }

  let selectedDubber: { id: number; name: string } | null = null;
  let selectedSource: { id: number; name: string } | null = null;
  let selectedEpisode: { position: number; name: string } | null = null;
  let episodes: Array<{ position: number; name: string; url: string; iframe: boolean; is_watched?: boolean }> = [];

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === backdrop) close();
  });
  closeBtn?.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);

  function scrollToEpisode(position: number) {
    if (!episodesList) return;
    const target = episodesList.querySelector<HTMLButtonElement>(`.watch-modal__episode-item[data-position="${position}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'auto' });
    target.classList.add('watch-modal__episode-item--highlight');
    window.setTimeout(() => {
      target.classList.remove('watch-modal__episode-item--highlight');
    }, 1200);
  }

  if (episodesSearchBtn && episodesSearchInput) {
    const doSearch = () => {
      const raw = episodesSearchInput.value.trim();
      if (!raw) return;
      const num = Number(raw);
      if (!Number.isFinite(num) || num <= 0) return;
      scrollToEpisode(num);
    };
    episodesSearchBtn.addEventListener('click', doSearch);
    episodesSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearch();
      }
    });
  }

  if (episodesLastWatchedBtn) {
    episodesLastWatchedBtn.addEventListener('click', () => {
      if (!episodes || episodes.length === 0) return;
      let lastWatched: number | null = null;
      episodes.forEach((ep) => {
        const isWatched = !!(ep.is_watched ?? (ep as Record<string, unknown>).is_watched);
        if (isWatched) {
          if (lastWatched == null || ep.position > lastWatched) {
            lastWatched = ep.position;
          }
        }
      });
      if (lastWatched != null) {
        scrollToEpisode(lastWatched);
      }
    });
  }

  function openProposalConfirm(params: {
    epLabel: string;
    onConfirm: () => void;
  }) {
    const panel = overlay.querySelector('.watch-modal__panel') as HTMLElement | null;
    if (!panel) {
      params.onConfirm();
      return;
    }
    const existing = panel.querySelector('.watch-modal__confirm');
    if (existing) existing.remove();

    const confirm = document.createElement('div');
    confirm.className = 'watch-modal__confirm';
    confirm.innerHTML = `
      <div class="watch-modal__confirm-inner">
        <div class="watch-modal__confirm-title">Предложить серию ${escapeHtml(params.epLabel)}?</div>
        <div class="watch-modal__confirm-text">Все участники увидят предложение сменить аниме. Продолжить?</div>
        <div class="watch-modal__confirm-actions">
          <button type="button" class="watch-modal__confirm-btn watch-modal__confirm-btn--secondary" data-confirm-no>Отмена</button>
          <button type="button" class="watch-modal__confirm-btn watch-modal__confirm-btn--primary" data-confirm-yes>Предложить</button>
        </div>
      </div>
    `;
    panel.appendChild(confirm);

    const onYes = () => {
      confirm.remove();
      params.onConfirm();
    };
    const onNo = () => {
      confirm.remove();
    };
    confirm.querySelector('[data-confirm-yes]')?.addEventListener('click', onYes);
    confirm.querySelector('[data-confirm-no]')?.addEventListener('click', onNo);
  }

  function handleEpisodePlay(epPosition: number) {
    if (!selectedSource) return;

    const params = {
      releaseId: String(releaseId),
      sourceId: String(selectedSource.id),
      ep: String(epPosition),
      title: releaseTitle,
      // В Rich Presence и в заголовке плеера логичнее показывать студию озвучки,
      // а не техническое имя источника (Kodik/Sibnet и т.п.).
      sourceName: selectedDubber ? selectedDubber.name : selectedSource.name,
      ...(selectedDubber ? { dubberId: String(selectedDubber.id) } : {}),
    };

    const doOpenPlayer = () => {
      if (!window.electron?.openPlayerWindow) return;
      window.electron.openPlayerWindow(params).then(() => close()).catch(() => {});
    };

    if (isInLobbyWithOthers()) {
      const currentPlayback = getLastPlayback();
      const isDifferentAnime = currentPlayback != null && String(currentPlayback.releaseId) !== String(releaseId);

      if (isDifferentAnime) {
        openProposalConfirm({
          epLabel: params.ep,
          onConfirm: () => {
            proposeAnimeChange(params);
            window.electron?.sendProposalToPlayer?.({
              type: 'waiting',
              newPlayback: { title: releaseTitle, ep: params.ep },
            });
            close();
          },
        });
      } else {
        doOpenPlayer();
      }
      return;
    }

    doOpenPlayer();
  }

  function renderDubbers(list: Array<Record<string, unknown> & { id: number; name: string }>) {
    sourcesLoad.hidden = true;
    sourcesList.hidden = false;
    sourcesList.innerHTML = '';
    list.forEach((d) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'watch-modal__source-item';
      item.dataset.dubberId = String(d.id);
      const rec = d as Record<string, unknown>;
      const viewCountRaw = rec.view_count ?? rec.viewCount ?? 0;
      const viewCount = typeof viewCountRaw === 'number' ? viewCountRaw : parseInt(String(viewCountRaw), 10) || 0;
      const epCount = normalizeEpisodeCount(rec);
      const epText = epCount != null ? `${epCount} эп.` : '— эп.';
      const iconUrl = rec.icon ? ensureHttps(String(rec.icon)) : '';
      // Show microphone icon for studios without an avatar
      const avatarHtml = iconUrl
        ? `<span class="watch-modal__source-avatar" style="background-image:url(${escapeHtml(iconUrl)})"></span>`
        : `<span class="watch-modal__source-avatar watch-modal__source-avatar--mic">${micIconSvg}</span>`;
      item.innerHTML = `${avatarHtml}<span class="watch-modal__source-info"><span class="watch-modal__source-name">${escapeHtml(d.name)}</span><span class="watch-modal__source-meta">${formatNum(viewCount)} просмотров · ${epText}</span></span>`;
      item.addEventListener('click', () => selectDubber(d));
      sourcesList.appendChild(item);
    });
  }

  function selectDubber(dubber: { id: number; name: string; episode_count?: number; view_count?: number }) {
    selectedDubber = { id: dubber.id, name: dubber.name };
    selectedSource = null;
    selectedEpisode = null;
    episodes = [];
    episodesList.innerHTML = '';
    episodesLoad.hidden = false;
    episodesLoad.textContent = 'Загрузка серий…';
    episodesList.hidden = true;
    showEpisodesView();
    api.getDubberSources(releaseId, dubber.id).then((res: { sources?: Array<{ id: number; name: string; episode_count: number }> }) => {
      const sources = res?.sources ?? [];
      if (sources.length === 0) {
        episodesLoad.textContent = 'Нет источников';
        episodesLoad.hidden = false;
        return;
      }
      const first = sources[0];
      if (sources.length > 1 && sourceSelectorWrap) {
        sourceSelectorWrap.hidden = false;
        sourceSelectorWrap.innerHTML = '';
        const selectOptions = sources.map((s) => {
          const srcEp = normalizeEpisodeCount(s as Record<string, unknown>);
          const srcEpText = srcEp != null ? `${srcEp} эп.` : '';
          return { value: String(s.id), label: srcEpText ? `${s.name} (${srcEpText})` : s.name };
        });
        const selectEl = renderSelect({
          label: 'Источник',
          options: selectOptions,
          value: String(first.id),
          onChange: (value) => {
            const s = sources.find((x) => String(x.id) === value);
            if (s) selectSource(s);
          },
        });
        selectEl.classList.add('watch-modal__source-selector-custom');
        sourceSelectorWrap.appendChild(selectEl);
      } else if (sourceSelectorWrap) {
        sourceSelectorWrap.hidden = true;
        sourceSelectorWrap.innerHTML = '';
      }
      selectSource(first);
    }).catch(() => {
      episodesLoad.textContent = 'Ошибка загрузки';
      episodesLoad.hidden = false;
    });
  }

  backBtn?.addEventListener('click', () => {
    selectedDubber = null;
    selectedSource = null;
    selectedEpisode = null;
    episodes = [];
    if (sourceSelectorWrap) {
      sourceSelectorWrap.hidden = true;
      sourceSelectorWrap.innerHTML = '';
    }
    episodesList.innerHTML = '';
    episodesLoad.hidden = true;
    episodesLoad.textContent = 'Загрузка…';
    episodesList.hidden = true;
    showSourcesView();
  });

  function selectSource(source: { id: number; name: string }) {
    selectedSource = { id: source.id, name: source.name };
    selectedEpisode = null;
    episodesLoad.hidden = false;
    episodesLoad.textContent = 'Загрузка серий…';
    episodesList.hidden = true;
    if (!selectedDubber) return;
    api.getEpisodes(releaseId, selectedDubber.id, source.id).then((res: { episodes?: Array<{ position: number; name: string; url: string; iframe: boolean; is_watched?: boolean }> }) => {
      episodes = res?.episodes ?? [];
      if (episodesCountEl) {
        episodesCountEl.textContent = episodes.length > 0 ? `(${episodes.length})` : '';
      }
      episodesLoad.hidden = true;
      episodesList.hidden = false;
      episodesList.innerHTML = '';

      episodes.forEach((ep) => {
        const item = document.createElement('button');
        item.type = 'button';
        const isWatched = !!(ep.is_watched ?? (ep as Record<string, unknown>).is_watched);
        item.className = 'watch-modal__episode-item' + (isWatched ? ' watch-modal__episode-item--watched' : '');
        item.dataset.position = String(ep.position);

        const numSpan = document.createElement('span');
        numSpan.className = 'watch-modal__episode-num';
        numSpan.textContent = String(ep.position);
        item.appendChild(numSpan);

        if (isWatched) {
          const check = document.createElement('span');
          check.className = 'watch-modal__episode-watched';
          check.title = 'Просмотрено';
          check.textContent = '✓';
          item.appendChild(check);
        }

        item.addEventListener('click', () => {
          // Select episode for playback
          episodesList.querySelectorAll('.watch-modal__episode-item--active').forEach((el) => {
            el.classList.remove('watch-modal__episode-item--active');
          });
          item.classList.add('watch-modal__episode-item--active');
          selectedEpisode = { position: ep.position, name: ep.name };
          handleEpisodePlay(ep.position);

          // Mark as watched via API on click (optimistic update)
          if (!ep.is_watched && selectedSource) {
            ep.is_watched = true;
            item.classList.add('watch-modal__episode-item--watched', 'watch-modal__episode-item--marking');

            if (!item.querySelector('.watch-modal__episode-watched')) {
              const check = document.createElement('span');
              check.className = 'watch-modal__episode-watched';
              check.title = 'Просмотрено';
              check.textContent = '✓';
              item.appendChild(check);
            }

            const srcId = selectedSource.id;
            window.anix?.markEpisodeAsWatched?.(releaseId, srcId, ep.position)
              .then(() => {
                item.classList.remove('watch-modal__episode-item--marking');
              })
              .catch(() => {
                // Revert on failure
                ep.is_watched = false;
                item.classList.remove('watch-modal__episode-item--watched', 'watch-modal__episode-item--marking');
                item.querySelector('.watch-modal__episode-watched')?.remove();
              });
          }
        });

        episodesList.appendChild(item);
      });

      // Auto-scroll to last watched episode on open
      let lastWatchedPos: number | null = null;
      for (let i = episodes.length - 1; i >= 0; i--) {
        if (episodes[i].is_watched) { lastWatchedPos = episodes[i].position; break; }
      }
      if (lastWatchedPos != null) {
        setTimeout(() => scrollToEpisode(lastWatchedPos!), 0);
      }
    }).catch(() => {
      episodesLoad.textContent = 'Ошибка загрузки серий';
    });
  }

  api.getDubbers(releaseId).then((res: { types?: Array<Record<string, unknown> & { id: number; name: string }> }) => {
    const types = res?.types ?? [];
    if (types.length === 0) {
      sourcesLoad.textContent = 'Нет озвучек';
      return;
    }
    renderDubbers(types);
  }).catch(() => {
    sourcesLoad.textContent = 'Ошибка загрузки';
  });
}
