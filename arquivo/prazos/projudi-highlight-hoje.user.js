// ==UserScript==
// @name         Destaque de Prazos
// @namespace    projudi-highlight-hoje.user.js
// @version      3.1
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Realça possíveis vencimentos no projudi, com cores definidas.
// @author       louencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/f9a2549211ec7a07807ce2d6a3cfd0a9/raw/projudi-highlight-hoje.user.js
// @downloadURL  https://gist.githubusercontent.com/lourencosv/f9a2549211ec7a07807ce2d6a3cfd0a9/raw/projudi-highlight-hoje.user.js
// @match        *://projudi.tjgo.jus.br/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
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

#${CLASS_PREFIX}-panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.35);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
}
#${CLASS_PREFIX}-panel {
  width: 500px;
  max-width: calc(100vw - 24px);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,.25);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  padding: 0;
  overflow: hidden;
}
#${CLASS_PREFIX}-panel .panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(0,0,0,.08);
  background: #fafafa;
}
#${CLASS_PREFIX}-panel h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
#${CLASS_PREFIX}-panel button.icon-close {
  width: 28px !important;
  height: 28px !important;
  line-height: 1 !important;
  padding: 0 !important;
  border-radius: 999px !important;
  font-size: 18px !important;
}
#${CLASS_PREFIX}-panel .panel-body {
  padding: 14px;
}
#${CLASS_PREFIX}-panel .section {
  border: 1px solid rgba(0,0,0,.1);
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 10px;
}
#${CLASS_PREFIX}-panel h4 {
  margin: 0 0 4px 0;
  font-size: 13px;
}
#${CLASS_PREFIX}-panel .row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 6px 0;
}
#${CLASS_PREFIX}-panel .row.wrap {
  flex-wrap: wrap;
}
#${CLASS_PREFIX}-panel input[type="date"] {
  flex: 1;
  min-width: 170px;
  padding: 8px !important;
  border: 1px solid rgba(0,0,0,.2) !important;
  border-radius: 8px !important;
  color: #111 !important;
  background: #fff !important;
}
#${CLASS_PREFIX}-panel button {
  padding: 8px 10px !important;
  border: 1px solid rgba(0,0,0,.18) !important;
  border-radius: 8px !important;
  background: #f7f7f7 !important;
  color: #111 !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  opacity: 1 !important;
  filter: none !important;
}
#${CLASS_PREFIX}-panel button.primary {
  background: #111 !important;
  color: #fff !important;
  border-color: #111 !important;
}
#${CLASS_PREFIX}-panel button:disabled {
  background: #eee !important;
  color: rgba(0,0,0,.55) !important;
  border-color: rgba(0,0,0,.15) !important;
  cursor: not-allowed !important;
}

#${CLASS_PREFIX}-panel .status {
  font-size: 12px;
  margin-top: 8px;
  color: rgba(0,0,0,.8);
}

#${CLASS_PREFIX}-panel .hint {
  font-size: 12px;
  color: rgba(0,0,0,.7);
  line-height: 1.35;
  margin-top: 4px;
  text-align: justify;
  text-justify: inter-word;
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

    const overlay = topDoc.createElement("div");
    overlay.id = `${CLASS_PREFIX}-panel-overlay`;

    const panel = topDoc.createElement("div");
    panel.id = `${CLASS_PREFIX}-panel`;

    const fixed = getStoredFixedDate();
    const filterDateStored = getStoredFilterDate();
    const filterDateInitial =
      filterDateStored || fixed || `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-${pad2(new Date().getDate())}`;

    panel.innerHTML = `
      <div class="panel-head">
        <h3>PROJUDI • PRAZOS</h3>
        <button class="icon-close" id="${CLASS_PREFIX}-close" title="Fechar painel" aria-label="Fechar painel">×</button>
      </div>

      <div class="panel-body">
        <div class="section">
          <h4>Data fixa (realce persistente)</h4>
          <div class="hint">
            Mantem uma data sempre destacada nas tabelas, inclusive retroativa, sem depender da janela de hoje + ${WINDOW_DAYS - 1} dias.
          </div>
          <div class="row wrap">
            <input id="${CLASS_PREFIX}-date-input" type="date" value="${fixed ? fixed : ""}" />
            <button class="primary" id="${CLASS_PREFIX}-save">Salvar data fixa</button>
            <button id="${CLASS_PREFIX}-reset">Limpar</button>
          </div>
        </div>

        <div class="section">
          <h4>Filtro da tabela (somente vencendo na data)</h4>
          <div class="hint">
            Mostra apenas as linhas cuja coluna "Data Limite" ou "Possivel Data Limite" seja exatamente a data escolhida.
            Ao aplicar, o filtro fica ativo ate voce limpar.
          </div>
          <div class="row wrap">
            <input id="${CLASS_PREFIX}-filter-date" type="date" value="${filterDateInitial}" />
            <button class="primary" id="${CLASS_PREFIX}-filter-apply">Aplicar filtro</button>
            <button id="${CLASS_PREFIX}-filter-clear">Limpar filtro</button>
          </div>
        </div>

        <div class="status" id="${CLASS_PREFIX}-status"></div>
        <div class="hint">
          Destaque automatico: hoje + proximos ${WINDOW_DAYS - 1} dias (total ${WINDOW_DAYS}).
        </div>
      </div>
    `;

    overlay.appendChild(panel);
    topDoc.body.appendChild(overlay);

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
      if (fixedD) parts.push(`Data fixa: ${pad2(fixedD.getDate())}/${pad2(fixedD.getMonth() + 1)}/${fixedD.getFullYear()}`);
      else parts.push("Data fixa: desativada");

      if (fEnabled && fD) parts.push(`Filtro: ativo em ${pad2(fD.getDate())}/${pad2(fD.getMonth() + 1)}/${fD.getFullYear()}`);
      else parts.push("Filtro: desativado");

      setStatus(parts.join(" | "));
    }

    $(`${CLASS_PREFIX}-close`).addEventListener("click", () => overlay.remove());

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    $(`${CLASS_PREFIX}-save`).addEventListener("click", () => {
      const v = $(`${CLASS_PREFIX}-date-input`).value || "";
      const d = v ? ymdToDate(v) : null;
      if (!d) {
        setStatus("Data fixa invalida. Use o seletor de data.");
        return;
      }
      setStoredFixedDate(v);
      rebuildStateAndRehighlight();
      refreshStatus();
    });

    $(`${CLASS_PREFIX}-reset`).addEventListener("click", () => {
      clearStoredFixedDate();
      $(`${CLASS_PREFIX}-date-input`).value = "";
      rebuildStateAndRehighlight();
      refreshStatus();
    });

    $(`${CLASS_PREFIX}-filter-apply`).addEventListener("click", () => {
      const ymd = $(`${CLASS_PREFIX}-filter-date`).value || "";
      const d = ymdToDate(ymd);

      if (!d) {
        setStatus("Filtro: selecione uma data valida.");
        return;
      }

      setStoredFilterDate(ymd);
      setStoredFilterEnabled(true);
      applyDeadlineFilter(document);
      refreshStatus();
    });

    $(`${CLASS_PREFIX}-filter-clear`).addEventListener("click", () => {
      setStoredFilterEnabled(false);
      clearStoredFilterDate();
      applyDeadlineFilter(document);
      refreshStatus();
    });

    refreshStatus();
  }

  // Correção: registra o menu apenas no frame principal (top),
  // evitando perda intermitente quando iframes recarregam.
  if (typeof GM_registerMenuCommand === "function" && IS_TOP) {
    GM_registerMenuCommand("Abrir Painel", openPanel);
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