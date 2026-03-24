<script lang="ts">
  import { onMount } from 'svelte';

  let root: HTMLElement;

  onMount(() => {
    // State
    let currentSession = '';
    let currentFile    = 'errors';
    let levelFilter    = 'ALL';
    let filterText     = '';
    let allEntries: any[] = [];
    let lastZipPath    = '';

    root.innerHTML = `
      <div class="log-toolbar">
        <div class="log-toolbar__left">
          <select class="log-session-select" id="log-session-sel" title="Сессия запуска"></select>
          <div class="log-file-tabs" id="log-file-tabs">
            ${['errors','main','ipc','renderer'].map(f => `
              <button class="log-file-tab ${f === currentFile ? 'log-file-tab--active' : ''}" data-file="${f}">${f}</button>
            `).join('')}
          </div>
        </div>
        <div class="log-toolbar__right">
          <button class="log-btn log-btn--icon" id="log-refresh" title="Обновить">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
            Обновить
          </button>
          <button class="log-btn log-btn--icon" id="log-open-folder" title="Открыть папку с логами">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
            Папка
          </button>
          <button class="log-btn log-btn--primary" id="log-collect-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Собрать логи
          </button>
        </div>
      </div>

      <div class="log-filters" id="log-filters">
        <div class="log-level-filters" id="log-level-filters">
          ${['ALL','ERROR','WARN','INFO','DEBUG'].map(l => `
            <button class="log-level-btn ${l === levelFilter ? 'log-level-btn--active' : ''}" data-level="${l}">${l}</button>
          `).join('')}
        </div>
        <input class="log-search" id="log-search" type="text" placeholder="Фильтр по каналу или сообщению…" autocomplete="off" />
      </div>

      <div class="log-stats" id="log-stats"></div>

      <div class="log-list-wrap">
        <div class="log-list" id="log-list">
          <div class="log-empty">Загрузка…</div>
        </div>
      </div>

      <!-- Collect logs modal -->
      <div class="log-modal-backdrop" id="log-modal-backdrop" style="display:none">
        <div class="log-modal" id="log-modal">
          <div class="log-modal__header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffc300" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Собрать диагностические логи</span>
          </div>
          <p class="log-modal__desc">Будет создан ZIP-архив со следующими данными:</p>
          <div class="log-modal__section log-modal__section--include">
            <div class="log-modal__label log-modal__label--include">Включено в архив</div>
            <ul>
              <li>Журналы событий: main.log, ipc.log, renderer.log, errors.log</li>
              <li>Системная информация: ОС, процессор, объём ОЗУ</li>
              <li>Версии: приложение, Electron, Chrome, Node.js</li>
              <li>Все сессии (последние 5 запусков)</li>
            </ul>
          </div>
          <div class="log-modal__section log-modal__section--exclude">
            <div class="log-modal__label log-modal__label--exclude">НЕ включено</div>
            <ul>
              <li>Токены авторизации — автоматически скрыты ([REDACTED])</li>
              <li>Пароли и личные данные аккаунта</li>
              <li>История просмотра и закладки</li>
              <li>Имя компьютера (hostname)</li>
            </ul>
          </div>
          <div class="log-modal__actions">
            <button class="settings-btn settings-btn--secondary" id="log-modal-cancel">Отмена</button>
            <button class="settings-btn settings-btn--primary" id="log-modal-confirm">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Создать архив
            </button>
          </div>
        </div>
      </div>

      <!-- System info panel -->
      <div class="log-sysinfo" id="log-sysinfo">
        <button class="log-sysinfo__toggle" id="log-sysinfo-toggle">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          Информация о системе
          <svg class="log-sysinfo__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="log-sysinfo__body" id="log-sysinfo-body" style="display:none">
          <div class="log-sysinfo__loading">Загрузка…</div>
        </div>
      </div>
    `;

    function renderList() {
      const listEl = root.querySelector('#log-list') as HTMLElement;
      if (!listEl) return;

      const filtered = allEntries.filter(e => {
        if (levelFilter !== 'ALL' && e.level !== levelFilter) return false;
        if (filterText) {
          const q = filterText.toLowerCase();
          if (!String(e.ch || '').toLowerCase().includes(q) && !String(e.msg || '').toLowerCase().includes(q)) return false;
        }
        return true;
      });

      const statsEl = root.querySelector('#log-stats') as HTMLElement;
      const counts = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
      for (const e of allEntries) if (e.level in counts) counts[e.level as keyof typeof counts]++;
      statsEl.innerHTML = `
        <span class="log-stat log-stat--error">${counts.ERROR} ошибок</span>
        <span class="log-stat log-stat--warn">${counts.WARN} предупреждений</span>
        <span class="log-stat log-stat--info">${counts.INFO} инфо</span>
        <span class="log-stat log-stat--total">${allEntries.length} всего</span>
      `;

      if (!filtered.length) {
        listEl.innerHTML = `<div class="log-empty">${allEntries.length ? 'Нет записей по фильтру' : 'Записей нет 🎉'}</div>`;
        return;
      }

      listEl.innerHTML = [...filtered].reverse().map(e => {
        const ts = e.ts ? (() => {
          const d = new Date(e.ts);
          return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
        })() : '';
        const lvl = e.level || 'INFO';
        const ch  = String(e.ch  || '').slice(0, 40);
        const msg = String(e.msg || '');
        const hasData = e.data !== undefined && e.data !== null;
        const dataId  = Math.random().toString(36).slice(2);
        return `<div class="log-entry">
          <span class="log-level log-level--${lvl.toLowerCase()}">${lvl}</span>
          <span class="log-ts">${ts}</span>
          <span class="log-ch" title="${ch}">${ch}</span>
          <span class="log-msg">${msg.replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0,600)}</span>
          ${hasData ? `<button class="log-entry__data-toggle" data-id="${dataId}">data ›</button>
            <pre class="log-entry__data" id="data-${dataId}" style="display:none">${JSON.stringify(e.data, null, 2).slice(0,2000).replace(/</g,'&lt;')}</pre>` : ''}
        </div>`;
      }).join('');

      listEl.querySelectorAll<HTMLButtonElement>('.log-entry__data-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const pre = listEl.querySelector(`#data-${btn.dataset.id}`) as HTMLElement;
          if (!pre) return;
          const open = pre.style.display !== 'none';
          pre.style.display = open ? 'none' : 'block';
          btn.textContent = open ? 'data ›' : 'data ↓';
        });
      });
    }

    function loadLogs() {
      const el = root.querySelector('#log-list') as HTMLElement;
      el.innerHTML = '<div class="log-empty">Загрузка…</div>';
      if (typeof (window.electron as any)?.logGetSessionLog === 'function') {
        (window.electron as any).logGetSessionLog(currentSession, currentFile, 500)
          .then((entries: any[]) => { allEntries = entries; renderList(); })
          .catch(() => { el.innerHTML = '<div class="log-empty">Ошибка загрузки логов</div>'; });
      } else {
        el.innerHTML = '<div class="log-empty">Доступно только в Electron</div>';
      }
    }

    if (typeof (window.electron as any)?.logGetSessions === 'function') {
      (window.electron as any).logGetSessions().then((sessions: {id: string; ts: string}[]) => {
        const sel = root.querySelector('#log-session-sel') as HTMLSelectElement;
        sel.innerHTML = sessions.map((s, i) =>
          `<option value="${s.id}">${s.id.replace('T', ' ').replace(/-/g, (m: string, o: number) => o > 7 ? ':' : m)}${i === 0 ? ' (текущая)' : ''}</option>`
        ).join('');
        currentSession = sessions[0]?.id || '';
        loadLogs();
      }).catch(() => {});
    }

    root.querySelector('#log-session-sel')?.addEventListener('change', (e) => {
      currentSession = (e.target as HTMLSelectElement).value;
      loadLogs();
    });

    root.querySelector('#log-file-tabs')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-file]') as HTMLElement;
      if (!btn) return;
      currentFile = btn.dataset.file!;
      root.querySelectorAll('.log-file-tab').forEach(b => b.classList.toggle('log-file-tab--active', b === btn));
      loadLogs();
    });

    root.querySelector('#log-level-filters')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-level]') as HTMLElement;
      if (!btn) return;
      levelFilter = btn.dataset.level!;
      root.querySelectorAll('.log-level-btn').forEach(b => b.classList.toggle('log-level-btn--active', b === btn));
      renderList();
    });

    root.querySelector('#log-search')?.addEventListener('input', (e) => {
      filterText = (e.target as HTMLInputElement).value;
      renderList();
    });

    root.querySelector('#log-refresh')?.addEventListener('click', () => loadLogs());

    root.querySelector('#log-open-folder')?.addEventListener('click', () => {
      (window.electron as any)?.logOpenFolder?.();
    });

    const backdrop = root.querySelector('#log-modal-backdrop') as HTMLElement;
    root.querySelector('#log-collect-btn')?.addEventListener('click', () => {
      backdrop.style.display = 'flex';
    });
    root.querySelector('#log-modal-cancel')?.addEventListener('click', () => {
      backdrop.style.display = 'none';
    });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.style.display = 'none'; });

    root.querySelector('#log-modal-confirm')?.addEventListener('click', async () => {
      const confirmBtn = root.querySelector('#log-modal-confirm') as HTMLButtonElement;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Создание…';
      try {
        const res = await (window.electron as any)?.logCollectZip?.();
        backdrop.style.display = 'none';
        if (res?.ok && res.path) {
          lastZipPath = res.path;
          const banner = document.createElement('div');
          banner.className = 'log-zip-banner';
          banner.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Архив создан!
            <button class="log-zip-banner__open" id="log-zip-open">Показать в проводнике</button>
          `;
          root.querySelector('.log-list-wrap')?.insertAdjacentElement('beforebegin', banner);
          root.querySelector('#log-zip-open')?.addEventListener('click', () => {
            (window.electron as any)?.logOpenZip?.(lastZipPath);
          });
        } else {
          alert('Ошибка при создании архива: ' + (res?.error || 'неизвестная ошибка'));
        }
      } catch (err) {
        backdrop.style.display = 'none';
        alert('Ошибка: ' + String(err));
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Создать архив`;
      }
    });

    root.querySelector('#log-sysinfo-toggle')?.addEventListener('click', () => {
      const body = root.querySelector('#log-sysinfo-body') as HTMLElement;
      const chevron = root.querySelector('.log-sysinfo__chevron') as HTMLElement;
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      chevron.style.transform = open ? '' : 'rotate(180deg)';
      if (!open && body.querySelector('.log-sysinfo__loading')) {
        (window.electron as any)?.logGetSystemInfo?.().then((info: any) => {
          if (!info) return;
          body.innerHTML = `
            <div class="log-sysinfo__grid">
              <div class="log-sysinfo__row"><span>ОС</span><span>${info.os?.type} ${info.os?.release} (${info.os?.arch})</span></div>
              <div class="log-sysinfo__row"><span>Платформа</span><span>${info.os?.platform}</span></div>
              <div class="log-sysinfo__row"><span>Процессор</span><span>${info.cpu?.model} (${info.cpu?.cores} ядер, ${info.cpu?.speedMHz} MHz)</span></div>
              <div class="log-sysinfo__row"><span>ОЗУ</span><span>${info.memory?.totalMB} МБ всего / ${info.memory?.freeMB} МБ свободно</span></div>
              <div class="log-sysinfo__row"><span>AnixApp</span><span>v${info.app?.version}</span></div>
              <div class="log-sysinfo__row"><span>Electron</span><span>${info.app?.electron}</span></div>
              <div class="log-sysinfo__row"><span>Chrome</span><span>${info.app?.chrome}</span></div>
              <div class="log-sysinfo__row"><span>Node.js</span><span>${info.app?.node}</span></div>
            </div>
          `;
        }).catch(() => { body.innerHTML = '<div class="log-sysinfo__loading">Ошибка загрузки</div>'; });
      }
    });
  });
</script>

<div bind:this={root} class="logs-page"></div>
