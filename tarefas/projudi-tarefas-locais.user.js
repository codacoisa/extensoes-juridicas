// ==UserScript==
// @name         Tarefas
// @namespace    projudi-tarefas-locais.user.js
// @version      3.14
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Tarefas locais por processo e visão geral na página inicial, com painel de gestão.
// @author       louencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://raw.githubusercontent.com/thelawhub/tarefas/refs/heads/main/projudi-tarefas-locais.user.js
// @downloadURL  https://raw.githubusercontent.com/thelawhub/tarefas/refs/heads/main/projudi-tarefas-locais.user.js
// @match        *://projudi.tjgo.jus.br/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  // ---- Compatibilidade quoid/userscripts (Safari) e demais gestores ----
  // Polyfill no-op para GM_registerMenuCommand quando indisponivel (quoid),
  // shim de GM_xmlhttpRequest -> GM.xmlHttpRequest/fetch, e atalho de teclado
  // cohesivo entre os scripts da suite: Alt+Shift+T abre o painel de Tarefas.
  // Em Tampermonkey/Violentmonkey o menu tradicional continua disponivel.
  try {
    if (typeof GM_registerMenuCommand !== 'function') {
      window.GM_registerMenuCommand = function () { return null; };
    }
  } catch (_) {}
  try {
    if (typeof GM_xmlhttpRequest !== 'function') {
      if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') {
        window.GM_xmlhttpRequest = function (opts) { return GM.xmlHttpRequest(opts); };
      } else {
        window.GM_xmlhttpRequest = function (opts) {
          try {
            fetch(opts.url, { method: opts.method || 'GET', headers: opts.headers || {} })
              .then(function (r) { return r.text().then(function (t) { return { status: r.status, responseText: t, finalUrl: r.url }; }); })
              .then(function (res) { if (typeof opts.onload === 'function') opts.onload(res); })
              .catch(function (err) { if (typeof opts.onerror === 'function') opts.onerror(err); });
          } catch (e) { if (typeof opts.onerror === 'function') opts.onerror(e); }
          return null;
        };
      }
    }
  } catch (_) {}
  (function pjShortcut() {
    // Leader: Ctrl+; libera 1500ms para pressionar T (Tarefas).
    var ID = 'tarefas';
    var CODE = 'KeyT';
    var isTop = window.top === window.self;
    function inField(e) {
      var t = e && e.target;
      var tag = (t && t.tagName) || '';
      return /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (t && t.isContentEditable);
    }
    function openHere() {
      if (isTop) { try { openManagerPanel(); } catch (_) {} }
      else { try { window.top.postMessage({ type: 'pj-open-panel', script: ID }, '*'); } catch (_) {} }
    }
    window.addEventListener('keydown', function (e) {
      if (!e || e.repeat) return;
      if (inField(e)) return;
      var isLeader = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.code === 'Semicolon';
      if (isLeader) {
        e.preventDefault();
        e.stopPropagation();
        window.__pjLeaderUntil = Date.now() + 1500;
        return;
      }
      if (e.code === CODE && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if ((window.__pjLeaderUntil || 0) > Date.now()) {
          window.__pjLeaderUntil = 0;
          e.preventDefault();
          e.stopPropagation();
          openHere();
        }
      }
    }, true);
    if (isTop) {
      window.addEventListener('message', function (ev) {
        if (!ev || !ev.data || ev.data.type !== 'pj-open-panel' || ev.data.script !== ID) return;
        try { openManagerPanel(); } catch (_) {}
      });
    }
  })();

  const Z_UI = 2147483001;
  const SCRIPT_META = (() => {
    const fallbackName = 'Tarefas';
    const fallbackId = 'projudi-tarefas-locais';
    try {
      const script = GM_info && GM_info.script ? GM_info.script : {};
      const name = String(script.name || fallbackName).trim() || fallbackName;
      const namespace = String(script.namespace || '').trim();
      const version = String(script.version || 'unknown').trim() || 'unknown';
      const base = (namespace || name || fallbackId)
        .replace(/\.user\.js$/i, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
      const id = base || fallbackId;
      return { name, version, id, fileName: `${id}.json` };
    } catch {
      return { name: fallbackName, version: 'unknown', id: fallbackId, fileName: `${fallbackId}.json` };
    }
  })();
  const KEY_PREFIX = 'projudi_todo::';
  const KEY_INDEX = `${KEY_PREFIX}index`;
  const KEY_GLOBAL_ITEMS = `${KEY_PREFIX}global::items`;
  const KEY_GLOBAL_UI = `${KEY_PREFIX}global::ui`;
  const KEY_BACKUP = `${KEY_PREFIX}gist-backup`;
  const EXPORT_EXCLUDED_KEYS = new Set([KEY_BACKUP]);
  const DEFAULT_UI = { minimized: true, right: 12, top: 12 };
  const EXPORT_SCHEMA = 'projudi-tarefas-export-v1';
  const BACKUP_SCHEMA = 'projudi-tarefas-gist-backup-v1';
  const DEFAULT_BACKUP_SETTINGS = {
    enabled: false,
    gistId: '',
    token: '',
    fileName: SCRIPT_META.fileName,
    autoBackupOnSave: false,
    lastBackupAt: '',
    lastBackupSignature: ''
  };
  const AUTO_BACKUP_IDLE_DELAY_MS = 30000;
  const AUTO_BACKUP_MIN_INTERVAL_MS = 15 * 60 * 1000;
  const FA_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
  const FAB_UI = {
    right: 16,
    bottom: 16,
    size: 38,
    brand: '#2b69aa',
    brandHover: '#245a92'
  };
  const PROC_BTN_GAP = {
    postitLeft: 16,
    postitRight: 0,
    nativeLeft: 8,
    nativeRight: 0,
    directHeaderLeft: 10,
    directHeaderRight: 0
  };
  const ID_MIN_BTN = 'pj-todo-min';
  const ID_PROC_BTN = 'pj-todo-proc-btn';
  const ID_HEADER_MENU = 'pj-todo-header-menu';
  const ID_MANAGER_OVERLAY = 'pj-task-manager-overlay';
  const MSG_OPEN_TODO = 'pj-todo-open-panel';
  const LOG_PREFIX = '[Tarefas]';
  const PROCESS_CONTEXT_SELECTOR = '#span_proc_numero, #Principal, button.notaProcesso, button[onclick*="criarNota"], #pj-add-btn';

  const state = {
    mounted: false,
    timer: null,
    mode: null,
    ctxKey: null,
    panelCleanup: null,
    menuRegistered: false,
    lastCnj: null
  };

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

  function parseTags(raw) {
    const text = String(raw || '').trim();
    if (!text) return [];
    const parts = text.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(part);
    }
    return out.slice(0, 5);
  }

  function normalizeTodoItem(item) {
    const src = item && typeof item === 'object' ? item : {};
    const id = src.id ? String(src.id) : uid();
    const text = String(src.text || '').trim();
    const done = !!src.done;
    const createdAt = Number.isFinite(Number(src.createdAt)) ? Number(src.createdAt) : Date.now();
    const completedAt = done ? (Number.isFinite(Number(src.completedAt)) ? Number(src.completedAt) : Date.now()) : null;
    const tags = Array.isArray(src.tags) ? parseTags(src.tags.join(',')) : parseTags(src.tagsText || '');
    return { id, text, done, createdAt, completedAt, tags };
  }

  function normalizeTodoItems(items) {
    const list = Array.isArray(items) ? items : [];
    return list.map(normalizeTodoItem).filter(x => x.text);
  }

  function formatDateTime(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return '--';
    const d = new Date(n);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatCount(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function runPanelCleanup() {
    if (typeof state.panelCleanup !== 'function') return;
    try {
      state.panelCleanup();
    } catch (error) {
      logWarn('Falha ao limpar painel ativo.', error);
    }
    state.panelCleanup = null;
  }

  function setPanelCleanup(fn) {
    runPanelCleanup();
    state.panelCleanup = typeof fn === 'function' ? fn : null;
  }

  function composeCleanups(...fns) {
    const list = fns.filter(fn => typeof fn === 'function');
    if (!list.length) return null;
    return () => {
      for (const fn of list) {
        try {
          fn();
        } catch (error) {
          logWarn('Falha em cleanup do painel.', error);
        }
      }
    };
  }

  function openLauncherSafely({ removeLauncher, onOpen }) {
    try {
      if (typeof removeLauncher === 'function') removeLauncher();
      onOpen();
    } catch (err) {
      logError('Falha ao abrir painel.', err);
      scheduleEvaluate(50);
    }
  }

  function scheduleEvaluate(delay = 0) {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = null;
      evaluate();
    }, Math.max(0, delay | 0));
  }

  function isTopHeaderPage() {
    return window.top === window.self && !!document.getElementById('Principal') && !!document.getElementById('menuPrinciapl');
  }

  function shouldRunInThisFrame() {
    if (document.visibilityState !== 'visible' && !isProcessPage(document) && !isHomeDashboardIframe()) return false;
    const frame = window.frameElement;
    if (!frame) return true;
    if (isProcessPage(document) || isHomeDashboardIframe()) return true;
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
      } catch (error) {
        logWarn(`Falha ao ler ${key} via GM_getValue.`, error);
      }
      const raw = localStorage.getItem(key);
      if (raw === null || typeof raw === 'undefined') return fallback;
      try {
        return JSON.parse(raw);
      } catch (error) {
        logWarn(`Falha ao interpretar ${key} do localStorage.`, error);
        return fallback;
      }
    },
    set(key, value) {
      try {
        if (typeof GM_setValue === 'function') return GM_setValue(key, value);
      } catch (error) {
        logWarn(`Falha ao salvar ${key} via GM_setValue.`, error);
      }
      safeRun(`Falha ao salvar ${key} no localStorage.`, () => {
        localStorage.setItem(key, JSON.stringify(value));
      });
    },
    del(key) {
      try {
        if (typeof GM_deleteValue === 'function') return GM_deleteValue(key);
      } catch (error) {
        logWarn(`Falha ao remover ${key} via GM_deleteValue.`, error);
      }
      safeRun(`Falha ao remover ${key} do localStorage.`, () => {
        localStorage.removeItem(key);
      });
    }
  };

  function normalizeBackupSettings(value) {
    const next = { ...DEFAULT_BACKUP_SETTINGS, ...(value || {}) };
    next.enabled = !!next.enabled;
    next.gistId = String(next.gistId || '').trim();
    next.token = String(next.token || '').trim();
    next.fileName = String(next.fileName || SCRIPT_META.fileName).trim() || SCRIPT_META.fileName;
    next.autoBackupOnSave = !!next.autoBackupOnSave;
    next.lastBackupAt = String(next.lastBackupAt || '').trim();
    next.lastBackupSignature = String(next.lastBackupSignature || '').trim();
    return next;
  }

  function formatLastBackupLabel(value) {
    if (!value) return 'Último backup: ainda não enviado.';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Último backup: ainda não enviado.';
    return `Último backup: ${date.toLocaleString('pt-BR')}.`;
  }

  function loadBackupSettings() {
    return normalizeBackupSettings(storage.get(KEY_BACKUP, DEFAULT_BACKUP_SETTINGS));
  }

  function saveBackupSettings(next) {
    const normalized = normalizeBackupSettings(next);
    storage.set(KEY_BACKUP, normalized);
    return normalized;
  }

  function githubRequest(options) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest indisponível.'));
        return;
      }
      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url: options.url,
        headers: options.headers || {},
        data: options.data,
        onload: resolve,
        onerror: () => reject(new Error('Falha de rede ao acessar o GitHub.')),
        ontimeout: () => reject(new Error('Tempo esgotado ao acessar o GitHub.'))
      });
    });
  }

  function parseGithubError(response) {
    try {
      const parsed = JSON.parse(response.responseText || '{}');
      if (parsed && parsed.message) return parsed.message;
    } catch (_) {}
    return `GitHub respondeu com status ${response.status}.`;
  }

  async function pushBackupToGist(backupSettings, payload) {
    if (!backupSettings.gistId) throw new Error('Informe o Gist ID.');
    if (!backupSettings.token) throw new Error('Informe o token do GitHub.');
    const nextSignature = getPayloadBackupSignature(payload);
    const remotePayload = await readBackupFromGist(backupSettings, { missingOk: true });
    if (remotePayload && getPayloadBackupSignature(remotePayload) === nextSignature) {
      return { skipped: true };
    }
    const response = await githubRequest({
      method: 'PATCH',
      url: `https://api.github.com/gists/${encodeURIComponent(backupSettings.gistId)}`,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${backupSettings.token}`,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        files: {
          [backupSettings.fileName]: {
            content: JSON.stringify(payload, null, 2)
          }
        }
      })
    });
    if (response.status < 200 || response.status >= 300) throw new Error(parseGithubError(response));
    return { skipped: false, gist: JSON.parse(response.responseText || '{}') };
  }

  function getPayloadBackupSignature(payload) {
    if (!payload) return '';
    if (payload.backupSignature) return String(payload.backupSignature);
    const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
      ? payload.data
      : {};
    const ordered = {};
    Object.keys(data).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(key => {
      ordered[key] = data[key];
    });
    return JSON.stringify({ schema: EXPORT_SCHEMA, data: ordered });
  }

  async function readBackupFromGist(backupSettings, options = {}) {
    if (!backupSettings.gistId) throw new Error('Informe o Gist ID.');
    if (!backupSettings.token) throw new Error('Informe o token do GitHub.');
    const response = await githubRequest({
      method: 'GET',
      url: `https://api.github.com/gists/${encodeURIComponent(backupSettings.gistId)}`,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${backupSettings.token}`
      }
    });
    if (response.status < 200 || response.status >= 300) throw new Error(parseGithubError(response));
    const gist = JSON.parse(response.responseText || '{}');
    const file = gist && gist.files ? gist.files[backupSettings.fileName] : null;
    if (!file) {
      if (options.missingOk) return null;
      throw new Error('Arquivo de backup não encontrado no Gist.');
    }

    let content = typeof file.content === 'string' ? file.content : '';
    if ((file.truncated || !content) && file.raw_url) {
      const rawResponse = await githubRequest({
        method: 'GET',
        url: file.raw_url,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${backupSettings.token}`
        }
      });
      if (rawResponse.status < 200 || rawResponse.status >= 300) {
        throw new Error(`Não foi possível baixar o conteúdo do backup: ${parseGithubError(rawResponse)}`);
      }
      content = rawResponse.responseText || '';
    }

    if (!content) throw new Error('O arquivo de backup no Gist está vazio.');
    try {
      return JSON.parse(content);
    } catch (_) {
      throw new Error('O arquivo de backup no Gist não contém um JSON válido.');
    }
  }

  function getCNJFromDocument(doc) {
    if (!doc) return null;
    const direct = doc.querySelector('#span_proc_numero');
    if (direct) {
      const directText = String(direct.textContent || '');
      const directMatch = directText.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
      if (directMatch) return directMatch[0];
    }

    const hints = [
      doc.querySelector('.Titulo'),
      doc.querySelector('.titulo'),
      doc.querySelector('form[name="Formulario"]'),
      doc.body
    ].filter(Boolean);

    for (const hint of hints) {
      const text = hint && hint.textContent ? hint.textContent : '';
      const match = text.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
      if (match) return match[0];
    }

    return null;
  }

  function getCurrentProcessUrl(doc) {
    const href = String(doc?.location?.href || location.href || '');
    if (/\/BuscaProcesso\b/i.test(href) && /Id_Processo=/i.test(href)) return href;
    const link = doc?.querySelector?.('a[href*="BuscaProcesso"][href*="Id_Processo"], [onclick*="BuscaProcesso"][onclick*="Id_Processo"]');
    return extractProcessUrlFromElement(link, href);
  }

  function extractProcessUrlFromElement(element, baseUrl) {
    if (!element) return '';
    const href = element.getAttribute('href');
    const onclick = element.getAttribute('onclick');
    const raw = href ? href.replace(/&amp;/g, '&') : extractProcessHrefFromOnclick(onclick);
    return resolveAllowedUrl(raw, baseUrl || location.href);
  }

  function extractProcessHrefFromOnclick(onclickValue) {
    if (!onclickValue) return '';
    const locationMatch = onclickValue.match(/(?:window\.)?location\.href\s*=\s*['"]([^'"]+)['"]/i);
    if (locationMatch) return locationMatch[1].replace(/&amp;/g, '&');
    const processMatch = onclickValue.match(/['"]([^'"]*BuscaProcesso[^'"]*)['"]/i);
    return processMatch ? processMatch[1].replace(/&amp;/g, '&') : '';
  }

  function resolveAllowedUrl(href, baseUrl) {
    if (!href) return '';
    try {
      const cleaned = String(href).trim().replace(/^['"]|['"]$/g, '');
      const url = new URL(/^(https?:|\/)/i.test(cleaned) ? cleaned : `/${cleaned}`, baseUrl || location.href);
      if (!/^https?:$/i.test(url.protocol)) return '';
      return url.toString();
    } catch (_) {
      return '';
    }
  }

  function navigateToProcessUrl(href) {
    const resolved = resolveAllowedUrl(href, location.href);
    if (!resolved) return false;
    window.location.assign(resolved);
    return true;
  }

  function findProcessSearchInput(doc) {
    const inputs = Array.from(doc.querySelectorAll('input:not([type]), input[type="text"], input[type="search"], input[type="tel"]'))
      .filter(input => !input.closest(`#pj-todo, #${ID_MANAGER_OVERLAY}, #${ID_MIN_BTN}, #${ID_PROC_BTN}`));
    const scored = inputs
      .map(input => {
        const haystack = [
          input.id,
          input.name,
          input.placeholder,
          input.title,
          input.getAttribute('aria-label')
        ].join(' ').toLowerCase();
        let score = 0;
        if (/cnj/.test(haystack)) score += 5;
        if (/process/.test(haystack)) score += 4;
        if (/numero|n[uú]mero|num/.test(haystack)) score += 2;
        if (input.offsetParent !== null) score += 1;
        return { input, score };
      })
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored[0] ? scored[0].input : null;
  }

  function submitProcessSearch(input) {
    const form = input.closest('form');
    const root = form || document;
    const buttons = Array.from(root.querySelectorAll('button, input[type="submit"], input[type="button"], a'));
    const submitter = buttons.find(button => /buscar|pesquisar|consultar|localizar/i.test(button.textContent || button.value || button.title || ''));
    if (submitter && typeof submitter.click === 'function') {
      submitter.click();
      return true;
    }
    if (form) {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.submit();
      return true;
    }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  }

  function searchProcessByCnj(cnj) {
    const input = findProcessSearchInput(document);
    if (!input) return false;
    input.focus();
    input.value = cnj;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return submitProcessSearch(input);
  }

  function openProcessFromCnj(cnj, processUrl = '') {
    if (processUrl && navigateToProcessUrl(processUrl)) return true;
    return searchProcessByCnj(cnj);
  }

  function isProcessPage(doc) {
    return !!getCNJFromDocument(doc);
  }

  function isHomeDashboardIframe() {
    const href = String(location.href || '');
    return /\/Usuario\?(?:[^#]*&)?PaginaAtual=-?10\b/.test(href) || /\/Usuario\?PaginaAtual=-?10\b/.test(href);
  }

  function openTodoPanelForCurrentPage() {
    if (isIntimacoesPage()) return false;

    if (document.getElementById('pj-todo')) return true;

    if (isHomeDashboardIframe()) {
      if (!state.mounted || state.mode !== 'home') {
        unmount();
        mountHomeDashboard();
      }
      openHomePanel();
      return true;
    }

    const cnj = getCNJFromDocument(document);
    if (cnj) {
      const ctx = processCtxFromCnj(cnj);
      if (!ctx) return false;
      if (!state.mounted || state.mode !== 'process' || state.ctxKey !== ctx.key) {
        unmount();
        mountProcess(ctx);
      }
      openProcessPanel(ctx);
      return true;
    }

    return false;
  }

  function ensureHeaderMenuEntry() {
    if (!isTopHeaderPage()) return;
    if (document.getElementById(ID_HEADER_MENU)) return;

    const menu = document.getElementById('menuPrinciapl');
    if (!menu) return;

    const certAnchor = Array.from(menu.querySelectorAll('a')).find(a => (a.textContent || '').trim() === 'Certificados');
    const certUl = certAnchor ? certAnchor.closest('ul') : null;

    const ul = el('ul', { id: ID_HEADER_MENU });
    const li = el('li');
    const a = el('a', { href: '#', target: '_self', title: 'Abrir tarefas locais' }, ['Tarefas']);

    a.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      const iframe = document.getElementById('Principal');
      const targetWin = iframe && iframe.contentWindow ? iframe.contentWindow : window;

      try {
        if (targetWin.__pjTodoApi && typeof targetWin.__pjTodoApi.openPanel === 'function') {
          targetWin.__pjTodoApi.openPanel();
          return;
        }
      } catch (_) {}

      try {
        targetWin.postMessage({ source: 'pj-todo', type: MSG_OPEN_TODO }, '*');
        return;
      } catch (_) {}

      try {
        alert('Abra a página inicial ou um processo para usar as tarefas.');
      } catch (_) {}
    });

    li.appendChild(a);
    ul.appendChild(li);

    if (certUl && certUl.parentElement === menu) certUl.insertAdjacentElement('afterend', ul);
    else menu.appendChild(ul);
  }

  function isIntimacoesPage() {
    const titleEl = document.querySelector('h1,h2,.Titulo,.titulo');
    const titleText = String(titleEl && titleEl.textContent ? titleEl.textContent : '').trim();
    const url = String(location.href || '');
    return /intima(ç|c)(a|ã)o|intima(ç|c)ões/i.test(titleText) || /intimac/i.test(url);
  }

  function processCtxFromDoc() {
    const cnj = getCNJFromDocument(document);
    return processCtxFromCnj(cnj, getCurrentProcessUrl(document));
  }

  function processCtxFromCnj(cnj, processUrl = '') {
    if (!cnj) return null;
    const shortCnj = String(cnj).split('.')[0] || cnj;
    return { type: 'process', cnj, shortCnj, key: `cnj_${cnj}`, processUrl };
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
      idx.push({ key: ctx.key, cnj: ctx.cnj, processUrl: ctx.processUrl || '', updatedAt: Date.now() });
      saveIndex(idx);
    }
  }

  function touchIndex(ctx) {
    const idx = loadIndex();
    const i = idx.findIndex(x => x && x.key === ctx.key);
    if (i >= 0) {
      idx[i].updatedAt = Date.now();
      idx[i].cnj = ctx.cnj;
      if (ctx.processUrl) idx[i].processUrl = ctx.processUrl;
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
    return normalizeTodoItems(items);
  }

  function saveItemsByKey(ctxKey, items) {
    storage.set(todosKey(ctxKey), normalizeTodoItems(items));
    scheduleTodoAutoBackup();
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
    return normalizeTodoItems(items);
  }

  function saveGlobalItems(items) {
    storage.set(KEY_GLOBAL_ITEMS, normalizeTodoItems(items));
    scheduleTodoAutoBackup();
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

  function exportTodoPayload() {
    const data = {};
    const keys = listTodoKeys();

    for (const key of keys) {
      if (EXPORT_EXCLUDED_KEYS.has(key)) continue;
      if (key === KEY_GLOBAL_UI || /::ui$/i.test(key)) continue;
      data[key] = storage.get(key, null);
    }

    return {
      schema: EXPORT_SCHEMA,
      exportedAt: new Date().toISOString(),
      data
    };
  }

  function buildTodoBackupPayload() {
    return {
      schema: BACKUP_SCHEMA,
      scriptId: SCRIPT_META.id,
      scriptName: SCRIPT_META.name,
      version: SCRIPT_META.version,
      host: location.host,
      ...exportTodoPayload(),
      backupSignature: buildTodoBackupSignature()
    };
  }

  function buildTodoBackupSignature() {
    const payload = exportTodoPayload();
    const ordered = {};
    Object.keys(payload.data || {}).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(key => {
      ordered[key] = payload.data[key];
    });
    return JSON.stringify({ schema: payload.schema, data: ordered });
  }

  function exportTodoData() {
    const payload = exportTodoPayload();

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', {
      href: url,
      download: `projudi-tarefas-export-${Date.now()}.json`
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

      const importedKeys = Object.keys(data).filter(k => k.startsWith(KEY_PREFIX) && !EXPORT_EXCLUDED_KEYS.has(k));
      if (!importedKeys.length) {
        alert('Nenhuma chave de Tarefas encontrada no JSON.');
        return;
      }

      if (!confirm('Importar vai substituir os dados atuais de Tarefas. Deseja continuar?')) return;

      const existing = listTodoKeys();
      for (const key of existing) storage.del(key);

      for (const key of importedKeys) {
        storage.set(key, data[key]);
      }

      alert('Importação concluída.');
      unmount();
      scheduleEvaluate(50);
    } catch (_) {
      alert('Falha ao importar JSON. Verifique o arquivo.');
    }
  }

  function importTodoPayloadObject(parsed) {
    const data = parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;

    if (!data || typeof data !== 'object') {
      throw new Error('JSON inválido para importação.');
    }

    const importedKeys = Object.keys(data).filter(k => k.startsWith(KEY_PREFIX) && !EXPORT_EXCLUDED_KEYS.has(k));
    if (!importedKeys.length) {
      throw new Error('Nenhuma chave de Tarefas encontrada no JSON.');
    }

    const existing = listTodoKeys();
    for (const key of existing) storage.del(key);

    for (const key of importedKeys) {
      storage.set(key, data[key]);
    }

    unmount();
    scheduleEvaluate(50);
    return importedKeys.length;
  }

  let backupTimer = null;

  function scheduleTodoAutoBackup() {
    const backupSettings = loadBackupSettings();
    if (!backupSettings.enabled || !backupSettings.autoBackupOnSave) return;
    const backupSignature = buildTodoBackupSignature();
    if (backupSignature === backupSettings.lastBackupSignature) return;
    if (backupTimer) clearTimeout(backupTimer);
    const lastBackupTime = new Date(backupSettings.lastBackupAt || 0).getTime();
    const intervalWait = Number.isNaN(lastBackupTime)
      ? 0
      : Math.max(0, AUTO_BACKUP_MIN_INTERVAL_MS - (Date.now() - lastBackupTime));
    const delay = Math.max(AUTO_BACKUP_IDLE_DELAY_MS, intervalWait);
    backupTimer = setTimeout(() => {
      backupTimer = null;
      pushBackupToGist(backupSettings, buildTodoBackupPayload())
        .then(() => saveBackupSettings({ ...backupSettings, lastBackupAt: new Date().toISOString(), lastBackupSignature: backupSignature }))
        .catch((error) => {
          logWarn('Falha no backup automático das tarefas.', error);
        });
    }, delay);
  }

  function toggleDoneState(item, done) {
    item.done = !!done;
    if (item.done) item.completedAt = Date.now();
    else item.completedAt = null;
  }

  function updateItemText(item, text) {
    item.text = String(text || '').trim();
  }

  function updateItemTags(item, tagsRaw) {
    item.tags = parseTags(tagsRaw);
  }

  function normalizeMoveTarget(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    if (/^(global|globais)$/i.test(text)) return { type: 'global', label: 'Global' };
    const match = text.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
    if (!match) return null;
    const ctx = processCtxFromCnj(match[0]);
    return ctx ? { type: 'process', key: ctx.key, cnj: ctx.cnj, label: `Processo ${ctx.cnj}` } : null;
  }

  function promptMoveTarget(currentLabel, defaultValue) {
    const msg = [
      'Mover tarefa para:',
      '',
      '- digite global',
      '- ou informe o CNJ do processo',
      '',
      `Origem atual: ${currentLabel}`
    ].join('\n');
    const raw = prompt(msg, defaultValue || '');
    if (raw === null) return null;
    const target = normalizeMoveTarget(raw);
    if (!target) {
      alert('Destino inválido. Informe "global" ou um CNJ no formato 0000000-00.0000.0.00.0000.');
      return null;
    }
    return target;
  }

  function moveTodoItem(source, target) {
    if (!source || !source.id || !target) return false;
    const sameGlobal = source.scopeType === 'global' && target.type === 'global';
    const sameProcess = source.scopeType === 'process' && target.type === 'process' && source.key === target.key;
    if (sameGlobal || sameProcess) {
      alert('A tarefa já está nesse destino.');
      return false;
    }

    let item = null;
    if (source.scopeType === 'global') {
      const items = loadGlobalItems();
      const idx = items.findIndex(x => x.id === source.id);
      if (idx < 0) return false;
      item = items.splice(idx, 1)[0];
      saveGlobalItems(items);
    } else {
      const items = loadItemsByKey(source.key);
      const idx = items.findIndex(x => x.id === source.id);
      if (idx < 0) return false;
      item = items.splice(idx, 1)[0];
      saveItemsByKey(source.key, items);
      if (source.cnj) {
        touchIndex({ key: source.key, cnj: source.cnj });
        maybeRemoveFromIndexIfEmpty({ key: source.key, cnj: source.cnj });
      }
    }

    if (!item) return false;
    if (target.type === 'global') {
      const items = loadGlobalItems();
      items.unshift(item);
      saveGlobalItems(items);
      return true;
    }

    const items = loadItemsByKey(target.key);
    items.unshift(item);
    saveItemsByKey(target.key, items);
    ensureIndexHas({ key: target.key, cnj: target.cnj });
    touchIndex({ key: target.key, cnj: target.cnj });
    return true;
  }

  function buildTaskStats() {
    let active = 0;
    let completed = 0;
    const globalItems = loadGlobalItems();
    for (const item of globalItems) {
      if (item.done) completed += 1;
      else active += 1;
    }
    const idx = loadIndex();
    for (const entry of idx) {
      if (!entry || !entry.key) continue;
      const items = loadItemsByKey(entry.key);
      for (const item of items) {
        if (item.done) completed += 1;
        else active += 1;
      }
    }
    return { active, completed };
  }

  function collectTaskRows() {
    const rows = [];
    const addRow = (scopeType, scopeLabel, key, cnj, item, processUrl = '') => {
      rows.push({
        scopeType,
        scopeLabel,
        key,
        cnj,
        processUrl,
        id: item.id,
        text: item.text,
        done: !!item.done,
        createdAt: item.createdAt,
        completedAt: item.completedAt || null,
        tags: Array.isArray(item.tags) ? item.tags : []
      });
    };

    for (const item of loadGlobalItems()) addRow('global', 'Global', 'global', '', item);

    for (const entry of loadIndex()) {
      if (!entry || !entry.key || !entry.cnj) continue;
      for (const item of loadItemsByKey(entry.key)) addRow('process', `Processo ${entry.cnj}`, entry.key, entry.cnj, item, entry.processUrl || '');
    }

    rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return rows;
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

  function faIcon(className) {
    return el('i', { className, 'aria-hidden': 'true' });
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
        width: 382px;
        max-height: 84vh;
        background: #fff;
        border: 1px solid #dbe3ef;
        border-radius: 12px;
        box-shadow: 0 24px 70px rgba(2, 6, 23, .30);
        z-index: ${Z_UI};
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 13px;
        line-height: 1.3;
        overscroll-behavior: contain;
      }
      #pj-todo * { box-sizing: border-box; }

      #pj-todo-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 6px 9px;
        background: linear-gradient(135deg, #0f3e75, #1f5ca4);
        color: #fff;
        cursor: move;
        user-select: none;
      }
      #pj-todo-title {
        font-size: 12px;
        font-weight: 700;
        line-height: 1.15;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 272px;
      }
      #pj-todo-actions { display: inline-flex; gap: 4px; }
      .pj-todo-btn {
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 999px;
        background: rgba(255,255,255,.18);
        color: #fff;
        cursor: pointer;
        font-size: 17px;
        font-weight: 600;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        flex: 0 0 auto;
      }
      .pj-todo-btn:hover { background: rgba(255,255,255,.28); }
      .pj-todo-close-btn {
        width: 28px;
        height: 28px;
        min-width: 28px;
        border-radius: 999px;
        background: rgba(255,255,255,.2);
        color: #fff;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.2;
      }
      .pj-todo-close-btn:hover {
        background: rgba(255,255,255,.28);
      }

      #pj-todo-body {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        overflow: hidden;
        flex: 1;
        min-height: 0;
      }

      .pj-section {
        border: 1px solid #dbe3ef;
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .pj-sec-head {
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 700;
        background: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .pj-sec-head small {
        font-size: 10px;
        color: #64748b;
        font-weight: 500;
      }

      .pj-new {
        display: flex;
        gap: 6px;
        padding: 8px 10px;
        border-top: 1px solid #dbe3ef;
        background: #fff;
      }
      .pj-input {
        flex: 1;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 5px 8px;
        font-size: 13px;
        min-width: 0;
      }
      .pj-tag-input {
        flex: 0 0 92px;
      }
      .pj-add {
        border: 1px solid #0f3e75;
        border-radius: 8px;
        background: #0f3e75;
        color: #fff;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.2;
        padding: 6px 10px;
        min-width: 74px;
        white-space: nowrap;
      }

      .pj-list {
        overflow: auto;
        min-height: 0;
        max-height: 30vh;
        padding: 6px;
        background: #fff;
        overscroll-behavior: contain;
      }

      .pj-home-layout {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 0;
        flex: 1;
      }
      .pj-home-tabs {
        display: flex;
        gap: 6px;
        padding: 6px;
        border: 1px solid #dbe3ef;
        border-radius: 12px;
        background: #f8fafc;
        width: 100%;
        max-width: 100%;
        margin: 0 auto;
        overflow: visible;
        align-items: stretch;
        min-height: 50px;
      }
      .pj-home-tab {
        flex: 1 1 0;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        background: #fff;
        color: #334155;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        line-height: 1.2;
        padding: 0 10px;
        min-width: 0;
        min-height: 36px;
        width: auto;
        text-align: center;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        appearance: none;
        -webkit-appearance: none;
        box-shadow: none;
      }
      .pj-home-tab.active {
        border-color: #0f3e75;
        background: #0f3e75;
        color: #fff;
        font-weight: 600;
      }
      .pj-home-stack {
        flex: 1;
        min-height: 0;
        display: flex;
      }
      .pj-home-panel {
        display: none;
        flex: 1;
        min-height: 0;
      }
      .pj-home-panel.active {
        display: flex;
      }
      .pj-home-panel .pj-section {
        flex: 1;
        min-height: 0;
      }
      .pj-home-panel .pj-list {
        flex: 1;
        min-height: 0;
        max-height: none;
      }
      .pj-home-panel .pj-new {
        flex-wrap: wrap;
        align-items: stretch;
      }
      .pj-home-panel .pj-new .pj-input {
        flex: 1 1 240px;
      }
      .pj-home-panel .pj-new .pj-tag-input {
        flex: 1 1 180px;
        max-width: none;
      }
      .pj-home-panel .pj-new .pj-add {
        flex: 1 1 180px;
        max-width: none;
        min-height: 36px;
      }
      @media (max-width: 720px) {
        .pj-home-panel .pj-new .pj-tag-input {
          flex: 1 1 100%;
        }
        .pj-home-panel .pj-new .pj-add {
          flex: 1 1 100%;
        }
      }

      .pj-item {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 7px;
        border-radius: 8px;
        border: 1px solid #dbe3ef;
        margin-bottom: 6px;
      }
      .pj-item:hover { background: #f8fafc; }

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
        width: 18px;
        height: 18px;
        margin: 2px 0 0;
      }

      .pj-text {
        flex: 1;
        font-size: 13px;
        line-height: 1.28;
        word-break: break-word;
        overflow-wrap: anywhere;
        text-align: justify;
        text-justify: inter-word;
        white-space: pre-wrap;
        padding-top: 0;
      }
      .pj-text.done {
        text-decoration: line-through;
        color: rgba(0,0,0,.5);
      }
      .pj-item-main {
        flex: 1;
        min-width: 0;
      }
      .pj-item-actions {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        align-self: center;
        margin-left: auto;
        padding-left: 6px;
        flex: 0 0 auto;
      }
      .pj-meta {
        margin-top: 3px;
        font-size: 10px;
        line-height: 1.25;
        color: #64748b;
      }
      .pj-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 5px;
      }
      .pj-tag {
        display: inline-flex;
        align-items: center;
        border: 1px solid #cbd5e1;
        background: #f8fafc;
        color: #334155;
        border-radius: 999px;
        padding: 1px 7px;
        font-size: 10px;
        line-height: 1.2;
      }
      .pj-move,
      .pj-edit-tags {
        width: 20px;
        height: 20px;
        border: none;
        border-radius: 5px;
        background: transparent;
        cursor: pointer;
        color: #475569;
        font-size: 12px;
        line-height: 1;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        vertical-align: middle;
      }
      .pj-move {
        color: #1f5ca4;
        font-size: 13px;
      }
      .pj-move:hover {
        background: #e8f1fb;
      }
      .pj-edit-tags:hover {
        background: #eef2f7;
      }

      .pj-del {
        width: 20px;
        height: 20px;
        border: none;
        border-radius: 5px;
        background: transparent;
        cursor: pointer;
        color: #c62828;
        font-size: 13px;
        line-height: 1;
        font-weight: 900;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        vertical-align: middle;
      }
      .pj-del:hover {
        color: #8e0000;
        background: rgba(198,40,40,.12);
      }

      .pj-empty {
        padding: 5px 4px;
        font-size: 10px;
        color: rgba(0,0,0,.58);
      }

      .pj-cnj {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        max-width: 100%;
        border: 0;
        padding: 0;
        background: transparent;
        color: #0f3e75;
        font-weight: 800;
        cursor: pointer;
        font-size: 12px;
        line-height: 1.1;
        font-family: inherit;
        text-align: left;
      }
      .pj-cnj span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .pj-cnj i {
        flex: 0 0 auto;
        font-size: 10px;
        opacity: .78;
      }
      .pj-cnj:hover span { text-decoration: underline; }

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

      #${ID_PROC_BTN} {
        position: relative !important;
        inset: auto !important;
        margin: 0 10px 0 14px !important;
        padding: 0 !important;
        border: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        color: #2b69aa !important;
        z-index: ${Z_UI} !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        vertical-align: middle !important;
        cursor: pointer !important;
        line-height: 1 !important;
        height: auto !important;
        min-width: 0 !important;
        top: auto !important;
        left: auto !important;
        right: auto !important;
        bottom: auto !important;
        appearance: none !important;
        -webkit-appearance: none !important;
      }
      #${ID_PROC_BTN} i {
        color: #2b69aa !important;
        display: inline-block !important;
        line-height: 1 !important;
        vertical-align: middle !important;
        transform: scale(0.92) !important;
        transform-origin: center center !important;
        margin: 0 !important;
      }
      #${ID_PROC_BTN}:hover {
        filter: brightness(1.06);
      }

      #${ID_MIN_BTN} {
        position: fixed;
        right: ${FAB_UI.right}px;
        bottom: ${FAB_UI.bottom}px;
        z-index: ${Z_UI};
        width: ${FAB_UI.size}px;
        height: ${FAB_UI.size}px;
        border-radius: 50%;
        border: 1px solid ${FAB_UI.brand};
        background: ${FAB_UI.brand};
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,.2);
        transition: transform .12s ease, background .12s ease;
      }
      #${ID_MIN_BTN}:hover {
        background: ${FAB_UI.brandHover};
        transform: translateY(-1px);
      }
      #${ID_MIN_BTN} i {
        pointer-events: none;
        font-size: 16px;
      }

      #${ID_MANAGER_OVERLAY} {
        position: fixed;
        inset: 0;
        z-index: ${Z_UI + 20};
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(11, 18, 32, .50);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }
      #${ID_MANAGER_OVERLAY}, #${ID_MANAGER_OVERLAY} * { box-sizing: border-box; }
      #${ID_MANAGER_OVERLAY} .pjm-panel {
        position: relative;
        width: min(1180px, calc(100vw - 28px));
        height: min(88vh, 900px);
        background: #fff;
        color: #0f172a;
        border-radius: 14px;
        border: 1px solid #dbe3ef;
        box-shadow: 0 24px 70px rgba(2, 6, 23, .30);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.35;
      }
      #${ID_MANAGER_OVERLAY} .pjm-head {
        padding: 14px 16px;
        background: linear-gradient(135deg, #0f3e75, #1f5ca4);
        color: #fff;
      }
      #${ID_MANAGER_OVERLAY} .pjm-head-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-title { font-size: 16px; font-weight: 700; line-height: 1.2; }
      #${ID_MANAGER_OVERLAY} .pjm-sub { margin-top: 2px; font-size: 12px; opacity: .9; }
      #${ID_MANAGER_OVERLAY} .pjm-close {
        border: 0;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        background: rgba(255, 255, 255, .2);
        color: #fff;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.2;
        min-width: 0;
        padding: 0;
      }
      #${ID_MANAGER_OVERLAY} .pjm-body {
        flex: 1 1 auto;
        min-height: 0;
        display: grid;
        grid-template-columns: 300px minmax(0, 1fr);
        grid-template-areas: "rail main";
        align-items: start;
        gap: 12px;
        overflow: auto;
        padding: 12px;
        background: #f4f7fb;
      }
      #${ID_MANAGER_OVERLAY} .pjm-card {
        display: grid;
        gap: 10px;
        border: 1px solid #dbe3ef;
        border-radius: 8px;
        background: #fff;
        padding: 12px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
      }
      #${ID_MANAGER_OVERLAY} .pjm-rail {
        grid-area: rail;
        display: grid;
        align-content: start;
        gap: 12px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-main {
        grid-area: main;
        min-width: 0;
      }
      #${ID_MANAGER_OVERLAY} .pjm-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      #${ID_MANAGER_OVERLAY} .pjm-row.pjm-filters > .pjm-select,
      #${ID_MANAGER_OVERLAY} .pjm-row.pjm-filters > .pjm-input {
        flex: 1 1 260px;
        min-width: 0;
      }
      #${ID_MANAGER_OVERLAY} .pjm-input, #${ID_MANAGER_OVERLAY} .pjm-select {
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 8px 9px;
        background: #fff;
        color: #0f172a;
        font: inherit;
        font-size: 13px;
        line-height: 1.35;
        min-height: 38px;
        width: 100%;
      }
      #${ID_MANAGER_OVERLAY} .pjm-select { min-width: 0; }
      #${ID_MANAGER_OVERLAY} .pjm-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 11px;
        min-width: 0;
        min-height: 38px;
        border-radius: 6px;
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #1e293b;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        line-height: 1.2;
      }
      #${ID_MANAGER_OVERLAY} .pjm-btn.primary {
        border-color: #0f3e75;
        background: #0f3e75;
        color: #fff;
        font-weight: 600;
      }
      #${ID_MANAGER_OVERLAY} .pjm-summary-title {
        color: #12385f;
        font-size: 22px;
        font-weight: 800;
        line-height: 1.1;
      }
      #${ID_MANAGER_OVERLAY} .pjm-summary-sub {
        color: #64748b;
        font-size: 12px;
        font-weight: 600;
      }
      #${ID_MANAGER_OVERLAY} .pjm-stat-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-stat {
        appearance: none;
        display: grid;
        gap: 3px;
        padding: 10px;
        border: 1px solid #d7e2f0;
        border-radius: 8px;
        background: #fff;
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      #${ID_MANAGER_OVERLAY} .pjm-stat[data-active="true"] {
        border-color: #1f69d5;
        box-shadow: inset 0 0 0 1px #1f69d5;
      }
      #${ID_MANAGER_OVERLAY} .pjm-stat-value {
        color: #143f70;
        font-size: 22px;
        font-weight: 800;
        line-height: 1;
      }
      #${ID_MANAGER_OVERLAY} .pjm-stat-label {
        color: #5b7089;
        font-size: 12px;
        font-weight: 700;
      }
      #${ID_MANAGER_OVERLAY} .pjm-stat--active { background: linear-gradient(180deg, #f4faff 0%, #eaf3ff 100%); }
      #${ID_MANAGER_OVERLAY} .pjm-stat--done { background: linear-gradient(180deg, #f3fbf5 0%, #e5f5e9 100%); }
      #${ID_MANAGER_OVERLAY} .pjm-stat--done .pjm-stat-value { color: #1d6f3b; }
      #${ID_MANAGER_OVERLAY} .pjm-section-title {
        color: #334155;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .04em;
        text-transform: uppercase;
      }
      #${ID_MANAGER_OVERLAY} .pjm-field {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      #${ID_MANAGER_OVERLAY} .pjm-field label {
        color: #47627f;
        font-size: 11px;
        font-weight: 700;
      }
      #${ID_MANAGER_OVERLAY} .pjm-action-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-toggle {
        justify-self: center;
        min-width: 190px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-list { display: grid; gap: 8px; }
      #${ID_MANAGER_OVERLAY} .pjm-item {
        border: 1px solid #dbe3ef;
        border-radius: 8px;
        background: #fff;
        padding: 12px 14px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-item-top {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 14px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-item-main {
        min-width: 0;
      }
      #${ID_MANAGER_OVERLAY} .pjm-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(86px, 1fr));
        gap: 8px;
        align-items: center;
        justify-items: stretch;
        width: min(220px, 100%);
      }
      #${ID_MANAGER_OVERLAY} .pjm-actions .pjm-btn {
        width: 100%;
        min-width: 0;
      }
      #${ID_MANAGER_OVERLAY} .pjm-item-title { font-size: 14px; font-weight: 700; color: #0f172a; }
      #${ID_MANAGER_OVERLAY} .pjm-item-meta { margin-top: 4px; font-size: 12px; color: #64748b; }
      #${ID_MANAGER_OVERLAY} .pjm-item--done { opacity: .76; }
      #${ID_MANAGER_OVERLAY} .pjm-badge-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        min-height: 22px;
        padding: 3px 7px;
        border: 0;
        border-radius: 999px;
        background: #eef4fb;
        color: #365879;
        font-size: 11px;
        font-weight: 700;
        font-family: inherit;
      }
      #${ID_MANAGER_OVERLAY} button.pjm-badge {
        cursor: pointer;
      }
      #${ID_MANAGER_OVERLAY} .pjm-badge--cnj:hover span {
        text-decoration: underline;
      }
      #${ID_MANAGER_OVERLAY} .pjm-badge--cnj i {
        font-size: 9px;
        opacity: .74;
      }
      #${ID_MANAGER_OVERLAY} .pjm-badge--done {
        color: #18663a;
        background: #dff3e5;
      }
      #${ID_MANAGER_OVERLAY} .pjm-badge--active {
        color: #164172;
        background: #e8eff8;
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-popover {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(15, 23, 42, .34);
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-popover[data-open="true"] {
        display: flex;
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-dialog {
        width: min(720px, calc(100vw - 36px));
        max-height: min(84vh, 760px);
        padding: 16px;
        overflow: auto;
        box-sizing: border-box;
        border: 1px solid #dbe3ef;
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 24px 70px rgba(2, 6, 23, .30);
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-dialog .pjm-close {
        width: 32px;
        height: 32px;
        min-width: 32px;
        border: 1px solid #cbd5e1;
        background: #eef4fb;
        color: #173a61;
        font-size: 17px;
        line-height: 1;
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 14px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-grid .pjm-backup-span {
        grid-column: 1 / -1;
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-toggles {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-toggles .pjm-check-row {
        justify-content: flex-start;
        border-radius: 999px;
        padding: 8px 10px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-actions {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-top: 14px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-actions .pjm-btn {
        min-height: 40px;
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-primary {
        border-color: #1d63d8;
        background: #1f6bd8;
        color: #fff;
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-success {
        border-color: #16833a;
        background: #18883f;
        color: #fff;
      }
      #${ID_MANAGER_OVERLAY} .pjm-backup-danger {
        border-color: #fecaca;
        background: #fff7f7;
        color: #b42318;
      }
      #${ID_MANAGER_OVERLAY} .pjm-check-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 9px;
        border: 1px solid #dbe3ef;
        border-radius: 6px;
        background: #f8fbff;
        color: #375272;
        font-size: 12px;
        font-weight: 700;
      }
      @media (max-width: 860px) {
        #${ID_MANAGER_OVERLAY} .pjm-panel {
          width: min(100vw - 8px, 1180px);
          height: 92vh;
        }
        #${ID_MANAGER_OVERLAY} .pjm-body {
          grid-template-columns: 1fr;
          grid-template-areas:
            "rail"
            "main";
        }
        #${ID_MANAGER_OVERLAY} .pjm-body { padding: 12px; }
        #${ID_MANAGER_OVERLAY} .pjm-action-grid,
        #${ID_MANAGER_OVERLAY} .pjm-backup-grid,
        #${ID_MANAGER_OVERLAY} .pjm-backup-actions,
        #${ID_MANAGER_OVERLAY} .pjm-stat-grid,
        #${ID_MANAGER_OVERLAY} .pjm-item-top {
          grid-template-columns: 1fr;
        }
        #${ID_MANAGER_OVERLAY} .pjm-actions {
          grid-template-columns: 1fr;
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function bindPanelScrollLock(panel) {
    const onWheel = e => {
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
    };

    panel.addEventListener('wheel', onWheel, { passive: false });
    return () => panel.removeEventListener('wheel', onWheel);
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

  function renderItemsList({ listEl, items, onToggle, onDelete, onEdit, onReorder, onMove, onEditTags }) {
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
      const metaEl = el('div', { className: 'pj-meta' }, [`Criada em: ${formatDateTime(item.createdAt)}`]);
      const tagsWrap = el('div', { className: 'pj-tags' }, []);
      for (const tag of item.tags || []) {
        tagsWrap.appendChild(el('span', { className: 'pj-tag' }, [`#${tag}`]));
      }
      const itemMain = el('div', { className: 'pj-item-main' }, [textEl, metaEl]);
      if ((item.tags || []).length) itemMain.appendChild(tagsWrap);
      const moveBtn = el('button', { className: 'pj-move', type: 'button', title: 'Mover tarefa', 'aria-label': 'Mover tarefa' }, [faIcon('fa-solid fa-right-left')]);
      const tagsBtn = el('button', { className: 'pj-edit-tags', type: 'button', title: 'Editar tags', 'aria-label': 'Editar tags' }, [faIcon('fa-solid fa-hashtag')]);
      const delBtn = el('button', { className: 'pj-del', type: 'button', title: 'Excluir', 'aria-label': 'Excluir' }, [faIcon('fa-solid fa-xmark')]);

      const actionChildren = typeof onMove === 'function' ? [moveBtn, tagsBtn, delBtn] : [tagsBtn, delBtn];
      const actions = el('div', { className: 'pj-item-actions' }, actionChildren);
      const row = el('div', { className: 'pj-item', draggable: true, 'data-id': item.id }, [
        drag,
        el('div', { className: 'pj-mini' }, [cb]),
        itemMain,
        actions
      ]);

      cb.addEventListener('change', () => onToggle(item.id, cb.checked));
      delBtn.addEventListener('click', () => onDelete(item.id));
      textEl.addEventListener('dblclick', () => {
        const next = prompt('Editar tarefa:', item.text || '');
        if (next === null) return;
        onEdit(item.id, String(next).trim());
      });
      tagsBtn.addEventListener('click', () => {
        if (typeof onEditTags !== 'function') return;
        const next = prompt('Tags (separadas por vírgula):', (item.tags || []).join(', '));
        if (next === null) return;
        onEditTags(item.id, next);
      });
      moveBtn.addEventListener('click', () => {
        if (typeof onMove !== 'function') return;
        onMove(item.id);
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
    return () => {
      dragging = false;
      handle.removeEventListener('mousedown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }

  function unmount() {
    runPanelCleanup();
    const p = document.getElementById('pj-todo');
    if (p) p.remove();
    const m = document.getElementById(ID_MIN_BTN);
    if (m) m.remove();
    const pb = document.getElementById(ID_PROC_BTN);
    if (pb) pb.remove();
    state.mounted = false;
    state.mode = null;
    state.ctxKey = null;
  }

  function mountFloatingMinButton({ onOpen }) {
    const existing = document.getElementById(ID_MIN_BTN);
    if (existing) return;
    const inlineBtn = document.getElementById(ID_PROC_BTN);
    if (inlineBtn) inlineBtn.remove();
    ensureFontAwesome();
    const icon = el('i', { className: 'fa-solid fa-list-check', 'aria-hidden': 'true' });
    const btn = el('button', { id: ID_MIN_BTN, title: 'Abrir Tarefas', 'aria-label': 'Abrir Tarefas' }, [icon]);
    btn.addEventListener('click', () => {
      openLauncherSafely({
        removeLauncher: () => btn.remove(),
        onOpen
      });
    });
    document.body.appendChild(btn);
  }

  function mountProcessInlineButton({ onOpen }) {
    const existing = document.getElementById(ID_PROC_BTN);
    if (existing) return true;

    const postitButton = document.getElementById('pj-add-btn');
    const nativeNoteButton = document.querySelector('button.notaProcesso, button[onclick*="criarNota"]');
    const anchor = postitButton || nativeNoteButton;
    if (!anchor || !anchor.parentElement) return false;

    const fab = document.getElementById(ID_MIN_BTN);
    if (fab) fab.remove();

    ensureFontAwesome();
    const btn = el('button', {
      id: ID_PROC_BTN,
      type: 'button',
      title: 'Tarefas locais deste processo',
      'aria-label': 'Tarefas locais deste processo'
    }, [el('i', { className: 'fa-solid fa-list-check fa-3x', 'aria-hidden': 'true' })]);

    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openLauncherSafely({
        removeLauncher: () => btn.remove(),
        onOpen
      });
    });

    const anchorCS = getComputedStyle(anchor);
    const parentCS = getComputedStyle(anchor.parentElement);
    const anchorFloat = String(anchorCS.float || '').toLowerCase();
    const parentDisplay = String(parentCS.display || '').toLowerCase();
    const parentFlexDir = String(parentCS.flexDirection || '').toLowerCase();
    const reverseVisualOrder = anchorFloat === 'right' || (parentDisplay.includes('flex') && parentFlexDir === 'row-reverse');

    if (anchorFloat && anchorFloat !== 'none') btn.style.setProperty('float', anchorFloat, 'important');
    const isPostitAnchor = anchor.id === 'pj-add-btn';
    const alignAsPostitSlot = isPostitAnchor || !postitButton;
    btn.style.setProperty('margin-top', anchorCS.marginTop, 'important');
    btn.style.setProperty('margin-bottom', anchorCS.marginBottom, 'important');
    btn.style.setProperty(
      'margin-right',
      `${alignAsPostitSlot ? PROC_BTN_GAP.postitRight : PROC_BTN_GAP.nativeRight}px`,
      'important'
    );
    btn.style.setProperty(
      'margin-left',
      `${alignAsPostitSlot ? PROC_BTN_GAP.postitLeft : PROC_BTN_GAP.nativeLeft}px`,
      'important'
    );

    if (reverseVisualOrder) {
      anchor.insertAdjacentElement('beforebegin', btn);
    } else {
      anchor.insertAdjacentElement('afterend', btn);
    }
    return true;
  }

  function findDirectProcessHeaderAnchor() {
    const selectors = [
      'i.fa-thumbtack',
      'i.fa-thumb-tack',
      '.fa-thumbtack',
      '.fa-thumb-tack'
    ];

    for (const sel of selectors) {
      const icon = document.querySelector(sel);
      if (!icon) continue;
      const anchor = icon.closest('a,button,span,div');
      if (anchor && anchor.parentElement) return anchor;
    }

    return null;
  }

  function mountProcessHeaderButton({ onOpen }) {
    const existing = document.getElementById(ID_PROC_BTN);
    if (existing) return true;

    const anchor = findDirectProcessHeaderAnchor();
    if (!anchor || !anchor.parentElement) return false;

    const fab = document.getElementById(ID_MIN_BTN);
    if (fab) fab.remove();

    ensureFontAwesome();
    const btn = el('button', {
      id: ID_PROC_BTN,
      type: 'button',
      title: 'Tarefas locais deste processo',
      'aria-label': 'Tarefas locais deste processo'
    }, [el('i', { className: 'fa-solid fa-list-check fa-3x', 'aria-hidden': 'true' })]);

    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openLauncherSafely({
        removeLauncher: () => btn.remove(),
        onOpen
      });
    });

    const anchorCS = getComputedStyle(anchor);
    btn.style.setProperty('float', 'none', 'important');
    btn.style.setProperty('display', 'inline-flex', 'important');
    btn.style.setProperty('vertical-align', 'middle', 'important');
    btn.style.setProperty('margin-top', anchorCS.marginTop || '0px', 'important');
    btn.style.setProperty('margin-bottom', anchorCS.marginBottom || '0px', 'important');
    btn.style.setProperty('margin-right', `${PROC_BTN_GAP.directHeaderRight}px`, 'important');
    btn.style.setProperty('margin-left', `${PROC_BTN_GAP.directHeaderLeft}px`, 'important');

    anchor.insertAdjacentElement('afterend', btn);
    return true;
  }

  function syncProcessLauncher(ctx) {
    const onOpen = () => openProcessPanel(ctx);
    if (document.getElementById('pj-todo')) return;
    if (document.getElementById(ID_PROC_BTN)) return;
    if (mountProcessInlineButton({ onOpen })) return;
    if (mountProcessHeaderButton({ onOpen })) return;
    scheduleEvaluate(350);
  }

  function createHeaderActions({ onClose }) {
    const closeBtn = el('button', { className: 'pj-todo-btn pj-todo-close-btn', title: 'Fechar' }, ['×']);

    closeBtn.addEventListener('click', onClose);

    return el('div', { id: 'pj-todo-actions' }, [closeBtn]);
  }

  function openManagerPanel() {
    const existing = document.getElementById(ID_MANAGER_OVERLAY);
    if (existing) return;

    let backupSettings = loadBackupSettings();
    const overlay = el('div', { id: ID_MANAGER_OVERLAY });
    const panel = el('div', { className: 'pjm-panel', role: 'dialog', 'aria-modal': 'true' });
    panel.innerHTML = `
      <div class="pjm-head">
        <div class="pjm-head-row">
          <div>
            <div class="pjm-title">Gestão de Tarefas</div>
            <div class="pjm-sub">Ativas, concluídas e backup JSON</div>
          </div>
          <button type="button" class="pjm-close" data-pjm-action="close" title="Fechar">×</button>
        </div>
      </div>
      <div class="pjm-body">
        <aside class="pjm-rail">
          <section class="pjm-card">
            <div class="pjm-section-title">Painel principal</div>
            <div class="pjm-summary-title" id="pjm-summary-title">0 tarefas em foco</div>
            <div class="pjm-summary-sub" id="pjm-summary-sub">Nenhuma tarefa carregada.</div>
            <div class="pjm-stat-grid">
              <button type="button" class="pjm-stat pjm-stat--active" data-pjm-filter="active">
                <span class="pjm-stat-value" id="pjm-stat-active">0</span>
                <span class="pjm-stat-label">Ativas</span>
              </button>
              <button type="button" class="pjm-stat pjm-stat--done" data-pjm-filter="done">
                <span class="pjm-stat-value" id="pjm-stat-done">0</span>
                <span class="pjm-stat-label">Concluídas</span>
              </button>
            </div>
            <button class="pjm-btn pjm-backup-toggle" id="pjm-backup-open" type="button"><i class="fa-solid fa-cloud" aria-hidden="true"></i><span>Backup remoto</span></button>
          </section>
          <section class="pjm-card">
            <div class="pjm-section-title">Filtros</div>
            <div class="pjm-field">
              <label for="pjm-search">Busca</label>
              <input class="pjm-input" id="pjm-search" placeholder="Texto, tag ou CNJ" />
            </div>
            <div class="pjm-field">
              <label for="pjm-filter-state">Status</label>
              <select class="pjm-select" id="pjm-filter-state">
                <option value="active">Ativas</option>
                <option value="done">Concluídas</option>
                <option value="all">Todas</option>
              </select>
            </div>
            <div class="pjm-action-grid">
              <button class="pjm-btn" id="pjm-export"><i class="fa-solid fa-download" aria-hidden="true"></i><span>Baixar JSON</span></button>
              <button class="pjm-btn" id="pjm-import"><i class="fa-solid fa-upload" aria-hidden="true"></i><span>Enviar JSON</span></button>
            </div>
          </section>
        </aside>
        <main class="pjm-main">
          <section class="pjm-card">
            <div class="pjm-list-head">
              <div>
                <div class="pjm-section-title">Tarefas monitoradas</div>
                <div id="pjm-stats" class="pjm-item-meta"></div>
              </div>
            </div>
            <div id="pjm-list" class="pjm-list"></div>
          </section>
        </main>
        <div class="pjm-backup-popover" id="pjm-backup-popover">
          <section class="pjm-card pjm-backup-dialog">
            <div class="pjm-list-head">
              <div>
                <div class="pjm-section-title">BACKUP REMOTO</div>
                <div class="pjm-item-meta">Use um único Gist no GitHub e um arquivo separado para este script.</div>
              </div>
              <button type="button" class="pjm-close" data-pjm-backup-close title="Fechar">×</button>
            </div>
            <div class="pjm-backup-grid">
              <div class="pjm-field">
                <label for="pjm-backup-gist-id">Gist ID</label>
                <input class="pjm-input" id="pjm-backup-gist-id" placeholder="Cole o Gist ID">
              </div>
              <div class="pjm-field">
                <label for="pjm-backup-file-name">Arquivo</label>
                <input class="pjm-input" id="pjm-backup-file-name" placeholder="projudi-tarefas-locais.json">
              </div>
              <div class="pjm-field pjm-backup-span">
                <label for="pjm-backup-token">Token do GitHub</label>
                <input class="pjm-input" id="pjm-backup-token" type="password" placeholder="ghp_...">
              </div>
            </div>
            <div class="pjm-backup-toggles">
              <label class="pjm-check-row"><input type="checkbox" id="pjm-backup-enabled"><span>Ativar backup por Gist no GitHub</span></label>
              <label class="pjm-check-row"><input type="checkbox" id="pjm-backup-auto"><span>Backup automático</span></label>
            </div>
            <div class="pjm-backup-actions">
              <button class="pjm-btn pjm-backup-primary" id="pjm-backup-send"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i><span>Enviar backup</span></button>
              <button class="pjm-btn pjm-backup-success" id="pjm-backup-restore"><i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i><span>Restaurar backup</span></button>
              <button class="pjm-btn pjm-backup-danger" id="pjm-backup-clear"><i class="fa-solid fa-eraser" aria-hidden="true"></i><span>Limpar backup</span></button>
              <button class="pjm-btn" type="button" data-pjm-backup-close>Fechar</button>
            </div>
            <div class="pjm-item-meta" id="pjm-backup-status"></div>
            <div class="pjm-item-meta" id="pjm-backup-last">${formatLastBackupLabel(backupSettings.lastBackupAt)}</div>
          </section>
        </div>
      </div>
    `;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const listEl = panel.querySelector('#pjm-list');
    const statsEl = panel.querySelector('#pjm-stats');
    const summaryTitleEl = panel.querySelector('#pjm-summary-title');
    const summarySubEl = panel.querySelector('#pjm-summary-sub');
    const statActiveEl = panel.querySelector('#pjm-stat-active');
    const statDoneEl = panel.querySelector('#pjm-stat-done');
    const stateFilterEl = panel.querySelector('#pjm-filter-state');
    const searchEl = panel.querySelector('#pjm-search');
    const backupOpen = panel.querySelector('#pjm-backup-open');
    const backupPopover = panel.querySelector('#pjm-backup-popover');
    const backupEnabled = panel.querySelector('#pjm-backup-enabled');
    const backupGistId = panel.querySelector('#pjm-backup-gist-id');
    const backupToken = panel.querySelector('#pjm-backup-token');
    const backupFileName = panel.querySelector('#pjm-backup-file-name');
    const backupAuto = panel.querySelector('#pjm-backup-auto');
    const backupSend = panel.querySelector('#pjm-backup-send');
    const backupRestore = panel.querySelector('#pjm-backup-restore');
    const backupClear = panel.querySelector('#pjm-backup-clear');
    const backupStatus = panel.querySelector('#pjm-backup-status');
    const backupLast = panel.querySelector('#pjm-backup-last');
    const hasBackupUi = [
      backupEnabled,
      backupGistId,
      backupToken,
      backupFileName,
      backupAuto,
      backupSend,
      backupRestore,
      backupClear,
      backupStatus,
      backupLast
    ].every(Boolean);
    if (hasBackupUi) {
      backupEnabled.checked = backupSettings.enabled;
      backupGistId.value = backupSettings.gistId;
      backupToken.value = backupSettings.token;
      backupFileName.value = backupSettings.fileName;
      backupAuto.checked = backupSettings.autoBackupOnSave;
    }

    function showBackupStatus(message, tone) {
      if (!hasBackupUi) return;
      backupStatus.textContent = message || '';
      backupStatus.style.color = tone === 'err' ? '#b42318' : tone === 'ok' ? '#067647' : '';
    }
    function updateBackupLast() {
      if (!hasBackupUi) return;
      backupLast.textContent = formatLastBackupLabel(backupSettings.lastBackupAt);
    }

    function readBackupSettingsFromPanel() {
      if (!hasBackupUi) return backupSettings;
      return normalizeBackupSettings({
        enabled: backupEnabled.checked,
        gistId: backupGistId.value,
        token: backupToken.value,
        fileName: backupFileName.value,
        autoBackupOnSave: backupAuto.checked
      });
    }

    async function runBackupNow() {
      backupSettings = saveBackupSettings(readBackupSettingsFromPanel());
      showBackupStatus('Enviando backup...', 'muted');
      const backupSignature = buildTodoBackupSignature();
      const result = await pushBackupToGist(backupSettings, buildTodoBackupPayload());
      backupSettings = saveBackupSettings({ ...backupSettings, lastBackupAt: new Date().toISOString(), lastBackupSignature: backupSignature });
      updateBackupLast();
      showBackupStatus(result && result.skipped
        ? 'Backup remoto já estava atualizado; nenhum commit novo foi criado.'
        : 'Backup enviado com sucesso.', 'ok');
    }
    updateBackupLast();

    function clearBackupSettingsFromPanel() {
      backupSettings = saveBackupSettings(DEFAULT_BACKUP_SETTINGS);
      backupEnabled.checked = backupSettings.enabled;
      backupGistId.value = backupSettings.gistId;
      backupToken.value = backupSettings.token;
      backupFileName.value = backupSettings.fileName;
      backupAuto.checked = backupSettings.autoBackupOnSave;
      updateBackupLast();
      showBackupStatus('Configuração de backup removida.', 'ok');
    }

    function persistRow(row) {
      if (row.scopeType === 'global') {
        const items = loadGlobalItems();
        const idx = items.findIndex(x => x.id === row.id);
        if (idx < 0) return;
        items[idx] = normalizeTodoItem(row);
        saveGlobalItems(items);
        return;
      }
      const items = loadItemsByKey(row.key);
      const idx = items.findIndex(x => x.id === row.id);
      if (idx < 0) return;
      items[idx] = normalizeTodoItem(row);
      saveItemsByKey(row.key, items);
      if (row.cnj) touchIndex({ key: row.key, cnj: row.cnj });
    }

    function removeRow(row) {
      if (row.scopeType === 'global') {
        saveGlobalItems(loadGlobalItems().filter(x => x.id !== row.id));
        return;
      }
      saveItemsByKey(row.key, loadItemsByKey(row.key).filter(x => x.id !== row.id));
      if (row.cnj) {
        touchIndex({ key: row.key, cnj: row.cnj });
        maybeRemoveFromIndexIfEmpty({ key: row.key, cnj: row.cnj });
      }
    }

    if (hasBackupUi) {
      backupClear.addEventListener('click', clearBackupSettingsFromPanel);
    }

    function setBackupOpen(open) {
      if (backupPopover instanceof HTMLElement) backupPopover.dataset.open = open ? 'true' : 'false';
    }

    if (backupOpen) backupOpen.addEventListener('click', () => setBackupOpen(true));
    if (backupPopover) {
      backupPopover.addEventListener('click', event => {
        if (event.target === backupPopover) setBackupOpen(false);
      });
    }
    panel.querySelectorAll('[data-pjm-backup-close]').forEach(btn => {
      btn.addEventListener('click', () => setBackupOpen(false));
    });

    function renderManagerRows() {
      const allRows = collectTaskRows();
      const filterState = stateFilterEl.value;
      const q = String(searchEl.value || '').trim().toLowerCase();
      const stats = buildTaskStats();
      const total = stats.active + stats.completed;
      if (statActiveEl) statActiveEl.textContent = String(stats.active);
      if (statDoneEl) statDoneEl.textContent = String(stats.completed);
      if (summaryTitleEl) summaryTitleEl.textContent = `${formatCount(total, 'tarefa', 'tarefas')} no painel`;
      if (summarySubEl) {
        summarySubEl.textContent = stats.active
          ? `${formatCount(stats.active, 'ativa', 'ativas')} aguardando providência.`
          : 'Tudo concluído no momento.';
      }
      panel.querySelectorAll('[data-pjm-filter]').forEach(btn => {
        if (btn instanceof HTMLElement) btn.dataset.active = btn.dataset.pjmFilter === filterState ? 'true' : 'false';
      });
      let rows = allRows;
      if (filterState === 'active') rows = rows.filter(r => !r.done);
      if (filterState === 'done') rows = rows.filter(r => r.done);
      if (q) {
        rows = rows.filter(r =>
          r.text.toLowerCase().includes(q) ||
          (r.cnj || '').toLowerCase().includes(q) ||
          (r.tags || []).some(tag => tag.toLowerCase().includes(q))
        );
      }
      statsEl.textContent = `${formatCount(rows.length, 'tarefa exibida', 'tarefas exibidas')} de ${formatCount(total, 'cadastrada', 'cadastradas')}`;

      listEl.innerHTML = '';
      if (!rows.length) {
        listEl.appendChild(el('div', { className: 'pj-empty' }, ['Sem tarefas para este filtro.']));
        return;
      }

      for (const row of rows) {
        const item = el('div', { className: `pjm-item${row.done ? ' pjm-item--done' : ''}` });
        const title = el('div', { className: 'pjm-item-title' }, [row.text]);
        const meta = el('div', { className: 'pjm-item-meta' }, [
          `${row.scopeLabel} • Criada: ${formatDateTime(row.createdAt)}${row.done ? ` • Concluída: ${formatDateTime(row.completedAt)}` : ''}`
        ]);
        const badges = el('div', { className: 'pjm-badge-row' }, [
          el('span', { className: `pjm-badge ${row.done ? 'pjm-badge--done' : 'pjm-badge--active'}` }, [row.done ? 'Concluída' : 'Ativa'])
        ]);
        if (row.cnj) {
          const cnjBadge = el('button', { className: 'pjm-badge pjm-badge--cnj', type: 'button', title: 'Copiar CNJ e abrir processo' }, [
            el('span', {}, [row.cnj]),
            faIcon('fa-solid fa-arrow-up-right-from-square')
          ]);
          cnjBadge.addEventListener('click', async () => {
            await copyToClipboard(row.cnj);
            if (!openProcessFromCnj(row.cnj, row.processUrl)) {
              alert('CNJ copiado. Não encontrei um link salvo nem o campo de busca de processo nesta tela.');
            }
          });
          badges.appendChild(cnjBadge);
        }
        for (const tag of row.tags || []) badges.appendChild(el('span', { className: 'pjm-badge' }, [`#${tag}`]));

        const left = el('div', { className: 'pjm-item-main' }, [title, meta, badges]);

        const btnToggle = el('button', { className: 'pjm-btn' }, [row.done ? 'Reabrir' : 'Concluir']);
        const btnEdit = el('button', { className: 'pjm-btn' }, ['Editar']);
        const btnTags = el('button', { className: 'pjm-btn' }, ['Tags']);
        const btnDelete = el('button', { className: 'pjm-btn' }, ['Excluir']);
        const actions = el('div', { className: 'pjm-actions' }, [btnToggle, btnEdit, btnTags, btnDelete]);

        btnToggle.addEventListener('click', () => {
          row.done = !row.done;
          toggleDoneState(row, row.done);
          persistRow(row);
          renderManagerRows();
          scheduleEvaluate(50);
        });
        btnTags.addEventListener('click', () => {
          const next = prompt('Tags (separadas por vírgula):', (row.tags || []).join(', '));
          if (next === null) return;
          updateItemTags(row, next);
          persistRow(row);
          renderManagerRows();
          scheduleEvaluate(50);
        });
        btnEdit.addEventListener('click', () => {
          const next = prompt('Editar tarefa:', row.text || '');
          if (next === null) return;
          updateItemText(row, next);
          if (!row.text) return;
          persistRow(row);
          renderManagerRows();
          scheduleEvaluate(50);
        });
        btnDelete.addEventListener('click', () => {
          removeRow(row);
          renderManagerRows();
          scheduleEvaluate(50);
        });

        item.appendChild(el('div', { className: 'pjm-item-top' }, [left, actions]));
        listEl.appendChild(item);
      }
    }

    panel.querySelector('#pjm-export').addEventListener('click', exportTodoData);
    panel.querySelector('#pjm-import').addEventListener('click', async () => {
      await importTodoData();
      renderManagerRows();
    });
    if (hasBackupUi) {
      backupSend.addEventListener('click', async () => {
        try {
          await runBackupNow();
        } catch (error) {
          showBackupStatus(error && error.message ? error.message : 'Falha ao enviar backup.', 'err');
        }
      });
      backupRestore.addEventListener('click', async () => {
        try {
          backupSettings = saveBackupSettings(readBackupSettingsFromPanel());
          showBackupStatus('Lendo backup...', 'muted');
          const payload = await readBackupFromGist(backupSettings);
          const total = importTodoPayloadObject(payload);
          backupSettings = saveBackupSettings({ ...backupSettings, lastBackupSignature: buildTodoBackupSignature() });
          renderManagerRows();
          showBackupStatus(`Backup restaurado: ${total} chave(s).`, 'ok');
        } catch (error) {
          showBackupStatus(error && error.message ? error.message : 'Falha ao restaurar backup.', 'err');
        }
      });
    }
    stateFilterEl.addEventListener('change', renderManagerRows);
    searchEl.addEventListener('input', renderManagerRows);
    panel.querySelectorAll('[data-pjm-filter]').forEach(btn => {
      btn.addEventListener('click', event => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLElement)) return;
        stateFilterEl.value = target.dataset.pjmFilter || 'active';
        renderManagerRows();
      });
    });
    panel.querySelectorAll('[data-pjm-action="close"]').forEach(btn => {
      btn.addEventListener('click', () => overlay.remove());
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });

    renderManagerRows();
  }

  function registerMenuCommand() {
    if (state.menuRegistered) return;
    if (typeof GM_registerMenuCommand !== 'function') return;
    // Projudi serve o iframe interno na mesma origem do top, fazendo o
    // userscript rodar duas vezes. Registramos o menu apenas no top para
    // evitar duplicacao (alguns gestores mostram um item por frame).
    if (window.top !== window.self) return;
    try {
      GM_registerMenuCommand('Gerenciar Tarefas', openManagerPanel);
      state.menuRegistered = true;
    } catch (_) {}
  }

  function mountProcess(ctx) {
    injectStyles();
    state.mounted = true;
    state.mode = 'process';
    state.ctxKey = ctx.key;
    syncProcessLauncher(ctx);
  }

  function openProcessPanel(ctx) {
    const cnjLabel = ctx.shortCnj || ctx.cnj;
    const getUI = () => loadUIByKey(ctx.key);
    const setUI = u => saveUIByKey(ctx.key, u);

    const chip = document.getElementById(ID_MIN_BTN);
    if (chip) chip.remove();
    const inlineBtn = document.getElementById(ID_PROC_BTN);
    if (inlineBtn) inlineBtn.remove();

    const onClose = () => {
      panel.remove();
      syncProcessLauncher(ctx);
    };

    const header = el('div', { id: 'pj-todo-header' }, [
      el('div', { id: 'pj-todo-title', title: `Tarefas do processo ${ctx.cnj}` }, [`Tarefas • ${cnjLabel}`]),
      createHeaderActions({ onClose })
    ]);

    const section = el('div', { className: 'pj-section' }, []);
    const secHead = el('div', { className: 'pj-sec-head' }, [
      el('div', {}, ['Tarefas do processo']),
      el('small', {}, ['Duplo clique edita'])
    ]);
    const input = el('input', { className: 'pj-input', type: 'text', placeholder: 'Nova tarefa...' });
    const tagsInput = el('input', { className: 'pj-input pj-tag-input', type: 'text', placeholder: 'tags' });
    const addBtn = el('button', { className: 'pj-add', type: 'button' }, ['Adicionar']);
    const newRow = el('div', { className: 'pj-new' }, [input, tagsInput, addBtn]);
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
      const items = loadItemsByKey(ctx.key).filter(x => !x.done);
      renderItemsList({
        listEl: list,
        items,
        onToggle: (id, done) => {
          const it = loadItemsByKey(ctx.key);
          const x = it.find(a => a.id === id);
          if (!x) return;
          toggleDoneState(x, done);
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
          updateItemText(x, text);
          saveItemsByKey(ctx.key, it);
          touchIndex(ctx);
          rerender();
        },
        onEditTags: (id, tagsRaw) => {
          const it = loadItemsByKey(ctx.key);
          const x = it.find(a => a.id === id);
          if (!x) return;
          updateItemTags(x, tagsRaw);
          saveItemsByKey(ctx.key, it);
          touchIndex(ctx);
          rerender();
        },
        onMove: id => {
          const target = promptMoveTarget(`Processo ${ctx.cnj}`, 'global');
          if (!target) return;
          if (!moveTodoItem({ scopeType: 'process', key: ctx.key, cnj: ctx.cnj, id }, target)) return;
          rerender();
          scheduleEvaluate(50);
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
      it.unshift(normalizeTodoItem({
        id: uid(),
        text,
        done: false,
        createdAt: Date.now(),
        tags: parseTags(tagsInput.value)
      }));
      saveItemsByKey(ctx.key, it);
      ensureIndexHas(ctx);
      touchIndex(ctx);
      input.value = '';
      tagsInput.value = '';
      rerender();
    }

    addBtn.addEventListener('click', addItem);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') addItem();
    });
    tagsInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') addItem();
    });

    const cleanupDrag = enableDragWindow({ loadUI: getUI, saveUI: setUI, panel, handle: header });
    const cleanupScroll = bindPanelScrollLock(panel);
    setPanelCleanup(composeCleanups(cleanupDrag, cleanupScroll));

    document.body.appendChild(panel);
    ensureIndexHas(ctx);
    rerender();
  }

  function mountHomeDashboard() {
    injectStyles();
    state.mounted = true;
    state.mode = 'home';
    state.ctxKey = 'global';
  }

  function openHomePanel() {
    const getUI = () => loadGlobalUI();
    const setUI = u => saveGlobalUI(u);

    const chip = document.getElementById(ID_MIN_BTN);
    if (chip) chip.remove();

    const onClose = () => {
      panel.remove();
    };

    const header = el('div', { id: 'pj-todo-header' }, [
      el('div', { id: 'pj-todo-title', title: 'Visão geral de tarefas' }, ['Tarefas • Visão geral']),
      createHeaderActions({ onClose })
    ]);

    const globalSection = el('div', { className: 'pj-section' }, []);
    const globalHead = el('div', { className: 'pj-sec-head' }, [
      el('div', {}, ['Tarefas globais']),
      el('small', {}, ['Ex.: protocolar'])
    ]);
    const globalInput = el('input', { className: 'pj-input', type: 'text', placeholder: 'Nova tarefa global...' });
    const globalTagsInput = el('input', { className: 'pj-input pj-tag-input', type: 'text', placeholder: 'tags' });
    const globalAdd = el('button', { className: 'pj-add', type: 'button' }, ['Adicionar']);
    const globalNew = el('div', { className: 'pj-new' }, [globalInput, globalTagsInput, globalAdd]);
    const globalList = el('div', { className: 'pj-list' }, []);

    globalSection.appendChild(globalHead);
    globalSection.appendChild(globalNew);
    globalSection.appendChild(globalList);

    const procSection = el('div', { className: 'pj-section' }, []);
    const procHead = el('div', { className: 'pj-sec-head' }, [
      el('div', {}, ['Pendências por processo']),
      el('small', {}, ['Clique no CNJ para copiar'])
    ]);
    const procList = el('div', { className: 'pj-list' }, []);
    procSection.appendChild(procHead);
    procSection.appendChild(procList);

    const tabGlobal = el('button', { className: 'pj-home-tab active', type: 'button' }, ['Globais']);
    const tabProcess = el('button', { className: 'pj-home-tab', type: 'button' }, ['Processos']);
    const tabs = el('div', { className: 'pj-home-tabs' }, [tabGlobal, tabProcess]);
    const globalPanel = el('div', { className: 'pj-home-panel active' }, [globalSection]);
    const processPanel = el('div', { className: 'pj-home-panel' }, [procSection]);
    const stack = el('div', { className: 'pj-home-stack' }, [globalPanel, processPanel]);
    const homeLayout = el('div', { className: 'pj-home-layout' }, [tabs, stack]);

    const body = el('div', { id: 'pj-todo-body' }, [homeLayout]);
    const panel = el('div', { id: 'pj-todo' }, [header, body]);

    const ui = getUI();
    panel.style.right = `${ui.right}px`;
    panel.style.top = `${ui.top}px`;

    function renderGlobal() {
      const items = loadGlobalItems().filter(x => !x.done);
      renderItemsList({
        listEl: globalList,
        items,
        onToggle: (id, done) => {
          const it = loadGlobalItems();
          const x = it.find(a => a.id === id);
          if (!x) return;
          toggleDoneState(x, done);
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
          updateItemText(x, text);
          saveGlobalItems(it);
          renderGlobal();
        },
        onEditTags: (id, tagsRaw) => {
          const it = loadGlobalItems();
          const x = it.find(a => a.id === id);
          if (!x) return;
          updateItemTags(x, tagsRaw);
          saveGlobalItems(it);
          renderGlobal();
        },
        onMove: id => {
          const target = promptMoveTarget('Global', '');
          if (!target) return;
          if (!moveTodoItem({ scopeType: 'global', key: 'global', cnj: '', id }, target)) return;
          renderGlobal();
          renderProcessesPending();
          scheduleEvaluate(50);
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
        rows.push({ cnj: entry.cnj, key: entry.key, processUrl: entry.processUrl || '', pending });
      }

      if (!rows.length) {
        procList.appendChild(el('div', { className: 'pj-empty' }, ['Sem pendências por processo.']));
        return;
      }

      rows.sort((a, b) => b.pending.length - a.pending.length);

      for (const r of rows) {
        const box = el('div', { className: 'pj-proc-row' }, []);
        const head = el('div', { className: 'pj-proc-head' }, [
          el('button', { className: 'pj-cnj', type: 'button', title: 'Copiar CNJ e abrir processo' }, [
            el('span', {}, [r.cnj]),
            el('i', { className: 'fa-solid fa-arrow-up-right-from-square', 'aria-hidden': 'true' })
          ]),
          el('div', { className: 'pj-proc-count' }, [`${r.pending.length} pend.`])
        ]);
        head.querySelector('.pj-cnj').addEventListener('click', async () => {
          await copyToClipboard(r.cnj);
          if (!openProcessFromCnj(r.cnj, r.processUrl)) {
            alert('CNJ copiado. Não encontrei um link salvo nem o campo de busca de processo nesta tela.');
          }
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
          onEditTags: (id, tagsRaw) => {
            const all = loadItemsByKey(r.key);
            const x = all.find(a => a.id === id);
            if (!x) return;
            updateItemTags(x, tagsRaw);
            saveItemsByKey(r.key, all);
            touchIndex({ key: r.key, cnj: r.cnj });
            renderProcessesPending();
          },
          onMove: id => {
            const target = promptMoveTarget(`Processo ${r.cnj}`, 'global');
            if (!target) return;
            if (!moveTodoItem({ scopeType: 'process', key: r.key, cnj: r.cnj, id }, target)) return;
            renderGlobal();
            renderProcessesPending();
            scheduleEvaluate(50);
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
      it.unshift(normalizeTodoItem({
        id: uid(),
        text,
        done: false,
        createdAt: Date.now(),
        tags: parseTags(globalTagsInput.value)
      }));
      saveGlobalItems(it);
      globalInput.value = '';
      globalTagsInput.value = '';
      renderGlobal();
    }

    globalAdd.addEventListener('click', addGlobal);
    globalInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') addGlobal();
    });
    globalTagsInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') addGlobal();
    });

    function setHomeTab(which) {
      const isGlobal = which === 'global';
      tabGlobal.classList.toggle('active', isGlobal);
      tabProcess.classList.toggle('active', !isGlobal);
      globalPanel.classList.toggle('active', isGlobal);
      processPanel.classList.toggle('active', !isGlobal);
    }

    tabGlobal.addEventListener('click', () => setHomeTab('global'));
    tabProcess.addEventListener('click', () => setHomeTab('process'));

    const cleanupDrag = enableDragWindow({ loadUI: getUI, saveUI: setUI, panel, handle: header });
    const cleanupScroll = bindPanelScrollLock(panel);
    setPanelCleanup(composeCleanups(cleanupDrag, cleanupScroll));

    document.body.appendChild(panel);
    renderGlobal();
    renderProcessesPending();
  }

  function evaluate() {
    registerMenuCommand();
    ensureHeaderMenuEntry();
    injectStyles();
    ensureFontAwesome();

    if (!shouldRunInThisFrame()) {
      if (state.mounted) unmount();
      return;
    }

    if (isIntimacoesPage()) {
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

    const cnj = getCNJFromDocument(document);
    state.lastCnj = cnj || null;
    if (cnj) {
      const ctx = processCtxFromCnj(cnj, getCurrentProcessUrl(document));
      if (!ctx) return;
      const changed = !state.mounted || state.mode !== 'process' || state.ctxKey !== ctx.key;
      if (changed) {
        unmount();
        mountProcess(ctx);
      } else {
        syncProcessLauncher(ctx);
      }
      return;
    }

    if (state.mounted) unmount();
  }

  function isOwnUiNode(node) {
    if (!(node instanceof Element)) return false;
    if (node.id === 'pj-todo' || node.id === ID_MIN_BTN || node.id === ID_PROC_BTN) return true;
    if (node.id === 'pj-todo-style') return true;
    if (node.matches('link[data-pj-fa="1"]')) return true;
    return !!node.closest?.(`#pj-todo, #${ID_MIN_BTN}, #${ID_PROC_BTN}`);
  }

  function shouldIgnoreMutations(mutations) {
    if (!mutations || !mutations.length) return true;
    for (const m of mutations) {
      if (!m) continue;
      if (m.target instanceof Element) {
        if (isOwnUiNode(m.target)) continue;
        if (m.target.matches(PROCESS_CONTEXT_SELECTOR) || m.target.querySelector(PROCESS_CONTEXT_SELECTOR)) return false;
      }
      for (const n of m.addedNodes || []) {
        if (!(n instanceof Element)) continue;
        if (isOwnUiNode(n)) continue;
        if (n.matches(PROCESS_CONTEXT_SELECTOR) || n.querySelector(PROCESS_CONTEXT_SELECTOR)) return false;
      }
      for (const n of m.removedNodes || []) {
        if (!(n instanceof Element)) continue;
        if (isOwnUiNode(n)) continue;
        if (n.matches(PROCESS_CONTEXT_SELECTOR) || n.querySelector(PROCESS_CONTEXT_SELECTOR)) return false;
      }
    }
    return true;
  }

  window.addEventListener('load', () => scheduleEvaluate(300));
  document.addEventListener('visibilitychange', () => scheduleEvaluate(100));
  window.addEventListener('focus', () => scheduleEvaluate(140));

  const obs = new MutationObserver(mutations => {
    if (shouldIgnoreMutations(mutations)) return;
    scheduleEvaluate(250);
  });
  obs.observe(document.body || document.documentElement, { childList: true, subtree: true });

  window.addEventListener('message', e => {
    const data = e && e.data;
    if (!data || typeof data !== 'object') return;
    if (data.source !== 'pj-todo' || data.type !== MSG_OPEN_TODO) return;
    openTodoPanelForCurrentPage();
  });

  try {
    window.__pjTodoApi = {
      openPanel: () => openTodoPanelForCurrentPage(),
      refresh: () => scheduleEvaluate(0)
    };
  } catch (error) {
    logWarn('Falha ao expor API global de tarefas.', error);
  }

  evaluate();
})();
