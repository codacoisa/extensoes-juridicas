// ==UserScript==
// @name         Projudi - Highlight Hoje
// @namespace    projudi-highlight-hoje.user.js
// @version      2.2
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Realça apenas a data atual no projudi, com cores definidas.
// @author       louencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/f9a2549211ec7a07807ce2d6a3cfd0a9/raw/projudi-highlight-hoje.user.js
// @downloadURL  https://gist.githubusercontent.com/lourencosv/f9a2549211ec7a07807ce2d6a3cfd0a9/raw/projudi-highlight-hoje.user.js
// @match        *://projudi.tjgo.jus.br/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ====== CONFIGURAÇÃO DE ESTILO ======
  const CLASS_TODAY = "tm-highlight-hoje";
  const CLASS_TOMORROW = "tm-highlight-amanha";
  const CLASS_AFTER = "tm-highlight-depois";

  const style = document.createElement("style");
  style.textContent = `
    .${CLASS_TODAY},
    .${CLASS_TOMORROW},
    .${CLASS_AFTER} {
      position: relative;
      cursor: help;
      padding: 0.1em 0.15em;
      border-radius: 2px;
    }

    /* CORES */
    .${CLASS_TODAY} {
      background-color: rgba(255,205,210,1) !important; /* vermelho claro */
      color: rgba(183,28,28,1) !important;             /* vermelho escuro */
    }
    .${CLASS_TOMORROW} {
      background-color: rgba(255,224,178,1) !important; /* laranja claro */
      color: rgba(191,54,12,1) !important;              /* laranja escuro */
    }
    .${CLASS_AFTER} {
      background-color: rgba(255,249,196,1) !important; /* amarelo claro */
      color: rgba(245,127,23,1) !important;             /* amarelo/laranja escuro */
    }

    /* TOOLTIP BASE */
    .${CLASS_TODAY}::after,
    .${CLASS_TOMORROW}::after,
    .${CLASS_AFTER}::after {
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

    /* SETINHA DO BALÃO */
    .${CLASS_TODAY}::before,
    .${CLASS_TOMORROW}::before,
    .${CLASS_AFTER}::before {
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

    /* MOSTRAR TOOLTIP */
    .${CLASS_TODAY}:hover::after,
    .${CLASS_TODAY}:hover::before,
    .${CLASS_TOMORROW}:hover::after,
    .${CLASS_TOMORROW}:hover::before,
    .${CLASS_AFTER}:hover::after,
    .${CLASS_AFTER}:hover::before {
      opacity: 1;
    }
  `;
  document.documentElement.appendChild(style);

  // ====== FUNÇÕES DE DATA ======
  const pad2 = (n) => (n < 10 ? "0" + n : "" + n);

  /**
   * Aceitar com e sem zero à esquerda:
   * Se for 09 => alternativas "09" e "9"; se for 12 => só "12".
   */
  const alt = (num) => {
    const s = pad2(num);
    const n = String(num);
    return s === n ? s : `${s}|${n}`;
  };

  /**
   * Cria objeto com dados de uma data (dia, mês, ano, regex).
   */
  function makeDateInfo(date) {
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const yyyy = date.getFullYear();
    const yy = String(yyyy).slice(-2);

    const dayAlt = alt(d);
    const monAlt = alt(m);

    // Aceitar "/" OU "-" e ano com 4 ou 2 dígitos
    // Ex.: (?<!\d)(?:09|9)[/-](?:09|9)[/-](?:2025|25)(?!\d)
    const patternSrc = `(?<!\\d)(?:${dayAlt})[\\/-](?:${monAlt})[\\/-](?:${yyyy}|${yy})(?!\\d)`;
    const regex = new RegExp(patternSrc, "g");

    return { d, m, yyyy, yy, regex };
  }

  // Hoje, amanhã e depois de amanhã
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const afterTomorrow = new Date(today);
  afterTomorrow.setDate(today.getDate() + 2);

  const infoToday = makeDateInfo(today);
  const infoTomorrow = makeDateInfo(tomorrow);
  const infoAfterTomorrow = makeDateInfo(afterTomorrow);

  const DATE_CONFIGS = [
    { info: infoToday, className: CLASS_TODAY },
    { info: infoTomorrow, className: CLASS_TOMORROW },
    { info: infoAfterTomorrow, className: CLASS_AFTER },
  ];

  // Strings rápidas para o filtro preliminar no walker (evita regex em tudo)
  const QUICK_STRINGS = new Set([
    String(infoToday.d),
    pad2(infoToday.d),
    String(infoTomorrow.d),
    pad2(infoTomorrow.d),
    String(infoAfterTomorrow.d),
    pad2(infoAfterTomorrow.d),
  ]);

  // ====== NAVEGAR PELOS NÓS DE TEXTO ======
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);
  const HIGHLIGHT_CLASSES = [CLASS_TODAY, CLASS_TOMORROW, CLASS_AFTER];
  const HIGHLIGHT_SELECTOR = HIGHLIGHT_CLASSES.map((c) => "." + c).join(",");

  const isSkippable = (node) =>
    node &&
    (SKIP_TAGS.has(node.nodeName) ||
      node.closest?.(`${HIGHLIGHT_SELECTOR}, script, style, noscript, textarea, input`));

  // ====== COLUNAS ALVO PARA REALÇAR ======
  const TARGET_HEADERS = [
    "data limite",
    "possível data limite",
    "possivel data limite",
  ];

  function getColumnIndex(td) {
    const tr = td?.parentElement;
    if (!tr) return -1;
    return Array.prototype.indexOf.call(tr.children, td);
  }

  function isTargetColumn(td) {
    if (!td) return false;
    const table = td.closest?.("table");
    if (!table) return false;
    const thead = table.querySelector("thead");
    if (!thead) return false;
    const headerRows = Array.from(thead.querySelectorAll("tr"));
    if (headerRows.length === 0) return false;

    const colIndex = getColumnIndex(td);
    if (colIndex < 0) return false;

    for (let r = headerRows.length - 1; r >= 0; r--) {
      const row = headerRows[r];
      let idx = 0;
      for (const cell of row.children) {
        const span = parseInt(cell.getAttribute("colspan")) || 1;
        if (idx <= colIndex && colIndex < idx + span) {
          const text = (cell.textContent || "").trim().toLowerCase();
          if (TARGET_HEADERS.some((h) => text.includes(h))) {
            return true;
          }
          return false;
        }
        idx += span;
      }
    }
    return false;
  }

  function isInTargetCell(node) {
    let el = node?.parentElement;
    while (el && el !== document.body && el.nodeName !== "TD") {
      el = el.parentElement;
    }
    if (!el || el.nodeName !== "TD") return false;
    return isTargetColumn(el);
  }

  function highlightInTextNode(textNode) {
    if (!isInTargetCell(textNode)) return;
    const text = textNode.nodeValue;
    if (!text) return;

    // Reseta lastIndex dos regex
    for (const cfg of DATE_CONFIGS) {
      cfg.info.regex.lastIndex = 0;
    }

    const matches = [];

    // Coleta todas as ocorrências das três datas
    for (const cfg of DATE_CONFIGS) {
      const { regex } = cfg.info;
      let m;
      while ((m = regex.exec(text)) !== null) {
        matches.push({
          start: m.index,
          end: m.index + m[0].length,
          text: m[0],
          className: cfg.className,
        });
      }
    }

    if (matches.length === 0) return;

    // Ordena e remove sobreposição (se houver)
    matches.sort((a, b) => a.start - b.start || a.end - b.end);
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
      span.className = m.className;
      span.textContent = m.text;
      span.setAttribute(
        "data-tooltip",
        m.className === CLASS_TODAY
          ? "Possível vencimento HOJE"
          : m.className === CLASS_TOMORROW
          ? "Possível vencimento AMANHÃ"
          : "Possível vencimento DEPOIS DE AMANHÃ"
      );
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

          // Evitar reprocessar trechos já destacados:
          if (
            parent.classList &&
            HIGHLIGHT_CLASSES.some((c) => parent.classList.contains(c))
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          const t = node.nodeValue;
          if (!t || t.length < 6) return NodeFilter.FILTER_REJECT;

          if (!(t.includes("/") || t.includes("-"))) {
            return NodeFilter.FILTER_SKIP;
          }

          // Filtro rápido: se o texto não contém nenhum dia relevante, nem tenta regex
          let hasQuick = false;
          for (const qs of QUICK_STRINGS) {
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

  // Primeira varredura
  walkAndHighlight(document.body);

  // Observar mudanças no DOM (páginas dinâmicas)
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const p = node.parentNode;
          if (!isSkippable(p)) highlightInTextNode(node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (!isSkippable(node)) walkAndHighlight(node);
        }
      }
    }
  });

  mo.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();