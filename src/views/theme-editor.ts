/**
 * Theme Editor — a standalone Electron window for creating / editing themes.
 * Opened from the "Внешний вид" settings tab.
 *
 * Communication: localStorage (shared between windows on same origin) +
 * IPC `theme-editor:saved` to notify the main window to re-apply theme.
 */

import {
  Theme, ThemeVars,
  getCustomThemes, saveCustomThemes, getThemeById,
  applyTheme, getActiveThemeId, deleteCustomTheme,
  BUILT_IN_THEMES,
  generateThemeSeed, parseThemeSeed,
} from '../services/themes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

const COLOR_FIELDS: Array<{ key: keyof ThemeVars; label: string }> = [
  { key: 'colorBg',           label: 'Фон' },
  { key: 'colorSurface',      label: 'Поверхность' },
  { key: 'colorSurfaceHover', label: 'Поверхность (hover)' },
  { key: 'colorBorder',       label: 'Граница' },
  { key: 'colorText',         label: 'Текст' },
  { key: 'colorTextMuted',    label: 'Второстепенный текст' },
  { key: 'colorAccent',       label: 'Акцент' },
  { key: 'colorAccentHover',  label: 'Акцент (hover)' },
];

interface FontEntry { group?: string; label: string; value: string; alwaysShow?: boolean; }

// ── Font availability detection (canvas-based) ─────────────────────────────────
// Uses Cyrillic test string — only fonts with actual Cyrillic glyphs
// will render differently from the generic fallback families.
const _fontCanvas = (() => {
  try {
    const c = document.createElement('canvas');
    c.width = 500; c.height = 30;
    return c;
  } catch { return null; }
})();
const _fontCtx = _fontCanvas?.getContext('2d') ?? null;
const _FONT_TEST = 'Привет мир Hello 0123 АаБб';
const _FONT_SZ   = '18px';

// Baseline widths (measured once at module level)
let _monoW = 0, _serifW = 0;
if (_fontCtx) {
  _fontCtx.font = `${_FONT_SZ} monospace`;
  _monoW = _fontCtx.measureText(_FONT_TEST).width;
  _fontCtx.font = `${_FONT_SZ} serif`;
  _serifW = _fontCtx.measureText(_FONT_TEST).width;
}

/** Returns true if the given font family name is installed and renders Cyrillic. */
function detectFont(primaryFamily: string): boolean {
  if (!_fontCtx) return true; // can't detect — show everything
  _fontCtx.font = `${_FONT_SZ} '${primaryFamily}', monospace`;
  const w1 = _fontCtx.measureText(_FONT_TEST).width;
  _fontCtx.font = `${_FONT_SZ} '${primaryFamily}', serif`;
  const w2 = _fontCtx.measureText(_FONT_TEST).width;
  return w1 !== _monoW || w2 !== _serifW;
}

/** Extracts the primary (first) font-family name from a CSS font stack string. */
function primaryFamily(value: string): string {
  const m = value.match(/'([^']+)'/) ?? value.match(/^([^,]+)/);
  return (m?.[1] ?? value).trim();
}

// ── All fonts with Cyrillic support ───────────────────────────────────────────
// Only fonts that natively support the Cyrillic script are included.
// At render time the list is filtered to fonts actually installed on the system.
const ALL_CYRILLIC_FONTS: FontEntry[] = [
  // ── Системные (без засечек) ──────────────────────────────────────────────────
  { group: 'Системные', label: 'Segoe UI (по умолчанию)', value: "'Segoe UI', system-ui, -apple-system, sans-serif", alwaysShow: true },
  { label: 'System UI',        value: 'system-ui, -apple-system, sans-serif', alwaysShow: true },
  { label: 'Arial',            value: 'Arial, Helvetica, sans-serif',         alwaysShow: true },
  { label: 'Verdana',          value: 'Verdana, sans-serif',                  alwaysShow: true },
  { label: 'Tahoma',           value: 'Tahoma, sans-serif',                   alwaysShow: true },
  { label: 'Calibri',          value: "'Calibri', sans-serif" },
  { label: 'Ubuntu',           value: "'Ubuntu', sans-serif" },
  { label: 'Noto Sans',        value: "'Noto Sans', sans-serif" },
  // ── Без засечек (веб) ───────────────────────────────────────────────────────
  { group: 'Без засечек', label: 'Inter',             value: "'Inter', sans-serif" },
  { label: 'Roboto',           value: "'Roboto', sans-serif" },
  { label: 'Open Sans',        value: "'Open Sans', sans-serif" },
  { label: 'Lato',             value: "'Lato', sans-serif" },
  { label: 'Montserrat',       value: "'Montserrat', sans-serif" },
  { label: 'Source Sans Pro',  value: "'Source Sans 3', 'Source Sans Pro', sans-serif" },
  { label: 'Nunito',           value: "'Nunito', sans-serif" },
  { label: 'Nunito Sans',      value: "'Nunito Sans', sans-serif" },
  { label: 'Raleway',          value: "'Raleway', sans-serif" },
  { label: 'Manrope',          value: "'Manrope', sans-serif" },
  { label: 'Rubik',            value: "'Rubik', sans-serif" },
  { label: 'Jost',             value: "'Jost', sans-serif" },
  { label: 'Mulish',           value: "'Mulish', sans-serif" },
  { label: 'Quicksand',        value: "'Quicksand', sans-serif" },
  { label: 'Overpass',         value: "'Overpass', sans-serif" },
  { label: 'Exo 2',            value: "'Exo 2', sans-serif" },
  { label: 'Fira Sans',        value: "'Fira Sans', sans-serif" },
  { label: 'PT Sans',          value: "'PT Sans', sans-serif" },
  { label: 'PT Sans Narrow',   value: "'PT Sans Narrow', sans-serif" },
  { label: 'Cuprum',           value: "'Cuprum', sans-serif" },
  { label: 'Oranienbaum',      value: "'Oranienbaum', serif" },
  // ── Дисплейные ──────────────────────────────────────────────────────────────
  { group: 'Дисплейные', label: 'Russo One',         value: "'Russo One', sans-serif" },
  { label: 'Oswald',           value: "'Oswald', sans-serif" },
  { label: 'Exo',              value: "'Exo', sans-serif" },
  { label: 'Comfortaa',        value: "'Comfortaa', sans-serif" },
  { label: 'Lobster',          value: "'Lobster', cursive" },
  { label: 'Pacifico',         value: "'Pacifico', cursive" },
  { label: 'Neucha',           value: "'Neucha', cursive" },
  { label: 'Marck Script',     value: "'Marck Script', cursive" },
  { label: 'Yeseva One',       value: "'Yeseva One', serif" },
  // ── С засечками ─────────────────────────────────────────────────────────────
  { group: 'С засечками', label: 'Georgia',           value: 'Georgia, serif',                  alwaysShow: true },
  { label: 'Times New Roman',  value: "'Times New Roman', Times, serif",      alwaysShow: true },
  { label: 'Cambria',          value: 'Cambria, Georgia, serif' },
  { label: 'Palatino Linotype', value: "'Palatino Linotype', Palatino, serif" },
  { label: 'Merriweather',     value: "'Merriweather', serif" },
  { label: 'Playfair Display', value: "'Playfair Display', serif" },
  { label: 'Lora',             value: "'Lora', serif" },
  { label: 'EB Garamond',      value: "'EB Garamond', serif" },
  { label: 'Crimson Text',     value: "'Crimson Text', serif" },
  { label: 'Source Serif Pro', value: "'Source Serif 4', 'Source Serif Pro', serif" },
  { label: 'Cormorant',        value: "'Cormorant', serif" },
  { label: 'Spectral',         value: "'Spectral', serif" },
  { label: 'Vollkorn',         value: "'Vollkorn', serif" },
  { label: 'PT Serif',         value: "'PT Serif', serif" },
  { label: 'Philosopher',      value: "'Philosopher', serif" },
  // ── Моноширинные ────────────────────────────────────────────────────────────
  { group: 'Моноширинные', label: 'Consolas',         value: 'Consolas, monospace',             alwaysShow: true },
  { label: 'Courier New',      value: "'Courier New', Courier, monospace",    alwaysShow: true },
  { label: 'Cascadia Code',    value: "'Cascadia Code', 'Cascadia Mono', monospace" },
  { label: 'JetBrains Mono',   value: "'JetBrains Mono', monospace" },
  { label: 'Fira Code',        value: "'Fira Code', monospace" },
  { label: 'Source Code Pro',  value: "'Source Code Pro', monospace" },
  { label: 'IBM Plex Mono',    value: "'IBM Plex Mono', monospace" },
  { label: 'Hack',             value: "'Hack', monospace" },
  { label: 'Roboto Mono',      value: "'Roboto Mono', monospace" },
  { label: 'PT Mono',          value: "'PT Mono', monospace" },
];

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderThemeEditor(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'te-root';

  // Read theme ID from URL param (e.g. ?id=custom-1234)
  const params  = new URLSearchParams(window.location.search);
  const themeId = params.get('id') ?? '';
  const isNew   = params.get('new') === '1';

  let theme: Theme | undefined = themeId ? getThemeById(themeId) : undefined;

  if (!theme) {
    // Fallback: grab freshest custom theme (just created)
    const customs = getCustomThemes();
    theme = customs[customs.length - 1];
  }

  if (!theme) {
    root.textContent = 'Тема не найдена.';
    return root;
  }

  // Working copy (mutated on each color change)
  let draft: Theme = { ...theme, vars: { ...theme.vars } };

  // Refs to each color row's controls — used by seed import to sync UI
  const colorFieldRefs: Array<{
    key:     keyof ThemeVars;
    picker:  HTMLInputElement;
    swatch:  HTMLDivElement;
    val:     HTMLSpanElement;
  }> = [];

  // Seed display updater — set after seedValueEl is created below
  let updateSeedDisplay: () => void = () => {};

  // ── Title bar ──────────────────────────────────────────────────────────────
  const titleBar = document.createElement('div');
  titleBar.className = 'te-titlebar';

  // Editable name
  const nameWrap = document.createElement('div');
  nameWrap.className = 'te-titlebar__name-wrap';
  const nameEl = document.createElement('span');
  nameEl.className = 'te-titlebar__name';
  nameEl.contentEditable = 'true';
  nameEl.spellcheck = false;
  nameEl.textContent = draft.name;
  nameEl.title = 'Нажмите, чтобы переименовать';

  nameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
  });
  nameEl.addEventListener('blur', () => {
    const newName = nameEl.textContent?.trim() || 'Безымянная';
    nameEl.textContent = newName;
    draft.name = newName;
  });

  const pencilIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  pencilIcon.setAttribute('width', '14'); pencilIcon.setAttribute('height', '14');
  pencilIcon.setAttribute('viewBox', '0 0 24 24'); pencilIcon.setAttribute('fill', 'none');
  pencilIcon.setAttribute('stroke', 'currentColor'); pencilIcon.setAttribute('stroke-width', '2');
  pencilIcon.setAttribute('stroke-linecap', 'round'); pencilIcon.setAttribute('stroke-linejoin', 'round');
  pencilIcon.innerHTML = '<path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>';
  nameWrap.appendChild(nameEl);
  nameWrap.appendChild(pencilIcon);

  const winBtns = document.createElement('div');
  winBtns.className = 'te-titlebar__win-btns';
  winBtns.innerHTML = `<button class="te-win-btn te-win-btn--close" title="Закрыть" aria-label="Закрыть">✕</button>`;
  winBtns.querySelector('.te-win-btn--close')!.addEventListener('click', () => {
    window.close();
  });

  titleBar.appendChild(nameWrap);
  titleBar.appendChild(winBtns);

  // ── Body ───────────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'te-body';

  // Left: color pickers
  const left = document.createElement('div');
  left.className = 'te-left';

  const section = (label: string) => {
    const h = document.createElement('p');
    h.className = 'te-section-label';
    h.textContent = label;
    left.appendChild(h);
  };

  section('Цвета');

  const colorRows = document.createElement('div');
  colorRows.className = 'te-color-rows';

  COLOR_FIELDS.forEach(({ key, label }) => {
    const row = document.createElement('label');
    row.className = 'te-color-row';

    const swatch = document.createElement('div');
    swatch.className = 'te-color-swatch';
    swatch.style.background = draft.vars[key] as string;

    const picker = document.createElement('input');
    picker.type  = 'color';
    picker.value = hexFromAny(draft.vars[key] as string);
    picker.className = 'te-color-input';

    picker.addEventListener('input', () => {
      (draft.vars as Record<string, string>)[key] = picker.value;
      swatch.style.background = picker.value;
      applyTheme(draft);       // apply in editor window
      sendLiveUpdate();        // push to main window
    });

    swatch.appendChild(picker);

    const lbl = document.createElement('span');
    lbl.className = 'te-color-label';
    lbl.textContent = label;

    const val = document.createElement('span');
    val.className = 'te-color-value';
    val.textContent = draft.vars[key] as string;
    picker.addEventListener('input', () => { val.textContent = picker.value; });

    colorFieldRefs.push({ key, picker, swatch: swatch as HTMLDivElement, val });

    row.appendChild(swatch);
    row.appendChild(lbl);
    row.appendChild(val);
    colorRows.appendChild(row);
  });
  left.appendChild(colorRows);

  // Font
  section('Шрифт');

  const fontWrap = document.createElement('div');
  fontWrap.className = 'te-font-row';

  const fontSelect = document.createElement('select');
  fontSelect.className = 'te-font-select';

  // Filter list to fonts that are actually installed on this system
  // (alwaysShow entries like Arial / Georgia are never filtered out)
  const availableFonts = ALL_CYRILLIC_FONTS.filter(
    f => f.alwaysShow || detectFont(primaryFamily(f.value))
  );

  // Build grouped <optgroup> option list
  let currentGroup: HTMLOptGroupElement | null = null;
  let lastGroupName = '';
  availableFonts.forEach(({ group, label, value }) => {
    if (group && group !== lastGroupName) {
      currentGroup = document.createElement('optgroup');
      currentGroup.label = group;
      fontSelect.appendChild(currentGroup);
      lastGroupName = group;
    }
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (draft.vars.fontFamily === value) opt.selected = true;
    (currentGroup ?? fontSelect).appendChild(opt);
  });

  // Custom option (always at the end, ungrouped)
  const customFontOpt = document.createElement('option');
  customFontOpt.value = '__custom__';
  customFontOpt.textContent = '📂 Свой шрифт (из файла)…';
  fontSelect.appendChild(customFontOpt);

  const customFontInput = document.createElement('input');
  customFontInput.type = 'file';
  customFontInput.accept = '.ttf,.otf,.woff,.woff2';
  customFontInput.className = 'te-font-file-input';
  customFontInput.style.display = 'none';

  fontSelect.addEventListener('change', () => {
    if (fontSelect.value === '__custom__') {
      customFontInput.click();
    } else {
      draft.vars.fontFamily = fontSelect.value;
      applyTheme(draft);
      sendLiveUpdate();
    }
  });

  customFontInput.addEventListener('change', () => {
    const file = customFontInput.files?.[0];
    if (!file) { fontSelect.value = availableFonts[0]?.value ?? ''; return; }
    const url  = URL.createObjectURL(file);
    const face = new FontFace('AnixCustomFont', `url(${url})`);
    face.load().then(() => {
      document.fonts.add(face);
      draft.vars.fontFamily = "'AnixCustomFont', sans-serif";
      applyTheme(draft);
      sendLiveUpdate();
      // Add persistent option
      const existing = fontSelect.querySelector('[data-custom]') as HTMLOptionElement | null;
      const opt = existing ?? document.createElement('option');
      opt.dataset['custom'] = '1';
      opt.value = draft.vars.fontFamily;
      opt.textContent = file.name.replace(/\.[^.]+$/, '');
      if (!existing) fontSelect.insertBefore(opt, customFontOpt);
      fontSelect.value = opt.value;
    }).catch(() => {
      fontSelect.value = availableFonts[0]?.value ?? '';
    });
  });

  fontWrap.appendChild(fontSelect);
  fontWrap.appendChild(customFontInput);
  left.appendChild(fontWrap);

  // ── Seed section ───────────────────────────────────────────────────────────
  section('Сид темы');

  // Seed display (read-only, updates on every color change)
  const seedDisplayRow = document.createElement('div');
  seedDisplayRow.className = 'te-seed-row';

  const seedValueEl = document.createElement('input');
  seedValueEl.type      = 'text';
  seedValueEl.readOnly  = true;
  seedValueEl.className = 'te-seed-value';
  seedValueEl.value     = generateThemeSeed(draft.vars, draft.name);
  seedValueEl.addEventListener('click', () => seedValueEl.select());

  const seedCopyBtn = document.createElement('button');
  seedCopyBtn.className = 'te-seed-copy-btn';
  seedCopyBtn.title     = 'Скопировать сид';
  seedCopyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
  seedCopyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(seedValueEl.value).then(() => {
      seedCopyBtn.classList.add('te-seed-copy-btn--copied');
      seedCopyBtn.title = 'Скопировано!';
      setTimeout(() => {
        seedCopyBtn.classList.remove('te-seed-copy-btn--copied');
        seedCopyBtn.title = 'Скопировать сид';
      }, 1500);
    });
  });

  seedDisplayRow.appendChild(seedValueEl);
  seedDisplayRow.appendChild(seedCopyBtn);

  // Seed import row
  const seedImportRow = document.createElement('div');
  seedImportRow.className = 'te-seed-import-row';

  const seedImportInput = document.createElement('input');
  seedImportInput.type        = 'text';
  seedImportInput.className   = 'te-seed-import-input';
  seedImportInput.placeholder = 'AnixApp-TH… (вставить чужой сид)';
  seedImportInput.spellcheck  = false;

  const seedApplyBtn = document.createElement('button');
  seedApplyBtn.className   = 'te-seed-apply-btn';
  seedApplyBtn.textContent = 'Применить';

  seedApplyBtn.addEventListener('click', () => {
    const result = parseThemeSeed(seedImportInput.value);
    if (!result) {
      seedImportInput.classList.add('te-seed-import-input--error');
      setTimeout(() => seedImportInput.classList.remove('te-seed-import-input--error'), 1200);
      return;
    }
    const { vars: parsedVars, themeName } = result;

    // Apply colors + font to draft
    Object.assign(draft.vars, parsedVars);

    // Sync color row controls
    colorFieldRefs.forEach(({ key, picker, swatch, val }) => {
      const v = draft.vars[key] as string;
      picker.value            = hexFromAny(v);
      swatch.style.background = v;
      val.textContent         = v;
    });

    // Sync font select if the seed included a known font
    if (parsedVars.fontFamily) {
      const opt = Array.from(fontSelect.options).find(o => o.value === parsedVars.fontFamily);
      if (opt) {
        fontSelect.value = opt.value;
      } else {
        const tempOpt = document.createElement('option');
        tempOpt.value = parsedVars.fontFamily!;
        tempOpt.textContent = parsedVars.fontFamily!.match(/'([^']+)'/)?.[1] ?? parsedVars.fontFamily!;
        tempOpt.dataset['seedImport'] = '1';
        fontSelect.querySelector('[data-seed-import]')?.remove();
        fontSelect.insertBefore(tempOpt, fontSelect.options[0]);
        fontSelect.value = tempOpt.value;
      }
    }

    // Apply theme name if present in seed
    if (themeName) {
      draft.name = themeName;
      nameEl.textContent = themeName;
    }

    applyTheme(draft);
    sendLiveUpdate();
    seedImportInput.value = '';
    seedImportInput.classList.remove('te-seed-import-input--error');
    seedApplyBtn.textContent = 'Применено ✓';
    setTimeout(() => { seedApplyBtn.textContent = 'Применить'; }, 1500);
  });
  seedImportInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') seedApplyBtn.click();
  });

  seedImportRow.appendChild(seedImportInput);
  seedImportRow.appendChild(seedApplyBtn);

  left.appendChild(seedDisplayRow);
  left.appendChild(seedImportRow);

  // Wire up the updater (called by sendLiveUpdate on every change)
  updateSeedDisplay = () => { seedValueEl.value = generateThemeSeed(draft.vars, draft.name); };

  // Also update seed when the theme name changes
  nameEl.addEventListener('blur', () => { updateSeedDisplay(); });

  // Save / Cancel buttons
  const actions = document.createElement('div');
  actions.className = 'te-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'te-btn te-btn--primary';
  saveBtn.textContent = 'Сохранить';
  saveBtn.addEventListener('click', () => {
    const name = nameEl.textContent?.trim() || 'Безымянная';
    draft.name = name;
    // Persist
    const themes = getCustomThemes();
    const idx    = themes.findIndex(t => t.id === draft.id);
    if (idx >= 0) themes[idx] = draft;
    else themes.push(draft);
    saveCustomThemes(themes);
    applyTheme(draft);
    // Notify main window
    const el = window.electron as { themeEditorSaved?: (id: string) => void } | undefined;
    el?.themeEditorSaved?.(draft.id);
    // Flash feedback
    saveBtn.textContent = 'Сохранено ✓';
    setTimeout(() => { saveBtn.textContent = 'Сохранить'; }, 1500);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'te-btn te-btn--secondary';
  cancelBtn.textContent = 'Отмена';
  cancelBtn.addEventListener('click', () => {
    // Revert live preview to original theme in main window
    const origTheme = getThemeById(draft.id);
    if (origTheme) {
      applyTheme(origTheme);
      const el = window.electron as { themeEditorLiveUpdate?: (vars: Record<string, string>) => void } | undefined;
      el?.themeEditorLiveUpdate?.({ ...origTheme.vars } as Record<string, string>);
    }
    window.close();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  left.appendChild(actions);

  // Delete button — only for custom (non built-in) themes
  if (!draft.builtIn) {
    const dangerZone = document.createElement('div');
    dangerZone.className = 'te-danger-zone';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'te-btn te-btn--danger';
    deleteBtn.textContent = 'Удалить тему';
    deleteBtn.addEventListener('click', () => {
      deleteBtn.textContent = 'Нажмите ещё раз для подтверждения';
      deleteBtn.classList.add('te-btn--danger-confirm');
      deleteBtn.addEventListener('click', () => {
        deleteCustomTheme(draft.id);
        const el = window.electron as { themeEditorDeleted?: (id: string) => void } | undefined;
        el?.themeEditorDeleted?.(draft.id);
        window.close();
      }, { once: true });
    }, { once: true });

    dangerZone.appendChild(deleteBtn);
    left.appendChild(dangerZone);
  }

  /** Push current draft vars to main window for real-time preview; also refreshes seed display. */
  function sendLiveUpdate(): void {
    updateSeedDisplay();
    const el = window.electron as { themeEditorLiveUpdate?: (vars: Record<string, string>) => void } | undefined;
    el?.themeEditorLiveUpdate?.({ ...draft.vars } as Record<string, string>);
  }

  body.appendChild(left);

  root.appendChild(titleBar);
  root.appendChild(body);

  return root;
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Extracts a #rrggbb hex from any CSS color string for use with <input type=color>. */
function hexFromAny(color: string): string {
  // Already a hex
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const [, r, g, b] = color.match(/#(.)(.)(.)/) ?? [];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  // Fallback: render via canvas
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = 1;
  const ctx = tmp.getContext('2d');
  if (!ctx) return '#000000';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
