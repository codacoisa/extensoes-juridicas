// ==UserScript==
// @name         Destaque de Movimentações
// @namespace    projudi-highlight-movimentacoes.user.js
// @version      1.6
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Destaca as movimentações processuais em cores definidas.
// @author       lourencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/5ffde04a50de4c905c398bee2b9ae2ed/raw/projudi-highlight-movimentacoes.user.js
// @downloadURL  https://gist.githubusercontent.com/lourencosv/5ffde04a50de4c905c398bee2b9ae2ed/raw/projudi-highlight-movimentacoes.user.js
// @match        *://projudi.tjgo.jus.br/*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
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
    'Relatório',
    'Juntada Documento Histórico Processo Físico'
  ];

  const DISPLAY_NAMES = {
    'Despacho Autos ao Contador': 'Autos ao Contador',
    'Juntada Documento Histórico Processo Físico': 'Histórico Proc. Físico'
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
      'Relatório': '#eedbdb',
      'Juntada Documento Histórico Processo Físico': '#d1effc'
    },
    textColors: TYPES_ORDER.reduce((acc, k) => {
      acc[k] = '#111827';
      return acc;
    }, {}),
    enabledTypes: TYPES_ORDER.reduce((acc, k) => {
      acc[k] = true;
      return acc;
    }, {}),
    noBackgroundTypes: TYPES_ORDER.reduce((acc, k) => {
      acc[k] = false;
      return acc;
    }, {}),
    boldTypes: TYPES_ORDER.reduce((acc, k) => {
      acc[k] = true;
      return acc;
    }, {})
  };

  const STORAGE_KEY = 'projudi_highlight_movs_cfg_v26';
  const DOC_STYLE_ID = 'phm-doc-style-v26';
  const MENU_LABEL = 'Abrir Painel';
  let menuCommandId = null;

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
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  let CFG = readCfg();

  GM_addStyle(`
    .phm-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      background: rgba(2, 6, 23, 0.45);
      backdrop-filter: blur(2px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .phm-panel {
      width: min(840px, calc(100vw - 24px));
      max-height: min(86vh, 720px);
      border: 1px solid #d8dee8;
      border-radius: 14px;
      background: #ffffff;
      box-shadow: 0 24px 64px rgba(15, 23, 42, 0.24);
      font: 13px/1.35 'Segoe UI', 'SF Pro Text', -apple-system, BlinkMacSystemFont, Roboto, Ubuntu, sans-serif;
      color: #0f172a;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform: translateY(0);
      animation: phm-pop-in 0.14s ease-out;
    }

    @keyframes phm-pop-in {
      from { opacity: 0; transform: translateY(6px) scale(.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .phm-panel * { box-sizing: border-box; }

    .phm-head {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 1px solid #e2e8f0;
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    }

    .phm-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .phm-title {
      margin: 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.2px;
    }

    .phm-subtitle {
      margin: 0;
      color: #475569;
      font-size: 12px;
      font-weight: 500;
    }

    .phm-close {
      border: 1px solid #d1d5db;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: #ffffff;
      color: #0f172a;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
    }

    .phm-close:hover { background: #f1f5f9; }

    .phm-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 10px 12px;
      background: #f8fafc;
    }

    .phm-grid-head,
    .phm-row {
      display: grid;
      grid-template-columns: minmax(190px, 1.2fr) 68px 68px 104px 88px 88px;
      align-items: center;
      gap: 10px;
    }

    .phm-grid-head {
      position: relative;
      top: auto;
      z-index: auto;
      margin-bottom: 8px;
      padding: 8px 10px;
      border: 1px solid #dbe3ef;
      border-radius: 9px;
      background: #eff6ff;
      color: #334155;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .25px;
    }

    .phm-row {
      margin-bottom: 8px;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 9px;
      background: #ffffff;
    }

    .phm-type {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-weight: 600;
      color: #1e293b;
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

    .phm-center input[type='color'] {
      width: 56px;
      height: 30px;
      border: 1px solid #d1d5db;
      border-radius: 999px;
      padding: 2px;
      background: transparent;
      cursor: pointer;
    }

    .phm-center label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      color: #334155;
      white-space: nowrap;
      font-size: 12px;
    }

    .phm-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 74px;
      height: 30px;
      border-radius: 999px;
      border: 1px solid #cbd5e1;
      font-size: 12px;
      font-weight: 600;
      color: #0f172a;
      padding: 0 8px;
    }

    .phm-foot {
      flex: 0 0 auto;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 10px 12px 12px;
      border-top: 1px solid #e2e8f0;
      background: #ffffff;
    }

    .phm-btn {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #ffffff;
      color: #0f172a;
      font-weight: 700;
      font-size: 12px;
      padding: 7px 11px;
      cursor: pointer;
    }

    .phm-btn:hover { background: #f8fafc; }

    .phm-btn-save {
      border-color: #1d4ed8;
      background: #2563eb;
      color: #ffffff;
    }

    .phm-btn-save:hover { background: #1d4ed8; }

    @media (max-width: 920px) {
      .phm-overlay { padding: 10px; }
      .phm-panel { width: 100%; max-height: 90vh; }
      .phm-grid-head { display: none; }
      .phm-row {
        grid-template-columns: 1fr 1fr;
        gap: 8px;
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
    {
      key: 'Juntada Documento Histórico Processo Físico',
      re: /^\s*Juntada\s+de\s+Documento\s*(?:\r?\n|\s+)\s*Hist[óo]rico\s+Processo\s+F[ií]sico\b/iu
    },
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
          <div class="phm-center"><input type="color" value="${bg}" data-phm-color-bg="${key}" title="Cor de fundo"></div>
          <div class="phm-center"><input type="color" value="${fg}" data-phm-color-fg="${key}" title="Cor do texto"></div>
          <div class="phm-center"><label><input type="checkbox" data-phm-nobg="${key}" ${noBg}> Sem fundo</label></div>
          <div class="phm-center"><label><input type="checkbox" data-phm-bold="${key}" ${bold}> Negrito</label></div>
          <div class="phm-center"><span class="phm-chip" data-phm-chip="${key}">Prévia</span></div>
        </div>
      `;
    }).join('');

    return `
      <div class="phm-head">
        <div class="phm-title-wrap">
          <h3 class="phm-title">Movimentações</h3>
          <p class="phm-subtitle">Configuração visual dos destaques</p>
        </div>
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

  function refreshPanelPreviews(root) {
    TYPES_ORDER.forEach((key) => {
      const chip = root.querySelector(`[data-phm-chip="${CSS.escape(key)}"]`);
      const bgInput = root.querySelector(`[data-phm-color-bg="${CSS.escape(key)}"]`);
      const fgInput = root.querySelector(`[data-phm-color-fg="${CSS.escape(key)}"]`);
      const noBgInput = root.querySelector(`[data-phm-nobg="${CSS.escape(key)}"]`);
      const boldInput = root.querySelector(`[data-phm-bold="${CSS.escape(key)}"]`);
      if (!chip || !bgInput || !fgInput || !noBgInput || !boldInput) return;

      chip.style.background = noBgInput.checked ? 'transparent' : bgInput.value;
      chip.style.color = fgInput.value;
      chip.style.fontWeight = boldInput.checked ? '700' : '600';
    });
  }

  function closePanel() {
    const overlay = document.querySelector('.phm-overlay');
    if (overlay) overlay.remove();
  }

  function ensurePanel() {
    if (document.querySelector('.phm-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'phm-overlay';
    overlay.innerHTML = `<div class="phm-panel" role="dialog" aria-modal="true">${panelHtml()}</div>`;

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) closePanel();
    });

    overlay.addEventListener('input', (ev) => {
      const t = ev.target;
      if (
        t.matches('[data-phm-color-bg], [data-phm-color-fg], [data-phm-nobg], [data-phm-bold]')
      ) {
        refreshPanelPreviews(overlay);
      }
    });

    overlay.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-phm-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-phm-action');

      if (action === 'close') {
        closePanel();
        return;
      }

      if (action === 'reset') {
        CFG = deepClone(DEFAULTS);
        saveCfg(CFG);
        closePanel();
        ensurePanel();
        reapply();
        return;
      }

      if (action === 'save') {
        overlay.querySelectorAll('[data-phm-enabled]').forEach((inp) => {
          CFG.enabledTypes[inp.getAttribute('data-phm-enabled')] = inp.checked;
        });

        overlay.querySelectorAll('[data-phm-color-bg]').forEach((inp) => {
          CFG.colors[inp.getAttribute('data-phm-color-bg')] = inp.value;
        });

        overlay.querySelectorAll('[data-phm-color-fg]').forEach((inp) => {
          CFG.textColors[inp.getAttribute('data-phm-color-fg')] = inp.value;
        });

        overlay.querySelectorAll('[data-phm-nobg]').forEach((inp) => {
          CFG.noBackgroundTypes[inp.getAttribute('data-phm-nobg')] = inp.checked;
        });

        overlay.querySelectorAll('[data-phm-bold]').forEach((inp) => {
          CFG.boldTypes[inp.getAttribute('data-phm-bold')] = inp.checked;
        });

        saveCfg(CFG);
        reapply();
        closePanel();
      }
    });

    document.body.appendChild(overlay);
    refreshPanelPreviews(overlay);
  }

  function togglePanel() {
    const overlay = document.querySelector('.phm-overlay');
    if (overlay) closePanel();
    else ensurePanel();
  }

  function registerMenu(force = false) {
    try {
      if (force && menuCommandId !== null && typeof GM_unregisterMenuCommand === 'function') {
        GM_unregisterMenuCommand(menuCommandId);
        menuCommandId = null;
      }
    } catch {}

    if (menuCommandId !== null) return;
    try {
      menuCommandId = GM_registerMenuCommand(MENU_LABEL, togglePanel);
    } catch {}
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

  function reviveAfterReturn() {
    registerMenu(true);
    scheduleProcess();
  }

  function boot() {
    registerMenu(false);
    ensureObservers();
    scheduleProcess();

    window.addEventListener('pageshow', reviveAfterReturn, true);
    window.addEventListener('focus', reviveAfterReturn, true);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reviveAfterReturn();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closePanel();
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();