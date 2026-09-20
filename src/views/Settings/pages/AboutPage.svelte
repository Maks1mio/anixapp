<script lang="ts">
  import { onMount } from 'svelte';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import UserAvatar from '../../../components/UserAvatar.svelte';
  import { FOUNDER_ID } from '../../../services/admin-api';
  import { openProfilePanel } from '../../../stores/profile-panel';

  const TG_CHANNEL = 'https://t.me/anixapp';
  const GITHUB_PROFILE = 'https://github.com/Maks1mio';

  let version = $state('—');
  let login = $state('');
  let avatar = $state<string | null>(null);

  onMount(async () => {
    try {
      if (typeof window.electron?.getVersions === 'function') {
        const v = await window.electron.getVersions();
        if (v?.app) version = `v${v.app}`;
      } else if (typeof (window.electron as { getAppVersion?: () => Promise<string> })?.getAppVersion === 'function') {
        const v = await (window.electron as { getAppVersion: () => Promise<string> }).getAppVersion();
        if (v) version = `v${v}`;
      }
    } catch {}

    try {
      const info = await window.anixApi?.profile?.info?.(FOUNDER_ID) as {
        profile?: { login?: string; avatar?: string | null };
      } | undefined;
      const p = info?.profile;
      if (p?.login) login = p.login;
      if (p?.avatar) avatar = p.avatar;
    } catch {}
  });

  function openExternal(url: string) {
    window.electron?.openExternal?.(url);
  }

  function openFounderProfile() {
    openProfilePanel(FOUNDER_ID, { login: login || undefined });
  }
</script>

<div class="uiv2-settings uiv2-settings--about">
  <div class="uiv2-settings__logo">
    <img
      src="/logo/512x512.png"
      alt=""
      class="uiv2-settings__logo-img"
      onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
    />
  </div>
  <div class="uiv2-settings__about-id">
    <h2 class="uiv2-settings__name">AnixApp</h2>
    <p class="uiv2-settings__version">{version}</p>
  </div>
  <p class="uiv2-settings__lead">
    Неофициальный десктопный клиент для Anixart. Построен с использованием
    <a
      href="https://github.com/Maks1mio/anixapi"
      class="uiv2-settings__link"
      onclick={(e) => { e.preventDefault(); openExternal('https://github.com/Maks1mio/anixapi'); }}
    >AnixApi</a>
    — TypeScript-обёртка над API Anixart 9.x для Node.js.
  </p>
  <UiV2Button
    label="Поставить звезду проекту"
    variant="chrome"
    onclick={() => openExternal('https://github.com/Maks1mio/anixapp')}
  />
  <div class="uiv2-settings__group uiv2-settings__dev">
    <button
      type="button"
      class="uiv2-settings__dev-profile"
      onclick={openFounderProfile}
    >
      <span class="uiv2-settings__dev-avatar">
        <UserAvatar src={avatar} label={login || 'Anixart'} />
      </span>
      <span class="uiv2-settings__dev-info">
        <span class="uiv2-settings__dev-name">{login || 'Anixart'}</span>
        <span class="uiv2-settings__dev-role">Разработчик AnixApp</span>
      </span>
    </button>
    <div class="uiv2-settings__dev-actions">
      <button
        type="button"
        class="uiv2-settings__icon-btn"
        title="Telegram"
        aria-label="Открыть канал AnixApp в Telegram"
        onclick={() => openExternal(TG_CHANNEL)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      </button>
      <button
        type="button"
        class="uiv2-settings__icon-btn"
        title="GitHub"
        aria-label="Открыть GitHub разработчика"
        onclick={() => openExternal(GITHUB_PROFILE)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
        </svg>
      </button>
    </div>
  </div>
</div>
