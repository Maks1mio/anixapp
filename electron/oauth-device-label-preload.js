'use strict';

/**
 * Preload для OAuth BrowserWindow:
 * подмена «неизвестном устройстве» → «Приложение Anixapp» (только текст в этом окне).
 */
const { webFrame } = require('electron');

const LABEL = 'Приложение Anixapp';

const PAGE_SCRIPT = `(() => {
  const LABEL = ${JSON.stringify(LABEL)};

  function fixString(s) {
    if (!s || typeof s !== 'string') return s;
    let out = s.replace(
      /на[\\s\\u00a0\\u202f\\u2009]+неизвестн[а-яё]*[\\s\\u00a0\\u202f\\u2009]+устройств[а-яё]*/gi,
      'через ' + LABEL,
    );
    out = out.replace(
      /неизвестн[а-яё]*[\\s\\u00a0\\u202f\\u2009]+устройств[а-яё]*/gi,
      LABEL,
    );
    out = out.replace(/unknown\\s+device|unrecognized\\s+device/gi, LABEL);
    return out;
  }

  function looksUnknown(s) {
    return /неизвестн[а-яё]*[\\s\\u00a0\\u202f\\u2009]*устройств/i.test(s || '')
      || /unknown\\s+device/i.test(s || '');
  }

  function walk(node, depth) {
    if (!node || depth > 50) return;
    if (node.nodeType === 3) {
      const next = fixString(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg' || tag === 'textarea' || tag === 'input') {
      return;
    }

    for (const attr of ['aria-label', 'title', 'alt', 'placeholder']) {
      if (!el.hasAttribute || !el.hasAttribute(attr)) continue;
      const v = el.getAttribute(attr);
      const n = fixString(v);
      if (n !== v) el.setAttribute(attr, n);
    }

    if (el.childElementCount > 0 && el.childElementCount < 40) {
      const joined = (el.textContent || '').replace(/[\\s\\u00a0\\u202f\\u2009]+/g, ' ').trim();
      if (looksUnknown(joined)) {
        const fixed = fixString(el.textContent || '');
        if (fixed !== el.textContent) {
          const onlyPhrasing = Array.from(el.children).every((c) =>
            /^(SPAN|B|I|STRONG|EM|A|FONT|WBR|BR)$/i.test(c.tagName),
          );
          if (onlyPhrasing && !el.querySelector('input,button,img,svg,a[href]')) {
            el.textContent = fixed;
            return;
          }
        }
      }
    }

    if (el.shadowRoot) {
      for (const child of Array.from(el.shadowRoot.childNodes || [])) walk(child, depth + 1);
    }
    for (const child of Array.from(el.childNodes || [])) walk(child, depth + 1);
  }

  function run() {
    try { walk(document.documentElement || document.body, 0); } catch (e) {}
  }

  run();
  if (!window.__anixOAuthDevicePatch) {
    window.__anixOAuthDevicePatch = true;
    try {
      new MutationObserver(() => run()).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-label', 'title', 'alt'],
      });
    } catch (e) {}
    setInterval(run, 350);
  }
})();`;

function inject() {
  try {
    webFrame.executeJavaScript(PAGE_SCRIPT, true).catch(() => {});
  } catch {
    /* ignore */
  }
}

inject();
setInterval(inject, 500);

try {
  process.once('loaded', inject);
} catch {
  /* ignore */
}
