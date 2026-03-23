// ==UserScript==
// @name         Movimentações
// @namespace    projudi-movimentacoes.user.js
// @version      2.6
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Destaca as movimentações processuais em cores definidas.
// @author       lourencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/5ffde04a50de4c905c398bee2b9ae2ed/raw/projudi-movimentacoes.user.js
// @downloadURL  https://gist.githubusercontent.com/lourencosv/5ffde04a50de4c905c398bee2b9ae2ed/raw/projudi-movimentacoes.user.js
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

  const USER_DEFAULT_RED_TYPES = new Set([
    'Despacho',
    'Decisão',
    'Julgamento',
    'Despacho Autos ao Contador',
    'Relatório'
  ]);

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
    textColorsMov: TYPES_ORDER.reduce((acc, k) => {
      acc[k] = '#111827';
      return acc;
    }, {}),
    textColorsUser: TYPES_ORDER.reduce((acc, k) => {
      acc[k] = USER_DEFAULT_RED_TYPES.has(k) ? '#dc2626' : '#111827';
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
    boldTypesMov: TYPES_ORDER.reduce((acc, k) => {
      acc[k] = true;
      return acc;
    }, {}),
    italicTypesMov: TYPES_ORDER.reduce((acc, k) => {
      acc[k] = false;
      return acc;
    }, {}),
    boldTypesUser: TYPES_ORDER.reduce((acc, k) => {
      acc[k] = USER_DEFAULT_RED_TYPES.has(k);
      return acc;
    }, {}),
    italicTypesUser: TYPES_ORDER.reduce((acc, k) => {
      acc[k] = false;
      return acc;
    }, {}),
    targets: {
      mov: TYPES_ORDER.reduce((acc, k) => {
        acc[k] = true;
        return acc;
      }, {}),
      user: TYPES_ORDER.reduce((acc, k) => {
        acc[k] = USER_DEFAULT_RED_TYPES.has(k);
        return acc;
      }, {})
    },
    movTextMode: 'first-line'
  };

  const STORAGE_KEY = 'projudi_highlight_movs_cfg_v28';
  const DOC_STYLE_ID = 'phm-doc-style-v28';
  const PANEL_OVERLAY_ID = 'phm-overlay-root';
  const MOV_TABLE_ROWS_SELECTOR = '#TabelaArquivos tbody tr, #tabListaProcesso tr';
  const MOV_TABLES_SELECTOR = '#TabelaArquivos, #tabListaProcesso';
  const LOG_PREFIX = '[Movimentações]';
  const PAGE_ORIGIN = window.location.origin;
  let menuCommandId = null;

  function logInfo(message, meta) {
    if (meta === undefined) {
      console.info(LOG_PREFIX, message);
      return;
    }
    console.info(LOG_PREFIX, message, meta);
  }

  function logWarn(message, meta) {
    if (meta === undefined) {
      console.warn(LOG_PREFIX, message);
      return;
    }
    console.warn(LOG_PREFIX, message, meta);
  }

  function logError(message, error) {
    console.error(LOG_PREFIX, message, error);
  }

  function safeRun(label, task, fallbackValue) {
    try {
      return task();
    } catch (error) {
      logError(label, error);
      return fallbackValue;
    }
  }

  function lockBodyScroll(doc = document) {
    const body = doc && doc.body;
    if (!body) return () => {};
    const win = (doc && doc.defaultView) || window;
    const KEY = "__pjBodyScrollLock__";
    const state = win[KEY] || (win[KEY] = { count: 0, prevOverflow: "" });
    if (state.count === 0) {
      state.prevOverflow = body.style.overflow;
      body.style.overflow = "hidden";
    }
    state.count += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      state.count = Math.max(0, state.count - 1);
      if (state.count === 0) body.style.overflow = state.prevOverflow;
    };
  }

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
      if (!raw) return deepClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      const cfg = deepMerge(deepClone(DEFAULTS), parsed);

      if (parsed && parsed.textColors && typeof parsed.textColors === 'object') {
        Object.keys(parsed.textColors).forEach((k) => {
          const val = parsed.textColors[k];
          cfg.textColorsMov[k] = val;
          if (!parsed.textColorsUser) cfg.textColorsUser[k] = val;
        });
      }

      if (parsed && parsed.boldTypes && typeof parsed.boldTypes === 'object') {
        Object.keys(parsed.boldTypes).forEach((k) => {
          const val = !!parsed.boldTypes[k];
          cfg.boldTypesMov[k] = val;
          if (!parsed.boldTypesUser) cfg.boldTypesUser[k] = val;
        });
      }

      if (parsed && parsed.italicTypes && typeof parsed.italicTypes === 'object') {
        Object.keys(parsed.italicTypes).forEach((k) => {
          const val = !!parsed.italicTypes[k];
          cfg.italicTypesMov[k] = val;
          if (!parsed.italicTypesUser) cfg.italicTypesUser[k] = val;
        });
      }

      if (!cfg.targets || typeof cfg.targets !== 'object') cfg.targets = { mov: {}, user: {} };
      if (!cfg.targets.mov) cfg.targets.mov = {};
      if (!cfg.targets.user) cfg.targets.user = {};
      delete cfg.targets.row;

      if (cfg.movTextMode !== 'first-line' && cfg.movTextMode !== 'full') {
        cfg.movTextMode = 'first-line';
      }

      return cfg;
    } catch (error) {
      logWarn('Falha ao ler configuração. Voltando para o padrão.', error);
      return deepClone(DEFAULTS);
    }
  }

  function saveCfg(cfg) {
    safeRun('Falha ao salvar configuração.', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    });
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
    #${PANEL_OVERLAY_ID} {
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

    #${PANEL_OVERLAY_ID} .phm-panel {
      width: min(980px, calc(100vw - 24px));
      max-height: min(88vh, 860px);
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

    #${PANEL_OVERLAY_ID} .phm-panel *,
    #${PANEL_OVERLAY_ID} .phm-panel *::before,
    #${PANEL_OVERLAY_ID} .phm-panel *::after {
      box-sizing: border-box;
    }

    #${PANEL_OVERLAY_ID} button,
    #${PANEL_OVERLAY_ID} input,
    #${PANEL_OVERLAY_ID} label,
    #${PANEL_OVERLAY_ID} span {
      text-indent: 0 !important;
      letter-spacing: normal !important;
      text-transform: none !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important;
    }

    #${PANEL_OVERLAY_ID} .phm-head {
      flex: 0 0 auto;
      padding: 14px 16px;
      color: #ffffff;
      background: linear-gradient(135deg, #0f3e75, #1f5ca4);
      border-bottom: 1px solid #dbe3ef;
    }

    #${PANEL_OVERLAY_ID} .phm-head-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    #${PANEL_OVERLAY_ID} .phm-title-wrap {
      min-width: 0;
    }

    #${PANEL_OVERLAY_ID} .phm-title {
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

    #${PANEL_OVERLAY_ID} .phm-subtitle {
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

    #${PANEL_OVERLAY_ID} .phm-close {
      border: 0;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      background: rgba(255, 255, 255, .2);
      color: #ffffff;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.2;
    }

    #${PANEL_OVERLAY_ID} .phm-close:hover {
      background: rgba(255, 255, 255, .3);
    }

    #${PANEL_OVERLAY_ID} .phm-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 14px;
      background: linear-gradient(180deg, #f8fbff 0%, #f2f6fc 100%);
    }

    #${PANEL_OVERLAY_ID} .phm-global {
      border: 1px solid #d5dfec;
      border-radius: 14px;
      background: #ffffff;
      padding: 12px 14px;
      margin-top: 12px;
    }

    #${PANEL_OVERLAY_ID} .phm-global-title {
      margin: 0 0 8px;
      color: #0b2545;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .35px;
      text-align: center;
    }

    #${PANEL_OVERLAY_ID} .phm-global-options {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: center;
    }

    #${PANEL_OVERLAY_ID} .phm-global-options label {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 8px 10px;
      border: 1px solid #d6e0ec;
      border-radius: 999px;
      background: #f8fbff;
      color: #243b55;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    #${PANEL_OVERLAY_ID} .phm-global-options input[type='radio'] {
      margin: 0;
      accent-color: #0f3e75;
    }

    #${PANEL_OVERLAY_ID} .phm-accordion {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }

    #${PANEL_OVERLAY_ID} .phm-rule {
      border: 1px solid #cfdae9;
      border-radius: 14px;
      background: #ffffff;
      overflow: hidden;
    }

    #${PANEL_OVERLAY_ID} .phm-rule.is-disabled {
      opacity: .62;
    }

    #${PANEL_OVERLAY_ID} .phm-rule-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 11px 13px;
      background: linear-gradient(180deg, #ffffff 0%, #f6f9ff 100%);
      cursor: pointer;
      user-select: none;
      list-style: none;
    }

    #${PANEL_OVERLAY_ID} .phm-rule-head::-webkit-details-marker {
      display: none;
    }

    #${PANEL_OVERLAY_ID} .phm-rule:not([open]) .phm-rule-head {
      border-bottom: 0;
    }

    #${PANEL_OVERLAY_ID} .phm-rule[open] .phm-rule-head {
      border-bottom: 1px solid #e5edf8;
    }

    #${PANEL_OVERLAY_ID} .phm-rule-content {
      padding: 12px 13px;
      background: #ffffff;
    }

    #${PANEL_OVERLAY_ID} .phm-type {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
      cursor: pointer;
    }

    #${PANEL_OVERLAY_ID} .phm-type input[type='checkbox'] {
      width: 18px;
      height: 18px;
      margin: 0;
      cursor: pointer;
    }

    #${PANEL_OVERLAY_ID} .phm-type span {
      overflow: hidden;
      white-space: normal;
      font-weight: 600;
      color: #1e293b;
      font-size: 15px;
      line-height: 1.2;
    }

    #${PANEL_OVERLAY_ID} .phm-rule-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(180px, 1fr));
      gap: 10px;
      align-items: start;
    }

    #${PANEL_OVERLAY_ID} .phm-field {
      min-width: 0;
      border: 1px solid #dbe6f3;
      border-radius: 12px;
      background: #f8fbff;
      padding: 9px 10px;
    }

    #${PANEL_OVERLAY_ID} .phm-field-title {
      margin: 0 0 6px;
      color: #51667f;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .35px;
      text-align: center;
    }

    #${PANEL_OVERLAY_ID} .phm-field-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    #${PANEL_OVERLAY_ID} .phm-center {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
    }

    #${PANEL_OVERLAY_ID} .phm-options-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      flex-wrap: wrap;
      width: 100%;
    }

    #${PANEL_OVERLAY_ID} .phm-center input[type='color'] {
      width: 56px;
      height: 34px;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      padding: 3px;
      background: #fff;
      cursor: pointer;
    }

    #${PANEL_OVERLAY_ID} .phm-center label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #334b66;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
    }

    #${PANEL_OVERLAY_ID} .phm-center label input[type='checkbox'] {
      width: 16px;
      height: 16px;
      margin: 0;
      cursor: pointer;
    }

    #${PANEL_OVERLAY_ID} .phm-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 88px;
      height: 32px;
      border: 1px solid #ccd7e5;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      color: #111827;
      padding: 0 10px;
    }

    #${PANEL_OVERLAY_ID} .phm-foot {
      flex: 0 0 auto;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #dbe3ef;
      background: #f8fafc;
    }

    #${PANEL_OVERLAY_ID} .phm-btn {
      min-width: 86px;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.2;
      color: #1e293b;
      background: #ffffff;
      border: 1px solid #cbd5e1;
    }

    #${PANEL_OVERLAY_ID} .phm-btn:hover {
      background: #f8fafc;
    }

    #${PANEL_OVERLAY_ID} .phm-btn-save {
      color: #ffffff;
      background: #0f3e75;
      border-color: #0f3e75;
      font-weight: 600;
    }

    #${PANEL_OVERLAY_ID} .phm-btn-save:hover {
      background: #0d3562;
    }

    @media (max-width: 1040px) {
      #${PANEL_OVERLAY_ID} .phm-body {
        padding: 12px;
      }

      #${PANEL_OVERLAY_ID} .phm-foot {
        padding: 10px 12px;
      }

      #${PANEL_OVERLAY_ID} .phm-rule-head {
        padding: 10px 11px;
      }

      #${PANEL_OVERLAY_ID} .phm-rule-content {
        padding: 10px 11px;
      }

      #${PANEL_OVERLAY_ID} .phm-rule-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 700px) {
      #${PANEL_OVERLAY_ID} .phm-rule-head {
        flex-direction: column;
        align-items: flex-start;
      }

      #${PANEL_OVERLAY_ID} .phm-rule-grid {
        grid-template-columns: 1fr;
      }
    }
  `);

  function ensureDocStyle(doc) {
    safeRun('Falha ao injetar estilo do documento.', () => {
      if (!doc || !doc.head) return;
      if (doc.getElementById(DOC_STYLE_ID)) return;
      const style = doc.createElement('style');
      style.id = DOC_STYLE_ID;
      style.textContent = `
        .phm-bold-fragment, .phm-bold-fragment * { font-weight: 700 !important; }
        .phm-italic-fragment, .phm-italic-fragment * { font-style: italic !important; }
      `;
      doc.head.appendChild(style);
    });
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
    const wrappers = td.querySelectorAll('span.phm-format-fragment[data-phm-firstline="1"]');
    wrappers.forEach((wrap) => {
      const parent = wrap.parentNode;
      if (!parent) return;
      while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap);
      parent.removeChild(wrap);
    });
  }

  function applyFirstLogicalLineFormat(td, kind) {
    removeFirstLineWrapper(td);
    if (!kind) return;

    const bold = !!CFG.boldTypesMov[kind];
    const italic = !!CFG.italicTypesMov[kind];
    if (!bold && !italic) return;

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
    wrap.className = 'phm-format-fragment';
    if (bold) wrap.classList.add('phm-bold-fragment');
    if (italic) wrap.classList.add('phm-italic-fragment');
    wrap.setAttribute('data-phm-firstline', '1');

    td.insertBefore(wrap, selected[0]);
    selected.forEach((n) => {
      if (n.parentNode === td) wrap.appendChild(n);
    });
  }

  function clearStyles(tr, movTd, userTd) {
    tr.style.background = '';
    tr.removeAttribute('data-phm-styled');

    const cells = tr.children ? Array.from(tr.children) : [];
    cells.forEach((cell) => {
      cell.style.color = '';
      cell.style.fontWeight = '';
      cell.style.fontStyle = '';
    });

    if (movTd) {
      movTd.style.padding = '';
      removeFirstLineWrapper(movTd);
    }

    if (userTd) {
      userTd.style.color = '';
      userTd.style.fontWeight = '';
      userTd.style.fontStyle = '';
    }
  }

  function isTargetEnabled(kind, target) {
    return !!(CFG.targets && CFG.targets[target] && CFG.targets[target][kind]);
  }

  function styleRow(tr, kind) {
    const bg = CFG.colors[kind] || '#eef2ff';
    const noBg = !!CFG.noBackgroundTypes[kind];
    tr.style.background = noBg ? '' : bg;
  }

  function styleCell(td, kind) {
    if (!isTargetEnabled(kind, 'mov')) return;
    const fg = CFG.textColorsMov[kind] || '#111827';
    const bold = !!CFG.boldTypesMov[kind];
    const italic = !!CFG.italicTypesMov[kind];
    const useFirstLineMode = CFG.movTextMode !== 'full';

    td.style.color = fg;
    td.style.padding = CFG.padding;

    if (useFirstLineMode) {
      td.style.fontWeight = '';
      td.style.fontStyle = '';
      applyFirstLogicalLineFormat(td, kind);
    } else {
      removeFirstLineWrapper(td);
      td.style.fontWeight = bold ? '700' : '400';
      td.style.fontStyle = italic ? 'italic' : 'normal';
    }
  }

  function styleUserCell(td, kind) {
    if (!td || !isTargetEnabled(kind, 'user')) return;
    const fg = CFG.textColorsUser[kind] || '#111827';
    const bold = !!CFG.boldTypesUser[kind];
    const italic = !!CFG.italicTypesUser[kind];
    td.style.color = fg;
    td.style.fontWeight = bold ? '700' : '400';
    td.style.fontStyle = italic ? 'italic' : 'normal';
  }

  function getMovCell(tr) {
    return tr.querySelector('td.filtro_coluna_movimentacao');
  }

  function getUserCell(tr) {
    const cells = tr.children;
    if (!cells || cells.length < 4) return null;
    return cells[3];
  }

  /**
   * Resolves the frame src using the owner document base URI.
   * @param {HTMLIFrameElement|HTMLFrameElement} frame
   * @returns {URL|null}
   */
  function resolveFrameUrl(frame) {
    if (!frame || typeof frame.getAttribute !== 'function') return null;
    const rawSrc = String(frame.getAttribute('src') || '').trim();
    if (!rawSrc) return null;
    try {
      return new URL(rawSrc, (frame.ownerDocument && frame.ownerDocument.baseURI) || document.baseURI);
    } catch {
      return null;
    }
  }

  /**
   * Avoids touching frames that are explicitly cross-origin, such as file previews hosted on S3.
   * @param {HTMLIFrameElement|HTMLFrameElement} frame
   * @returns {boolean}
   */
  function isTrackableFrame(frame) {
    const frameUrl = resolveFrameUrl(frame);
    if (!frameUrl) return true;
    if (frameUrl.protocol === 'about:') return frameUrl.href === 'about:blank';
    if (frameUrl.protocol !== 'http:' && frameUrl.protocol !== 'https:') return false;
    return frameUrl.origin === PAGE_ORIGIN;
  }

  /**
   * Returns the document of a same-origin frame when it is accessible.
   * Cross-origin or not-yet-ready frames are skipped silently.
   * @param {HTMLIFrameElement|HTMLFrameElement} frame
   * @returns {Document|null}
   */
  function getAccessibleFrameDocument(frame) {
    if (!frame) return null;
    if (!isTrackableFrame(frame)) return null;
    try {
      const frameDoc = frame.contentDocument;
      if (frameDoc && frameDoc.documentElement) return frameDoc;
    } catch {
      return null;
    }

    try {
      const frameWindow = frame.contentWindow;
      if (!frameWindow || !frameWindow.document || !frameWindow.document.documentElement) {
        return null;
      }
      return frameWindow.document;
    } catch {
      return null;
    }
  }

  function walkDocuments(callback) {
    const visited = new WeakSet();

    function walk(doc) {
      if (!doc || visited.has(doc)) return;
      visited.add(doc);
      callback(doc);

      const frames = doc.querySelectorAll('iframe, frame');
      frames.forEach((fr) => {
        if (!isTrackableFrame(fr)) return;
        const frameDoc = getAccessibleFrameDocument(fr);
        if (frameDoc) walk(frameDoc);
      });
    }

    walk(document);
  }

  function buildConfigSignature() {
    return JSON.stringify({
      enabled: CFG.enabled,
      padding: CFG.padding,
      colors: CFG.colors,
      textColorsMov: CFG.textColorsMov,
      textColorsUser: CFG.textColorsUser,
      enabledTypes: CFG.enabledTypes,
      noBackgroundTypes: CFG.noBackgroundTypes,
      boldTypesMov: CFG.boldTypesMov,
      italicTypesMov: CFG.italicTypesMov,
      boldTypesUser: CFG.boldTypesUser,
      italicTypesUser: CFG.italicTypesUser,
      targets: CFG.targets,
      movTextMode: CFG.movTextMode
    });
  }

  function buildRowSignature(movText, userText, kind, configSignature) {
    return [kind || '', movText.trim(), userText.trim(), configSignature].join('||');
  }

  const rowStateCache = new WeakMap();
  let configSignature = buildConfigSignature();

  /**
   * Applies or clears styling for a single table row based on cached state.
   * @param {HTMLTableRowElement} row
   */
  function processRow(row) {
    const movTd = getMovCell(row);
    const userTd = getUserCell(row);
    if (!movTd) return;

    const movText = movTd.textContent || '';
    const userText = userTd ? (userTd.textContent || '') : '';
    const kind = CFG.enabled ? matchKind(movText) : null;
    const signature = buildRowSignature(movText, userText, kind, configSignature);
    const previous = rowStateCache.get(row);

    if (previous && previous.signature === signature) return;

    if (!kind) {
      clearStyles(row, movTd, userTd);
      rowStateCache.set(row, { signature, kind: null });
      return;
    }

    styleRow(row, kind);
    styleCell(movTd, kind);
    styleUserCell(userTd, kind);
    row.setAttribute('data-phm-styled', '1');
    rowStateCache.set(row, { signature, kind });
  }

  /**
   * Processes all movement rows contained in a table.
   * @param {Document} doc
   * @param {Element} table
   */
  function processTable(doc, table) {
    ensureDocStyle(doc);
    const rows = table.querySelectorAll('tbody tr, tr');
    rows.forEach((row) => processRow(row));
  }

  function processDoc(doc) {
    if (!doc) return;
    const tables = doc.querySelectorAll(MOV_TABLES_SELECTOR);
    tables.forEach((table) => processTable(doc, table));
  }

  function reapply() {
    configSignature = buildConfigSignature();
    walkDocuments((doc) => {
      safeRun('Falha ao reaplicar destaques.', () => {
        ensureDocStyle(doc);
        const rows = doc.querySelectorAll('tr[data-phm-styled="1"]');
        rows.forEach((row) => {
          rowStateCache.delete(row);
          clearStyles(row, getMovCell(row), getUserCell(row));
        });
        processDoc(doc);
      });
    });
  }

  function panelHtml() {
    const items = TYPES_ORDER.map((key) => {
      const label = DISPLAY_NAMES[key] || key;
      const bg = toHexColor(CFG.colors[key] || '#eef2ff');
      const fgMov = toHexColor(CFG.textColorsMov[key] || '#111827');
      const fgUser = toHexColor(CFG.textColorsUser[key] || '#111827');
      const enabled = CFG.enabledTypes[key] !== false ? 'checked' : '';
      const noBg = CFG.noBackgroundTypes[key] ? 'checked' : '';
      const boldMov = CFG.boldTypesMov[key] ? 'checked' : '';
      const italicMov = CFG.italicTypesMov[key] ? 'checked' : '';
      const boldUser = CFG.boldTypesUser[key] ? 'checked' : '';
      const italicUser = CFG.italicTypesUser[key] ? 'checked' : '';
      const targetMov = (CFG.targets && CFG.targets.mov && CFG.targets.mov[key]) ? 'checked' : '';
      const targetUser = (CFG.targets && CFG.targets.user && CFG.targets.user[key]) ? 'checked' : '';
      const open = key === TYPES_ORDER[0] ? 'open' : '';
      return `
        <details class="phm-rule" data-phm-rule="${key}" ${open}>
          <summary class="phm-rule-head">
            <label class="phm-type">
              <input type="checkbox" data-phm-enabled="${key}" ${enabled}>
              <span>${label}</span>
            </label>
            <span class="phm-chip" data-phm-chip="${key}">Prévia</span>
          </summary>
          <div class="phm-rule-content">
            <div class="phm-rule-grid">
            <div class="phm-field">
              <p class="phm-field-title">Cor de fundo</p>
              <div class="phm-field-body">
                <div class="phm-center">
                  <input type="color" value="${bg}" data-phm-color-bg="${key}" title="Cor de fundo">
                </div>
                <div class="phm-options-row">
                  <label><input type="checkbox" data-phm-nobg="${key}" ${noBg}> Sem fundo</label>
                </div>
              </div>
            </div>
            <div class="phm-field">
              <p class="phm-field-title">Texto Mov.</p>
              <div class="phm-field-body">
                <div class="phm-center">
                  <input type="color" value="${fgMov}" data-phm-color-fg-mov="${key}" title="Cor do texto da coluna Movimentação">
                </div>
                <div class="phm-options-row">
                  <label><input type="checkbox" data-phm-target-mov="${key}" ${targetMov}> Aplicar</label>
                  <label><input type="checkbox" data-phm-bold-mov="${key}" ${boldMov}> Negrito</label>
                  <label><input type="checkbox" data-phm-italic-mov="${key}" ${italicMov}> Itálico</label>
                </div>
              </div>
            </div>
            <div class="phm-field">
              <p class="phm-field-title">Texto Usuário</p>
              <div class="phm-field-body">
                <div class="phm-center">
                  <input type="color" value="${fgUser}" data-phm-color-fg-user="${key}" title="Cor do texto da coluna Usuário">
                </div>
                <div class="phm-options-row">
                  <label><input type="checkbox" data-phm-target-user="${key}" ${targetUser}> Aplicar</label>
                  <label><input type="checkbox" data-phm-bold-user="${key}" ${boldUser}> Negrito</label>
                  <label><input type="checkbox" data-phm-italic-user="${key}" ${italicUser}> Itálico</label>
                </div>
              </div>
            </div>
            </div>
          </div>
        </details>
      `;
    }).join('');

    return `
      <div class="phm-head">
        <div class="phm-head-bar">
          <div class="phm-title-wrap">
            <h3 class="phm-title">Ajuste de Movimentações</h3>
            <p class="phm-subtitle">Configuração por coluna: Movimentação e Usuário</p>
          </div>
          <button class="phm-close" data-phm-action="close" title="Fechar">×</button>
        </div>
      </div>
      <div class="phm-body">
        <div class="phm-accordion">${items}</div>
        <div class="phm-global">
          <p class="phm-global-title">Texto da coluna Movimentação</p>
          <div class="phm-global-options">
            <label><input type="radio" name="phm-mov-text-mode" value="first-line" ${CFG.movTextMode !== 'full' ? 'checked' : ''}> Negrito/itálico só na primeira linha</label>
            <label><input type="radio" name="phm-mov-text-mode" value="full" ${CFG.movTextMode === 'full' ? 'checked' : ''}> Negrito/itálico no texto completo</label>
          </div>
        </div>
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
      const row = root.querySelector(`[data-phm-rule="${CSS.escape(key)}"]`);
      const chip = root.querySelector(`[data-phm-chip="${CSS.escape(key)}"]`);
      const enabledInput = root.querySelector(`[data-phm-enabled="${CSS.escape(key)}"]`);
      const bgInput = root.querySelector(`[data-phm-color-bg="${CSS.escape(key)}"]`);
      const fgMovInput = root.querySelector(`[data-phm-color-fg-mov="${CSS.escape(key)}"]`);
      const fgUserInput = root.querySelector(`[data-phm-color-fg-user="${CSS.escape(key)}"]`);
      const noBgInput = root.querySelector(`[data-phm-nobg="${CSS.escape(key)}"]`);
      const boldMovInput = root.querySelector(`[data-phm-bold-mov="${CSS.escape(key)}"]`);
      const italicMovInput = root.querySelector(`[data-phm-italic-mov="${CSS.escape(key)}"]`);
      const boldUserInput = root.querySelector(`[data-phm-bold-user="${CSS.escape(key)}"]`);
      const italicUserInput = root.querySelector(`[data-phm-italic-user="${CSS.escape(key)}"]`);
      const targetMovInput = root.querySelector(`[data-phm-target-mov="${CSS.escape(key)}"]`);
      const targetUserInput = root.querySelector(`[data-phm-target-user="${CSS.escape(key)}"]`);
      if (!row || !chip || !enabledInput || !bgInput || !fgMovInput || !fgUserInput || !noBgInput || !boldMovInput || !italicMovInput || !boldUserInput || !italicUserInput || !targetMovInput || !targetUserInput) return;

      chip.style.background = noBgInput.checked ? 'transparent' : bgInput.value;
      chip.style.color = targetUserInput.checked && !targetMovInput.checked ? fgUserInput.value : fgMovInput.value;
      chip.style.fontWeight = (boldMovInput.checked || boldUserInput.checked) ? '700' : '600';
      chip.style.fontStyle = (italicMovInput.checked || italicUserInput.checked) ? 'italic' : 'normal';
      chip.style.opacity = (targetMovInput.checked || targetUserInput.checked) ? '1' : '.55';
      row.classList.toggle('is-disabled', !enabledInput.checked);
    });
  }

  function closePanel() {
    const overlay = document.getElementById(PANEL_OVERLAY_ID);
    if (!overlay) return;
    if (typeof overlay.__phmUnlockScroll === "function") overlay.__phmUnlockScroll();
    overlay.remove();
  }

  function ensurePanel() {
    if (document.getElementById(PANEL_OVERLAY_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = PANEL_OVERLAY_ID;
    overlay.className = 'phm-overlay';
    overlay.innerHTML = `<div class="phm-panel" role="dialog" aria-modal="true">${panelHtml()}</div>`;
    overlay.__phmUnlockScroll = lockBodyScroll(document);

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) closePanel();
    });

    overlay.addEventListener('input', (ev) => {
      const t = ev.target;
      if (
        t.matches('[data-phm-enabled], [data-phm-color-bg], [data-phm-color-fg-mov], [data-phm-color-fg-user], [data-phm-nobg], [data-phm-bold-mov], [data-phm-italic-mov], [data-phm-bold-user], [data-phm-italic-user], [data-phm-target-mov], [data-phm-target-user], input[name="phm-mov-text-mode"]')
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

        overlay.querySelectorAll('[data-phm-color-fg-mov]').forEach((inp) => {
          CFG.textColorsMov[inp.getAttribute('data-phm-color-fg-mov')] = inp.value;
        });

        overlay.querySelectorAll('[data-phm-color-fg-user]').forEach((inp) => {
          CFG.textColorsUser[inp.getAttribute('data-phm-color-fg-user')] = inp.value;
        });

        overlay.querySelectorAll('[data-phm-nobg]').forEach((inp) => {
          CFG.noBackgroundTypes[inp.getAttribute('data-phm-nobg')] = inp.checked;
        });

        overlay.querySelectorAll('[data-phm-bold-mov]').forEach((inp) => {
          CFG.boldTypesMov[inp.getAttribute('data-phm-bold-mov')] = inp.checked;
        });

        overlay.querySelectorAll('[data-phm-italic-mov]').forEach((inp) => {
          CFG.italicTypesMov[inp.getAttribute('data-phm-italic-mov')] = inp.checked;
        });

        overlay.querySelectorAll('[data-phm-bold-user]').forEach((inp) => {
          CFG.boldTypesUser[inp.getAttribute('data-phm-bold-user')] = inp.checked;
        });

        overlay.querySelectorAll('[data-phm-italic-user]').forEach((inp) => {
          CFG.italicTypesUser[inp.getAttribute('data-phm-italic-user')] = inp.checked;
        });

        overlay.querySelectorAll('[data-phm-target-mov]').forEach((inp) => {
          CFG.targets.mov[inp.getAttribute('data-phm-target-mov')] = inp.checked;
        });

        overlay.querySelectorAll('[data-phm-target-user]').forEach((inp) => {
          CFG.targets.user[inp.getAttribute('data-phm-target-user')] = inp.checked;
        });

        const movTextModeInput = overlay.querySelector('input[name="phm-mov-text-mode"]:checked');
        CFG.movTextMode = movTextModeInput && movTextModeInput.value === 'full' ? 'full' : 'first-line';

        saveCfg(CFG);
        reapply();
        closePanel();
        return;
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
      menuCommandId = GM_registerMenuCommand('Movimentações: Abrir Painel', togglePanel);
    } catch {}
  }

  const docObservers = new WeakMap();
  const frameListeners = new WeakSet();
  const docProcessState = new WeakMap();

  function getDocProcessState(doc) {
    const existing = docProcessState.get(doc);
    if (existing) return existing;
    const created = { raf: 0 };
    docProcessState.set(doc, created);
    return created;
  }

  function isRelevantMutationNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = /** @type {Element} */ (node);
    return Boolean(
      (element.matches && (
        element.matches('iframe, frame') ||
        element.matches(MOV_TABLES_SELECTOR) ||
        element.matches('tbody, tr') ||
        element.matches('td.filtro_coluna_movimentacao')
      )) ||
      (element.querySelector && (
        element.querySelector('iframe, frame') ||
        element.querySelector(MOV_TABLES_SELECTOR) ||
        element.querySelector('td.filtro_coluna_movimentacao')
      ))
    );
  }

  function scheduleProcessDoc(doc) {
    const state = getDocProcessState(doc);
    if (state.raf) return;
    state.raf = requestAnimationFrame(() => {
      state.raf = 0;
      safeRun('Falha ao processar documento.', () => {
        CFG = readCfg();
        configSignature = buildConfigSignature();
        processDoc(doc);
        ensureObservers();
      });
    });
  }

  function observeDoc(doc) {
    if (!doc || !doc.documentElement || docObservers.has(doc)) return;
    ensureDocStyle(doc);
    const observer = new MutationObserver((mutations) => {
      const hasRelevantMutation = mutations.some((mutation) => {
        if (mutation.type !== 'childList') return false;
        if (isRelevantMutationNode(mutation.target)) return true;
        return Array.from(mutation.addedNodes).some((node) => isRelevantMutationNode(node));
      });
      if (!hasRelevantMutation) return;
      scheduleProcessDoc(doc);
    });
    observer.observe(doc.documentElement, { subtree: true, childList: true });
    docObservers.set(doc, observer);
  }

  function ensureObservers() {
    walkDocuments((doc) => {
      observeDoc(doc);
      const frames = doc.querySelectorAll('iframe, frame');
      frames.forEach((frame) => {
        if (!isTrackableFrame(frame)) return;
        if (frameListeners.has(frame)) return;
        frameListeners.add(frame);
        frame.addEventListener('load', () => {
          if (!isTrackableFrame(frame)) return;
          const frameDoc = getAccessibleFrameDocument(frame);
          if (!frameDoc) return;
          scheduleProcessDoc(frameDoc);
        }, true);
      });
    });
  }

  function reviveAfterReturn() {
    registerMenu(true);
    walkDocuments((doc) => scheduleProcessDoc(doc));
  }

  function boot() {
    registerMenu(false);
    ensureObservers();
    walkDocuments((doc) => scheduleProcessDoc(doc));

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
