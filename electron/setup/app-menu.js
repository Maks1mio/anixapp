'use strict';

const { Menu, app, ipcMain } = require('electron');
const state = require('../lib/app-state');
const { createMainWindow } = require('./main-window');

// app.name в dev берётся из package.json («anixapp»), поэтому название задано явно.
const APP_NAME = 'AnixApp';

// Разделы для меню «Переход» присылает рендерер — это те же пункты, что в боковой панели.
const MAX_NAV_ITEMS = 32;
let navItems = [];

function sanitizeNavItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, MAX_NAV_ITEMS)) {
    const id = typeof item?.id === 'string' ? item.id.slice(0, 64) : '';
    const label = typeof item?.label === 'string' ? item.label.slice(0, 64) : '';
    if (id && label) out.push({ id, label });
  }
  return out;
}

/**
 * Меню приложения для macOS. На Windows и Linux окна без рамки и меню не показывают,
 * поэтому там остаётся стандартное поведение Electron.
 */
function setupAppMenu(deps) {
  if (process.platform !== 'darwin') return;

  // Показывает главное окно и отправляет ему сообщение из меню.
  const sendToMainWindow = (channel, payload) => {
    // Окно может быть закрыто при живом приложении — создаём заново и отправляем после загрузки.
    if (!state.mainWindow) {
      createMainWindow(deps);
      const win = state.mainWindow;
      win?.webContents.once('did-finish-load', () => {
        if (!win.isDestroyed()) win.webContents.send(channel, payload);
      });
      return;
    }
    state.mainWindow.show();
    state.mainWindow.focus();
    state.mainWindow.webContents.send(channel, payload);
  };

  const openSettings = () => sendToMainWindow('app:openSettings');

  // Назад и вперёд — шаги истории главного окна; без окна истории нет, окно не поднимаем.
  const travelHistory = (action) => {
    state.mainWindow?.webContents.send('app:menuNavigate', { action });
  };

  const buildMenu = () => {
    const viewSubmenu = [
      { role: 'togglefullscreen', label: 'Полноэкранный режим' },
    ];
    if (!app.isPackaged) {
      viewSubmenu.push(
        { type: 'separator' },
        { role: 'reload', label: 'Перезагрузить' },
        { role: 'forceReload', label: 'Перезагрузить без кэша' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' },
      );
    }

    const goSubmenu = [
      { label: 'Назад', accelerator: 'Command+[', click: () => travelHistory('back') },
      { label: 'Вперёд', accelerator: 'Command+]', click: () => travelHistory('forward') },
    ];
    if (navItems.length) {
      goSubmenu.push(
        { type: 'separator' },
        ...navItems.map(({ id, label }) => ({
          label,
          click: () => sendToMainWindow('app:menuNavigate', { id }),
        })),
      );
    }

    const template = [
      {
        label: APP_NAME,
        submenu: [
          { role: 'about', label: `О программе ${APP_NAME}` },
          { type: 'separator' },
          { label: 'Настройки…', accelerator: 'Command+,', click: openSettings },
          { type: 'separator' },
          { role: 'services', label: 'Службы' },
          { type: 'separator' },
          { role: 'hide', label: `Скрыть ${APP_NAME}` },
          { role: 'hideOthers', label: 'Скрыть остальные' },
          { role: 'unhide', label: 'Показать все' },
          { type: 'separator' },
          { role: 'quit', label: `Завершить ${APP_NAME}` },
        ],
      },
      {
        label: 'Правка',
        submenu: [
          { role: 'undo', label: 'Отменить' },
          { role: 'redo', label: 'Повторить' },
          { type: 'separator' },
          { role: 'cut', label: 'Вырезать' },
          { role: 'copy', label: 'Скопировать' },
          { role: 'paste', label: 'Вставить' },
          { role: 'pasteAndMatchStyle', label: 'Вставить и согласовать стиль' },
          { role: 'delete', label: 'Удалить' },
          { role: 'selectAll', label: 'Выбрать все' },
        ],
      },
      { label: 'Вид', submenu: viewSubmenu },
      { label: 'Переход', submenu: goSubmenu },
      {
        label: 'Окно',
        role: 'window',
        submenu: [
          { role: 'minimize', label: 'Убрать в Dock' },
          { role: 'zoom', label: 'Изменить масштаб' },
          { role: 'close', label: 'Закрыть окно' },
          { type: 'separator' },
          { role: 'front', label: 'Все окна — на передний план' },
        ],
      },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  };

  ipcMain.on('app:setMenuNav', (event, items) => {
    if (event.sender !== state.mainWindow?.webContents) return;
    navItems = sanitizeNavItems(items);
    buildMenu();
  });

  buildMenu();
}

module.exports = { setupAppMenu };
