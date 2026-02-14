// ==UserScript==
// @name         Destaque de Prazos
// @namespace    projudi-highlight-hoje.user.js
// @version      3.4
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Realça possíveis vencimentos no projudi, com cores definidas.
// @author       louencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/f9a2549211ec7a07807ce2d6a3cfd0a9/raw/projudi-highlight-hoje.user.js
// @downloadURL  https://gist.githubusercontent.com/lourencosv/f9a2549211ec7a07807ce2d6a3cfd0a9/raw/projudi-highlight-hoje.user.js
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
  const FIXED_DATE_KEY = "projudi_highlight_fixed_date_v1";
  const FILTER_DATE_KEY = "projudi_highlight_filter_date_v1";
  const FILTER_ENABLED_KEY = "projudi_highlight_filter_enabled_v1";

  const IS_TOP = (() => {
    try {
      return window.top === window.self;
    } catch {
      return true;
    }
  })();

  function getTopDocumentSafe() {
    if (IS_TOP) return document;
    try {
      return window.top.document;
    } catch {
      return document;
    }
  }

  function hasGM() {
    return typeof GM_getValue === "function" && typeof GM_setValue === "function";
  }

  function getStored(key, fallback = "") {
    try {
      if (hasGM()) return GM_getValue(key, fallback);
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function setStored(key, value) {
    try {
      if (hasGM()) GM_setValue(key, value);
      else localStorage.setItem(key, String(value));
    } catch {}
  }

  function clearStored(key) {
    try {
      if (hasGM()) GM_deleteValue(key);
      else localStorage.removeItem(key);
    } catch {}
  }

  function getStoredFixedDate() {
    return String(getStored(FIXED_DATE_KEY, "") || "");
  }

  function setStoredFixedDate(yyyy_mm_dd) {
    setStored(FIXED_DATE_KEY, yyyy_mm_dd);
  }

  function clearStoredFixedDate() {
    clearStored(FIXED_DATE_KEY);
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

  const pad2 = (n) => (n < 10 ? "0" + n : "" + n);

  const alt = (num) => {
    const s = pad2(num);
    const n = String(num);
    return s === n ? s : `${s}|${n}`;
  };

  function isWeekend(d) {
    const day = d.getDay();
    return day === 0 || day === 6;
  }

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

  function makeDateInfo(date) {
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const yyyy = date.getFullYear();
    const yy = String(yyyy).slice(-2);

    const dayAlt = alt(d);
    const monAlt = alt(m);

    const pattern = String.raw`\b(?:${dayAlt})[\/\-](?:${monAlt})[\/\-](?:${yyyy}|${yy})\b`;

    return {
      date,
      d,
      m,
      yyyy,
      regex: new RegExp(pattern, "g"),
      quickStrings: [pad2(d), String(d)],
    };
  }

  function weekdayShortPT(d) {
    const map = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
    return map[d.getDay()];
  }

  function dateMatchesTextByInfo(dateInfo, text) {
    if (!dateInfo || !text) return false;
    dateInfo.regex.lastIndex = 0;
    return dateInfo.regex.test(text);
  }

  const CLASS_PREFIX = "tm-hl7d";
  const CLASS_WEEKEND = `${CLASS_PREFIX}-weekend`;
  const CLASS_FIXED = `${CLASS_PREFIX}-fixed`;
  const FILTER_HIDDEN_ATTR = "data-tm-filter-hidden";

  const WEEKDAY_PALETTE = [
    { bg: "rgba(255,205,210,1)", fg: "rgba(183,28,28,1)" },
    { bg: "rgba(255,224,178,1)", fg: "rgba(191,54,12,1)" },
    { bg: "rgba(255,249,196,1)", fg: "rgba(245,127,23,1)" },
    { bg: "rgba(220,237,200,1)", fg: "rgba(51,105,30,1)" },
    { bg: "rgba(200,230,201,1)", fg: "rgba(27,94,32,1)" },
  ];

  const WEEKEND_COLOR = { bg: "rgba(227,242,253,1)", fg: "rgba(13,71,161,1)" };
  const FIXED_COLOR = { bg: "rgba(243,229,245,1)", fg: "rgba(74,20,140,1)" };

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

    const bg0 = parseRGBA(c0.bg),
      bg1 = parseRGBA(c1.bg);
    const fg0 = parseRGBA(c0.fg),
      fg1 = parseRGBA(c1.fg);
    if (!bg0 || !bg1 || !fg0 || !fg1) return palette[Math.min(idx, palette.length - 1)];

    const bg = { r: lerp(bg0.r, bg1.r, f), g: lerp(bg0.g, bg1.g, f), b: lerp(bg0.b, bg1.b, f), a: lerp(bg0.a, bg1.a, f) };
    const fg = { r: lerp(fg0.r, fg1.r, f), g: lerp(fg0.g, fg1.g, f), b: lerp(fg0.b, fg1.b, f), a: lerp(fg0.a, fg1.a, f) };

    return { bg: rgbaToString(bg), fg: rgbaToString(fg) };
  }

  function buildConfigs() {
    const today = cloneDate(new Date());

    const windowDates = [];
    for (let i = 0; i < WINDOW_DAYS; i++) windowDates.push(addDays(today, i));

    const weekdayOffsets = windowDates.map((d, i) => ({ d, i })).filter((x) => !isWeekend(x.d));

    const weekdayCount = weekdayOffsets.length;

    const windowConfigs = windowDates.map((d, offset) => {
      const info = makeDateInfo(d);

      if (isWeekend(d)) {
        return {
          kind: "window",
          offset,
          info,
          className: CLASS_WEEKEND,
          tooltip: `Fim de semana (${weekdayShortPT(d)}) • ${pad2(info.d)}/${pad2(info.m)}/${info.yyyy}`,
        };
      }

      const wkPos = weekdayOffsets.findIndex((x) => x.i === offset);
      const col = interpolatePalette(WEEKDAY_PALETTE, Math.max(0, wkPos), Math.max(1, weekdayCount));
      const className = `${CLASS_PREFIX}-wd-${wkPos}`;

      return {
        kind: "window",
        offset,
        info,
        className,
        weekdayPos: wkPos,
        weekdayColor: col,
        tooltip: `Possivel vencimento em ${offset === 0 ? "HOJE" : `${offset} dia(s)`} • ${weekdayShortPT(d)} • ${pad2(info.d)}/${pad2(info.m)}/${info.yyyy}`,
      };
    });

    const fixedYMD = getStoredFixedDate();
    const fixedDate = fixedYMD ? ymdToDate(fixedYMD) : null;

    const fixedConfig = fixedDate
      ? {
          kind: "fixed",
          offset: null,
          info: makeDateInfo(fixedDate),
          className: CLASS_FIXED,
          tooltip: `Data fixa (painel) • ${pad2(fixedDate.getDate())}/${pad2(fixedDate.getMonth() + 1)}/${fixedDate.getFullYear()}`,
        }
      : null;

    const all = fixedConfig ? [fixedConfig, ...windowConfigs] : windowConfigs;

    const quick = new Set();
    for (const cfg of all) for (const qs of cfg.info.quickStrings) quick.add(qs);

    return { configs: all, quickStrings: Array.from(quick), windowConfigs, fixedConfig };
  }

  const style = document.createElement("style");
  style.textContent = `
.${CLASS_PREFIX}-base {
  position: relative;
  cursor: help;
  padding: 0.1em 0.15em;
  border-radius: 2px;
}

.${CLASS_PREFIX}-base::after {
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
  transition: opacity .25s;
  z-index: 99999;
}
.${CLASS_PREFIX}-base::before {
  content: "";
  position: absolute;
  left: 50%;
  top: -6px;
  transform: translateX(-50%);
  border-width: 5px;
  border-style: solid;
  border-color: transparent transparent #333 transparent;
  opacity: 0;
  transition: opacity .25s;
  z-index: 99998;
}
.${CLASS_PREFIX}-base:hover::after,
.${CLASS_PREFIX}-base:hover::before { opacity: 1; }

.${CLASS_WEEKEND} {
  background-color: ${WEEKEND_COLOR.bg} !important;
  color: ${WEEKEND_COLOR.fg} !important;
  box-shadow: inset 0 0 0 1px rgba(13,71,161,.25);
}

.${CLASS_FIXED} {
  background-color: ${FIXED_COLOR.bg} !important;
  color: ${FIXED_COLOR.fg} !important;
  box-shadow: inset 0 0 0 1px rgba(74,20,140,.25);
}
`;
  document.documentElement.appendChild(style);

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);
  const HIGHLIGHT_SELECTOR = `span.${CLASS_PREFIX}-base`;
  const isSkippable = (node) =>
    node && (SKIP_TAGS.has(node.nodeName) || node.closest?.(`${HIGHLIGHT_SELECTOR}, script, style, noscript, textarea, input`));

  function getColumnIndex(td) {
    const tr = td?.parentElement;
    if (!tr) return -1;
    return Array.prototype.indexOf.call(tr.children, td);
  }

  const targetColsCache = new WeakMap();

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
      const isTarget = TARGET_HEADERS.some((h) => text.includes(h));
      if (isTarget) {
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

  function isTargetColumn(td) {
    if (!td) return false;
    const table = td.closest?.("table");
    if (!table) return false;
    const colIndex = getColumnIndex(td);
    if (colIndex < 0) return false;
    const targetCols = getTargetColumnIndexes(table);
    return targetCols.has(colIndex);
  }

  function isInTargetCell(textNode) {
    let el = textNode?.parentElement;
    while (el && el !== document.body && el.nodeName !== "TD") el = el.parentElement;
    if (!el || el.nodeName !== "TD") return false;
    return isTargetColumn(el);
  }

  let STATE = buildConfigs();

  function ensureWeekdayDynamicClasses() {
    const existing = document.getElementById(`${CLASS_PREFIX}-dyn`);
    if (existing) existing.remove();

    const dyn = document.createElement("style");
    dyn.id = `${CLASS_PREFIX}-dyn`;

    const wd = STATE.windowConfigs
      .filter((c) => c.weekdayPos !== undefined && c.weekdayColor)
      .sort((a, b) => a.weekdayPos - b.weekdayPos);

    let out = "";
    for (const c of wd) {
      out += `
.${c.className} {
  background-color: ${c.weekdayColor.bg} !important;
  color: ${c.weekdayColor.fg} !important;
}
`;
    }

    dyn.textContent = out;
    document.documentElement.appendChild(dyn);
  }

  function unwrapAllHighlights(root) {
    const spans = root.querySelectorAll(`span.${CLASS_PREFIX}-base`);
    for (const sp of spans) {
      const txt = document.createTextNode(sp.textContent || "");
      sp.replaceWith(txt);
    }
  }

  function highlightInTextNode(textNode) {
    if (!isInTargetCell(textNode)) return;

    const text = textNode.nodeValue;
    if (!text) return;

    for (const cfg of STATE.configs) cfg.info.regex.lastIndex = 0;

    const matches = [];
    for (const cfg of STATE.configs) {
      const { regex } = cfg.info;
      let m;
      while ((m = regex.exec(text)) !== null) {
        matches.push({
          start: m.index,
          end: m.index + m[0].length,
          text: m[0],
          className: cfg.className,
          tooltip: cfg.tooltip,
          kind: cfg.kind,
        });
      }
    }
    if (matches.length === 0) return;

    matches.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      if (a.end !== b.end) return b.end - a.end;
      if (a.kind !== b.kind) return a.kind === "fixed" ? -1 : 1;
      return 0;
    });

    const filtered = [];
    let lastEnd = -1;
    for (const m of matches) {
      if (m.start >= lastEnd) {
        filtered.push(m);
        lastEnd = m.end;
      }
    }

    const frag = document.createDocumentFragment();
    let lastIndex = 0;

    for (const m of filtered) {
      if (m.start > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, m.start)));
      }

      const span = document.createElement("span");
      span.className = `${CLASS_PREFIX}-base ${m.className}`;
      span.textContent = m.text;
      span.setAttribute("data-tooltip", m.tooltip);

      frag.appendChild(span);
      lastIndex = m.end;
    }

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(frag, textNode);
  }

  function walkAndHighlight(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentNode;
          if (!parent || isSkippable(parent)) return NodeFilter.FILTER_REJECT;

          const t = node.nodeValue;
          if (!t || t.length < 6) return NodeFilter.FILTER_REJECT;
          if (!(t.includes("/") || t.includes("-"))) return NodeFilter.FILTER_SKIP;

          let hasQuick = false;
          for (const qs of STATE.quickStrings) {
            if (t.includes(qs)) {
              hasQuick = true;
              break;
            }
          }
          if (!hasQuick) return NodeFilter.FILTER_SKIP;

          return NodeFilter.FILTER_ACCEPT;
        },
      },
      false
    );

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const tn of nodes) highlightInTextNode(tn);
  }

  function getEffectiveFilterDate() {
    const stored = getStoredFilterDate();
    const d = stored ? ymdToDate(stored) : null;
    return d || cloneDate(new Date());
  }

  function rowMatchesDeadlineDate(tr, targetCols, dateInfo) {
    if (!tr || !targetCols || targetCols.size === 0) return false;

    const tds = Array.from(tr.children).filter((x) => x.nodeName === "TD");
    if (tds.length === 0) return false;

    for (let col = 0; col < tds.length; col++) {
      if (!targetCols.has(col)) continue;
      const txt = (tds[col].textContent || "").trim();
      if (!txt) continue;
      if (dateMatchesTextByInfo(dateInfo, txt)) return true;
    }

    return false;
  }

  function hideRow(tr) {
    tr.style.setProperty("display", "none", "important");
    tr.setAttribute(FILTER_HIDDEN_ATTR, "1");
  }

  function showRow(tr) {
    if (tr.hasAttribute(FILTER_HIDDEN_ATTR)) {
      tr.style.removeProperty("display");
      tr.removeAttribute(FILTER_HIDDEN_ATTR);
    }
  }

  function getTablesFromRoot(root) {
    if (!root) return [];
    const out = new Set();

    if (root === document) {
      document.querySelectorAll("table").forEach((t) => out.add(t));
      return Array.from(out);
    }

    if (root.nodeType === Node.ELEMENT_NODE) {
      const el = root;
      if (el.nodeName === "TABLE") out.add(el);

      const parentTable = el.closest?.("table");
      if (parentTable) out.add(parentTable);

      el.querySelectorAll?.("table").forEach((t) => out.add(t));
    }

    return Array.from(out);
  }

  function clearFilterInRoot(root) {
    const rows = root.querySelectorAll(`tr[${FILTER_HIDDEN_ATTR}="1"]`);
    for (const tr of rows) showRow(tr);
  }

  function applyDeadlineFilter(root = document) {
    const enabled = getStoredFilterEnabled();

    if (!enabled) {
      clearFilterInRoot(root);
      return;
    }

    const filterDate = getEffectiveFilterDate();
    const filterInfo = makeDateInfo(filterDate);
    const tables = getTablesFromRoot(root);

    for (const table of tables) {
      if (!tableHasTargetHeaders(table)) continue;
      const targetCols = getTargetColumnIndexes(table);
      if (targetCols.size === 0) continue;

      const tbodyRows = table.querySelectorAll("tbody tr");
      for (const tr of tbodyRows) {
        const match = rowMatchesDeadlineDate(tr, targetCols, filterInfo);
        if (match) showRow(tr);
        else hideRow(tr);
      }
    }
  }

  function rebuildStateAndRehighlight() {
    STATE = buildConfigs();
    ensureWeekdayDynamicClasses();
    unwrapAllHighlights(document.body);
    walkAndHighlight(document.body);
    applyDeadlineFilter(document);
  }

  function openPanel() {
    const topDoc = getTopDocumentSafe();
    if (topDoc.getElementById(`${CLASS_PREFIX}-panel-overlay`)) return;

    const overlayId = `${CLASS_PREFIX}-panel-overlay`;
    const panelId = `${CLASS_PREFIX}-panel`;

    const previousBodyOverflow = topDoc.body.style.overflow;

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
    panel.id = panelId;
    panel.style.cssText = `
      width: 540px; max-width: calc(100vw - 24px);
      background: #ffffff; color: #0f172a;
      border-radius: 14px;
      box-shadow: 0 24px 70px rgba(2, 6, 23, .30);
      border: 1px solid #dbe3ef;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      transform: translateY(6px) scale(.985);
      opacity: .96;
      transition: transform .16s ease, opacity .16s ease;
    `;

    const scopedStyle = topDoc.createElement("style");
    scopedStyle.textContent = `
      #${overlayId} button,
      #${overlayId} input,
      #${overlayId} label,
      #${overlayId} span,
      #${overlayId} div {
        text-indent: 0 !important;
        letter-spacing: normal !important;
        text-transform: none !important;
        line-height: 1.25 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
      }

      #${overlayId} button {
        cursor: pointer;
        border-radius: 8px;
        font-size: 14px !important;
        font-weight: 500 !important;
        padding: 7px 11px;
        min-width: 86px;
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
        font-size: 16px !important;
        line-height: 1 !important;
        padding: 0 !important;
      }

      #${overlayId} input[type="date"] {
        width: 100%;
        padding: 8px 10px !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 8px !important;
        color: #0f172a !important;
        background: #fff !important;
        font-size: 14px !important;
      }
    `;

    const fixed = getStoredFixedDate();
    const filterDateStored = getStoredFilterDate();
    const today = new Date();
    const todayYMD = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
    const filterDateInitial = filterDateStored || fixed || todayYMD;

    panel.innerHTML = `
      <div style="padding:14px 16px; background:linear-gradient(135deg,#0f3e75,#1f5ca4); color:#fff;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div>
            <div style="font-size:16px; font-weight:700; line-height:1.2;">Prazos do Projudi</div>
            <div style="font-size:12px; opacity:.9; margin-top:2px;">Destaque e filtro de vencimentos</div>
          </div>
          <button id="${CLASS_PREFIX}-close-top" class="btn-icon" aria-label="Fechar">×</button>
        </div>
      </div>

      <div style="padding:16px; background:#fff;">
        <label style="display:block; padding:12px; border:1px solid #e5e7eb; border-radius:10px; margin-bottom:10px;">
          <div style="font-weight:600; color:#0f172a;">Data fixa (realce persistente)</div>
          <div style="font-size:12px; color:#64748b; margin-top:2px;">
            Mantem essa data sempre destacada, independentemente da janela de ${WINDOW_DAYS} dias.
          </div>
          <div style="display:flex; gap:8px; align-items:center; margin-top:10px;">
            <input id="${CLASS_PREFIX}-date-input" type="date" value="${fixed || ""}" />
            <button id="${CLASS_PREFIX}-save-fixed" class="btn-primary">Salvar</button>
            <button id="${CLASS_PREFIX}-clear-fixed" class="btn-ghost">Limpar</button>
          </div>
        </label>

        <label style="display:block; padding:12px; border:1px solid #e5e7eb; border-radius:10px;">
          <div style="font-weight:600; color:#0f172a;">Filtro da tabela (data exata)</div>
          <div style="font-size:12px; color:#64748b; margin-top:2px;">
            Exibe apenas linhas com "Data Limite" ou "Possivel Data Limite" na data escolhida.
          </div>
          <div style="display:flex; gap:8px; align-items:center; margin-top:10px;">
            <input id="${CLASS_PREFIX}-filter-date" type="date" value="${filterDateInitial}" />
            <button id="${CLASS_PREFIX}-apply-filter" class="btn-primary">Aplicar</button>
            <button id="${CLASS_PREFIX}-clear-filter" class="btn-ghost">Limpar</button>
          </div>
        </label>

        <div id="${CLASS_PREFIX}-status" style="font-size:12px; color:#334155; margin-top:12px;"></div>
        <div style="font-size:12px; color:#64748b; margin-top:6px;">
          O destaque automatico continua em hoje + proximos ${WINDOW_DAYS - 1} dias.
        </div>
      </div>

      <div style="display:flex; gap:8px; justify-content:flex-end; padding:12px 16px; border-top:1px solid #e5e7eb; background:#f8fafc;">
        <button id="${CLASS_PREFIX}-close-bottom" class="btn-ghost">Fechar</button>
      </div>
    `;

    overlay.appendChild(scopedStyle);
    overlay.appendChild(panel);
    topDoc.body.appendChild(overlay);
    topDoc.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      panel.style.transform = "translateY(0) scale(1)";
      panel.style.opacity = "1";
    });

    const $ = (id) => topDoc.getElementById(id);
    const statusEl = $(`${CLASS_PREFIX}-status`);
    const setStatus = (msg) => {
      if (statusEl) statusEl.textContent = msg || "";
    };

    function refreshStatus() {
      const fixedY = getStoredFixedDate();
      const fixedD = fixedY ? ymdToDate(fixedY) : null;
      const fEnabled = getStoredFilterEnabled();
      const fY = getStoredFilterDate();
      const fD = fY ? ymdToDate(fY) : null;

      const parts = [];
      parts.push(
        fixedD
          ? `Data fixa: ${pad2(fixedD.getDate())}/${pad2(fixedD.getMonth() + 1)}/${fixedD.getFullYear()}`
          : "Data fixa: desativada"
      );
      parts.push(
        fEnabled && fD
          ? `Filtro: ativo em ${pad2(fD.getDate())}/${pad2(fD.getMonth() + 1)}/${fD.getFullYear()}`
          : "Filtro: desativado"
      );

      setStatus(parts.join(" | "));
    }

    const escClose = (ev) => {
      if (ev.key === "Escape") closePanel();
    };

    function closePanel() {
      topDoc.removeEventListener("keydown", escClose);
      topDoc.body.style.overflow = previousBodyOverflow;
      overlay.remove();
    }

    $(`${CLASS_PREFIX}-close-top`).addEventListener("click", closePanel);
    $(`${CLASS_PREFIX}-close-bottom`).addEventListener("click", closePanel);

    $(`${CLASS_PREFIX}-save-fixed`).addEventListener("click", () => {
      const v = $(`${CLASS_PREFIX}-date-input`).value || "";
      const d = v ? ymdToDate(v) : null;
      if (!d) return setStatus("Data fixa invalida. Use o seletor de data.");
      setStoredFixedDate(v);
      rebuildStateAndRehighlight();
      refreshStatus();
    });

    $(`${CLASS_PREFIX}-clear-fixed`).addEventListener("click", () => {
      clearStoredFixedDate();
      $(`${CLASS_PREFIX}-date-input`).value = "";
      rebuildStateAndRehighlight();
      refreshStatus();
    });

    $(`${CLASS_PREFIX}-apply-filter`).addEventListener("click", () => {
      const ymd = $(`${CLASS_PREFIX}-filter-date`).value || "";
      const d = ymdToDate(ymd);
      if (!d) return setStatus("Filtro: selecione uma data valida.");
      setStoredFilterDate(ymd);
      setStoredFilterEnabled(true);
      applyDeadlineFilter(document);
      refreshStatus();
    });

    $(`${CLASS_PREFIX}-clear-filter`).addEventListener("click", () => {
      setStoredFilterEnabled(false);
      clearStoredFilterDate();
      applyDeadlineFilter(document);
      refreshStatus();
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePanel();
    });

    topDoc.addEventListener("keydown", escClose);
    refreshStatus();
  }

  const MENU_STATE_KEY = "__tm_hl7d_menu_state_v2";

  function getTopWindowSafe() {
    try {
      return window.top || window;
    } catch {
      return window;
    }
  }

  function ensureMenuCommand() {
    if (!IS_TOP) return;
    if (typeof GM_registerMenuCommand !== "function") return;

    const topWin = getTopWindowSafe();
    const state = (topWin[MENU_STATE_KEY] ||= { id: null });

    try {
      if (state.id !== null && typeof GM_unregisterMenuCommand === "function") {
        GM_unregisterMenuCommand(state.id);
      }
    } catch {}

    try {
      state.id = GM_registerMenuCommand("Abrir Painel", openPanel);
    } catch {}
  }

  if (IS_TOP) {
    ensureMenuCommand();
    window.addEventListener("pageshow", ensureMenuCommand);
    window.addEventListener("focus", ensureMenuCommand);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) ensureMenuCommand();
    });
    setInterval(() => {
      if (!document.hidden) ensureMenuCommand();
    }, 15000);
  }

  let BULK_LOADING = false;
  window.addEventListener("projudi:bulk-load-start", () => {
    BULK_LOADING = true;
  });
  window.addEventListener("projudi:bulk-load-end", () => {
    BULK_LOADING = false;
    rebuildStateAndRehighlight();
  });

  ensureWeekdayDynamicClasses();
  walkAndHighlight(document.body);
  applyDeadlineFilter(document);

  const pendingRoots = new Set();
  let flushTimer = 0;

  function scheduleProcess(root) {
    if (BULK_LOADING) return;

    const effectiveRoot = root && root.nodeType === Node.ELEMENT_NODE ? root : document.body;
    pendingRoots.add(effectiveRoot);

    if (flushTimer) return;
    flushTimer = window.setTimeout(() => {
      flushTimer = 0;
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();

      for (const r of roots) {
        walkAndHighlight(r);
        applyDeadlineFilter(r);
      }
    }, 80);
  }

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const p = node.parentNode;
          if (!isSkippable(p)) scheduleProcess(p);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (!isSkippable(node)) scheduleProcess(node);
        }
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  let lastYMD = `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-${pad2(new Date().getDate())}`;
  let lastSnapshot = JSON.stringify({
    fixed: getStoredFixedDate(),
    filterDate: getStoredFilterDate(),
    filterEnabled: getStoredFilterEnabled(),
  });

  setInterval(() => {
    const now = new Date();
    const ymd = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

    const snapshot = JSON.stringify({
      fixed: getStoredFixedDate(),
      filterDate: getStoredFilterDate(),
      filterEnabled: getStoredFilterEnabled(),
    });

    const dayChanged = ymd !== lastYMD;
    const settingsChanged = snapshot !== lastSnapshot;

    if (dayChanged || settingsChanged) {
      lastYMD = ymd;
      rebuildStateAndRehighlight();
    }

    lastSnapshot = snapshot;
  }, 5 * 1000);
})();