
// ==UserScript==
// @name         Projudi - To-do local
// @namespace    projudi-tarefas-locais.user.js
// @version      1.0
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  To-do local por processo e visão geral na página inicial com tarefas globais.
// @author       louencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/99fd4d691bae5a921bd33fe7eb4c1885/raw/projudi-tarefas-locais.user.js
// @downloadURL  https://gist.githubusercontent.com/lourencosv/99fd4d691bae5a921bd33fe7eb4c1885/raw/projudi-tarefas-locais.user.js
// @match        https://projudi.tjgo.jus.br/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// ==/UserScript==

(function () {
  'use strict';

  // roda só dentro do iframe
  if (window.top === window.self) return;

  const Z_UI = 2147483001;

  const KEY_PREFIX = 'projudi_todo::';
  const KEY_INDEX = `${KEY_PREFIX}index`;
  const KEY_GLOBAL_ITEMS = `${KEY_PREFIX}global::items`;
  const KEY_GLOBAL_UI = `${KEY_PREFIX}global::ui`;

  // Sempre minimizado por padrão + posição alinhada
  const DEFAULT_UI = { minimized: true, right: 12, top: 12 };

  // --------------------- storage (GM_* -> localStorage fallback) ---------------------
  const storage = {
    get(key, fallback) {
      try {
        if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
      } catch (_) {}
      const raw = localStorage.getItem(key);
      if (raw === null || typeof raw === 'undefined') return fallback;
      try { return JSON.parse(raw); } catch (_) { return fallback; }
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

  // --------------------- detecção ---------------------
  function getCNJFromDocument(doc) {
    const text = (doc.body && doc.body.innerText) ? doc.body.innerText : '';
    const match = text.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
    return match ? match[0] : null;
  }

  function isProcessPage(doc) {
    return !!getCNJFromDocument(doc);
  }

  // aceita PaginaAtual=10 e PaginaAtual=-10 no URL do próprio iframe
  function isHomeDashboardIframe() {
    const href = String(location.href || '');
    // cobre ...Usuario?PaginaAtual=10 e ...Usuario?PaginaAtual=-10 (e variações com &)
    return /\/Usuario\?(?:[^#]*&)?PaginaAtual=-?10\b/.test(href) || /\/Usuario\?PaginaAtual=-?10\b/.test(href);
  }

  function processCtxFromDoc() {
    const cnj = getCNJFromDocument(document);
    if (!cnj) return null;
    return { type: 'process', cnj, key: `cnj_${cnj}` };
  }

  // --------------------- keys ---------------------
  function todosKey(ctxKey) { return `${KEY_PREFIX}${ctxKey}::items`; }
  function uiKey(ctxKey) { return `${KEY_PREFIX}${ctxKey}::ui`; }

  // --------------------- index (CNJs para dashboard) ---------------------
  function loadIndex() {
    const idx = storage.get(KEY_INDEX, []);
    return Array.isArray(idx) ? idx : [];
  }
  function saveIndex(idx) { storage.set(KEY_INDEX, idx); }

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

  // --------------------- model ---------------------
  function uid() {
    return 't_' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function loadItemsByKey(ctxKey) {
    const items = storage.get(todosKey(ctxKey), []);
    return Array.isArray(items) ? items : [];
  }
  function saveItemsByKey(ctxKey, items) { storage.set(todosKey(ctxKey), items); }

  function loadUIByKey(ctxKey) {
    const u = storage.get(uiKey(ctxKey), DEFAULT_UI);
    const base = Object.assign({}, DEFAULT_UI);
    if (u && typeof u === 'object') Object.assign(base, u);

    // força sempre minimizado (regra do usuário)
    base.minimized = true;

    if (typeof base.top !== 'number') base.top = DEFAULT_UI.top;
    if (typeof base.right !== 'number') base.right = DEFAULT_UI.right;
    return base;
  }
  function saveUIByKey(ctxKey, ui) {
    // força sempre minimizado mesmo se alguém tentar gravar false
    const u = Object.assign({}, ui, { minimized: true });
    storage.set(uiKey(ctxKey), u);
  }

  function loadGlobalItems() {
    const items = storage.get(KEY_GLOBAL_ITEMS, []);
    return Array.isArray(items) ? items : [];
  }
  function saveGlobalItems(items) { storage.set(KEY_GLOBAL_ITEMS, items); }

  function loadGlobalUI() {
    const u = storage.get(KEY_GLOBAL_UI, DEFAULT_UI);
    const base = Object.assign({}, DEFAULT_UI);
    if (u && typeof u === 'object') Object.assign(base, u);

    // força sempre minimizado
    base.minimized = true;

    if (typeof base.top !== 'number') base.top = DEFAULT_UI.top;
    if (typeof base.right !== 'number') base.right = DEFAULT_UI.right;
    return base;
  }
  function saveGlobalUI(ui) {
    const u = Object.assign({}, ui, { minimized: true });
    storage.set(KEY_GLOBAL_UI, u);
  }

  // --------------------- UI helpers ---------------------
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const c of children) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return node;
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
        width: 360px;
        max-height: 70vh;
        background: #fff;
        border: 1px solid rgba(0,0,0,.18);
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,.22);
        z-index: ${Z_UI};
        display: flex;
        flex-direction: column;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        overflow: hidden;
      }
      #pj-todo * { box-sizing: border-box; }

      #pj-todo-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 10px;
        background: #0b5ed7;
        color: #fff;
        cursor: move;
        user-select: none;
      }
      #pj-todo-title {
        font-size: 13px;
        font-weight: 700;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 250px;
      }
      #pj-todo-actions { display: inline-flex; gap: 6px; }
      .pj-todo-btn {
        width: 28px; height: 28px;
        border: none; border-radius: 8px;
        background: rgba(255,255,255,.18);
        color: #fff;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
      }
      .pj-todo-btn:hover { background: rgba(255,255,255,.28); }

      #pj-todo-body { padding: 10px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }

      .pj-section {
        border: 1px solid rgba(0,0,0,.10);
        border-radius: 10px;
        overflow: hidden;
      }
      .pj-sec-head {
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 800;
        background: rgba(0,0,0,.04);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .pj-sec-head small { font-weight: 600; color: rgba(0,0,0,.55); }

      .pj-new {
        display: flex;
        gap: 8px;
        padding: 10px;
        border-top: 1px solid rgba(0,0,0,.08);
        background: #fff;
      }
      .pj-input {
        flex: 1;
        padding: 8px 10px;
        border: 1px solid rgba(0,0,0,.2);
        border-radius: 10px;
        font-size: 13px;
        outline: none;
      }
      .pj-add {
        padding: 8px 10px;
        border: none;
        border-radius: 10px;
        background: #198754;
        color: #fff;
        cursor: pointer;
        font-size: 13px;
        font-weight: 800;
      }

      .pj-list {
        padding: 6px 8px 10px;
        overflow: auto;
        max-height: 22vh;
        background: #fff;
      }
      .pj-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 8px 6px;
        border-radius: 10px;
      }
      .pj-item:hover { background: rgba(0,0,0,.03); }
      .pj-drag {
        cursor: grab;
        user-select: none;
        padding: 2px 6px;
        border-radius: 8px;
        color: rgba(0,0,0,.55);
      }
      .pj-text {
        flex: 1;
        font-size: 13px;
        line-height: 1.35;
        white-space: pre-wrap;
      }
      .pj-text.done { text-decoration: line-through; color: rgba(0,0,0,.55); }
      .pj-mini { display: flex; gap: 6px; align-items: center; }
      .pj-del {
        border: none;
        background: transparent;
        cursor: pointer;
        color: rgba(0,0,0,.55);
        font-size: 16px;
        line-height: 1;
      }
      .pj-del:hover { color: rgba(0,0,0,.85); }

      .pj-cnj { font-weight: 800; cursor: pointer; }
      .pj-cnj:hover { text-decoration: underline; }

      #pj-todo-min {
        position: fixed;
        right: 12px;
        top: 12px;
        z-index: ${Z_UI};
        border: none;
        border-radius: 999px;
        padding: 10px 12px;
        background: #0b5ed7;
        color: #fff;
        box-shadow: 0 8px 24px rgba(0,0,0,.22);
        cursor: pointer;
        font: 800 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
    `;
    document.head.appendChild(style);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = el('textarea', { value: text, style: 'position:fixed;left:-9999px;top:-9999px;' });
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
    }
  }

  function renderItemsList({ listEl, items, onToggle, onDelete, onEdit, onReorder }) {
    listEl.innerHTML = '';

    if (!items.length) {
      listEl.appendChild(el('div', {
        style: 'padding:10px 4px; font-size:13px; color: rgba(0,0,0,.6);'
      }, ['Sem tarefas.']));
      return;
    }

    for (const item of items) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = !!item.done;

      const drag = el('div', { className: 'pj-drag', title: 'Arrastar para reordenar' }, ['⋮⋮']);

      const textEl = el('div', { className: 'pj-text', title: 'Duplo clique para editar' }, [item.text || '']);
      if (item.done) textEl.classList.add('done');

      const delBtn = el('button', { className: 'pj-del', title: 'Excluir' }, ['🗑']);

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

      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      row.addEventListener('drop', (e) => {
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
    let startX = 0, startY = 0;
    let startRight = 0, startTop = 0;

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

      let right = Math.max(0, startRight - dx);
      let top = Math.max(0, startTop + dy);

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

  // --------------------- mount/unmount ---------------------
  const state = { mounted: false, timer: null, mode: null, ctxKey: null };

  function unmount() {
    const p = document.getElementById('pj-todo');
    if (p) p.remove();
    const m = document.getElementById('pj-todo-min');
    if (m) m.remove();
    state.mounted = false;
    state.mode = null;
    state.ctxKey = null;
  }

  function mountMinButton({ getUI, setUI, label, onOpen }) {
    // garante apenas um
    const existing = document.getElementById('pj-todo-min');
    if (existing) return;

    const ui = getUI();
    const btn = el('button', { id: 'pj-todo-min', title: 'Abrir To-do' }, [label || 'To-do']);
    btn.style.right = `${ui.right}px`;
    btn.style.top = `${ui.top}px`;

    btn.addEventListener('click', () => {
      // ao abrir, não persistimos "minimized=false" (regra: sempre minimizado no próximo load)
      btn.remove();
      onOpen();
    });

    document.body.appendChild(btn);
  }

  // --------------------- PROCESS ---------------------
  function mountProcess(ctx) {
    injectStyles();
    state.mounted = true;
    state.mode = 'process';
    state.ctxKey = ctx.key;

    const getUI = () => loadUIByKey(ctx.key);
    const setUI = (u) => saveUIByKey(ctx.key, u);

    // regra: sempre iniciar minimizado => sempre monta o chip
    mountMinButton({
      getUI, setUI,
      label: 'To-do',
      onOpen: () => openProcessPanel(ctx)
    });
  }

  function openProcessPanel(ctx) {
    const cnjLabel = ctx.cnj;

    const getUI = () => loadUIByKey(ctx.key);
    const setUI = (u) => saveUIByKey(ctx.key, u);

    // remove chip (se existir)
    const chip = document.getElementById('pj-todo-min');
    if (chip) chip.remove();

    const header = el('div', { id: 'pj-todo-header' }, [
      el('div', { id: 'pj-todo-title', title: `To-do do processo ${cnjLabel}` }, [`To-do • ${cnjLabel}`]),
      el('div', { id: 'pj-todo-actions' }, [
        el('button', { className: 'pj-todo-btn', title: 'Fechar' }, ['×']),
      ])
    ]);

    const section = el('div', { className: 'pj-section' }, []);
    const secHead = el('div', { className: 'pj-sec-head' }, [
      el('div', {}, ['Tarefas do processo']),
      el('small', {}, ['Duplo clique edita'])
    ]);

    const list = el('div', { className: 'pj-list' }, []);
    const input = el('input', { className: 'pj-input', type: 'text', placeholder: 'Nova tarefa… (Enter)' });
    const addBtn = el('button', { className: 'pj-add', type: 'button' }, ['Adicionar']);
    const newRow = el('div', { className: 'pj-new' }, [input, addBtn]);

    section.appendChild(secHead);
    section.appendChild(newRow);
    section.appendChild(list);

    const body = el('div', { id: 'pj-todo-body' }, [section]);
    const panel = el('div', { id: 'pj-todo' }, [header, body]);

    const ui = getUI();
    panel.style.right = `${ui.right}px`;
    panel.style.top = `${ui.top}px`;

    const closeBtn = header.querySelector('.pj-todo-btn');
    closeBtn.addEventListener('click', () => {
      panel.remove();
      // volta para o chip (sempre minimizado)
      mountMinButton({
        getUI, setUI,
        label: 'To-do',
        onOpen: () => openProcessPanel(ctx)
      });
    });

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
        onDelete: (id) => {
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
          const [moved] = it.splice(fromIdx, 1);
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
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addItem(); });

    enableDragWindow({
      loadUI: getUI,
      saveUI: setUI,
      panel,
      handle: header
    });

    document.body.appendChild(panel);

    ensureIndexHas(ctx);
    rerender();
  }

  // --------------------- HOME (dashboard) ---------------------
  function mountHomeDashboard() {
    injectStyles();
    state.mounted = true;
    state.mode = 'home';
    state.ctxKey = 'global';

    const getUI = () => loadGlobalUI();
    const setUI = (u) => saveGlobalUI(u);

    // regra: sempre iniciar minimizado => sempre monta o chip
    mountMinButton({
      getUI, setUI,
      label: 'To-do',
      onOpen: () => openHomePanel()
    });
  }

  function openHomePanel() {
    const getUI = () => loadGlobalUI();
    const setUI = (u) => saveGlobalUI(u);

    const chip = document.getElementById('pj-todo-min');
    if (chip) chip.remove();

    const header = el('div', { id: 'pj-todo-header' }, [
      el('div', { id: 'pj-todo-title', title: 'Visão geral de tarefas' }, ['To-do • Visão geral']),
      el('div', { id: 'pj-todo-actions' }, [
        el('button', { className: 'pj-todo-btn', title: 'Fechar' }, ['×']),
      ])
    ]);

    const globalSection = el('div', { className: 'pj-section' }, []);
    const globalHead = el('div', { className: 'pj-sec-head' }, [
      el('div', {}, ['Tarefas globais']),
      el('small', {}, ['Ex.: protocolar'])
    ]);
    const globalList = el('div', { className: 'pj-list' }, []);
    const globalInput = el('input', { className: 'pj-input', type: 'text', placeholder: 'Nova tarefa global… (Enter)' });
    const globalAdd = el('button', { className: 'pj-add', type: 'button' }, ['Adicionar']);
    const globalNew = el('div', { className: 'pj-new' }, [globalInput, globalAdd]);

    globalSection.appendChild(globalHead);
    globalSection.appendChild(globalNew);
    globalSection.appendChild(globalList);

    const procSection = el('div', { className: 'pj-section' }, []);
    const procHead = el('div', { className: 'pj-sec-head' }, [
      el('div', {}, ['Pendências por processo']),
      el('small', {}, ['Clique no CNJ para copiar'])
    ]);
    const procList = el('div', { className: 'pj-list', style: 'max-height: 30vh;' }, []);
    procSection.appendChild(procHead);
    procSection.appendChild(procList);

    const body = el('div', { id: 'pj-todo-body' }, [globalSection, procSection]);
    const panel = el('div', { id: 'pj-todo' }, [header, body]);

    const ui = getUI();
    panel.style.right = `${ui.right}px`;
    panel.style.top = `${ui.top}px`;

    const closeBtn = header.querySelector('.pj-todo-btn');
    closeBtn.addEventListener('click', () => {
      panel.remove();
      mountMinButton({
        getUI, setUI,
        label: 'To-do',
        onOpen: () => openHomePanel()
      });
    });

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
        onDelete: (id) => {
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
          const [moved] = it.splice(fromIdx, 1);
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
        procList.appendChild(el('div', {
          style: 'padding:10px 4px; font-size:13px; color: rgba(0,0,0,.6);'
        }, ['Sem pendências por processo.']));
        return;
      }

      rows.sort((a, b) => (b.pending.length - a.pending.length));

      for (const r of rows) {
        const box = el('div', { style: 'padding:8px 6px 10px; border-bottom: 1px solid rgba(0,0,0,.08);' }, []);

        const cnjLine = el('div', { style: 'display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;' }, [
          el('div', { className: 'pj-cnj', title: 'Clique para copiar CNJ' }, [r.cnj]),
          el('small', { style: 'color: rgba(0,0,0,.55); font-weight:700;' }, [`${r.pending.length} pend.`])
        ]);

        cnjLine.querySelector('.pj-cnj').addEventListener('click', async () => {
          await copyToClipboard(r.cnj);
        });

        const innerList = el('div', {}, []);

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
          onDelete: (id) => {
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

            const [moved] = pendings.splice(fromIdx, 1);
            pendings.splice(toIdx, 0, moved);

            saveItemsByKey(r.key, [...pendings, ...dones]);
            touchIndex({ key: r.key, cnj: r.cnj });
            renderProcessesPending();
          }
        });

        box.appendChild(cnjLine);
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
    globalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addGlobal(); });

    enableDragWindow({
      loadUI: getUI,
      saveUI: setUI,
      panel,
      handle: header
    });

    document.body.appendChild(panel);

    renderGlobal();
    renderProcessesPending();
  }

  // --------------------- evaluator ---------------------
  function evaluate() {
    injectStyles();

    // prioridade: home dashboard do iframe
    if (isHomeDashboardIframe()) {
      if (!state.mounted || state.mode !== 'home') {
        unmount();
        mountHomeDashboard();
      }
      return;
    }

    // depois: processo (CNJ detectado)
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

    // qualquer outra tela: não exibe
    if (state.mounted) unmount();
  }

  window.addEventListener('load', () => setTimeout(evaluate, 300));
  const obs = new MutationObserver(() => {
    clearTimeout(state.timer);
    state.timer = setTimeout(evaluate, 250);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  evaluate();
})();