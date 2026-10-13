<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  type Props = {
    glyph: string;
    onWin?: (result: BossFightResult) => void;
    onLose?: () => void;
  };

  export type BossFightResult = {
    timeSec: number;
    score: number;
    livesLeft: number;
    phase1Left: number;
  };

  let { glyph, onWin, onLose }: Props = $props();

  const HP_MAX = 260;
  const TIME_MAX = 48;
  const LIVES_MAX = 3;
  const CLICK_DMG = [2, 4] as const;
  const BH_DMG = 1.15;
  const PLAYER_SPEED = 175;
  const PLAYER_FIRE_MS = 130;
  const GRAB_COOLDOWN = 2200;
  const SLASH_COOLDOWN = 160;
  const BOSS_HIT_R = 26;
  /** Touhou-style point hitbox (radius in px) */
  const PLAYER_HIT_R = 1.6;
  const BULLET_HIT_PAD = 0.4;
  const INVULN_MS = 1100;
  const PUNCH_COOLDOWN = 2800;
  const PUNCH_TELEGRAPH_SEC = 0.72;
  const PUNCH_IMPACT_R = 36;
  const ARM_SEGMENTS = 6;
  const CORNER_DASH_CD = 850;

  const LINES = [
    'Эй! Не режь!',
    'Руки сами!',
    'Ауч… далеко!',
    'Курсор мой!',
    'Bullet hell? ЛЕГКО.',
    'Touhou mode — ON',
    'Точка — жизнь!',
    'Я быстрее кликов!',
    'Нет нет нет——',
    'Ладно… сдаюсь.',
  ] as const;

  type Bullet = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    friendly: boolean;
    life: number;
    fromHand?: boolean;
  };

  type FxParticle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    max: number;
    s: number;
    tone: 'red' | 'white' | 'pink';
  };

  type Arm = {
    side: -1 | 1;
    hx: number;
    hy: number;
    mode: 'idle' | 'reach' | 'grab' | 'telegraph' | 'punch' | 'recoil';
    punchT: number;
    punchX: number;
    punchY: number;
    fistR: number;
    impactDone: boolean;
  };

  let arenaEl = $state<HTMLDivElement | null>(null);
  let canvasEl = $state<HTMLCanvasElement | null>(null);

  let hp = $state(HP_MAX);
  let timeLeft = $state(TIME_MAX);
  let lives = $state(LIVES_MAX);
  let phase = $state<'click' | 'bullethell'>('click');
  let dialogOpen = $state(true);
  let dialogTyped = $state('');
  let bossX = $state(0.5);
  let bossY = $state(0.42);
  let bossTargetX = 0.5;
  let bossTargetY = 0.42;
  let cursorX = $state(0);
  let cursorY = $state(0);
  let cursorVisible = $state(false);
  let grabActive = $state(false);
  let playerX = $state(0.5);
  let playerY = $state(0.82);
  let keys = new Set<string>();

  let lineCursor = 0;
  let typeTimer: ReturnType<typeof setTimeout> | null = null;
  let raf = 0;
  let lastTs = 0;
  let lastGrab = 0;
  let lastSlash = 0;
  let lastPlayerShot = 0;
  let lastBossPattern = 0;
  let lastPunch = 0;
  let lastCornerDash = 0;
  let patternAngle = 0;
  let bullets: Bullet[] = [];
  let fx: FxParticle[] = [];
  let bossFlash = $state(false);
  let bossFlashUntil = 0;
  let w = 360;
  let h = 420;
  let realMX = 0;
  let realMY = 0;
  let prevCX = 0;
  let prevCY = 0;
  let grabOX = 0;
  let grabOY = 0;
  let grabVX = 0;
  let grabVY = 0;
  let grabHand: -1 | 1 = 1;
  let ended = false;
  let hitsSinceLine = 0;
  let invulnUntil = 0;
  let arenaLeft = 0;
  let arenaTop = 0;
  let lastWarp = 0;
  let warpBusy = false;
  let fightStartedAt = 0;
  let livesLost = 0;
  let damageDealt = 0;
  let phase1LeftOnEnter = TIME_MAX;

  let arms: Arm[] = [
    { side: -1, hx: 0, hy: 0, mode: 'idle', punchT: 0, punchX: 0, punchY: 0, fistR: 10, impactDone: false },
    { side: 1, hx: 0, hy: 0, mode: 'idle', punchT: 0, punchX: 0, punchY: 0, fistR: 10, impactDone: false },
  ];

  const hpPct = $derived(Math.max(0, Math.min(100, (hp / HP_MAX) * 100)));
  const timerLabel = $derived(Math.max(0, Math.ceil(timeLeft)).toString().padStart(2, '0'));

  function typeLine(text: string) {
    if (typeTimer) clearTimeout(typeTimer);
    dialogOpen = true;
    dialogTyped = '';
    let i = 0;
    const step = () => {
      i += 1;
      dialogTyped = text.slice(0, i);
      if (i < text.length) {
        const ch = text[i - 1] ?? '';
        typeTimer = setTimeout(step, ch === ' ' ? 16 : 26 + ((Math.random() * 16) | 0));
      } else typeTimer = null;
    };
    typeTimer = setTimeout(step, 30);
  }

  function nextLine(force?: string) {
    const line = force ?? LINES[Math.min(lineCursor, LINES.length - 1)]!;
    if (!force) lineCursor = Math.min(lineCursor + 1, LINES.length - 1);
    typeLine(line);
  }

  function measure() {
    if (!arenaEl) return;
    const r = arenaEl.getBoundingClientRect();
    w = Math.max(280, r.width);
    h = Math.max(320, r.height);
    arenaLeft = r.left;
    arenaTop = r.top;
    clampBossInBounds();
    if (canvasEl) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvasEl.width = Math.floor(w * dpr);
      canvasEl.height = Math.floor(h * dpr);
      canvasEl.style.width = `${w}px`;
      canvasEl.style.height = `${h}px`;
      const ctx = canvasEl.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function bossPx() {
    return { x: bossX * w, y: bossY * h };
  }

  function bossHalf() {
    return phase === 'bullethell' ? 28 : 36;
  }

  function shoulderOf(side: -1 | 1) {
    const b = bossPx();
    const half = bossHalf();
    return { x: b.x + side * (half * 0.72), y: b.y + half * 0.12 };
  }

  function pickDodge() {
    const fromX = phase === 'bullethell' ? playerX : cursorX / Math.max(1, w);
    const fromY = phase === 'bullethell' ? playerY : cursorY / Math.max(1, h);
    const ang = Math.atan2(bossY - fromY, bossX - fromX) + (Math.random() - 0.5) * 1.2;
    const dist = phase === 'bullethell' ? 0.08 + Math.random() * 0.12 : 0.12 + Math.random() * 0.18;
    const half = bossHalf();
    const padX = Math.min(0.42, (half + 8) / Math.max(1, w));
    const padY = Math.min(0.42, (half + 8) / Math.max(1, h));
    let nx = bossX + Math.cos(ang) * dist;
    let ny = bossY + Math.sin(ang) * dist;
    if (phase === 'bullethell') {
      // Touhou lane: boss stays in the upper band so upward shots can hit
      nx = Math.min(1 - padX, Math.max(padX, nx));
      ny = Math.min(0.38, Math.max(0.14, ny));
    } else {
      nx = Math.min(1 - padX, Math.max(padX, nx));
      ny = Math.min(0.58, Math.max(padY, ny));
    }
    bossTargetX = nx;
    bossTargetY = ny;
  }

  function clampBossInBounds() {
    const half = bossHalf();
    const padX = Math.min(0.42, (half + 6) / Math.max(1, w));
    const padY = Math.min(0.42, (half + 6) / Math.max(1, h));
    bossX = Math.min(1 - padX, Math.max(padX, bossX));
    bossTargetX = Math.min(1 - padX, Math.max(padX, bossTargetX));
    if (phase === 'bullethell') {
      bossY = Math.min(0.38, Math.max(0.14, bossY));
      bossTargetY = Math.min(0.38, Math.max(0.14, bossTargetY));
    } else {
      bossY = Math.min(0.58, Math.max(padY, bossY));
      bossTargetY = Math.min(0.58, Math.max(padY, bossTargetY));
    }
  }

  function distPointSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = x1 + t * dx;
    const qy = y1 + t * dy;
    return Math.hypot(px - qx, py - qy);
  }

  function warpOsCursor(sx: number, sy: number) {
    const api = window.electron?.setCursorScreenPos;
    if (!api) return;
    const now = performance.now();
    if (now - lastWarp < 28 || warpBusy) return;
    lastWarp = now;
    warpBusy = true;
    void api(Math.round(sx), Math.round(sy)).finally(() => {
      warpBusy = false;
    });
  }

  function startGrab(now: number, side: -1 | 1 = Math.random() < 0.5 ? -1 : 1) {
    if (phase !== 'click' || grabActive) return;
    if (now - lastGrab < GRAB_COOLDOWN) return;
    lastGrab = now;
    grabActive = true;
    grabHand = side;
    const arm = arms.find((a) => a.side === side);
    if (arm) arm.mode = 'grab';

    const b = bossPx();
    const dx = cursorX - b.x;
    const dy = cursorY - b.y;
    const len = Math.hypot(dx, dy) || 1;
    const power = 560 + Math.random() * 320;
    // yank sideways + slightly down — feels like a yank
    grabVX = (dx / len) * power + side * 180;
    grabVY = (dy / len) * power + 120;
    nextLine('Курсор мой!');
    window.setTimeout(() => {
      grabActive = false;
      for (const a of arms) {
        if (a.mode === 'grab') a.mode = 'recoil';
      }
    }, 520);
  }

  function enterBulletHell() {
    if (phase === 'bullethell') return;
    phase = 'bullethell';
    bullets = [];
    lives = LIVES_MAX;
    phase1LeftOnEnter = Math.max(0, timeLeft);
    // snap boss to upper lane — player only shoots upward
    bossX = 0.5;
    bossY = 0.22;
    bossTargetX = 0.5;
    bossTargetY = 0.22;
    playerX = 0.5;
    playerY = 0.84;
    grabActive = false;
    invulnUntil = performance.now() + 800;
    for (const a of arms) {
      a.mode = 'idle';
      a.punchT = 0;
    }
    clampBossInBounds();
    nextLine('Bullet hell? ЛЕГКО.');
    lineCursor = Math.max(lineCursor, 5);
  }

  function spawnBossBullets(now: number) {
    const pattern = ((now / 2400) | 0) % 4;
    const px = playerX * w;
    const py = playerY * h;

    if (pattern === 3) {
      // shoot from both fists
      for (const arm of arms) {
        const base = Math.atan2(py - arm.hy, px - arm.hx);
        for (let i = -1; i <= 1; i++) {
          const a = base + i * 0.18;
          bullets.push({
            x: arm.hx,
            y: arm.hy,
            vx: Math.cos(a) * 110,
            vy: Math.sin(a) * 110,
            r: 3.2,
            friendly: false,
            life: 5.5,
            fromHand: true,
          });
        }
      }
      patternAngle += 0.2;
      return;
    }

    const b = bossPx();
    if (pattern === 0) {
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = patternAngle + (i / n) * Math.PI * 2;
        bullets.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(a) * 68,
          vy: Math.sin(a) * 68,
          r: 3.2,
          friendly: false,
          life: 6,
        });
      }
    } else if (pattern === 1) {
      const base = Math.atan2(py - b.y, px - b.x);
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.16;
        bullets.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(a) * 98,
          vy: Math.sin(a) * 98,
          r: 2.8,
          friendly: false,
          life: 5.5,
        });
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const a = patternAngle + i * 2.1;
        bullets.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(a) * 90,
          vy: Math.sin(a) * 90,
          r: 3,
          friendly: false,
          life: 5,
        });
      }
    }
    patternAngle += 0.35;
  }

  function cornerDash(now: number, force = false) {
    if (phase !== 'bullethell' || ended) return;
    if (!force && now - lastCornerDash < CORNER_DASH_CD) return;
    const nearL = bossX <= 0.24;
    const nearR = bossX >= 0.76;
    if (!force && !nearL && !nearR) return;
    lastCornerDash = now;
    // dash to the opposite upper lane
    if (nearL || (!nearR && bossX < 0.5)) {
      bossTargetX = 0.68 + Math.random() * 0.14;
    } else {
      bossTargetX = 0.18 + Math.random() * 0.14;
    }
    bossTargetY = 0.16 + Math.random() * 0.16;
    // snappy teleport-ish dash so he doesn't stay cornered
    bossX += (bossTargetX - bossX) * 0.92;
    bossY += (bossTargetY - bossY) * 0.92;
    clampBossInBounds();
    spawnHitBurst(bossPx().x, bossPx().y, 10, false);
    nextLine('РЫВОК!');
  }

  function startPunch(now: number) {
    if (phase !== 'bullethell') return;
    if (now - lastPunch < PUNCH_COOLDOWN) return;
    if (arms.some((a) => a.mode === 'telegraph' || a.mode === 'punch')) return;
    lastPunch = now;
    const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
    const arm = arms.find((a) => a.side === side);
    if (!arm) return;
    arm.mode = 'telegraph';
    arm.punchT = 0;
    arm.fistR = 18;
    arm.impactDone = false;
    // lock aim where the player is now — telegraph shows the danger zone
    arm.punchX = Math.min(w - 24, Math.max(24, playerX * w));
    arm.punchY = Math.min(h - 24, Math.max(h * 0.45, playerY * h));
    nextLine(Math.random() < 0.5 ? 'СМОТРИ!' : 'УДАР!');
  }

  function hurtPlayer(now: number) {
    if (ended) return;
    if (now < invulnUntil) return;
    lives -= 1;
    livesLost += 1;
    invulnUntil = now + INVULN_MS;
    const b = bossPx();
    const px = playerX * w;
    const py = playerY * h;
    const ang = Math.atan2(py - b.y, px - b.x);
    playerX = Math.min(0.92, Math.max(0.08, playerX + Math.cos(ang) * 0.1));
    playerY = Math.min(0.92, Math.max(0.1, playerY + Math.sin(ang) * 0.1));
    if (lives <= 0) {
      lives = 0;
      lose();
    } else {
      nextLine(`Жизни: ${lives}`);
    }
  }

  function spawnHitBurst(ox: number, oy: number, count = 14, mega = false) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const spd = (mega ? 140 : 90) + Math.random() * (mega ? 160 : 110);
      const life = 0.28 + Math.random() * 0.35;
      const roll = Math.random();
      fx.push({
        x: ox + (Math.random() - 0.5) * 8,
        y: oy + (Math.random() - 0.5) * 8,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        life,
        max: life,
        s: mega ? 3 + ((Math.random() * 4) | 0) : 2 + ((Math.random() * 3) | 0),
        tone: roll > 0.72 ? 'white' : roll > 0.4 ? 'pink' : 'red',
      });
    }
    if (fx.length > 120) fx = fx.slice(-120);
  }

  function updateFx(dt: number) {
    if (!fx.length) return;
    const next: FxParticle[] = [];
    for (const p of fx) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.08, dt);
      p.vy = p.vy * Math.pow(0.12, dt) + 180 * dt;
      next.push(p);
    }
    fx = next;
  }

  function drawFx(ctx: CanvasRenderingContext2D) {
    for (const p of fx) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.tone === 'white' ? '#ffffff' : p.tone === 'pink' ? '#ff8a8a' : '#ff2020';
      const s = Math.max(1, Math.round(p.s * (0.55 + a * 0.45)));
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
    ctx.globalAlpha = 1;
  }

  function damage(amount: number) {
    if (ended) return;
    hp = Math.max(0, hp - amount);
    damageDealt += amount;
    hitsSinceLine += 1;
    const b = bossPx();
    const mega = amount >= 2.5 || hp <= 0;
    spawnHitBurst(b.x, b.y, mega ? 22 : 12 + Math.min(8, Math.round(amount * 2)), mega);
    bossFlashUntil = performance.now() + (mega ? 140 : 90);
    bossFlash = true;
    pickDodge();
    if (hitsSinceLine >= 4) {
      hitsSinceLine = 0;
      nextLine();
    }
    if (hp <= HP_MAX * 0.55 && phase === 'click') enterBulletHell();
    if (hp <= 0) win();
    else if (phase === 'bullethell' && (bossX <= 0.26 || bossX >= 0.74)) {
      cornerDash(performance.now(), true);
    }
  }

  function computeResult(): BossFightResult {
    const timeSec = Math.max(0.1, (performance.now() - fightStartedAt) / 1000);
    const livesLeft = phase === 'bullethell' ? lives : LIVES_MAX;
    const phase1Left = phase === 'click' ? Math.max(0, timeLeft) : phase1LeftOnEnter;
    const timeScore = Math.max(0, Math.round((180 - timeSec) * 42));
    const lifeScore = livesLeft * 2200;
    const phase1Score = Math.round(phase1Left * 90);
    const dmgScore = Math.round(Math.min(HP_MAX, damageDealt) * 6);
    const perfect = livesLost === 0 ? 3500 : 0;
    const score = Math.max(500, timeScore + lifeScore + phase1Score + dmgScore + perfect);
    return { timeSec, score, livesLeft, phase1Left };
  }

  function trySlash(now: number) {
    if (ended || phase !== 'click') return;
    if (now - lastSlash < SLASH_COOLDOWN) return;
    const b = bossPx();
    const d = distPointSeg(b.x, b.y, prevCX, prevCY, cursorX, cursorY);
    if (d > BOSS_HIT_R) return;
    const travel = Math.hypot(cursorX - prevCX, cursorY - prevCY);
    if (travel < 6) return;
    lastSlash = now;
    const dmg = CLICK_DMG[0] + Math.floor(Math.random() * (CLICK_DMG[1] - CLICK_DMG[0] + 1));
    damage(dmg);
    if (Math.random() < 0.42) startGrab(now, Math.random() < 0.5 ? -1 : 1);
  }

  function win() {
    if (ended) return;
    ended = true;
    const result = computeResult();
    nextLine('Ладно… сдаюсь.');
    window.setTimeout(() => onWin?.(result), 500);
  }

  function lose() {
    if (ended) return;
    ended = true;
    nextLine('Фух… я жив. Пока.');
    window.setTimeout(() => onLose?.(), 700);
  }

  function onPointerMove(e: PointerEvent) {
    if (!arenaEl || ended) return;
    const r = arenaEl.getBoundingClientRect();
    arenaLeft = r.left;
    arenaTop = r.top;
    if (grabActive) return;
    realMX = e.clientX - r.left;
    realMY = e.clientY - r.top;
    cursorVisible = true;
    prevCX = cursorX || realMX;
    prevCY = cursorY || realMY;
    cursorX = realMX + grabOX;
    cursorY = realMY + grabOY;
    trySlash(performance.now());
  }

  function onKey(e: KeyboardEvent, down: boolean) {
    if (e.key === 'Escape') {
      if (down && !ended) {
        e.preventDefault();
        e.stopPropagation();
        lose();
      }
      return;
    }
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
      e.preventDefault();
      if (down) keys.add(k);
      else keys.delete(k);
    }
  }

  function updateArms(dt: number, now: number) {
    const half = bossHalf();
    const px = phase === 'bullethell' ? playerX * w : cursorX;
    const py = phase === 'bullethell' ? playerY * h : cursorY;

    for (const arm of arms) {
      const sh = shoulderOf(arm.side);
      let tx = sh.x + arm.side * (22 + Math.sin(now / 320 + arm.side) * 6);
      let ty = sh.y + half * 0.55 + Math.cos(now / 280 + arm.side) * 5;

      if (phase === 'click') {
        if (grabActive && arm.side === grabHand) {
          tx = cursorX;
          ty = cursorY;
          arm.mode = 'grab';
        } else {
          const reach = 0.55 + (arm.side === grabHand ? 0.15 : 0);
          tx = sh.x + (cursorX - sh.x) * reach;
          ty = sh.y + (cursorY - sh.y) * reach;
          arm.mode = Math.hypot(cursorX - arm.hx, cursorY - arm.hy) < 36 ? 'reach' : 'idle';
        }
      } else if (arm.mode === 'telegraph') {
        // wind-up near shoulder while danger zone is shown
        arm.punchT = Math.min(1, arm.punchT + dt / PUNCH_TELEGRAPH_SEC);
        tx = sh.x - arm.side * 22;
        ty = sh.y - 14;
        if (arm.punchT >= 1) {
          arm.mode = 'punch';
          arm.punchT = 0;
          arm.impactDone = false;
        }
      } else if (arm.mode === 'punch') {
        // long-range slam to the telegraphed spot
        arm.punchT = Math.min(1, arm.punchT + dt * 3.2);
        const aimX = arm.punchX;
        const aimY = arm.punchY;
        if (arm.punchT < 0.55) {
          const strike = arm.punchT / 0.55;
          // ease-out stretch — fist reaches far from boss body
          const e = 1 - Math.pow(1 - strike, 3);
          tx = sh.x + (aimX - sh.x) * e;
          ty = sh.y + (aimY - sh.y) * e;
          // impact at the danger zone (far AOE), not only fist-touch
          if (!arm.impactDone && strike > 0.72) {
            arm.impactDone = true;
            spawnHitBurst(aimX, aimY, 16, true);
            if (Math.hypot(px - aimX, py - aimY) < PUNCH_IMPACT_R + PLAYER_HIT_R) {
              hurtPlayer(now);
            }
          }
        } else {
          const ret = (arm.punchT - 0.55) / 0.45;
          tx = sh.x + (aimX - sh.x) * (1 - ret) * 0.25;
          ty = sh.y + (aimY - sh.y) * (1 - ret) * 0.25;
          if (arm.punchT >= 1) {
            arm.mode = 'idle';
            arm.punchT = 0;
            arm.fistR = 10;
            arm.impactDone = false;
          }
        }
      } else {
        tx = sh.x + (px - sh.x) * 0.35 + arm.side * 8;
        ty = sh.y + Math.min(py, sh.y + half * 1.2) * 0.15 + half * 0.35;
        arm.mode = 'idle';
      }

      if (arm.mode === 'recoil') {
        tx = sh.x + arm.side * 14;
        ty = sh.y + 20;
        arm.mode = 'idle';
      }

      const spd =
        arm.mode === 'punch' ? 22 :
        arm.mode === 'telegraph' ? 10 :
        arm.mode === 'grab' ? 14 : 9;
      arm.hx += (tx - arm.hx) * Math.min(1, dt * spd);
      arm.hy += (ty - arm.hy) * Math.min(1, dt * spd);
    }
  }

  function tick(now: number) {
    const dt = Math.min(0.033, (now - lastTs) / 1000 || 0.016);
    lastTs = now;

    if (phase === 'click') {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        lose();
        return;
      }
    }

    bossX += (bossTargetX - bossX) * Math.min(1, dt * 4.2);
    bossY += (bossTargetY - bossY) * Math.min(1, dt * 4.2);
    clampBossInBounds();
    if (phase === 'bullethell') {
      // if pinned in a corner / edge — dash to the other side
      if (bossX <= 0.22 || bossX >= 0.78) {
        const stuck =
          Math.hypot(bossTargetX - bossX, bossTargetY - bossY) < 0.04
          || Math.hypot(bossX - playerX, bossY - playerY) < 0.42;
        if (stuck) cornerDash(now);
      }
    }
    if (Math.hypot(bossTargetX - bossX, bossTargetY - bossY) < 0.02 && Math.random() < dt * 0.7) {
      pickDodge();
    }

    if (grabActive) {
      grabOX += grabVX * dt;
      grabOY += grabVY * dt;
      grabVX *= Math.pow(0.05, dt);
      grabVY *= Math.pow(0.05, dt);
      cursorX = realMX + grabOX;
      cursorY = realMY + grabOY;
      // clamp inside arena a bit
      cursorX = Math.min(w - 4, Math.max(4, cursorX));
      cursorY = Math.min(h - 4, Math.max(4, cursorY));
      realMX = cursorX;
      realMY = cursorY;
      grabOX = 0;
      grabOY = 0;
      // keep OS cursor inside the fixed playfield only
      warpOsCursor(
        arenaLeft + Math.min(w - 2, Math.max(2, cursorX)),
        arenaTop + Math.min(h - 2, Math.max(2, cursorY)),
      );
    } else {
      grabOX *= Math.pow(0.001, dt);
      grabOY *= Math.pow(0.001, dt);
      if (phase === 'click') {
        cursorX = realMX + grabOX;
        cursorY = realMY + grabOY;
      }
    }

    updateArms(dt, now);
    updateFx(dt);
    if (bossFlash && now >= bossFlashUntil) bossFlash = false;

    // opportunistic grab when a hand is near the cursor
    if (phase === 'click' && !grabActive && cursorVisible) {
      for (const arm of arms) {
        const d = Math.hypot(cursorX - arm.hx, cursorY - arm.hy);
        if (d < 28 && Math.random() < dt * 1.1) {
          startGrab(now, arm.side);
          break;
        }
      }
    }

    if (phase === 'bullethell') {
      let mx = 0;
      let my = 0;
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
      if (keys.has('d') || keys.has('arrowright')) mx += 1;
      if (keys.has('w') || keys.has('arrowup')) my -= 1;
      if (keys.has('s') || keys.has('arrowdown')) my += 1;
      if (mx || my) {
        const inv = 1 / Math.hypot(mx, my);
        playerX = Math.min(0.94, Math.max(0.06, playerX + (mx * inv * PLAYER_SPEED * dt) / w));
        playerY = Math.min(0.94, Math.max(0.08, playerY + (my * inv * PLAYER_SPEED * dt) / h));
      }

      if (now - lastPlayerShot > PLAYER_FIRE_MS) {
        lastPlayerShot = now;
        const px = playerX * w;
        const py = playerY * h;
        bullets.push({ x: px, y: py - 8, vx: 0, vy: -270, r: 2.2, friendly: true, life: 2.2 });
        bullets.push({ x: px - 5, y: py - 4, vx: -18, vy: -250, r: 1.8, friendly: true, life: 2 });
        bullets.push({ x: px + 5, y: py - 4, vx: 18, vy: -250, r: 1.8, friendly: true, life: 2 });
      }

      if (now - lastBossPattern > 560) {
        lastBossPattern = now;
        spawnBossBullets(now);
      }

      if (Math.random() < dt * 0.35) startPunch(now);

      const b = bossPx();
      const px = playerX * w;
      const py = playerY * h;
      const next: Bullet[] = [];
      for (const bl of bullets) {
        bl.x += bl.vx * dt;
        bl.y += bl.vy * dt;
        bl.life -= dt;
        if (bl.life <= 0 || bl.x < -20 || bl.y < -20 || bl.x > w + 20 || bl.y > h + 20) continue;

        if (bl.friendly) {
          // precise boss body hit (not inflated)
          if (Math.hypot(bl.x - b.x, bl.y - b.y) < BOSS_HIT_R * 0.85 + bl.r) {
            damage(BH_DMG);
            continue;
          }
        } else if (Math.hypot(bl.x - px, bl.y - py) < bl.r + PLAYER_HIT_R + BULLET_HIT_PAD) {
          hurtPlayer(now);
          continue;
        }
        next.push(bl);
      }
      bullets = next;
    }

    drawCanvas(now);
    raf = requestAnimationFrame(tick);
  }

  function drawPunchTelegraph(ctx: CanvasRenderingContext2D, arm: Arm, now: number) {
    if (arm.mode !== 'telegraph' && !(arm.mode === 'punch' && arm.punchT < 0.55)) return;
    const pulse = 0.55 + 0.45 * Math.sin(now / 70);
    const r = PUNCH_IMPACT_R;
    const x = Math.round(arm.punchX);
    const y = Math.round(arm.punchY);
    ctx.save();
    ctx.globalAlpha = arm.mode === 'telegraph' ? 0.35 + 0.35 * pulse : 0.55;
    ctx.strokeStyle = '#ff4040';
    ctx.fillStyle = 'rgba(255, 32, 32, 0.18)';
    ctx.lineWidth = 2;
    // pixel danger square
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.strokeRect(x - r, y - r, r * 2, r * 2);
    // crosshair
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, y - r, 2, r * 2);
    ctx.fillRect(x - r, y - 1, r * 2, 2);
    ctx.fillStyle = '#ff2020';
    ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.restore();
  }

  function drawPixelArm(ctx: CanvasRenderingContext2D, arm: Arm) {
    const sh = shoulderOf(arm.side);
    const joints = ARM_SEGMENTS;
    ctx.fillStyle =
      arm.mode === 'punch' || arm.mode === 'telegraph' ? '#ff6060' :
      arm.mode === 'grab' ? '#ffffff' : '#ff3030';
    for (let i = 0; i <= joints; i++) {
      const t = i / joints;
      const midX = (sh.x + arm.hx) / 2 + arm.side * (1 - Math.abs(t - 0.5) * 2) * -14;
      const midY = (sh.y + arm.hy) / 2 + 16;
      const omt = 1 - t;
      const x = omt * omt * sh.x + 2 * omt * t * midX + t * t * arm.hx;
      const y = omt * omt * sh.y + 2 * omt * t * midY + t * t * arm.hy;
      const s = i === joints ? (arm.mode === 'punch' ? 9 : 6) : 3;
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    }
    const fr = arm.mode === 'punch' ? arm.fistR : arm.mode === 'telegraph' ? 8 : 5;
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(arm.hx - 2), Math.round(arm.hy - fr / 2), 2, fr);
    ctx.fillRect(Math.round(arm.hx + 1), Math.round(arm.hy - fr / 2), 2, fr);
    ctx.fillStyle = '#ff2020';
    ctx.fillRect(Math.round(arm.hx - fr / 2), Math.round(arm.hy - fr / 2), fr, fr);
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(arm.hx - 1), Math.round(arm.hy - 1), 2, 2);
  }

  function drawCanvas(now: number) {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    for (const arm of arms) {
      drawPunchTelegraph(ctx, arm, now);
      drawPixelArm(ctx, arm);
    }

    if (phase === 'bullethell') {
      const px = playerX * w;
      const py = playerY * h;
      const flash = now < invulnUntil && Math.floor(now / 80) % 2 === 0;

      if (!flash) {
        // ship body (visual only — hitbox is the point)
        ctx.fillStyle = '#c8c8c8';
        ctx.fillRect(px - 1, py - 8, 2, 4);
        ctx.fillRect(px - 3, py - 4, 6, 2);
        ctx.fillRect(px - 5, py - 2, 10, 2);
        ctx.fillRect(px - 6, py, 4, 2);
        ctx.fillRect(px + 2, py, 4, 2);
      }

      // true hitbox point (always visible like Touhou)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(px - 1), Math.round(py - 1), 2, 2);
      ctx.fillStyle = '#ff4040';
      ctx.fillRect(Math.round(px), Math.round(py), 1, 1);

      for (const bl of bullets) {
        ctx.fillStyle = bl.friendly ? '#7cf0ff' : bl.fromHand ? '#ffb040' : '#ff4040';
        const s = Math.max(2, Math.floor(bl.r * 2));
        ctx.fillRect(Math.round(bl.x - s / 2), Math.round(bl.y - s / 2), s, s);
      }
    } else if (cursorVisible) {
      // slash trail hint
      ctx.strokeStyle = grabActive ? '#ffffff' : 'rgba(255,80,80,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(prevCX, prevCY);
      ctx.lineTo(cursorX, cursorY);
      ctx.stroke();
    }

    drawFx(ctx);
  }

  onMount(() => {
    measure();
    fightStartedAt = performance.now();
    nextLine('Эй! Не режь!');
    lineCursor = 1;
    pickDodge();
    const b = bossPx();
    for (const arm of arms) {
      arm.hx = b.x + arm.side * 40;
      arm.hy = b.y + 40;
    }
    lastTs = performance.now();
    raf = requestAnimationFrame(tick);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', kd, true);
    window.addEventListener('keyup', ku, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
    };
  });

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    if (typeTimer) clearTimeout(typeTimer);
  });
</script>

<div
  class="arena"
  class:arena--bh={phase === 'bullethell'}
  bind:this={arenaEl}
  role="application"
  aria-label="Босс-пасхалка"
  onpointermove={onPointerMove}
  onpointerdown={onPointerMove}
>
  <canvas class="arena__fx" bind:this={canvasEl} aria-hidden="true"></canvas>

  <div class="arena__hud">
    <div class="arena__hp" style={`--hp:${hpPct.toFixed(2)}%;`} role="meter" aria-valuenow={Math.round(hp)} aria-valuemin={0} aria-valuemax={HP_MAX}>
      <span class="arena__hp-fill"></span>
      <span class="arena__hp-lab">BOSS HP</span>
    </div>
    {#if phase === 'click'}
      <div class="arena__timer">
        <span class="arena__timer-lab">SEC</span>
        <span class="arena__timer-val">{timerLabel}</span>
      </div>
    {:else}
      <div class="arena__lives" aria-label={`Жизни: ${lives}`}>
        <span class="arena__lives-lab">LIFE</span>
        <span class="arena__lives-val">
          {#each Array(LIVES_MAX) as _, i}
            <i class="arena__pip" class:arena__pip--on={i < lives}></i>
          {/each}
        </span>
      </div>
    {/if}
  </div>

  {#if dialogOpen}
    <div class="arena__dialog" role="status">
      <span>{dialogTyped}<span class="arena__caret">▌</span></span>
    </div>
  {/if}

  <div
    class="arena__boss"
    class:arena__boss--bh={phase === 'bullethell'}
    class:arena__boss--hit={bossFlash}
    style={`left:${bossX * 100}%;top:${bossY * 100}%;`}
    aria-hidden="true"
  >
    <svg class="arena__boss-svg" viewBox="0 0 136 135" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="136" height="135" fill="#FF2020" />
      <path d={glyph} fill="#ffffff" />
    </svg>
  </div>

  {#if phase === 'click' && cursorVisible}
    <div
      class="arena__cursor"
      class:arena__cursor--grab={grabActive}
      style={`left:${cursorX}px;top:${cursorY}px;`}
      aria-hidden="true"
    ></div>
  {/if}

  {#if phase === 'bullethell'}
    <p class="arena__hint">WASD · точка = хитбокс · ESC — выход</p>
  {:else}
    <p class="arena__hint">Режь босса курсором · ESC — выход</p>
  {/if}
</div>

<style>
  .arena {
    position: relative;
    width: 100%;
    height: 100%;
    margin: 0;
    border: 0;
    border-radius: 0;
    background: #000;
    overflow: hidden;
    cursor: none;
    touch-action: none;
    user-select: none;
    image-rendering: pixelated;
    filter: none;
    box-shadow: none;
    contain: layout paint;
  }

  .arena::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      repeating-linear-gradient(
        to bottom,
        transparent 0,
        transparent 3px,
        rgba(255, 255, 255, 0.045) 3px,
        rgba(255, 255, 255, 0.045) 4px
      ),
      radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.55) 100%);
    z-index: 1;
  }

  .arena::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 0 2px #1a1a1a;
    z-index: 9;
  }

  .arena--bh {
    cursor: none;
  }

  .arena__fx {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    image-rendering: pixelated;
    z-index: 2;
  }

  .arena__hud {
    position: absolute;
    left: 12px;
    right: 12px;
    top: 12px;
    z-index: 5;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: stretch;
    pointer-events: none;
  }

  .arena__hp {
    position: relative;
    height: 14px;
    border: 2px solid #ff2020;
    border-radius: 0;
    background: #100000;
    overflow: hidden;
  }

  .arena__hp-fill {
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--hp, 100%);
    background: #ff2020;
    transition: width 0.08s linear;
  }

  .arena__hp-lab {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-family: 'Courier New', Courier, monospace;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.14em;
    color: #fff;
  }

  .arena__timer,
  .arena__lives {
    min-width: 52px;
    padding: 2px 6px;
    border: 2px solid #ff2020;
    border-radius: 0;
    background: #100000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .arena__timer-lab,
  .arena__lives-lab {
    font-family: 'Courier New', Courier, monospace;
    font-size: 8px;
    font-weight: 700;
    color: #888;
    letter-spacing: 0.1em;
  }

  .arena__timer-val {
    font-family: 'Courier New', Courier, monospace;
    font-size: 16px;
    font-weight: 800;
    color: #ff4040;
    line-height: 1;
  }

  .arena__lives-val {
    display: flex;
    gap: 3px;
    margin-top: 1px;
  }

  .arena__pip {
    display: block;
    width: 8px;
    height: 8px;
    background: #301010;
    border: 1px solid #662020;
  }

  .arena__pip--on {
    background: #ff3030;
    border-color: #fff;
  }

  .arena__dialog {
    position: absolute;
    left: 50%;
    top: 44px;
    transform: translateX(-50%);
    z-index: 6;
    max-width: min(420px, 86%);
    padding: 8px 10px;
    border: 2px solid #ff2020;
    border-radius: 0;
    background: #100000;
    font-family: 'Courier New', Courier, monospace;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    line-height: 1.35;
    pointer-events: none;
  }

  .arena__caret {
    color: #ff4040;
    animation: arena-caret 0.7s steps(1) infinite;
  }

  .arena__boss {
    position: absolute;
    width: 72px;
    height: 72px;
    margin: 0;
    padding: 0;
    border: 2px solid #fff;
    border-radius: 0;
    background: #ff2020;
    transform: translate(-50%, -50%);
    z-index: 3;
    pointer-events: none;
    image-rendering: pixelated;
  }

  .arena__boss--bh {
    width: 56px;
    height: 56px;
  }

  .arena__boss--hit {
    filter: brightness(1.85) contrast(1.15);
    border-color: #fff;
  }

  .arena__boss-svg {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .arena__cursor {
    position: absolute;
    width: 10px;
    height: 10px;
    margin: -1px 0 0 -1px;
    border: 2px solid #fff;
    background: #ff2020;
    border-radius: 0;
    pointer-events: none;
    z-index: 8;
    image-rendering: pixelated;
  }

  .arena__cursor--grab {
    background: #fff;
    border-color: #ff2020;
    width: 12px;
    height: 12px;
  }

  .arena__hint {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 10px;
    margin: 0;
    text-align: center;
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #777;
    pointer-events: none;
    z-index: 4;
  }

  @keyframes arena-caret {
    0%,
    49% {
      opacity: 1;
    }
    50%,
    100% {
      opacity: 0;
    }
  }
</style>
