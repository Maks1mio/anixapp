<script lang="ts">
  import { onMount } from 'svelte';

  let version = $state('—');

  onMount(async () => {
    try {
      if (typeof window.electron?.getVersions === 'function') {
        const v = await window.electron.getVersions();
        if (v?.app) version = `v${v.app}`;
      } else if (typeof (window.electron as any)?.getAppVersion === 'function') {
        const v = await (window.electron as any).getAppVersion();
        if (v) version = `v${v}`;
      }
    } catch {}
  });

  function openExternal(url: string) {
    window.electron?.openExternal?.(url);
  }
</script>

<div class="settings-about">
  <div class="settings-about__logo">
    <!-- svelte-ignore a11y_missing_attribute -->
    <img
      src="/logo/512x512.png"
      alt="AnixApp"
      class="settings-about__logo-img"
      onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
    />
  </div>
  <h2 class="settings-about__name">AnixApp</h2>
  <p class="settings-about__version">{version}</p>
  <p class="settings-about__desc">
    Неофициальный десктопный клиент для Anixart. Построен с использованием
    <!-- svelte-ignore a11y_invalid_attribute -->
    <a
      href="#"
      class="settings-about__inline-link"
      onclick={(e) => { e.preventDefault(); openExternal('https://github.com/theDesConnet/AnixartJS'); }}
    >theDesConnet/AnixartJS</a>
    — Unofficial Anixart API wrapper for NodeJS.
  </p>
  <!-- svelte-ignore a11y_invalid_attribute -->
  <a
    href="#"
    class="settings-about__star-btn"
    onclick={(e) => { e.preventDefault(); openExternal('https://github.com/Maks1mio/anixapp'); }}
  >
    <span>⭐</span>
    <span>Поставить звезду проекту</span>
    <span>↗</span>
  </a>
  <div class="settings-nav__sep" style="width:100%;max-width:400px;margin:24px auto;"></div>
  <div class="settings-about__dev-card">
    <div
      class="settings-about__dev-avatar"
      style="background-image:url('https://github.com/Maks1mio.png')"
    ></div>
    <div class="settings-about__dev-info">
      <p class="settings-about__dev-name">Maks1mio <span class="settings-about__dev-tag">(EvT)</span></p>
      <p class="settings-about__dev-role">Разработчик AnixApp</p>
    </div>
    <!-- svelte-ignore a11y_invalid_attribute -->
    <a
      href="#"
      class="settings-about__dev-github"
      title="GitHub"
      onclick={(e) => { e.preventDefault(); openExternal('https://github.com/Maks1mio'); }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
    </a>
  </div>
</div>
