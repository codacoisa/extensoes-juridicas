// ==UserScript==
// @name         Projudi - Highlighter Global
// @namespace    projudi-highlighter.user.js
// @version      3.4
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

  // =========================
  // 1) Configuração geral
  // =========================

  // Classe aplicada nos spans destacados para poder localizar/remover depois.
  const HIGHLIGHT_CLASS = "__vini_domain_highlight__";

  // Chaves de persistência (armazenadas pelo gerenciador de userscripts).
  const KEY_GLOBAL = "hl:global_terms";
  const KEY_HIGHLIGHT_COLOR = "hl:highlight_color";
  const KEY_TEXT_COLOR = "hl:text_color";
  const KEY_BOLD = "hl:text_bold";

  // Mínimo de caracteres para aceitar um termo.
  const MIN_LEN = 3;

  // Defaults de personalização.
  const DEFAULT_HIGHLIGHT_COLOR = "#C5E1A5FF"; // RGBA em hex (inclui alpha no final)
  const DEFAULT_TEXT_COLOR = "#000000";

  // Preferências carregadas do storage.
  let highlightColor = DEFAULT_HIGHLIGHT_COLOR;
  let textColor = DEFAULT_TEXT_COLOR;
  let textBold = false;

  // Estado do painel (aberto/fechado).
  let panelOpen = false;

  // =========================
  // 2) Utilitários de texto
  // =========================

  // Remove pontuação periférica (ajuda a normalizar termos).
  const stripPeripheralPunct = (s) =>
    s.replace(/^[\s'".,;:!?()\[\]{}-]+|[\s'".,;:!?()\[\]{}-]+$/g, "");

  // Remove diacríticos (acentos) para comparação canônica.
  const toNoDiacritics = (s) => {
    try {
      return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch {
      return s;
    }
  };

  // Colapsa múltiplos espaços e aparas nas extremidades.
  const collapseSpaces = (s) => String(s || "").replace(/\s+/g, " ").trim();

  // Normalização “canônica” para deduplicar/comparar termos.
  const norm = (s) =>
    toNoDiacritics(collapseSpaces(stripPeripheralPunct(String(s || "")))).toLowerCase();

  // Conta caracteres úteis (após colapsar espaços).
  const charCount = (s) => collapseSpaces(String(s || "")).length;

  // Escapa texto para uso seguro em RegExp.
  const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // =========================
  // 3) Storage: termos globais
  // =========================

  // Carrega termos, normaliza e deduplica.
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

  // Salva lista de termos como está (use setBulkTerms para normalização forte).
  async function saveTerms(terms) {
    await GM.setValue(KEY_GLOBAL, terms);
  }

  // Adiciona termo (com dedup canônico).
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

  // Remove termo por versão canônica.
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

  // Substitui a lista por outra (normalizando e deduplicando).
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

  // =========================
  // 4) Storage: preferências (cor/estilo)
  // =========================

  async function loadSettings() {
    try {
      const hc = await GM.getValue(KEY_HIGHLIGHT_COLOR, DEFAULT_HIGHLIGHT_COLOR);
      highlightColor = hc && typeof hc === "string" ? hc : DEFAULT_HIGHLIGHT_COLOR;

      const tc = await GM.getValue(KEY_TEXT_COLOR, DEFAULT_TEXT_COLOR);
      textColor = tc && typeof tc === "string" ? tc : DEFAULT_TEXT_COLOR;

      const tb = await GM.getValue(KEY_BOLD, false);
      textBold = !!tb;
    } catch {
      highlightColor = DEFAULT_HIGHLIGHT_COLOR;
      textColor = DEFAULT_TEXT_COLOR;
      textBold = false;
    }
  }

  // =========================
  // 5) Motor de destaque (highlight)
  // =========================

  // Decide se deve ignorar nó pai (script/style/inputs etc).
  function shouldSkip(node) {
    const skippable = /^(SCRIPT|STYLE|NOSCRIPT|IFRAME|TEXTAREA|INPUT|SVG)$/i;
    return skippable.test(node.nodeName) || node.classList?.contains(HIGHLIGHT_CLASS);
  }

  // Itera por text nodes visíveis no DOM.
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

  // Remove spans já destacados, voltando para texto puro.
  function clearExistingHighlights(root = document.body) {
    root.querySelectorAll("." + HIGHLIGHT_CLASS).forEach((node) => {
      const p = node.parentNode;
      if (!p) return;
      p.replaceChild(document.createTextNode(node.textContent), node);
      p.normalize();
    });
  }

  // Aplica destaque para um termo específico (case-insensitive e unicode).
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
        span.style.backgroundColor = highlightColor;
        if (textColor) span.style.color = textColor;
        span.style.fontWeight = textBold ? "bold" : "normal";

        // Ajustes visuais mínimos.
        span.style.borderRadius = "2px";
        span.style.padding = "0";
        span.style.margin = "0";
        span.style.cursor = "pointer";

        // Guarda o termo original para remoção por clique.
        span.dataset.term = term;

        frag.appendChild(span);
        last = idx + match.length;
        return match;
      });

      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  // Reaplica todos os destaques.
  async function applyHighlights() {
    const terms = await loadTerms();
    clearExistingHighlights();
    if (!terms.length) return;

    // Ordena por tamanho para evitar que termos menores “quebrem” termos maiores.
    const ordered = [...terms].sort((a, b) => b.length - a.length);
    for (const t of ordered) highlightSingleTerm(t);
  }

  // =========================
  // 6) Broadcast entre frames
  // =========================

  // Em páginas com frames, pede para o topo avisar os outros frames.
  const broadcastApply = () => {
    try {
      window.top.postMessage({ type: "VINI_APPLY_HIGHLIGHTS" }, "*");
    } catch {}
  };

  // Recebe mensagem para reaplicar destaque no frame atual.
  window.addEventListener("message", (e) => {
    const d = e && e.data;
    if (d && d.type === "VINI_APPLY_HIGHLIGHTS") applyHighlights();
  });

  // =========================
  // 7) Mini toolbar "Destacar"
  // (aparece perto da seleção de texto)
  // =========================

  let toolbar, toolbarRoot;

  // Cria a toolbar (Shadow DOM) uma vez.
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
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "12px",
      padding: "6px 10px",
      border: "1px solid rgba(0,0,0,.15)",
      borderRadius: "8px",
      background: "#fff",
      boxShadow: "0 2px 10px rgba(0,0,0,.12)",
      cursor: "pointer",
      display: "none",
    });

    // Clique: adiciona o texto selecionado como termo de destaque.
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const sel = window.getSelection && window.getSelection();
      const text = sel ? String(sel.toString()).trim() : "";

      if (text && charCount(text) >= MIN_LEN) {
        const ok = await addTerm(text);
        if (ok) {
          await applyHighlights();
          broadcastApply();
        }
      }

      hideToolbar();
      if (sel) sel.removeAllRanges();
    });

    const style = document.createElement("style");
    style.textContent = `:host{all:initial} button:hover{background:#f6f6f6}`;
    root.appendChild(style);
    root.appendChild(btn);

    toolbar = btn;
    toolbarRoot = host;
  }

  // Mostra a toolbar em posição fixa.
  function showToolbarAt(x, y) {
    ensureToolbar();
    toolbar.style.position = "fixed";
    toolbar.style.left = Math.round(x) + "px";
    toolbar.style.top = Math.max(8, Math.round(y)) + "px";
    toolbar.style.display = "block";
  }

  // Esconde a toolbar.
  function hideToolbar() {
    if (toolbar) toolbar.style.display = "none";
  }

  // Reposiciona toolbar com base na seleção atual.
  function positionToolbarNearSelection() {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed) return hideToolbar();

    const txt = String(sel.toString()).trim();
    if (!txt || charCount(txt) < MIN_LEN) return hideToolbar();

    const range = sel.getRangeAt(0).cloneRange();
    const rects = range.getClientRects();
    if (!rects.length) return hideToolbar();

    const r = rects[rects.length - 1];
    showToolbarAt(r.right + 8, r.top - 8);
  }

  // Eventos para manter a toolbar coerente.
  document.addEventListener("selectionchange", positionToolbarNearSelection);
  document.addEventListener(
    "scroll",
    () => {
      const sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed && String(sel.toString()).trim() !== "") positionToolbarNearSelection();
      else hideToolbar();
    },
    { passive: true }
  );

  // Atalho de seleção (não é o painel): Ctrl+Alt+D adiciona a seleção como termo.
  // Se você quiser “zero atalhos” no script, é só remover este listener.
  document.addEventListener("keydown", async (e) => {
    if (e.ctrlKey && e.altKey && String(e.key || "").toLowerCase() === "d") {
      const sel = window.getSelection && window.getSelection();
      const text = sel ? String(sel.toString()).trim() : "";

      if (text && charCount(text) >= MIN_LEN) {
        const ok = await addTerm(text);
        if (ok) {
          await applyHighlights();
          broadcastApply();
        }
      }
    }
  });

  // =========================
  // 8) Popover "Remover"
  // (clique em termo destacado mostra botão Remover)
  // =========================

  let pop, popRoot, currentCanonical = null;

  // Cria o popover (Shadow DOM) uma vez.
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
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "12px",
      padding: "6px 8px",
      border: "1px solid rgba(0,0,0,.15)",
      borderRadius: "8px",
      background: "#fff",
      boxShadow: "0 2px 10px rgba(0,0,0,.12)",
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
    });

    // Clique: remove o termo (por forma canônica) e reaplica destaques.
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

  // Mostra o popover perto do elemento clicado.
  function showPopAt(x, y, canonicalTerm) {
    ensurePop();
    currentCanonical = canonicalTerm;

    pop.style.position = "fixed";
    pop.style.left = Math.round(x) + "px";
    pop.style.top = Math.max(8, Math.round(y)) + "px";
    pop.style.display = "block";
  }

  // Esconde popover.
  function hidePop() {
    if (pop) pop.style.display = "none";
    currentCanonical = null;
  }

  // Captura clique: se clicou em um span destacado, abre popover; caso contrário, fecha.
  document.addEventListener(
    "click",
    (e) => {
      // Se o clique foi dentro do popover, não fecha.
      if (popRoot) {
        const path = e.composedPath ? e.composedPath() : null;
        if (path && path.indexOf(popRoot) !== -1) return;
      }

      const t = e.target;

      if (t && t.classList && t.classList.contains(HIGHLIGHT_CLASS)) {
        const rect = t.getBoundingClientRect();
        const canonical = t.dataset.term || t.textContent;
        showPopAt(rect.right + 6, rect.top - 6, canonical);

        e.stopPropagation();
        e.preventDefault();
        return;
      }

      hidePop();
    },
    true
  );

  // =========================
  // 9) Painel (menu/config)
  // =========================

  let panelHost, panelRoot;

  // Cria o painel (Shadow DOM) uma vez.
  function ensurePanel() {
    if (panelRoot) return;

    panelHost = document.createElement("div");
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
      width: "380px",
      maxHeight: "70vh",
      overflow: "auto",
      background: "#fdfdfd",
      border: "1px solid #ccc",
      borderRadius: "12px",
      boxShadow: "0 6px 16px rgba(0, 0, 0, .12)",
      padding: "12px",
      display: "none",
    });

    // HTML do painel: lista termos e permite importar/exportar/configurar estilo.
    wrap.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div style="font: 600 14px system-ui,-apple-system,sans-serif;">Destaques (globais)</div>
        <button id="vini-close" style="cursor:pointer;border:none;background:transparent;font-size:14px;">✕</button>
      </div>

      <div style="margin-top:10px; display:flex; gap:8px;">
        <input id="vini-add-input" placeholder="Novo termo..." style="flex:1; padding:8px; border:1px solid #ddd; border-radius:8px;">
        <button id="vini-add-btn" style="padding:8px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer;">Adicionar</button>
      </div>

      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
        <button id="vini-add-sel-btn" style="padding:8px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer;">Adicionar + Seleção</button>
        <button id="vini-remove-selected" style="padding:8px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer;">Remover selecionados</button>
        <button id="vini-clear-all" style="padding:8px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer;">Limpar tudo</button>
      </div>

      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <button id="vini-export" style="padding:8px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer;">Exportar JSON</button>
        <button id="vini-import" style="padding:8px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer;">Importar JSON</button>
      </div>

      <div id="vini-import-area" style="margin-top:10px; display:none;">
        <textarea id="vini-import-text" style="width:100%; height:140px; padding:8px; border:1px solid #ddd; border-radius:8px;" placeholder='Cole um JSON: ["termo 1", "termo 2"]'></textarea>
        <div style="margin-top:8px; display:flex; gap:8px; justify-content:flex-end;">
          <button id="vini-import-apply" style="padding:8px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer;">Aplicar importação</button>
          <button id="vini-import-cancel" style="padding:8px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer;">Cancelar</button>
        </div>
      </div>

      <div style="margin-top:12px; padding-top:10px; border-top:1px solid #eee;">
        <div style="font: 600 13px system-ui,-apple-system,sans-serif; margin-bottom:6px;">Personalização</div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <label style="font: 12px system-ui,-apple-system,sans-serif;">Cor destaque:
            <input id="vini-hl-color" type="color" />
          </label>
          <label style="font: 12px system-ui,-apple-system,sans-serif;">Cor do texto:
            <input id="vini-text-color" type="color" />
          </label>
          <label style="font: 12px system-ui,-apple-system,sans-serif;">Negrito
            <input id="vini-bold-toggle" type="checkbox" />
          </label>
        </div>
      </div>

      <div style="margin-top:12px;">
        <div id="vini-list" style="display:flex; flex-direction:column; gap:6px;"></div>
      </div>
    `;

    // CSS interno do painel (no shadow root).
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      #vini-list .item {
        display:flex; align-items:center; gap:8px;
        border:1px solid #ddd; border-radius:8px;
        padding:6px 8px; background:#fafafa;
      }
      #vini-list .item:hover { background:#f2f2f2; }
      #vini-list .term { flex:1; font: 13px system-ui,-apple-system,sans-serif; }
      #vini-list .rm { border:none; background:transparent; color:#c00; cursor:pointer }
      #vini-list input[type="checkbox"] { width:16px; height:16px; }
      button:hover { filter: brightness(0.96); }
    `;

    panelRoot.appendChild(style);
    panelRoot.appendChild(wrap);

    // Helper para buscar elementos dentro do shadow root.
    const $ = (id) => panelRoot.getElementById(id);
    const listEl = $("vini-list");
    const addInput = $("vini-add-input");

    // Fecha painel.
    $("vini-close").onclick = () => togglePanel(false);

    // Adiciona termo pelo input.
    $("vini-add-btn").onclick = async () => {
      const value = addInput.value.trim();
      if (value && value.length >= MIN_LEN) {
        if (await addTerm(value)) {
          addInput.value = "";
          await refreshList();
          await applyHighlights();
          broadcastApply();
        }
      }
    };

    // Adiciona o termo a partir da seleção atual.
    $("vini-add-sel-btn").onclick = async () => {
      const sel = window.getSelection && window.getSelection();
      const text = sel ? String(sel.toString()).trim() : "";
      if (text && text.length >= MIN_LEN) {
        if (await addTerm(text)) {
          await refreshList();
          await applyHighlights();
          broadcastApply();
        }
      }
    };

    // Remove termos marcados (checkbox) na lista.
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

    // Limpa todos os termos.
    $("vini-clear-all").onclick = async () => {
      await saveTerms([]);
      await refreshList();
      await applyHighlights();
      broadcastApply();
    };

    // Exporta lista como JSON (download).
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

    // Abre área de importação.
    $("vini-import").onclick = () => {
      $("vini-import-area").style.display = "block";
    };

    // Cancela importação.
    $("vini-import-cancel").onclick = () => {
      $("vini-import-text").value = "";
      $("vini-import-area").style.display = "none";
    };

    // Aplica importação JSON.
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

    // Controles de personalização: cor do destaque, cor do texto e negrito.
    const hlInput = $("vini-hl-color");
    const txtInput = $("vini-text-color");
    const boldInput = $("vini-bold-toggle");

    if (hlInput) {
      try {
        hlInput.value = (highlightColor || DEFAULT_HIGHLIGHT_COLOR).slice(0, 7);
      } catch {}

      hlInput.addEventListener("input", async (ev) => {
        const val = ev.target.value;

        // Mantém alpha (se existir) e troca a cor base.
        const alpha = highlightColor && highlightColor.length > 7 ? highlightColor.slice(7) : "";
        highlightColor = val + alpha;

        await GM.setValue(KEY_HIGHLIGHT_COLOR, highlightColor);
        await applyHighlights();
        broadcastApply();
      });
    }

    if (txtInput) {
      try {
        txtInput.value = (textColor || DEFAULT_TEXT_COLOR).slice(0, 7);
      } catch {}

      txtInput.addEventListener("input", async (ev) => {
        textColor = ev.target.value;

        await GM.setValue(KEY_TEXT_COLOR, textColor);
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

    // Renderiza a lista de termos no painel.
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

    // Expõe refreshList para o togglePanel.
    wrap._refreshList = refreshList;
  }

  // Abre/fecha painel e sincroniza UI.
  async function togglePanel(on) {
    ensurePanel();
    const panel = panelRoot.getElementById("vini-panel");

    if (on) {
      await panel._refreshList();

      // Re-sincroniza controles de UI ao abrir.
      try {
        const hlInput = panelRoot.getElementById("vini-hl-color");
        if (hlInput) hlInput.value = (highlightColor || DEFAULT_HIGHLIGHT_COLOR).slice(0, 7);

        const txtInput = panelRoot.getElementById("vini-text-color");
        if (txtInput) txtInput.value = (textColor || DEFAULT_TEXT_COLOR).slice(0, 7);

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

  // =========================
  // 10) Menu da extensão (abre/fecha painel)
  // =========================

  // Registra item no menu do gerenciador de userscripts:
  // - Violentmonkey/Tampermonkey modernos: GM.registerMenuCommand
  // - Tampermonkey antigo: GM_registerMenuCommand
  function registerExtensionMenu() {
    const fn = () => togglePanel(!panelOpen);

    if (typeof GM !== "undefined" && typeof GM.registerMenuCommand === "function") {
      GM.registerMenuCommand("Abrir/Fechar painel (Highlighter)", fn);
      return;
    }

    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("Abrir/Fechar painel (Highlighter)", fn);
    }
  }

  // =========================
  // 11) Boot + observadores
  // =========================

  (async function init() {
    // Carrega preferências antes de aplicar destaques.
    await loadSettings();

    // Aplica destaques inicialmente.
    await applyHighlights();

    // Registra o item no menu da extensão.
    registerExtensionMenu();

    // Observa mudanças de DOM (Projudi é muito dinâmico) e reaplica.
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

    // Detecta navegação SPA (pushState/replaceState/popstate) e reaplica.
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
  })();
})();