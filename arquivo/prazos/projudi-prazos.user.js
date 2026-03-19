// ==UserScript==
// @name         Prazos
// @namespace    projudi-prazos.user.js
// @version      4.5
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Realça possíveis vencimentos no projudi, com cores definidas.
// @author       louencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/f9a2549211ec7a07807ce2d6a3cfd0a9/raw/projudi-prazos.user.js
// @downloadURL  https://gist.githubusercontent.com/lourencosv/f9a2549211ec7a07807ce2d6a3cfd0a9/raw/projudi-prazos.user.js
// @match        *://projudi.tjgo.jus.br/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// ==/UserScript==

(function () {
  "use strict";

  const WINDOW_DAYS = 7;
  const TARGET_HEADERS = ["data limite", "possivel data limite", "possível data limite"];
  const FILTER_DATE_KEY = "projudi_highlight_filter_date_v1";
  const FILTER_ENABLED_KEY = "projudi_highlight_filter_enabled_v1";
  const FILTER_MODE_KEY = "projudi_highlight_filter_mode_v1";
  const FILTER_RANGE_START_KEY = "projudi_highlight_filter_range_start_v1";
  const FILTER_RANGE_END_KEY = "projudi_highlight_filter_range_end_v1";
  const SETTINGS_SYNC_EVENT = "projudi:deadline-settings-changed";
  const RUNTIME_KEY = "__tm_hl7d_runtime_v2";
  const CLASS_PREFIX = "tm-hl7d";
  const FILTER_HIDDEN_ATTR = "data-tm-filter-hidden";
  const CELL_ATTR = "data-tm-deadline-class";
  const MENU_STATE_KEY = "__tm_hl7d_menu_state_v3";
  const LOG_PREFIX = "[Prazos]";

  try {
    if (window[RUNTIME_KEY]?.cleanup) window[RUNTIME_KEY].cleanup();
  } catch {}

  const RUNTIME = (window[RUNTIME_KEY] = {
    listeners: [],
    intervals: [],
    timeouts: [],
    observers: [],
    cleanup() {
      for (const off of this.listeners.splice(0)) {
        try {
          off();
        } catch {}
      }
      for (const id of this.intervals.splice(0)) {
        try {
          clearInterval(id);
        } catch {}
      }
      for (const id of this.timeouts.splice(0)) {
        try {
          clearTimeout(id);
        } catch {}
      }
      for (const obs of this.observers.splice(0)) {
        try {
          obs.disconnect();
        } catch {}
      }
    },
  });

  const logger = {
    info(...args) {
      console.info(LOG_PREFIX, ...args);
    },
    warn(...args) {
      console.warn(LOG_PREFIX, ...args);
    },
    error(...args) {
      console.error(LOG_PREFIX, ...args);
    },
  };

  function safeRun(label, fn) {
    try {
      return fn();
    } catch (error) {
      logger.error(`${label} falhou.`, error);
      return undefined;
    }
  }

  function managedAddEventListener(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    RUNTIME.listeners.push(() => target.removeEventListener(type, listener, options));
    return listener;
  }

  function managedSetTimeout(fn, ms) {
    const id = window.setTimeout(() => {
      try {
        fn();
      } finally {
        const idx = RUNTIME.timeouts.indexOf(id);
        if (idx >= 0) RUNTIME.timeouts.splice(idx, 1);
      }
    }, ms);
    RUNTIME.timeouts.push(id);
    return id;
  }

  function managedObserver(observer) {
    RUNTIME.observers.push(observer);
    return observer;
  }

  const IS_TOP = (() => {
    try {
      return window.top === window.self;
    } catch {
      return true;
    }
  })();

  function hasGM() {
    return typeof GM_getValue === "function" && typeof GM_setValue === "function";
  }

  function getStored(key, fallback = "") {
    try {
      if (hasGM()) return GM_getValue(key, fallback);
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (error) {
      logger.warn(`Falha ao ler armazenamento para a chave "${key}".`, error);
      return fallback;
    }
  }

  function setStored(key, value) {
    try {
      if (hasGM()) GM_setValue(key, value);
      else localStorage.setItem(key, String(value));
    } catch (error) {
      logger.warn(`Falha ao salvar armazenamento para a chave "${key}".`, error);
    }
  }

  function clearStored(key) {
    try {
      if (hasGM()) GM_deleteValue(key);
      else localStorage.removeItem(key);
    } catch (error) {
      logger.warn(`Falha ao limpar armazenamento para a chave "${key}".`, error);
    }
  }

  function getStoredFilterDate() {
    return String(getStored(FILTER_DATE_KEY, "") || "");
  }

  function setStoredFilterDate(yyyy_mm_dd) {
    setStored(FILTER_DATE_KEY, yyyy_mm_dd);
  }

  function clearStoredFilterDate() {
    clearStored(FILTER_DATE_KEY);
  }

  function getStoredFilterEnabled() {
    const raw = getStored(FILTER_ENABLED_KEY, false);
    return raw === true || raw === "true" || raw === 1 || raw === "1";
  }

  function setStoredFilterEnabled(enabled) {
    setStored(FILTER_ENABLED_KEY, !!enabled);
  }

  function getStoredFilterMode() {
    const raw = String(getStored(FILTER_MODE_KEY, "exact") || "exact").toLowerCase();
    if (raw === "range") return "range";
    if (raw === "missing") return "missing";
    return "exact";
  }

  function setStoredFilterMode(mode) {
    if (mode === "range" || mode === "missing") {
      setStored(FILTER_MODE_KEY, mode);
      return;
    }
    setStored(FILTER_MODE_KEY, "exact");
  }

  function getStoredFilterRangeStart() {
    return String(getStored(FILTER_RANGE_START_KEY, "") || "");
  }

  function setStoredFilterRangeStart(yyyy_mm_dd) {
    setStored(FILTER_RANGE_START_KEY, yyyy_mm_dd);
  }

  function clearStoredFilterRangeStart() {
    clearStored(FILTER_RANGE_START_KEY);
  }

  function getStoredFilterRangeEnd() {
    return String(getStored(FILTER_RANGE_END_KEY, "") || "");
  }

  function setStoredFilterRangeEnd(yyyy_mm_dd) {
    setStored(FILTER_RANGE_END_KEY, yyyy_mm_dd);
  }

  function clearStoredFilterRangeEnd() {
    clearStored(FILTER_RANGE_END_KEY);
  }

  const pad2 = (n) => (n < 10 ? "0" + n : "" + n);

  function cloneDate(d) {
    const x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, days) {
    const x = new Date(d.getTime());
    x.setDate(x.getDate() + days);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function ymdToDate(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return null;
    const yyyy = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    const d = new Date(yyyy, mm - 1, dd);
    d.setHours(0, 0, 0, 0);
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
    return d;
  }

  function parseBRDateToken(dd, mm, yyOrYyyy) {
    const day = Number(dd);
    const month = Number(mm);
    let year = Number(yyOrYyyy);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    if (String(yyOrYyyy).length === 2) year += 2000;
    const d = new Date(year, month - 1, day);
    d.setHours(0, 0, 0, 0);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
  }

  function extractDatesFromText(text) {
    if (!text) return [];
    const out = [];
    const re = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})\b/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const d = parseBRDateToken(m[1], m[2], m[3]);
      if (d) out.push(d);
    }
    return out;
  }

  function isMissingDeadlineText(text) {
    const t = String(text || "").trim();
    if (t === "") return true;
    return /^[-–—]+$/.test(t);
  }

  function toYmd(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function weekdayShortPT(d) {
    return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"][d.getDay()];
  }

  function isWeekend(d) {
    const day = d.getDay();
    return day === 0 || day === 6;
  }

  const WEEKDAY_PALETTE = [
    { bg: "rgba(255,205,210,1)", fg: "rgba(183,28,28,1)" },
    { bg: "rgba(255,224,178,1)", fg: "rgba(191,54,12,1)" },
    { bg: "rgba(255,249,196,1)", fg: "rgba(245,127,23,1)" },
    { bg: "rgba(220,237,200,1)", fg: "rgba(51,105,30,1)" },
    { bg: "rgba(200,230,201,1)", fg: "rgba(27,94,32,1)" },
  ];
  const WEEKEND_COLOR = { bg: "rgba(227,242,253,1)", fg: "rgba(13,71,161,1)" };

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function parseRGBA(str) {
    const m = /rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i.exec(str);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
  }

  function rgbaToString(c) {
    return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${c.a})`;
  }

  function interpolatePalette(palette, idx, total) {
    if (total <= 1) return palette[0];
    const t = idx / (total - 1);
    const segs = palette.length - 1;
    const x = t * segs;
    const i = Math.floor(x);
    const f = x - i;
    const c0 = palette[Math.min(i, palette.length - 1)];
    const c1 = palette[Math.min(i + 1, palette.length - 1)];
    const bg0 = parseRGBA(c0.bg);
    const bg1 = parseRGBA(c1.bg);
    const fg0 = parseRGBA(c0.fg);
    const fg1 = parseRGBA(c1.fg);
    if (!bg0 || !bg1 || !fg0 || !fg1) return palette[Math.min(idx, palette.length - 1)];
    const bg = { r: lerp(bg0.r, bg1.r, f), g: lerp(bg0.g, bg1.g, f), b: lerp(bg0.b, bg1.b, f), a: lerp(bg0.a, bg1.a, f) };
    const fg = { r: lerp(fg0.r, fg1.r, f), g: lerp(fg0.g, fg1.g, f), b: lerp(fg0.b, fg1.b, f), a: lerp(fg0.a, fg1.a, f) };
    return { bg: rgbaToString(bg), fg: rgbaToString(fg) };
  }

  /**
   * Monta o estado derivado do script a partir da data atual e das preferências salvas.
   * @returns {{todayYmd: string, byYmd: Map<string, object>, entries: object[], settingsSnapshot: string, highlightSnapshot: string}}
   */
  function buildState() {
    const today = cloneDate(new Date());
    const windowDates = [];
    for (let i = 0; i < WINDOW_DAYS; i++) windowDates.push(addDays(today, i));
    const weekdays = windowDates.map((d, i) => ({ d, i })).filter((x) => !isWeekend(x.d));
    const entries = windowDates.map((date, offset) => {
      if (isWeekend(date)) {
        return {
          ymd: toYmd(date),
          className: `${CLASS_PREFIX}-weekend`,
          tooltip: `Fim de semana (${weekdayShortPT(date)}) • ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`,
          color: WEEKEND_COLOR,
        };
      }
      const weekdayPos = weekdays.findIndex((x) => x.i === offset);
      const color = interpolatePalette(WEEKDAY_PALETTE, Math.max(0, weekdayPos), Math.max(1, weekdays.length));
      return {
        ymd: toYmd(date),
        className: `${CLASS_PREFIX}-wd-${weekdayPos}`,
        tooltip: `Possível vencimento em ${offset === 0 ? "HOJE" : `${offset} dia(s)`} • ${weekdayShortPT(date)} • ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`,
        color,
      };
    });
    return {
      todayYmd: toYmd(today),
      byYmd: new Map(entries.map((entry) => [entry.ymd, entry])),
      entries,
      highlightSnapshot: entries.map((entry) => entry.ymd).join("|"),
      settingsSnapshot: JSON.stringify({
        filterDate: getStoredFilterDate(),
        filterEnabled: getStoredFilterEnabled(),
        filterMode: getStoredFilterMode(),
        filterRangeStart: getStoredFilterRangeStart(),
        filterRangeEnd: getStoredFilterRangeEnd(),
      }),
    };
  }

  let STATE = buildState();
  const cellAnalysisCache = new WeakMap();

  function ensureStyles() {
    const baseId = `${CLASS_PREFIX}-style`;
    document.getElementById(baseId)?.remove();
    const style = document.createElement("style");
    style.id = baseId;
    style.textContent = `
      td.${CLASS_PREFIX}-cell {
        position: relative;
        font-weight: 600 !important;
        border-radius: 4px;
        box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
      }
      td.${CLASS_PREFIX}-cell[data-tooltip] {
        cursor: help;
      }
      td.${CLASS_PREFIX}-cell[data-tooltip]::after {
        content: attr(data-tooltip);
        position: absolute;
        left: 50%;
        top: -6px;
        transform: translateX(-50%) translateY(-100%);
        background: #333;
        color: #fff;
        padding: 4px 8px;
        font-size: 11px;
        border-radius: 4px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity .2s;
        z-index: 99999;
      }
      td.${CLASS_PREFIX}-cell[data-tooltip]::before {
        content: "";
        position: absolute;
        left: 50%;
        top: -6px;
        transform: translateX(-50%);
        border-width: 5px;
        border-style: solid;
        border-color: transparent transparent #333 transparent;
        opacity: 0;
        transition: opacity .2s;
        z-index: 99998;
      }
      td.${CLASS_PREFIX}-cell:hover::after,
      td.${CLASS_PREFIX}-cell:hover::before {
        opacity: 1;
      }
    `;
    document.documentElement.appendChild(style);

    const dynId = `${CLASS_PREFIX}-dyn`;
    document.getElementById(dynId)?.remove();
    const dyn = document.createElement("style");
    dyn.id = dynId;
    dyn.textContent = STATE.entries
      .map((entry) => `td.${CLASS_PREFIX}-cell.${entry.className}{background-color:${entry.color.bg} !important;color:${entry.color.fg} !important;}`)
      .join("\n");
    document.documentElement.appendChild(dyn);
  }

  function getColumnIndex(td) {
    const tr = td?.parentElement;
    if (!tr) return -1;
    return Array.prototype.indexOf.call(tr.children, td);
  }

  const targetColsCache = new WeakMap();

  /**
   * Retorna apenas as células reais de uma linha.
   * @param {HTMLTableRowElement} row
   * @returns {HTMLTableCellElement[]}
   */
  function getRowCells(row) {
    return Array.from(row?.children || []).filter((node) => node.nodeName === "TD");
  }

  function getTargetColumnIndexes(table) {
    if (!table) return new Set();
    if (targetColsCache.has(table)) return targetColsCache.get(table);
    const thead = table.querySelector("thead");
    if (!thead) {
      const empty = new Set();
      targetColsCache.set(table, empty);
      return empty;
    }
    const headerRows = Array.from(thead.querySelectorAll("tr"));
    if (headerRows.length === 0) {
      const empty = new Set();
      targetColsCache.set(table, empty);
      return empty;
    }
    const row = headerRows[headerRows.length - 1];
    const idxs = new Set();
    let idx = 0;
    for (const cell of row.children) {
      const span = parseInt(cell.getAttribute("colspan") || "1", 10) || 1;
      const text = (cell.textContent || "").trim().toLowerCase();
      if (TARGET_HEADERS.some((h) => text.includes(h))) {
        for (let i = 0; i < span; i++) idxs.add(idx + i);
      }
      idx += span;
    }
    targetColsCache.set(table, idxs);
    return idxs;
  }

  function tableHasTargetHeaders(table) {
    return getTargetColumnIndexes(table).size > 0;
  }

  function getTablesFromRoot(root) {
    if (!root) return [];
    const out = new Set();
    if (root === document) {
      document.querySelectorAll("table").forEach((table) => out.add(table));
      return Array.from(out);
    }
    if (root.nodeType === Node.TEXT_NODE) {
      const parentTable = root.parentElement?.closest?.("table");
      if (parentTable) out.add(parentTable);
      return Array.from(out);
    }
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (root.nodeName === "TABLE") out.add(root);
      const parentTable = root.closest?.("table");
      if (parentTable) out.add(parentTable);
      root.querySelectorAll?.("table").forEach((table) => out.add(table));
    }
    return Array.from(out);
  }

  function clearCellHighlight(td) {
    const previousClass = td.getAttribute(CELL_ATTR);
    if (previousClass) td.classList.remove(previousClass);
    td.classList.remove(`${CLASS_PREFIX}-cell`);
    td.removeAttribute(CELL_ATTR);
    td.removeAttribute("data-tooltip");
  }

  /**
   * Analisa uma célula com cache por nó para evitar reparse de texto idêntico.
   * @param {HTMLTableCellElement} td
   * @returns {{text: string, missing: boolean, dates: Date[], highlightEntry: object | null}}
   */
  function analyzeCell(td) {
    const text = String(td?.textContent || "").trim();
    const cached = cellAnalysisCache.get(td);
    if (cached && cached.text === text && cached.highlightSnapshot === STATE.highlightSnapshot) {
      return cached;
    }

    const dates = extractDatesFromText(text);
    let highlightEntry = null;
    for (const date of dates) {
      const entry = STATE.byYmd.get(toYmd(date));
      if (entry) {
        highlightEntry = entry;
        break;
      }
    }

    const analysis = {
      text,
      missing: isMissingDeadlineText(text),
      dates,
      highlightEntry,
      highlightSnapshot: STATE.highlightSnapshot,
    };
    cellAnalysisCache.set(td, analysis);
    return analysis;
  }

  function applyHighlightToCell(td) {
    clearCellHighlight(td);
    const entry = analyzeCell(td).highlightEntry;
    if (!entry) return;
    td.classList.add(`${CLASS_PREFIX}-cell`, entry.className);
    td.setAttribute(CELL_ATTR, entry.className);
    td.setAttribute("data-tooltip", entry.tooltip);
  }

  function getActiveFilterSpec() {
    if (!getStoredFilterEnabled()) return null;
    const mode = getStoredFilterMode();
    if (mode === "missing") return { mode: "missing" };
    if (mode === "range") {
      const start = ymdToDate(getStoredFilterRangeStart());
      const end = ymdToDate(getStoredFilterRangeEnd());
      if (!start || !end) return null;
      return { mode: "range", from: start <= end ? start : end, to: start <= end ? end : start };
    }
    const exact = ymdToDate(getStoredFilterDate()) || cloneDate(new Date());
    return { mode: "exact", date: exact, ymd: toYmd(exact) };
  }

  function rowMatchesDeadlineFilter(tr, targetCols, filterSpec) {
    if (!tr || !targetCols.size || !filterSpec) return false;
    const tds = getRowCells(tr);
    for (let col = 0; col < tds.length; col++) {
      if (!targetCols.has(col)) continue;
      const analysis = analyzeCell(tds[col]);
      if (filterSpec.mode === "missing") {
        if (analysis.missing) return true;
        continue;
      }
      for (const date of analysis.dates) {
        if (filterSpec.mode === "exact" && toYmd(date) === filterSpec.ymd) return true;
        if (filterSpec.mode === "range" && date >= filterSpec.from && date <= filterSpec.to) return true;
      }
    }
    return false;
  }

  function hideRow(tr) {
    tr.style.setProperty("display", "none", "important");
    tr.setAttribute(FILTER_HIDDEN_ATTR, "1");
  }

  function showRow(tr) {
    if (!tr.hasAttribute(FILTER_HIDDEN_ATTR)) return;
    tr.style.removeProperty("display");
    tr.removeAttribute(FILTER_HIDDEN_ATTR);
  }

  /**
   * Processa apenas uma tabela relevante do Projudi.
   * @param {HTMLTableElement} table
   */
  function processTable(table) {
    if (!tableHasTargetHeaders(table)) return;
    const targetCols = getTargetColumnIndexes(table);
    if (!targetCols.size) return;
    const filterSpec = getActiveFilterSpec();
    const rows = table.querySelectorAll("tbody tr");
    for (const tr of rows) {
      const tds = getRowCells(tr);
      for (let col = 0; col < tds.length; col++) {
        if (!targetCols.has(col)) continue;
        applyHighlightToCell(tds[col]);
      }
      if (!filterSpec) {
        showRow(tr);
      } else if (rowMatchesDeadlineFilter(tr, targetCols, filterSpec)) {
        showRow(tr);
      } else {
        hideRow(tr);
      }
    }
  }

  function clearProcessedState(root = document) {
    root.querySelectorAll(`td.${CLASS_PREFIX}-cell`).forEach(clearCellHighlight);
    root.querySelectorAll(`tr[${FILTER_HIDDEN_ATTR}="1"]`).forEach(showRow);
  }

  function processRoot(root = document) {
    getTablesFromRoot(root).forEach(processTable);
  }

  let REBUILDING = false;
  let REBUILD_PENDING = false;
  let lastKnownDay = STATE.todayYmd;
  let lastSettingsSnapshot = STATE.settingsSnapshot;

  /**
   * Reconstrói o estado global e reaplica o processamento às tabelas visíveis.
   */
  function rebuildAll() {
    if (!document.body) return;
    if (REBUILDING) {
      REBUILD_PENDING = true;
      return;
    }
    REBUILDING = true;
    STATE = buildState();
    lastKnownDay = STATE.todayYmd;
    lastSettingsSnapshot = STATE.settingsSnapshot;
    try {
      ensureStyles();
      clearProcessedState(document);
      processRoot(document);
      logger.info("Reprocessamento completo concluído.");
    } finally {
      REBUILDING = false;
      if (REBUILD_PENDING) {
        REBUILD_PENDING = false;
        scheduleFullRefresh();
      }
    }
  }

  function getTopWindowSafe() {
    try {
      return window.top || window;
    } catch {
      return window;
    }
  }

  function getTopDocumentSafe() {
    if (IS_TOP) return document;
    try {
      return window.top.document;
    } catch {
      return document;
    }
  }

  let fullRefreshTimer = 0;
  function scheduleFullRefresh() {
    if (fullRefreshTimer) return;
    fullRefreshTimer = managedSetTimeout(() => {
      fullRefreshTimer = 0;
      rebuildAll();
    }, 0);
  }

  let midnightTimer = 0;
  function scheduleNextMidnightRefresh() {
    if (midnightTimer) clearTimeout(midnightTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2, 0);
    midnightTimer = managedSetTimeout(() => {
      scheduleFullRefresh();
      scheduleNextMidnightRefresh();
    }, Math.max(1000, next.getTime() - now.getTime()));
  }

  function maybeRefreshForClockOrSettings() {
    const nextState = buildState();
    if (nextState.todayYmd !== lastKnownDay || nextState.settingsSnapshot !== lastSettingsSnapshot) {
      scheduleFullRefresh();
    }
  }

  function lockBodyScroll(doc = document) {
    const body = doc?.body;
    if (!body) return () => {};
    const win = doc.defaultView || window;
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

  function openPanel() {
    const topDoc = safeRun("Leitura do documento superior", getTopDocumentSafe);
    if (!topDoc?.body) return;
    const overlayId = `${CLASS_PREFIX}-panel-overlay`;
    if (topDoc.getElementById(overlayId)) return;

    const unlockBodyScroll = lockBodyScroll(topDoc);
    const today = cloneDate(new Date());
    const todayYMD = toYmd(today);
    const filterDateInitial = getStoredFilterDate() || todayYMD;
    const rangeStartInitial = getStoredFilterRangeStart() || filterDateInitial;
    const rangeEndInitial = getStoredFilterRangeEnd() || filterDateInitial;

    const overlay = topDoc.createElement("div");
    overlay.id = overlayId;
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(11, 18, 32, .50);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 18px;
    `;

    const panel = topDoc.createElement("div");
    panel.style.cssText = `
      width: 640px;
      max-width: calc(100vw - 24px);
      max-height: min(88vh, 860px);
      display: flex;
      flex-direction: column;
      background: #ffffff;
      color: #0f172a;
      border-radius: 14px;
      box-shadow: 0 24px 70px rgba(2, 6, 23, .30);
      border: 1px solid #dbe3ef;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    `;

    const scopedStyle = topDoc.createElement("style");
    scopedStyle.textContent = `
      #${overlayId} * { box-sizing: border-box; }
      #${overlayId} { --tm-action-main-w: 210px; }
      #${overlayId} button,
      #${overlayId} input,
      #${overlayId} label,
      #${overlayId} span,
      #${overlayId} div {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
      }
      #${overlayId} .tm-head {
        padding: 14px 16px;
        background: linear-gradient(135deg,#0f3e75,#1f5ca4);
        color: #fff;
        border-bottom: 1px solid rgba(255,255,255,.14);
      }
      #${overlayId} .tm-head-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      #${overlayId} .tm-head-title {
        font-size: 16px;
        font-weight: 700;
      }
      #${overlayId} .tm-head-sub {
        font-size: 12px;
        opacity: .92;
        margin-top: 2px;
      }
      #${overlayId} .tm-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        padding: 16px;
        background: #fff;
      }
      #${overlayId} .tm-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #dbe3ef;
        background: #f8fafc;
      }
      #${overlayId} button {
        cursor: pointer;
        border-radius: 8px;
        font-size: 14px !important;
        font-weight: 500 !important;
        height: 42px;
        padding: 7px 11px;
        min-width: 86px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
      }
      #${overlayId} .btn-ghost {
        color: #1e293b !important;
        background: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
      }
      #${overlayId} .btn-primary {
        color: #ffffff !important;
        background: #0f3e75 !important;
        border: 1px solid #0f3e75 !important;
        font-weight: 600 !important;
      }
      #${overlayId} .btn-icon {
        border: 0 !important;
        background: rgba(255,255,255,.2) !important;
        color: #fff !important;
        width: 28px !important;
        height: 28px !important;
        min-width: 28px !important;
        border-radius: 999px !important;
        padding: 0 !important;
      }
      #${overlayId} input[type="date"] {
        width: 100%;
        min-width: 0;
        height: 42px;
        padding: 6px 8px !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 8px !important;
        color: #0f172a !important;
        background: #fff !important;
        font-size: 14px !important;
      }
      #${overlayId} .tm-card {
        border: 1px solid #dbe3ef;
        border-radius: 10px;
        padding: 12px;
        background: #fff;
      }
      #${overlayId} .tm-card + .tm-card { margin-top: 10px; }
      #${overlayId} .tm-card-title {
        font-size: 12px;
        font-weight: 700;
        color: #0f172a;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      #${overlayId} .tm-card-desc {
        margin-top: 5px;
        font-size: 12px;
        color: #64748b;
      }
      #${overlayId} .tm-inline-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) var(--tm-action-main-w);
        gap: 8px;
        align-items: center;
        margin-top: 10px;
      }
      #${overlayId} .tm-range-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) var(--tm-action-main-w);
        gap: 8px;
        align-items: center;
        margin-top: 10px;
      }
      #${overlayId} .tm-desc-action-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) var(--tm-action-main-w);
        gap: 8px;
        align-items: start;
        margin-top: 8px;
      }
      #${overlayId} .tm-desc-action-row .btn-primary,
      #${overlayId} .tm-inline-row .btn-primary,
      #${overlayId} .tm-range-row .btn-primary {
        width: var(--tm-action-main-w) !important;
        min-width: var(--tm-action-main-w) !important;
      }
      #${overlayId} .tm-status {
        margin-top: 12px;
        font-size: 12px;
        color: #334155;
      }
      #${overlayId} .tm-note {
        margin-top: 6px;
        font-size: 12px;
        color: #64748b;
      }
      @media (max-width: 640px) {
        #${overlayId} .tm-inline-row,
        #${overlayId} .tm-range-row,
        #${overlayId} .tm-desc-action-row {
          grid-template-columns: 1fr;
        }
        #${overlayId} .tm-desc-action-row .btn-primary,
        #${overlayId} .tm-inline-row .btn-primary,
        #${overlayId} .tm-range-row .btn-primary {
          width: 100% !important;
          min-width: 0 !important;
        }
      }
    `;

    panel.innerHTML = `
      <div class="tm-head">
        <div class="tm-head-row">
          <div>
            <div class="tm-head-title">Prazos</div>
            <div class="tm-head-sub">Destaque e filtros de prazo</div>
          </div>
          <button id="${CLASS_PREFIX}-close-top" class="btn-icon" aria-label="Fechar painel">×</button>
        </div>
      </div>
      <div class="tm-body">
        <div class="tm-card">
          <div class="tm-card-title">Filtro por data exata</div>
          <div class="tm-card-desc">Exibe somente processos cuja coluna de prazo corresponda exatamente à data informada, na página principal ou em intimações.</div>
          <div class="tm-inline-row">
            <input id="${CLASS_PREFIX}-filter-date" type="date" value="${filterDateInitial}" />
            <button id="${CLASS_PREFIX}-apply-filter" class="btn-primary">Aplicar</button>
          </div>
        </div>
        <div class="tm-card">
          <div class="tm-card-title">Filtro por período</div>
          <div class="tm-card-desc">Exibe somente processos com prazo dentro do intervalo informado.</div>
          <div class="tm-range-row">
            <input id="${CLASS_PREFIX}-range-start" type="date" value="${rangeStartInitial}" />
            <input id="${CLASS_PREFIX}-range-end" type="date" value="${rangeEndInitial}" />
            <button id="${CLASS_PREFIX}-apply-range-filter" class="btn-primary">Aplicar período</button>
          </div>
        </div>
        <div class="tm-card">
          <div class="tm-card-title">Filtro sem data limite</div>
          <div class="tm-desc-action-row">
            <div class="tm-card-desc">Localiza processos sem prazo definido: campo vazio na página principal ou “-” na lista de intimações.</div>
            <button id="${CLASS_PREFIX}-apply-missing-filter" class="btn-primary">Localizar sem prazo</button>
          </div>
        </div>
        <div id="${CLASS_PREFIX}-status" class="tm-status"></div>
        <div class="tm-note">Destaque automático: hoje + próximos ${WINDOW_DAYS - 1} dias.</div>
      </div>
      <div class="tm-footer">
        <button id="${CLASS_PREFIX}-clear-all" class="btn-ghost">Limpar</button>
        <button id="${CLASS_PREFIX}-close-bottom" class="btn-ghost">Fechar</button>
      </div>
    `;

    overlay.appendChild(scopedStyle);
    overlay.appendChild(panel);
    topDoc.body.appendChild(overlay);

    const $ = (id) => topDoc.getElementById(id);
    const statusEl = $(`${CLASS_PREFIX}-status`);
    const setStatus = (msg) => {
      if (statusEl) statusEl.textContent = msg || "";
    };

    function refreshStatus() {
      const enabled = getStoredFilterEnabled();
      const mode = getStoredFilterMode();
      const exact = ymdToDate(getStoredFilterDate());
      const start = ymdToDate(getStoredFilterRangeStart());
      const end = ymdToDate(getStoredFilterRangeEnd());
      if (enabled && mode === "range" && start && end) {
        const from = start <= end ? start : end;
        const to = start <= end ? end : start;
        setStatus(`Filtro: período de ${pad2(from.getDate())}/${pad2(from.getMonth() + 1)}/${from.getFullYear()} até ${pad2(to.getDate())}/${pad2(to.getMonth() + 1)}/${to.getFullYear()}`);
        return;
      }
      if (enabled && mode === "missing") {
        setStatus("Filtro: sem data limite");
        return;
      }
      if (enabled && exact) {
        setStatus(`Filtro: data exata em ${pad2(exact.getDate())}/${pad2(exact.getMonth() + 1)}/${exact.getFullYear()}`);
        return;
      }
      setStatus("Filtro: desativado");
    }

    function closePanel() {
      topDoc.removeEventListener("keydown", escClose);
      unlockBodyScroll();
      overlay.remove();
    }

    function escClose(ev) {
      if (ev.key === "Escape") closePanel();
    }

    $(`${CLASS_PREFIX}-close-top`).addEventListener("click", closePanel);
    $(`${CLASS_PREFIX}-close-bottom`).addEventListener("click", closePanel);

    $(`${CLASS_PREFIX}-apply-filter`).addEventListener("click", () => {
      const ymd = $(`${CLASS_PREFIX}-filter-date`).value || "";
      const date = ymdToDate(ymd);
      if (!date) return setStatus("Filtro: selecione uma data válida.");
      setStoredFilterDate(ymd);
      setStoredFilterMode("exact");
      setStoredFilterEnabled(true);
      broadcastSettingsSyncBurst();
      logger.info("Filtro por data exata atualizado.", ymd);
      refreshStatus();
    });

    $(`${CLASS_PREFIX}-apply-range-filter`).addEventListener("click", () => {
      const startYMD = $(`${CLASS_PREFIX}-range-start`).value || "";
      const endYMD = $(`${CLASS_PREFIX}-range-end`).value || "";
      const start = ymdToDate(startYMD);
      const end = ymdToDate(endYMD);
      if (!start || !end) return setStatus("Filtro por período: selecione data inicial e final válidas.");
      setStoredFilterRangeStart(startYMD);
      setStoredFilterRangeEnd(endYMD);
      setStoredFilterMode("range");
      setStoredFilterEnabled(true);
      broadcastSettingsSyncBurst();
      logger.info("Filtro por período atualizado.", { startYMD, endYMD });
      refreshStatus();
    });

    $(`${CLASS_PREFIX}-apply-missing-filter`).addEventListener("click", () => {
      setStoredFilterMode("missing");
      setStoredFilterEnabled(true);
      broadcastSettingsSyncBurst();
      logger.info("Filtro sem data limite ativado.");
      refreshStatus();
    });

    $(`${CLASS_PREFIX}-clear-all`).addEventListener("click", () => {
      clearStoredFilterDate();
      clearStoredFilterRangeStart();
      clearStoredFilterRangeEnd();
      setStoredFilterEnabled(false);
      setStoredFilterMode("exact");
      $(`${CLASS_PREFIX}-filter-date`).value = todayYMD;
      $(`${CLASS_PREFIX}-range-start`).value = todayYMD;
      $(`${CLASS_PREFIX}-range-end`).value = todayYMD;
      clearVisualFilterNowInWindow(getTopWindowSafe());
      broadcastSettingsSyncBurst();
      logger.info("Filtros limpos.");
      refreshStatus();
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closePanel();
    });
    topDoc.addEventListener("keydown", escClose);
    refreshStatus();
  }

  function dispatchSettingsSyncRecursive(win, sourceWindow) {
    if (!win) return;
    try {
      win.dispatchEvent(new CustomEvent(SETTINGS_SYNC_EVENT, { detail: { source: sourceWindow === win ? "self" : "external" } }));
    } catch {}
    let frames = [];
    try {
      frames = Array.from(win.frames || []);
    } catch {
      frames = [];
    }
    for (const child of frames) {
      try {
        if (child && child !== win) dispatchSettingsSyncRecursive(child, sourceWindow);
      } catch {}
    }
  }

  function broadcastSettingsSync() {
    dispatchSettingsSyncRecursive(getTopWindowSafe(), window);
  }

  function broadcastSettingsSyncBurst() {
    broadcastSettingsSync();
    managedSetTimeout(broadcastSettingsSync, 40);
    managedSetTimeout(broadcastSettingsSync, 180);
  }

  function clearVisualFilterNowInWindow(win) {
    if (!win) return;
    try {
      const doc = win.document;
      if (!doc?.documentElement) return;
      doc.querySelectorAll(`tr[${FILTER_HIDDEN_ATTR}="1"]`).forEach((tr) => {
        tr.style.removeProperty("display");
        tr.removeAttribute(FILTER_HIDDEN_ATTR);
      });
    } catch {}
    let frames = [];
    try {
      frames = Array.from(win.frames || []);
    } catch {
      frames = [];
    }
    for (const child of frames) {
      try {
        if (child && child !== win) clearVisualFilterNowInWindow(child);
      } catch {}
    }
  }

  function ensureMenuCommand() {
    if (!IS_TOP || typeof GM_registerMenuCommand !== "function") return;
    const topWin = getTopWindowSafe();
    const state = (topWin[MENU_STATE_KEY] ||= { id: null });
    try {
      if (state.id !== null && typeof GM_unregisterMenuCommand === "function") {
        GM_unregisterMenuCommand(state.id);
      }
    } catch {}
    try {
      state.id = GM_registerMenuCommand("Prazos: Abrir Painel", openPanel);
    } catch (error) {
      logger.error("Falha ao registrar comando do menu.", error);
    }
  }

  if (IS_TOP) {
    ensureMenuCommand();
    managedAddEventListener(window, "pageshow", ensureMenuCommand);
    managedAddEventListener(window, "focus", ensureMenuCommand);
    managedAddEventListener(document, "visibilitychange", () => {
      if (!document.hidden) ensureMenuCommand();
    });
  }

  let BULK_LOADING = false;
  managedAddEventListener(window, "projudi:bulk-load-start", () => {
    BULK_LOADING = true;
  });
  managedAddEventListener(window, "projudi:bulk-load-end", () => {
    BULK_LOADING = false;
    scheduleFullRefresh();
  });

  managedAddEventListener(window, SETTINGS_SYNC_EVENT, scheduleFullRefresh);
  managedAddEventListener(window, "pageshow", maybeRefreshForClockOrSettings);
  managedAddEventListener(window, "focus", maybeRefreshForClockOrSettings);
  managedAddEventListener(document, "visibilitychange", () => {
    if (!document.hidden) maybeRefreshForClockOrSettings();
  });

  const pendingTables = new Set();
  let flushTimer = 0;

  function scheduleTablesFromRoot(root) {
    if (BULK_LOADING || REBUILDING) return;
    const tables = getTablesFromRoot(root);
    if (!tables.length) return;
    tables.forEach((table) => pendingTables.add(table));
    if (flushTimer) return;
    flushTimer = managedSetTimeout(() => {
      flushTimer = 0;
      const tablesToProcess = Array.from(pendingTables);
      pendingTables.clear();
      tablesToProcess.forEach(processTable);
    }, 120);
  }

  safeRun("Inicialização de estilos", ensureStyles);
  safeRun("Processamento inicial", () => processRoot(document));
  scheduleNextMidnightRefresh();

  if (document.body) {
    const observer = managedObserver(
      new MutationObserver((mutations) => {
        safeRun("Processamento de mutações", () => {
          for (const mutation of mutations) {
            if (mutation.type !== "childList") continue;
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) {
                scheduleTablesFromRoot(node);
              }
            }
          }
        });
      })
    );
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
