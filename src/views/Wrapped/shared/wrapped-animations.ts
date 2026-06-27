import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function createGsapContext(scope: Element | null, fn: () => void) {
  if (!scope) return { revert: () => {} };
  return gsap.context(fn, scope);
}

export function animateBannerEnter(root: HTMLElement, reduced: boolean) {
  const tl = gsap.timeline();
  if (reduced) {
    tl.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.15 });
    return tl;
  }
  tl.fromTo(
    root,
    { clipPath: 'inset(0 100% 0 0)', opacity: 0.6 },
    { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: 0.85, ease: 'power3.out' },
  );
  const chars = root.querySelectorAll('.year-wrapped-banner__char');
  if (chars.length) {
    tl.from(
      chars,
      { y: 12, opacity: 0, stagger: 0.025, duration: 0.45, ease: 'back.out(1.4)' },
      '-=0.35',
    );
  }
  const chips = root.querySelectorAll('.year-wrapped-banner__chip');
  if (chips.length) {
    tl.from(
      chips,
      { y: 8, opacity: 0, scale: 0.85, stagger: 0.08, duration: 0.5, ease: 'power2.out' },
      '-=0.25',
    );
  }
  return tl;
}

export function animateBannerLoop(root: HTMLElement, reduced: boolean) {
  if (reduced) return null;
  const glow = root.querySelector('.year-wrapped-banner__glow');
  const chips = root.querySelectorAll('.year-wrapped-banner__chip');
  const tl = gsap.timeline({ repeat: -1, defaults: { ease: 'sine.inOut' } });
  if (glow) {
    tl.to(glow, { opacity: 0.55, duration: 2.4 }, 0);
    tl.to(glow, { opacity: 0.25, duration: 2.4 }, 2.4);
  }
  chips.forEach((chip, i) => {
    tl.to(
      chip,
      { y: i % 2 === 0 ? -4 : 4, duration: 2.2 + i * 0.15, yoyo: true, repeat: 1 },
      i * 0.2,
    );
  });
  const grad = root.querySelector('.year-wrapped-banner__gradient');
  if (grad) {
    gsap.to(grad, {
      backgroundPosition: '200% 50%',
      duration: 8,
      repeat: -1,
      ease: 'none',
    });
  }
  return tl;
}

export function animateScreenExit(el: HTMLElement, direction: 'next' | 'prev', reduced: boolean) {
  const x = direction === 'next' ? -32 : 32;
  return gsap.to(el, {
    opacity: 0,
    x,
    scale: 0.98,
    duration: reduced ? 0.12 : 0.42,
    ease: 'power2.inOut',
  });
}

export function animateScreenEnter(el: HTMLElement, direction: 'next' | 'prev', reduced: boolean) {
  const fromX = direction === 'next' ? 36 : -36;
  gsap.set(el, {
    opacity: 0,
    x: fromX,
    scale: 0.98,
    pointerEvents: 'auto',
  });
  return gsap.to(el, {
    opacity: 1,
    x: 0,
    scale: 1,
    duration: reduced ? 0.15 : 0.52,
    ease: 'power3.out',
  });
}

/** Одновременный crossfade двух экранов — без моргания между unmount/mount */
export function crossfadeScreens(
  outEl: HTMLElement | null,
  inEl: HTMLElement | null,
  direction: 'next' | 'prev',
  reduced: boolean,
): Promise<void> {
  if (reduced) {
    if (outEl) gsap.set(outEl, { opacity: 0, pointerEvents: 'none' });
    if (inEl) gsap.set(inEl, { opacity: 1, x: 0, scale: 1, pointerEvents: 'auto' });
    return Promise.resolve();
  }

  const outX = direction === 'next' ? -40 : 40;
  const inX = direction === 'next' ? 44 : -44;

  if (inEl) {
    gsap.set(inEl, { opacity: 0, x: inX, scale: 0.97, pointerEvents: 'none', zIndex: 2 });
  }
  if (outEl) {
    gsap.set(outEl, { pointerEvents: 'none', zIndex: 1 });
  }

  return new Promise((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });
    if (outEl) {
      tl.to(outEl, { opacity: 0, x: outX, scale: 0.97, duration: 0.38, ease: 'power2.in' }, 0);
    }
    if (inEl) {
      tl.to(inEl, { opacity: 1, x: 0, scale: 1, duration: 0.48, ease: 'power3.out' }, 0.06);
      tl.set(inEl, { pointerEvents: 'auto' });
    }
    if (outEl) {
      tl.set(outEl, { visibility: 'hidden' });
    }
  });
}

export function prepareScreenForEnter(el: HTMLElement | null) {
  if (!el) return;
  gsap.set(el, { opacity: 1, x: 0, scale: 1, visibility: 'visible', pointerEvents: 'auto', zIndex: 1 });
}

/** Скрывает контент до GSAP-анимации — убирает «моргание» после crossfade */
export function resetScreenContentForEnter(layer: HTMLElement | null) {
  if (!layer) return;
  const items = layer.querySelectorAll('[data-wrapped-animate]');
  gsap.set(items, { opacity: 0, y: 24 });
  const stats = layer.querySelectorAll('[data-stat-value]');
  gsap.set(stats, { autoAlpha: 0 });
  const fills = layer.querySelectorAll('.wrapped-pref-bar__fill, [data-bar-fill]');
  gsap.set(fills, { scaleX: 0, transformOrigin: 'left center' });
}

export function animateScreenContent(container: HTMLElement, reduced: boolean) {
  const items = container.querySelectorAll('[data-wrapped-animate]');
  if (!items.length) return gsap.timeline();
  if (reduced) {
    gsap.set(items, { opacity: 1, y: 0 });
    gsap.set(container.querySelectorAll('[data-stat-value]'), { opacity: 1 });
    return gsap.timeline();
  }
  const tl = gsap.timeline();
  tl.fromTo(
    items,
    { y: 24, opacity: 0 },
    { y: 0, opacity: 1, stagger: 0.07, duration: 0.5, ease: 'power2.out' },
  );
  tl.set(container.querySelectorAll('[data-stat-value]'), { opacity: 1 }, 0);
  return tl;
}

export function animateCounter(
  el: HTMLElement,
  target: number,
  reduced: boolean,
  duration = 1.8,
) {
  if (reduced) {
    el.textContent = String(Math.round(target));
    return gsap.timeline();
  }
  const obj = { val: 0 };
  return gsap.to(obj, {
    val: target,
    duration,
    ease: 'power2.out',
    onUpdate: () => {
      el.textContent = String(Math.round(obj.val));
    },
  });
}

export function setupPosterParallax(
  layer: HTMLElement,
  scope: HTMLElement,
  reduced: boolean,
): (() => void) | null {
  if (reduced || typeof window === 'undefined') return null;
  const onMove = (e: MouseEvent) => {
    const rect = scope.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    gsap.to(layer, { x: nx * 18, y: ny * 12, duration: 0.6, ease: 'power2.out' });
  };
  scope.addEventListener('mousemove', onMove);
  return () => scope.removeEventListener('mousemove', onMove);
}

export function animateProgressBar(segments: HTMLElement[], index: number, reduced: boolean) {
  segments.forEach((seg, i) => {
    const active = i <= index;
    const current = i === index;
    gsap.to(seg, {
      scale: active ? (current ? 1.25 : 1) : 0.85,
      opacity: active ? 1 : 0.35,
      backgroundColor: active ? 'var(--wrapped-dot-active, #e35454)' : 'var(--wrapped-dot-idle, rgba(143,143,143,0.45))',
      duration: reduced ? 0.1 : 0.35,
      ease: 'power2.out',
    });
  });
}

export function animateStatValues(container: HTMLElement, reduced: boolean) {
  const nodes = container.querySelectorAll('[data-stat-value]');
  if (!nodes.length) return gsap.timeline();
  if (reduced) {
    gsap.set(nodes, { autoAlpha: 1 });
    return gsap.timeline();
  }
  const tl = gsap.timeline();
  // hideRewindLayer ставит autoAlpha:0 — нужен autoAlpha, не только opacity
  tl.set(nodes, { autoAlpha: 1 });
  nodes.forEach((node, i) => {
    const el = node as HTMLElement;
    const target = Number(el.getAttribute('data-stat-value') ?? el.textContent?.replace(/\s/g, '') ?? 0);
    const obj = { val: 0 };
    tl.to(
      obj,
      {
        val: target,
        duration: 1.2,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = Math.round(obj.val).toLocaleString('ru-RU');
        },
      },
      i * 0.06,
    );
  });
  return tl;
}

/**
 * Скролл-реврил: контент каждой секции появляется при входе в вьюпорт и
 * скрывается при выходе (в обе стороны). Возвращает cleanup.
 */
export function setupScrollReveal(
  scroller: HTMLElement,
  sections: HTMLElement[],
  reduced: boolean,
  onActive: (index: number) => void,
): () => void {
  const triggers: ScrollTrigger[] = [];

  const revealSection = (section: HTMLElement, animate: boolean) => {
    const inner = section.querySelector('.wrapped-screen__inner');
    const items = (inner ?? section).querySelectorAll('[data-wrapped-animate]');
    const fills = section.querySelectorAll('.wrapped-pref-bar__fill, [data-bar-fill]');
    const stats = section.querySelectorAll('[data-stat-value]');

    if (reduced || !animate) {
      gsap.set(items, { opacity: 1, y: 0 });
      gsap.set(fills, { scaleX: 1, transformOrigin: 'left center' });
      gsap.set(stats, { opacity: 1 });
      return;
    }
    gsap.to(items, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      stagger: 0.08,
      ease: 'power3.out',
      overwrite: 'auto',
    });
    if (fills.length) {
      gsap.to(fills, {
        scaleX: 1,
        transformOrigin: 'left center',
        duration: 0.9,
        stagger: 0.06,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    }
    if (stats.length) animateStatValues(section, false);
  };

  const hideSection = (section: HTMLElement) => {
    if (reduced) return;
    const inner = section.querySelector('.wrapped-screen__inner');
    const items = (inner ?? section).querySelectorAll('[data-wrapped-animate]');
    const fills = section.querySelectorAll('.wrapped-pref-bar__fill, [data-bar-fill]');
    gsap.to(items, { opacity: 0, y: 48, duration: 0.35, overwrite: 'auto' });
    gsap.set(fills, { scaleX: 0, transformOrigin: 'left center' });
  };

  const scRect = scroller.getBoundingClientRect();

  sections.forEach((section, index) => {
    const rect = section.getBoundingClientRect();
    const initiallyInView = rect.top < scRect.top + scRect.height * 0.7;

    // initial state
    if (!reduced && !initiallyInView) {
      const inner = section.querySelector('.wrapped-screen__inner');
      const items = (inner ?? section).querySelectorAll('[data-wrapped-animate]');
      const fills = section.querySelectorAll('.wrapped-pref-bar__fill, [data-bar-fill]');
      const stats = section.querySelectorAll('[data-stat-value]');
      gsap.set(items, { opacity: 0, y: 48 });
      gsap.set(fills, { scaleX: 0, transformOrigin: 'left center' });
      gsap.set(stats, { opacity: 0 });
    } else {
      revealSection(section, false);
    }

    triggers.push(
      ScrollTrigger.create({
        trigger: section,
        scroller,
        start: 'top 72%',
        end: 'bottom 28%',
        onEnter: () => revealSection(section, true),
        onEnterBack: () => revealSection(section, true),
        onLeave: () => hideSection(section),
        onLeaveBack: () => hideSection(section),
      }),
    );

    triggers.push(
      ScrollTrigger.create({
        trigger: section,
        scroller,
        start: 'top center',
        end: 'bottom center',
        onToggle: (self) => {
          if (self.isActive) onActive(index);
        },
      }),
    );

    // parallax: фоновое слово плывёт при скролле — ощущение глубины (фигуры — отдельным сквозным слоем)
    if (!reduced) {
      const word = section.querySelector('.wrapped-screen__word');
      if (word) {
        const t = gsap.fromTo(
          word,
          { yPercent: -20 },
          {
            yPercent: 20,
            ease: 'none',
            scrollTrigger: { trigger: section, scroller, start: 'top bottom', end: 'bottom top', scrub: true },
          },
        );
        if (t.scrollTrigger) triggers.push(t.scrollTrigger);
      }
    }
  });

  ScrollTrigger.refresh();
  return () => triggers.forEach((t) => t.kill());
}

export function refreshScrollTriggers() {
  ScrollTrigger.refresh();
}

/**
 * Reveal сцены Rewind: вуаль входа (цвет предыдущей сцены) уезжает вверх,
 * hero-фигура «впрыгивает» с поворотом, контент проявляется лесенкой,
 * числа набегают. Возвращает cleanup.
 */
export function setupRewindReveal(
  scroller: HTMLElement,
  sections: HTMLElement[],
  reduced: boolean,
  onActive: (index: number) => void,
): () => void {
  const triggers: ScrollTrigger[] = [];

  const partsOf = (section: HTMLElement) => ({
    veil: section.querySelector('[data-rw-veil]') as HTMLElement | null,
    shape: section.querySelector('[data-rw-shape]') as HTMLElement | null,
    logo: section.querySelector('[data-rw-logo]') as HTMLElement | null,
    items: section.querySelectorAll('[data-wrapped-animate]'),
    stats: section.querySelectorAll('[data-stat-value]'),
    decor: section.querySelectorAll('[data-decor]'),
  });

  const setHidden = (section: HTMLElement) => {
    const { veil, shape, logo, items, stats, decor } = partsOf(section);
    if (veil) gsap.set(veil, { scaleY: 1, transformOrigin: 'top center', autoAlpha: 1 });
    if (shape) gsap.set(shape, { scale: 0.62, rotate: -12, autoAlpha: 0 });
    if (logo) gsap.set(logo, { autoAlpha: 0, y: -10 });
    gsap.set(items, { autoAlpha: 0, y: 30 });
    gsap.set(stats, { autoAlpha: 0 });
    gsap.set(decor, { scale: 0.5, autoAlpha: 0 });
  };

  const reveal = (section: HTMLElement, animate: boolean) => {
    const { veil, shape, logo, items, stats, decor } = partsOf(section);
    if (reduced || !animate) {
      if (veil) gsap.set(veil, { scaleY: 0, autoAlpha: 0 });
      if (shape) gsap.set(shape, { scale: 1, rotate: 0, autoAlpha: 1 });
      if (logo) gsap.set(logo, { autoAlpha: 1, y: 0 });
      gsap.set(items, { autoAlpha: 1, y: 0 });
      gsap.set(stats, { autoAlpha: 1 });
      gsap.set(decor, { scale: 1, autoAlpha: 1 });
      if (stats.length) animateStatValues(section, true);
      return;
    }
    const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });
    if (veil) {
      tl.to(veil, { scaleY: 0, duration: 0.7, ease: 'power4.inOut' }, 0);
      tl.set(veil, { autoAlpha: 0 });
    }
    if (logo) tl.to(logo, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0.15);
    if (decor.length) {
      tl.to(decor, { scale: 1, autoAlpha: 1, duration: 0.7, stagger: 0.1, ease: 'back.out(1.6)' }, 0.2);
    }
    if (shape) {
      tl.fromTo(
        shape,
        { scale: 0.62, rotate: -12, autoAlpha: 0 },
        { scale: 1, rotate: 0, autoAlpha: 1, duration: 0.95, ease: 'back.out(1.5)' },
        0.18,
      );
    }
    if (items.length) {
      tl.to(items, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.07, ease: 'power3.out' }, 0.34);
    }
    if (stats.length) {
      tl.add(() => animateStatValues(section, false), 0.5);
    }
  };

  const hide = (section: HTMLElement) => {
    if (reduced) return;
    const { veil, items } = partsOf(section);
    gsap.to(items, { autoAlpha: 0, y: 30, duration: 0.3, overwrite: 'auto' });
    if (veil) gsap.set(veil, { scaleY: 1, autoAlpha: 1, transformOrigin: 'top center' });
  };

  const scRect = scroller.getBoundingClientRect();

  sections.forEach((section, index) => {
    // Цвет вуали входа = hero-цвет предыдущей сцены (carry color)
    const veil = section.querySelector('[data-rw-veil]') as HTMLElement | null;
    if (veil && index > 0) {
      const prevHero = getComputedStyle(sections[index - 1]).getPropertyValue('--rw-hero').trim();
      if (prevHero) veil.style.background = prevHero;
    }

    const rect = section.getBoundingClientRect();
    const initiallyInView = rect.top < scRect.top + scRect.height * 0.7;
    if (reduced) {
      reveal(section, false);
    } else if (initiallyInView) {
      setHidden(section);
      // первый видимый экран проигрывает вступление с лёгкой задержкой
      gsap.delayedCall(0.15, () => reveal(section, true));
    } else {
      setHidden(section);
    }

    triggers.push(
      ScrollTrigger.create({
        trigger: section,
        scroller,
        start: 'top 72%',
        end: 'bottom 28%',
        onEnter: () => reveal(section, true),
        onEnterBack: () => reveal(section, true),
        onLeave: () => hide(section),
        onLeaveBack: () => hide(section),
      }),
    );

    triggers.push(
      ScrollTrigger.create({
        trigger: section,
        scroller,
        start: 'top center',
        end: 'bottom center',
        onToggle: (self) => {
          if (self.isActive) onActive(index);
        },
      }),
    );
  });

  ScrollTrigger.refresh();
  return () => triggers.forEach((t) => t.kill());
}

function rewindParts(section: HTMLElement) {
  return {
    veil: section.querySelector('[data-rw-veil]') as HTMLElement | null,
    shape: section.querySelector('[data-rw-shape]') as HTMLElement | null,
    logo: section.querySelector('[data-rw-logo]') as HTMLElement | null,
    items: section.querySelectorAll('[data-wrapped-animate]'),
    stats: section.querySelectorAll('[data-stat-value]'),
    decor: section.querySelectorAll('[data-decor]'),
  };
}

function heroColorOf(section: HTMLElement): string {
  return getComputedStyle(section).getPropertyValue('--rw-hero').trim();
}

/** Скрыть слой до перехода */
export function hideRewindLayer(section: HTMLElement | null) {
  if (!section) return;
  gsap.set(section, { autoAlpha: 0, visibility: 'hidden', pointerEvents: 'none', zIndex: 0 });
  const { veil, shape, logo, items, stats, decor } = rewindParts(section);
  if (veil) gsap.set(veil, { scaleY: 1, transformOrigin: 'top center', autoAlpha: 1 });
  if (shape) gsap.set(shape, { scale: 0.55, rotate: -14, autoAlpha: 0 });
  if (logo) gsap.set(logo, { autoAlpha: 0, y: -8 });
  gsap.set(items, { autoAlpha: 0, y: 28 });
  gsap.set(stats, { autoAlpha: 0 });
  gsap.set(decor, { scale: 0.45, autoAlpha: 0 });
}

/** Первый показ сцены: вуаль цвета предыдущей hero-фигуры уезжает, фигура «впрыгивает». */
export function revealRewindLayer(
  section: HTMLElement,
  carryColor: string,
  reduced: boolean,
): Promise<void> {
  const { veil, shape, logo, items, stats, decor } = rewindParts(section);
  gsap.set(section, { autoAlpha: 1, visibility: 'visible', pointerEvents: 'auto', zIndex: 2 });

  if (reduced) {
    if (veil) gsap.set(veil, { scaleY: 0, autoAlpha: 0 });
    if (shape) gsap.set(shape, { scale: 1, rotate: 0, autoAlpha: 1 });
    if (logo) gsap.set(logo, { autoAlpha: 1, y: 0 });
    gsap.set(items, { autoAlpha: 1, y: 0 });
    gsap.set(stats, { autoAlpha: 1 });
    gsap.set(decor, { scale: 1, autoAlpha: 1 });
    if (stats.length) animateStatValues(section, true);
    return Promise.resolve();
  }

  if (veil && carryColor) veil.style.background = carryColor;

  return new Promise((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });
    if (veil) {
      tl.fromTo(veil, { scaleY: 1, autoAlpha: 1 }, { scaleY: 0, duration: 0.72, ease: 'power4.inOut' }, 0);
      tl.set(veil, { autoAlpha: 0 });
    }
    if (logo) tl.fromTo(logo, { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 0.12);
    if (decor.length) {
      tl.fromTo(
        decor,
        { scale: 0.45, autoAlpha: 0 },
        { scale: 1, autoAlpha: 1, duration: 0.65, stagger: 0.08, ease: 'back.out(1.55)' },
        0.18,
      );
    }
    if (shape) {
      tl.fromTo(
        shape,
        { scale: 0.55, rotate: -14, autoAlpha: 0 },
        { scale: 1, rotate: 0, autoAlpha: 1, duration: 0.88, ease: 'back.out(1.45)' },
        0.14,
      );
    }
    if (items.length) {
      tl.fromTo(items, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.06, ease: 'power3.out' }, 0.32);
    }
    if (stats.length) tl.add(() => animateStatValues(section, false), 0.48);
  });
}

/** Смена под-кадра внутри одной сцены (например, stat в «Ритм 2026»). */
export function swapRewindContent(
  outSection: HTMLElement,
  inSection: HTMLElement,
  reduced: boolean,
): Promise<void> {
  const outItems = outSection.querySelectorAll('[data-wrapped-animate]');
  const inParts = rewindParts(inSection);

  gsap.set(inSection, { autoAlpha: 1, visibility: 'visible', pointerEvents: 'auto', zIndex: 2 });
  gsap.set(outSection, { zIndex: 1 });
  if (inParts.shape) gsap.set(inParts.shape, { scale: 1, rotate: 0, autoAlpha: 1 });
  if (inParts.logo) gsap.set(inParts.logo, { autoAlpha: 1, y: 0 });
  gsap.set(inParts.decor, { scale: 1, autoAlpha: 1 });

  if (reduced) {
    gsap.set(outSection, { autoAlpha: 0, visibility: 'hidden', pointerEvents: 'none' });
    gsap.set(inParts.items, { autoAlpha: 1, y: 0 });
    gsap.set(inParts.stats, { autoAlpha: 1 });
    if (inParts.stats.length) animateStatValues(inSection, true);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(outSection, { autoAlpha: 0, visibility: 'hidden', pointerEvents: 'none' });
        resolve();
      },
    });
    tl.to(outItems, { autoAlpha: 0, y: -22, duration: 0.28, ease: 'power2.in' }, 0);
    gsap.set(inParts.items, { autoAlpha: 0, y: 26 });
    gsap.set(inParts.stats, { autoAlpha: 0 });
    tl.to(inParts.items, { autoAlpha: 1, y: 0, duration: 0.48, stagger: 0.05, ease: 'power3.out' }, 0.22);
    if (inParts.stats.length) tl.add(() => animateStatValues(inSection, false), 0.38);
  });
}

/**
 * Переход между разными сценами: hero-фигура разрастается в заливку цвета,
 * следующая сцена входит с этой вуалью (carry color).
 */
export function transitionRewindScenes(
  outSection: HTMLElement,
  inSection: HTMLElement,
  reduced: boolean,
): Promise<void> {
  const carry = heroColorOf(outSection);
  const outParts = rewindParts(outSection);
  hideRewindLayer(inSection);
  if (inSection.querySelector('[data-rw-veil]') && carry) {
    (inSection.querySelector('[data-rw-veil]') as HTMLElement).style.background = carry;
  }

  if (reduced) {
    gsap.set(outSection, { autoAlpha: 0, visibility: 'hidden', pointerEvents: 'none' });
    return revealRewindLayer(inSection, carry, true);
  }

  return new Promise((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(outSection, { autoAlpha: 0, visibility: 'hidden', pointerEvents: 'none', zIndex: 0 });
        if (outParts.shape) gsap.set(outParts.shape, { scale: 1, rotate: 0 });
        revealRewindLayer(inSection, carry, false).then(resolve);
      },
    });
    tl.to(outParts.items, { autoAlpha: 0, y: -18, duration: 0.3, ease: 'power2.in' }, 0);
    if (outParts.logo) tl.to(outParts.logo, { autoAlpha: 0, y: -10, duration: 0.25 }, 0);
    if (outParts.shape) {
      tl.to(
        outParts.shape,
        { scale: 2.6, rotate: 18, duration: 0.62, ease: 'power3.in' },
        0.08,
      );
    }
    tl.to(outSection, { autoAlpha: 0, duration: 0.18 }, 0.5);
  });
}

/** Параллакс сквозного слоя фигур: каждая дрейфует со своей скоростью при скролле. */
export function setupShapesParallax(
  scroller: HTMLElement,
  shapes: HTMLElement[],
  reduced: boolean,
): () => void {
  if (reduced || !shapes.length) return () => {};
  const triggers: ScrollTrigger[] = [];
  shapes.forEach((el) => {
    const speed = Number(el.dataset.speed || 0.1);
    const tween = gsap.to(el, {
      y: () => -scroller.scrollHeight * speed * 0.12,
      ease: 'none',
      scrollTrigger: {
        scroller,
        trigger: scroller,
        start: 0,
        end: 'max',
        scrub: 1,
        invalidateOnRefresh: true,
      },
    });
    if (tween.scrollTrigger) triggers.push(tween.scrollTrigger);
  });
  return () => triggers.forEach((t) => t.kill());
}

export function killScrollTriggers(scope?: Element | null) {
  if (!scope) {
    ScrollTrigger.getAll().forEach((t) => t.kill());
    return;
  }
  ScrollTrigger.getAll().forEach((t) => {
    if (scope.contains(t.trigger as Node)) t.kill();
  });
}
