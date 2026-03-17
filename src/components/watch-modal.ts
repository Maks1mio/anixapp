/**
 * Модальное окно выбора серии, озвучки и воспроизведения.
 * По кнопке «Воспроизвести» открывает окно плеера (через electron.openPlayerWindow).
 */

import { renderPage } from './page';
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

  const footer = document.createElement('div');
  footer.className = 'watch-modal__footer';

  const isInLobbyWithOthers = (): boolean => {
    const roomId = getCurrentRoomId();
    if (!roomId) return false;
    const participants = getCurrentParticipants();
    return participants.length > 1;
  };

  const getPlayButtonLabel = (): string => {
    if (!isInLobbyWithOthers()) return 'Воспроизвести';
    const cur = getLastPlayback();
    // Only show "Предложить" when there IS an active playback with a different anime.
    // If nobody is watching yet (cur === null) or same anime → "Воспроизвести".
    if (cur && String(cur.releaseId) !== String(releaseId)) return 'Предложить';
    return 'Воспроизвести';
  };

  footer.innerHTML = `
    <div class="watch-modal__player-select-wrap">
      <label class="watch-modal__label">Плеер</label>
      <select class="watch-modal__player-select" data-player-select>
        <option value="inline">Встроенный</option>
      </select>
    </div>
    <button type="button" class="watch-modal__play-btn" data-play-btn disabled>
      ${getPlayButtonLabel()}
    </button>
  `;

  overlay.innerHTML = `
    <div class="watch-modal__backdrop"></div>
    <div class="watch-modal__panel">
      <div class="watch-modal__head">
        <h2 class="watch-modal__title">Выбор эпизода</h2>
        <button type="button" class="watch-modal__close" aria-label="Закрыть">×</button>
      </div>
      <div class="watch-modal__body"></div>
    </div>
  `;

  const body = overlay.querySelector('.watch-modal__body') as HTMLElement;
  if (body) {
    body.appendChild(page);
    body.appendChild(footer);
  }

  const backdrop = overlay.querySelector('.watch-modal__backdrop');
  const closeBtn = overlay.querySelector('.watch-modal__close');
  const backBtn = overlay.querySelector('[data-watch-back]') as HTMLButtonElement;
  const sourceSelectorWrap = overlay.querySelector('[data-source-selector-wrap]') as HTMLElement;
  const episodesLoad = overlay.querySelector('[data-episodes-load]') as HTMLElement;
  const episodesList = overlay.querySelector('[data-episodes-list]') as HTMLElement;
  const episodesCountEl = overlay.querySelector('[data-episodes-count]') as HTMLElement;
  const sourcesLoad = overlay.querySelector('[data-sources-load]') as HTMLElement;
  const sourcesList = overlay.querySelector('[data-sources-list]') as HTMLElement;
  const playBtn = overlay.querySelector('[data-play-btn]') as HTMLButtonElement;

  function showSourcesView() {
    viewSources.hidden = false;
    viewEpisodes.hidden = true;
  }
  function showEpisodesView() {
    viewSources.hidden = true;
    viewEpisodes.hidden = false;
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

  function updatePlayButton() {
    playBtn.disabled = !(selectedSource && selectedEpisode);
    playBtn.textContent = getPlayButtonLabel();
  }

  window.addEventListener(
    'lobby:participantsChanged',
    (() => {
      updatePlayButton();
    }) as EventListener,
  );

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
      const avatarHtml = iconUrl
        ? `<span class="watch-modal__source-avatar" style="background-image:url(${escapeHtml(iconUrl)})"></span>`
        : '<span class="watch-modal__source-avatar watch-modal__source-avatar--no-icon"></span>';
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
    updatePlayButton();
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
        const sourceSelector = document.createElement('div');
        sourceSelector.className = 'watch-modal__source-sublist';
        sourceSelector.innerHTML = '<span class="watch-modal__sublist-label">Источник:</span>';
        const sel = document.createElement('select');
        sel.className = 'watch-modal__source-select';
        sources.forEach((s, i) => {
          const opt = document.createElement('option');
          opt.value = String(s.id);
          const srcEp = normalizeEpisodeCount(s as Record<string, unknown>);
          const srcEpText = srcEp != null ? `${srcEp} эп.` : '';
          opt.textContent = srcEpText ? `${s.name} (${srcEpText})` : s.name;
          if (i === 0) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', () => {
          const s = sources.find((x) => String(x.id) === sel.value);
          if (s) selectSource(s);
        });
        sourceSelector.appendChild(sel);
        sourceSelectorWrap.appendChild(sourceSelector);
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
    updatePlayButton();
    showSourcesView();
  });

  function selectSource(source: { id: number; name: string }) {
    selectedSource = { id: source.id, name: source.name };
    selectedEpisode = null;
    episodesLoad.hidden = false;
    episodesLoad.textContent = 'Загрузка серий…';
    episodesList.hidden = true;
    updatePlayButton();
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
        const isWatched = ep.is_watched ?? (ep as Record<string, unknown>).is_watched === true;
        item.className = 'watch-modal__episode-item' + (isWatched ? ' watch-modal__episode-item--watched' : '');
        item.dataset.position = String(ep.position);
        item.innerHTML = `<span class="watch-modal__episode-num">${ep.position} серия</span>${isWatched ? '<span class="watch-modal__episode-watched" title="Просмотрено">✓</span>' : ''}`;
        item.addEventListener('click', () => {
          selectedEpisode = { position: ep.position, name: ep.name };
          episodesList.querySelectorAll('.watch-modal__episode-item--active').forEach((el) => el.classList.remove('watch-modal__episode-item--active'));
          item.classList.add('watch-modal__episode-item--active');
          updatePlayButton();
        });
        episodesList.appendChild(item);
      });
    }).catch(() => {
      episodesLoad.textContent = 'Ошибка загрузки серий';
    });
  }

  playBtn.addEventListener('click', () => {
    if (!selectedSource || !selectedEpisode) return;

    const params = {
      releaseId: String(releaseId),
      sourceId: String(selectedSource.id),
      ep: String(selectedEpisode.position),
      title: releaseTitle,
      sourceName: selectedSource.name,
      ...(selectedDubber ? { dubberId: String(selectedDubber.id) } : {}),
    };

    if (isInLobbyWithOthers()) {
      // В лобби с другими: отправляем предложение без смены плеера.
      // Плеер остаётся на текущем аниме и показывает "ожидание голосов".
      const currentPlayback = getLastPlayback();
      // isDifferentAnime: только если в комнате УЖЕ есть активный playback с другим releaseId.
      // Если currentPlayback === null — никто ещё не смотрит, открываем плеер напрямую.
      const isDifferentAnime = currentPlayback != null && String(currentPlayback.releaseId) !== String(releaseId);

      if (isDifferentAnime) {
        // Другое аниме — голосование
        proposeAnimeChange(params);
        window.electron?.sendProposalToPlayer?.({
          type: 'waiting',
          newPlayback: { title: releaseTitle, ep: params.ep },
        });
      } else {
        // Та же серия другого/того же эпизода — меняем динамически
        window.electron?.openPlayerWindow?.(params).then(() => {}).catch(() => {});
      }
      close();
      return;
    }

    // Не в лобби — открываем/меняем плеер динамически
    if (!window.electron?.openPlayerWindow) return;
    window.electron.openPlayerWindow(params).then(() => close()).catch(() => {});
  });

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
