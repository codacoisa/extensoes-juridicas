// ==UserScript==
// @name         Processos Favoritos
// @namespace    projudi-processos-favoritos.user.js
// @version      1.0
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
  const STYLE_ID = 'lp-style-favoritos';
  const BTN_ID = 'lp-toggle-proc-btn';
  const MENU_LABEL = 'Favoritos: Abrir Painel';
  const PANEL_OVERLAY_ID = 'lp-fav-panel-overlay';

  let menuCommandId = null;
  let menuRegistered = false;
  let initialized = false;

  const refreshTimers = new WeakMap();
  const docObservers = new WeakMap();
  const highlightState = new WeakMap();
  const boundDocs = new WeakSet();

  const QUICK_SHORT_RE = /\d+\.\d{1,2}/;

  const globalHandlers = {
    storage: null,
    pageshow: null,
    focus: null,
    visibility: null,
    pagehide: null
  };
  let storeCache = null;
  let favSetCache = null;

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

  function supportsMenuCommand() {
    return typeof GM_registerMenuCommand === 'function';
  }

  function invalidateStoreCache() {
    storeCache = null;
    favSetCache = null;
  }

  function readStore() {
    if (Array.isArray(storeCache)) return storeCache.slice();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
      storeCache = list;
      favSetCache = null;
      return list.slice();
    } catch {
      storeCache = [];
      favSetCache = null;
      return [];
    }
  }

  function writeStore(list) {
    const normalized = [...new Set(list.filter(Boolean).map(String))];
    storeCache = normalized.slice();
    favSetCache = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
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
    if (favSetCache) return favSetCache;
    const keys = readStore().map(normalizeFull).filter(Boolean);
    favSetCache = new Set(keys);
    return favSetCache;
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

      #${PANEL_OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        background: rgba(11, 18, 32, 0.5);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
      }

      #${PANEL_OVERLAY_ID},
      #${PANEL_OVERLAY_ID} * {
        box-sizing: border-box;
      }

      #${PANEL_OVERLAY_ID} .lp-panel {
        width: 640px;
        max-width: calc(100vw - 24px);
        max-height: min(88vh, 860px);
        background: #ffffff;
        color: #0f172a;
        border-radius: 14px;
        box-shadow: 0 24px 70px rgba(2, 6, 23, 0.3);
        border: 1px solid #dbe3ef;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.35;
        transform: translateY(6px) scale(0.985);
        opacity: 0.96;
        transition: transform 0.16s ease, opacity 0.16s ease;
      }

      #${PANEL_OVERLAY_ID} .lp-head {
        padding: 14px 16px;
        background: linear-gradient(135deg, #0f3e75, #1f5ca4);
        color: #ffffff;
      }

      #${PANEL_OVERLAY_ID} .lp-head-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      #${PANEL_OVERLAY_ID} .lp-title {
        font-size: 16px;
        font-weight: 700;
        line-height: 1.2;
      }

      #${PANEL_OVERLAY_ID} .lp-subtitle {
        font-size: 12px;
        opacity: 0.9;
        margin-top: 2px;
      }

      #${PANEL_OVERLAY_ID} .lp-close {
        border: 0;
        background: rgba(255, 255, 255, 0.2);
        color: #ffffff;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      }

      #${PANEL_OVERLAY_ID} .lp-body {
        padding: 16px;
      }

      #${PANEL_OVERLAY_ID} .lp-row {
        display: flex;
        gap: 8px;
      }

      #${PANEL_OVERLAY_ID} .lp-card {
        border: 1px solid #dbe3ef;
        border-radius: 10px;
        padding: 12px;
      }

      #${PANEL_OVERLAY_ID} input[type="text"] {
        width: 100%;
        min-width: 0;
        padding: 6px 8px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        color: #0f172a;
        background: #ffffff;
        font-size: 14px;
        line-height: 1.35;
      }

      #${PANEL_OVERLAY_ID} input[type="text"]:focus {
        outline: 2px solid rgba(15, 62, 117, 0.2);
        border-color: #0f3e75;
      }

      #${PANEL_OVERLAY_ID} .lp-btn {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #1e293b;
        border-radius: 8px;
        padding: 7px 11px;
        min-width: 86px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.2;
        white-space: nowrap;
      }

      #${PANEL_OVERLAY_ID} .lp-btn-primary {
        background: #0f3e75;
        border-color: #0f3e75;
        color: #ffffff;
      }

      #${PANEL_OVERLAY_ID} #lp-save {
        font-weight: 600;
      }

      #${PANEL_OVERLAY_ID} .lp-btn-soft {
        background: #f8fafc;
      }

      #${PANEL_OVERLAY_ID} .lp-actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }

      #${PANEL_OVERLAY_ID} .lp-actions .lp-btn {
        flex: 1;
      }

      #${PANEL_OVERLAY_ID} .lp-status {
        min-height: 20px;
        margin-top: 10px;
        font-size: 12px;
        color: #64748b;
      }

      #${PANEL_OVERLAY_ID} .lp-status.ok {
        color: #166534;
      }

      #${PANEL_OVERLAY_ID} .lp-status.err {
        color: #b42318;
      }

      #${PANEL_OVERLAY_ID} .lp-list-wrap {
        margin-top: 10px;
        border: 1px solid #dbe3ef;
        border-radius: 10px;
        overflow: hidden;
      }

      #${PANEL_OVERLAY_ID} ul {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: min(42vh, 380px);
        overflow: auto;
      }

      #${PANEL_OVERLAY_ID} li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid #f1f5f9;
      }

      #${PANEL_OVERLAY_ID} li:last-child {
        border-bottom: 0;
      }

      #${PANEL_OVERLAY_ID} .lp-item-num {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        color: #1f2937;
      }

      #${PANEL_OVERLAY_ID} .lp-empty {
        color: #64748b;
      }

      #${PANEL_OVERLAY_ID} .lp-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #dbe3ef;
        background: #f8fafc;
      }

      #${PANEL_OVERLAY_ID} .lp-count {
        font-size: 12px;
        color: #64748b;
      }

      @media (max-width: 640px) {
        #${PANEL_OVERLAY_ID} .lp-body {
          padding: 12px;
        }

        #${PANEL_OVERLAY_ID} .lp-foot {
          padding: 10px 12px;
        }
      }
    `;

    doc.head.appendChild(style);
  }

  function highlightLinksInDoc(doc) {
    if (!doc || !doc.body) return;
    injectStyles(doc);

    const favs = getFavSet();
    const favSignature = Array.from(favs).sort().join('|');
    const state = highlightState.get(doc) || { signature: '', highlightedCount: 0 };

    if (!favs.size) {
      if (!state.highlightedCount) {
        highlightState.set(doc, { signature: '', highlightedCount: 0 });
        return;
      }
      const current = doc.querySelectorAll('a.lp-proc-highlight');
      current.forEach((a) => a.classList.remove('lp-proc-highlight'));
      highlightState.set(doc, { signature: '', highlightedCount: 0 });
      return;
    }

    const links = doc.querySelectorAll('a');
    let highlightedCount = 0;

    for (const a of links) {
      const text = a.textContent || '';
      const likelyProcess = QUICK_SHORT_RE.test(text);
      const key = likelyProcess ? normalizeShort(text) : null;
      const shouldHighlight = !!(key && favs.has(key));

      if (shouldHighlight) {
        a.classList.add('lp-proc-highlight');
        highlightedCount += 1;
      } else if (a.classList.contains('lp-proc-highlight')) {
        a.classList.remove('lp-proc-highlight');
      }
    }

    if (state.signature !== favSignature || state.highlightedCount !== highlightedCount) {
      highlightState.set(doc, { signature: favSignature, highlightedCount });
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

  function closePanel() {
    const overlay = document.getElementById(PANEL_OVERLAY_ID);
    if (!overlay) return;

    if (typeof overlay.__lpUnlockScroll === 'function') overlay.__lpUnlockScroll();

    const escHandler = overlay.__lpEscHandler;
    if (escHandler) document.removeEventListener('keydown', escHandler);

    overlay.remove();
  }

  function buildPanel(doc) {
    if (!doc || !doc.body) return;

    closePanel();
    injectStyles(doc);

    const overlay = doc.createElement('div');
    overlay.id = PANEL_OVERLAY_ID;
    overlay.__lpUnlockScroll = lockBodyScroll(doc);

    overlay.innerHTML = `
      <div class="lp-panel" role="dialog" aria-modal="true" aria-label="Painel de processos favoritos">
        <div class="lp-head">
          <div class="lp-head-row">
            <div>
              <div class="lp-title">Processos Favoritos</div>
              <div class="lp-subtitle">Gerencie sua lista local de processos</div>
            </div>
            <button type="button" class="lp-close" id="lp-close-btn" title="Fechar">×</button>
          </div>
        </div>
        <div class="lp-body">
          <div class="lp-card">
            <div class="lp-row">
              <input type="text" id="lp-add-input" placeholder="0000000-00.0000.0.00.0000" />
              <button type="button" class="lp-btn lp-btn-primary" id="lp-add-btn">Adicionar</button>
            </div>
            <div class="lp-actions">
              <button type="button" class="lp-btn lp-btn-soft" id="lp-export">Exportar JSON</button>
              <button type="button" class="lp-btn lp-btn-soft" id="lp-import">Importar JSON</button>
              <input type="file" id="lp-import-file" accept=".json,application/json" style="display:none" />
            </div>
            <div class="lp-status" id="lp-status" aria-live="polite"></div>
          </div>
          <div class="lp-list-wrap">
            <ul id="lp-list"></ul>
          </div>
        </div>
        <div class="lp-foot">
          <span class="lp-count" id="lp-count"></span>
          <div class="lp-row">
            <button type="button" class="lp-btn" id="lp-clear">Limpar tudo</button>
            <button type="button" class="lp-btn" id="lp-cancel">Fechar</button>
            <button type="button" class="lp-btn lp-btn-primary" id="lp-save">Salvar</button>
          </div>
        </div>
      </div>
    `;

    doc.body.appendChild(overlay);

    const panel = overlay.querySelector('.lp-panel');
    requestAnimationFrame(() => {
      panel.style.transform = 'translateY(0) scale(1)';
      panel.style.opacity = '1';
    });

    const addBtn = overlay.querySelector('#lp-add-btn');
    const addInput = overlay.querySelector('#lp-add-input');
    const exportBtn = overlay.querySelector('#lp-export');
    const importBtn = overlay.querySelector('#lp-import');
    const importInput = overlay.querySelector('#lp-import-file');
    const status = overlay.querySelector('#lp-status');
    const clearBtn = overlay.querySelector('#lp-clear');
    const closeBtn = overlay.querySelector('#lp-close-btn');
    const cancelBtn = overlay.querySelector('#lp-cancel');
    const saveBtn = overlay.querySelector('#lp-save');
    const ul = overlay.querySelector('#lp-list');
    const count = overlay.querySelector('#lp-count');

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
          del.className = 'lp-btn';
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

    function escClose(ev) {
      if (ev.key === 'Escape') closePanel();
    }

    overlay.__lpEscHandler = escClose;

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

    closeBtn.addEventListener('click', closePanel);
    cancelBtn.addEventListener('click', closePanel);
    saveBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePanel();
    });

    document.addEventListener('keydown', escClose);
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

  function scheduleRefresh(doc, delayMs = 180) {
    if (!doc || !doc.body) return;
    const existing = refreshTimers.get(doc);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      refreshTimers.delete(doc);
      refreshDoc(doc);
    }, delayMs);

    refreshTimers.set(doc, timer);
  }

  function clearDocArtifacts(doc) {
    if (!doc) return;
    const timer = refreshTimers.get(doc);
    if (timer) {
      clearTimeout(timer);
      refreshTimers.delete(doc);
    }
    const observer = docObservers.get(doc);
    if (observer) {
      observer.disconnect();
      docObservers.delete(doc);
    }
    highlightState.delete(doc);
  }

  function observeDoc(doc) {
    if (!doc || !doc.body) return;
    if (docObservers.has(doc)) return;

    const mo = new MutationObserver((mutations) => {
      let relevant = false;
      for (const m of mutations) {
        const target = m.target && m.target.nodeType === 1 ? m.target : m.target && m.target.parentElement;
        if (
          target &&
          (
            target.id === PANEL_OVERLAY_ID ||
            target.closest(`#${PANEL_OVERLAY_ID}`) ||
            target.id === STYLE_ID
          )
        ) {
          continue;
        }
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
    docObservers.set(doc, mo);
  }

  function initMainFrameHook() {
    const iframe = document.getElementById('Principal');
    if (!iframe) return;
    if (boundDocs.has(iframe)) return;
    boundDocs.add(iframe);

    iframe.addEventListener('load', function () {
      const d = iframe.contentDocument;
      if (!d) return;
      clearDocArtifacts(d);
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

  function installGlobalHandlers() {
    if (!globalHandlers.storage) {
      globalHandlers.storage = function (e) {
        if (e.key === STORAGE_KEY) {
          invalidateStoreCache();
          refreshAll();
        }
      };
      window.addEventListener('storage', globalHandlers.storage);
    }
    if (!globalHandlers.pageshow) {
      globalHandlers.pageshow = reviveAfterReturn;
      window.addEventListener('pageshow', globalHandlers.pageshow, true);
    }
    if (!globalHandlers.focus) {
      globalHandlers.focus = reviveAfterReturn;
      window.addEventListener('focus', globalHandlers.focus, true);
    }
    if (!globalHandlers.visibility) {
      globalHandlers.visibility = () => {
        if (!document.hidden) reviveAfterReturn();
      };
      document.addEventListener('visibilitychange', globalHandlers.visibility);
    }
    if (!globalHandlers.pagehide) {
      globalHandlers.pagehide = () => {
        clearDocArtifacts(document);
        const iframe = document.getElementById('Principal');
        if (iframe && iframe.contentDocument) clearDocArtifacts(iframe.contentDocument);
      };
      window.addEventListener('pagehide', globalHandlers.pagehide, true);
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    injectStyles(document);
    registerMenu(false);
    refreshAll();
    observeDoc(document);
    initMainFrameHook();
    installGlobalHandlers();
  }

  init();
})();
