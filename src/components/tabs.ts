export interface TabItem {
  id: string;
  label: string;
}

export interface TabsOptions {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /**
   * Дополнительные элементы справа (кнопки с текстом или иконкой).
   * Могут быть кнопки, ссылки и т.п.
   */
  rightActions?: HTMLElement | HTMLElement[];
  /**
   * CSS‑класс корневого контейнера.
   * По умолчанию — `bookmarks__tabs` (как в закладках).
   */
  rootClassName?: string;
}

export function renderTabsBar(options: TabsOptions): HTMLElement {
  const {
    tabs,
    activeId,
    onChange,
    rightActions,
    rootClassName = 'bookmarks__tabs',
  } = options;

  const root = document.createElement('div');
  root.className = rootClassName;

  const makeTabButton = (tab: TabItem): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bookmarks__tab';
    if (tab.id === activeId) {
      btn.classList.add('bookmarks__tab--active');
    }
    btn.dataset.tab = tab.id;
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      if (btn.classList.contains('bookmarks__tab--active')) return;
      // Обновляем активный таб
      root.querySelectorAll('.bookmarks__tab').forEach((el) => {
        el.classList.toggle(
          'bookmarks__tab--active',
          (el as HTMLElement).dataset.tab === tab.id,
        );
      });
      onChange(tab.id);
    });
    return btn;
  };

  tabs.forEach((tab) => {
    root.appendChild(makeTabButton(tab));
  });

  if (rightActions) {
    const actions = Array.isArray(rightActions) ? rightActions : [rightActions];
    actions.forEach((el, index) => {
      if (!el) return;
      el.classList.add('tabs-bar__action');
      if (index === 0) {
        el.classList.add('tabs-bar__action--first');
      }
      root.appendChild(el);
    });
  }

  return root;
}

