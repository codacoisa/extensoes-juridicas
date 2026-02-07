// ==UserScript==
// @name         Projudi - Highlighter Global
// @namespace    projudi-highlighter.user.js
// @version      3.8
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
// @grant        GM.registerMenuCommand
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  "use strict";

  // =========================================================
  // 1) CONFIG GERAL
  // =========================================================

  // Classe aplicada nos spans destacados para localizar/remover depois.
  const HIGHLIGHT_CLASS = "__vini_domain_highlight__";

  // Chaves de persistência (armazenadas pelo gerenciador de userscripts).
  const KEY_GLOBAL = "hl:global_terms";
  const KEY_HIGHLIGHT_COLOR = "hl:highlight_color";
  const KEY_TEXT_COLOR = "hl:text_color";
  const KEY_BOLD = "hl:text_bold";
  const KEY_ITALIC = "hl:text_italic";

  // Tamanho mínimo de termo.
  const MIN_LEN = 3;

  // Defaults.
  const DEFAULT_HIGHLIGHT_COLOR = "#C5E1A5FF"; // RGBA em hex (alpha no final)
  const DEFAULT_TEXT_COLOR = "#111111";

  // Preferências carregadas do storage.
  let highlightColor = DEFAULT_HIGHLIGHT_COLOR;
  let textColor = DEFAULT_TEXT_COLOR;
  let textBold = false;
  let textItalic = false;

  // Estado do painel (somente no top window).
  let panelOpen = false;

  // Flags de execução
  const IS_TOP = (() => {
    try {
      return window.top === window;
    } catch {
      return false;
    }
  })();

  // =========================================================
  // 2) UTILITÁRIOS DE TEXTO
  // =========================================================

  // Remove pontuação periférica.
  const stripPeripheralPunct = (s) =>
    s.replace(/^[\s'".,;:!?()\[\]{}-]+|[\s'".,;:!?()\[\]{}-]+$/g, "");

  // Remove diacríticos para comparação canônica.
  const toNoDiacritics = (s) => {
    try {
      return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch {
      return s;
    }
  };

  // Colapsa múltiplos espaços.
  const collapseSpaces = (s) => String(s || "").replace(/\s+/g, " ").trim();

  // Normalização “canônica” para dedup e comparação.
  const norm = (s) =>
    toNoDiacritics(collapseSpaces(stripPeripheralPunct(String(s || "")))).toLowerCase();

  const charCount = (s) => collapseSpaces(String(s || "")).length;

  // Escapa para RegExp.
  const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Converte #RRGGBBAA para rgba() CSS.
  function cssColorFromHexRgba(hex) {
    const h = String(hex || "").trim();
    if (!/^#[0-9a-fA-F]{8}$/.test(h)) return h || DEFAULT_HIGHLIGHT_COLOR;
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    const a = parseInt(h.slice(7, 9), 16) / 255;
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
  }

  // =========================================================
  // 3) STORAGE: TERMOS GLOBAIS
  // =========================================================

  async function loadTerms() {
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
      return out;
    } catch {
      return [];
    }
  }

  async function saveTerms(terms) {
    await GM.setValue(KEY_GLOBAL, terms);
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

  // =========================================================
  // 4) STORAGE: PREFERÊNCIAS (COR/ESTILO)
  // =========================================================

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

  // =========================================================
  // 5) MOTOR DE DESTAQUE (HIGHLIGHT)
  // =========================================================

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
    root.querySelectorAll("." + HIGHLIGHT_CLASS).forEach((node) => {
      const p = node.parentNode;
      if (!p) return;
      p.replaceChild(document.createTextNode(node.textContent), node);
      p.normalize();
    });
  }

  function highlightSingleTerm(term, root = document.body) {
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

        // Preferências do usuário.
        span.style.backgroundColor = cssColorFromHexRgba(highlightColor);
        span.style.color = textColor || DEFAULT_TEXT_COLOR;
        span.style.fontWeight = textBold ? "700" : "400";
        span.style.fontStyle = textItalic ? "italic" : "normal";

        // Ajustes visuais.
        span.style.borderRadius = "3px";
        span.style.padding = "0 1px";
        span.style.margin = "0";
        span.style.cursor = "pointer";

        // Guarda o termo original (para remoção por clique).
        span.dataset.term = term;

        frag.appendChild(span);
        last = idx + match.length;
        return match;
      });

      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  async function applyHighlights() {
    const terms = await loadTerms();
    clearExistingHighlights();
    if (!terms.length) return;

    // Ordena por tamanho (evita termos menores “atrapalharem” os maiores).
    const ordered = [...terms].sort((a, b) => b.length - a.length);
    for (const t of ordered) highlightSingleTerm(t);
  }

  // =========================================================
  // 6) SYNC ENTRE FRAMES
  // =========================================================

  // Pede para todos os frames reaplicarem.
  const broadcastApply = () => {
    try {
      window.top.postMessage({ type: "VINI_APPLY_HIGHLIGHTS" }, "*");
    } catch {}
  };

  // Reaplica no frame que receber a mensagem.
  window.addEventListener("message", (e) => {
    const d = e && e.data;
    if (d && d.type === "VINI_APPLY_HIGHLIGHTS") applyHighlights();
  });

  // Comando de abrir/fechar painel (manda para o TOP).
  window.addEventListener("message", (e) => {
    const d = e && e.data;
    if (!d) return;
    if (d.type === "VINI_TOGGLE_PANEL_REQUEST" && IS_TOP) {
      togglePanelSafe();
    }
  });

  // =========================================================
  // 7) TOOLBAR "DESTACAR" (por seleção)
  // =========================================================

  let toolbar, toolbarRoot;

  // Cache do último texto selecionado válido (evita perder seleção ao clicar no botão).
  let lastSelectionText = "";
  let lastSelectionRangeRect = null;

  function ensureToolbar() {
    if (toolbarRoot) return;

    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.top = "0";
    host.style.left = "0";
    host.style.pointerEvents = "none";
    document.documentElement.appendChild(host);

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

    // Evita que o clique “roube” a seleção.
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Usa o cache (a seleção pode colapsar no clique).
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

  document.addEventListener("selectionchange", positionToolbarNearSelection);

  // Mostra imediatamente ao “terminar” a seleção (sem depender de scroll/movimento).
  document.addEventListener(
    "mouseup",
    () => {
      setTimeout(() => {
        positionToolbarNearSelection();
      }, 0);
    },
    { passive: true }
  );

  // Quando a seleção é feita via teclado (Shift+setas), também reposiciona.
  document.addEventListener(
    "keyup",
    (e) => {
      if (e && e.shiftKey) positionToolbarNearSelection();
    },
    { passive: true }
  );

  document.addEventListener(
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

  // =========================================================
  // 8) POPOVER "REMOVER" (clique no destaque)
  // =========================================================

  let pop, popRoot, currentCanonical = null;

  function ensurePop() {
    if (popRoot) return;

    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.top = "0";
    host.style.left = "0";
    host.style.pointerEvents = "none";
    document.documentElement.appendChild(host);

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

  document.addEventListener(
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

  // =========================================================
  // 9) PAINEL (SOMENTE NO TOP WINDOW)
  // =========================================================

  let panelHost, panelRoot;

  function ensurePanelTopOnly() {
    if (!IS_TOP) return;

    // Evita criar múltiplos painéis caso o script seja reinjetado.
    const existing = document.getElementById("__vini_highlighter_panel_host__");
    if (existing) {
      panelHost = existing;
      panelRoot = panelHost.shadowRoot;
      return;
    }

    panelHost = document.createElement("div");
    panelHost.id = "__vini_highlighter_panel_host__";
    panelHost.style.position = "fixed";
    panelHost.style.zIndex = "2147483647";
    panelHost.style.top = "0";
    panelHost.style.left = "0";
    panelHost.style.pointerEvents = "none";
    document.documentElement.appendChild(panelHost);

    panelRoot = panelHost.attachShadow({ mode: "open" });

    const wrap = document.createElement("div");
    wrap.id = "vini-panel";
    Object.assign(wrap.style, {
      pointerEvents: "auto",
      position: "fixed",
      right: "16px",
      bottom: "16px",
      width: "420px",
      maxWidth: "calc(100vw - 32px)",
      maxHeight: "72vh",
      overflow: "auto",
      borderRadius: "14px",
      background: "rgba(255,255,255,.98)",
      border: "1px solid rgba(0,0,0,.10)",
      boxShadow: "0 18px 50px rgba(0,0,0,.18)",
      padding: "14px",
      display: "none",
      backdropFilter: "blur(6px)",
    });

    // Layout conforme pedido.
    wrap.innerHTML = `
      <div class="hdr">
        <div class="ttl">Destaques Globais</div>
        <button id="vini-close" class="iconbtn" title="Fechar">✕</button>
      </div>

      <div class="sec">
        <div class="secTitle">Configs. Gerais</div>

        <div class="row">
          <input id="vini-add-input" class="inpt" placeholder="digite o novo termo" />
          <button id="vini-add-btn" class="btn primary">Adicionar</button>
        </div>

        <div class="row2">
          <button id="vini-add-sel-btn" class="btn">Adicionar seleção</button>
          <button id="vini-remove-selected" class="btn danger">Remover seleção</button>
        </div>

        <div class="row2">
          <button id="vini-export" class="btn">Exportar JSON</button>
          <button id="vini-import" class="btn">Importar JSON</button>
        </div>

        <div id="vini-import-area" class="importArea" style="display:none;">
          <textarea id="vini-import-text" class="ta" placeholder='Cole um JSON: ["termo 1", "termo 2"]'></textarea>
          <div class="row2 right">
            <button id="vini-import-apply" class="btn primary">Aplicar</button>
            <button id="vini-import-cancel" class="btn">Cancelar</button>
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="secTitle">Personalização</div>

        <div class="grid">
          <div class="field">
            <div class="lbl">Cor destaque</div>
            <div class="ctl">
              <input id="vini-hl-color" type="color" class="color" />
              <div id="vini-hl-preview" class="swatch" title="Cor atual"></div>
            </div>
          </div>

          <div class="field">
            <div class="lbl">Cor do texto</div>
            <div class="ctl">
              <input id="vini-text-color" type="color" class="color" />
              <div id="vini-tx-preview" class="swatch" title="Cor atual"></div>
            </div>
          </div>

          <div class="field">
            <div class="lbl">Itálico</div>
            <label class="check">
              <input id="vini-italic-toggle" type="checkbox" />
              <span>Ativar</span>
            </label>
          </div>

          <div class="field">
            <div class="lbl">Negrito</div>
            <label class="check">
              <input id="vini-bold-toggle" type="checkbox" />
              <span>Ativar</span>
            </label>
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="secTitle">Lista de destaques</div>
        <div id="vini-list" class="list"></div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }

      .hdr{
        display:flex; align-items:center; justify-content:space-between;
        margin-bottom:10px;
      }
      .ttl{
        font: 700 15px system-ui, -apple-system, Segoe UI, sans-serif;
        letter-spacing: .2px;
        color: #111;
      }
      .iconbtn{
        border:none; background:transparent; cursor:pointer;
        width:34px; height:34px; border-radius:10px;
        display:flex; align-items:center; justify-content:center;
        color:#333; font-size:14px;
      }
      .iconbtn:hover{ background: rgba(0,0,0,.06); }

      .sec{ padding:10px 10px 12px; border:1px solid rgba(0,0,0,.06); border-radius:12px; background:rgba(250,250,250,.75); }
      .sec + .sec{ margin-top:10px; }

      .secTitle{
        font: 700 12.5px system-ui, -apple-system, Segoe UI, sans-serif;
        color:#222;
        margin-bottom:8px;
      }

      .row{ display:flex; gap:8px; align-items:center; }
      .row2{ display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap; }
      .row2.right{ justify-content:flex-end; }

      .inpt{
        flex: 1;
        padding: 10px 10px;
        border: 1px solid rgba(0,0,0,.14);
        border-radius: 10px;
        outline: none;
        font: 13px system-ui, -apple-system, Segoe UI, sans-serif;
        background: rgba(255,255,255,.95);
      }
      .inpt:focus{ border-color: rgba(0,0,0,.30); }

      .btn{
        padding: 10px 12px;
        border: 1px solid rgba(0,0,0,.14);
        border-radius: 10px;
        background: rgba(255,255,255,.95);
        cursor:pointer;
        font: 600 12.5px system-ui, -apple-system, Segoe UI, sans-serif;
        color:#111;
      }
      .btn:hover{ filter: brightness(.98); }
      .btn:active{ transform: translateY(1px); }

      .btn.primary{
        background: rgba(17,17,17,.92);
        color:#fff;
        border-color: rgba(17,17,17,.92);
      }
      .btn.danger{
        background: rgba(255, 245, 245, .95);
        color:#b00020;
        border-color: rgba(176,0,32,.20);
      }

      .importArea{ margin-top:10px; }
      .ta{
        width: 100%;
        height: 140px;
        resize: vertical;
        padding: 10px 10px;
        border: 1px solid rgba(0,0,0,.14);
        border-radius: 10px;
        outline:none;
        font: 12.5px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        background: rgba(255,255,255,.95);
      }

      .grid{
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .field{
        padding: 10px;
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 12px;
        background: rgba(255,255,255,.70);
      }
      .lbl{
        font: 700 12px system-ui, -apple-system, Segoe UI, sans-serif;
        margin-bottom: 8px;
        color:#222;
      }
      .ctl{ display:flex; align-items:center; gap:10px; }
      .color{ width: 44px; height: 32px; border:none; background:transparent; padding:0; cursor:pointer; }
      .swatch{
        width: 100%;
        height: 32px;
        border-radius: 10px;
        border: 1px solid rgba(0,0,0,.10);
        background: #fff;
      }

      .check{
        display:flex; align-items:center; gap:10px;
        font: 600 12.5px system-ui, -apple-system, Segoe UI, sans-serif;
        color:#111;
        user-select:none;
      }
      .check input{ width: 18px; height: 18px; }

      .list{ display:flex; flex-direction:column; gap:8px; }
      .item{
        display:flex; align-items:center; gap:8px;
        padding: 10px 10px;
        border: 1px solid rgba(0,0,0,.10);
        border-radius: 12px;
        background: rgba(255,255,255,.92);
      }
      .item:hover{ background: rgba(255,255,255,1); }
      .term{
        flex:1;
        font: 600 13px system-ui, -apple-system, Segoe UI, sans-serif;
        color:#111;
        word-break: break-word;
      }
      .rm{
        border:none;
        background: rgba(255,245,245,.95);
        color:#b00020;
        cursor:pointer;
        padding: 8px 10px;
        border-radius: 10px;
        font: 700 12px system-ui, -apple-system, Segoe UI, sans-serif;
        border: 1px solid rgba(176,0,32,.18);
      }
      .rm:hover{ filter: brightness(.98); }
    `;

    panelRoot.appendChild(style);
    panelRoot.appendChild(wrap);

    const $ = (id) => panelRoot.getElementById(id);

    const listEl = $("vini-list");
    const addInput = $("vini-add-input");

    $("vini-close").onclick = () => togglePanel(false);

    $("vini-add-btn").onclick = async () => {
      const value = addInput.value.trim();
      if (!value || value.length < MIN_LEN) return;

      if (await addTerm(value)) {
        addInput.value = "";
        await refreshList();
        await applyHighlights();
        broadcastApply();
      }
    };

    $("vini-add-sel-btn").onclick = async () => {
      const sel = window.getSelection && window.getSelection();
      const text = sel ? String(sel.toString()).trim() : "";
      if (!text || charCount(text) < MIN_LEN) return;

      if (await addTerm(text)) {
        await refreshList();
        await applyHighlights();
        broadcastApply();
      }
    };

    $("vini-remove-selected").onclick = async () => {
      const checks = listEl.querySelectorAll('input[type="checkbox"]:checked');
      if (!checks.length) return;

      const terms = await loadTerms();
      const selectedKeys = new Set([...checks].map((c) => c.dataset.key));
      const filtered = terms.filter((t) => !selectedKeys.has(norm(t)));

      await saveTerms(filtered);
      await refreshList();
      await applyHighlights();
      broadcastApply();
    };

    $("vini-export").onclick = async () => {
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

    $("vini-import").onclick = () => {
      $("vini-import-area").style.display = "block";
    };

    $("vini-import-cancel").onclick = () => {
      $("vini-import-text").value = "";
      $("vini-import-area").style.display = "none";
    };

    $("vini-import-apply").onclick = async () => {
      try {
        const txt = $("vini-import-text").value.trim();
        const arr = JSON.parse(txt);
        if (!Array.isArray(arr)) throw new Error("JSON deve ser um array de strings");

        await setBulkTerms(arr);

        $("vini-import-text").value = "";
        $("vini-import-area").style.display = "none";

        await refreshList();
        await applyHighlights();
        broadcastApply();
      } catch (e) {
        alert("Importação falhou: " + (e && e.message ? e.message : e));
      }
    };

    // Personalização: inputs + swatches (visualização).
    const hlInput = $("vini-hl-color");
    const hlPrev = $("vini-hl-preview");
    const txInput = $("vini-text-color");
    const txPrev = $("vini-tx-preview");
    const italicInput = $("vini-italic-toggle");
    const boldInput = $("vini-bold-toggle");

    function syncSwatches() {
      if (hlPrev) hlPrev.style.background = cssColorFromHexRgba(highlightColor);
      if (txPrev) txPrev.style.background = textColor || DEFAULT_TEXT_COLOR;
    }

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
      });
    }

    if (italicInput) {
      italicInput.checked = !!textItalic;
      italicInput.addEventListener("change", async (ev) => {
        textItalic = !!ev.target.checked;

        await GM.setValue(KEY_ITALIC, textItalic);
        await applyHighlights();
        broadcastApply();
      });
    }

    if (boldInput) {
      boldInput.checked = !!textBold;
      boldInput.addEventListener("change", async (ev) => {
        textBold = !!ev.target.checked;

        await GM.setValue(KEY_BOLD, textBold);
        await applyHighlights();
        broadcastApply();
      });
    }

    async function refreshList() {
      const terms = await loadTerms();
      listEl.innerHTML = "";

      for (const t of terms) {
        const row = document.createElement("div");
        row.className = "item";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.key = norm(t);

        const span = document.createElement("div");
        span.className = "term";
        span.textContent = t;

        const rm = document.createElement("button");
        rm.className = "rm";
        rm.textContent = "Remover";
        rm.onclick = async () => {
          if (await removeByCanonical(t)) {
            await refreshList();
            await applyHighlights();
            broadcastApply();
          }
        };

        row.appendChild(cb);
        row.appendChild(span);
        row.appendChild(rm);
        listEl.appendChild(row);
      }
    }

    wrap._refreshList = refreshList;
    wrap._syncSwatches = syncSwatches;
  }

  async function togglePanel(on) {
    if (!IS_TOP) return;
    ensurePanelTopOnly();

    const panel = panelRoot.getElementById("vini-panel");
    if (!panel) return;

    if (on) {
      await panel._refreshList();
      try {
        panel._syncSwatches();

        const hlInput = panelRoot.getElementById("vini-hl-color");
        if (hlInput) hlInput.value = (highlightColor || DEFAULT_HIGHLIGHT_COLOR).slice(0, 7);

        const txInput = panelRoot.getElementById("vini-text-color");
        if (txInput) txInput.value = (textColor || DEFAULT_TEXT_COLOR).slice(0, 7);

        const italicInput = panelRoot.getElementById("vini-italic-toggle");
        if (italicInput) italicInput.checked = !!textItalic;

        const boldInput = panelRoot.getElementById("vini-bold-toggle");
        if (boldInput) boldInput.checked = !!textBold;
      } catch {}

      panel.style.display = "block";
      panelOpen = true;
    } else {
      panel.style.display = "none";
      panelOpen = false;
    }
  }

  // “Safe toggle”: evita múltiplas aberturas simultâneas quando o menu dispara em frames.
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

  // =========================================================
  // 10) MENU DA EXTENSÃO (ABRE/FECHA O PAINEL)
  // =========================================================

  function registerExtensionMenu() {
    // A ação sempre pede ao TOP para alternar.
    const fn = () => {
      try {
        window.top.postMessage({ type: "VINI_TOGGLE_PANEL_REQUEST" }, "*");
      } catch {
        if (IS_TOP) togglePanelSafe();
      }
    };

    if (typeof GM !== "undefined" && typeof GM.registerMenuCommand === "function") {
      GM.registerMenuCommand("Abrir Painel", fn);
      return;
    }
    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("Abrir Painel", fn);
    }
  }

  // =========================================================
  // 11) BOOT + OBSERVADORES
  // =========================================================

  (async function init() {
    await loadSettings();
    await applyHighlights();
    registerExtensionMenu();

    // Observa mudanças de DOM e reaplica (Projudi é dinâmico).
    const mo = new MutationObserver(() => {
      if (mo._pending) return;
      mo._pending = true;
      setTimeout(async () => {
        mo._pending = false;
        await applyHighlights();
      }, 350);
    });

    mo.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    // Detecta navegação SPA e reaplica.
    const push = history.pushState,
      replace = history.replaceState;

    history.pushState = function () {
      const ret = push.apply(this, arguments);
      window.dispatchEvent(new Event("vini-spa-change"));
      return ret;
    };
    history.replaceState = function () {
      const ret = replace.apply(this, arguments);
      window.dispatchEvent(new Event("vini-spa-change"));
      return ret;
    };

    window.addEventListener("popstate", () => window.dispatchEvent(new Event("vini-spa-change")));
    window.addEventListener("vini-spa-change", async () => {
      await applyHighlights();
    });

    // Se for TOP, prepara o painel (mas não abre).
    if (IS_TOP) ensurePanelTopOnly();
  })();
})();