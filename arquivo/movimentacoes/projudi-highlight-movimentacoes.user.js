// ==UserScript==
// @name         Destaque de Movimentações
// @namespace    projudi-highlight-movimentacoes.user.js
// @version      1.7
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
  let previousBodyOverflow = '';

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
      z-index: 2147483647;
      background: rgba(11, 18, 32, .5);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }

    .phm-panel {
      width: min(980px, calc(100vw - 24px));
      max-height: min(88vh, 760px);
      border-radius: 14px;
      border: 1px solid #dbe3ef;
      background: #ffffff;
      box-shadow: 0 24px 70px rgba(2, 6, 23, .30);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      color: #0f172a;
      font: 14px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      transform: translateY(6px) scale(.985);
      opacity: .96;
      animation: phm-pop-in .16s ease forwards;
    }

    @keyframes phm-pop-in {
      from { transform: translateY(6px) scale(.985); opacity: .96; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }

    .phm-panel *,
    .phm-panel *::before,
    .phm-panel *::after {
      box-sizing: border-box;
    }

    .phm-overlay button,
    .phm-overlay input,
    .phm-overlay label,
    .phm-overlay span {
      text-indent: 0 !important;
      letter-spacing: normal !important;
      text-transform: none !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important;
    }

    .phm-head {
      flex: 0 0 auto;
      padding: 14px 16px;
      color: #ffffff;
      background: linear-gradient(135deg, #0f3e75, #1f5ca4);
      border-bottom: 1px solid #dbe3ef;
    }

    .phm-head-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .phm-title-wrap {
      min-width: 0;
    }

    .phm-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      line-height: 1.2;
      color: #ffffff !important;
      text-transform: none !important;
      text-decoration: none !important;
      border: 0 !important;
      border-bottom: 0 !important;
      padding: 0 !important;
    }

    .phm-subtitle {
      margin: 2px 0 0;
      font-size: 12px;
      opacity: .92;
      color: #ffffff !important;
      text-transform: none !important;
      text-decoration: none !important;
      border: 0 !important;
      border-bottom: 0 !important;
      padding: 0 !important;
    }

    .phm-close {
      border: 0;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      background: rgba(255, 255, 255, .2);
      color: #ffffff;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
    }

    .phm-close:hover {
      background: rgba(255, 255, 255, .3);
    }

    .phm-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 12px 14px;
      background: #f8fafc;
    }

    .phm-grid-head,
    .phm-row {
      display: grid;
      grid-template-columns: minmax(240px, 1.4fr) 78px 78px 116px 104px 104px;
      align-items: center;
      gap: 10px;
    }

    .phm-grid-head {
      padding: 9px 12px;
      margin-bottom: 8px;
      border: 1px solid #d3dce8;
      border-radius: 10px;
      background: #e2e8f0;
      color: #334155;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .35px;
    }

    .phm-row {
      padding: 10px 12px;
      margin-bottom: 10px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      background: #ffffff;
    }

    .phm-type {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .phm-type input[type='checkbox'] {
      width: 18px;
      height: 18px;
      margin: 0;
      cursor: pointer;
    }

    .phm-type span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 600;
      color: #1e293b;
      font-size: 14px;
      line-height: 1.2;
    }

    .phm-center {
      display: flex;
      justify-content: center;
      align-items: center;
      min-width: 0;
    }

    .phm-center input[type='color'] {
      width: 56px;
      height: 34px;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      padding: 3px;
      background: #fff;
      cursor: pointer;
    }

    .phm-center label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #334155;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
    }

    .phm-center label input[type='checkbox'] {
      width: 18px;
      height: 18px;
      margin: 0;
      cursor: pointer;
    }

    .phm-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 92px;
      height: 34px;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 700;
      color: #111827;
      padding: 0 10px;
    }

    .phm-foot {
      flex: 0 0 auto;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
      background: #f8fafc;
    }

    .phm-btn {
      min-width: 86px;
      padding: 7px 11px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.2;
      color: #1e293b;
      background: #ffffff;
      border: 1px solid #cbd5e1;
    }

    .phm-btn:hover {
      background: #f8fafc;
    }

    .phm-btn-save {
      color: #ffffff;
      background: #0f3e75;
      border-color: #0f3e75;
      font-weight: 600;
    }

    .phm-btn-save:hover {
      background: #0d3562;
    }

    @media (max-width: 1040px) {
      .phm-grid-head {
        display: none;
      }

      .phm-row {
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .phm-type {
        grid-column: 1 / -1;
      }

      .phm-center {
        justify-content: flex-start;
      }
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
        <div class="phm-head-bar">
          <div class="phm-title-wrap">
            <h3 class="phm-title">Ajuste de Movimentações</h3>
            <p class="phm-subtitle">Configurações visuais do Projudi</p>
          </div>
          <button class="phm-close" data-phm-action="close" title="Fechar">×</button>
        </div>
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
        <button class="phm-btn" data-phm-action="reset">Padrão</button>
        <button class="phm-btn" data-phm-action="cancel">Fechar</button>
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
    if (document.body) document.body.style.overflow = previousBodyOverflow;
  }

  function ensurePanel() {
    if (document.querySelector('.phm-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'phm-overlay';
    overlay.innerHTML = `<div class="phm-panel" role="dialog" aria-modal="true">${panelHtml()}</div>`;
    previousBodyOverflow = document.body ? document.body.style.overflow : '';

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

      if (action === 'cancel') {
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
    if (document.body) document.body.style.overflow = 'hidden';
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