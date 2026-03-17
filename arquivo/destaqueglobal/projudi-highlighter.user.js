// ==UserScript==
// @name         Destaque Global
// @namespace    projudi-highlighter.user.js
// @version      5.3
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Destaque global, com painel configurável (Ctrl+Shift+H).
// @author       lourencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/a00fdc30f88d7212261dac4397bff07f/raw/projudi-highlighter.user.js
// @downloadURL  https://gist.githubusercontent.com/lourencosv/a00fdc30f88d7212261dac4397bff07f/raw/projudi-highlighter.user.js
// @match        *://projudi.tjgo.jus.br/*
// @run-at       document-end
// @inject-into  content
// @all-frames   true
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_xmlhttpRequest
// @grant        GM.registerMenuCommand
// @grant        GM.unregisterMenuCommand
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @connect      api.github.com
// ==/UserScript==

(function () {
  "use strict";


  const HIGHLIGHT_CLASS = "__vini_domain_highlight__";

  const KEY_GLOBAL = "hl:global_terms";
  const KEY_HIGHLIGHT_COLOR = "hl:highlight_color";
  const KEY_TEXT_COLOR = "hl:text_color";
  const KEY_BOLD = "hl:text_bold";
  const KEY_ITALIC = "hl:text_italic";
  const KEY_BACKUP = "hl:gist_backup";

  const MIN_LEN = 3;
  const APPLY_DEBOUNCE_MS = 180;
  const RUNTIME_KEY = "__vini_highlighter_runtime__";
  const SPA_CHANGE_EVENT = "vini-spa-change";
  const TOOLBAR_HOST_ATTR = "data-vini-toolbar-host";
  const POP_HOST_ATTR = "data-vini-pop-host";

  const DEFAULT_HIGHLIGHT_COLOR = "#C5E1A5FF";
  const DEFAULT_TEXT_COLOR = "#111111";
  const SCRIPT_META = (() => {
    const fallbackName = "Destaque Global";
    const fallbackId = "projudi-highlighter";
    try {
      const script = GM_info && GM_info.script ? GM_info.script : {};
      const name = String(script.name || fallbackName).trim() || fallbackName;
      const namespace = String(script.namespace || "").trim();
      const version = String(script.version || "unknown").trim() || "unknown";
      const base = (namespace || name || fallbackId)
        .replace(/\.user\.js$/i, "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
      const id = base || fallbackId;
      return { name, version, id, fileName: `${id}.json` };
    } catch {
      return { name: fallbackName, version: "unknown", id: fallbackId, fileName: `${fallbackId}.json` };
    }
  })();
  const BACKUP_SCHEMA = "projudi-highlighter-backup-v1";
  const DEFAULT_BACKUP_SETTINGS = {
    enabled: false,
    gistId: "",
    token: "",
    fileName: SCRIPT_META.fileName,
    autoBackupOnSave: false,
    lastBackupAt: "",
    lastBackupSignature: ""
  };

  let highlightColor = DEFAULT_HIGHLIGHT_COLOR;
  let textColor = DEFAULT_TEXT_COLOR;
  let textBold = false;
  let textItalic = false;
  let termsCache = null;
  let applyTimer = null;
  let isApplying = false;
  let rerunApply = false;
  let domObserver = null;
  let observerPaused = false;
  let historyPatched = false;
  let backupTimer = null;
  let originalPushState = null;
  let originalReplaceState = null;
  let patchedPushState = null;
  let patchedReplaceState = null;
  const cleanupTasks = [];

  function addCleanup(fn) {
    if (typeof fn !== "function") return;
    cleanupTasks.push(fn);
  }

  function runCleanup() {
    while (cleanupTasks.length) {
      const fn = cleanupTasks.pop();
      try {
        fn();
      } catch {}
    }
  }

  function on(target, type, handler, options) {
    if (!target || typeof target.addEventListener !== "function" || typeof handler !== "function") return;
    const capture = typeof options === "boolean" ? options : !!(options && options.capture);
    target.addEventListener(type, handler, options);
    addCleanup(() => {
      target.removeEventListener(type, handler, capture);
    });
  }

  if (window[RUNTIME_KEY] && typeof window[RUNTIME_KEY].cleanup === "function") {
    try {
      window[RUNTIME_KEY].cleanup();
    } catch {}
  }
  window[RUNTIME_KEY] = { cleanup: runCleanup };

  let panelOpen = false;

  const IS_TOP = (() => {
    try {
      return window.top === window;
    } catch {
      return false;
    }
  })();


  const stripPeripheralPunct = (s) =>
    s.replace(/^[\s'".,;:!?()\[\]{}-]+|[\s'".,;:!?()\[\]{}-]+$/g, "");

  const toNoDiacritics = (s) => {
    try {
      return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch {
      return s;
    }
  };

  const collapseSpaces = (s) => String(s || "").replace(/\s+/g, " ").trim();

  const norm = (s) =>
    toNoDiacritics(collapseSpaces(stripPeripheralPunct(String(s || "")))).toLowerCase();

  const charCount = (s) => collapseSpaces(String(s || "")).length;

  const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function cssColorFromHexRgba(hex) {
    const h = String(hex || "").trim();
    if (!/^#[0-9a-fA-F]{8}$/.test(h)) return h || DEFAULT_HIGHLIGHT_COLOR;
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    const a = parseInt(h.slice(7, 9), 16) / 255;
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
  }


  async function loadTerms() {
    if (Array.isArray(termsCache)) return [...termsCache];
    try {
      const raw = await GM.getValue(KEY_GLOBAL, []);
      const arr = Array.isArray(raw) ? raw : [];

      const seen = new Set();
      const out = [];

      for (const t of arr) {
        const s = collapseSpaces(String(t || ""));
        if (!s || s.length < MIN_LEN) continue;

        const k = norm(s);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(s);
        }
      }
      termsCache = out;
      return [...out];
    } catch {
      termsCache = [];
      return [];
    }
  }

  async function saveTerms(terms) {
    const normalized = Array.isArray(terms) ? [...terms] : [];
    termsCache = normalized;
    await GM.setValue(KEY_GLOBAL, normalized);
  }

  async function addTerm(term) {
    const t = collapseSpaces(String(term || ""));
    if (!t || t.length < MIN_LEN) return false;

    const terms = await loadTerms();
    const key = norm(t);

    if (!terms.some((x) => norm(x) === key)) {
      terms.push(t);
      await saveTerms(terms);
      return true;
    }
    return false;
  }

  async function removeByCanonical(canonicalTerm) {
    const terms = await loadTerms();
    const key = norm(canonicalTerm);

    const filtered = terms.filter((x) => norm(x) !== key);
    if (filtered.length !== terms.length) {
      await saveTerms(filtered);
      return true;
    }
    return false;
  }

  async function setBulkTerms(newTermsArray) {
    const seen = new Set();
    const out = [];

    for (const t of newTermsArray || []) {
      const s = collapseSpaces(String(t || ""));
      if (!s || s.length < MIN_LEN) continue;

      const k = norm(s);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(s);
      }
    }

    await saveTerms(out);
    return out;
  }


  async function loadSettings() {
    try {
      const hc = await GM.getValue(KEY_HIGHLIGHT_COLOR, DEFAULT_HIGHLIGHT_COLOR);
      highlightColor = hc && typeof hc === "string" ? hc : DEFAULT_HIGHLIGHT_COLOR;

      const tc = await GM.getValue(KEY_TEXT_COLOR, DEFAULT_TEXT_COLOR);
      textColor = tc && typeof tc === "string" ? tc : DEFAULT_TEXT_COLOR;

      const tb = await GM.getValue(KEY_BOLD, false);
      textBold = !!tb;

      const ti = await GM.getValue(KEY_ITALIC, false);
      textItalic = !!ti;
    } catch {
      highlightColor = DEFAULT_HIGHLIGHT_COLOR;
      textColor = DEFAULT_TEXT_COLOR;
      textBold = false;
      textItalic = false;
    }
  }

  function normalizeBackupSettings(value) {
    const next = { ...DEFAULT_BACKUP_SETTINGS, ...(value || {}) };
    next.enabled = !!next.enabled;
    next.gistId = String(next.gistId || "").trim();
    next.token = String(next.token || "").trim();
    next.fileName = String(next.fileName || SCRIPT_META.fileName).trim() || SCRIPT_META.fileName;
    next.autoBackupOnSave = !!next.autoBackupOnSave;
    next.lastBackupAt = String(next.lastBackupAt || "").trim();
    next.lastBackupSignature = String(next.lastBackupSignature || "").trim();
    return next;
  }

  function formatLastBackupLabel(value) {
    if (!value) return "Último backup: ainda não enviado.";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Último backup: ainda não enviado.";
    return `Último backup: ${date.toLocaleString("pt-BR")}.`;
  }

  async function loadBackupSettings() {
    try {
      return normalizeBackupSettings(await GM.getValue(KEY_BACKUP, DEFAULT_BACKUP_SETTINGS));
    } catch {
      return normalizeBackupSettings(DEFAULT_BACKUP_SETTINGS);
    }
  }

  async function saveBackupSettings(next) {
    const normalized = normalizeBackupSettings(next);
    try {
      await GM.setValue(KEY_BACKUP, normalized);
    } catch {}
    return normalized;
  }

  function buildBackupPayload() {
    return {
      schema: BACKUP_SCHEMA,
      scriptId: SCRIPT_META.id,
      scriptName: SCRIPT_META.name,
      version: SCRIPT_META.version,
      exportedAt: new Date().toISOString(),
      host: location.host,
      settings: {
        highlightColor,
        textColor,
        textBold,
        textItalic
      },
      terms: Array.isArray(termsCache) ? [...termsCache] : []
    };
  }

  function buildBackupSignature() {
    const terms = Array.isArray(termsCache) ? [...termsCache] : [];
    return JSON.stringify({
      schema: BACKUP_SCHEMA,
      settings: {
        highlightColor,
        textColor,
        textBold,
        textItalic
      },
      terms
    });
  }

  async function applyBackupPayload(payload) {
    const settings = payload && payload.settings && typeof payload.settings === "object" ? payload.settings : {};
    const terms = Array.isArray(payload && payload.terms) ? payload.terms : [];
    highlightColor = typeof settings.highlightColor === "string" ? settings.highlightColor : DEFAULT_HIGHLIGHT_COLOR;
    textColor = typeof settings.textColor === "string" ? settings.textColor : DEFAULT_TEXT_COLOR;
    textBold = !!settings.textBold;
    textItalic = !!settings.textItalic;
    await GM.setValue(KEY_HIGHLIGHT_COLOR, highlightColor);
    await GM.setValue(KEY_TEXT_COLOR, textColor);
    await GM.setValue(KEY_BOLD, textBold);
    await GM.setValue(KEY_ITALIC, textItalic);
    await setBulkTerms(terms);
    await applyHighlights();
    broadcastApply();
  }

  function githubRequest(options) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("GM_xmlhttpRequest indisponivel."));
        return;
      }
      GM_xmlhttpRequest({
        method: options.method || "GET",
        url: options.url,
        headers: options.headers || {},
        data: options.data,
        onload: resolve,
        onerror: () => reject(new Error("Falha de rede ao acessar o GitHub.")),
        ontimeout: () => reject(new Error("Tempo esgotado ao acessar o GitHub."))
      });
    });
  }

  function parseGithubError(response) {
    try {
      const parsed = JSON.parse(response.responseText || "{}");
      if (parsed && parsed.message) return parsed.message;
    } catch {}
    return `GitHub respondeu com status ${response.status}.`;
  }

  async function pushBackupToGist(backupSettings, payload) {
    if (!backupSettings.gistId) throw new Error("Informe o Gist ID.");
    if (!backupSettings.token) throw new Error("Informe o token do GitHub.");
    const response = await githubRequest({
      method: "PATCH",
      url: `https://api.github.com/gists/${encodeURIComponent(backupSettings.gistId)}`,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${backupSettings.token}`,
        "Content-Type": "application/json"
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
  }

  async function readBackupFromGist(backupSettings) {
    if (!backupSettings.gistId) throw new Error("Informe o Gist ID.");
    if (!backupSettings.token) throw new Error("Informe o token do GitHub.");
    const response = await githubRequest({
      method: "GET",
      url: `https://api.github.com/gists/${encodeURIComponent(backupSettings.gistId)}`,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${backupSettings.token}`
      }
    });
    if (response.status < 200 || response.status >= 300) throw new Error(parseGithubError(response));
    const gist = JSON.parse(response.responseText || "{}");
    const file = gist && gist.files ? gist.files[backupSettings.fileName] : null;
    if (!file || !file.content) throw new Error("Arquivo de backup não encontrado no Gist.");
    return JSON.parse(file.content);
  }

  function htmlEscapeAttr(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function scheduleAutoBackup() {
    clearTimeout(backupTimer);
    backupTimer = null;
    if (!IS_TOP) return;
    backupTimer = setTimeout(async () => {
      backupTimer = null;
      const backupSettings = await loadBackupSettings();
      if (!backupSettings.enabled || !backupSettings.autoBackupOnSave) return;
      try {
        const terms = await loadTerms();
        termsCache = terms;
        const backupSignature = buildBackupSignature();
        if (backupSignature === backupSettings.lastBackupSignature) return;
        await pushBackupToGist(backupSettings, buildBackupPayload());
        await saveBackupSettings({ ...backupSettings, lastBackupAt: new Date().toISOString(), lastBackupSignature: backupSignature });
      } catch {}
    }, 400);
  }


  function shouldSkip(node) {
    const skippable = /^(SCRIPT|STYLE|NOSCRIPT|IFRAME|TEXTAREA|INPUT|SVG)$/i;
    return skippable.test(node.nodeName) || node.classList?.contains(HIGHLIGHT_CLASS);
  }

  function walkTextNodes(root, cb) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.parentElement) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;

        const cs = node.parentElement.ownerDocument.defaultView.getComputedStyle(node.parentElement);
        if (cs && (cs.visibility === "hidden" || cs.display === "none")) return NodeFilter.FILTER_SKIP;

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let n;
    while ((n = walker.nextNode())) cb(n);
  }

  function clearExistingHighlights(root = document.body) {
    if (!root) return;
    root.querySelectorAll("." + HIGHLIGHT_CLASS).forEach((node) => {
      const p = node.parentNode;
      if (!p) return;
      p.replaceChild(document.createTextNode(node.textContent), node);
      p.normalize();
    });
  }

  function highlightSingleTerm(term, root = document.body) {
    if (!root) return;
    const pat = escapeRegExp(term);
    const reTest = new RegExp("(" + pat + ")", "iu");

    walkTextNodes(root, (textNode) => {
      const text = textNode.nodeValue;
      if (!reTest.test(text)) return;

      const reReplace = new RegExp("(" + pat + ")", "giu");
      const frag = document.createDocumentFragment();
      let last = 0;

      text.replace(reReplace, (match, _g, idx) => {
        if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));

        const span = document.createElement("span");
        span.className = HIGHLIGHT_CLASS;
        span.textContent = match;

        span.style.backgroundColor = cssColorFromHexRgba(highlightColor);
        span.style.color = textColor || DEFAULT_TEXT_COLOR;
        span.style.fontWeight = textBold ? "700" : "400";
        span.style.fontStyle = textItalic ? "italic" : "normal";

        span.style.borderRadius = "3px";
        span.style.padding = "0 1px";
        span.style.margin = "0";
        span.style.cursor = "pointer";

        span.dataset.term = term;

        frag.appendChild(span);
        last = idx + match.length;
        return match;
      });

      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  function observeDom() {
    if (domObserver || !document.documentElement) return;
    domObserver = new MutationObserver((mutations) => {
      if (observerPaused) return;
      let relevant = false;
      for (const m of mutations) {
        const target = m.target && m.target.nodeType === 1 ? m.target : m.target && m.target.parentElement;
        if (
          target &&
          (
            target.closest("." + HIGHLIGHT_CLASS) ||
            target.closest("#" + PANEL_OVERLAY_ID) ||
            target.closest("[" + TOOLBAR_HOST_ATTR + "]") ||
            target.closest("[" + POP_HOST_ATTR + "]")
          )
        ) {
          continue;
        }
        if (m.type === "characterData") {
          relevant = true;
          break;
        }
        if (m.type === "childList" && (m.addedNodes.length || m.removedNodes.length)) {
          relevant = true;
          break;
        }
      }
      if (relevant) scheduleApplyHighlights();
    });
    domObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  function disconnectObserver() {
    if (!domObserver) return;
    domObserver.disconnect();
    domObserver = null;
  }

  async function applyHighlights() {
    if (isApplying) {
      rerunApply = true;
      return;
    }

    isApplying = true;
    try {
      do {
        rerunApply = false;
        const terms = await loadTerms();
        observerPaused = true;
        disconnectObserver();
        try {
          clearExistingHighlights(document.body);
          if (!terms.length) continue;
          const ordered = [...terms].sort((a, b) => b.length - a.length);
          for (const t of ordered) highlightSingleTerm(t, document.body);
        } finally {
          observerPaused = false;
          observeDom();
        }
      } while (rerunApply);
    } finally {
      isApplying = false;
    }
  }

  function scheduleApplyHighlights() {
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      applyTimer = null;
      applyHighlights();
    }, APPLY_DEBOUNCE_MS);
  }

  addCleanup(() => {
    if (applyTimer) {
      clearTimeout(applyTimer);
      applyTimer = null;
    }
    disconnectObserver();
  });


  const broadcastApply = () => {
    try {
      window.top.postMessage({ type: "VINI_APPLY_HIGHLIGHTS" }, "*");
    } catch {}
  };

  const onApplyMessage = (e) => {
    const d = e && e.data;
    if (d && d.type === "VINI_APPLY_HIGHLIGHTS") scheduleApplyHighlights();
  };

  const onPanelToggleMessage = (e) => {
    const d = e && e.data;
    if (!d) return;
    if (d.type === "VINI_TOGGLE_PANEL_REQUEST" && IS_TOP) {
      togglePanelSafe();
    }
  };

  on(window, "message", onApplyMessage);
  on(window, "message", onPanelToggleMessage);


  let toolbar, toolbarRoot;

  let lastSelectionText = "";
  let lastSelectionRangeRect = null;

  function ensureToolbar() {
    if (toolbarRoot) return;

    const host = document.createElement("div");
    host.setAttribute(TOOLBAR_HOST_ATTR, "1");
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.top = "0";
    host.style.left = "0";
    host.style.pointerEvents = "none";
    document.documentElement.appendChild(host);
    addCleanup(() => {
      if (toolbarRoot === host) {
        try { host.remove(); } catch {}
        toolbar = null;
        toolbarRoot = null;
      }
    });

    const root = host.attachShadow({ mode: "open" });

    const btn = document.createElement("button");
    btn.textContent = "Destacar";
    Object.assign(btn.style, {
      pointerEvents: "auto",
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      fontSize: "12px",
      padding: "6px 10px",
      border: "1px solid rgba(0,0,0,.14)",
      borderRadius: "10px",
      background: "#ffffff",
      boxShadow: "0 6px 18px rgba(0,0,0,.12)",
      cursor: "pointer",
      display: "none",
      lineHeight: "1",
      userSelect: "none",
    });

    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const text = String(lastSelectionText || "").trim();

      if (text && charCount(text) >= MIN_LEN) {
        const ok = await addTerm(text);
        if (ok) {
          await applyHighlights();
          broadcastApply();
        }
      }

      lastSelectionText = "";
      lastSelectionRangeRect = null;
      hideToolbar();

      const sel = window.getSelection && window.getSelection();
      if (sel) sel.removeAllRanges();
    });

    const style = document.createElement("style");
    style.textContent = `
      :host{all:initial}
      button:hover{filter:brightness(.97)}
      button:active{transform:translateY(1px)}
    `;
    root.appendChild(style);
    root.appendChild(btn);

    toolbar = btn;
    toolbarRoot = host;
  }

  function showToolbarAt(x, y) {
    ensureToolbar();
    toolbar.style.position = "fixed";
    toolbar.style.left = Math.round(x) + "px";
    toolbar.style.top = Math.max(8, Math.round(y)) + "px";
    toolbar.style.display = "block";
  }

  function hideToolbar() {
    if (toolbar) toolbar.style.display = "none";
  }

  function captureSelectionSnapshot() {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed) return false;

    const txt = String(sel.toString()).trim();
    if (!txt || charCount(txt) < MIN_LEN) return false;

    lastSelectionText = txt;

    try {
      const range = sel.getRangeAt(0).cloneRange();
      const rects = range.getClientRects();
      if (rects && rects.length) {
        lastSelectionRangeRect = rects[rects.length - 1];
      } else {
        lastSelectionRangeRect = null;
      }
    } catch {
      lastSelectionRangeRect = null;
    }

    return true;
  }

  function positionToolbarNearSelection() {
    if (!captureSelectionSnapshot()) {
      lastSelectionText = "";
      lastSelectionRangeRect = null;
      return hideToolbar();
    }

    const r = lastSelectionRangeRect;
    if (!r) return hideToolbar();

    showToolbarAt(r.right + 10, r.top - 10);
  }

  on(document, "selectionchange", positionToolbarNearSelection);

  on(
    document,
    "mouseup",
    () => {
      setTimeout(() => {
        positionToolbarNearSelection();
      }, 0);
    },
    { passive: true }
  );

  on(
    document,
    "keyup",
    (e) => {
      if (e && e.shiftKey) positionToolbarNearSelection();
    },
    { passive: true }
  );

  on(
    document,
    "scroll",
    () => {
      if (lastSelectionText && lastSelectionRangeRect) {
        const r = lastSelectionRangeRect;
        showToolbarAt(r.right + 10, r.top - 10);
      } else {
        positionToolbarNearSelection();
      }
    },
    { passive: true }
  );


  let pop, popRoot, currentCanonical = null;

  function ensurePop() {
    if (popRoot) return;

    const host = document.createElement("div");
    host.setAttribute(POP_HOST_ATTR, "1");
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.top = "0";
    host.style.left = "0";
    host.style.pointerEvents = "none";
    document.documentElement.appendChild(host);
    addCleanup(() => {
      if (popRoot === host) {
        try { host.remove(); } catch {}
        pop = null;
        popRoot = null;
        currentCanonical = null;
      }
    });

    const root = host.attachShadow({ mode: "open" });

    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      pointerEvents: "auto",
      display: "none",
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      fontSize: "12px",
      padding: "6px 10px",
      border: "1px solid rgba(0,0,0,.14)",
      borderRadius: "10px",
      background: "#fff",
      boxShadow: "0 6px 18px rgba(0,0,0,.12)",
    });

    const btn = document.createElement("button");
    btn.textContent = "Remover";
    Object.assign(btn.style, {
      cursor: "pointer",
      border: "none",
      background: "transparent",
      padding: "0",
      margin: "0",
      color: "#c00",
      fontWeight: "600",
    });

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (currentCanonical) {
        const removed = await removeByCanonical(currentCanonical);
        if (removed) {
          await applyHighlights();
          broadcastApply();
        }
      }
      hidePop();
    });

    const style = document.createElement("style");
    style.textContent = `:host{all:initial} button:hover{text-decoration:underline}`;

    wrap.appendChild(btn);
    root.appendChild(style);
    root.appendChild(wrap);

    pop = wrap;
    popRoot = host;
  }

  function showPopAt(x, y, canonicalTerm) {
    ensurePop();
    currentCanonical = canonicalTerm;

    pop.style.position = "fixed";
    pop.style.left = Math.round(x) + "px";
    pop.style.top = Math.max(8, Math.round(y)) + "px";
    pop.style.display = "block";
  }

  function hidePop() {
    if (pop) pop.style.display = "none";
    currentCanonical = null;
  }

  on(
    document,
    "click",
    (e) => {
      if (popRoot) {
        const path = e.composedPath ? e.composedPath() : null;
        if (path && path.indexOf(popRoot) !== -1) return;
      }

      const t = e.target;
      if (t && t.classList && t.classList.contains(HIGHLIGHT_CLASS)) {
        const rect = t.getBoundingClientRect();
        const canonical = t.dataset.term || t.textContent;
        showPopAt(rect.right + 8, rect.top - 8, canonical);

        e.stopPropagation();
        e.preventDefault();
        return;
      }

      hidePop();
    },
    true
  );


  const PANEL_OVERLAY_ID = "projudi-highlighter-panel-overlay";
  let panelCleanup = null;
  let menuRegistered = false;
  let menuCommandId = null;

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

  function getPanelOverlay() {
    return document.getElementById(PANEL_OVERLAY_ID);
  }

  function closePanel() {
    if (!IS_TOP) return;
    const overlay = getPanelOverlay();
    if (!overlay) {
      panelOpen = false;
      return;
    }

    if (typeof panelCleanup === "function") panelCleanup();
    panelCleanup = null;
    overlay.remove();
    panelOpen = false;
  }

  async function openPanel() {
    if (!IS_TOP) return;
    if (getPanelOverlay()) {
      panelOpen = true;
      return;
    }

    const unlockBodyScroll = lockBodyScroll(document);
    panelCleanup = () => {
      unlockBodyScroll();
    };

    const overlay = document.createElement("div");
    overlay.id = PANEL_OVERLAY_ID;
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(11, 18, 32, .50);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
    `;

    const panel = document.createElement("div");
    panel.style.cssText = `
      width: 640px;
      max-width: calc(100vw - 24px);
      max-height: min(88vh, 860px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: #ffffff;
      color: #0f172a;
      border-radius: 14px;
      box-shadow: 0 24px 70px rgba(2, 6, 23, .30);
      border: 1px solid #dbe3ef;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.35;
      transform: translateY(6px) scale(.985);
      opacity: .96;
      transition: transform .16s ease, opacity .16s ease;
    `;

    const scopedStyle = document.createElement("style");
    scopedStyle.textContent = `
      #${PANEL_OVERLAY_ID} *,
      #${PANEL_OVERLAY_ID} *::before,
      #${PANEL_OVERLAY_ID} *::after { box-sizing: border-box; }

      #${PANEL_OVERLAY_ID} #vhp-close,
      #${PANEL_OVERLAY_ID} #vhp-cancel,
      #${PANEL_OVERLAY_ID} #vhp-apply,
      #${PANEL_OVERLAY_ID} #vhp-add,
      #${PANEL_OVERLAY_ID} #vhp-add-selection,
      #${PANEL_OVERLAY_ID} #vhp-remove-selected,
      #${PANEL_OVERLAY_ID} #vhp-export,
      #${PANEL_OVERLAY_ID} #vhp-import,
      #${PANEL_OVERLAY_ID} #vhp-import-apply,
      #${PANEL_OVERLAY_ID} #vhp-import-cancel,
      #${PANEL_OVERLAY_ID} .vhp-rm {
        text-indent: 0 !important;
        letter-spacing: normal !important;
        text-transform: none !important;
        line-height: 1.2 !important;
        white-space: nowrap !important;
      }

      #${PANEL_OVERLAY_ID} #vhp-close {
        min-width: 0 !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      #${PANEL_OVERLAY_ID} .vhp-sec {
        border: 1px solid #dbe3ef;
        border-radius: 10px;
        padding: 12px;
        background: #ffffff;
      }

      #${PANEL_OVERLAY_ID} .vhp-sec + .vhp-sec { margin-top: 10px; }
      #${PANEL_OVERLAY_ID} .vhp-title {
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 8px;
      }

      #${PANEL_OVERLAY_ID} .vhp-row { display: flex; gap: 8px; align-items: center; }
      #${PANEL_OVERLAY_ID} .vhp-row + .vhp-row { margin-top: 8px; }

      #${PANEL_OVERLAY_ID} .vhp-inpt {
        flex: 1;
        padding: 6px 8px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        outline: none;
        font-size: 14px;
        line-height: 1.35;
      }

      #${PANEL_OVERLAY_ID} .vhp-btn {
        padding: 7px 11px;
        min-width: 86px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #1e293b;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.2;
      }

      #${PANEL_OVERLAY_ID} .vhp-btn:hover { filter: brightness(.98); }
      #${PANEL_OVERLAY_ID} .vhp-btn.primary {
        background: #0f3e75;
        color: #ffffff;
        border-color: #0f3e75;
      }

      #${PANEL_OVERLAY_ID} .vhp-btn.danger {
        background: #fff7f7;
        color: #b00020;
        border-color: #efc8d1;
      }

      #${PANEL_OVERLAY_ID} .vhp-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      #${PANEL_OVERLAY_ID} .vhp-field {
        border: 1px solid #dbe3ef;
        border-radius: 10px;
        padding: 10px;
      }

      #${PANEL_OVERLAY_ID} .vhp-label {
        font-size: 12px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 8px;
      }

      #${PANEL_OVERLAY_ID} .vhp-check {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        color: #1e293b;
      }

      #${PANEL_OVERLAY_ID} .vhp-check input {
        width: 18px;
        height: 18px;
      }

      #${PANEL_OVERLAY_ID} .vhp-color-wrap {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      #${PANEL_OVERLAY_ID} .vhp-color {
        width: 44px;
        height: 32px;
        border: none;
        background: transparent;
        padding: 0;
        cursor: pointer;
      }

      #${PANEL_OVERLAY_ID} .vhp-swatch {
        flex: 1;
        height: 32px;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
      }

      #${PANEL_OVERLAY_ID} .vhp-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      #${PANEL_OVERLAY_ID} .vhp-backup-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      #${PANEL_OVERLAY_ID} .vhp-backup-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      #${PANEL_OVERLAY_ID} .vhp-backup-field--full {
        grid-column: 1 / -1;
      }

      #${PANEL_OVERLAY_ID} .vhp-backup-field label,
      #${PANEL_OVERLAY_ID} .vhp-backup-toggle label {
        font-size: 12px;
        color: #334155;
        font-weight: 600;
      }

      #${PANEL_OVERLAY_ID} .vhp-backup-field input {
        width: 100%;
        min-width: 0;
        padding: 6px 8px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        outline: none;
        font-size: 14px;
        line-height: 1.35;
      }

      #${PANEL_OVERLAY_ID} .vhp-backup-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: flex-start;
        margin-top: 10px;
      }

      #${PANEL_OVERLAY_ID} .vhp-backup-toggle {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 14px;
        flex: 1 1 100%;
        min-width: 0;
      }

      #${PANEL_OVERLAY_ID} .vhp-backup-toggle label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
      }

      #${PANEL_OVERLAY_ID} .vhp-backup-status {
        flex: 1 1 100%;
        font-size: 12px;
        color: #475569;
      }

      #${PANEL_OVERLAY_ID} .vhp-item {
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid #dbe3ef;
        border-radius: 10px;
        padding: 9px 10px;
        background: #ffffff;
      }

      #${PANEL_OVERLAY_ID} .vhp-term {
        flex: 1;
        font-size: 14px;
        font-weight: 600;
        color: #0f172a;
        word-break: break-word;
      }

      #${PANEL_OVERLAY_ID} .vhp-rm {
        border: 1px solid #efc8d1;
        background: #fff7f7;
        color: #b00020;
        border-radius: 8px;
        cursor: pointer;
        padding: 7px 11px;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.2;
      }

      #${PANEL_OVERLAY_ID} #vhp-import-area {
        margin-top: 8px;
        display: none;
      }

      #${PANEL_OVERLAY_ID} #vhp-import-text {
        width: 100%;
        min-height: 110px;
        resize: vertical;
        padding: 6px 8px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.35;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }

      #${PANEL_OVERLAY_ID} #vhp-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        padding: 16px;
        background: #f8fafc;
      }

      #${PANEL_OVERLAY_ID} #vhp-content {
        padding: 16px;
        background: #f8fafc;
      }

      #${PANEL_OVERLAY_ID} #vhp-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #dbe3ef;
        background: #f8fafc;
      }

      @media (max-width: 760px) {
        #${PANEL_OVERLAY_ID} .vhp-grid { grid-template-columns: 1fr; }
        #${PANEL_OVERLAY_ID} .vhp-row { flex-wrap: wrap; }
        #${PANEL_OVERLAY_ID} #vhp-body { padding: 12px; }
        #${PANEL_OVERLAY_ID} #vhp-content { padding: 12px; }
        #${PANEL_OVERLAY_ID} #vhp-footer { padding: 10px 12px; }
      }
    `;

    let backupSettings = await loadBackupSettings();

    panel.innerHTML = `
      <div style="flex:0 0 auto; padding:14px 16px; background:linear-gradient(135deg,#0f3e75,#1f5ca4); color:#fff; border-bottom:1px solid #dbe3ef;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div>
            <div style="font-size:16px; font-weight:700; line-height:1.2;">Destaque Global</div>
            <div style="font-size:12px; opacity:.9; margin-top:2px;">Gerencie termos e personalização dos destaques</div>
          </div>
          <button id="vhp-close" class="vhp-btn" style="border:0; background:rgba(255,255,255,.2); color:#fff; width:28px; height:28px; border-radius:999px; cursor:pointer; font-size:16px; font-weight:500; line-height:1;">×</button>
        </div>
      </div>

      <div id="vhp-body">
        <div id="vhp-content">
        <div class="vhp-sec">
          <div class="vhp-title">Termos</div>
          <div class="vhp-row">
            <input id="vhp-add-input" class="vhp-inpt" placeholder="Digite o novo termo" />
            <button id="vhp-add" class="vhp-btn primary">Adicionar</button>
          </div>
          <div class="vhp-row">
            <button id="vhp-add-selection" class="vhp-btn">Adicionar seleção</button>
            <button id="vhp-remove-selected" class="vhp-btn danger">Remover seleção</button>
            <button id="vhp-export" class="vhp-btn">Exportar JSON</button>
            <button id="vhp-import" class="vhp-btn">Importar JSON</button>
          </div>
          <div id="vhp-import-area">
            <textarea id="vhp-import-text" placeholder='Cole um JSON: ["termo 1", "termo 2"]'></textarea>
            <div class="vhp-row" style="justify-content:flex-end; margin-top:8px;">
              <button id="vhp-import-cancel" class="vhp-btn">Cancelar</button>
              <button id="vhp-import-apply" class="vhp-btn primary">Aplicar</button>
            </div>
          </div>
        </div>

        <div class="vhp-sec">
          <div class="vhp-title">Personalização</div>
          <div class="vhp-grid">
            <div class="vhp-field">
              <div class="vhp-label">Cor destaque</div>
              <div class="vhp-color-wrap">
                <input id="vhp-hl-color" type="color" class="vhp-color" />
                <div id="vhp-hl-preview" class="vhp-swatch" title="Cor atual"></div>
              </div>
            </div>
            <div class="vhp-field">
              <div class="vhp-label">Cor do texto</div>
              <div class="vhp-color-wrap">
                <input id="vhp-text-color" type="color" class="vhp-color" />
                <div id="vhp-tx-preview" class="vhp-swatch" title="Cor atual"></div>
              </div>
            </div>
            <div class="vhp-field">
              <div class="vhp-label">Itálico</div>
              <label class="vhp-check">
                <input id="vhp-italic-toggle" type="checkbox" />
                <span>Ativar</span>
              </label>
            </div>
            <div class="vhp-field">
              <div class="vhp-label">Negrito</div>
              <label class="vhp-check">
                <input id="vhp-bold-toggle" type="checkbox" />
                <span>Ativar</span>
              </label>
            </div>
          </div>
        </div>

        <div class="vhp-sec">
          <div class="vhp-title">Backup remoto</div>
          <div style="font-size:12px; color:#64748b; margin-bottom:10px;">Use um único Gist no GitHub e um arquivo separado para este script.</div>
          <div class="vhp-backup-grid">
            <div class="vhp-backup-field">
              <label for="vhp-backup-gist">Gist ID</label>
              <input id="vhp-backup-gist" type="text" value="${htmlEscapeAttr(backupSettings.gistId)}" placeholder="Cole o Gist ID" />
            </div>
            <div class="vhp-backup-field">
              <label for="vhp-backup-file">Arquivo</label>
              <input id="vhp-backup-file" type="text" value="${htmlEscapeAttr(backupSettings.fileName)}" placeholder="${SCRIPT_META.fileName}" />
            </div>
            <div class="vhp-backup-field vhp-backup-field--full">
              <label for="vhp-backup-token">Token do GitHub</label>
              <input id="vhp-backup-token" type="password" value="${htmlEscapeAttr(backupSettings.token)}" placeholder="ghp_..." />
            </div>
          </div>
          <div class="vhp-backup-row">
            <div class="vhp-backup-toggle">
              <label><input id="vhp-backup-enabled" type="checkbox" ${backupSettings.enabled ? "checked" : ""} /> Ativar backup por Gist no GitHub.</label>
              <label><input id="vhp-backup-auto" type="checkbox" ${backupSettings.autoBackupOnSave ? "checked" : ""} /> Backup automático</label>
            </div>
            <button id="vhp-backup-send" class="vhp-btn" type="button">Enviar backup</button>
            <button id="vhp-backup-restore" class="vhp-btn" type="button">Restaurar backup</button>
            <button id="vhp-backup-clear" class="vhp-btn" type="button">Limpar backup</button>
            <div id="vhp-backup-status" class="vhp-backup-status"></div>
          </div>
          <div id="vhp-backup-last" class="vhp-backup-status">${formatLastBackupLabel(backupSettings.lastBackupAt)}</div>
        </div>

        <div class="vhp-sec">
          <div class="vhp-title">Lista de destaques</div>
          <div id="vhp-list" class="vhp-list"></div>
        </div>
        </div>
      </div>

      <div id="vhp-footer" style="flex:0 0 auto;">
        <button id="vhp-cancel" class="vhp-btn">Fechar</button>
        <button id="vhp-apply" class="vhp-btn primary">Aplicar Agora</button>
      </div>
    `;

    overlay.appendChild(scopedStyle);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      panel.style.transform = "translateY(0) scale(1)";
      panel.style.opacity = "1";
    });

    const $ = (id) => panel.querySelector(id);

    const listEl = $("#vhp-list");
    const addInput = $("#vhp-add-input");
    const importArea = $("#vhp-import-area");
    const importText = $("#vhp-import-text");
    const hlInput = $("#vhp-hl-color");
    const hlPrev = $("#vhp-hl-preview");
    const txInput = $("#vhp-text-color");
    const txPrev = $("#vhp-tx-preview");
    const italicInput = $("#vhp-italic-toggle");
    const boldInput = $("#vhp-bold-toggle");
    const backupStatus = $("#vhp-backup-status");
    const backupLast = $("#vhp-backup-last");
    const backupEnabledInput = $("#vhp-backup-enabled");
    const backupAutoInput = $("#vhp-backup-auto");
    const backupGistInput = $("#vhp-backup-gist");
    const backupTokenInput = $("#vhp-backup-token");
    const backupFileInput = $("#vhp-backup-file");
    const backupSendBtn = $("#vhp-backup-send");
    const backupRestoreBtn = $("#vhp-backup-restore");
    const backupClearBtn = $("#vhp-backup-clear");
    const hasBackupUi = [
      backupStatus,
      backupLast,
      backupEnabledInput,
      backupAutoInput,
      backupGistInput,
      backupTokenInput,
      backupFileInput,
      backupSendBtn,
      backupRestoreBtn,
      backupClearBtn
    ].every(Boolean);

    function syncSwatches() {
      if (hlPrev) hlPrev.style.background = cssColorFromHexRgba(highlightColor);
      if (txPrev) txPrev.style.background = textColor || DEFAULT_TEXT_COLOR;
    }

    function setBackupStatus(message, isError) {
      if (!backupStatus) return;
      backupStatus.textContent = message || "";
      backupStatus.style.color = isError ? "#b42318" : "#475569";
    }

    function updateBackupLast(nextSettings) {
      if (!backupLast) return;
      backupLast.textContent = formatLastBackupLabel((nextSettings || backupSettings).lastBackupAt);
    }

    async function readBackupSettingsFromPanel() {
      if (!hasBackupUi) return backupSettings;
      return saveBackupSettings({
        enabled: !!backupEnabledInput.checked,
        autoBackupOnSave: !!backupAutoInput.checked,
        gistId: backupGistInput.value || "",
        token: backupTokenInput.value || "",
        fileName: backupFileInput.value || ""
      });
    }

    async function runBackupNow() {
      termsCache = await loadTerms();
      let nextSettings = await readBackupSettingsFromPanel();
      const backupSignature = buildBackupSignature();
      setBackupStatus("Enviando backup...");
      await pushBackupToGist(nextSettings, buildBackupPayload());
      nextSettings = await saveBackupSettings({ ...nextSettings, lastBackupAt: new Date().toISOString(), lastBackupSignature: backupSignature });
      backupSettings = nextSettings;
      updateBackupLast(nextSettings);
      setBackupStatus("Backup enviado.");
    }
    updateBackupLast(backupSettings);

    async function refreshList() {
      const terms = await loadTerms();
      listEl.innerHTML = "";

      for (const t of terms) {
        const row = document.createElement("div");
        row.className = "vhp-item";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.key = norm(t);

        const span = document.createElement("div");
        span.className = "vhp-term";
        span.textContent = t;

        const rm = document.createElement("button");
        rm.className = "vhp-rm";
        rm.textContent = "Remover";
        rm.onclick = async () => {
          if (await removeByCanonical(t)) {
            await refreshList();
            await applyHighlights();
            broadcastApply();
            scheduleAutoBackup();
          }
        };

        row.appendChild(cb);
        row.appendChild(span);
        row.appendChild(rm);
        listEl.appendChild(row);
      }
    }

    $("#vhp-add").onclick = async () => {
      const value = addInput.value.trim();
      if (!value || value.length < MIN_LEN) return;

      if (await addTerm(value)) {
        addInput.value = "";
        await refreshList();
        await applyHighlights();
        broadcastApply();
        scheduleAutoBackup();
      }
    };

    $("#vhp-add-selection").onclick = async () => {
      const sel = window.getSelection && window.getSelection();
      const text = sel ? String(sel.toString()).trim() : "";
      if (!text || charCount(text) < MIN_LEN) return;

      if (await addTerm(text)) {
        await refreshList();
        await applyHighlights();
        broadcastApply();
        scheduleAutoBackup();
      }
    };

    $("#vhp-remove-selected").onclick = async () => {
      const checks = listEl.querySelectorAll('input[type="checkbox"]:checked');
      if (!checks.length) return;

      const terms = await loadTerms();
      const selectedKeys = new Set([...checks].map((c) => c.dataset.key));
      const filtered = terms.filter((t) => !selectedKeys.has(norm(t)));

      await saveTerms(filtered);
      await refreshList();
      await applyHighlights();
      broadcastApply();
      scheduleAutoBackup();
    };

    $("#vhp-export").onclick = async () => {
      const terms = await loadTerms();
      const data = JSON.stringify(terms, null, 2);

      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "vini-highlights.json";
      a.click();

      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    $("#vhp-import").onclick = () => {
      importArea.style.display = "block";
    };

    $("#vhp-import-cancel").onclick = () => {
      importText.value = "";
      importArea.style.display = "none";
    };

    $("#vhp-import-apply").onclick = async () => {
      try {
        const txt = importText.value.trim();
        const arr = JSON.parse(txt);
        if (!Array.isArray(arr)) throw new Error("JSON deve ser um array de strings");

        await setBulkTerms(arr);
        importText.value = "";
        importArea.style.display = "none";

        await refreshList();
        await applyHighlights();
        broadcastApply();
        scheduleAutoBackup();
      } catch (e) {
        alert("Importação falhou: " + (e && e.message ? e.message : e));
      }
    };

    if (hlInput) {
      try {
        hlInput.value = (highlightColor || DEFAULT_HIGHLIGHT_COLOR).slice(0, 7);
      } catch {}
      hlInput.addEventListener("input", async (ev) => {
        const val = ev.target.value;
        const alpha = highlightColor && highlightColor.length > 7 ? highlightColor.slice(7) : "FF";
        highlightColor = val + alpha;

        await GM.setValue(KEY_HIGHLIGHT_COLOR, highlightColor);
        syncSwatches();
        await applyHighlights();
        broadcastApply();
        scheduleAutoBackup();
      });
    }

    if (txInput) {
      try {
        txInput.value = (textColor || DEFAULT_TEXT_COLOR).slice(0, 7);
      } catch {}
      txInput.addEventListener("input", async (ev) => {
        textColor = ev.target.value;

        await GM.setValue(KEY_TEXT_COLOR, textColor);
        syncSwatches();
        await applyHighlights();
        broadcastApply();
        scheduleAutoBackup();
      });
    }

    if (italicInput) {
      italicInput.checked = !!textItalic;
      italicInput.addEventListener("change", async (ev) => {
        textItalic = !!ev.target.checked;

        await GM.setValue(KEY_ITALIC, textItalic);
        await applyHighlights();
        broadcastApply();
        scheduleAutoBackup();
      });
    }

    if (boldInput) {
      boldInput.checked = !!textBold;
      boldInput.addEventListener("change", async (ev) => {
        textBold = !!ev.target.checked;

        await GM.setValue(KEY_BOLD, textBold);
        await applyHighlights();
        broadcastApply();
        scheduleAutoBackup();
      });
    }

    if (hasBackupUi) {
      [
        backupEnabledInput,
        backupAutoInput,
        backupGistInput,
        backupTokenInput,
        backupFileInput
      ].forEach((el) => {
        el.addEventListener(el.type === "checkbox" ? "change" : "input", () => {
          readBackupSettingsFromPanel().catch(() => {});
        });
      });

      backupSendBtn.addEventListener("click", () => {
        runBackupNow().catch((error) => {
          setBackupStatus(error && error.message ? error.message : "Falha ao enviar backup.", true);
        });
      });

      backupRestoreBtn.addEventListener("click", async () => {
        try {
          let nextSettings = await readBackupSettingsFromPanel();
          setBackupStatus("Restaurando backup...");
          const payload = await readBackupFromGist(nextSettings);
          await applyBackupPayload(payload);
          nextSettings = await saveBackupSettings({ ...nextSettings, lastBackupSignature: buildBackupSignature() });
          closePanel();
          await openPanel();
        } catch (error) {
          setBackupStatus(error && error.message ? error.message : "Falha ao restaurar backup.", true);
        }
      });

      backupClearBtn.addEventListener("click", async () => {
        const nextSettings = await saveBackupSettings(DEFAULT_BACKUP_SETTINGS);
        backupEnabledInput.checked = nextSettings.enabled;
        backupAutoInput.checked = nextSettings.autoBackupOnSave;
        backupGistInput.value = nextSettings.gistId;
        backupTokenInput.value = nextSettings.token;
        backupFileInput.value = nextSettings.fileName;
        updateBackupLast(nextSettings);
        setBackupStatus("Configuração de backup removida.");
      });
    }

    $("#vhp-close").addEventListener("click", closePanel);
    $("#vhp-cancel").addEventListener("click", closePanel);
    $("#vhp-apply").addEventListener("click", async () => {
      await applyHighlights();
      broadcastApply();
      closePanel();
    });

    const onEsc = (ev) => {
      if (ev.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onEsc);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePanel();
    });

    panelCleanup = () => {
      unlockBodyScroll();
      document.removeEventListener("keydown", onEsc);
    };

    await refreshList();
    syncSwatches();

    panelOpen = true;
  }

  async function togglePanel(on) {
    if (!IS_TOP) return;
    if (on) {
      await openPanel();
    } else {
      closePanel();
    }
  }

  function togglePanelSafe() {
    if (!IS_TOP) return;

    const k = "__vini_highlighter_toggle_lock__";
    const now = Date.now();

    try {
      const last = window[k] || 0;
      if (now - last < 250) return;
      window[k] = now;
    } catch {}

    togglePanel(!panelOpen);
  }


  function supportsMenuCommand() {
    if (!IS_TOP) return false;
    if (typeof GM !== "undefined" && typeof GM.registerMenuCommand === "function") return true;
    if (typeof GM_registerMenuCommand === "function") return true;
    return false;
  }

  function unregisterExtensionMenu() {
    if (!menuRegistered) return;
    try {
      if (typeof GM !== "undefined" && typeof GM.unregisterMenuCommand === "function" && menuCommandId != null) {
        GM.unregisterMenuCommand(menuCommandId);
      } else if (typeof GM_unregisterMenuCommand === "function" && menuCommandId != null) {
        GM_unregisterMenuCommand(menuCommandId);
      }
    } catch {}
    menuCommandId = null;
    menuRegistered = false;
  }

  function registerExtensionMenu(force) {
    if (!supportsMenuCommand()) return;
    if (force) unregisterExtensionMenu();
    if (menuRegistered) return;

    const fn = () => {
      try {
        window.top.postMessage({ type: "VINI_TOGGLE_PANEL_REQUEST" }, "*");
      } catch {
        if (IS_TOP) togglePanelSafe();
      }
    };

    if (typeof GM !== "undefined" && typeof GM.registerMenuCommand === "function") {
      menuCommandId = GM.registerMenuCommand("Destaque Global: Abrir Painel", fn);
      menuRegistered = true;
      return;
    }
    if (typeof GM_registerMenuCommand === "function") {
      menuCommandId = GM_registerMenuCommand("Destaque Global: Abrir Painel", fn);
      menuRegistered = true;
    }
  }


  (async function init() {
    await loadSettings();
    await applyHighlights();
    observeDom();
    registerExtensionMenu();
    addCleanup(unregisterExtensionMenu);

    if (!historyPatched) {
      historyPatched = true;
      originalPushState = history.pushState;
      originalReplaceState = history.replaceState;

      patchedPushState = function () {
        const ret = originalPushState.apply(this, arguments);
        window.dispatchEvent(new Event(SPA_CHANGE_EVENT));
        return ret;
      };
      patchedReplaceState = function () {
        const ret = originalReplaceState.apply(this, arguments);
        window.dispatchEvent(new Event(SPA_CHANGE_EVENT));
        return ret;
      };
      history.pushState = patchedPushState;
      history.replaceState = patchedReplaceState;

      addCleanup(() => {
        if (history.pushState === patchedPushState && originalPushState) history.pushState = originalPushState;
        if (history.replaceState === patchedReplaceState && originalReplaceState) history.replaceState = originalReplaceState;
        patchedPushState = null;
        patchedReplaceState = null;
        historyPatched = false;
      });
    }

    on(window, "popstate", () => window.dispatchEvent(new Event(SPA_CHANGE_EVENT)));
    on(window, "pageshow", () => {
      registerExtensionMenu(true);
    }, true);
    on(window, "focus", () => {
      registerExtensionMenu(true);
    }, true);
    on(document, "visibilitychange", () => {
      if (!document.hidden) registerExtensionMenu(true);
    });
    on(window, SPA_CHANGE_EVENT, () => {
      scheduleApplyHighlights();
    });
    on(window, "pagehide", () => {
      if (applyTimer) {
        clearTimeout(applyTimer);
        applyTimer = null;
      }
      disconnectObserver();
      closePanel();
      hideToolbar();
      hidePop();
      unregisterExtensionMenu();
      if (historyPatched) {
        if (history.pushState === patchedPushState && originalPushState) history.pushState = originalPushState;
        if (history.replaceState === patchedReplaceState && originalReplaceState) history.replaceState = originalReplaceState;
        patchedPushState = null;
        patchedReplaceState = null;
        historyPatched = false;
      }
    }, { once: true });
  })();
})();
