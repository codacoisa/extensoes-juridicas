// ==UserScript==
// @name         Destaque de Prazos
// @namespace    projudi-highlight-hoje.user.js
// @version      2.9
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

  // ============================================================
  // CONFIGURAÇÕES PRINCIPAIS
  // ============================================================
  // Janela de destaque: hoje + próximos (WINDOW_DAYS - 1) dias.
  // Ex.: WINDOW_DAYS = 7 => hoje + próximos 6 (total 7 datas).
  const WINDOW_DAYS = 7;

  // O Projudi tem várias tabelas. Para evitar falsos positivos, a gente só realça
  // datas que estejam nas colunas cujo cabeçalho contenha (case-insensitive):
  // "Data limite" ou "Possível data limite".
  const TARGET_HEADERS = [
    "data limite",
    "possível data limite",
    "possivel data limite",
  ];

  // Chave onde guardamos a "data fixa" (persistente), em formato "YYYY-MM-DD".
  // Essa data é definida pelo painel e permanece até o usuário resetar.
  const FIXED_DATE_KEY = "projudi_highlight_fixed_date_v1";

  // ============================================================
  // CONTEXTO: TOPO vs IFRAME
  // ============================================================
  // O Projudi usa iframe. Se o userscript rodar no topo e dentro do iframe,
  // ele pode registrar menu e injetar painel duas vezes.
  // A estratégia é:
  // - O realce (highlight) roda em QUALQUER contexto (topo e iframe).
  // - O painel/menu do Tampermonkey só registra no TOPO.
  const IS_TOP = (() => {
    try {
      return window.top === window.self;
    } catch {
      // Se não puder comparar por restrição, assume topo.
      return true;
    }
  })();

  // Para abrir o painel sempre "por cima de tudo", criamos/injetamos o overlay
  // no document do topo, não no document do iframe.
  function getTopDocumentSafe() {
    if (IS_TOP) return document;
    try {
      return window.top.document;
    } catch {
      // Fallback: se não tiver acesso ao top.document, usa o document atual.
      return document;
    }
  }

  // ============================================================
  // GM_* HELPERS (Tampermonkey) COM FALLBACK (localStorage)
  // ============================================================
  // Em alguns ambientes, GM_* pode não existir (ou você pode migrar de manager).
  // Então mantemos fallback para localStorage.
  function hasGM() {
    return typeof GM_getValue === "function" && typeof GM_setValue === "function";
  }

  function getStoredFixedDate() {
    try {
      if (hasGM()) return GM_getValue(FIXED_DATE_KEY, "");
      return localStorage.getItem(FIXED_DATE_KEY) || "";
    } catch {
      return "";
    }
  }

  function setStoredFixedDate(yyyy_mm_dd) {
    try {
      if (hasGM()) GM_setValue(FIXED_DATE_KEY, yyyy_mm_dd);
      else localStorage.setItem(FIXED_DATE_KEY, yyyy_mm_dd);
    } catch {
      // silêncio proposital: o script segue sem data fixa se storage falhar
    }
  }

  function clearStoredFixedDate() {
    try {
      if (hasGM()) GM_deleteValue(FIXED_DATE_KEY);
      else localStorage.removeItem(FIXED_DATE_KEY);
    } catch {
      // noop
    }
  }

  // ============================================================
  // UTILITÁRIOS DE DATA
  // ============================================================
  const pad2 = (n) => (n < 10 ? "0" + n : "" + n);

  // Aceita dia/mês com ou sem zero à esquerda (ex.: 7 ou 07).
  // Ex.: alt(7) => "07|7" ; alt(12) => "12"
  const alt = (num) => {
    const s = pad2(num);
    const n = String(num);
    return s === n ? s : `${s}|${n}`;
  };

  // Weekend = sábado (6) ou domingo (0)
  function isWeekend(d) {
    const day = d.getDay();
    return day === 0 || day === 6;
  }

  // Normaliza para meia-noite (evita bugs de comparação/virada de dia)
  function cloneDate(d) {
    const x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  // Soma dias com normalização
  function addDays(d, days) {
    const x = new Date(d.getTime());
    x.setDate(x.getDate() + days);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  // Converte "YYYY-MM-DD" em Date (validando coerência)
  function ymdToDate(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return null;

    const yyyy = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);

    const d = new Date(yyyy, mm - 1, dd);
    d.setHours(0, 0, 0, 0);

    // valida se o JS não "corrigiu" uma data inválida (ex.: 2026-02-31)
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
    return d;
  }

  // Cria regex para capturar a data do dia em formatos comuns do Projudi:
  // - separador "/" ou "-"
  // - ano com 4 ou 2 dígitos
  // Exemplos: 07/02/2026, 7-2-26, etc.
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
      // filtro rápido: se o texto não contém nem "07" nem "7", não vale varrer regex
      quickStrings: [pad2(d), String(d)],
    };
  }

  // Curto PT-BR (para tooltip)
  function weekdayShortPT(d) {
    const map = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return map[d.getDay()];
  }

  // ============================================================
  // ESQUEMA DE CORES
  // ============================================================
  // - Dias úteis: gradiente quente -> frio.
  //   Importante: a posição do gradiente é calculada APENAS considerando dias úteis
  //   dentro da janela (segunda a sexta).
  // - Sábado/domingo: cor fixa (alerta de fim de semana).
  // - Data fixa: cor própria (para não confundir com o gradiente).
  const CLASS_PREFIX = "tm-hl7d";
  const CLASS_WEEKEND = `${CLASS_PREFIX}-weekend`;
  const CLASS_FIXED = `${CLASS_PREFIX}-fixed`;

  // Paleta base (5 passos). Quando a janela tiver menos/more dias úteis,
  // interpolamos entre esses passos.
  const WEEKDAY_PALETTE = [
    { bg: "rgba(255,205,210,1)", fg: "rgba(183,28,28,1)" },   // vermelho (mais quente)
    { bg: "rgba(255,224,178,1)", fg: "rgba(191,54,12,1)" },   // laranja
    { bg: "rgba(255,249,196,1)", fg: "rgba(245,127,23,1)" },  // amarelo
    { bg: "rgba(220,237,200,1)", fg: "rgba(51,105,30,1)" },   // verde claro
    { bg: "rgba(200,230,201,1)", fg: "rgba(27,94,32,1)" },    // verde (mais frio)
  ];

  const WEEKEND_COLOR = { bg: "rgba(227,242,253,1)", fg: "rgba(13,71,161,1)" }; // azul
  const FIXED_COLOR   = { bg: "rgba(243,229,245,1)", fg: "rgba(74,20,140,1)" }; // roxo

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

  // Interpola entre a paleta em função de (idx/total)
  // idx in [0..total-1]
  function interpolatePalette(palette, idx, total) {
    if (total <= 1) return palette[0];

    const t = idx / (total - 1); // 0..1
    const segs = palette.length - 1;
    const x = t * segs;
    const i = Math.floor(x);
    const f = x - i;

    const c0 = palette[Math.min(i, palette.length - 1)];
    const c1 = palette[Math.min(i + 1, palette.length - 1)];

    const bg0 = parseRGBA(c0.bg), bg1 = parseRGBA(c1.bg);
    const fg0 = parseRGBA(c0.fg), fg1 = parseRGBA(c1.fg);
    if (!bg0 || !bg1 || !fg0 || !fg1) return palette[Math.min(idx, palette.length - 1)];

    const bg = { r: lerp(bg0.r, bg1.r, f), g: lerp(bg0.g, bg1.g, f), b: lerp(bg0.b, bg1.b, f), a: lerp(bg0.a, bg1.a, f) };
    const fg = { r: lerp(fg0.r, fg1.r, f), g: lerp(fg0.g, fg1.g, f), b: lerp(fg0.b, fg1.b, f), a: lerp(fg0.a, fg1.a, f) };

    return { bg: rgbaToString(bg), fg: rgbaToString(fg) };
  }

  // ============================================================
  // CONSTRUÇÃO DAS CONFIGS (janela + data fixa)
  // ============================================================
  // Gera uma lista de "configs" de datas que serão realçadas (cada uma com regex, classe e tooltip).
  // Ordem importa: data fixa vem primeiro, para prevalecer sobre uma data da janela.
  function buildConfigs() {
    const today = cloneDate(new Date());

    // Cria a janela de datas
    const windowDates = [];
    for (let i = 0; i < WINDOW_DAYS; i++) windowDates.push(addDays(today, i));

    // Lista só com os offsets úteis (para calcular gradiente sem considerar fim de semana)
    const weekdayOffsets = windowDates
      .map((d, i) => ({ d, i }))
      .filter((x) => !isWeekend(x.d));

    const weekdayCount = weekdayOffsets.length;

    // Configs para cada dia da janela
    const windowConfigs = windowDates.map((d, offset) => {
      const info = makeDateInfo(d);

      // Sábado/Domingo: cor única + tooltip diferente
      if (isWeekend(d)) {
        return {
          kind: "window",
          offset,
          info,
          className: CLASS_WEEKEND,
          tooltip: `Fim de semana (${weekdayShortPT(d)}) • ${pad2(info.d)}/${pad2(info.m)}/${info.yyyy}`,
        };
      }

      // Dias úteis: posição no "ranking" de úteis dentro da janela, para cor quente->fria
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
        tooltip: `Possível vencimento em ${offset === 0 ? "HOJE" : `${offset} dia(s)`} • ${weekdayShortPT(d)} • ${pad2(info.d)}/${pad2(info.m)}/${info.yyyy}`,
      };
    });

    // Config opcional de data fixa (vinda do painel)
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

    // Prioridade: FIXED primeiro
    const all = fixedConfig ? [fixedConfig, ...windowConfigs] : windowConfigs;

    // quickStrings: usado pra filtrar textos que "não têm chance" de conter datas relevantes
    const quick = new Set();
    for (const cfg of all) for (const qs of cfg.info.quickStrings) quick.add(qs);

    return { configs: all, quickStrings: Array.from(quick), windowConfigs, fixedConfig };
  }

  // ============================================================
  // CSS: realce + tooltip + painel (com contraste garantido)
  // ============================================================
  // Importante: no Projudi, CSS global pode deixar botões "apagados".
  // Por isso os estilos do painel usam !important.
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

/* Painel */
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
  width: 420px;
  max-width: calc(100vw - 24px);
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,.25);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  padding: 14px 14px 12px;
}
#${CLASS_PREFIX}-panel h3 {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 700;
}

#${CLASS_PREFIX}-panel .row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 8px 0;
}
#${CLASS_PREFIX}-panel input[type="date"] {
  flex: 1;
  padding: 8px !important;
  border: 1px solid rgba(0,0,0,.2) !important;
  border-radius: 8px !important;
  color: #111 !important;
  background: #fff !important;
}

/* Contraste forçado dos botões */
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
  margin-top: 6px;
  color: rgba(0,0,0,.8);
}

/* Texto da dica justificado */
#${CLASS_PREFIX}-panel .hint {
  font-size: 12px;
  color: rgba(0,0,0,.7);
  line-height: 1.35;
  margin-top: 8px;
  text-align: justify;
  text-justify: inter-word;
}
`;
  document.documentElement.appendChild(style);

  // ============================================================
  // ENGINE DE HIGHLIGHT
  // ============================================================
  // Para não quebrar o DOM, não mexemos em <input>, <script>, etc, nem
  // reprocessamos nodes que já são nossos spans de highlight.
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);
  const HIGHLIGHT_SELECTOR = `span.${CLASS_PREFIX}-base`;
  const isSkippable = (node) =>
    node &&
    (SKIP_TAGS.has(node.nodeName) || node.closest?.(`${HIGHLIGHT_SELECTOR}, script, style, noscript, textarea, input`));

  // Pega o índice da coluna (TD) dentro do TR
  function getColumnIndex(td) {
    const tr = td?.parentElement;
    if (!tr) return -1;
    return Array.prototype.indexOf.call(tr.children, td);
  }

  // Confere se um TD está numa coluna cujo cabeçalho é um dos alvos
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

    // Caminha de baixo pra cima no thead para achar o cabeçalho "real"
    // e respeitar colspan.
    for (let r = headerRows.length - 1; r >= 0; r--) {
      const row = headerRows[r];
      let idx = 0;

      for (const cell of row.children) {
        const span = parseInt(cell.getAttribute("colspan")) || 1;

        // Se a coluna está dentro do intervalo desse TH
        if (idx <= colIndex && colIndex < idx + span) {
          const text = (cell.textContent || "").trim().toLowerCase();
          return TARGET_HEADERS.some((h) => text.includes(h));
        }
        idx += span;
      }
    }
    return false;
  }

  // Sobe no DOM até encontrar o TD pai e verifica se é uma coluna alvo
  function isInTargetCell(textNode) {
    let el = textNode?.parentElement;
    while (el && el !== document.body && el.nodeName !== "TD") el = el.parentElement;
    if (!el || el.nodeName !== "TD") return false;
    return isTargetColumn(el);
  }

  // Estado atual (configs+regex) do highlight (depende do dia e da data fixa)
  let STATE = buildConfigs();

  // Injeta classes dinâmicas dos dias úteis (wd-0..wd-N) com cores calculadas.
  // Isso evita hardcode de "7 cores" e mantém coerente perto de finais de semana.
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

  // Remove todos os highlights (volta o texto ao normal).
  // Usado quando a data fixa muda, ou quando vira o dia.
  function unwrapAllHighlights(root) {
    const spans = root.querySelectorAll(`span.${CLASS_PREFIX}-base`);
    for (const sp of spans) {
      const txt = document.createTextNode(sp.textContent || "");
      sp.replaceWith(txt);
    }
  }

  // Realça datas dentro de um único TextNode (se estiver em coluna alvo).
  function highlightInTextNode(textNode) {
    if (!isInTargetCell(textNode)) return;

    const text = textNode.nodeValue;
    if (!text) return;

    // Reset do lastIndex por regex (porque usamos /g)
    for (const cfg of STATE.configs) cfg.info.regex.lastIndex = 0;

    // Coleta matches de TODAS as datas alvo
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

    // Ordena e remove sobreposições.
    // Regra: se empatar, FIXED tem prioridade (kind="fixed").
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

    // Reconstrói o node como fragment: texto normal + spans destacados
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

  // Varre o DOM (ou um subtree) e tenta realçar TextNodes candidatos.
  // Otimizações:
  // - só aceita nodes que contenham "/" ou "-"
  // - usa quickStrings pra filtrar antes do regex
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

  // Recalcula configs (ex.: mudou data fixa ou virou o dia) e reprocessa a página.
  function rebuildStateAndRehighlight() {
    STATE = buildConfigs();
    ensureWeekdayDynamicClasses();
    unwrapAllHighlights(document.body);
    walkAndHighlight(document.body);
  }

  // ============================================================
  // PAINEL (SOMENTE NO TOPO)
  // ============================================================
  // O painel é acessado APENAS via menu do Tampermonkey (sem atalho).
  function openPanel() {
    const topDoc = getTopDocumentSafe();

    // Evita abrir duas vezes: checa no document do topo
    if (topDoc.getElementById(`${CLASS_PREFIX}-panel-overlay`)) return;

    const overlay = topDoc.createElement("div");
    overlay.id = `${CLASS_PREFIX}-panel-overlay`;

    const panel = topDoc.createElement("div");
    panel.id = `${CLASS_PREFIX}-panel`;

    const fixed = getStoredFixedDate();

    panel.innerHTML = `
      <h3>PROJUDI • DATA FIXA (REALCE PERSISTENTE)</h3>

      <div class="row">
        <input id="${CLASS_PREFIX}-date-input" type="date" value="${fixed ? fixed : ""}" />
        <button class="primary" id="${CLASS_PREFIX}-save">Salvar</button>
      </div>

      <div class="row">
        <button id="${CLASS_PREFIX}-reset">Resetar data fixa</button>
        <button id="${CLASS_PREFIX}-close">Fechar</button>
      </div>

      <div class="status" id="${CLASS_PREFIX}-status"></div>

      <div class="hint">
        O script destaca: hoje + próximos ${WINDOW_DAYS - 1} dias (total ${WINDOW_DAYS}).
        Dias úteis usam gradiente “quente → frio”. Sábado e domingo aparecem com cor específica.
        A “data fixa” fica destacada sempre (inclusive datas passadas) até você resetar aqui.
      </div>
    `;

    overlay.appendChild(panel);
    topDoc.body.appendChild(overlay);

    const $ = (id) => topDoc.getElementById(id);
    const statusEl = $(`${CLASS_PREFIX}-status`);
    const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg || ""; };

    // Fechar pelo botão
    $(`${CLASS_PREFIX}-close`).addEventListener("click", () => overlay.remove());

    // Fechar clicando fora do painel
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Salvar data fixa
    $(`${CLASS_PREFIX}-save`).addEventListener("click", () => {
      const v = $(`${CLASS_PREFIX}-date-input`).value || "";
      const d = v ? ymdToDate(v) : null;
      if (!d) {
        setStatus("Data inválida. Use o seletor de data.");
        return;
      }
      setStoredFixedDate(v);
      setStatus(`Data fixa salva: ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}.`);
      rebuildStateAndRehighlight();
    });

    // Resetar data fixa (remove do storage)
    $(`${CLASS_PREFIX}-reset`).addEventListener("click", () => {
      clearStoredFixedDate();
      $(`${CLASS_PREFIX}-date-input`).value = "";
      setStatus("Data fixa removida.");
      rebuildStateAndRehighlight();
    });

    // Status inicial
    if (fixed) {
      const d = ymdToDate(fixed);
      if (d) setStatus(`Ativa: ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}.`);
    } else {
      setStatus("Nenhuma data fixa ativa.");
    }
  }

  // Registra o menu uma única vez, mesmo se o script rodar dentro de iframe.
  if (typeof GM_registerMenuCommand === "function") {
  let topWin;
  try { topWin = window.top; } catch { topWin = window; }

  // Flag no topo para evitar duplicação
  if (!topWin.__tm_hl7d_menu_registered) {
    topWin.__tm_hl7d_menu_registered = true;
    GM_registerMenuCommand("Abrir Painel", openPanel);
  }
}

  // ============================================================
  // INIT (executa no topo e no iframe)
  // ============================================================
  ensureWeekdayDynamicClasses();
  walkAndHighlight(document.body);

  // Observa mudanças no DOM (Projudi injeta conteúdo dinamicamente)
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
  mo.observe(document.body, { childList: true, subtree: true });

  // Revalida mudança de dia com a página aberta:
  // - quando vira o dia, muda a janela e as cores.
  // Checamos a cada 5 minutos, custo baixo e suficiente.
  let lastYMD = `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-${pad2(new Date().getDate())}`;
  setInterval(() => {
    const now = new Date();
    const ymd = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    if (ymd !== lastYMD) {
      lastYMD = ymd;
      rebuildStateAndRehighlight();
    }
  }, 5 * 60 * 1000);
})();