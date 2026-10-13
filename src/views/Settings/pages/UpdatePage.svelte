<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { scale, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import UiV2Select, { type UiV2SelectOption } from '../../../components/uikit-v2/UiV2Select.svelte';
  import {
    checkForUpdate,
    listChannelReleases,
    isBetaChannelSupported,
    type AppReleaseInfo,
    type UpdateChannel,
    type UpdateInfo,
  } from '../../../services/update-checker';
  import type { AppUpdateProgress } from '../../../types/electron';
  import { KeygenXmPlayer, BOSS_TRACK } from './update-keygen-synth';
  import UpdateBossArena, { type BossFightResult } from './UpdateBossArena.svelte';
  import { settingsBossFightLock } from '../../../stores/modals';

  type CheckResult = 'found' | 'none' | 'error' | null;

  const LS_VOL = 'anixapp.upd.keygenVol';
  const LS_CLEAR = 'anixapp.upd.bossClear';
  const BOSS_WARMUP_CLICKS = 5;

  type BossClearSave = {
    unlocked: boolean;
    lastScore: number;
    lastTimeSec: number;
    bestScore: number;
    bestTimeSec: number;
  };

  let currentVersion = $state('');
  let channel = $state<UpdateChannel>('stable');
  let releases = $state<AppReleaseInfo[]>([]);
  let selectedKey = $state<string | null>(null);
  let latestInfo = $state<UpdateInfo | null>(null);
  let loading = $state(false);
  let checking = $state(false);
  let checkResult = $state<CheckResult>(null);
  let listError = $state('');
  let progress = $state<AppUpdateProgress | null>(null);
  let pendingVersion = $state<string | null>(null);
  let installType = $state<string | null>(null);
  let logoReady = $state(false);
  let logoEntered = $state(false);
  let checkResultTimer: ReturnType<typeof setTimeout> | null = null;
  let logoEl = $state<HTMLButtonElement | null>(null);
  let playEl = $state<HTMLButtonElement | null>(null);
  let logoScale = $state(1);
  let logoPressed = $state(false);
  let logoShattering = $state(false);
  let logoIdle = $state(true);
  let logoBroken = $state(false);
  let keygenUnlocked = $state(false);
  let keygenOpen = $state(false);
  let fightScore = $state(0);
  let fightTimeSec = $state(0);
  let bestScore = $state(0);
  let bestTimeSec = $state(0);
  let logoHits = $state(0);
  let bossFighting = $state(false);
  let playPressed = $state(false);
  let musicPlaying = $state(false);
  let musicProgress = $state(0);
  let musicVolume = $state(0.55);

  type LogoParticle = {
    id: number;
    x: number;
    y: number;
    z: number;
    rx: number;
    ry: number;
    rz: number;
    vx: number;
    vy: number;
    vz: number;
    vrx: number;
    vry: number;
    vrz: number;
    scale: number;
    opacity: number;
  };

  let logoParticles = $state<LogoParticle[]>([]);

  let particleRaf = 0;
  let progressRaf = 0;
  let idleResetTimer: ReturnType<typeof setTimeout> | null = null;
  let particleIdSeq = 0;
  let shatterPulseTimer: ReturnType<typeof setTimeout> | null = null;
  let keygen: KeygenXmPlayer | null = null;
  let musicTrackLabel = $state('');
  let musicSourceLabel = $state('');

  const LOGO_IDLE_MS = 4000;
  const LOGO_DEPTH_PX = 40;
  const LOGO_SLAB_COUNT = 36;
  const logoSlabs = Array.from({ length: LOGO_SLAB_COUNT }, (_, i) => i);

  const logoStyle = $derived(
    `--logo-scale:${logoScale};--logo-depth:${LOGO_DEPTH_PX}px;--logo-shine-x:32%;--logo-shine-y:28%;`,
  );

  const playStyle = $derived(
    `--play-progress:${(musicProgress * 100).toFixed(2)}%;`
    + `--play-scale:${playPressed ? 0.92 : 1};`
    + `--vol-pct:${(musicVolume * 100).toFixed(2)}%;`,
  );

  function readNum(key: string, fallback: number): number {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null || raw.trim() === '') return fallback;
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  }

  function loadBossClear(): BossClearSave | null {
    try {
      const raw = localStorage.getItem(LS_CLEAR);
      if (!raw) return null;
      const data = JSON.parse(raw) as Partial<BossClearSave>;
      if (!data || typeof data !== 'object') return null;
      return {
        unlocked: !!data.unlocked,
        lastScore: Math.max(0, Number(data.lastScore) || 0),
        lastTimeSec: Math.max(0, Number(data.lastTimeSec) || 0),
        bestScore: Math.max(0, Number(data.bestScore) || 0),
        bestTimeSec: Math.max(0, Number(data.bestTimeSec) || 0),
      };
    } catch {
      return null;
    }
  }

  function saveBossClear(next: BossClearSave) {
    try {
      localStorage.setItem(LS_CLEAR, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function applyClearResult(result: BossFightResult) {
    fightScore = Math.max(0, Math.round(result.score));
    fightTimeSec = Math.max(0, result.timeSec);
    const prevBest = bestScore;
    const prevBestTime = bestTimeSec;
    if (fightScore > prevBest) bestScore = fightScore;
    // best time = fastest clear among wins (only improve when already have a best)
    if (prevBestTime <= 0 || fightTimeSec < prevBestTime) bestTimeSec = fightTimeSec;
    if (bestScore <= 0) bestScore = fightScore;
    if (bestTimeSec <= 0) bestTimeSec = fightTimeSec;
    saveBossClear({
      unlocked: true,
      lastScore: fightScore,
      lastTimeSec: fightTimeSec,
      bestScore,
      bestTimeSec,
    });
  }

  function bumpLogoActivity() {
    if (logoBroken) return;
    logoIdle = false;
    if (idleResetTimer) clearTimeout(idleResetTimer);
    idleResetTimer = setTimeout(() => {
      idleResetTimer = null;
      if (logoPressed || logoShattering) {
        bumpLogoActivity();
        return;
      }
      logoIdle = true;
    }, LOGO_IDLE_MS);
  }

  function ensureParticleLoop() {
    if (particleRaf) return;
    const step = () => {
      let alive = false;
      logoParticles = logoParticles.map((p) => {
        const opacity = p.opacity - 0.016;
        if (opacity <= 0) return { ...p, opacity: 0 };
        alive = true;
        return {
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          z: p.z + p.vz,
          rx: p.rx + p.vrx,
          ry: p.ry + p.vry,
          rz: p.rz + p.vrz,
          vx: p.vx * 0.985,
          vy: p.vy * 0.985 + 0.08,
          vz: p.vz * 0.98,
          opacity,
        };
      }).filter((p) => p.opacity > 0.02);

      if (alive && logoParticles.length) {
        particleRaf = requestAnimationFrame(step);
      } else {
        particleRaf = 0;
        logoParticles = [];
      }
    };
    particleRaf = requestAnimationFrame(step);
  }

  function spawnParticles(count = 14, mega = false) {
    bumpLogoActivity();
    logoShattering = true;
    logoScale = mega ? 0.78 : 0.9;
    if (shatterPulseTimer) clearTimeout(shatterPulseTimer);
    shatterPulseTimer = setTimeout(() => {
      logoScale = mega ? 1.08 : 1.04;
      shatterPulseTimer = setTimeout(() => {
        logoScale = 1;
        logoShattering = false;
        shatterPulseTimer = null;
      }, mega ? 220 : 140);
    }, 70);

    const next: LogoParticle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.45;
      const speed = (mega ? 5.5 : 3.2) + Math.random() * (mega ? 7 : 5.5);
      next.push({
        id: ++particleIdSeq,
        x: (Math.random() - 0.5) * 8,
        y: (Math.random() - 0.5) * 8,
        z: (Math.random() - 0.5) * 10,
        rx: (Math.random() - 0.5) * 40,
        ry: (Math.random() - 0.5) * 40,
        rz: (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed * (0.7 + Math.random()),
        vy: Math.sin(angle) * speed * (0.7 + Math.random()) - 1.5,
        vz: (Math.random() - 0.35) * speed * 1.4,
        vrx: (Math.random() - 0.5) * 14,
        vry: (Math.random() - 0.5) * 16,
        vrz: (Math.random() - 0.5) * 12,
        scale: 0.18 + Math.random() * (mega ? 0.36 : 0.28),
        opacity: 1,
      });
    }
    logoParticles = [...logoParticles, ...next];
    ensureParticleLoop();
  }

  function clearBossTimers() {
    /* arena owns its timers; kept for destroy symmetry */
  }

  /** Escape transform stacking from settings panel so the arena is true fullscreen. */
  function portalToBody(node: HTMLElement) {
    document.body.appendChild(node);
    document.body.classList.add('upd-boss-fight');
    return {
      destroy() {
        document.body.classList.remove('upd-boss-fight');
        node.remove();
      },
    };
  }

  function failBossFight() {
    if (!bossFighting) return;
    bossFighting = false;
    settingsBossFightLock.set(false);
    document.body.classList.remove('upd-boss-fight');
    logoHits = 0;
    keygen?.setAutoAdvance(keygenUnlocked);
    keygen?.pause();
  }

  function startBossFight() {
    if (bossFighting) return;
    if (keygenOpen) {
      keygenOpen = false;
      logoBroken = false;
    }
    bossFighting = true;
    logoIdle = false;
    settingsBossFightLock.set(true);
    // Первый бой / пустой LS раньше давали 0 — не тише 25%
    if (musicVolume < 0.25) {
      musicVolume = 0.25;
      try {
        localStorage.setItem(LS_VOL, String(musicVolume));
      } catch {
        /* ignore */
      }
    }
    const k = ensureKeygen();
    k.setVolume(musicVolume);
    k.setAutoAdvance(false);
    void k.play({ track: BOSS_TRACK });
  }

  function formatFightTime(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function rankFromScore(score: number): { letter: string; title: string } {
    if (score >= 20000) return { letter: 'S', title: 'Легенда' };
    if (score >= 16000) return { letter: 'A', title: 'Мастер' };
    if (score >= 12000) return { letter: 'B', title: 'Сильный' };
    if (score >= 8000) return { letter: 'C', title: 'Норм' };
    if (score >= 4000) return { letter: 'D', title: 'Выжил' };
    return { letter: 'E', title: 'Еле-еле' };
  }

  const victoryRank = $derived(rankFromScore(bestScore || fightScore));

  function openKeygenPlayer() {
    if (!keygenUnlocked || bossFighting) return;
    keygenOpen = true;
    logoBroken = true;
    logoIdle = false;
    spawnParticles(12);
    void startMusic();
  }

  function closeKeygenPlayer() {
    if (!keygenUnlocked) return;
    keygenOpen = false;
    logoBroken = false;
    pauseMusic();
    bumpLogoActivity();
  }

  function breakLogo(result?: BossFightResult) {
    bossFighting = false;
    settingsBossFightLock.set(false);
    document.body.classList.remove('upd-boss-fight');
    spawnParticles(28, true);
    keygenUnlocked = true;
    keygenOpen = true;
    logoBroken = true;
    logoIdle = false;
    logoPressed = false;
    logoHits = 0;
    if (result) applyClearResult(result);
    else if (fightScore <= 0) {
      applyClearResult({ timeSec: 0, score: 500, livesLeft: 0, phase1Left: 0 });
    } else {
      saveBossClear({
        unlocked: true,
        lastScore: fightScore,
        lastTimeSec: fightTimeSec,
        bestScore: Math.max(bestScore, fightScore),
        bestTimeSec: bestTimeSec || fightTimeSec,
      });
    }
    window.setTimeout(() => {
      const k = ensureKeygen();
      k.setAutoAdvance(true);
      void startMusic();
    }, 380);
  }

  function hitBoss() {
    if (logoBroken || bossFighting || keygenOpen) return;
    logoHits += 1;
    spawnParticles(logoHits >= BOSS_WARMUP_CLICKS ? 20 : 12 + logoHits * 2);
    if (logoHits <= BOSS_WARMUP_CLICKS) return;
    startBossFight();
  }

  function onLogoPointerDown(e: PointerEvent) {
    if (e.button !== 0 || logoBroken || bossFighting) return;
    e.preventDefault();
    bumpLogoActivity();
    logoPressed = true;
    logoScale = 0.92;
    spawnParticles(8);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onLogoPointerUp(e: PointerEvent) {
    if (!logoPressed) return;
    logoPressed = false;
    logoScale = 1;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    hitBoss();
  }

  function onLogoPointerCancel() {
    logoPressed = false;
    logoScale = 1;
    bumpLogoActivity();
  }

  function onLogoKeydown(e: KeyboardEvent) {
    if (logoBroken || bossFighting) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      logoScale = 0.94;
      window.setTimeout(() => { logoScale = 1; }, 80);
      hitBoss();
    }
  }

  function ensureKeygen() {
    if (!keygen) {
      keygen = new KeygenXmPlayer();
      keygen.setVolume(musicVolume);
      keygen.onChange(() => {
        musicPlaying = keygen?.isPlaying ?? false;
        musicProgress = keygen?.progress ?? 0;
        musicTrackLabel = keygen?.title ?? '';
        musicSourceLabel = keygen?.sourceLabel ?? '';
      });
    }
    return keygen;
  }

  function startProgressLoop() {
    if (progressRaf) return;
    const tick = () => {
      if (keygen?.isPlaying) {
        musicProgress = keygen.progress;
        progressRaf = requestAnimationFrame(tick);
      } else {
        if (keygen) musicProgress = keygen.progress;
        progressRaf = 0;
      }
    };
    progressRaf = requestAnimationFrame(tick);
  }

  async function startMusic() {
    const k = ensureKeygen();
    k.setVolume(musicVolume);
    if (keygenUnlocked) k.setAutoAdvance(true);
    await k.play();
    musicPlaying = true;
    musicTrackLabel = k.title;
    musicSourceLabel = k.sourceLabel;
    startProgressLoop();
  }

  function pauseMusic() {
    keygen?.pause();
    musicPlaying = false;
    if (keygen) musicProgress = keygen.progress;
  }

  async function toggleMusic() {
    spawnParticles(10);
    const k = ensureKeygen();
    if (k.isPlaying) {
      pauseMusic();
      return;
    }
    await startMusic();
  }

  async function skipTrack(delta: -1 | 1) {
    if (!keygenOpen) return;
    spawnParticles(8);
    const k = ensureKeygen();
    await k.skip(delta);
    musicPlaying = true;
    musicTrackLabel = k.title;
    musicSourceLabel = k.sourceLabel;
    startProgressLoop();
  }

  function onPlayPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    playPressed = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPlayPointerUp(e: PointerEvent) {
    if (!playPressed) return;
    playPressed = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    void toggleMusic();
  }

  function onPlayPointerCancel() {
    playPressed = false;
  }

  function onVolumeInput(e: Event) {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    musicVolume = Math.min(1, Math.max(0, v));
    ensureKeygen().setVolume(musicVolume);
    try {
      localStorage.setItem(LS_VOL, String(musicVolume));
    } catch {
      /* ignore */
    }
  }

  const LOGO_GLYPH =
    'M68.1225 35.5084C72.1899 35.5894 76.5035 38.7608 76.5035 43.99V88.0528L76.5002 88.3247C76.4329 91.1272 75.3246 93.7496 73.6198 95.7202C71.8547 97.7602 69.0703 99.5 65.6073 99.5H59.4963V43.99C59.4964 38.7607 63.8102 35.5894 67.8775 35.5084L68 35.506L68.1225 35.5084ZM92.5149 39.077C97.2901 32.3982 108 35.6625 108 43.99V88.0528L107.996 88.3469C107.84 94.503 102.778 99.5 96.5023 99.5H78.8332V43.8806L84.5549 43.5178C87.6244 43.3231 90.504 41.8895 92.5149 39.077ZM28 43.99C28.0001 35.6625 38.71 32.3982 43.4852 39.077C45.4958 41.8895 48.3754 43.3231 51.4449 43.5178L57.1665 43.8806V99.4844H39.5004C33.1525 99.4844 28.0001 94.3699 28 88.0528V43.99ZM100.925 43.9839C100.925 42.5823 99.1596 42.0099 98.3233 43.0852L98.2842 43.1379C95.1772 47.4842 90.677 49.903 85.9091 50.4435V92.473H96.5031C98.936 92.473 100.925 90.496 100.925 88.0511V43.9839ZM37.7171 43.1379C36.8981 41.9923 35.0757 42.5601 35.0757 43.9839V88.0511L35.0773 88.1653C35.1382 90.5529 37.1024 92.4579 39.5012 92.4579H50.0921V50.4435C45.4034 49.912 40.9734 47.5641 37.8729 43.3528L37.7171 43.1379ZM68.0004 42.5268C67.2425 42.5511 66.572 43.1113 66.572 43.9839V92.3115C67.1918 92.1028 67.7714 91.6982 68.2541 91.1403C68.9814 90.2994 69.4292 89.1729 69.4293 88.0511V43.9839C69.4292 43.1111 68.7586 42.5509 68.0004 42.5268Z';


  const hasElectron = $derived(typeof window !== 'undefined' && !!window.electron?.checkForUpdate);
  const betaAvailable = $derived(isBetaChannelSupported());
  const busy = $derived(
    progress?.state === 'downloading'
    || progress?.state === 'installing'
    || loading
    || checking,
  );
  const selected = $derived(releases.find((r) => releaseKey(r) === selectedKey) ?? null);
  const channelOptions = $derived.by((): UiV2SelectOption[] => {
    const opts: UiV2SelectOption[] = [
      { value: 'stable', label: 'Stable', desc: 'Релизы GitHub anixapp' },
    ];
    if (betaAvailable) {
      opts.push({ value: 'beta', label: 'Beta', desc: 'Windows .exe с AnixBack' });
    }
    return opts;
  });
  const versionOptions = $derived.by((): UiV2SelectOption[] =>
    releases.map((r) => {
      const unavailable = !r.hasAsset;
      const platform = r.platformLabel || 'этой ОС';
      return {
        value: releaseKey(r),
        label: `v${r.version}`,
        desc: [
          unavailable ? `нет сборки для ${platform}` : null,
          r.isCurrent ? 'текущая' : r.isNewer ? 'новее' : r.isOlder ? 'старше' : null,
          r.source === 'anixback' ? 'AnixBack' : 'GitHub',
          formatDate(r.publishedAt),
        ].filter(Boolean).join(' · '),
        warning: unavailable
          ? `В релизе нет установщика для ${platform}${r.assetLabel ? ` (${r.assetLabel})` : ''}`
          : undefined,
        disabled: r.isCurrent || unavailable,
      };
    }),
  );
  const downloadPercent = $derived.by(() => {
    if (!progress || progress.state !== 'downloading') return 0;
    if (progress.total > 0) return Math.round((progress.received / progress.total) * 100);
    return Math.max(0, Math.min(100, progress.percent || 0));
  });

  const hero = $derived.by(() => {
    const state = progress?.state;
    if (checking) {
      return {
        title: 'Проверяем обновления',
        subtitle: channel === 'beta'
          ? 'Сверяем beta-сборки на AnixBack…'
          : 'Сверяем релизы GitHub anixapp…',
        tone: 'checking' as const,
      };
    }
    if (state === 'downloading') {
      return {
        title: 'Скачивание обновления',
        subtitle: `Загружается${pendingVersion ? ` v${pendingVersion}` : ''}… ${downloadPercent}%`,
        tone: 'busy' as const,
      };
    }
    if (state === 'installing') {
      return {
        title: 'Установка',
        subtitle: 'Почти готово — приложение скоро перезапустится.',
        tone: 'busy' as const,
      };
    }
    if (state === 'ready') {
      return {
        title: 'Готово к установке',
        subtitle: pendingVersion
          ? `Сборка v${pendingVersion} скачана. Можно установить.`
          : 'Сборка скачана. Можно установить.',
        tone: 'ready' as const,
      };
    }
    if (state === 'error' || state === 'install-error') {
      return {
        title: 'Не удалось обновить',
        subtitle: progress?.errorMessage || 'Попробуйте ещё раз или выберите другую сборку.',
        tone: 'error' as const,
      };
    }
    if (checkResult === 'error') {
      return {
        title: 'Проверка не удалась',
        subtitle: 'Не удалось связаться с сервером обновлений. Попробуйте позже.',
        tone: 'error' as const,
      };
    }
    if (checkResult === 'found' || selected?.isNewer || (channel === 'stable' && latestInfo)) {
      const ver = selected?.isNewer
        ? selected.version
        : latestInfo?.version
          ?? releases.find((r) => r.isNewer && r.hasAsset)?.version;
      return {
        title: 'Доступно обновление',
        subtitle: ver
          ? `Можно установить v${ver}. Текущая — v${currentVersion || '—'}.`
          : 'Найдена более новая версия приложения.',
        tone: 'update' as const,
      };
    }
    if (checkResult === 'none') {
      return {
        title: 'Приложение обновлено',
        subtitle: channel === 'beta'
          ? 'Новых beta-сборок нет. У вас актуальная версия канала.'
          : 'Новых версий нет. Установлена актуальная сборка.',
        tone: 'ok' as const,
      };
    }
    if (selected?.isOlder) {
      return {
        title: 'Откат версии',
        subtitle: `Выбрана более старая сборка v${selected.version}.`,
        tone: 'rollback' as const,
      };
    }
    return {
      title: 'Приложение обновлено',
      subtitle: 'Установлена актуальная версия. Обновление не требуется.',
      tone: 'ok' as const,
    };
  });

  const primaryAction = $derived.by(() => {
    if (progress?.state === 'ready') {
      return { label: installLabel(), kind: 'install' as const, enabled: true };
    }
    if (selected?.isOlder) {
      return {
        label: 'Откатить',
        kind: 'download' as const,
        enabled: !busy && !!selected && !selected.isCurrent && !!selected.hasAsset,
      };
    }
    if (selected?.isNewer || (channel === 'stable' && latestInfo && !selected)) {
      return {
        label: 'Обновить',
        kind: 'download' as const,
        enabled: !busy && ((!!selected && !selected.isCurrent && !!selected.hasAsset) || (!!latestInfo && !selected)),
      };
    }
    return {
      label: 'Установить',
      kind: 'download' as const,
      enabled: !busy && !!selected && !selected.isCurrent && !!selected.hasAsset,
    };
  });

  function releaseKey(r: AppReleaseInfo): string {
    return r.id ? `id:${r.id}` : `tag:${r.tag || r.version}`;
  }

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  }

  function installLabel(): string {
    if (installType === 'appimage') return 'Установить и перезапустить';
    if (installType === 'pacman') return 'Установить (Arch)';
    if (installType === 'flatpak') return 'Обновить (Flatpak)';
    return 'Установить';
  }

  function clearCheckResultSoon(ms = 5000) {
    if (checkResultTimer) clearTimeout(checkResultTimer);
    checkResultTimer = setTimeout(() => {
      checkResult = null;
      checkResultTimer = null;
    }, ms);
  }

  async function loadCurrentVersion() {
    try {
      const versions = await window.electron?.getVersions?.();
      const v = versions?.app || (await window.electron?.getAppVersion?.());
      if (v) currentVersion = String(v).replace(/^v/i, '');
    } catch {
      /* ignore */
    }
  }

  async function refreshLatest(force = false) {
    if (!currentVersion) await loadCurrentVersion();
    if (!currentVersion) return;
    latestInfo = await checkForUpdate(currentVersion, { force });
  }

  async function refreshReleases(force = false) {
    if (!currentVersion) await loadCurrentVersion();
    loading = true;
    listError = '';
    try {
      releases = await listChannelReleases(channel, currentVersion || undefined, { force });
      if (!releases.length) {
        listError = channel === 'beta'
          ? 'Бета-сборок пока нет'
          : 'Не удалось загрузить стабильные версии с GitHub';
      }
      const prefer = releases.find((r) => r.isCurrent && r.hasAsset)
        || releases.find((r) => r.isCurrent)
        || releases.find((r) => r.hasAsset && r.isNewer)
        || releases.find((r) => r.hasAsset)
        || releases[0]
        || null;
      selectedKey = prefer ? releaseKey(prefer) : null;
    } catch {
      releases = [];
      selectedKey = null;
      listError = 'Ошибка загрузки версий';
    } finally {
      loading = false;
    }
  }

  async function runUpdateCheck() {
    if (checking) return;
    if (progress?.state === 'downloading' || progress?.state === 'installing') return;
    checking = true;
    checkResult = null;
    if (checkResultTimer) {
      clearTimeout(checkResultTimer);
      checkResultTimer = null;
    }
    const started = Date.now();
    try {
      await loadCurrentVersion();
      if (channel === 'stable') {
        await Promise.all([refreshLatest(true), refreshReleases(true)]);
      } else {
        latestInfo = null;
        await refreshReleases(true);
      }
      const minSpin = 700;
      const left = minSpin - (Date.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));

      const newer = releases.some((r) => r.isNewer && r.hasAsset)
        || (channel === 'stable' && !!latestInfo);
      checkResult = newer ? 'found' : 'none';
      if (newer) {
        const best = releases.find((r) => r.isNewer && r.hasAsset) || null;
        if (best) selectedKey = releaseKey(best);
      }
      clearCheckResultSoon(newer ? 7000 : 4500);
    } catch {
      checkResult = 'error';
      clearCheckResultSoon(5000);
    } finally {
      checking = false;
    }
  }

  function setChannel(next: UpdateChannel) {
    if (next === 'beta' && !isBetaChannelSupported()) return;
    if (channel === next) return;
    channel = next;
    checkResult = null;
    void refreshReleases();
  }

  function startDownload(rel?: AppReleaseInfo | null) {
    const target = rel ?? selected;
    if (busy) return;
    if (target && !target.hasAsset) {
      progress = {
        state: 'error',
        percent: 0,
        received: 0,
        total: 0,
        errorMessage: `Нет сборки для ${target.platformLabel || 'этой ОС'}${target.assetLabel ? ` (${target.assetLabel})` : ''}`,
        targetVersion: target.version,
      };
      return;
    }
    if (!target && channel === 'stable' && latestInfo) {
      pendingVersion = latestInfo.version;
      progress = { state: 'downloading', percent: 0, received: 0, total: 0, targetVersion: pendingVersion };
      void window.electron?.startUpdateDownload?.().catch((err) => {
        progress = {
          state: 'error', percent: 0, received: 0, total: 0,
          errorMessage: String(err), targetVersion: pendingVersion,
        };
      });
      return;
    }
    if (!target || target.isCurrent) return;
    pendingVersion = target.version;
    progress = {
      state: 'downloading',
      percent: 0,
      received: 0,
      total: 0,
      targetVersion: pendingVersion,
    };
    void window.electron?.startUpdateDownload?.({
      version: target.version,
      downloadUrl: target.downloadUrl || undefined,
    }).catch((err) => {
      progress = {
        state: 'error', percent: 0, received: 0, total: 0,
        errorMessage: String(err), targetVersion: pendingVersion,
      };
    });
  }

  function installReady() {
    void window.electron?.installUpdate?.();
  }

  function onPrimary() {
    if (primaryAction.kind === 'install') installReady();
    else startDownload();
  }

  function onProgress(e: Event) {
    const detail = (e as CustomEvent<AppUpdateProgress>).detail;
    if (!detail) return;
    progress = detail;
    if (detail.targetVersion) pendingVersion = detail.targetVersion;
    if (detail.installType) installType = detail.installType;
  }

  onMount(() => {
    logoBroken = false;
    logoHits = 0;
    bossFighting = false;
    keygenOpen = false;
    musicVolume = Math.min(1, Math.max(0, readNum(LS_VOL, 0.55)));

    const saved = loadBossClear();
    if (saved?.unlocked) {
      keygenUnlocked = true;
      fightScore = saved.lastScore;
      fightTimeSec = saved.lastTimeSec;
      bestScore = saved.bestScore || saved.lastScore;
      bestTimeSec = saved.bestTimeSec || saved.lastTimeSec;
    } else {
      keygenUnlocked = false;
      fightScore = 0;
      fightTimeSec = 0;
      bestScore = 0;
      bestTimeSec = 0;
    }

    try {
      localStorage.removeItem('anixapp.upd.keygenAutoplay');
      localStorage.removeItem('anixapp.upd.logoBroken');
    } catch {
      /* ignore */
    }

    requestAnimationFrame(() => {
      logoReady = true;
      window.setTimeout(() => {
        logoEntered = true;
        logoIdle = true;
        bumpLogoActivity();
      }, 780);
    });
    void (async () => {
      await loadCurrentVersion();
      void window.electron?.getLinuxInstallType?.().then((t) => { installType = t; });
      await Promise.all([refreshLatest(), refreshReleases()]);
    })();
    window.addEventListener('app-update-progress', onProgress);
  });

  onDestroy(() => {
    window.removeEventListener('app-update-progress', onProgress);
    if (checkResultTimer) clearTimeout(checkResultTimer);
    if (idleResetTimer) clearTimeout(idleResetTimer);
    if (shatterPulseTimer) clearTimeout(shatterPulseTimer);
    clearBossTimers();
    document.body.classList.remove('upd-boss-fight');
    settingsBossFightLock.set(false);
    if (particleRaf) cancelAnimationFrame(particleRaf);
    if (progressRaf) cancelAnimationFrame(progressRaf);
    keygen?.dispose();
    keygen = null;
  });
</script>

{#if !hasElectron}
  <div class="upd">
    <p class="upd__status">Обновления доступны только в приложении Electron.</p>
  </div>
{:else}
  <div
    class="upd"
    class:upd--ready={logoReady}
    class:upd--entered={logoEntered}
    class:upd--checking={checking}
    class:upd--logo-idle={logoIdle && !logoPressed && !logoShattering && !logoBroken}
    class:upd--logo-shatter={logoShattering}
    class:upd--logo-broken={logoBroken}
    class:upd--keygen-open={keygenOpen}
    class:upd--boss={bossFighting}
    data-tone={hero.tone}
  >
    <div class="upd__glow" aria-hidden="true"></div>

    {#if bossFighting}
      <div
        class="upd__boss-overlay"
        use:portalToBody
        transition:fade={{ duration: 220 }}
        role="presentation"
        onpointerdown={(e) => e.stopPropagation()}
      >
        <UpdateBossArena
          glyph={LOGO_GLYPH}
          onWin={breakLogo}
          onLose={failBossFight}
        />
      </div>
    {:else}
    <div class="upd__logo-wrap" class:upd__logo-wrap--keygen={keygenUnlocked}>
      <div class="upd__logo-ring" aria-hidden="true"></div>

      {#each logoParticles as p (p.id)}
        <span
          class="upd__logo-particle"
          style={`transform:translate3d(${p.x}px,${p.y}px,${p.z}px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg) scale(${p.scale});opacity:${p.opacity};`}
          aria-hidden="true"
        >
          <svg class="upd__mark" viewBox="0 0 136 135" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="136" height="135" rx="27" fill="#FF4040" />
            <path d={LOGO_GLYPH} fill="white" />
          </svg>
        </span>
      {/each}

        <div
          class="upd__swap"
          class:upd__swap--player={keygenOpen}
        >
        <div
          class="upd__swap-pane upd__swap-pane--player"
          class:upd__swap-pane--on={keygenOpen}
          aria-hidden={!keygenOpen}
        >
          <div class="upd__playpad" style={playStyle}>
            <div class="upd__pixel-row">
              <button
                bind:this={playEl}
                type="button"
                class="upd__pixel-play"
                class:upd__pixel-play--playing={musicPlaying}
                class:upd__pixel-play--pressed={playPressed}
                aria-label={musicPlaying ? 'Пауза' : 'Воспроизвести'}
                tabindex={keygenOpen ? 0 : -1}
                disabled={!keygenOpen}
                onpointerdown={onPlayPointerDown}
                onpointerup={onPlayPointerUp}
                onpointercancel={onPlayPointerCancel}
                ondragstart={(e) => e.preventDefault()}
              >
                <span class="upd__pixel-play-prog" aria-hidden="true"></span>
                <span class="upd__pixel-play-icon" aria-hidden="true">
                  {#if musicPlaying}
                    <svg class="upd__pixel-ico" viewBox="0 0 16 16" width="18" height="18" shape-rendering="crispEdges">
                      <rect x="3" y="2" width="3" height="12" fill="currentColor" />
                      <rect x="10" y="2" width="3" height="12" fill="currentColor" />
                    </svg>
                  {:else}
                    <svg class="upd__pixel-ico" viewBox="0 0 16 16" width="18" height="18" shape-rendering="crispEdges">
                      <rect x="4" y="2" width="2" height="12" fill="currentColor" />
                      <rect x="6" y="3" width="2" height="10" fill="currentColor" />
                      <rect x="8" y="4" width="2" height="8" fill="currentColor" />
                      <rect x="10" y="5" width="2" height="6" fill="currentColor" />
                      <rect x="12" y="6" width="2" height="4" fill="currentColor" />
                    </svg>
                  {/if}
                </span>
              </button>

              <label class="upd__pixel-vol">
                <span class="upd__pixel-vol-fill" aria-hidden="true"></span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={musicVolume}
                  disabled={!keygenOpen}
                  oninput={onVolumeInput}
                  aria-label="Громкость"
                />
              </label>
            </div>

            <div class="upd__pixel-meta">
              <button
                type="button"
                class="upd__pixel-arrow"
                aria-label="Предыдущий трек"
                tabindex={keygenOpen ? 0 : -1}
                disabled={!keygenOpen}
                onclick={() => void skipTrack(-1)}
              >
                <svg class="upd__pixel-ico" viewBox="0 0 10 12" width="12" height="14" shape-rendering="crispEdges" aria-hidden="true">
                  <rect x="6" y="0" width="2" height="2" fill="currentColor" />
                  <rect x="4" y="2" width="2" height="2" fill="currentColor" />
                  <rect x="2" y="4" width="2" height="2" fill="currentColor" />
                  <rect x="0" y="5" width="2" height="2" fill="currentColor" />
                  <rect x="2" y="6" width="2" height="2" fill="currentColor" />
                  <rect x="4" y="8" width="2" height="2" fill="currentColor" />
                  <rect x="6" y="10" width="2" height="2" fill="currentColor" />
                </svg>
              </button>

              <div class="upd__pixel-titles">
                <p class="upd__pixel-track" title={musicTrackLabel || '—'}>
                  {musicTrackLabel || 'НАЗВАНИЕ ТРЕКА'}
                </p>
                <p class="upd__pixel-source" title={musicSourceLabel || ''}>
                  {musicSourceLabel || 'keygen'}
                </p>
              </div>

              <button
                type="button"
                class="upd__pixel-arrow"
                aria-label="Следующий трек"
                tabindex={keygenOpen ? 0 : -1}
                disabled={!keygenOpen}
                onclick={() => void skipTrack(1)}
              >
                <svg class="upd__pixel-ico" viewBox="0 0 10 12" width="12" height="14" shape-rendering="crispEdges" aria-hidden="true">
                  <rect x="2" y="0" width="2" height="2" fill="currentColor" />
                  <rect x="4" y="2" width="2" height="2" fill="currentColor" />
                  <rect x="6" y="4" width="2" height="2" fill="currentColor" />
                  <rect x="8" y="5" width="2" height="2" fill="currentColor" />
                  <rect x="6" y="6" width="2" height="2" fill="currentColor" />
                  <rect x="4" y="8" width="2" height="2" fill="currentColor" />
                  <rect x="2" y="10" width="2" height="2" fill="currentColor" />
                </svg>
              </button>
            </div>

            {#if fightScore > 0}
              <div class="upd__pixel-score" aria-label={`Ранг ${victoryRank.letter}`}>
                <span class="upd__pixel-score-rank">{victoryRank.letter}</span>
                <span class="upd__pixel-score-sep">·</span>
                <span class="upd__pixel-score-pts">{bestScore.toLocaleString('ru-RU')} BEST</span>
              </div>
            {/if}

            <button
              type="button"
              class="upd__pixel-close"
              tabindex={keygenOpen ? 0 : -1}
              disabled={!keygenOpen}
              onclick={closeKeygenPlayer}
            >
              СВЕРНУТЬ
            </button>
          </div>
        </div>

        <div
          class="upd__swap-pane upd__swap-pane--logo"
          class:upd__swap-pane--on={!keygenOpen}
          aria-hidden={keygenOpen}
        >
          <div class="upd__logo-stack" class:upd__logo-stack--cleared={keygenUnlocked}>
            <button
              bind:this={logoEl}
              type="button"
              class="upd__logo"
              class:upd__logo--pressed={logoPressed}
              class:upd__logo--shatter={logoShattering}
              class:upd__logo--boss-hit={bossFighting}
              class:upd__logo--unlocked={keygenUnlocked}
              style={logoStyle}
              aria-label={keygenUnlocked ? 'Логотип — 5 ударов для реванша' : 'Логотип AnixApp'}
              tabindex={keygenOpen ? -1 : 0}
              onpointerdown={onLogoPointerDown}
              onpointerup={onLogoPointerUp}
              onpointercancel={onLogoPointerCancel}
              onkeydown={onLogoKeydown}
              ondragstart={(e) => e.preventDefault()}
              oncontextmenu={(e) => e.preventDefault()}
            >
              <span class="upd__logo-3d" aria-hidden="true">
                <span class="upd__logo-volume">
                  {#each logoSlabs as i (i)}
                    {@const t = logoSlabs.length <= 1 ? 0 : i / (logoSlabs.length - 1)}
                    <span
                      class="upd__logo-slab"
                      style={`transform:translateZ(${(-LOGO_DEPTH_PX / 2) + t * LOGO_DEPTH_PX}px);--slab-shade:${0.18 + t * 0.62}`}
                    ></span>
                  {/each}
                  <span class="upd__logo-side upd__logo-side--right"></span>
                  <span class="upd__logo-side upd__logo-side--left"></span>
                  <span class="upd__logo-side upd__logo-side--top"></span>
                  <span class="upd__logo-side upd__logo-side--bottom"></span>
                </span>
                <span class="upd__logo-face upd__logo-face--front">
                  <span class="upd__logo-bob">
                    <svg class="upd__mark" viewBox="0 0 136 135" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect class="upd__mark-plate" width="136" height="135" rx="27" fill="#FF4040" />
                      <path class="upd__mark-glyph" d={LOGO_GLYPH} fill="white" />
                    </svg>
                    <span class="upd__logo-shine"></span>
                  </span>
                </span>
                <span class="upd__logo-face upd__logo-face--back">
                  <svg class="upd__mark" viewBox="0 0 136 135" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="136" height="135" rx="27" fill="#9F1A1A" />
                    <path d={LOGO_GLYPH} fill="rgba(255,255,255,0.42)" />
                  </svg>
                </span>
              </span>
            </button>

            {#if keygenUnlocked}
              <button
                type="button"
                class="upd__victory"
                tabindex={keygenOpen ? -1 : 0}
                onclick={(e) => {
                  e.stopPropagation();
                  openKeygenPlayer();
                }}
                onpointerdown={(e) => e.stopPropagation()}
                aria-label={`Рейтинг победы ${victoryRank.letter}. Открыть keygen-плеер`}
              >
                <span class="upd__victory-rank" data-rank={victoryRank.letter}>{victoryRank.letter}</span>
                <span class="upd__victory-body">
                  <span class="upd__victory-title">Рейтинг победы · {victoryRank.title}</span>
                  <span class="upd__victory-row">
                    LAST {formatFightTime(fightTimeSec)} · {fightScore.toLocaleString('ru-RU')}
                  </span>
                  <span class="upd__victory-row upd__victory-row--best">
                    BEST {formatFightTime(bestTimeSec)} · {bestScore.toLocaleString('ru-RU')}
                  </span>
                </span>
              </button>
            {/if}
          </div>
        </div>
      </div>

      {#if channel === 'beta'}
        <span
          class="upd__beta"
          transition:scale={{ duration: 240, start: 0.45, opacity: 0, easing: cubicOut }}
        >beta</span>
      {/if}
    </div>
    {/if}

    <div class="upd__rest" class:upd__rest--away={bossFighting}>
    <header class="upd__hero" aria-live="polite">
      {#key `${hero.tone}:${hero.title}`}
        <div class="upd__hero-swap" in:fade={{ duration: 240 }}>
          <h2 class="upd__title">{hero.title}</h2>
          <p class="upd__subtitle">{hero.subtitle}</p>
        </div>
      {/key}
    </header>

    <div class="upd__panel">
      <UiV2Select
        label="Канал"
        options={channelOptions}
        value={channel}
        disabled={busy}
        onChange={(v) => {
          if (v === 'stable' || v === 'beta') setChannel(v);
        }}
      />

      {#if loading && !releases.length}
        <p class="upd__panel-status">Загрузка версий…</p>
      {:else if listError && !releases.length}
        <p class="upd__panel-status">{listError}</p>
      {:else}
        <UiV2Select
          label="Сборка"
          placeholder={loading ? 'Загрузка…' : 'Выберите версию'}
          options={versionOptions}
          bind:value={selectedKey}
          disabled={busy || !releases.length}
        />
      {/if}

      {#if !betaAvailable}
        <p class="upd__note">Beta доступна только на Windows.</p>
      {/if}
    </div>

    {#if progress?.state === 'downloading'}
      <div class="upd__progress" role="status" aria-live="polite">
        <div class="upd__bar" aria-hidden="true">
          <span class="upd__bar-fill" style={`width:${downloadPercent}%`}></span>
        </div>
      </div>
    {/if}

    <div class="upd__actions">
      {#if progress?.state === 'ready'}
        <UiV2Button
          label={installLabel()}
          size="md"
          variant="primary"
          block
          onclick={installReady}
        />
      {:else if primaryAction.enabled}
        <UiV2Button
          label={busy && progress?.state === 'downloading' ? 'Скачивание…' : primaryAction.label}
          size="md"
          variant="primary"
          block
          disabled={busy}
          onclick={onPrimary}
        />
        <UiV2Button
          label={checking ? 'Проверка…' : 'Проверить обновления'}
          size="md"
          variant="chrome"
          block
          disabled={busy}
          onclick={() => { void runUpdateCheck(); }}
        />
      {:else}
        <UiV2Button
          label={checking ? 'Проверка…' : 'Проверить обновления'}
          size="md"
          variant="primary"
          block
          disabled={busy}
          onclick={() => { void runUpdateCheck(); }}
        />
      {/if}
    </div>

    <p class="upd__footer">
      Версия {currentVersion || '—'}
      {#if channel === 'beta'}
        · Beta
      {:else}
        · Stable
      {/if}
    </p>
    </div>
  </div>
{/if}

<style>
  .upd {
    --upd-accent: #ff4040;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.85rem;
    min-height: 0;
    padding: 0.85rem 1rem 1.15rem;
    isolation: isolate;
  }

  .upd--keygen-open {
    justify-content: center;
    flex: 1 1 auto;
    min-height: min(100%, 26rem);
    height: 100%;
    gap: 0;
    padding-top: 2rem;
    padding-bottom: 3.5rem;
    box-sizing: border-box;
  }

  :global(.settings-panel__page:has(.upd--keygen-open)) {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    height: 100%;
    padding-bottom: 0.65rem;
  }

  :global(.profile-panel__edit-view:has(.upd--keygen-open)) {
    flex: 1;
    min-height: 100%;
    height: 100%;
  }

  .upd__glow {
    position: absolute;
    top: 2.5rem;
    left: 50%;
    width: 14rem;
    height: 14rem;
    transform: translateX(-50%);
    border-radius: 50%;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--upd-accent) 28%, transparent) 0%,
      transparent 70%
    );
    opacity: 0;
    pointer-events: none;
    z-index: 0;
    transition: opacity 0.7s ease;
  }

  .upd--ready .upd__glow {
    opacity: 1;
    animation: upd-glow-breathe 4.8s ease-in-out infinite;
  }

  .upd--checking .upd__glow {
    opacity: 1;
    animation: upd-glow-check 1.1s ease-in-out infinite;
  }

  .upd__logo-wrap,
  .upd__hero,
  .upd__panel,
  .upd__actions,
  .upd__progress,
  .upd__footer,
  .upd__status {
    position: relative;
    z-index: 1;
  }

  .upd__logo-wrap {
    position: relative;
    z-index: 6;
    display: grid;
    place-items: center;
    width: 8.5rem;
    height: 8.5rem;
    margin-top: 0.35rem;
    perspective: 980px;
    perspective-origin: 50% 42%;
    transform-style: preserve-3d;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    transition: height 0.45s cubic-bezier(0.22, 1, 0.36, 1), width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .upd__logo-wrap--keygen {
    height: auto;
    min-height: 0;
    width: min(100%, 15.5rem);
    padding-bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 0;
    overflow: visible;
  }

  .upd--keygen-open .upd__logo-wrap {
    height: auto;
    min-height: 13.25rem;
    width: min(100%, 15.5rem);
  }

  .upd--logo-broken .upd__logo-wrap {
    height: auto;
    min-height: 0;
    width: min(100%, 15.5rem);
  }

  .upd__swap {
    position: relative;
    width: 100%;
    height: 8.5rem;
    overflow: visible;
  }

  .upd__swap--player {
    height: 13.25rem;
  }

  .upd__swap-pane {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    overflow: visible;
    transition: opacity 0.18s ease;
  }

  .upd__swap-pane--player.upd__swap-pane--on {
    align-items: center;
  }

  .upd__swap-pane--on {
    opacity: 1;
    pointer-events: auto;
  }

  .upd__swap-pane--logo {
    z-index: 1;
  }

  .upd__swap-pane--player {
    z-index: 2;
  }

  .upd--keygen-open .upd__logo-wrap {
    z-index: 8;
    margin-top: 0;
  }

  .upd--keygen-open .upd__rest {
    position: absolute;
    inset: auto 0 1.25rem;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
  }

  .upd--keygen-open .upd__hero {
    opacity: 1;
  }

  .upd--keygen-open .upd__panel,
  .upd--keygen-open .upd__actions,
  .upd--keygen-open .upd__progress,
  .upd--keygen-open .upd__footer,
  .upd--keygen-open .upd__note {
    display: none;
  }

  .upd--keygen-open .upd__glow,
  .upd--ready.upd--keygen-open .upd__glow,
  .upd--checking.upd--keygen-open .upd__glow {
    opacity: 0 !important;
    visibility: hidden;
  }

  .upd--keygen-open .upd__logo-wrap::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 16rem;
    height: 16rem;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--upd-accent) 32%, transparent) 0%,
      transparent 70%
    );
    opacity: 1;
    pointer-events: none;
    z-index: 0;
  }

  .upd--keygen-open .upd__swap {
    position: relative;
    z-index: 1;
  }

  .upd__logo-stack {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    /* padding bottom keeps hover bridge to the floating card */
    padding-bottom: 0.15rem;
  }

  .upd__logo-stack--cleared {
    z-index: 5;
  }

  .upd__logo-stack--cleared::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 100%;
    width: 16rem;
    height: 4.4rem;
    transform: translateX(-50%);
  }

  .upd__playpad {
    --play-progress: 0%;
    --vol-pct: 55%;
    --play-scale: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.4rem;
    width: 12.75rem;
  }

  .upd__boss-overlay {
    position: fixed;
    inset: 0;
    z-index: 50000;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100vw;
    height: 100vh;
    margin: 0;
    padding: 1rem;
    box-sizing: border-box;
    border: 0;
    border-radius: 0;
    background: rgba(0, 0, 0, 0.88);
    box-shadow: none;
    overflow: hidden;
  }

  .upd__boss-overlay :global(.arena) {
    width: min(420px, calc(100vw - 2rem));
    height: min(560px, calc(100vh - 2.5rem));
    max-width: 420px;
    max-height: 560px;
    min-width: 300px;
    min-height: 400px;
    border-radius: 0;
    border: 2px solid #ff2020;
    box-shadow: 0 0 0 1px #400808, 0 18px 48px rgba(0, 0, 0, 0.65);
    filter: none;
    flex: 0 0 auto;
  }

  :global(body.upd-boss-fight .schedule-panel-backdrop),
  :global(body.upd-boss-fight .schedule-panel-wrap),
  :global(body.upd-boss-fight .profile-panel__chrome),
  :global(body.upd-boss-fight .profile-panel__friends-head) {
    pointer-events: none !important;
  }

  .upd__rest {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.85rem;
    transition:
      opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1),
      transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
      max-height 0.5s ease,
      margin 0.45s ease;
    max-height: 80rem;
  }

  .upd__rest--away {
    opacity: 0;
    pointer-events: none;
    transform: translateY(2.5rem);
    max-height: 0;
    margin: 0;
    overflow: hidden;
    gap: 0;
  }

  .upd--boss {
    min-height: 0;
  }

  .upd--boss .upd__glow {
    opacity: 0;
  }

  .upd__logo-ring {
    position: absolute;
    inset: 0.2rem auto auto 0.2rem;
    width: calc(100% - 0.4rem);
    height: 8.1rem;
    border-radius: 50%;
    border: 2px solid transparent;
    border-top-color: color-mix(in srgb, var(--upd-accent) 85%, #fff);
    border-right-color: color-mix(in srgb, var(--upd-accent) 35%, transparent);
    opacity: 0;
    pointer-events: none;
    transform: scale(0.9) rotate(0deg);
  }

  .upd--checking .upd__logo-ring {
    opacity: 1;
    animation: upd-ring-spin 0.85s linear infinite;
  }

  .upd__logo-particle {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 5.5rem;
    height: 5.5rem;
    margin: -2.75rem 0 0 -2.75rem;
    border-radius: 1.35rem;
    overflow: hidden;
    pointer-events: none;
    transform-style: preserve-3d;
    filter: drop-shadow(0 8px 14px color-mix(in srgb, var(--upd-accent) 45%, transparent));
    will-change: transform, opacity;
    z-index: 4;
  }

  .upd__pixel-row {
    display: flex;
    align-items: stretch;
    gap: 0.45rem;
    width: 100%;
    height: 2.85rem;
  }

  .upd__pixel-play {
    position: relative;
    appearance: none;
    flex: 0 0 2.85rem;
    width: 2.85rem;
    height: 2.85rem;
    margin: 0;
    padding: 0;
    border: 3px solid #ff4d4d;
    border-radius: 2px;
    background: #2a0c0c;
    color: #fff;
    cursor: pointer;
    image-rendering: pixelated;
    box-shadow: 0 0 0 1px #140404;
    transform: scale(var(--play-scale, 1));
    transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1), filter 0.15s ease;
    outline: none;
    overflow: hidden;
  }

  .upd__pixel-play:disabled {
    cursor: default;
  }

  .upd__pixel-play:focus-visible {
    outline: 2px solid color-mix(in srgb, #fff 70%, #ff4040);
    outline-offset: 2px;
  }

  .upd__pixel-play--pressed {
    filter: brightness(1.12);
  }

  .upd__pixel-play-prog {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--play-progress, 0%);
    background: #ff4040;
    pointer-events: none;
    transition: width 0.12s linear;
  }

  .upd__pixel-play-icon {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    mix-blend-mode: normal;
  }

  .upd__pixel-ico {
    display: block;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }

  .upd__pixel-vol {
    position: relative;
    flex: 1 1 auto;
    display: block;
    height: 100%;
    margin: 0;
    border: 3px solid #ff4d4d;
    border-radius: 2px;
    background: #2a0c0c;
    box-shadow: 0 0 0 1px #140404;
    overflow: hidden;
    cursor: pointer;
  }

  .upd__pixel-vol-fill {
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--vol-pct, 55%);
    background: #ff4040;
    pointer-events: none;
  }

  .upd__pixel-vol input[type='range'] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    appearance: none;
    background: transparent;
    outline: none;
    cursor: pointer;
  }

  .upd__pixel-vol input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 0;
    height: 0;
    background: transparent;
    border: 0;
  }

  .upd__pixel-vol input[type='range']::-moz-range-thumb {
    width: 0;
    height: 0;
    background: transparent;
    border: 0;
  }

  .upd__pixel-meta {
    display: grid;
    grid-template-columns: 1.4rem minmax(0, 1fr) 1.4rem;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
  }

  .upd__pixel-arrow {
    appearance: none;
    display: grid;
    place-items: center;
    width: 1.4rem;
    height: 1.8rem;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 1px;
    background: transparent;
    color: #ff5a5a;
    cursor: pointer;
    image-rendering: pixelated;
    transition: color 0.12s ease, transform 0.12s ease, filter 0.12s ease;
  }

  .upd__pixel-arrow:hover:not(:disabled) {
    color: #ff9090;
    filter: brightness(1.15);
  }

  .upd__pixel-arrow:active:not(:disabled) {
    transform: scale(0.9);
  }

  .upd__pixel-arrow:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .upd__pixel-arrow:focus-visible {
    outline: 1px solid #ff8080;
    outline-offset: 1px;
  }

  .upd__pixel-titles {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.18rem;
  }

  .upd__pixel-track {
    margin: 0;
    width: 100%;
    font-family: "Courier New", Courier, monospace;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: 1.25;
    text-transform: uppercase;
    color: #fff;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    image-rendering: pixelated;
  }

  .upd__pixel-source {
    margin: 0;
    width: 100%;
    font-family: "Courier New", Courier, monospace;
    font-size: 0.58rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    line-height: 1.2;
    color: color-mix(in srgb, #9ca3af 82%, #fff);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .upd__pixel-score {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    width: 100%;
    padding: 0.2rem 0.15rem 0;
    font-family: "Courier New", Courier, monospace;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #ff6060;
    image-rendering: pixelated;
  }

  .upd__pixel-score-sep {
    color: #663333;
  }

  .upd__pixel-score-rank {
    color: #fff;
    font-size: 0.78rem;
    font-weight: 900;
  }

  .upd__pixel-close {
    position: relative;
    z-index: 3;
    align-self: center;
    appearance: none;
    margin: 0.1rem auto 0;
    padding: 0.2rem 0.55rem;
    border: 2px solid #ff4040;
    border-radius: 0;
    background: #1a0505;
    color: #ff8080;
    font-family: "Courier New", Courier, monospace;
    font-size: 0.55rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    cursor: pointer;
    image-rendering: pixelated;
  }

  .upd__pixel-close:hover {
    color: #fff;
    background: #2a0c0c;
  }

  .upd__pixel-close:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  .upd__victory {
    appearance: none;
    position: absolute;
    top: calc(100% + 0.3rem);
    left: 50%;
    z-index: 40;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.55rem;
    width: min(100vw - 2rem, 15.5rem);
    margin: 0;
    padding: 0.4rem 0.55rem;
    border: 2px solid #ff4040;
    border-radius: 0;
    background: #100000;
    color: #fff;
    text-align: left;
    cursor: pointer;
    image-rendering: pixelated;
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, -6px);
    transition:
      opacity 0.16s ease,
      transform 0.16s ease;
  }

  .upd__logo-stack--cleared:hover .upd__victory,
  .upd__logo-stack--cleared:focus-within .upd__victory,
  .upd__victory:focus-visible {
    opacity: 1;
    pointer-events: auto;
    transform: translate(-50%, 0);
  }

  .upd__victory:hover {
    background: #1a0808;
  }

  .upd__victory:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  .upd__victory-rank {
    display: grid;
    place-items: center;
    width: 2.35rem;
    height: 2.35rem;
    border: 2px solid #ff4040;
    background: #ff2020;
    font-family: 'Courier New', Courier, monospace;
    font-size: 1.25rem;
    font-weight: 900;
    line-height: 1;
    color: #fff;
  }

  .upd__victory-rank[data-rank='S'] {
    background: #fff;
    color: #ff2020;
    border-color: #fff;
  }

  .upd__victory-rank[data-rank='A'] {
    background: #ff5050;
  }

  .upd__victory-body {
    display: flex;
    flex-direction: column;
    gap: 0.08rem;
    min-width: 0;
  }

  .upd__victory-title {
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #ff8080;
    text-transform: uppercase;
  }

  .upd__victory-row {
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .upd__victory-row--best {
    color: #ffb0b0;
  }

  .upd__logo {
    --logo-depth: 40px;
    --logo-radius: 1.35rem;
    --logo-half: 2.75rem;
    appearance: none;
    border: 0;
    margin: 0;
    padding: 0;
    width: 5.5rem;
    height: 5.5rem;
    border-radius: var(--logo-radius);
    background: transparent;
    cursor: pointer;
    opacity: 0;
    transform-style: preserve-3d;
    transform: scale(calc(0.72 * var(--logo-scale, 1))) translateY(12px);
    filter: drop-shadow(0 18px 28px color-mix(in srgb, var(--upd-accent) 38%, transparent));
    will-change: transform, opacity, filter;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    -webkit-user-drag: none;
    -webkit-touch-callout: none;
    outline: none;
    z-index: 2;
    transition: transform 0.14s cubic-bezier(0.22, 1, 0.36, 1), filter 0.2s ease;
  }

  .upd__logo-3d {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    pointer-events: none;
  }

  .upd__logo-volume {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
  }

  .upd__logo-slab {
    position: absolute;
    inset: 0;
    border-radius: var(--logo-radius);
    background: color-mix(in srgb, #ff4040 calc(var(--slab-shade, 0.5) * 100%), #6b0f0f);
  }

  /* Flat mid-edge walls — stop short of rounded corners so they don't poke out */
  .upd__logo-side {
    position: absolute;
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, #ff4040 42%, #5a0c0c),
      color-mix(in srgb, #ff4040 28%, #3d0808)
    );
    transform-style: preserve-3d;
  }

  .upd__logo-side--right,
  .upd__logo-side--left {
    top: var(--logo-radius);
    bottom: var(--logo-radius);
    left: 50%;
    width: var(--logo-depth);
    margin-left: calc(var(--logo-depth) / -2);
  }

  .upd__logo-side--right {
    transform: rotateY(90deg) translateZ(var(--logo-half));
    background: linear-gradient(
      180deg,
      color-mix(in srgb, #ff4040 38%, #5a0c0c),
      color-mix(in srgb, #ff4040 22%, #2f0606)
    );
  }

  .upd__logo-side--left {
    transform: rotateY(-90deg) translateZ(var(--logo-half));
    background: linear-gradient(
      180deg,
      color-mix(in srgb, #ff4040 48%, #6b1010),
      color-mix(in srgb, #ff4040 30%, #401010)
    );
  }

  .upd__logo-side--top,
  .upd__logo-side--bottom {
    left: var(--logo-radius);
    right: var(--logo-radius);
    top: 50%;
    height: var(--logo-depth);
    margin-top: calc(var(--logo-depth) / -2);
  }

  .upd__logo-side--top {
    transform: rotateX(90deg) translateZ(var(--logo-half));
    background: linear-gradient(
      90deg,
      color-mix(in srgb, #ff4040 55%, #7a1818),
      color-mix(in srgb, #ff4040 40%, #5a1010)
    );
  }

  .upd__logo-side--bottom {
    transform: rotateX(-90deg) translateZ(var(--logo-half));
    background: linear-gradient(
      90deg,
      color-mix(in srgb, #ff4040 28%, #3a0808),
      color-mix(in srgb, #ff4040 18%, #220404)
    );
  }

  .upd__logo-face {
    position: absolute;
    inset: 0;
    border-radius: var(--logo-radius);
    overflow: hidden;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    transform-style: preserve-3d;
  }

  .upd__logo-face--front {
    transform: translateZ(calc(var(--logo-depth) / 2));
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, #fff 28%, transparent),
      inset 0 -10px 18px color-mix(in srgb, #000 18%, transparent);
  }

  .upd__logo-face--back {
    transform: rotateY(180deg) translateZ(calc(var(--logo-depth) / 2));
    box-shadow: inset 0 0 24px color-mix(in srgb, #000 35%, transparent);
  }

  .upd__logo-bob {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    pointer-events: none;
    user-select: none;
    -webkit-user-drag: none;
    transform-style: preserve-3d;
  }

  .upd__logo-shine {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: radial-gradient(
      circle at var(--logo-shine-x, 32%) var(--logo-shine-y, 28%),
      color-mix(in srgb, #fff 34%, transparent) 0%,
      color-mix(in srgb, #fff 8%, transparent) 28%,
      transparent 58%
    );
    mix-blend-mode: soft-light;
  }

  .upd__logo:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--upd-accent) 70%, #fff);
    outline-offset: 4px;
  }

  .upd__logo--pressed {
    cursor: pointer;
  }

  .upd--ready .upd__logo {
    opacity: 1;
    transform: scale(var(--logo-scale, 1));
  }

  .upd--ready:not(.upd--entered) .upd__logo {
    animation: upd-logo-enter-fade 0.85s cubic-bezier(0.22, 1.2, 0.36, 1) forwards;
  }

  .upd--logo-idle:not(.upd--checking) .upd__logo-3d {
    animation: upd-logo-idle-spin 5.2s ease-in-out infinite;
  }

  .upd--logo-idle:not(.upd--checking) .upd__logo-bob {
    animation: upd-logo-idle-bob 3.6s ease-in-out infinite;
  }

  .upd--checking .upd__logo-3d {
    animation: upd-logo-check-3d 1.15s ease-in-out infinite;
  }

  .upd--logo-shatter .upd__logo {
    animation: none !important;
  }

  .upd__logo--shatter {
    filter: drop-shadow(0 10px 18px color-mix(in srgb, var(--upd-accent) 55%, transparent));
  }

  .upd__logo--shatter .upd__logo-3d {
    animation: upd-logo-crack 0.28s ease-out;
  }

  .upd__beta {
    position: absolute;
    top: 0.55rem;
    right: 0.45rem;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 1.15rem;
    padding: 0 0.42rem;
    border-radius: 999px;
    background: #ef4444;
    color: #fff;
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1;
    box-shadow: 0 6px 16px color-mix(in srgb, #ef4444 40%, transparent);
    pointer-events: none;
    user-select: none;
  }

  .upd__mark {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
    user-select: none;
    -webkit-user-drag: none;
  }

  .upd__mark-plate {
    transform-origin: 68px 67.5px;
  }

  .upd--ready:not(.upd--checking) .upd__mark-plate {
    animation: upd-plate-sheen 3.6s ease-in-out 0.85s infinite;
  }

  .upd__mark-glyph {
    transform-origin: 68px 67.5px;
    opacity: 0;
  }

  .upd--ready .upd__mark-glyph {
    animation: upd-glyph-in 0.55s ease 0.18s forwards;
  }

  .upd__hero {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    max-width: 22rem;
    min-height: 0;
  }

  .upd__hero-swap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    text-align: center;
    width: 100%;
  }

  .upd__title {
    margin: 0;
    font-size: 1.45rem;
    font-weight: 750;
    letter-spacing: -0.03em;
    line-height: 1.2;
    color: var(--uikit-v2-text, #fff);
    transition: color 0.28s ease;
  }

  .upd__subtitle {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.45;
    color: var(--uikit-v2-muted, #9ca3af);
    transition: color 0.28s ease;
  }

  .upd[data-tone='error'] .upd__subtitle {
    color: color-mix(in srgb, #f87171 85%, var(--uikit-v2-muted, #9ca3af));
  }

  .upd[data-tone='checking'] .upd__subtitle {
    color: color-mix(in srgb, var(--upd-accent) 55%, var(--uikit-v2-muted, #9ca3af));
  }

  .upd[data-tone='update'] .upd__subtitle,
  .upd[data-tone='ready'] .upd__subtitle {
    color: color-mix(in srgb, var(--upd-accent) 40%, var(--uikit-v2-muted, #9ca3af));
  }

  .upd__panel {
    width: min(100%, 22rem);
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    text-align: left;
    margin-top: 0.35rem;
    transition: opacity 0.28s ease;
  }

  .upd__panel-status,
  .upd__note,
  .upd__status {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.4;
    color: var(--uikit-v2-muted, #9ca3af);
  }

  .upd__progress {
    width: min(100%, 22rem);
  }

  .upd__bar {
    height: 0.35rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 12%, transparent);
    overflow: hidden;
  }

  .upd__bar-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #ff5a5a, var(--upd-accent));
    transition: width 0.2s ease;
  }

  .upd__actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.55rem;
    width: min(100%, 22rem);
    margin-top: 0.15rem;
  }

  .upd__footer {
    margin: auto 0 0;
    padding-top: 1.25rem;
    font-size: 0.75rem;
    letter-spacing: 0.01em;
    color: color-mix(in srgb, var(--uikit-v2-muted, #9ca3af) 80%, transparent);
  }

  @keyframes upd-logo-enter-fade {
    0% {
      opacity: 0;
      transform: scale(calc(0.7 * var(--logo-scale, 1))) translateY(18px);
    }
    55% {
      opacity: 1;
      transform: scale(calc(1.04 * var(--logo-scale, 1))) translateY(-2px);
    }
    100% {
      opacity: 1;
      transform: scale(var(--logo-scale, 1)) translateY(0);
    }
  }

  @keyframes upd-logo-idle-bob {
    0%,
    100% {
      transform: translateY(0) translateZ(0);
    }
    50% {
      transform: translateY(-3px) translateZ(3px);
    }
  }

  @keyframes upd-logo-idle-spin {
    0%,
    100% {
      transform: rotateX(5deg) rotateY(-10deg) rotateZ(0deg);
    }
    50% {
      transform: rotateX(-4deg) rotateY(12deg) rotateZ(2deg);
    }
  }

  @keyframes upd-logo-check-3d {
    0%,
    100% {
      transform: rotateX(0deg) rotateY(0deg);
    }
    35% {
      transform: rotateX(8deg) rotateY(-14deg);
    }
    70% {
      transform: rotateX(-6deg) rotateY(12deg);
    }
  }

  @keyframes upd-logo-crack {
    0% {
      transform: scale(1) rotateZ(0deg);
      filter: brightness(1);
    }
    35% {
      transform: scale(1.08) rotateZ(-3deg);
      filter: brightness(1.25);
    }
    100% {
      transform: scale(1) rotateZ(0deg);
      filter: brightness(1);
    }
  }

  @keyframes upd-ring-spin {
    to {
      transform: scale(0.86) rotate(360deg);
    }
  }

  @keyframes upd-plate-sheen {
    0%,
    100% {
      filter: brightness(1);
    }
    50% {
      filter: brightness(1.08);
    }
  }

  @keyframes upd-glyph-in {
    from {
      opacity: 0;
      transform: scale(0.92);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes upd-glow-breathe {
    0%,
    100% {
      opacity: 0.55;
      transform: translateX(-50%) scale(1);
    }
    50% {
      opacity: 0.9;
      transform: translateX(-50%) scale(1.12);
    }
  }

  @keyframes upd-glow-check {
    0%,
    100% {
      opacity: 0.45;
      transform: translateX(-50%) scale(0.95);
    }
    50% {
      opacity: 1;
      transform: translateX(-50%) scale(1.12);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .upd__glow,
    .upd--ready .upd__glow,
    .upd--checking .upd__glow,
    .upd--ready .upd__logo,
    .upd--logo-idle .upd__logo-3d,
    .upd--logo-idle .upd__logo-bob,
    .upd--checking .upd__logo-3d,
    .upd--checking .upd__logo-ring,
    .upd--ready .upd__mark-plate,
    .upd--ready .upd__mark-glyph,
    .upd__logo--shatter .upd__logo-3d {
      animation: none !important;
    }

    .upd__logo {
      opacity: 1;
      transform: scale(var(--logo-scale, 1));
    }

    .upd__mark-glyph {
      opacity: 1;
    }

    .upd--ready .upd__glow,
    .upd--checking .upd__glow {
      opacity: 0.45;
    }

    .upd--checking .upd__logo-ring {
      opacity: 0.55;
    }
  }
</style>
