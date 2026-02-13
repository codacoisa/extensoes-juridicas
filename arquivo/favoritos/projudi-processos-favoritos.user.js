// ==UserScript==
// @name         Processos Favoritos
// @namespace    projudi-processos-favoritos.user.js
// @version      0.6
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Destaca processos favoritos, permite adicionar/remover no detalhe e gerenciar via painel.
// @author       lourencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/2615af6dc02e2a04d09d8f83e98dce4d/raw/projudi-processos-favoritos.user.js
// @downloadURL  https://gist.githubusercontent.com/lourencosv/2615af6dc02e2a04d09d8f83e98dce4d/raw/projudi-processos-favoritos.user.js
// @match        *://projudi.tjgo.jus.br/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;

  const STORAGE_KEY = 'lp_procs_favoritos_v2';
  const PANEL_ID = 'lp-panel-root';
  const STYLE_ID = 'lp-style-favoritos';
  const BTN_ID = 'lp-toggle-proc-btn';
  const MENU_LABEL = 'Abrir Painel';

  let menuCommandId = null;
  let menuRegistered = false;

  function supportsMenuCommand() {
    return typeof GM_registerMenuCommand === 'function';
  }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(Boolean).map(String);
    } catch {
      return [];
    }
  }

  function writeStore(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(list)]));
    refreshAll();
  }

  function normalizeFull(num) {
    const m = String(num).trim().match(/^(\d{7})-(\d{2})\.(\d{4})\.\d\.\d{2}\.\d{4}$/);
    if (!m) return null;
    const seq = String(parseInt(m[1], 10));
    const dv = String(parseInt(m[2], 10));
    return `${seq}.${dv}`;
  }

  function normalizeShort(txt) {
    const m = String(txt).replace(/\s+/g, '').match(/(\d+)\.(\d{1,2})/);
    if (!m) return null;
    return `${String(parseInt(m[1], 10))}.${String(parseInt(m[2], 10))}`;
  }

  function findAnyProcessNumber(text) {
    const m = String(text).match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
    return m ? m[0] : null;
  }

  function getFavSet() {
    const list = readStore();
    const keys = list.map(normalizeFull).filter(Boolean);
    return new Set(keys);
  }

  function isFavorite(fullNum) {
    const key = normalizeFull(fullNum);
    if (!key) return false;
    return getFavSet().has(key);
  }

  function addFavorite(fullNum) {
    const normalized = normalizeFull(fullNum);
    if (!normalized) return false;

    const current = readStore();
    if (current.some((n) => normalizeFull(n) === normalized)) return true;

    current.push(fullNum);
    writeStore(current);
    return true;
  }

  function removeFavorite(fullNum) {
    const normalized = normalizeFull(fullNum);
    if (!normalized) return false;

    const current = readStore();
    const next = current.filter((n) => normalizeFull(n) !== normalized);
    writeStore(next);
    return true;
  }

  function injectStyles(doc) {
    if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;

    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .lp-proc-highlight {
        display: inline !important;
        padding: 0 !important;
        margin: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        color: inherit !important;
        font-weight: 600 !important;
        background: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
        animation: none !important;
        text-decoration-line: underline !important;
        text-decoration-style: solid !important;
        text-decoration-color: rgba(184, 116, 0, 0.75) !important;
        text-decoration-thickness: 1.5px !important;
        text-underline-offset: 2px;
        line-height: inherit !important;
        white-space: nowrap !important;
        position: relative;
        margin-right: 10px !important;
      }

      a.lp-proc-highlight::after {
        content: "★";
        position: absolute;
        left: 100%;
        top: 50%;
        transform: translate(3px, -52%);
        font-size: 0.72em;
        line-height: 1;
        color: #b87400;
        text-decoration: none !important;
        opacity: 0.85;
      }

      @keyframes lpPulse {
        0%, 100% { box-shadow: 0 0 0 1px rgba(194, 132, 0, 0.25), 0 2px 8px rgba(194, 132, 0, 0.16); }
        50% { box-shadow: 0 0 0 1px rgba(194, 132, 0, 0.38), 0 4px 12px rgba(194, 132, 0, 0.24); }
      }

      #${BTN_ID} {
        display: inline-block !important;
        width: 17px;
        height: 17px;
        margin-left: 6px;
        margin-right: 0;
        color: #7a4a00 !important;
        font-size: 17px !important;
        line-height: 17px !important;
        cursor: pointer;
        vertical-align: top;
        position: relative;
        top: 0;
        transform: none;
      }

      #${BTN_ID}:hover {
        filter: brightness(0.92);
      }

      #${PANEL_ID} {
        position: fixed;
        top: 20px;
        right: 20px;
        width: min(520px, calc(100vw - 32px));
        max-height: min(80vh, 760px);
        background: #ffffff;
        border: 1px solid #d8d8d8;
        border-radius: 12px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.24);
        z-index: 2147483647;
        opacity: 1;
        color: #222;
        pointer-events: auto;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif;
      }

      #${PANEL_ID},
      #${PANEL_ID} * {
        box-sizing: border-box;
      }

      #${PANEL_ID} .lp-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        background: #f8f8f8;
        border-bottom: 1px solid #ececec;
      }

      #${PANEL_ID} .lp-title {
        font-size: 14px;
        font-weight: 700;
        color: #222;
      }

      #${PANEL_ID} .lp-close {
        border: none;
        background: transparent;
        font-size: 16px;
        cursor: pointer;
        color: #666;
      }

      #${PANEL_ID} .lp-body {
        padding: 12px;
      }

      #${PANEL_ID} .lp-stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      #${PANEL_ID} .lp-row {
        display: flex;
        gap: 8px;
      }

      #${PANEL_ID} input[type="text"] {
        all: unset;
        flex: 1;
        padding: 8px 10px;
        border: 1px solid #cfcfcf;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.2;
        color: #222;
        background: #fff;
      }

      #${PANEL_ID} input[type="text"]::placeholder {
        color: #8a8a8a;
        opacity: 1;
      }

      #${PANEL_ID} button {
        all: unset;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #bdbdbd;
        border-radius: 8px;
        background: #fff;
        color: #2d2d2d;
        padding: 8px 10px;
        min-width: 88px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.1;
        cursor: pointer;
      }

      #${PANEL_ID} button.lp-add {
        border-color: #9f844f;
        background: #fef6e5;
        color: #6b4e18;
      }

      #${PANEL_ID} .lp-actions {
        display: flex;
        gap: 8px;
      }

      #${PANEL_ID} .lp-actions button {
        min-width: 0;
        flex: 1;
      }

      #${PANEL_ID} .lp-status {
        min-height: 18px;
        padding: 0 2px;
        font-size: 12px;
        line-height: 1.3;
        color: #667085;
      }

      #${PANEL_ID} .lp-status.ok {
        color: #126a39;
      }

      #${PANEL_ID} .lp-status.err {
        color: #b42318;
      }

      #${PANEL_ID} ul {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 46vh;
        overflow: auto;
      }

      #${PANEL_ID} li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 8px 0;
        border-bottom: 1px solid #f0f0f0;
      }

      #${PANEL_ID} .lp-item-num {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        color: #2b2b2b;
      }

      #${PANEL_ID} .lp-empty {
        color: #8a8a8a;
      }

      #${PANEL_ID} .lp-foot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: #666;
        font-size: 12px;
      }
    `;

    doc.head.appendChild(style);
  }

  function highlightLinksInDoc(doc) {
    if (!doc || !doc.body) return;
    injectStyles(doc);

    const favs = getFavSet();
    const links = doc.querySelectorAll('a');

    for (const a of links) {
      const key = normalizeShort(a.textContent || '');
      if (key && favs.has(key)) {
        a.classList.add('lp-proc-highlight');
      } else {
        a.classList.remove('lp-proc-highlight');
      }
    }
  }

  function getProcessNumberFromDoc(doc) {
    if (!doc) return null;
    const span = doc.querySelector('#span_proc_numero');
    if (span) {
      const full = findAnyProcessNumber(span.textContent || '');
      if (full) return full;
    }

    const htmlFull = findAnyProcessNumber(doc.body ? doc.body.innerText : '');
    return htmlFull || null;
  }

  function ensureToggleButton(doc) {
    if (!doc || !doc.body) return;
    injectStyles(doc);

    const span = doc.querySelector('#span_proc_numero');
    if (!span) return;

    let btn = doc.getElementById(BTN_ID);
    const fullNum = getProcessNumberFromDoc(doc);
    if (!fullNum) return;

    if (btn && btn.tagName === 'BUTTON') {
      btn.remove();
      btn = null;
    }

    if (!btn) {
      btn = doc.createElement('i');
      btn.id = BTN_ID;
      btn.title = 'Adicionar aos favoritos';
      btn.setAttribute('aria-label', 'Adicionar aos favoritos');
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-hidden', 'false');
      btn.className = 'fa-regular fa-star';
      btn.addEventListener('click', function () {
        const num = getProcessNumberFromDoc(doc);
        if (!num) return;

        if (isFavorite(num)) {
          removeFavorite(num);
        } else {
          addFavorite(num);
        }
        updateToggleButton(doc);
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          btn.click();
        }
      });
      const wrapper = span.parentNode;
      const copyIcons = wrapper
        ? wrapper.querySelectorAll('img[onclick*="copiarNumeroProcessoAreaTransferencia"]')
        : null;

      if (copyIcons && copyIcons.length) {
        copyIcons[copyIcons.length - 1].insertAdjacentElement('afterend', btn);
      } else if (wrapper) {
        wrapper.appendChild(btn);
      } else {
        span.insertAdjacentElement('afterend', btn);
      }
    }

    updateToggleButton(doc);
    alignToggleWithCopyIcons(doc);
  }

  function updateToggleButton(doc) {
    const btn = doc.getElementById(BTN_ID);
    if (!btn) return;

    const fullNum = getProcessNumberFromDoc(doc);
    const on = fullNum ? isFavorite(fullNum) : false;

    btn.classList.toggle('on', on);
    btn.title = on ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    btn.setAttribute('aria-label', btn.title);
    btn.classList.add('fa-star');
    btn.classList.toggle('fa-solid', on);
    btn.classList.toggle('fa-regular', !on);
  }

  function alignToggleWithCopyIcons(doc) {
    const btn = doc.getElementById(BTN_ID);
    if (!btn) return;

    const wrapper = btn.parentElement;
    if (!wrapper) return;

    const refIcon = wrapper.querySelector('img[onclick*="copiarNumeroProcessoAreaTransferencia"]');
    if (!refIcon) return;

    btn.style.top = '0px';
    const refTop = refIcon.getBoundingClientRect().top;
    const btnTop = btn.getBoundingClientRect().top;
    const delta = Math.round(refTop - btnTop);
    btn.style.top = `${delta}px`;
  }

  function removePanel(doc) {
    const panel = doc.getElementById(PANEL_ID);
    if (panel) panel.remove();
  }

  function buildPanel(doc) {
    removePanel(doc);
    injectStyles(doc);

    const panel = doc.createElement('div');
    panel.id = PANEL_ID;

    panel.innerHTML = `
      <div class="lp-head">
        <div class="lp-title">Processos Favoritos</div>
        <button class="lp-close" type="button" title="Fechar">✕</button>
      </div>
      <div class="lp-body">
        <div class="lp-stack">
          <div class="lp-row">
            <input type="text" id="lp-add-input" placeholder="0000000-00.0000.0.00.0000" />
            <button type="button" class="lp-add" id="lp-add-btn">Adicionar</button>
          </div>
          <div class="lp-actions">
            <button type="button" id="lp-export">Exportar JSON</button>
            <button type="button" id="lp-import">Importar JSON</button>
            <input type="file" id="lp-import-file" accept=".json,application/json" style="display:none" />
          </div>
          <div class="lp-status" id="lp-status" aria-live="polite"></div>
          <ul id="lp-list"></ul>
          <div class="lp-foot">
            <span id="lp-count"></span>
            <button type="button" id="lp-clear">Limpar tudo</button>
          </div>
        </div>
      </div>
    `;

    doc.body.appendChild(panel);

    const closeBtn = panel.querySelector('.lp-close');
    const addBtn = panel.querySelector('#lp-add-btn');
    const addInput = panel.querySelector('#lp-add-input');
    const exportBtn = panel.querySelector('#lp-export');
    const importBtn = panel.querySelector('#lp-import');
    const importInput = panel.querySelector('#lp-import-file');
    const status = panel.querySelector('#lp-status');
    const clearBtn = panel.querySelector('#lp-clear');
    const ul = panel.querySelector('#lp-list');
    const count = panel.querySelector('#lp-count');

    function canonicalizeFull(value) {
      const text = String(value || '').trim();
      const full = findAnyProcessNumber(text);
      return full && normalizeFull(full) ? full : null;
    }

    function showStatus(message, type) {
      status.textContent = String(message || '');
      status.classList.remove('ok', 'err');
      if (type) status.classList.add(type);
    }

    function sortAndUniqByKey(list) {
      const map = new Map();
      for (const item of list) {
        const full = canonicalizeFull(item);
        if (!full) continue;
        const key = normalizeFull(full);
        if (!map.has(key)) map.set(key, full);
      }
      return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    function buildExportPayload() {
      const favorites = sortAndUniqByKey(readStore());
      return {
        exportedAt: new Date().toISOString(),
        total: favorites.length,
        favorites
      };
    }

    function renderList() {
      const items = sortAndUniqByKey(readStore());
      ul.innerHTML = '';

      if (!items.length) {
        const li = doc.createElement('li');
        li.className = 'lp-empty';
        li.textContent = 'Nenhum processo favorito cadastrado.';
        ul.appendChild(li);
      } else {
        items.forEach((num) => {
          const li = doc.createElement('li');
          const span = doc.createElement('span');
          span.className = 'lp-item-num';
          span.textContent = num;

          const del = doc.createElement('button');
          del.type = 'button';
          del.textContent = 'Remover';
          del.addEventListener('click', function () {
            removeFavorite(num);
            showStatus('Favorito removido.', 'ok');
            renderList();
          });

          li.appendChild(span);
          li.appendChild(del);
          ul.appendChild(li);
        });
      }

      count.textContent = `${items.length} favorito(s)`;
    }

    function tryAddInput() {
      const fullNum = canonicalizeFull(addInput.value);
      if (!fullNum) {
        addInput.style.borderColor = '#d64a4a';
        addInput.focus();
        showStatus('Formato inválido. Use: 0000000-00.0000.0.00.0000', 'err');
        return;
      }
      addInput.style.borderColor = '';
      addFavorite(fullNum);
      addInput.value = '';
      showStatus('Favorito adicionado.', 'ok');
      renderList();
    }

    function exportJson() {
      const payload = buildExportPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a = doc.createElement('a');
      a.href = url;
      a.download = `projudi-favoritos-${date}.json`;
      doc.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showStatus(`JSON exportado (${payload.total} favorito(s)).`, 'ok');
    }

    function parseImportedPayload(text) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.favorites)) return parsed.favorites;
      if (parsed && Array.isArray(parsed.favoritos)) return parsed.favoritos;
      throw new Error('JSON sem lista de favoritos.');
    }

    function importJsonFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const importedRaw = parseImportedPayload(String(reader.result || ''));
          const existing = sortAndUniqByKey(readStore());
          const merged = sortAndUniqByKey(existing.concat(importedRaw));
          const before = existing.length;
          const after = merged.length;
          const added = Math.max(after - before, 0);
          writeStore(merged);
          showStatus(`Importação concluída: +${added}, total ${after}.`, 'ok');
          renderList();
        } catch (err) {
          showStatus(`Falha ao importar JSON: ${err.message}`, 'err');
        } finally {
          importInput.value = '';
        }
      };
      reader.onerror = function () {
        showStatus('Falha ao ler o arquivo JSON.', 'err');
        importInput.value = '';
      };
      reader.readAsText(file, 'utf-8');
    }

    closeBtn.addEventListener('click', () => removePanel(doc));
    addBtn.addEventListener('click', tryAddInput);
    addInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryAddInput();
    });
    exportBtn.addEventListener('click', exportJson);
    importBtn.addEventListener('click', function () {
      importInput.click();
    });
    importInput.addEventListener('change', function () {
      const file = importInput.files && importInput.files[0];
      importJsonFile(file);
    });

    clearBtn.addEventListener('click', function () {
      writeStore([]);
      showStatus('Lista limpa.', 'ok');
      renderList();
    });

    renderList();
  }

  function openPanel() {
    buildPanel(window.document);
  }

  function registerMenu(force = false) {
    if (!supportsMenuCommand()) return;

    if (force) {
      try {
        if (menuRegistered && menuCommandId !== null && typeof GM_unregisterMenuCommand === 'function') {
          GM_unregisterMenuCommand(menuCommandId);
        }
      } catch {}
      menuCommandId = null;
      menuRegistered = false;
    }

    if (menuRegistered) return;

    try {
      const id = GM_registerMenuCommand(MENU_LABEL, openPanel);
      menuCommandId = id == null ? null : id;
      menuRegistered = true;
    } catch {}
  }

  function refreshDoc(doc) {
    highlightLinksInDoc(doc);
    ensureToggleButton(doc);
  }

  function refreshAll() {
    try {
      refreshDoc(window.document);
    } catch {}

    const iframe = document.getElementById('Principal');
    if (iframe && iframe.contentDocument) {
      try {
        refreshDoc(iframe.contentDocument);
      } catch {}
    }
  }

  const refreshTimers = new WeakMap();

  function scheduleRefresh(doc, delayMs = 180) {
    if (!doc) return;
    const existing = refreshTimers.get(doc);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      refreshTimers.delete(doc);
      refreshDoc(doc);
    }, delayMs);

    refreshTimers.set(doc, timer);
  }

  function observeDoc(doc) {
    if (!doc || !doc.body) return;

    const mo = new MutationObserver((mutations) => {
      let relevant = false;
      for (const m of mutations) {
        if (m.type === 'characterData') {
          relevant = true;
          break;
        }
        if (m.type === 'childList' && ((m.addedNodes && m.addedNodes.length) || (m.removedNodes && m.removedNodes.length))) {
          relevant = true;
          break;
        }
      }
      if (relevant) scheduleRefresh(doc);
    });
    mo.observe(doc.body, { childList: true, characterData: true, subtree: true });
  }

  function initMainFrameHook() {
    const iframe = document.getElementById('Principal');
    if (!iframe) return;

    iframe.addEventListener('load', function () {
      const d = iframe.contentDocument;
      if (!d) return;
      refreshDoc(d);
      observeDoc(d);
    });

    if (iframe.contentDocument) {
      refreshDoc(iframe.contentDocument);
      observeDoc(iframe.contentDocument);
    }
  }

  function reviveAfterReturn() {
    registerMenu(true);
    refreshAll();
  }

  function init() {
    injectStyles(document);
    registerMenu(false);
    refreshAll();
    observeDoc(document);
    initMainFrameHook();

    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY) refreshAll();
    });

    window.addEventListener('pageshow', reviveAfterReturn, true);
    window.addEventListener('focus', reviveAfterReturn, true);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reviveAfterReturn();
    });
  }

  init();
})();