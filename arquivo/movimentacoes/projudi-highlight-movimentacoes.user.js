// ==UserScript==
// @name         Projudi - Highlight Movimentações
// @namespace    projudi-highlight-movimentacoes.user.js
// @version      1.2
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Destaca as movimentações no Projudi, com painel configurável (Ctrl+Shift+M).
// @author       lourencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/5ffde04a50de4c905c398bee2b9ae2ed/raw/projudi-highlight-movimentacoes.user.js
// @downloadURL  https://gist.githubusercontent.com/lourencosv/5ffde04a50de4c905c398bee2b9ae2ed/raw/projudi-highlight-movimentacoes.user.js
// @match        *://projudi.tjgo.jus.br/*
// @include      *projudi*
// @run-at       document-end
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;

  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
  const ARROW_STR = '(?:-\\s*>|→|⇒|»|›)';

  const TYPES_ORDER = [
    'Despacho',
    'Decisão',
    'Julgamento',
    'Juntada',
    'Autos Conclusos',
    'Petição Enviada',
    'Recebido',
    'Despacho Autos ao Contador',
    'Relatório'
  ];

  const DISPLAY_NAMES = {
    'Despacho Autos ao Contador': 'Autos ao Contador'
  };

  const DEFAULTS = {
    enabled: true,
    padding: '6px 8px',
    colors: {
      'Despacho': '#eedbdb',
      'Decisão': '#eedbdb',
      'Julgamento': '#eedbdb',
      'Juntada': '#e8f5e9',
      'Autos Conclusos': '#d6d6d6',
      'Petição Enviada': '#d1effc',
      'Recebido': '#d1effc',
      'Despacho Autos ao Contador': '#eedbdb',
      'Relatório': '#eedbdb'
    },
    textColors: TYPES_ORDER.reduce((acc, k) => (acc[k] = '#111827', acc), {}),
    enabledTypes: TYPES_ORDER.reduce((acc, k) => (acc[k] = true, acc), {}),
    noBackgroundTypes: TYPES_ORDER.reduce((acc, k) => (acc[k] = false, acc), {}),
    boldTypes: TYPES_ORDER.reduce((acc, k) => (acc[k] = true, acc), {})
  };

  const STORAGE_KEY = 'projudi_highlight_movs_cfg_v25';
  const DOC_STYLE_ID = 'phm-doc-style-v25';

  function deepMerge(base, add) {
    for (const k in add) {
      const v = add[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        base[k] = deepMerge(base[k] || {}, v);
      } else {
        base[k] = v;
      }
    }
    return base;
  }

  function readCfg() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? deepMerge(deepClone(DEFAULTS), JSON.parse(raw)) : deepClone(DEFAULTS);
    } catch {
      return deepClone(DEFAULTS);
    }
  }

  function saveCfg(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  function toHexColor(any) {
    if (/^#([0-9a-f]{3}){1,2}$/i.test(any || '')) return any;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(any || '');
    if (!m) return '#111827';
    const [r, g, b] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  let CFG = readCfg();

  GM_addStyle(`
    .phm-panel {
      position: fixed;
      right: 8px;
      bottom: 8px;
      z-index: 2147483647;
      width: min(640px, calc(100vw - 16px));
      height: min(62vh, 560px);
      max-height: calc(100vh - 16px);
      border: 1px solid #d8dee8;
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 14px 30px rgba(17, 24, 39, .18);
      font: 13px/1.3 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif;
      color: #111827;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .phm-panel * { box-sizing: border-box; }
    .phm-head {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 11px;
      border-bottom: 1px solid #e5e7eb;
      background: #f8fafc;
    }
    .phm-title {
      margin: 0;
      color: #1d4ed8;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: .2px;
    }
    .phm-close {
      border: 0;
      width: 26px;
      height: 26px;
      border-radius: 7px;
      background: transparent;
      color: #1f2937;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
    }
    .phm-close:hover { background: #e5e7eb; }
    .phm-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 8px 10px;
      background: #f9fafb;
    }
    .phm-grid-head, .phm-row {
      display: grid;
      grid-template-columns: minmax(145px, 1fr) 64px 64px 100px 90px 86px;
      align-items: center;
      gap: 8px;
    }
    .phm-grid-head {
      position: sticky;
      top: 0;
      z-index: 1;
      margin-bottom: 6px;
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f1f5f9;
      color: #334155;
      font-size: 11px;
      font-weight: 700;
    }
    .phm-row {
      margin-bottom: 6px;
      padding: 7px 8px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: #ffffff;
    }
    .phm-type {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      font-weight: 600;
      color: #1f2937;
    }
    .phm-type span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .phm-center {
      display: flex;
      justify-content: center;
      align-items: center;
      min-width: 0;
    }
    .phm-center input[type="color"] {
      width: 54px;
      height: 28px;
      border: 1px solid #d1d5db;
      border-radius: 999px;
      padding: 2px;
      background: transparent;
      cursor: pointer;
    }
    .phm-center label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-weight: 600;
      color: #374151;
      white-space: nowrap;
      font-size: 12px;
    }
    .phm-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 72px;
      height: 30px;
      border-radius: 999px;
      border: 1px solid #d1d5db;
      font-size: 12px;
      font-weight: 600;
      color: #111827;
      padding: 0 8px;
    }
    .phm-foot {
      flex: 0 0 auto;
      display: flex;
      justify-content: flex-end;
      gap: 7px;
      padding: 8px 10px 10px;
      border-top: 1px solid #e5e7eb;
      background: #ffffff;
    }
    .phm-btn {
      border: 1px solid #d1d5db;
      border-radius: 7px;
      background: #ffffff;
      color: #111827;
      font-weight: 700;
      font-size: 12px;
      padding: 6px 10px;
      cursor: pointer;
    }
    .phm-btn:hover { background: #f3f4f6; }
    .phm-btn-save {
      border-color: #1d4ed8;
      background: #2563eb;
      color: #ffffff;
    }
    .phm-btn-save:hover { background: #1d4ed8; }
    @media (max-width: 820px) {
      .phm-panel {
        right: 6px;
        bottom: 6px;
        width: calc(100vw - 12px);
        height: min(70vh, 560px);
      }
      .phm-grid-head { display: none; }
      .phm-row {
        grid-template-columns: 1fr 1fr;
        gap: 7px 8px;
      }
      .phm-type { grid-column: 1 / -1; }
      .phm-center { justify-content: flex-start; }
    }
  `);

  function ensureDocStyle(doc) {
    try {
      if (!doc || !doc.head) return;
      if (doc.getElementById(DOC_STYLE_ID)) return;
      const style = doc.createElement('style');
      style.id = DOC_STYLE_ID;
      style.textContent = `.phm-bold-fragment, .phm-bold-fragment * { font-weight: 700 !important; }`;
      doc.head.appendChild(style);
    } catch {}
  }

  const PADROES_MOV = [
    { key: 'Despacho', re: new RegExp('^\\s*Despacho\\s*' + ARROW_STR, 'iu') },
    { key: 'Decisão', re: new RegExp('^\\s*Decis[aã]o\\s*' + ARROW_STR, 'iu') },
    { key: 'Julgamento', re: new RegExp('^\\s*Julgamento\\s*' + ARROW_STR, 'iu') },
    { key: 'Juntada', re: new RegExp('^\\s*Juntada\\s*' + ARROW_STR, 'iu') },
    { key: 'Autos Conclusos', re: /^(\s*)Autos\s+Conclusos\b/iu },
    { key: 'Petição Enviada', re: /^(\s*)Peti[cç][aã]o\s+Enviada\b/iu },
    { key: 'Recebido', re: /^(\s*)Recebido\b/iu },
    { key: 'Despacho Autos ao Contador', re: /^(\s*)Despacho\s+Autos\s+ao\s+Contador\b/iu },
    { key: 'Relatório', re: new RegExp('^\\s*Relat[óo]rio\\s*' + ARROW_STR, 'iu') }
  ];

  function matchKind(text) {
    for (const p of PADROES_MOV) {
      if (CFG.enabledTypes[p.key] === false) continue;
      if (p.re.test(text)) return p.key;
    }
    return null;
  }

  function removeFirstLineWrapper(td) {
    const wrappers = td.querySelectorAll('span.phm-bold-fragment[data-phm-firstline="1"]');
    wrappers.forEach((wrap) => {
      const parent = wrap.parentNode;
      if (!parent) return;
      while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap);
      parent.removeChild(wrap);
    });
  }

  function applyBoldFirstLogicalLine(td, enabled) {
    removeFirstLineWrapper(td);
    if (!enabled) return;

    const nodes = Array.from(td.childNodes);
    if (!nodes.length) return;

    const selected = [];
    let hasContent = false;

    for (const node of nodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node.nodeName === 'BR') {
        if (!hasContent) continue;
        break;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        let txt = node.nodeValue || '';
        while (!hasContent && txt.length && (txt[0] === '\n' || txt[0] === '\r')) {
          txt = txt.slice(1);
          node.nodeValue = txt;
        }

        if (!txt.length) {
          selected.push(node);
          continue;
        }

        const idx = txt.search(/[\n\r]/);
        if (idx >= 0) {
          if (idx === 0) {
            if (!hasContent) {
              node.nodeValue = txt.slice(1);
              continue;
            }
            break;
          }

          const tail = node.splitText(idx);
          tail.nodeValue = tail.nodeValue.replace(/^\r?\n/, '');
          const br = td.ownerDocument.createElement('br');
          td.insertBefore(br, tail);

          selected.push(node);
          if (/\S/.test(node.nodeValue || '')) hasContent = true;
          break;
        }

        selected.push(node);
        if (/\S/.test(txt)) hasContent = true;
        continue;
      }

      selected.push(node);
      hasContent = true;
    }

    if (!selected.length || !hasContent) return;

    const wrap = td.ownerDocument.createElement('span');
    wrap.className = 'phm-bold-fragment';
    wrap.setAttribute('data-phm-firstline', '1');

    td.insertBefore(wrap, selected[0]);
    selected.forEach((n) => {
      if (n.parentNode === td) wrap.appendChild(n);
    });
  }

  function clearStyles(tr, td) {
    tr.style.background = '';
    td.style.padding = '';
    td.style.color = '';
    removeFirstLineWrapper(td);
  }

  function styleRow(tr, kind) {
    const bg = CFG.colors[kind] || '#eef2ff';
    const noBg = !!CFG.noBackgroundTypes[kind];
    tr.style.background = noBg ? '' : bg;
  }

  function styleCell(td, kind) {
    const fg = CFG.textColors[kind] || '#111827';
    const bold = !!CFG.boldTypes[kind];
    td.style.color = fg;
    td.style.padding = CFG.padding;
    applyBoldFirstLogicalLine(td, bold);
  }

  function walkDocuments(callback) {
    const visited = new Set();
    function walk(win) {
      if (!win || visited.has(win)) return;
      visited.add(win);

      let doc;
      try {
        doc = win.document;
      } catch {
        return;
      }
      if (!doc) return;

      callback(doc);

      const frames = doc.querySelectorAll('iframe, frame');
      frames.forEach((fr) => {
        try {
          if (fr.contentWindow) walk(fr.contentWindow);
        } catch {}
      });
    }
    walk(window);
  }

  function processDoc(doc) {
    if (!CFG.enabled) return;
    ensureDocStyle(doc);
    const rows = doc.querySelectorAll('table tr, .tabelaLista tr, tr');

    rows.forEach((tr) => {
      const cells = tr.children;
      if (!cells || cells.length < 2) return;
      const td = cells[1];
      const kind = matchKind(td.textContent || '');

      if (!kind) {
        clearStyles(tr, td);
        return;
      }

      styleRow(tr, kind);
      styleCell(td, kind);
    });
  }

  function reapply() {
    walkDocuments((doc) => {
      ensureDocStyle(doc);
      const rows = doc.querySelectorAll('table tr, .tabelaLista tr, tr');
      rows.forEach((tr) => {
        const cells = tr.children;
        if (!cells || cells.length < 2) return;
        clearStyles(tr, cells[1]);
      });
      processDoc(doc);
    });
  }

  function panelHtml() {
    const items = TYPES_ORDER.map((key) => {
      const label = DISPLAY_NAMES[key] || key;
      const bg = toHexColor(CFG.colors[key] || '#eef2ff');
      const fg = toHexColor(CFG.textColors[key] || '#111827');
      const enabled = CFG.enabledTypes[key] !== false ? 'checked' : '';
      const noBg = CFG.noBackgroundTypes[key] ? 'checked' : '';
      const bold = CFG.boldTypes[key] ? 'checked' : '';
      return `
        <div class="phm-row">
          <div class="phm-type">
            <input type="checkbox" data-phm-enabled="${key}" ${enabled}>
            <span>${label}</span>
          </div>
          <div class="phm-center"><input type="color" value="${bg}" data-phm-color-bg="${key}"></div>
          <div class="phm-center"><input type="color" value="${fg}" data-phm-color-fg="${key}"></div>
          <div class="phm-center"><label><input type="checkbox" data-phm-nobg="${key}" ${noBg}> Sem fundo</label></div>
          <div class="phm-center"><label><input type="checkbox" data-phm-bold="${key}" ${bold}> Negrito</label></div>
          <div class="phm-center"><span class="phm-chip" data-phm-chip="${key}">Exemplo</span></div>
        </div>
      `;
    }).join('');

    return `
      <div class="phm-head">
        <h3 class="phm-title">MOVIMENTAÇÕES</h3>
        <button class="phm-close" data-phm-action="close" title="Fechar">×</button>
      </div>
      <div class="phm-body">
        <div class="phm-grid-head">
          <div>Tipo</div>
          <div>Fundo</div>
          <div>Texto</div>
          <div>Opção</div>
          <div>Peso</div>
          <div>Prévia</div>
        </div>
        ${items}
      </div>
      <div class="phm-foot">
        <button class="phm-btn" data-phm-action="reset">Resetar</button>
        <button class="phm-btn phm-btn-save" data-phm-action="save">Salvar</button>
      </div>
    `;
  }

  function refreshPanelPreviews() {
    const panel = document.querySelector('.phm-panel');
    if (!panel) return;

    TYPES_ORDER.forEach((key) => {
      const chip = panel.querySelector(`[data-phm-chip="${CSS.escape(key)}"]`);
      const bgInput = panel.querySelector(`[data-phm-color-bg="${CSS.escape(key)}"]`);
      const fgInput = panel.querySelector(`[data-phm-color-fg="${CSS.escape(key)}"]`);
      const noBgInput = panel.querySelector(`[data-phm-nobg="${CSS.escape(key)}"]`);
      const boldInput = panel.querySelector(`[data-phm-bold="${CSS.escape(key)}"]`);
      if (!chip || !bgInput || !fgInput || !noBgInput || !boldInput) return;

      chip.style.background = noBgInput.checked ? 'transparent' : bgInput.value;
      chip.style.color = fgInput.value;
      chip.style.fontWeight = boldInput.checked ? '700' : '600';
    });
  }

  function ensurePanel() {
    if (document.querySelector('.phm-panel')) return;

    const panel = document.createElement('div');
    panel.className = 'phm-panel';
    panel.innerHTML = panelHtml();

    panel.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.matches('[data-phm-color-bg], [data-phm-color-fg], [data-phm-nobg], [data-phm-bold]')) {
        refreshPanelPreviews();
      }
    });

    panel.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-phm-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-phm-action');

      if (action === 'close') {
        panel.remove();
        return;
      }

      if (action === 'reset') {
        CFG = deepClone(DEFAULTS);
        saveCfg(CFG);
        panel.remove();
        ensurePanel();
        reapply();
        return;
      }

      if (action === 'save') {
        panel.querySelectorAll('[data-phm-enabled]').forEach((inp) => {
          CFG.enabledTypes[inp.getAttribute('data-phm-enabled')] = inp.checked;
        });
        panel.querySelectorAll('[data-phm-color-bg]').forEach((inp) => {
          CFG.colors[inp.getAttribute('data-phm-color-bg')] = inp.value;
        });
        panel.querySelectorAll('[data-phm-color-fg]').forEach((inp) => {
          CFG.textColors[inp.getAttribute('data-phm-color-fg')] = inp.value;
        });
        panel.querySelectorAll('[data-phm-nobg]').forEach((inp) => {
          CFG.noBackgroundTypes[inp.getAttribute('data-phm-nobg')] = inp.checked;
        });
        panel.querySelectorAll('[data-phm-bold]').forEach((inp) => {
          CFG.boldTypes[inp.getAttribute('data-phm-bold')] = inp.checked;
        });

        saveCfg(CFG);
        reapply();
      }
    });

    document.body.appendChild(panel);
    refreshPanelPreviews();
  }

  function togglePanel() {
    const panel = document.querySelector('.phm-panel');
    if (panel) panel.remove();
    else ensurePanel();
  }

  const docObservers = new WeakMap();
  const frameListeners = new WeakSet();
  let processRaf = 0;

  function scheduleProcess() {
    if (processRaf) return;
    processRaf = requestAnimationFrame(() => {
      processRaf = 0;
      CFG = readCfg();
      walkDocuments((doc) => processDoc(doc));
      ensureObservers();
    });
  }

  function observeDoc(doc) {
    if (!doc || !doc.documentElement || docObservers.has(doc)) return;
    ensureDocStyle(doc);
    const obs = new MutationObserver(() => scheduleProcess());
    obs.observe(doc.documentElement, { subtree: true, childList: true, characterData: true });
    docObservers.set(doc, obs);
  }

  function ensureObservers() {
    walkDocuments((doc) => {
      observeDoc(doc);
      const frames = doc.querySelectorAll('iframe, frame');
      frames.forEach((fr) => {
        if (frameListeners.has(fr)) return;
        frameListeners.add(fr);
        fr.addEventListener('load', () => scheduleProcess(), true);
      });
    });
  }

  function boot() {
    GM_registerMenuCommand('Abrir Painel', togglePanel);
    ensureObservers();
    scheduleProcess();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();