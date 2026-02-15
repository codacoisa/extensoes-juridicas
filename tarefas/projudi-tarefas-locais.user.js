// ==UserScript==
// @name         To-do local
// @namespace    projudi-tarefas-locais.user.js
// @version      1.3
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  To-do local por processo e visão geral na página inicial com tarefas globais.
// @author       louencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/99fd4d691bae5a921bd33fe7eb4c1885/raw/projudi-tarefas-locais.user.js
// @downloadURL  https://gist.githubusercontent.com/lourencosv/99fd4d691bae5a921bd33fe7eb4c1885/raw/projudi-tarefas-locais.user.js
// @match        *://projudi.tjgo.jus.br/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// ==/UserScript==

(function () {
  'use strict';

  if (window.top === window.self) return;

  const Z_UI = 2147483001;
  const KEY_PREFIX = 'projudi_todo::';
  const KEY_INDEX = `${KEY_PREFIX}index`;
  const KEY_GLOBAL_ITEMS = `${KEY_PREFIX}global::items`;
  const KEY_GLOBAL_UI = `${KEY_PREFIX}global::ui`;
  const DEFAULT_UI = { minimized: true, right: 12, top: 12 };
  const EXPORT_SCHEMA = 'projudi-todo-export-v1';
  const FA_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';

  const state = { mounted: false, timer: null, mode: null, ctxKey: null };

  function shouldRunInThisFrame() {
    if (document.visibilityState !== 'visible') return false;
    const frame = window.frameElement;
    if (!frame) return true;
    const style = window.getComputedStyle(frame);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = frame.getBoundingClientRect();
    if (rect.width < 700 || rect.height < 450) return false;
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false;
    return true;
  }

  const storage = {
    get(key, fallback) {
      try {
        if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
      } catch (_) {}
      const raw = localStorage.getItem(key);
      if (raw === null || typeof raw === 'undefined') return fallback;
      try {
        return JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        if (typeof GM_setValue === 'function') return GM_setValue(key, value);
      } catch (_) {}
      localStorage.setItem(key, JSON.stringify(value));
    },
    del(key) {
      try {
        if (typeof GM_deleteValue === 'function') return GM_deleteValue(key);
      } catch (_) {}
      localStorage.removeItem(key);
    }
  };

  function getCNJFromDocument(doc) {
    const text = doc.body && doc.body.innerText ? doc.body.innerText : '';
    const match = text.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
    return match ? match[0] : null;
  }

  function isProcessPage(doc) {
    return !!getCNJFromDocument(doc);
  }

  function isHomeDashboardIframe() {
    const href = String(location.href || '');
    return /\/Usuario\?(?:[^#]*&)?PaginaAtual=-?10\b/.test(href) || /\/Usuario\?PaginaAtual=-?10\b/.test(href);
  }

  function processCtxFromDoc() {
    const cnj = getCNJFromDocument(document);
    if (!cnj) return null;
    const shortCnj = String(cnj).split('.')[0] || cnj;
    return { type: 'process', cnj, shortCnj, key: `cnj_${cnj}` };
  }

  function todosKey(ctxKey) {
    return `${KEY_PREFIX}${ctxKey}::items`;
  }

  function uiKey(ctxKey) {
    return `${KEY_PREFIX}${ctxKey}::ui`;
  }

  function loadIndex() {
    const idx = storage.get(KEY_INDEX, []);
    return Array.isArray(idx) ? idx : [];
  }

  function saveIndex(idx) {
    storage.set(KEY_INDEX, idx);
  }

  function ensureIndexHas(ctx) {
    const idx = loadIndex();
    if (!idx.some(x => x && x.key === ctx.key)) {
      idx.push({ key: ctx.key, cnj: ctx.cnj, updatedAt: Date.now() });
      saveIndex(idx);
    }
  }

  function touchIndex(ctx) {
    const idx = loadIndex();
    const i = idx.findIndex(x => x && x.key === ctx.key);
    if (i >= 0) {
      idx[i].updatedAt = Date.now();
      idx[i].cnj = ctx.cnj;
      saveIndex(idx);
    } else {
      ensureIndexHas(ctx);
    }
  }

  function maybeRemoveFromIndexIfEmpty(ctx) {
    const items = loadItemsByKey(ctx.key);
    if (items && items.length > 0) return;
    saveIndex(loadIndex().filter(x => x && x.key !== ctx.key));
  }

  function uid() {
    return 't_' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function loadItemsByKey(ctxKey) {
    const items = storage.get(todosKey(ctxKey), []);
    return Array.isArray(items) ? items : [];
  }

  function saveItemsByKey(ctxKey, items) {
    storage.set(todosKey(ctxKey), items);
  }

  function loadUIByKey(ctxKey) {
    const u = storage.get(uiKey(ctxKey), DEFAULT_UI);
    const base = Object.assign({}, DEFAULT_UI);
    if (u && typeof u === 'object') Object.assign(base, u);
    base.minimized = true;
    if (typeof base.top !== 'number') base.top = DEFAULT_UI.top;
    if (typeof base.right !== 'number') base.right = DEFAULT_UI.right;
    return base;
  }

  function saveUIByKey(ctxKey, ui) {
    const u = Object.assign({}, ui, { minimized: true });
    storage.set(uiKey(ctxKey), u);
  }

  function loadGlobalItems() {
    const items = storage.get(KEY_GLOBAL_ITEMS, []);
    return Array.isArray(items) ? items : [];
  }

  function saveGlobalItems(items) {
    storage.set(KEY_GLOBAL_ITEMS, items);
  }

  function loadGlobalUI() {
    const u = storage.get(KEY_GLOBAL_UI, DEFAULT_UI);
    const base = Object.assign({}, DEFAULT_UI);
    if (u && typeof u === 'object') Object.assign(base, u);
    base.minimized = true;
    if (typeof base.top !== 'number') base.top = DEFAULT_UI.top;
    if (typeof base.right !== 'number') base.right = DEFAULT_UI.right;
    return base;
  }

  function saveGlobalUI(ui) {
    const u = Object.assign({}, ui, { minimized: true });
    storage.set(KEY_GLOBAL_UI, u);
  }

  function getKnownTodoKeysFromIndex() {
    const idx = loadIndex();
    const keys = [KEY_INDEX, KEY_GLOBAL_ITEMS, KEY_GLOBAL_UI];
    for (const entry of idx) {
      if (!entry || !entry.key) continue;
      keys.push(todosKey(entry.key));
      keys.push(uiKey(entry.key));
    }
    return keys;
  }

  function listTodoKeys() {
    try {
      if (typeof GM_listValues === 'function') {
        const keys = GM_listValues();
        if (Array.isArray(keys)) return keys.filter(k => String(k).startsWith(KEY_PREFIX));
      }
    } catch (_) {}

    const set = new Set(getKnownTodoKeysFromIndex());
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(KEY_PREFIX)) set.add(k);
      }
    } catch (_) {}
    return [...set];
  }

  function exportTodoData() {
    const data = {};
    const keys = listTodoKeys();

    for (const key of keys) {
      data[key] = storage.get(key, null);
    }

    const payload = {
      schema: EXPORT_SCHEMA,
      exportedAt: new Date().toISOString(),
      data
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', {
      href: url,
      download: `projudi-todo-export-${Date.now()}.json`
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importTodoData() {
    const fileInput = el('input', { type: 'file', accept: 'application/json' });

    const file = await new Promise(resolve => {
      fileInput.addEventListener('change', () => resolve(fileInput.files && fileInput.files[0] ? fileInput.files[0] : null), { once: true });
      fileInput.click();
    });

    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;

      if (!data || typeof data !== 'object') {
        alert('JSON inválido para importação.');
        return;
      }

      const importedKeys = Object.keys(data).filter(k => k.startsWith(KEY_PREFIX));
      if (!importedKeys.length) {
        alert('Nenhuma chave de To-do encontrada no JSON.');
        return;
      }

      if (!confirm('Importar vai substituir os dados atuais de To-do. Deseja continuar?')) return;

      const existing = listTodoKeys();
      for (const key of existing) storage.del(key);

      for (const key of importedKeys) {
        storage.set(key, data[key]);
      }

      alert('Importação concluída.');
      unmount();
      setTimeout(evaluate, 50);
    } catch (_) {
      alert('Falha ao importar JSON. Verifique o arquivo.');
    }
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const c of children) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return node;
  }

  function ensureFontAwesome() {
    if (document.querySelector('link[data-pj-fa="1"]')) return;
    const link = el('link', {
      rel: 'stylesheet',
      href: FA_CDN
    });
    link.setAttribute('data-pj-fa', '1');
    document.head.appendChild(link);
  }

  function injectStyles() {
    if (document.getElementById('pj-todo-style')) return;
    const style = document.createElement('style');
    style.id = 'pj-todo-style';
    style.textContent = `
      #pj-todo {
        position: fixed;
        right: 12px;
        top: 12px;
        width: 332px;
        max-height: 84vh;
        background: #fff;
        border: 1px solid rgba(0,0,0,.18);
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,.22);
        z-index: ${Z_UI};
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        overscroll-behavior: contain;
      }
      #pj-todo * { box-sizing: border-box; }

      #pj-todo-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 8px;
        background: #0b5ed7;
        color: #fff;
        cursor: move;
        user-select: none;
      }
      #pj-todo-title {
        font-size: 12px;
        font-weight: 800;
        line-height: 1.1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 235px;
      }
      #pj-todo-actions { display: inline-flex; gap: 4px; }
      .pj-todo-btn {
        width: 22px;
        height: 22px;
        border: none;
        border-radius: 6px;
        background: rgba(255,255,255,.2);
        color: #fff;
        cursor: pointer;
        font-size: 14px;
        font-weight: 800;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .pj-todo-btn:hover { background: rgba(255,255,255,.3); }

      #pj-todo-body {
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow: hidden;
        min-height: 0;
      }

      .pj-section {
        border: 1px solid rgba(0,0,0,.11);
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .pj-sec-head {
        padding: 5px 7px;
        font-size: 11px;
        font-weight: 800;
        background: rgba(0,0,0,.05);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .pj-sec-head small {
        font-size: 10px;
        color: rgba(0,0,0,.6);
        font-weight: 700;
      }

      .pj-new {
        display: flex;
        gap: 5px;
        padding: 5px 6px;
        border-top: 1px solid rgba(0,0,0,.08);
        background: #fff;
      }
      .pj-input {
        flex: 1;
        border: 1px solid rgba(0,0,0,.22);
        border-radius: 7px;
        padding: 5px 7px;
        font-size: 12px;
        min-width: 0;
      }
      .pj-add {
        border: none;
        border-radius: 7px;
        background: #198754;
        color: #fff;
        cursor: pointer;
        font-size: 12px;
        font-weight: 800;
        padding: 5px 8px;
        white-space: nowrap;
      }

      .pj-list {
        overflow: auto;
        min-height: 0;
        max-height: 30vh;
        padding: 2px 4px 4px;
        background: #fff;
        overscroll-behavior: contain;
      }

      .pj-home-global .pj-list { max-height: 24vh; }
      .pj-home-process {
        flex: 1;
        min-height: 150px;
      }
      .pj-home-process .pj-list {
        flex: 1;
        min-height: 0;
        max-height: none;
      }

      .pj-item {
        display: flex;
        align-items: flex-start;
        gap: 5px;
        padding: 2px 2px;
        border-radius: 6px;
      }
      .pj-item:hover { background: rgba(0,0,0,.03); }

      .pj-drag {
        cursor: grab;
        user-select: none;
        color: rgba(0,0,0,.52);
        font-size: 11px;
        line-height: 1;
        padding: 2px 2px 0;
        width: 12px;
        text-align: center;
      }

      .pj-mini {
        display: inline-flex;
        align-items: center;
      }
      .pj-mini input[type="checkbox"] {
        width: 13px;
        height: 13px;
        margin: 2px 0 0;
      }

      .pj-text {
        flex: 1;
        font-size: 12px;
        line-height: 1.15;
        word-break: break-word;
        white-space: pre-wrap;
        padding-top: 1px;
      }
      .pj-text.done {
        text-decoration: line-through;
        color: rgba(0,0,0,.5);
      }

      .pj-del {
        width: 18px;
        height: 18px;
        border: none;
        border-radius: 5px;
        background: transparent;
        cursor: pointer;
        color: #c62828;
        font-size: 14px;
        line-height: 1;
        font-weight: 900;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: 0;
      }
      .pj-del:hover {
        color: #8e0000;
        background: rgba(198,40,40,.12);
      }

      .pj-empty {
        padding: 6px 4px;
        font-size: 11px;
        color: rgba(0,0,0,.58);
      }

      .pj-cnj {
        font-weight: 800;
        cursor: pointer;
        font-size: 12px;
        line-height: 1.1;
      }
      .pj-cnj:hover { text-decoration: underline; }

      .pj-proc-row {
        border-bottom: 1px solid rgba(0,0,0,.08);
        padding: 5px 2px 6px;
      }
      .pj-proc-row:last-child { border-bottom: none; }

      .pj-proc-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-bottom: 2px;
      }

      .pj-proc-count {
        color: rgba(0,0,0,.6);
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
      }

      .pj-list-inline {
        padding: 0;
        overflow: visible;
        max-height: none;
      }

      #pj-todo-min {
        position: fixed;
        right: 12px;
        top: 12px;
        z-index: ${Z_UI};
        width: 42px;
        height: 42px;
        border: 1px solid rgba(0,0,0,.22);
        border-radius: 8px;
        background: #fff;
        color: #0b5ed7;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0,0,0,.22);
      }
      #pj-todo-min:hover {
        background: #f4f8ff;
      }
      #pj-todo-min i {
        pointer-events: none;
        font-size: 22px;
      }
    `;
    document.head.appendChild(style);
  }

  function bindPanelScrollLock(panel) {
    panel.addEventListener('wheel', e => {
      const getScrollable = start => {
        let n = start instanceof Element ? start : null;
        while (n && n !== panel.parentElement) {
          const s = getComputedStyle(n);
          const oy = s.overflowY;
          if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
          n = n.parentElement;
        }
        return null;
      };

      const sc = getScrollable(e.target);
      if (!sc) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const dy = e.deltaY;
      const atTop = sc.scrollTop <= 0;
      const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;

      if ((dy < 0 && atTop) || (dy > 0 && atBottom)) e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = el('textarea', { value: text, style: 'position:fixed;left:-9999px;top:-9999px;' });
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch (_) {}
      ta.remove();
    }
  }

  function renderItemsList({ listEl, items, onToggle, onDelete, onEdit, onReorder }) {
    listEl.innerHTML = '';

    if (!items.length) {
      listEl.appendChild(el('div', { className: 'pj-empty' }, ['Sem tarefas.']));
      return;
    }

    for (const item of items) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = !!item.done;

      const drag = el('div', { className: 'pj-drag', title: 'Arrastar para reordenar' }, ['⋮⋮']);
      const textEl = el('div', { className: 'pj-text', title: 'Duplo clique para editar' }, [item.text || '']);
      if (item.done) textEl.classList.add('done');
      const delBtn = el('button', { className: 'pj-del', title: 'Excluir' }, ['✕']);

      const row = el('div', { className: 'pj-item', draggable: true, 'data-id': item.id }, [
        drag,
        el('div', { className: 'pj-mini' }, [cb]),
        textEl,
        delBtn
      ]);

      cb.addEventListener('change', () => onToggle(item.id, cb.checked));
      delBtn.addEventListener('click', () => onDelete(item.id));
      textEl.addEventListener('dblclick', () => {
        const next = prompt('Editar tarefa:', item.text || '');
        if (next === null) return;
        onEdit(item.id, String(next).trim());
      });

      row.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      row.addEventListener('drop', e => {
        e.preventDefault();
        const fromId = e.dataTransfer.getData('text/plain');
        const toId = row.getAttribute('data-id');
        if (!fromId || !toId || fromId === toId) return;
        onReorder(fromId, toId);
      });

      listEl.appendChild(row);
    }
  }

  function enableDragWindow({ loadUI, saveUI, panel, handle }) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startRight = 0;
    let startTop = 0;

    function onDown(e) {
      const t = e.target;
      if (t && (t.classList?.contains('pj-todo-btn') || t.closest?.('.pj-todo-btn'))) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const ui = loadUI();
      startRight = ui.right;
      startTop = ui.top;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const right = Math.max(0, startRight - dx);
      const top = Math.max(0, startTop + dy);
      panel.style.right = `${right}px`;
      panel.style.top = `${top}px`;
      const ui = loadUI();
      ui.right = right;
      ui.top = top;
      saveUI(ui);
    }

    function onUp() {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    handle.addEventListener('mousedown', onDown);
  }

  function unmount() {
    const p = document.getElementById('pj-todo');
    if (p) p.remove();
    const m = document.getElementById('pj-todo-min');
    if (m) m.remove();
    state.mounted = false;
    state.mode = null;
    state.ctxKey = null;
  }

  function mountMinButton({ getUI, onOpen }) {
    const existing = document.getElementById('pj-todo-min');
    if (existing) return;
    ensureFontAwesome();
    const ui = getUI();
    const icon = el('i', { className: 'fa-solid fa-list-check fa-1x', 'aria-hidden': 'true' });
    const btn = el('button', { id: 'pj-todo-min', title: 'Abrir To-do', 'aria-label': 'Abrir To-do' }, [icon]);
    btn.style.right = `${ui.right}px`;
    btn.style.top = `${ui.top}px`;
    btn.addEventListener('click', () => {
      btn.remove();
      onOpen();
    });
    document.body.appendChild(btn);
  }

  function createHeaderActions({ onExport, onImport, onClose }) {
    const exportBtn = el('button', { className: 'pj-todo-btn', title: 'Exportar JSON' }, ['↓']);
    const importBtn = el('button', { className: 'pj-todo-btn', title: 'Importar JSON' }, ['↑']);
    const closeBtn = el('button', { className: 'pj-todo-btn', title: 'Fechar' }, ['×']);

    exportBtn.addEventListener('click', onExport);
    importBtn.addEventListener('click', onImport);
    closeBtn.addEventListener('click', onClose);

    return el('div', { id: 'pj-todo-actions' }, [exportBtn, importBtn, closeBtn]);
  }

  function mountProcess(ctx) {
    injectStyles();
    state.mounted = true;
    state.mode = 'process';
    state.ctxKey = ctx.key;

    const getUI = () => loadUIByKey(ctx.key);

    mountMinButton({
      getUI,
      onOpen: () => openProcessPanel(ctx)
    });
  }

  function openProcessPanel(ctx) {
    const cnjLabel = ctx.shortCnj || ctx.cnj;
    const getUI = () => loadUIByKey(ctx.key);
    const setUI = u => saveUIByKey(ctx.key, u);

    const chip = document.getElementById('pj-todo-min');
    if (chip) chip.remove();

    const onClose = () => {
      panel.remove();
      mountMinButton({
        getUI,
        onOpen: () => openProcessPanel(ctx)
      });
    };

    const header = el('div', { id: 'pj-todo-header' }, [
      el('div', { id: 'pj-todo-title', title: `To-do do processo ${ctx.cnj}` }, [`To-do • ${cnjLabel}`]),
      createHeaderActions({ onExport: exportTodoData, onImport: importTodoData, onClose })
    ]);

    const section = el('div', { className: 'pj-section' }, []);
    const secHead = el('div', { className: 'pj-sec-head' }, [
      el('div', {}, ['Tarefas do processo']),
      el('small', {}, ['Duplo clique edita'])
    ]);
    const input = el('input', { className: 'pj-input', type: 'text', placeholder: 'Nova tarefa… (Enter)' });
    const addBtn = el('button', { className: 'pj-add', type: 'button' }, ['Adicionar']);
    const newRow = el('div', { className: 'pj-new' }, [input, addBtn]);
    const list = el('div', { className: 'pj-list' }, []);

    section.appendChild(secHead);
    section.appendChild(newRow);
    section.appendChild(list);

    const body = el('div', { id: 'pj-todo-body' }, [section]);
    const panel = el('div', { id: 'pj-todo' }, [header, body]);

    const ui = getUI();
    panel.style.right = `${ui.right}px`;
    panel.style.top = `${ui.top}px`;

    function rerender() {
      const items = loadItemsByKey(ctx.key);
      renderItemsList({
        listEl: list,
        items,
        onToggle: (id, done) => {
          const it = loadItemsByKey(ctx.key);
          const x = it.find(a => a.id === id);
          if (!x) return;
          x.done = !!done;
          saveItemsByKey(ctx.key, it);
          touchIndex(ctx);
          rerender();
        },
        onDelete: id => {
          const it = loadItemsByKey(ctx.key).filter(a => a.id !== id);
          saveItemsByKey(ctx.key, it);
          touchIndex(ctx);
          maybeRemoveFromIndexIfEmpty(ctx);
          rerender();
        },
        onEdit: (id, text) => {
          const it = loadItemsByKey(ctx.key);
          const x = it.find(a => a.id === id);
          if (!x) return;
          x.text = text;
          saveItemsByKey(ctx.key, it);
          touchIndex(ctx);
          rerender();
        },
        onReorder: (fromId, toId) => {
          const it = loadItemsByKey(ctx.key);
          const fromIdx = it.findIndex(a => a.id === fromId);
          const toIdx = it.findIndex(a => a.id === toId);
          if (fromIdx < 0 || toIdx < 0) return;
          const moved = it.splice(fromIdx, 1)[0];
          it.splice(toIdx, 0, moved);
          saveItemsByKey(ctx.key, it);
          touchIndex(ctx);
          rerender();
        }
      });
    }

    function addItem() {
      const text = String(input.value || '').trim();
      if (!text) return;
      const it = loadItemsByKey(ctx.key);
      it.unshift({ id: uid(), text, done: false, createdAt: Date.now() });
      saveItemsByKey(ctx.key, it);
      ensureIndexHas(ctx);
      touchIndex(ctx);
      input.value = '';
      rerender();
    }

    addBtn.addEventListener('click', addItem);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') addItem();
    });

    enableDragWindow({ loadUI: getUI, saveUI: setUI, panel, handle: header });
    bindPanelScrollLock(panel);

    document.body.appendChild(panel);
    ensureIndexHas(ctx);
    rerender();
  }

  function mountHomeDashboard() {
    injectStyles();
    state.mounted = true;
    state.mode = 'home';
    state.ctxKey = 'global';

    const getUI = () => loadGlobalUI();

    mountMinButton({
      getUI,
      onOpen: () => openHomePanel()
    });
  }

  function openHomePanel() {
    const getUI = () => loadGlobalUI();
    const setUI = u => saveGlobalUI(u);

    const chip = document.getElementById('pj-todo-min');
    if (chip) chip.remove();

    const onClose = () => {
      panel.remove();
      mountMinButton({
        getUI,
        onOpen: () => openHomePanel()
      });
    };

    const header = el('div', { id: 'pj-todo-header' }, [
      el('div', { id: 'pj-todo-title', title: 'Visão geral de tarefas' }, ['To-do • Visão geral']),
      createHeaderActions({ onExport: exportTodoData, onImport: importTodoData, onClose })
    ]);

    const globalSection = el('div', { className: 'pj-section pj-home-global' }, []);
    const globalHead = el('div', { className: 'pj-sec-head' }, [
      el('div', {}, ['Tarefas globais']),
      el('small', {}, ['Ex.: protocolar'])
    ]);
    const globalInput = el('input', { className: 'pj-input', type: 'text', placeholder: 'Nova tarefa global… (Enter)' });
    const globalAdd = el('button', { className: 'pj-add', type: 'button' }, ['Adicionar']);
    const globalNew = el('div', { className: 'pj-new' }, [globalInput, globalAdd]);
    const globalList = el('div', { className: 'pj-list' }, []);

    globalSection.appendChild(globalHead);
    globalSection.appendChild(globalNew);
    globalSection.appendChild(globalList);

    const procSection = el('div', { className: 'pj-section pj-home-process' }, []);
    const procHead = el('div', { className: 'pj-sec-head' }, [
      el('div', {}, ['Pendências por processo']),
      el('small', {}, ['Clique no CNJ para copiar'])
    ]);
    const procList = el('div', { className: 'pj-list' }, []);
    procSection.appendChild(procHead);
    procSection.appendChild(procList);

    const body = el('div', { id: 'pj-todo-body' }, [globalSection, procSection]);
    const panel = el('div', { id: 'pj-todo' }, [header, body]);

    const ui = getUI();
    panel.style.right = `${ui.right}px`;
    panel.style.top = `${ui.top}px`;

    function renderGlobal() {
      const items = loadGlobalItems();
      renderItemsList({
        listEl: globalList,
        items,
        onToggle: (id, done) => {
          const it = loadGlobalItems();
          const x = it.find(a => a.id === id);
          if (!x) return;
          x.done = !!done;
          saveGlobalItems(it);
          renderGlobal();
        },
        onDelete: id => {
          saveGlobalItems(loadGlobalItems().filter(a => a.id !== id));
          renderGlobal();
        },
        onEdit: (id, text) => {
          const it = loadGlobalItems();
          const x = it.find(a => a.id === id);
          if (!x) return;
          x.text = text;
          saveGlobalItems(it);
          renderGlobal();
        },
        onReorder: (fromId, toId) => {
          const it = loadGlobalItems();
          const fromIdx = it.findIndex(a => a.id === fromId);
          const toIdx = it.findIndex(a => a.id === toId);
          if (fromIdx < 0 || toIdx < 0) return;
          const moved = it.splice(fromIdx, 1)[0];
          it.splice(toIdx, 0, moved);
          saveGlobalItems(it);
          renderGlobal();
        }
      });
    }

    function renderProcessesPending() {
      procList.innerHTML = '';

      const idx = loadIndex();
      const rows = [];

      for (const entry of idx) {
        if (!entry || !entry.key || !entry.cnj) continue;
        const items = loadItemsByKey(entry.key);
        const pending = items.filter(x => !x.done);
        if (!pending.length) continue;
        rows.push({ cnj: entry.cnj, key: entry.key, pending });
      }

      if (!rows.length) {
        procList.appendChild(el('div', { className: 'pj-empty' }, ['Sem pendências por processo.']));
        return;
      }

      rows.sort((a, b) => b.pending.length - a.pending.length);

      for (const r of rows) {
        const box = el('div', { className: 'pj-proc-row' }, []);
        const head = el('div', { className: 'pj-proc-head' }, [
          el('div', { className: 'pj-cnj', title: 'Clique para copiar CNJ' }, [r.cnj]),
          el('div', { className: 'pj-proc-count' }, [`${r.pending.length} pend.`])
        ]);
        head.querySelector('.pj-cnj').addEventListener('click', async () => {
          await copyToClipboard(r.cnj);
        });

        const innerList = el('div', { className: 'pj-list pj-list-inline' }, []);

        renderItemsList({
          listEl: innerList,
          items: r.pending,
          onToggle: (id, done) => {
            const all = loadItemsByKey(r.key);
            const x = all.find(a => a.id === id);
            if (!x) return;
            x.done = !!done;
            saveItemsByKey(r.key, all);
            touchIndex({ key: r.key, cnj: r.cnj });
            maybeRemoveFromIndexIfEmpty({ key: r.key, cnj: r.cnj });
            renderProcessesPending();
          },
          onDelete: id => {
            const all = loadItemsByKey(r.key).filter(a => a.id !== id);
            saveItemsByKey(r.key, all);
            touchIndex({ key: r.key, cnj: r.cnj });
            maybeRemoveFromIndexIfEmpty({ key: r.key, cnj: r.cnj });
            renderProcessesPending();
          },
          onEdit: (id, text) => {
            const all = loadItemsByKey(r.key);
            const x = all.find(a => a.id === id);
            if (!x) return;
            x.text = text;
            saveItemsByKey(r.key, all);
            touchIndex({ key: r.key, cnj: r.cnj });
            renderProcessesPending();
          },
          onReorder: (fromId, toId) => {
            const all = loadItemsByKey(r.key);
            const pendings = all.filter(x => !x.done);
            const dones = all.filter(x => x.done);
            const fromIdx = pendings.findIndex(x => x.id === fromId);
            const toIdx = pendings.findIndex(x => x.id === toId);
            if (fromIdx < 0 || toIdx < 0) return;
            const moved = pendings.splice(fromIdx, 1)[0];
            pendings.splice(toIdx, 0, moved);
            saveItemsByKey(r.key, [...pendings, ...dones]);
            touchIndex({ key: r.key, cnj: r.cnj });
            renderProcessesPending();
          }
        });

        box.appendChild(head);
        box.appendChild(innerList);
        procList.appendChild(box);
      }
    }

    function addGlobal() {
      const text = String(globalInput.value || '').trim();
      if (!text) return;
      const it = loadGlobalItems();
      it.unshift({ id: uid(), text, done: false, createdAt: Date.now() });
      saveGlobalItems(it);
      globalInput.value = '';
      renderGlobal();
    }

    globalAdd.addEventListener('click', addGlobal);
    globalInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') addGlobal();
    });

    enableDragWindow({ loadUI: getUI, saveUI: setUI, panel, handle: header });
    bindPanelScrollLock(panel);

    document.body.appendChild(panel);
    renderGlobal();
    renderProcessesPending();
  }

  function evaluate() {
    injectStyles();
    ensureFontAwesome();

    if (!shouldRunInThisFrame()) {
      if (state.mounted) unmount();
      return;
    }

    if (isHomeDashboardIframe()) {
      if (!state.mounted || state.mode !== 'home') {
        unmount();
        mountHomeDashboard();
      }
      return;
    }

    if (isProcessPage(document)) {
      const ctx = processCtxFromDoc();
      if (!ctx) return;
      const changed = !state.mounted || state.mode !== 'process' || state.ctxKey !== ctx.key;
      if (changed) {
        unmount();
        mountProcess(ctx);
      }
      return;
    }

    if (state.mounted) unmount();
  }

  window.addEventListener('load', () => setTimeout(evaluate, 300));
  document.addEventListener('visibilitychange', () => setTimeout(evaluate, 100));
  window.addEventListener('focus', () => setTimeout(evaluate, 100));
  window.addEventListener('resize', () => setTimeout(evaluate, 100));

  const obs = new MutationObserver(() => {
    clearTimeout(state.timer);
    state.timer = setTimeout(evaluate, 250);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  evaluate();
})();