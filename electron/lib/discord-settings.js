'use strict';

const state = require('./app-state');
const config = require('./config-store');

function createDiscordSettings(discordRpc) {
  function applyDiscordRpcOptionsFromSettings() {
    if (!discordRpc) return;
    discordRpc.setRpcOptions({
      showImages: config.getDiscordRpcShowImages(),
      showProgress: config.getDiscordRpcShowProgress(),
      showDubber: config.getDiscordRpcShowDubber(),
    });
  }

  function setDiscordGenericInApp() {
    if (!discordRpc) return;
    discordRpc.setPage({ details: 'AnixApp', state: 'В приложении' });
  }

  function initDiscordRpc() {
    if (!discordRpc || !state.mainWindow || !config.getDiscordRpcEnabled()) return;
    discordRpc.setPaused(false);
    discordRpc.setMainWindow(state.mainWindow);
    applyDiscordRpcOptionsFromSettings();
    if (config.getDiscordRpcShowBrowsing()) {
      discordRpc.setBrowsing(state.discordSessionStart);
    } else {
      setDiscordGenericInApp();
    }
    discordRpc.connect();
    state.mainWindow.on('focus', () => discordRpc.focusWindow('main'));
  }

  return {
    applyDiscordRpcOptionsFromSettings,
    setDiscordGenericInApp,
    initDiscordRpc,
  };
}

module.exports = { createDiscordSettings };
