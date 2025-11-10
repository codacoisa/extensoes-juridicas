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

  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

  // Ordem exibida no painel
  const TYPES_ORDER = [
    'Despacho',
    'Decisão',
    'Julgamento',
    'Juntada',
    'Autos Conclusos',
    'Petição Enviada',
    'Recebido'
  ];

  const DEFAULTS = {
    enabled: true,
    bold: true,
    borderLeft: true,
    borderWidth: '4px',
    borderStyle: 'solid',
    borderColorDarken: 0.18,
    padding: '6px 8px',
    radius: '6px',
    colors: {
      'Despacho': '#eedbdb',
      'Decisão': '#eedbdb',
      'Julgamento': '#eedbdb',
      'Juntada': '#e8f5e9',
      'Autos Conclusos': '#f3e5f5',
      'Petição Enviada': '#e0f7fa',
      'Recebido': '#e0f7fa'
    },
    textColors: TYPES_ORDER.reduce((acc, k) => (acc[k] = '#111827', acc), {}),
    enabledTypes: TYPES_ORDER.reduce((acc, k) => (acc[k] = true, acc), {}),
    noBackgroundTypes: TYPES_ORDER.reduce((acc, k) => (acc[k] = false, acc), {}), // sem fundo por tipo
    hotkeys: { togglePanel: { ctrlKey: true, shiftKey: true, altKey: false, key: 'm' } } // Ctrl+Shift+M
  };

  const STORAGE_KEY = 'projudi_highlight_movs_cfg_v7';

  function readCfg() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return deepClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      return deepMerge(deepClone(DEFAULTS), parsed);
    } catch { return deepClone(DEFAULTS); }
  }
  function saveCfg(cfg) { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); }
  function deepMerge(base, add) {
    for (const k in add) base[k] = add[k] && typeof add[k]==='object' && !Array.isArray(add[k]) ? deepMerge(base[k]||{}, add[k]) : add[k];
    return base;
  }

  let CFG = readCfg();

  // ======== Estilos (tema claro) ========
  GM_addStyle(`
    .phm-panel { position: fixed; z-index: 2147483647; right: 16px; bottom: 16px; width: 460px;
      background: #ffffff; color: #111827; border: 1px solid #e5e7eb; border-radius: 10px;
      box-shadow: 0 10px 30px rgba(17,24,39,.08); font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif; }
    .phm-panel header { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #e5e7eb; }
    .phm-panel header h3 { margin:0; font-size:14px; font-weight:700; color:#1d4ed8; }
    .phm-close { background:transparent; border:none; width:28px; height:28px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-weight:800; color:#1f2937; font-size:16px; border-radius:8px; }
    .phm-close:hover { background:#f3f4f6; }
    .phm-panel .phm-body { padding:10px 12px 12px; max-height:65vh; overflow:auto; }
    .phm-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; }
    .phm-row + .phm-row { border-top: 1px dashed #e5e7eb; }
    .phm-row label { flex:1; }
    .phm-chip { display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid #e5e7eb; font-size:12px; }
    .phm-btn { background:#ffffff; color:#111827; border:1px solid #e5e7eb; padding:6px 10px; border-radius:6px; cursor:pointer; }
    .phm-btn:hover { background:#f3f4f6; }
    .phm-switch { transform: translateY(1px); }
    .phm-small { font-size:12px; opacity:.8; }
    .phm-hotkey { display:flex; gap:8px; align-items:center; }
    .phm-hotkey input[type="text"] { width:42px; text-transform:lowercase; }
    .phm-colors-grid { display:grid; grid-template-columns: 1fr auto auto auto auto; gap:8px; align-items:center; }
  `);

  // ======== Painel ========
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
        <div class="phm-row">
          <label><input type="checkbox" class="phm-switch" data-phm-bind="bold" ${CFG.bold ? 'checked' : ''}/> Negrito</label>
          <label><input type="checkbox" class="phm-switch" data-phm-bind="borderLeft" ${CFG.borderLeft ? 'checked' : ''}/> Borda à esquerda</label>
        </div>

        ${TYPES_ORDER.map(key => {
          const bg = CFG.colors[key];
          const fg = (CFG.textColors && CFG.textColors[key]) || '#111827';
          const enabled = !CFG.enabledTypes || CFG.enabledTypes[key] !== false;
          const noBg = CFG.noBackgroundTypes && CFG.noBackgroundTypes[key];
          return `
          <div class="phm-row phm-colors-grid">
            <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-phm-enabled="${key}" ${enabled ? 'checked' : ''}/> ${key}</label>
            <span>
              <span class="phm-small">Fundo</span>
              <input type="color" value="${toHexColor(bg)}" data-phm-color-bg="${key}"/>
            </span>
            <span>
              <span class="phm-small">Texto</span>
              <input type="color" value="${toHexColor(fg)}" data-phm-color-fg="${key}"/>
            </span>
            <label class="phm-small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-phm-nobg="${key}" ${noBg ? 'checked' : ''}/> Sem fundo</label>
            <span class="phm-chip" style="background:${noBg ? 'transparent' : bg}; color:${fg}; border-color:#e5e7eb">Exemplo</span>
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
            <div class="phm-small">Padrão: Ctrl+Shift+M. Não usa Command.</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="phm-btn" data-phm-action="reapply">Reaplicar</button>
            <button class="phm-btn" data-phm-action="save">Salvar</button>
          </div>
        </div>
      </div>
    `;

    panel.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-phm-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-phm-action');
      if (action === 'close') panel.remove();
      if (action === 'reapply') reapply();
      if (action === 'save') {
        panel.querySelectorAll('[data-phm-bind]').forEach(inp => {
          const key = inp.getAttribute('data-phm-bind');
          CFG[key] = inp.checked;
        });
        // Cores + habilitação + sem fundo por tipo
        panel.querySelectorAll('[data-phm-color-bg]').forEach(inp => {
          const k = inp.getAttribute('data-phm-color-bg');
          CFG.colors[k] = inp.value;
        });
        if (!CFG.textColors) CFG.textColors = deepClone(DEFAULTS.textColors);
        panel.querySelectorAll('[data-phm-color-fg]').forEach(inp => {
          const k = inp.getAttribute('data-phm-color-fg');
          CFG.textColors[k] = inp.value;
        });
        if (!CFG.enabledTypes) CFG.enabledTypes = deepClone(DEFAULTS.enabledTypes);
        panel.querySelectorAll('[data-phm-enabled]').forEach(inp => {
          const k = inp.getAttribute('data-phm-enabled');
          CFG.enabledTypes[k] = inp.checked;
        });
        if (!CFG.noBackgroundTypes) CFG.noBackgroundTypes = deepClone(DEFAULTS.noBackgroundTypes);
        panel.querySelectorAll('[data-phm-nobg]').forEach(inp => {
          const k = inp.getAttribute('data-phm-nobg');
          CFG.noBackgroundTypes[k] = inp.checked;
        });
        // Hotkey
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
    const existing = document.querySelector('.phm-panel');
    if (existing) existing.remove(); else ensurePanel();
  }

  // ======== Utils ========
  function toHexColor(any) {
    if (/^#([0-9a-f]{3}){1,2}$/i.test(any)) return any;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(any);
    if (!m) return '#111827';
    const [r,g,b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
  }
  function darken(hex, amount = 0.18) {
    const m = /^#?([0-9a-f]{6})$/i.exec(toHexColor(hex));
    if (!m) return '#000000';
    const n = m[1];
    const r = parseInt(n.slice(0,2),16), g = parseInt(n.slice(2,4),16), b = parseInt(n.slice(4,6),16);
    const dr = Math.max(0, Math.round(r * (1 - amount))).toString(16).padStart(2,'0');
    const dg = Math.max(0, Math.round(g * (1 - amount))).toString(16).padStart(2,'0');
    const db = Math.max(0, Math.round(b * (1 - amount))).toString(16).padStart(2,'0');
    return `#${dr}${dg}${db}`;
  }
  function normalizeText(s) { return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase().trim(); }

  // Aceita diferentes setas/formatos visuais: "->", "→", "⇒", "»", "›"
  const ARROW = '(?:-\s*>|→|⇒|»|›)';

  const RULES = {
    'Despacho': { requiresArrow: true },
    'Decisão': { requiresArrow: true },
    'Julgamento': { requiresArrow: true },
    'Juntada': { requiresArrow: true }, // só com seta
    'Autos Conclusos': { requiresArrow: false },
    'Petição Enviada': { requiresArrow: false },
    'Recebido': { requiresArrow: false },
  };

  function matchKind(text) {
    const tNorm = normalizeText(text);
    for (const key of TYPES_ORDER) {
      if (CFG.enabledTypes && CFG.enabledTypes[key] === false) continue; // desativado pelo usuário
      const rule = RULES[key] || { requiresArrow: false };
      const kw = normalizeText(key).replace(/\s+/g, '\\s+');
      const pattern = rule.requiresArrow
        ? new RegExp('^' + kw + '\\s*' + ARROW + '\\b')
        : new RegExp('^' + kw + '(?:\\s*' + ARROW + ')?\\b');
      if (pattern.test(tNorm)) return key;
    }
    return null;
  }

  // ======== Núcleo (2ª coluna) ========
  function styleCell(td, kind) {
    const bg = (CFG.colors && CFG.colors[kind]) || '#eef2ff';
    const fg = (CFG.textColors && CFG.textColors[kind]) || '';
    const noBg = (CFG.noBackgroundTypes && CFG.noBackgroundTypes[kind]) || false;

    if (!noBg) {
      td.style.background = bg;
      if (CFG.borderLeft) td.style.borderLeft = `${CFG.borderWidth} ${CFG.borderStyle} ${darken(bg, CFG.borderColorDarken)}`;
    } else {
      td.style.background = '';
      td.style.borderLeft = '';
    }

    td.style.padding = CFG.padding;
    td.style.borderRadius = CFG.radius;
    td.style.color = fg;
    td.style.fontWeight = CFG.bold ? '600' : '';
  }

  function clearStyle(td) {
    td.style.background = td.style.padding = td.style.borderRadius = td.style.fontWeight = td.style.borderLeft = td.style.color = '';
  }

  function processTable(root = document) {
    if (!CFG.enabled) return;
    const rows = root.querySelectorAll('table tr, .tabelaLista tr, tr');
    rows.forEach(tr => {
      const cells = tr.children;
      if (!cells || cells.length < 2) return;
      const td = cells[1]; // 2ª coluna
      const text = td && td.textContent || '';
      const kind = matchKind(text);
      if (kind) styleCell(td, kind);
    });
  }

  function reapply() {
    document.querySelectorAll('table tr, .tabelaLista tr, tr').forEach(tr => {
      const cells = tr.children; if (!cells || cells.length < 2) return; clearStyle(cells[1]);
    });
    processTable(document);
  }

  // ======== Observer/Hotkey ========
  const OBS = new MutationObserver(mutations => { for (const m of mutations) { if (m.type === 'childList') { processTable(document); break; } } });
  function initObserver() { try { OBS.observe(document.documentElement, { subtree:true, childList:true }); } catch {} }

  function keysEqual(ev, spec) {
    const eq = (a, b) => !!a === !!b;
    if (!eq(ev.ctrlKey, !!spec.ctrlKey)) return false;
    if (!eq(ev.shiftKey, !!spec.shiftKey)) return false;
    if (!eq(ev.altKey, !!spec.altKey)) return false;
    if (ev.metaKey) return false; // não usa Command
    return (ev.key||'').toLowerCase() === String(spec.key||'m').toLowerCase();
  }

  function initHotkeys() {
    window.addEventListener('keydown', ev => { if (keysEqual(ev, CFG.hotkeys.togglePanel)) { ev.preventDefault(); togglePanel(); } }, true);
  }

  function boot() { initHotkeys(); initObserver(); processTable(document); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();