/**
 * Окно-баннер — те же карточки UIKit V2 (`.uiv2-notif-toast`), что в превью.
 */

export interface NotificationBannerItem {
  id: string;
  title: string;
  body: string;
  image?: string;
  kind?: string;
  url?: { type: string; id: number } | null;
  time?: number;
  style?: string;
  position?: string;
}

interface NotificationBannerBridge {
  ready: () => void;
  onUpdate: (
    cb: (items: NotificationBannerItem[], meta?: { position?: string; style?: string }) => void,
  ) => () => void;
  dismiss: (id: string) => void;
  pause?: (id: string) => void;
  resume?: (id: string) => void;
  click: (payload: { id: string; url?: { type: string; id: number } | null }) => void;
  setHeight: (height: number) => void;
  setIgnoreMouse?: (ignore: boolean) => void;
}

declare global {
  interface Window {
    notificationBanner?: NotificationBannerBridge;
  }
}

/* Запас сверху: иначе setBounds после measure дёргает нижние углы */
const STYLE_HEIGHT: Record<string, number> = {
  full: 300,
  compact: 72,
  minimal: 72,
};
const ITEM_GAP = 10;
const STACK_PADDING = 0;
const LEAVE_MS = 360;
const MOVE_MS = 400;

const KIND_CLASS: Record<string, string> = {
  episode: 'episode',
  article: 'article',
  related: 'related',
  release: 'related',
  friend: 'friend',
  'friend-accept': 'friend-accept',
  comment: 'comment',
  achievement: 'achievement',
  badge: 'achievement',
  test: 'default',
  default: 'default',
};

function normalizeStyle(style?: string | null): string {
  if (style === 'full' || style === 'compact' || style === 'minimal') return style;
  if (style === 'rich') return 'compact';
  return 'compact';
}

function toPlainText(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
}

function toSafeBodyHtml(raw: string): string {
  if (!raw) return '';
  const plain = toPlainText(raw);
  if (!plain) return '';
  return plain
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/«([^»]+)»/g, '<b>«$1»</b>');
}

function positionClass(pos?: string): string {
  switch (pos) {
    case 'top-left': return 'nb-stack--tl';
    case 'top-right': return 'nb-stack--tr';
    case 'bottom-left': return 'nb-stack--bl';
    case 'bottom-right':
    default: return 'nb-stack--br';
  }
}

function formatTime(ts?: number): string {
  if (!ts) return 'только что';
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 12) return `${h} ч назад`;
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function kindKey(kind?: string): string {
  return KIND_CLASS[kind || 'default'] || 'default';
}

function fullLayout(kind: string): 'media' | 'social' | 'badge' {
  if (kind === 'episode' || kind === 'related') return 'media';
  if (kind === 'achievement') return 'badge';
  return 'social';
}

function visualOrder(
  items: NotificationBannerItem[],
  position: string,
): NotificationBannerItem[] {
  const isTop = position.startsWith('top');
  return isTop ? [...items].reverse() : [...items];
}

function bgUrl(src: string): string {
  const safe = src.replace(/\\/g, '/').replace(/"/g, '\\"');
  return `url("${safe}")`;
}

function makeClose(bridge: NotificationBannerBridge, id: string): HTMLElement {
  const close = document.createElement('span');
  close.className = 'uiv2-notif-toast__close';
  close.setAttribute('role', 'button');
  close.setAttribute('aria-label', 'Закрыть уведомление');
  close.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    bridge.dismiss(id);
  });
  return close;
}

function appendKindBody(
  main: HTMLElement,
  kindLabel: string,
  bodyHtml: string,
  withTime?: string,
): void {
  const kindEl = document.createElement('span');
  kindEl.className = 'uiv2-notif-toast__kind';
  kindEl.textContent = kindLabel;
  main.appendChild(kindEl);

  const body = document.createElement('span');
  body.className = 'uiv2-notif-toast__body';
  body.innerHTML = bodyHtml;
  main.appendChild(body);

  if (withTime != null) {
    const time = document.createElement('span');
    time.className = 'uiv2-notif-toast__time';
    time.textContent = withTime;
    main.appendChild(time);
  }
}

export function mountNotificationBanner(root: HTMLElement): void {
  const bridge = window.notificationBanner;
  if (!bridge) {
    root.textContent = 'Notification bridge недоступен.';
    return;
  }

  document.documentElement.dataset.themeMode = 'dark';
  document.documentElement.style.colorScheme = 'dark';

  const stack = document.createElement('div');
  stack.className = `nb-stack ${positionClass('bottom-right')}`;
  root.appendChild(stack);

  const rendered = new Map<string, HTMLElement>();
  const leaving = new Set<string>();
  let currentPosition = 'bottom-right';
  let currentStyle = 'compact';
  let heightRaf = 0;
  let stackExiting = false;
  let peakHeight = STYLE_HEIGHT.compact + STACK_PADDING * 2;

  function measureStackHeight(): number {
    let total = STACK_PADDING * 2;
    let count = 0;
    for (const [id, el] of rendered) {
      if (leaving.has(id)) continue;
      const h = el.getBoundingClientRect().height || STYLE_HEIGHT[currentStyle] || 64;
      total += h;
      count += 1;
    }
    if (count > 1) total += (count - 1) * ITEM_GAP;
    if (count === 0) total = (STYLE_HEIGHT[currentStyle] || 64) + STACK_PADDING * 2;
    return Math.ceil(total);
  }

  function reportHeight(opts?: { allowShrink?: boolean }): void {
    if (stackExiting) return;
    const height = measureStackHeight();
    if (height >= peakHeight) {
      peakHeight = height;
    } else if (!opts?.allowShrink) {
      return;
    } else {
      peakHeight = height;
    }
    if (heightRaf) cancelAnimationFrame(heightRaf);
    heightRaf = requestAnimationFrame(() => bridge.setHeight(peakHeight));
  }

  function buildItem(item: NotificationBannerItem): HTMLElement {
    const style = normalizeStyle(item.style || currentStyle);
    const kind = kindKey(item.kind);
    const shell = document.createElement('div');
    shell.className = 'uiv2-notif-toast-shell';
    shell.dataset.id = item.id;
    shell.dataset.kind = kind;
    shell.dataset.style = style;

    const el = document.createElement('button');
    el.type = 'button';
    el.className = `uiv2-notif-toast uiv2-notif-toast--${style}`;
    el.dataset.id = item.id;
    el.dataset.kind = kind;
    el.dataset.style = style;

    const image = typeof item.image === 'string' ? item.image.trim() : '';
    const plainBody = toPlainText(item.body || '');
    const kindLabel = (item.title || 'AnixApp').trim();
    const bodyHtml = toSafeBodyHtml(plainBody || kindLabel);
    const timeStr = formatTime(item.time);

    if (style === 'full') {
      const layout = fullLayout(kind);
      el.dataset.layout = layout;
      shell.dataset.layout = layout;
      el.classList.add(`uiv2-notif-toast--full-${layout}`);

      if (layout === 'media') {
        const media = document.createElement('span');
        media.className = 'uiv2-notif-toast__media';
        if (image) media.style.backgroundImage = bgUrl(image);
        const scrim = document.createElement('span');
        scrim.className = 'uiv2-notif-toast__scrim';
        scrim.setAttribute('aria-hidden', 'true');
        const main = document.createElement('span');
        main.className = 'uiv2-notif-toast__main';
        appendKindBody(main, kindLabel, bodyHtml, timeStr);
        el.appendChild(media);
        el.appendChild(scrim);
        el.appendChild(main);
      } else if (layout === 'badge') {
        /* Белая плитка + арт внутри (как large icon на Android) */
        const badge = document.createElement('span');
        badge.className = 'uiv2-notif-toast__badge';
        const art = document.createElement('span');
        art.className = 'uiv2-notif-toast__badge-art';
        if (image) art.style.backgroundImage = bgUrl(image);
        badge.appendChild(art);
        const main = document.createElement('span');
        main.className = 'uiv2-notif-toast__main';
        appendKindBody(main, kindLabel, bodyHtml, timeStr);
        el.appendChild(badge);
        el.appendChild(main);
      } else {
        const avatar = document.createElement('span');
        avatar.className = 'uiv2-notif-toast__avatar';
        if (image) avatar.style.backgroundImage = bgUrl(image);
        const main = document.createElement('span');
        main.className = 'uiv2-notif-toast__main';
        appendKindBody(main, kindLabel, bodyHtml, timeStr);
        el.appendChild(avatar);
        el.appendChild(main);
      }
    } else if (style === 'compact') {
      if (image) {
        const wash = document.createElement('span');
        wash.className = 'uiv2-notif-toast__wash';
        wash.style.backgroundImage = bgUrl(image);
        wash.setAttribute('aria-hidden', 'true');
        el.appendChild(wash);
      }
      const tint = document.createElement('span');
      tint.className = 'uiv2-notif-toast__tint';
      tint.setAttribute('aria-hidden', 'true');
      el.appendChild(tint);

      /* Достижение: белая плитка + время, как на Android-референсе */
      if (kind === 'achievement') {
        const badge = document.createElement('span');
        badge.className = 'uiv2-notif-toast__badge';
        const art = document.createElement('span');
        art.className = 'uiv2-notif-toast__badge-art';
        if (image) art.style.backgroundImage = bgUrl(image);
        badge.appendChild(art);
        const main = document.createElement('span');
        main.className = 'uiv2-notif-toast__main';
        appendKindBody(main, kindLabel, bodyHtml, timeStr);
        el.appendChild(badge);
        el.appendChild(main);
      } else {
        const thumb = document.createElement('span');
        thumb.className = 'uiv2-notif-toast__thumb';
        if (image) thumb.style.backgroundImage = bgUrl(image);
        const main = document.createElement('span');
        main.className = 'uiv2-notif-toast__main';
        appendKindBody(main, kindLabel, bodyHtml);
        el.appendChild(thumb);
        el.appendChild(main);
      }
    } else {
      if (image) {
        const wash = document.createElement('span');
        wash.className = 'uiv2-notif-toast__wash';
        wash.style.backgroundImage = bgUrl(image);
        wash.setAttribute('aria-hidden', 'true');
        el.appendChild(wash);
      }
      const tint = document.createElement('span');
      tint.className = 'uiv2-notif-toast__tint';
      tint.setAttribute('aria-hidden', 'true');
      el.appendChild(tint);

      const main = document.createElement('span');
      main.className = 'uiv2-notif-toast__main';
      appendKindBody(main, kindLabel, bodyHtml);
      el.appendChild(main);
    }

    el.appendChild(makeClose(bridge, item.id));
    el.addEventListener('click', () => {
      bridge.click({ id: item.id, url: item.url ?? null });
    });

    shell.appendChild(el);
    /* hit-test на shell: parent с pointer-events:none ломал forward в Electron */
    shell.addEventListener('mouseenter', () => {
      bridge.setIgnoreMouse?.(false);
      bridge.pause?.(item.id);
    });
    shell.addEventListener('mouseleave', () => {
      bridge.setIgnoreMouse?.(true);
      bridge.resume?.(item.id);
    });
    return shell;
  }

  function patchItemContent(el: HTMLElement, item: NotificationBannerItem): void {
    const plain = toPlainText(item.body || '');
    const kindEl = el.querySelector('.uiv2-notif-toast__kind');
    const bodyEl = el.querySelector('.uiv2-notif-toast__body');
    const timeEl = el.querySelector('.uiv2-notif-toast__time');
    if (kindEl && item.title) kindEl.textContent = item.title;
    if (bodyEl) bodyEl.innerHTML = toSafeBodyHtml(plain || item.title || 'AnixApp');
    if (timeEl) timeEl.textContent = formatTime(item.time);
    if (item.image) {
      const url = bgUrl(item.image);
      for (const node of el.querySelectorAll(
        '.uiv2-notif-toast__media, .uiv2-notif-toast__avatar, .uiv2-notif-toast__badge-art, .uiv2-notif-toast__thumb, .uiv2-notif-toast__wash',
      ) as NodeListOf<HTMLElement>) {
        if (node.style.backgroundImage !== url) node.style.backgroundImage = url;
      }
    }
  }

  function beginLeave(id: string, shell: HTMLElement): void {
    if (leaving.has(id) || stackExiting) return;
    leaving.add(id);
    const h = shell.getBoundingClientRect().height;
    shell.classList.add('uiv2-notif-toast-shell--leaving');
    shell.style.height = `${h}px`;
    shell.style.pointerEvents = 'none';
    void shell.offsetHeight;
    shell.style.height = '0px';
    shell.style.marginTop = '0';
    shell.style.marginBottom = '0';
    shell.style.opacity = '0';
    window.setTimeout(() => {
      shell.remove();
      rendered.delete(id);
      leaving.delete(id);
      const active = [...rendered.keys()].filter((k) => !leaving.has(k)).length;
      if (active === 0 && leaving.size === 0) {
        peakHeight = measureStackHeight();
        reportHeight({ allowShrink: true });
      }
    }, LEAVE_MS);
  }

  function beginStackExit(): void {
    if (stackExiting) return;
    stackExiting = true;
    stack.classList.add('nb-stack--exiting');
    bridge.setIgnoreMouse?.(true);
    for (const [id] of rendered) leaving.add(id);
    window.setTimeout(() => {
      for (const el of [...rendered.values()]) el.remove();
      rendered.clear();
      leaving.clear();
      stack.classList.remove('nb-stack--exiting');
      stackExiting = false;
      peakHeight = STYLE_HEIGHT[currentStyle] + STACK_PADDING * 2;
    }, 320);
  }

  function flipMove(firstRects: Map<string, DOMRect>): void {
    for (const [id, shell] of rendered) {
      if (leaving.has(id)) continue;
      const prev = firstRects.get(id);
      if (!prev) continue;
      const next = shell.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      shell.classList.add('uiv2-notif-toast-shell--moving');
      shell.style.transition = 'none';
      shell.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      void shell.offsetWidth;
      shell.style.transition = `transform ${MOVE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      shell.style.transform = 'translate3d(0, 0, 0)';
      const clear = () => {
        shell.style.transition = '';
        shell.style.transform = '';
        shell.classList.remove('uiv2-notif-toast-shell--moving');
        shell.removeEventListener('transitionend', clear);
      };
      shell.addEventListener('transitionend', clear);
      window.setTimeout(clear, MOVE_MS + 40);
    }
  }

  function update(items: NotificationBannerItem[], meta?: { position?: string; style?: string }): void {
    if (meta?.position) currentPosition = meta.position;
    if (meta?.style) currentStyle = normalizeStyle(meta.style);

    if (stackExiting && items.length > 0) {
      stack.classList.remove('nb-stack--exiting');
      stackExiting = false;
      for (const el of [...rendered.values()]) el.remove();
      rendered.clear();
      leaving.clear();
    }

    stack.className = `nb-stack ${positionClass(currentPosition)} nb-stack--style-${currentStyle}`;
    stack.dataset.position = currentPosition;

    const activeCount = [...rendered.keys()].filter((k) => !leaving.has(k)).length;
    if (items.length === 0 && activeCount > 0) {
      beginStackExit();
      return;
    }
    if (items.length === 0) return;

    const firstRects = new Map<string, DOMRect>();
    for (const [id, el] of rendered) {
      if (leaving.has(id)) continue;
      firstRects.set(id, el.getBoundingClientRect());
    }

    const incoming = new Set(items.map((i) => i.id));
    for (const [id, el] of [...rendered.entries()]) {
      if (!incoming.has(id) && !leaving.has(id)) beginLeave(id, el);
    }

    const ordered = visualOrder(items, currentPosition);
    const newIds: string[] = [];

    for (const item of ordered) {
      let el = rendered.get(item.id);
      const withStyle = { ...item, style: currentStyle };
      const wantLayout = currentStyle === 'full' ? fullLayout(kindKey(item.kind)) : '';

      if (!el || leaving.has(item.id)) {
        if (leaving.has(item.id)) continue;
        el = buildItem(withStyle);
        el.classList.add('uiv2-notif-toast-shell--entering');
        rendered.set(item.id, el);
        newIds.push(item.id);
      } else if (
        el.dataset.style !== currentStyle
        || el.dataset.kind !== kindKey(item.kind)
        || (wantLayout && el.dataset.layout !== wantLayout)
      ) {
        const next = buildItem(withStyle);
        el.replaceWith(next);
        rendered.set(item.id, next);
        el = next;
      } else {
        patchItemContent(el, item);
      }
    }

    const isTop = currentPosition.startsWith('top');
    if (leaving.size === 0) {
      for (const item of ordered) {
        const el = rendered.get(item.id);
        if (el) stack.appendChild(el);
      }
    } else {
      for (const item of ordered) {
        const el = rendered.get(item.id);
        if (!el || leaving.has(item.id)) continue;
        if (!el.isConnected) {
          if (isTop) stack.insertBefore(el, stack.firstChild);
          else stack.appendChild(el);
        }
      }
    }

    flipMove(firstRects);

    /* Высоту окна — до старта enter, чтобы setBounds не сдвинул стек в конце анимации */
    reportHeight();

    for (const id of newIds) {
      const el = rendered.get(id);
      if (!el) continue;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => el.classList.remove('uiv2-notif-toast-shell--entering'));
      });
    }
  }

  bridge.onUpdate(update);
  bridge.ready();
}
