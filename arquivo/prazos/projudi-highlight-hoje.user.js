// ==UserScript==
// @name         Projudi - Highlight Hoje
// @icon         https://projudi.tjgo.jus.br/imagens/favicon.svg
// @namespace    projudi-today-highlight
// @version      2.0.1
// @description  Realça apenas a data atual no projudi, com cores definidas.
// @updateURL    https://gitlab.com/-/snippets/4899371/raw/main/projudi-highlight-hoje.user.js
// @author       você
// @match        *://projudi.tjgo.jus.br/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ====== CONFIGURAÇÃO DE ESTILO ======
  const BG = "rgba(255,205,210,1)";   // #FFCDD2FF
  const FG = "rgba(183,28,28,1)";     // #B71C1CFF
  const CLASS = "tm-today-highlight";

  // Injeta CSS uma vez
  const style = document.createElement("style");
  style.textContent = `
    .${CLASS} {
      background-color: ${BG} !important;
      color: ${FG} !important;
      padding: 0.1em 0.15em;
      border-radius: 2px;
    }
  `;
  document.documentElement.appendChild(style);

  // ====== DATA DE HOJE E REGEX DINÂMICO ======
  const now = new Date();
  const pad2 = (n) => (n < 10 ? "0" + n : "" + n);
  const d = now.getDate();
  const m = now.getMonth() + 1;
  const yyyy = now.getFullYear();
  const yy = ("" + yyyy).slice(-2);

  // Aceitar com e sem zero à esquerda:
  // Se for 09 => alternativas "09" e "9"; se for 12 => só "12".
  const alt = (num) => {
    const s = pad2(num);
    const n = String(num);
    return s === n ? s : `${s}|${n}`;
  };

  const dayAlt = alt(d);
  const monAlt = alt(m);

  // Aceitar "/" OU "-" e ano com 4 ou 2 dígitos
  // Evitar capturar dentro de números maiores com lookarounds
  // Ex.: (?<!\d)(?:09|9)[/-](?:09|9)[/-](?:2025|25)(?!\d)
  const pattern = new RegExp(
    `(?<!\\d)(?:${dayAlt})[\\/-](?:${monAlt})[\\/-](?:${yyyy}|${yy})(?!\\d)`,
    "g"
  );

  // ====== NAVEGAR PELOS NÓS DE TEXTO ======
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);
  const isSkippable = (node) =>
    node &&
    (SKIP_TAGS.has(node.nodeName) ||
     node.closest?.(`.${CLASS}, script, style, noscript, textarea, input`));

  // ====== COLUNAS ALVO PARA REALÇAR ======
  // Apenas realçar datas nas colunas cujo cabeçalho contenha estes textos.
  const TARGET_HEADERS = [
    "data limite",
    "possível data limite",
    "possivel data limite",
  ];

  /**
   * Calcula o índice da coluna deste <td> dentro da linha.
   * Não leva em conta colSpan ou rowSpan complexos, mas funciona para tabelas simples.
   * @param {HTMLElement} td
   * @returns {number}
   */
  function getColumnIndex(td) {
    const tr = td?.parentElement;
    if (!tr) return -1;
    return Array.prototype.indexOf.call(tr.children, td);
  }

  /**
   * Retorna true se o <td> pertence a uma coluna cujo cabeçalho contém uma das
   * palavras-chave em TARGET_HEADERS.
   * Faz uma busca no <thead> da tabela e compara o texto do cabeçalho.
   * @param {HTMLElement} td
   * @returns {boolean}
   */
  function isTargetColumn(td) {
    if (!td) return false;
    const table = td.closest?.("table");
    if (!table) return false;
    const thead = table.querySelector("thead");
    if (!thead) return false;
    const headerRows = Array.from(thead.querySelectorAll("tr"));
    if (headerRows.length === 0) return false;
    // índice da coluna que estamos testando
    const colIndex = getColumnIndex(td);
    if (colIndex < 0) return false;
    // Verifica a partir da última linha de cabeçalho para a primeira.
    for (let r = headerRows.length - 1; r >= 0; r--) {
      const row = headerRows[r];
      let idx = 0;
      for (const cell of row.children) {
        const span = parseInt(cell.getAttribute("colspan")) || 1;
        // Se o índice da coluna está dentro do span desta célula de cabeçalho
        if (idx <= colIndex && colIndex < idx + span) {
          const text = (cell.textContent || "").trim().toLowerCase();
          // Usa includes para capturar variações como "Possível Data Limite" com espaços extras
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

  /**
   * Determina se o nó de texto está em um <td> de uma coluna alvo.
   * Sobe na árvore até encontrar o <td> mais próximo.
   * @param {Node} node
   * @returns {boolean}
   */
  function isInTargetCell(node) {
    let el = node?.parentElement;
    while (el && el !== document.body && el.nodeName !== "TD") {
      el = el.parentElement;
    }
    if (!el || el.nodeName !== "TD") return false;
    return isTargetColumn(el);
  }

  function highlightInTextNode(textNode) {
    // Realça somente se estiver em uma coluna alvo
    if (!isInTargetCell(textNode)) {
      return;
    }
    const text = textNode.nodeValue;
    if (!text || !pattern.test(text)) {
      return;
    }
    pattern.lastIndex = 0; // reset para reutilizar

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (start > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }

      const span = document.createElement("span");
      span.className = CLASS;
      span.textContent = text.slice(start, end);
      frag.appendChild(span);

      lastIndex = end;
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
          if (parent.classList && parent.classList.contains(CLASS)) {
            return NodeFilter.FILTER_REJECT;
          }
          // Pequena otimização: só passa textos que têm dd ou mm do dia
          const t = node.nodeValue;
          if (!t || t.length < 6) return NodeFilter.FILTER_REJECT;
          // Checagem rápida antes do regex completo
          if (
            !(t.includes("/") || t.includes("-")) ||
            !(t.includes(String(d)) || t.includes(pad2(d)))
          ) {
            return NodeFilter.FILTER_SKIP;
          }
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

  // Observar mudanças no DOM (para páginas dinâmicas)
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
