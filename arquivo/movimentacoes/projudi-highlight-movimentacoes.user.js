// ==UserScript==
// @name         Projudi - Highlight Movimentações
// @namespace    projudi-highlight-movimentacoes.user.js
// @version      1.0
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

  // ---------- Helpers básicos ----------
  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
  const ARROW_STR = '(?:-\\s*>|→|⇒|»|›)';
  const log = (...a) => { try { console.debug('[Projudi Movs]', ...a); } catch {} };

  // Ordem exibida no painel
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

  // ---------- Configuração padrão ----------
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
    boldTypes: TYPES_ORDER.reduce((acc, k) => (acc[k] = true, acc), {}),
    hotkeys: { togglePanel: { ctrlKey: true, shiftKey: true, altKey: false, key: 'm' } } // Ctrl+Shift+M
  };

  const STORAGE_KEY = 'projudi_highlight_movs_cfg_v13';

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

  let CFG = readCfg();

  // ---------- Estilos do painel ----------
  GM_addStyle(`
    .phm-panel {
      position: fixed;
      z-index: 2147483647;
      right: 16px;
      bottom: 16px;
      width: 520px;
      background: #ffffff;
      color: #111827;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(17,24,39,.08);
      font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif;
    }
    .phm-panel header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:10px 12px;
      border-bottom:1px solid #e5e7eb;
    }
    .phm-panel header h3 {
      margin:0;
      font-size:14px;
      font-weight:700;
      color:#1d4ed8;
    }
    .phm-close {
      background:transparent;
      border:none;
      width:28px;
      height:28px;
      cursor:pointer;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:800;
      color:#1f2937;
      font-size:16px;
      border-radius:8px;
    }
    .phm-close:hover { background:#f3f4f6; }
    .phm-panel .phm-body {
      padding:10px 12px 12px;
      max-height:65vh;
      overflow:auto;
    }
    .phm-row {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      padding:6px 0;
    }
    .phm-row + .phm-row { border-top: 1px dashed #e5e7eb; }
    .phm-row label { flex:1; }
    .phm-chip {
      display:inline-block;
      padding:2px 8px;
      border-radius:999px;
      border:1px solid #e5e7eb;
      font-size:12px;
    }
    .phm-btn {
      background:#ffffff;
      color:#111827;
      border:1px solid #e5e7eb;
      padding:6px 10px;
      border-radius:6px;
      cursor:pointer;
    }
    .phm-btn:hover { background:#f3f4f6; }
    .phm-small { font-size:12px; opacity:.8; }
    .phm-hotkey { display:flex; gap:8px; align-items:center; }
    .phm-hotkey input[type="text"] { width:42px; text-transform:lowercase; }
    .phm-colors-grid {
      display:grid;
      grid-template-columns: 1fr auto auto auto auto auto;
      gap:8px;
      align-items:center;
    }
    .phm-firstline-bold::first-line { font-weight: 600; }
  `);

  // ---------- Painel ----------
  function ensurePanel() {
    if (document.querySelector('.phm-panel')) return;
    const hk = CFG.hotkeys.togglePanel || DEFAULTS.hotkeys.togglePanel;

    const panel = document.createElement('div');
    panel.className = 'phm-panel';
    panel.innerHTML = `
      <header>
        <h3>MOVIMENTAÇÕES</h3>
        <button class="phm-close" data-phm-action="close" title="Fechar">×</button>
      </header>
      <div class="phm-body">
        ${TYPES_ORDER.map(key => {
          const bg = CFG.colors[key] || '#eef2ff';
          const fg = CFG.textColors[key] || '#111827';
          const enabled = CFG.enabledTypes[key] !== false;
          const noBg = CFG.noBackgroundTypes[key];
          const bold = CFG.boldTypes[key];
          const label = DISPLAY_NAMES[key] || key;
          return `
          <div class="phm-row phm-colors-grid">
            <label style="display:flex;gap:8px;align-items:center">
              <input type="checkbox" data-phm-enabled="${key}" ${enabled ? 'checked' : ''}/> ${label}
            </label>
            <span>
              <span class="phm-small">Fundo</span>
              <input type="color" value="${toHexColor(bg)}" data-phm-color-bg="${key}"/>
            </span>
            <span>
              <span class="phm-small">Texto</span>
              <input type="color" value="${toHexColor(fg)}" data-phm-color-fg="${key}"/>
            </span>
            <label class="phm-small" style="display:flex;gap:6px;align-items:center">
              <input type="checkbox" data-phm-nobg="${key}" ${noBg ? 'checked' : ''}/> Sem fundo
            </label>
            <label class="phm-small" style="display:flex;gap:6px;align-items:center">
              <input type="checkbox" data-phm-bold="${key}" ${bold ? 'checked' : ''}/> Negrito
            </label>
            <span class="phm-chip ${bold ? 'phm-firstline-bold' : ''}"
              style="background:${noBg ? 'transparent' : bg}; color:${fg}">
              Exemplo
            </span>
          </div>`;
        }).join('')}

        <div class="phm-row">
          <div style="flex:1">
            <div class="phm-small">Atalho do painel:</div>
            <div class="phm-hotkey">
              <label><input type="checkbox" data-phm-hk="ctrlKey" ${hk.ctrlKey ? 'checked' : ''}/> Ctrl</label>
              <label><input type="checkbox" data-phm-hk="shiftKey" ${hk.shiftKey ? 'checked' : ''}/> Shift</label>
              <label><input type="checkbox" data-phm-hk="altKey" ${hk.altKey ? 'checked' : ''}/> Alt</label>
              <label>Key <input type="text" maxlength="1" value="${(hk.key||'m').toLowerCase()}" data-phm-hk="key"/></label>
            </div>
            <div class="phm-small">Padrão: Ctrl+Shift+M.</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="phm-btn" data-phm-action="reset">Resetar</button>
            <button class="phm-btn" data-phm-action="save">Salvar</button>
          </div>
        </div>
      </div>
    `;

    panel.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-phm-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-phm-action');

      if (action === 'close') {
        panel.remove();
      }

      if (action === 'reset') {
        CFG = deepClone(DEFAULTS);
        saveCfg(CFG);
        panel.remove();
        ensurePanel();
        reapply();
      }

      if (action === 'save') {
        panel.querySelectorAll('[data-phm-color-bg]').forEach(inp => {
          CFG.colors[inp.getAttribute('data-phm-color-bg')] = inp.value;
        });
        panel.querySelectorAll('[data-phm-color-fg]').forEach(inp => {
          CFG.textColors[inp.getAttribute('data-phm-color-fg')] = inp.value;
        });
        panel.querySelectorAll('[data-phm-enabled]').forEach(inp => {
          CFG.enabledTypes[inp.getAttribute('data-phm-enabled')] = inp.checked;
        });
        panel.querySelectorAll('[data-phm-nobg]').forEach(inp => {
          CFG.noBackgroundTypes[inp.getAttribute('data-phm-nobg')] = inp.checked;
        });
        panel.querySelectorAll('[data-phm-bold]').forEach(inp => {
          CFG.boldTypes[inp.getAttribute('data-phm-bold')] = inp.checked;
        });

        const hkUpd = Object.assign({}, CFG.hotkeys.togglePanel);
        panel.querySelectorAll('[data-phm-hk]').forEach(inp => {
          const k = inp.getAttribute('data-phm-hk');
          hkUpd[k] = (k === 'key') ? (inp.value || 'm').toLowerCase() : inp.checked;
        });
        CFG.hotkeys.togglePanel = hkUpd;

        saveCfg(CFG);
        reapply();
      }
    });

    document.body.appendChild(panel);
  }

  function togglePanel() {
    const p = document.querySelector('.phm-panel');
    if (p) p.remove(); else ensurePanel();
  }

  // ---------- Utils ----------
  function toHexColor(any) {
    if (/^#([0-9a-f]{3}){1,2}$/i.test(any)) return any;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(any);
    if (!m) return '#111827';
    const [r, g, b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Padrões de texto ----------
  const PADROES_MOV = [
    { key: 'Despacho', re: new RegExp('^\\s*Despacho\\s*' + ARROW_STR, 'iu') },
    { key: 'Decisão', re: new RegExp('^\\s*Decis[aã]o\\s*' + ARROW_STR, 'iu') },
    { key: 'Julgamento', re: new RegExp('^\\s*Julgamento\\s*' + ARROW_STR, 'iu') },
    { key: 'Juntada', re: new RegExp('^\\s*Juntada\\s*' + ARROW_STR, 'iu') },
    { key: 'Autos Conclusos', re: /^(\s*)Autos\s+Conclusos\b/iu },
    { key: 'Petição Enviada', re: /^(\s*)Peti[cç][aã]o\s+Enviada\b/iu },
    { key: 'Recebido', re: /^(\s*)Recebido\b/iu },
    { key: 'Despacho Autos ao Contador', re: /^(\s*)Despacho\s+Autos\s+ao\s+Contador\b/iu },
    { key: 'Relatório', re: new RegExp('^\\s*Relat[óo]rio\\s*' + ARROW_STR, 'iu') },
  ];

  function matchKind(text) {
    for (const p of PADROES_MOV) {
      if (CFG.enabledTypes && CFG.enabledTypes[p.key] === false) continue;
      try {
        if (p.re.test(text)) return p.key;
      } catch (e) {
        log('regex error', p.key, e);
      }
    }
    return null;
  }

  // ---------- Estilos (linha + célula) ----------
  function styleRow(tr, kind) {
    const bg = CFG.colors[kind] || '#eef2ff';
    const noBg = CFG.noBackgroundTypes[kind] || false;
    tr.style.background = noBg ? '' : bg;
  }

  function styleCell(td, kind) {
    const fg = CFG.textColors[kind] || '#111827';
    const bold = CFG.boldTypes[kind] || false;

    td.style.color = fg;
    td.style.padding = CFG.padding;

    // Nada de border-radius aqui: evita “arredondar” a segunda coluna
    td.classList.toggle('phm-firstline-bold', !!bold);
  }

  function clearStyle(td) {
    const tr = td.parentElement;
    if (tr) tr.style.background = '';

    td.style.background = '';
    td.style.padding = '';
    td.style.color = '';
    td.classList.remove('phm-firstline-bold');
  }

  // ---------- Núcleo ----------
  function processTable(root = document) {
    if (!CFG.enabled) return;

    const rows = root.querySelectorAll('table tr, .tabelaLista tr, tr');
    rows.forEach(tr => {
      const cells = tr.children;
      if (!cells || cells.length < 2) return;
      const td = cells[1]; // 2ª coluna
      const text = (td && td.textContent) || '';
      const kind = matchKind(text);
      if (!kind) return;

      styleRow(tr, kind);
      styleCell(td, kind);
    });
  }

  function reapply() {
    document.querySelectorAll('table tr, .tabelaLista tr, tr').forEach(tr => {
      const cells = tr.children;
      if (!cells || cells.length < 2) return;
      clearStyle(cells[1]);
    });
    processTable(document);
  }

  // ---------- Observer & Hotkey ----------
  const OBS = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') {
        processTable(document);
        break;
      }
    }
  });

  function initObserver() {
    try {
      OBS.observe(document.documentElement, { subtree: true, childList: true });
    } catch {}
  }

  function keysEqual(ev, spec) {
    const eq = (a, b) => !!a === !!b;
    if (!eq(ev.ctrlKey, !!spec.ctrlKey)) return false;
    if (!eq(ev.shiftKey, !!spec.shiftKey)) return false;
    if (!eq(ev.altKey, !!spec.altKey)) return false;
    if (ev.metaKey) return false;
    return (ev.key || '').toLowerCase() === String(spec.key || 'm').toLowerCase();
  }

  function initHotkeys() {
    window.addEventListener('keydown', ev => {
      const tag = (ev.target && ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || ev.isComposing) return;
      if (keysEqual(ev, CFG.hotkeys.togglePanel)) {
        ev.preventDefault();
        togglePanel();
      }
    }, true);
  }

  function boot() {
    log('boot');
    initHotkeys();
    initObserver();
    processTable(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();