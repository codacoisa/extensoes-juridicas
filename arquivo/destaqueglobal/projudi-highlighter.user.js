// ==UserScript==
// @name         Projudi - Highlighter Global
// @namespace    projudi-highlighter.user.js
// @version      3.3
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Destaque global, com painel configurável (Ctrl+Shift+H).
// @author       louencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/a00fdc30f88d7212261dac4397bff07f/raw
// @downloadURL  https://gist.githubusercontent.com/lourencosv/a00fdc30f88d7212261dac4397bff07f/raw
// @match        *://projudi.tjgo.jus.br/*
// @run-at       document-end
// @inject-into  content
// @all-frames   true
// @grant        GM.getValue
// @grant        GM.setValue
// ==/UserScript==

(function () {
  "use strict";

  // ========= Config =========
  const HIGHLIGHT_CLASS = "__vini_domain_highlight__";
  // Cor de destaque padrão (RGBA). Mantida para retrocompatibilidade e usada como fallback.
  const HIGHLIGHT_COLOR = "#C5E1A5FF";
  const KEY_GLOBAL = "hl:global_terms";
  const MIN_LEN = 3;

  // ========= Novos parâmetros de personalização =========
  // Cor padrão de destaque e texto.  A cor de destaque inclui canal alfa.
  const DEFAULT_HIGHLIGHT_COLOR = HIGHLIGHT_COLOR;
  const DEFAULT_TEXT_COLOR = "#000000";
  // Chaves para armazenar preferências no armazenamento da extensão.
  const KEY_HIGHLIGHT_COLOR = "hl:highlight_color";
  const KEY_TEXT_COLOR = "hl:text_color";
  const KEY_BOLD = "hl:text_bold";

  // ========= Configuração do atalho do painel =========
  // Valor padrão para o atalho de abertura do painel.  Por padrão Ctrl+Shift+H.
  const DEFAULT_PANEL_SHORTCUT = { ctrl: true, shift: true, alt: false, key: "h" };
  // Chave para persistir o atalho personalizado do painel.
  const KEY_PANEL_SHORTCUT = "hl:panel_shortcut";
  // Objeto em memória refletindo o atalho configurado pelo usuário.
  // Será carregado em init() via loadShortcut().
  let panelShortcut = DEFAULT_PANEL_SHORTCUT;

  // Variáveis em memória para refletir as preferências do usuário.  São carregadas
  // em init() e atualizadas via painel de configuração.
  let highlightColor = DEFAULT_HIGHLIGHT_COLOR;
  let textColor = DEFAULT_TEXT_COLOR;
  let textBold = false;

  let panelOpen = false;

  // ========= Utils =========
  const stripPeripheralPunct = s => s.replace(/^[\s'".,;:!?()\[\]{}-]+|[\s'".,;:!?()\[\]{}-]+$/g, "");
  const toNoDiacritics = s => { try { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch { return s; } };
  const collapseSpaces = s => s.replace(/\s+/g, " ").trim();
  const norm = s => toNoDiacritics(collapseSpaces(stripPeripheralPunct(String(s || "")))).toLowerCase();
  const charCount = s => collapseSpaces(String(s || "")).length;
  const escapeRegExp = str => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // ========= Storage =========
  async function loadTerms() {
    try {
      const raw = await GM.getValue(KEY_GLOBAL, []);
      const arr = Array.isArray(raw) ? raw : [];
      const seen = new Set(); const out = [];
      for (const t of arr) {
        const s = collapseSpaces(String(t || ""));
        if (!s || s.length < MIN_LEN) continue;
        const k = norm(s);
        if (!seen.has(k)) { seen.add(k); out.push(s); }
      }
      return out;
    } catch { return []; }
  }
  async function saveTerms(terms) { await GM.setValue(KEY_GLOBAL, terms); }
  async function addTerm(term) {
    const t = collapseSpaces(String(term || ""));
    if (!t || t.length < MIN_LEN) return false;
    const terms = await loadTerms();
    const key = norm(t);
    if (!terms.some(x => norm(x) === key)) { terms.push(t); await saveTerms(terms); return true; }
    return false;
  }
  async function removeByCanonical(canonicalTerm) {
    const terms = await loadTerms();
    const key = norm(canonicalTerm);
    const filtered = terms.filter(x => norm(x) !== key);
    if (filtered.length !== terms.length) { await saveTerms(filtered); return true; }
    return false;
  }
  async function setBulkTerms(newTermsArray) {
    const seen = new Set(); const out = [];
    for (const t of newTermsArray || []) {
      const s = collapseSpaces(String(t || ""));
      if (!s || s.length < MIN_LEN) continue;
      const k = norm(s);
      if (!seen.has(k)) { seen.add(k); out.push(s); }
    }
    await saveTerms(out); return out;
  }

  // ========= Carregamento de preferências de cor e estilo =========
  /**
   * Carrega as configurações persistidas de cor de destaque, cor de texto e
   * negrito a partir do armazenamento da extensão.  Se não houver nada
   * persistido, utiliza os valores padrão.  Esta função deve ser
   * invocada antes de aplicar destaques para que o motor utilize as
   * preferências carregadas.
   */
  async function loadSettings() {
    try {
      const hc = await GM.getValue(KEY_HIGHLIGHT_COLOR, DEFAULT_HIGHLIGHT_COLOR);
      if (hc && typeof hc === "string") highlightColor = hc;
      else highlightColor = DEFAULT_HIGHLIGHT_COLOR;
      const tc = await GM.getValue(KEY_TEXT_COLOR, DEFAULT_TEXT_COLOR);
      if (tc && typeof tc === "string") textColor = tc;
      else textColor = DEFAULT_TEXT_COLOR;
      const tb = await GM.getValue(KEY_BOLD, false);
      textBold = !!tb;
    } catch {
      // Em caso de falha no carregamento, volta aos valores padrão
      highlightColor = DEFAULT_HIGHLIGHT_COLOR;
      textColor = DEFAULT_TEXT_COLOR;
      textBold = false;
    }
  }

  /**
   * Carrega o atalho do painel a partir do armazenamento.  Se não houver
   * valor persistido, utiliza DEFAULT_PANEL_SHORTCUT.  Converte todas
   * propriedades para o tipo correto (booleano para modKeys e string
   * minúscula para a tecla).  Em caso de falha, define panelShortcut
   * para o valor padrão.
   */
  async function loadShortcut() {
    try {
      const sc = await GM.getValue(KEY_PANEL_SHORTCUT, DEFAULT_PANEL_SHORTCUT);
      if (sc && typeof sc === "object") {
        panelShortcut = {
          ctrl: !!sc.ctrl,
          shift: !!sc.shift,
          alt: !!sc.alt,
          key: (sc.key || DEFAULT_PANEL_SHORTCUT.key || "").toLowerCase()
        };
      } else {
        panelShortcut = DEFAULT_PANEL_SHORTCUT;
      }
    } catch {
      panelShortcut = DEFAULT_PANEL_SHORTCUT;
    }
  }

  /**
   * Persiste e atualiza o atalho do painel.  Aceita um objeto com
   * propriedades ctrl, alt, shift (booleanas) e key (string).
   * Atribui a panelShortcut e grava via GM.setValue.
   */
  async function saveShortcut(sc) {
    panelShortcut = {
      ctrl: !!(sc && sc.ctrl),
      shift: !!(sc && sc.shift),
      alt: !!(sc && sc.alt),
      key: ((sc && sc.key) || "").toLowerCase()
    };
    try {
      await GM.setValue(KEY_PANEL_SHORTCUT, panelShortcut);
    } catch {}
  }

  /**
   * Compara um evento de teclado com um atalho configurado.  Retorna
   * verdadeiro se as teclas modificadoras (ctrl, shift, alt) coincidirem
   * exatamente e a tecla pressionada corresponder à letra/número
   * configurado (ignorando caixa).
   */
  function matchesShortcut(e, shortcut) {
    if (!shortcut || !shortcut.key) return false;
    // O evento pode conter outras propriedades como metaKey, mas
    // consideramos apenas ctrl/alt/shift.  Todos devem coincidir.
    return (
      (!!shortcut.ctrl) === (!!e.ctrlKey) &&
      (!!shortcut.shift) === (!!e.shiftKey) &&
      (!!shortcut.alt) === (!!e.altKey) &&
      (String(e.key || "").toLowerCase() === String(shortcut.key || "").toLowerCase())
    );
  }

  // ========= Highlight engine (termo a termo) =========
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
      }
    });
    let n; while ((n = walker.nextNode())) cb(n);
  }
  function clearExistingHighlights(root = document.body) {
    root.querySelectorAll("." + HIGHLIGHT_CLASS).forEach(node => {
      const p = node.parentNode; if (!p) return;
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
        // Aplicar cores e estilos definidos pelo usuário.  A cor de
        // destaque (backgroundColor) utiliza a preferência carregada
        // highlightColor, que inclui canal alfa.  A cor de texto e o
        // negrito também são aplicados se definidos.
        span.style.backgroundColor = highlightColor;
        if (textColor) span.style.color = textColor;
        span.style.fontWeight = textBold ? "bold" : "normal";
        span.style.borderRadius = "2px";
        span.style.padding = "0";
        span.style.margin = "0";
        span.style.cursor = "pointer";
        span.dataset.term = term; // canônico salvo
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
    const ordered = [...terms].sort((a, b) => b.length - a.length);
    for (const t of ordered) highlightSingleTerm(t);
  }

  // ========= Broadcast entre frames =========
  const broadcastApply = () => { try { window.top.postMessage({ type: "VINI_APPLY_HIGHLIGHTS" }, "*"); } catch {} };
  window.addEventListener("message", (e) => {
    const d = e && e.data;
    if (d && d.type === "VINI_APPLY_HIGHLIGHTS") { applyHighlights(); }
  });

  // ========= Mini toolbar ("Destacar") =========
  let toolbar, toolbarRoot;
  function ensureToolbar() {
    if (toolbarRoot) return;
    const host = document.createElement("div");
    host.style.position = "fixed"; host.style.zIndex = "2147483647";
    host.style.top = "0"; host.style.left = "0"; host.style.pointerEvents = "none";
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: "open" });

    const btn = document.createElement("button");
    btn.textContent = "Destacar";
    Object.assign(btn.style, {
      pointerEvents: "auto", fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "12px", padding: "6px 10px", border: "1px solid rgba(0,0,0,.15)",
      borderRadius: "8px", background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,.12)",
      cursor: "pointer", display: "none"
    });
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      const sel = window.getSelection && window.getSelection();
      const text = sel ? String(sel.toString()).trim() : "";
      if (text && charCount(text) >= MIN_LEN) {
        const ok = await addTerm(text);
        if (ok) { await applyHighlights(); broadcastApply(); }
      }
      hideToolbar(); if (sel) sel.removeAllRanges();
    });

    const style = document.createElement("style");
    style.textContent = `:host{all:initial} button:hover{background:#f6f6f6}`;

    root.appendChild(style);
    root.appendChild(btn);
    toolbar = btn; toolbarRoot = host;
  }
  function showToolbarAt(x, y) {
    ensureToolbar();
    toolbar.style.position = "fixed";
    toolbar.style.left = Math.round(x) + "px";
    toolbar.style.top = Math.max(8, Math.round(y)) + "px";
    toolbar.style.display = "block";
  }
  function hideToolbar() { if (toolbar) toolbar.style.display = "none"; }
  function positionToolbarNearSelection() {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed) return hideToolbar();
    const txt = String(sel.toString()).trim();
    if (!txt || charCount(txt) < MIN_LEN) return hideToolbar();
    const range = sel.getRangeAt(0).cloneRange();
    const rects = range.getClientRects(); if (!rects.length) return hideToolbar();
    const r = rects[rects.length - 1]; showToolbarAt(r.right + 8, r.top - 8);
  }
  document.addEventListener("selectionchange", positionToolbarNearSelection);
  document.addEventListener("scroll", () => {
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed && String(sel.toString()).trim() !== "") positionToolbarNearSelection();
    else hideToolbar();
  }, { passive: true });

  // Atalho: Ctrl+Alt+D — adiciona seleção
  document.addEventListener("keydown", async (e) => {
    if (e.ctrlKey && e.altKey && (e.key.toLowerCase() === "d")) {
      const sel = window.getSelection && window.getSelection();
      const text = sel ? String(sel.toString()).trim() : "";
      if (text && charCount(text) >= MIN_LEN) {
        const ok = await addTerm(text);
        if (ok) { await applyHighlights(); broadcastApply(); }
      }
    }
  });

  // ========= Popover "Remover" =========
  let pop, popRoot, currentCanonical = null;
  function ensurePop() {
    if (popRoot) return;
    const host = document.createElement("div");
    host.style.position = "fixed"; host.style.zIndex = "2147483647";
    host.style.top = "0"; host.style.left = "0"; host.style.pointerEvents = "none";
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: "open" });

    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      pointerEvents: "auto", display: "none",
      fontFamily: "system-ui, -apple-system, sans-serif", fontSize: "12px",
      padding: "6px 8px", border: "1px solid rgba(0,0,0,.15)",
      borderRadius: "8px", background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,.12)"
    });

    const btn = document.createElement("button");
    btn.textContent = "Remover";
    Object.assign(btn.style, { cursor: "pointer", border: "none", background: "transparent", padding: "0", margin: "0", color: "#c00" });
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation(); // evita que o documento feche antes
      if (currentCanonical) {
        const removed = await removeByCanonical(currentCanonical);
        if (removed) { await applyHighlights(); broadcastApply(); }
      }
      hidePop();
    });

    const style = document.createElement("style");
    style.textContent = `:host{all:initial} button:hover{text-decoration:underline}`;

    wrap.appendChild(btn);
    root.appendChild(style);
    root.appendChild(wrap);
    pop = wrap; popRoot = host;
  }
  function showPopAt(x, y, canonicalTerm) {
    ensurePop(); currentCanonical = canonicalTerm;
    pop.style.position = "fixed"; pop.style.left = Math.round(x) + "px"; pop.style.top = Math.max(8, Math.round(y)) + "px";
    pop.style.display = "block";
  }
  function hidePop() { if (pop) pop.style.display = "none"; currentCanonical = null; }

  // Listener global (captura): ignora cliques dentro do popover
  document.addEventListener("click", (e) => {
    // Se o clique veio de dentro do popover, não fecha e não reseta o estado
    if (popRoot) {
      const path = e.composedPath ? e.composedPath() : null;
      if (path && path.indexOf(popRoot) !== -1) return;
    }
    const t = e.target;
    if (t && t.classList && t.classList.contains(HIGHLIGHT_CLASS)) {
      const rect = t.getBoundingClientRect();
      const canonical = t.dataset.term || t.textContent;
      showPopAt(rect.right + 6, rect.top - 6, canonical);
      e.stopPropagation(); e.preventDefault();
      return;
    }
    hidePop();
  }, true);

  // ========= Painel (Ctrl+Shift+H) =========
  let panelHost, panelRoot;
  function ensurePanel() {
    if (panelRoot) return;
    panelHost = document.createElement("div");
    panelHost.style.position = "fixed";
    panelHost.style.zIndex = "2147483647";
    panelHost.style.top = "0"; panelHost.style.left = "0";
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
      // Aparência mais suave e moderna do painel
      background: "#fdfdfd",
      border: "1px solid #ccc",
      borderRadius: "12px",
      boxShadow: "0 6px 16px rgba(0, 0, 0, .12)",
      padding: "12px",
      display: "none"
    });

    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="font:600 14px system-ui,-apple-system,sans-serif;">Destaques (globais)</div>
        <div style="flex:1"></div>
        <button id="vini-close" title="Fechar" style="border:none;background:transparent;font-size:16px;cursor:pointer">✕</button>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <input id="vini-add-input" type="text" placeholder="Adicionar termo (≥3)" style="flex:1;padding:6px 8px;border-radius:8px;border:1px solid #ddd;"/>
        <button id="vini-add-btn" style="padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#f7f7f7;cursor:pointer">Adicionar</button>
        <button id="vini-add-sel-btn" title="Adicionar seleção atual" style="padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#f7f7f7;cursor:pointer">+ Seleção</button>
      </div>

      <div id="vini-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;"></div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="vini-remove-selected" style="padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">Remover selecionados</button>
        <button id="vini-clear-all" style="padding:6px 10px;border-radius:8px;border:1px solid #e00;color:#e00;background:#fff;cursor:pointer">Limpar tudo</button>
        <div style="flex:1"></div>
        <button id="vini-export" style="padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">Exportar JSON</button>
        <button id="vini-import" style="padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">Importar JSON</button>
      </div>

      <!-- Seção de customização de cores e estilo do destaque -->
      <div id="vini-customize" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;">
        <label style="display:flex;align-items:center;gap:4px;font: 13px system-ui,-apple-system,sans-serif;">
          Cor destaque:
          <input id="vini-hl-color" type="color" style="width:32px;height:24px;padding:0;border:none;cursor:pointer;"/>
        </label>
        <label style="display:flex;align-items:center;gap:4px;font: 13px system-ui,-apple-system,sans-serif;">
          Cor do texto:
          <input id="vini-text-color" type="color" style="width:32px;height:24px;padding:0;border:none;cursor:pointer;"/>
        </label>
        <label style="display:flex;align-items:center;gap:4px;font: 13px system-ui,-apple-system,sans-serif;user-select:none;">
          <input id="vini-bold-toggle" type="checkbox" style="margin:0;"/> <span>Negrito</span>
        </label>
      </div>

      <!-- Seção de personalização do atalho do painel -->
      <div id="vini-shortcut" style="display:flex;flex-direction:column;gap:4px;margin-top:8px;">
        <div style="font:600 13px system-ui,-apple-system,sans-serif;margin-bottom:4px;">Atalho do painel</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <label style="display:flex;align-items:center;gap:4px;font:13px system-ui,-apple-system,sans-serif;">
            <input id="vini-shortcut-ctrl" type="checkbox" style="margin:0;"/> <span>Ctrl</span>
          </label>
          <label style="display:flex;align-items:center;gap:4px;font:13px system-ui,-apple-system,sans-serif;">
            <input id="vini-shortcut-alt" type="checkbox" style="margin:0;"/> <span>Alt</span>
          </label>
          <label style="display:flex;align-items:center;gap:4px;font:13px system-ui,-apple-system,sans-serif;">
            <input id="vini-shortcut-shift" type="checkbox" style="margin:0;"/> <span>Shift</span>
          </label>
          <label style="display:flex;align-items:center;gap:4px;font:13px system-ui,-apple-system,sans-serif;">
            <span>Tecla:</span>
            <input id="vini-shortcut-key" type="text" maxlength="1" style="width:28px;padding:3px 4px;border:1px solid #ccc;border-radius:4px;text-transform:uppercase;"/>
          </label>
          <button id="vini-shortcut-save" style="padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#f7f7f7;cursor:pointer;">Salvar</button>
        </div>
      </div>

      <div id="vini-import-area" style="display:none;margin-top:8px;">
        <textarea id="vini-import-text" placeholder='Cole aqui um JSON como ["termo1","termo2"]' style="width:100%;height:100px;border-radius:8px;border:1px solid #ddd;padding:8px;"></textarea>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <button id="vini-import-apply" style="padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#f7f7f7;cursor:pointer">Aplicar importação</button>
          <button id="vini-import-cancel" style="padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">Cancelar</button>
        </div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      /* Estilização aprimorada para itens da lista */
      #vini-list .item {
        display:flex;
        align-items:center;
        gap:8px;
        border:1px solid #ddd;
        border-radius:8px;
        padding:6px 8px;
        background:#fafafa;
      }
      #vini-list .item:hover {
        background:#f2f2f2;
      }
      #vini-list .term { flex:1; font: 13px system-ui,-apple-system,sans-serif; }
      #vini-list .rm { border:none;background:transparent;color:#c00;cursor:pointer }
      #vini-list input[type="checkbox"] { width:16px;height:16px; }
      button:hover { filter: brightness(0.96); }
    `;

    panelRoot.appendChild(style);
    panelRoot.appendChild(wrap);

    const $ = (id) => panelRoot.getElementById(id);
    const listEl = $("vini-list");
    const addInput = $("vini-add-input");

    $("vini-close").onclick = () => togglePanel(false);

    $("vini-add-btn").onclick = async () => {
      const value = addInput.value.trim();
      if (value && value.length >= MIN_LEN) {
        if (await addTerm(value)) {
          addInput.value = "";
          await refreshList();
          await applyHighlights(); broadcastApply();
        }
      }
    };
    $("vini-add-sel-btn").onclick = async () => {
      const sel = window.getSelection && window.getSelection();
      const text = sel ? String(sel.toString()).trim() : "";
      if (text && text.length >= MIN_LEN) {
        if (await addTerm(text)) {
          await refreshList();
          await applyHighlights(); broadcastApply();
        }
      }
    };

    $("vini-remove-selected").onclick = async () => {
      const checks = listEl.querySelectorAll('input[type="checkbox"]:checked');
      if (!checks.length) return;
      const terms = await loadTerms();
      const selectedKeys = new Set([...checks].map(c => c.dataset.key));
      const filtered = terms.filter(t => !selectedKeys.has(norm(t)));
      await saveTerms(filtered);
      await refreshList();
      await applyHighlights(); broadcastApply();
    };

    $("vini-clear-all").onclick = async () => {
      await saveTerms([]);
      await refreshList();
      await applyHighlights(); broadcastApply();
    };

    $("vini-export").onclick = async () => {
      const terms = await loadTerms();
      const data = JSON.stringify(terms, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "vini-highlights.json"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    $("vini-import").onclick = () => { $("vini-import-area").style.display = "block"; };
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
        await applyHighlights(); broadcastApply();
      } catch (e) {
        alert("Importação falhou: " + (e && e.message ? e.message : e));
      }
    };

    // ---------- Inicialização e manipulação das preferências de cor/estilo ----------
    // Atribui os valores carregados aos controles de UI quando o painel é montado.
    const hlInput = $("vini-hl-color");
    const txtInput = $("vini-text-color");
    const boldInput = $("vini-bold-toggle");
    if (hlInput) {
      try {
        // Mostra apenas a parte RGB (primeiros 7 caracteres). Se a cor estiver em
        // formato curto (ex.: #abc) ou sem canal alfa, o slice ainda se comporta bem.
        hlInput.value = (highlightColor || DEFAULT_HIGHLIGHT_COLOR).slice(0, 7);
      } catch {}
      hlInput.addEventListener("input", async (ev) => {
        const val = ev.target.value;
        // Preserva canal alfa (os dois últimos dígitos) se existir
        const alpha = (highlightColor && highlightColor.length > 7) ? highlightColor.slice(7) : "";
        highlightColor = val + alpha;
        await GM.setValue(KEY_HIGHLIGHT_COLOR, highlightColor);
        await applyHighlights(); broadcastApply();
      });
    }
    if (txtInput) {
      try {
        txtInput.value = (textColor || DEFAULT_TEXT_COLOR).slice(0, 7);
      } catch {}
      txtInput.addEventListener("input", async (ev) => {
        textColor = ev.target.value;
        await GM.setValue(KEY_TEXT_COLOR, textColor);
        await applyHighlights(); broadcastApply();
      });
    }
    if (boldInput) {
      boldInput.checked = !!textBold;
      boldInput.addEventListener("change", async (ev) => {
        textBold = !!ev.target.checked;
        await GM.setValue(KEY_BOLD, textBold);
        await applyHighlights(); broadcastApply();
      });
    }

    // ---------- Inicialização e manipulação do atalho do painel ----------
    // Controles de atalho: checkboxes para Ctrl/Alt/Shift, campo de tecla e botão salvar.
    const scCtrl = $("vini-shortcut-ctrl");
    const scAlt = $("vini-shortcut-alt");
    const scShift = $("vini-shortcut-shift");
    const scKey = $("vini-shortcut-key");
    const scSave = $("vini-shortcut-save");
    if (scCtrl && scAlt && scShift && scKey && scSave) {
      // Preenche os valores iniciais com o atalho atualmente configurado.
      try {
        scCtrl.checked = !!panelShortcut.ctrl;
        scAlt.checked = !!panelShortcut.alt;
        scShift.checked = !!panelShortcut.shift;
        scKey.value = (panelShortcut.key || "").toUpperCase();
      } catch {}
      scSave.addEventListener("click", async () => {
        // Obtém estado dos controles
        const ctrlVal = !!scCtrl.checked;
        const altVal = !!scAlt.checked;
        const shiftVal = !!scShift.checked;
        let keyVal = String(scKey.value || "").trim();
        if (!keyVal) {
          alert("Escolha uma tecla para o atalho.");
          return;
        }
        // Considera apenas o primeiro caractere digitado
        keyVal = keyVal[0].toLowerCase();
        // Atualiza e persiste o atalho
        await saveShortcut({ ctrl: ctrlVal, alt: altVal, shift: shiftVal, key: keyVal });
        // Ajusta visualmente o valor
        scKey.value = keyVal.toUpperCase();
        // Feedback simples ao usuário
        alert("Atalho atualizado para: " +
          (ctrlVal ? "Ctrl+" : "") + (altVal ? "Alt+" : "") + (shiftVal ? "Shift+" : "") + keyVal.toUpperCase());
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
            await applyHighlights(); broadcastApply();
          }
        };
        row.appendChild(cb); row.appendChild(span); row.appendChild(rm);
        listEl.appendChild(row);
      }
    }

    wrap._refreshList = refreshList;
  }

  async function togglePanel(on) {
    ensurePanel();
    const panel = panelRoot.getElementById("vini-panel");
    if (on) {
      await panel._refreshList();
      // Atualiza os valores visuais dos controles de customização sempre que o painel abrir.
      try {
        const hlInput = panelRoot.getElementById("vini-hl-color");
        if (hlInput) hlInput.value = (highlightColor || DEFAULT_HIGHLIGHT_COLOR).slice(0, 7);
        const txtInput = panelRoot.getElementById("vini-text-color");
        if (txtInput) txtInput.value = (textColor || DEFAULT_TEXT_COLOR).slice(0, 7);
        const boldInput = panelRoot.getElementById("vini-bold-toggle");
        if (boldInput) boldInput.checked = !!textBold;

        // Atualiza os controles do atalho com os valores atuais
        const scCtrl = panelRoot.getElementById("vini-shortcut-ctrl");
        const scAlt = panelRoot.getElementById("vini-shortcut-alt");
        const scShift = panelRoot.getElementById("vini-shortcut-shift");
        const scKey = panelRoot.getElementById("vini-shortcut-key");
        if (scCtrl) scCtrl.checked = !!panelShortcut.ctrl;
        if (scAlt) scAlt.checked = !!panelShortcut.alt;
        if (scShift) scShift.checked = !!panelShortcut.shift;
        if (scKey) scKey.value = (panelShortcut.key || "").toUpperCase();
      } catch {}
      panel.style.display = "block";
      panelOpen = true;
    } else {
      panel.style.display = "none";
      panelOpen = false;
    }
  }

  // Atalho do painel: verifica dinamicamente com base na configuração armazenada.
  document.addEventListener("keydown", async (e) => {
    try {
      if (matchesShortcut(e, panelShortcut)) {
        togglePanel(!panelOpen);
      }
    } catch {
      /* em caso de falha, nada faz */
    }
  });

  // ========= Boot & observadores =========
  (async function init() {
    // Carrega preferências de cor, estilo e atalho antes de aplicar destaques.
    await loadSettings();
    // Carrega também o atalho do painel do armazenamento.  Se não houver, utiliza o padrão.
    await loadShortcut();
    await applyHighlights();

    const mo = new MutationObserver(() => {
      if (mo._pending) return; mo._pending = true;
      setTimeout(async () => { mo._pending = false; await applyHighlights(); }, 350);
    });
    mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true });

    const push = history.pushState, replace = history.replaceState;
    history.pushState = function () { const ret = push.apply(this, arguments); window.dispatchEvent(new Event("vini-spa-change")); return ret; };
    history.replaceState = function () { const ret = replace.apply(this, arguments); window.dispatchEvent(new Event("vini-spa-change")); return ret; };
    window.addEventListener("popstate", () => window.dispatchEvent(new Event("vini-spa-change")));
    window.addEventListener("vini-spa-change", async () => { await applyHighlights(); });
  })();

})();
