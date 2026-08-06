// ==UserScript==
// @name         Intimações
// @namespace    projudi-intimacao-page.user.js
// @version      2026.08.05-23:43
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Reúne intimações, exporta CSV/PDF, permite triagem local e destaca/filtra prazos do Projudi.
// @author       lourencosv
// @contributor  Codex <codex@openai.com>
// @contributor  Claude <noreply@anthropic.com>
// @license      CC BY-NC 4.0
// @updateURL    https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/intimacoes/projudi-intimacao-page.user.js
// @downloadURL  https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/intimacoes/projudi-intimacao-page.user.js
// @match        *://projudi.tjgo.jus.br/*
// @match        *://projudi-teste.tjgo.jus.br/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// @connect      cdn.jsdelivr.net
// ==/UserScript==

(() => {
  'use strict';

  // Compatibilidade local com gestores de userscript, sem publicar APIs no window do Projudi.
  const gmRegisterMenuCommand = typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : () => null;
  const gmXmlHttpRequest = typeof GM_xmlhttpRequest === 'function'
    ? GM_xmlhttpRequest
    : (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function'
      ? opts => GM.xmlHttpRequest(opts)
      : opts => {
        try {
          fetch(opts.url, { method: opts.method || 'GET', headers: opts.headers || {} })
            .then(response => response.text().then(responseText => ({ status: response.status, responseText, finalUrl: response.url })))
            .then(result => { if (typeof opts.onload === 'function') opts.onload(result); })
            .catch(error => { if (typeof opts.onerror === 'function') opts.onerror(error); });
        } catch (error) {
          if (typeof opts.onerror === 'function') opts.onerror(error);
        }
        return null;
      });
  (function pjShortcut() {
    // Leader: Ctrl+; libera 1500ms para pressionar I (Intimacoes).
    var ID = 'intimacoes';
    var CODE = 'KeyI';
    var isTop = window.top === window.self;
    var leaderUntil = 0;
    function inField(e) {
      var t = e && e.target;
      var tag = (t && t.tagName) || '';
      return /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (t && t.isContentEditable);
    }
    function openHere() {
      if (isTop) { try { openModal(); } catch (_) {} }
      else { try { window.top.postMessage({ type: 'pj-open-panel', script: ID }, window.location.origin); } catch (_) {} }
    }
    window.addEventListener('keydown', function (e) {
      if (!e || e.repeat) return;
      if (inField(e)) return;
      var isLeader = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.code === 'Semicolon';
      if (isLeader) {
        e.preventDefault();
        e.stopPropagation();
        leaderUntil = Date.now() + 1500;
        return;
      }
      if (e.code === CODE && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (leaderUntil > Date.now()) {
          leaderUntil = 0;
          e.preventDefault();
          e.stopPropagation();
          openHere();
        }
      }
    }, true);
    if (isTop) {
      window.addEventListener('message', function (ev) {
        if (ev.origin !== window.location.origin) return;
        if (!ev || !ev.data || ev.data.type !== 'pj-open-panel' || ev.data.script !== ID) return;
        try { openModal(); } catch (_) {}
      });
    }
  })();

  // Projudi serve o iframe interno na mesma origem do top, fazendo o
  // userscript rodar duas vezes. Saimos cedo nos iframes para evitar o
  // registro duplicado do menu - o menu sera registrado apenas no top.
  if (window.top !== window.self) {
    return;
  }

  const SCRIPT_NAME = 'Intimações';
  const SCRIPT_ID = 'projudi-intimacao-page';
  const SCRIPT_VERSION =
    typeof GM_info !== 'undefined' && GM_info?.script?.version
      ? String(GM_info.script.version)
      : '4.5';
  const LOG_PREFIX = '[Intimações]';

  const SELECTORS = {
    mainFrame: 'iframe#Principal, iframe[name="userMainFrame"]',
    title: 'h1, h2, .Titulo, .titulo',
    table: 'table',
    relevantTable: 'table.Tabela, table#Tabela',
    pager: '#Paginacao, .Paginacao',
    pagerClickable: '#Paginacao a, #Paginacao button, .Paginacao a, .Paginacao button, .BotaoIr, a[href*="buscaDados"], [onclick*="buscaDados"]',
    processAction: 'a[href*="BuscaProcesso"], button[onclick*="BuscaProcesso"], [onclick*="BuscaProcesso"]',
    nativeDoneAction:
      'button[onclick*="DescartarPendenciaProcesso"], a[href*="DescartarPendenciaProcesso"], button[title*="marcar" i], a[title*="marcar" i]'
  };

  const IDS = {
    hostStyle: 'pjip-host-style',
    frameStyle: 'pjip-frame-style',
    hostRoot: 'pjip-root',
    actionsPanel: 'pjip-actions-panel',
    actionsFab: 'pjip-actions-fab',
    todayDeadlineRoot: 'pjip-today-deadline-root',
    todayDeadlineFab: 'pjip-today-deadline-fab',
    todayDeadlineCount: 'pjip-today-deadline-count',
    toast: 'pjip-toast',
    modalOverlay: 'pjip-modal-overlay',
    modalPanel: 'pjip-modal-panel'
  };

  const STORAGE_KEYS = {
    store: 'projudi-suite::intimacoes::data',
    backup: 'projudi-suite::intimacoes::gist'
  };

  const DEADLINE = {
    targetHeaders: ['data limite', 'possivel data limite', 'possível data limite'],
    filterDateKey: 'projudi_highlight_filter_date_v1',
    filterEnabledKey: 'projudi_highlight_filter_enabled_v1',
    filterModeKey: 'projudi_highlight_filter_mode_v1',
    filterRangeStartKey: 'projudi_highlight_filter_range_start_v1',
    filterRangeEndKey: 'projudi_highlight_filter_range_end_v1',
    settingsSyncEvent: 'projudi:deadline-settings-changed',
    filterHiddenAttr: 'data-tm-filter-hidden'
  };

  const BACKUP_DEFAULTS = {
    enabled: false,
    gistId: '',
    token: '',
    fileName: 'projudi-intimacao-page.json',
    autoBackupOnSave: false,
    lastBackupAt: '',
    lastBackupSignature: ''
  };
  const BACKUP_SCHEMA = 'backup-v1';
  const AUTO_BACKUP_IDLE_DELAY_MS = 30000;
  const AUTO_BACKUP_MIN_INTERVAL_MS = 15 * 60 * 1000;

  const PRIVATE = {
    tableContext: Symbol('tableContext'),
    frameHooks: Symbol('frameHooks'),
    patchFlag: Symbol('patchFlag'),
    refreshToken: Symbol('refreshToken'),
    rowSignature: Symbol('rowSignature')
  };

  const PDF_CDNS = {
    jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
    autoTable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
  };
  const FA_SPRITE_URL = 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@7.3.1/sprites/solid.svg';
  const SUITE_UI_CSS = String.raw`
    [data-pj-suite-ui] { --pj-suite-font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --pj-suite-focus: rgba(31, 105, 213, .25); --pj-suite-text: #0f2742; font-family: var(--pj-suite-font) !important; color: var(--pj-suite-text); }
    [data-pj-suite-ui], [data-pj-suite-ui] *, [data-pj-suite-ui] *::before, [data-pj-suite-ui] *::after { box-sizing: border-box; }
    [data-pj-suite-ui] :where(button, input, select, textarea) { font-family: inherit !important; }
    [data-pj-suite-ui] :where(button, input, select, textarea):focus-visible { outline: 3px solid var(--pj-suite-focus) !important; outline-offset: 2px !important; }
    [data-pj-suite-ui] :where(button, input, select, textarea):disabled { cursor: not-allowed !important; opacity: .58 !important; }
    [data-pj-suite-ui] .pj-suite-fa { display: inline-block; width: 1em; height: 1em; flex: 0 0 auto; overflow: visible; vertical-align: -.125em; fill: currentColor; }
    [data-pj-suite-ui] .pj-suite-fa.fa-2xs { font-size: .625em; }
    [data-pj-suite-ui] .pj-suite-fa.fa-xs { font-size: .75em; }
    [data-pj-suite-ui] .pj-suite-fa.fa-sm { font-size: .875em; }
    [data-pj-suite-ui] .pj-suite-fa.fa-lg { font-size: 1.25em; }
    [data-pj-suite-ui] .pj-suite-fa.fa-xl { font-size: 1.5em; }
    [data-pj-suite-ui] .pj-suite-fa.fa-2xl { font-size: 2em; }
    [data-pj-suite-ui] .pj-suite-fa.fa-2x { font-size: 2em; }
    [data-pj-suite-ui] .pj-suite-fa.fa-3x { font-size: 3em; }
    [data-pj-suite-ui] .pj-suite-fa.fa-fw { width: 1.25em; }
    [data-pj-suite-ui] .pj-suite-fa.fa-spin { animation: pj-suite-fa-spin 2s linear infinite; }
    [data-pj-suite-ui] .pj-suite-fa.fa-pulse { animation: pj-suite-fa-spin 1s steps(8) infinite; }
    @keyframes pj-suite-fa-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { [data-pj-suite-ui], [data-pj-suite-ui] * { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
  `;
  const BACKUP_UI_CSS = String.raw`
    .pj-backup-ui__popover { position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; display: none !important; align-items: center !important; justify-content: center !important; padding: 20px !important; background: rgba(15, 23, 42, .42) !important; backdrop-filter: blur(2px); }
    .pj-backup-ui__popover[data-open="true"] { display: flex !important; }
    .pj-backup-ui__dialog { display: block !important; width: min(760px, calc(100vw - 40px)) !important; max-height: min(86vh, 780px) !important; padding: 20px !important; overflow: auto !important; box-sizing: border-box !important; border: 1px solid #d7e1ee !important; border-radius: 16px !important; background: #fff !important; box-shadow: 0 28px 80px rgba(2, 6, 23, .34) !important; color: #0f2742 !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; font-size: 14px !important; line-height: 1.4 !important; }
    .pj-backup-ui__dialog, .pj-backup-ui__dialog * { box-sizing: border-box; }
    .pj-backup-ui__dialog > .pjc-card-body { width: 100% !important; padding: 0 !important; }
    .pj-backup-ui__dialog .pjc-stack { gap: 0 !important; }
    .pj-backup-ui__header { display: flex !important; align-items: flex-start !important; justify-content: space-between !important; gap: 16px !important; margin: 0 0 18px !important; }
    .pj-backup-ui__title { display: flex !important; align-items: center !important; gap: 7px !important; margin: 0 0 4px !important; color: #173a61 !important; font-size: 13px !important; font-weight: 800 !important; letter-spacing: .045em !important; line-height: 1.25 !important; text-transform: uppercase !important; }
    .pj-backup-ui__description { margin: 0 !important; color: #5d7189 !important; font-size: 13px !important; line-height: 1.4 !important; }
    .pj-backup-ui__close { display: inline-flex !important; align-items: center !important; justify-content: center !important; flex: 0 0 auto !important; width: 36px !important; min-width: 36px !important; height: 36px !important; padding: 0 !important; border: 1px solid #c8d6e6 !important; border-radius: 999px !important; background: #f7faff !important; color: #173a61 !important; cursor: pointer !important; font-size: 16px !important; }
    .pj-backup-ui__grid { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 12px !important; margin: 0 !important; }
    .pj-backup-ui__field { display: grid !important; gap: 6px !important; min-width: 0 !important; }
    .pj-backup-ui__field--full { grid-column: 1 / -1 !important; }
    .pj-backup-ui__field label { color: #294766 !important; font-size: 12px !important; font-weight: 700 !important; }
    .pj-backup-ui__input { width: 100% !important; min-width: 0 !important; height: 44px !important; padding: 9px 12px !important; border: 1px solid #c7d6e6 !important; border-radius: 10px !important; background: #fff !important; color: #102a46 !important; font-family: inherit !important; font-size: 14px !important; line-height: 1.2 !important; }
    .pj-backup-ui__input:focus-visible, .pj-backup-ui__button:focus-visible, .pj-backup-ui__close:focus-visible, .pj-backup-ui__toggle:focus-within { outline: 3px solid rgba(31, 105, 213, .25) !important; outline-offset: 2px !important; }
    .pj-backup-ui__toggles { display: flex !important; align-items: center !important; flex-wrap: wrap !important; gap: 10px !important; margin: 14px 0 0 !important; }
    .pj-backup-ui__toggle { display: inline-flex !important; align-items: center !important; justify-content: flex-start !important; gap: 7px !important; min-height: 38px !important; padding: 8px 11px !important; border: 1px solid #d7e1ee !important; border-radius: 999px !important; background: #f8fbff !important; color: #294766 !important; font-size: 12px !important; font-weight: 650 !important; }
    .pj-backup-ui__toggle input { margin: 0 !important; accent-color: #1f69d5; }
    .pj-backup-ui__actions { display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)) !important; gap: 10px !important; margin: 18px 0 0 !important; }
    .pj-backup-ui__button { display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 7px !important; min-width: 0 !important; min-height: 44px !important; padding: 9px 11px !important; border: 1px solid #c8d6e6 !important; border-radius: 10px !important; background: #fff !important; color: #173a61 !important; cursor: pointer !important; font-family: inherit !important; font-size: 13px !important; font-weight: 700 !important; line-height: 1.2 !important; text-align: center !important; }
    .pj-backup-ui__button--primary { border-color: #1f69d5 !important; background: #1f69d5 !important; color: #fff !important; }
    .pj-backup-ui__button--success { border-color: #16833a !important; background: #18883f !important; color: #fff !important; }
    .pj-backup-ui__button--danger { border-color: #f2b8b5 !important; background: #fff7f7 !important; color: #b42318 !important; }
    .pj-backup-ui__status { min-height: 20px !important; margin: 14px 0 0 !important; color: #47627f !important; font-size: 12px !important; font-weight: 600 !important; }
    .pj-backup-ui__status[data-state="error"] { color: #b42318 !important; }
    .pj-backup-ui__status[data-state="success"] { color: #087a3e !important; }
    .pj-backup-ui__last { margin: 4px 0 0 !important; color: #8191a5 !important; font-size: 11px !important; }
    .pj-backup-ui__dialog .pj-suite-fa { width: 1em; height: 1em; }
    @media (max-width: 720px) { .pj-backup-ui__popover { padding: 10px !important; } .pj-backup-ui__dialog { width: calc(100vw - 20px) !important; padding: 16px !important; } .pj-backup-ui__grid, .pj-backup-ui__actions { grid-template-columns: 1fr !important; } .pj-backup-ui__field--full { grid-column: auto !important; } .pj-backup-ui__toggles { align-items: stretch !important; flex-direction: column !important; } }
  `;

  // Camada visual nova do workspace. Mantida separada para facilitar a
  // reutilizacao dos mesmos tokens nas demais extensoes juridicas.
  const INTIMACOES_REDESIGN_CSS = String.raw`
    #${IDS.modalOverlay} {
      padding: 18px;
      background: rgba(23, 32, 51, .18);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    #${IDS.modalPanel} {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      width: min(1440px, calc(100vw - 32px));
      height: min(94vh, 960px);
      max-height: calc(100vh - 28px);
      min-height: 0;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      background: #fff;
      box-shadow: 0 28px 80px rgba(15, 23, 42, .18);
      color: #172033;
    }
    #${IDS.modalPanel} :where(button, input, select, textarea):focus-visible,
    #${IDS.hostRoot} :where(button, input, select):focus-visible {
      outline: 3px solid rgba(37, 99, 235, .2);
      outline-offset: 2px;
      border-color: #2563eb;
    }
    .pjip-modal-head {
      min-height: 76px;
      padding: 16px 28px;
      border-bottom: 1px solid #e2e8f0;
      background: #fff;
      color: #172033;
    }
    .pjip-modal-brand { gap: 12px; }
    .pjip-modal-brand-icon {
      width: 42px;
      height: 42px;
      border: 1px solid #dbe4ef;
      border-radius: 12px;
      background: #f8fafc;
      color: #1e3a5f;
      box-shadow: none;
      font-size: 18px;
    }
    .pjip-modal-title { color: #172033; font-size: 20px; font-weight: 800; letter-spacing: -.02em; }
    .pjip-modal-subtitle { color: #64748b; font-size: 12px; opacity: 1; }
    .pjip-modal-close {
      width: 38px;
      min-width: 38px;
      height: 38px;
      border: 1px solid #e2e8f0;
      background: #fff;
      color: #64748b;
      font-size: 20px;
    }
    .pjip-modal-close:hover { background: #f8fafc; color: #172033; }
    .pjip-modal-body {
      display: grid;
      grid-template-columns: 196px minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      grid-template-areas: "nav workspace";
      gap: 0;
      min-height: 0;
      padding: 0;
      overflow: hidden;
      background: #f8fafc;
      container: pjip-modal-body / inline-size;
    }
    .pjip-dashboard-nav {
      grid-area: nav;
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: 100%;
      box-sizing: border-box;
      padding: 24px 14px 18px;
      border-right: 1px solid #e2e8f0;
      background: #fff;
    }
    .pjip-dashboard-nav__label {
      margin: 0 10px 12px;
      color: #94a3b8;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .1em;
      text-transform: uppercase;
    }
    .pjip-dashboard-nav__items { display: grid; gap: 4px; }
    .pjip-dashboard-nav__button {
      display: flex;
      align-items: center;
      gap: 11px;
      width: 100%;
      min-height: 42px;
      padding: 10px 11px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      font: 600 13px/1.2 inherit;
      text-align: left;
    }
    .pjip-dashboard-nav__button i { width: 18px; color: #94a3b8; text-align: center; }
    .pjip-dashboard-nav__button:hover { background: #f8fafc; color: #172033; }
    .pjip-dashboard-nav__button[data-active="true"] {
      border-color: #dbeafe;
      background: #eff6ff;
      color: #1d4ed8;
    }
    .pjip-dashboard-nav__button[data-active="true"] i { color: #2563eb; }
    .pjip-dashboard-nav__footer {
      display: grid;
      gap: 12px;
      margin-top: auto;
      padding-top: 18px;
      border-top: 1px solid #eef2f7;
    }
    .pjip-dashboard-nav__footer::after { width: 42px; height: 4px; border-radius: 999px; background: #dbeafe; content: ''; }
    .pjip-dashboard-workspace {
      grid-area: workspace;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(250px, 286px);
      gap: 20px;
      height: 100%;
      min-width: 0;
      min-height: 0;
      padding: 24px;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
    }
    .pjip-dashboard-workspace::-webkit-scrollbar { width: 10px; }
    .pjip-dashboard-workspace::-webkit-scrollbar-track { background: #f1f5f9; }
    .pjip-dashboard-workspace::-webkit-scrollbar-thumb { border: 2px solid #f1f5f9; border-radius: 999px; background: #cbd5e1; }
    .pjip-dashboard-workspace::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .pjip-dashboard-content { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-flow: row; align-content: start; gap: 20px; min-width: 0; width: 100%; }
    .pjip-dashboard-context { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .pjip-dashboard-eyebrow { margin: 0 0 7px; color: #64748b; font-size: 12px; font-weight: 700; }
    .pjip-dashboard-heading { margin: 0; color: #172033; font-size: 25px; font-weight: 800; letter-spacing: -.03em; line-height: 1.12; }
    .pjip-dashboard-description { margin: 7px 0 0; color: #64748b; font-size: 13px; }
    .pjip-dashboard-header-tools { display: flex; align-items: center; gap: 10px; min-width: 300px; }
    .pjip-dashboard-header-search { position: relative; display: block; flex: 1 1 auto; min-width: 0; height: 40px; }
    .pjip-dashboard-header-search > :is(i, .pj-suite-fa) { position: absolute; top: 50%; left: 13px; z-index: 1; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; color: #64748b; line-height: 1; pointer-events: none; transform: translateY(-50%); }
    .pjip-dashboard-header-search input { display: block; width: 100%; height: 40px; min-height: 40px; box-sizing: border-box; padding: 9px 12px 9px 36px; border: 1px solid #e2e8f0; border-radius: 9px; background: #fff; color: #172033; font: 500 12px/1.2 inherit; }
    .pjip-dashboard-export { min-height: 40px; white-space: nowrap; }
    .pjip-summary { display: grid; grid-area: auto; grid-template-columns: minmax(0, 1fr); gap: 20px; min-width: 0; }
    .pjip-dashboard-content > .pjip-summary,
    .pjip-dashboard-content > .pjip-toolbar,
    .pjip-dashboard-content > .pjip-deadline,
    .pjip-dashboard-content > .pjip-list-shell { grid-area: auto; grid-column: 1; min-width: 0; }
    .pjip-overview { display: contents; }
    .pjip-summary-head, .pjip-summary-actions, .pjip-toolbar-meta { display: none; }
    .pjip-summary-grid { grid-area: auto; display: contents; }
    .pjip-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; min-width: 0; }
    .pjip-stat {
      display: grid;
      grid-template-columns: 38px minmax(0, 1fr);
      grid-template-rows: auto auto;
      column-gap: 11px;
      align-items: center;
      min-height: 84px;
      padding: 14px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 1px 2px rgba(15, 23, 42, .03);
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
      overflow: hidden;
      cursor: pointer;
      font: inherit;
      text-align: left;
    }
    .pjip-stat:hover { border-color: #bfdbfe; box-shadow: 0 5px 16px rgba(37, 99, 235, .08); }
    .pjip-stat[data-active="true"] { border-color: #93c5fd; box-shadow: inset 0 0 0 1px #2563eb; }
    .pjip-stat-icon { grid-row: 1 / span 2; display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 999px; background: #f1f5f9; color: #475569; font-size: 16px; }
    .pjip-stat-value { color: #172033; font-size: 25px; font-weight: 800; line-height: 1; }
    .pjip-stat-label { overflow: hidden; color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: .01em; text-overflow: ellipsis; white-space: nowrap; }
    .pjip-stat--late .pjip-stat-icon { background: #fef2f2; color: #dc2626; }
    .pjip-stat--late .pjip-stat-value { color: #dc2626; }
    .pjip-stat--soon .pjip-stat-icon { background: #fff7ed; color: #d97706; }
    .pjip-stat--soon .pjip-stat-value { color: #d97706; }
    .pjip-stat--open .pjip-stat-icon { background: #eff6ff; color: #2563eb; }
    .pjip-stat--open .pjip-stat-value { color: #2563eb; }
    .pjip-stat--done .pjip-stat-icon { background: #f0fdf4; color: #15803d; }
    .pjip-stat--done .pjip-stat-value { color: #15803d; }
    .pjip-toolbar {
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 1px 2px rgba(15, 23, 42, .03);
    }
    .pjip-toolbar .pjip-section-title { display: none; }
    .pjip-toolbar-grid { display: grid; grid-template-columns: minmax(210px, 1fr) 132px 142px; gap: 9px; }
    .pjip-toolbar-row { display: contents; }
    .pjip-field { display: grid; gap: 6px; }
    .pjip-field label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .pjip-toolbar input[type="search"], .pjip-toolbar select {
      width: 100%; min-height: 40px; padding: 9px 11px; border: 1px solid #e2e8f0; border-radius: 9px; background: #fff; color: #334155; font: 600 12px/1.2 inherit;
    }
    .pjip-toolbar input[type="search"] { padding-left: 12px; }
    .pjip-checks { display: flex; flex-wrap: wrap; gap: 7px; }
    .pjip-checks label { min-height: 30px; padding: 7px 9px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; color: #64748b; font-size: 11px; }
    .pjip-deadline { display: grid; gap: 14px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; box-shadow: 0 1px 2px rgba(15, 23, 42, .03); }
    .pjip-deadline-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .pjip-deadline-head .pjip-section-title { flex: 0 0 auto; width: max-content; max-width: 100%; white-space: nowrap; }
    .pjip-deadline .pjip-section-title { margin: 0; color: #172033; font-size: 13px; letter-spacing: 0; text-transform: none; }
    .pjip-deadline .pjip-section-title :is(i, .pj-suite-fa) { color: #2563eb; }
    .pjip-deadline-status { color: #64748b; font-size: 11px; font-weight: 600; text-align: right; }
    .pjip-deadline-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .pjip-deadline-card { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
    .pjip-deadline-card-title { color: #334155; font-size: 11px; font-weight: 800; letter-spacing: 0; text-transform: none; }
    .pjip-deadline-card-desc { min-height: 31px; color: #94a3b8; font-size: 10px; line-height: 1.35; }
    .pjip-deadline-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; height: auto; }
    .pjip-deadline-row--range { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .pjip-deadline-row > input, .pjip-deadline-row > button { width: 100%; height: 38px; min-height: 38px; padding: 0 9px; font-size: 11px; }
    .pjip-deadline-row > input[type="date"] { border: 1px solid #e2e8f0; border-radius: 8px; }
    .pjip-modal-btn { min-height: 38px; padding: 8px 10px; border: 1px solid #dbe4ef; border-radius: 8px; background: #fff; color: #334155; font-size: 11px; font-weight: 700; }
    .pjip-modal-btn:hover { border-color: #bfdbfe; background: #f8fbff; color: #1d4ed8; }
    .pjip-modal-btn--primary { border-color: #2563eb; background: #2563eb; color: #fff; }
    .pjip-modal-btn--primary:hover { border-color: #1d4ed8; background: #1d4ed8; color: #fff; }
    .pjip-modal-btn--ghost { background: #f8fafc; }
    .pjip-modal-btn--danger { border-color: #fecaca; background: #fff7f7; color: #b42318; }
    .pjip-list-shell { display: grid; gap: 11px; min-width: 0; padding: 0; border: 0; background: transparent; box-shadow: none; }
    .pjip-list-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
    .pjip-list-head .pjip-section-title { margin: 0; color: #172033; font-size: 15px; letter-spacing: -.01em; text-transform: none; }
    .pjip-list-head .pjip-section-title :is(i, .pj-suite-fa) { color: #2563eb; }
    .pjip-list-meta { margin-top: 4px; color: #64748b; font-size: 11px; }
    .pjip-table-scroll { min-width: 0; overflow-x: auto; overflow-y: hidden; overscroll-behavior-inline: contain; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; scrollbar-color: #cbd5e1 transparent; }
    .pjip-table-head, .pjip-item { display: grid; grid-template-columns: 72px minmax(136px, 1.1fr) 94px minmax(180px, 1.65fr) 100px 86px 110px; gap: 12px; align-items: center; min-width: 886px; }
    .pjip-table-head { padding: 0 12px 8px; border-bottom: 1px solid #e2e8f0; color: #94a3b8; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
    .pjip-list { display: grid; gap: 0; min-width: 886px; overflow: visible; background: #fff; }
    .pjip-item { position: relative; min-height: 76px; padding: 12px; border: 0; border-bottom: 1px solid #eef2f7; border-radius: 0; background: #fff; box-shadow: none; cursor: pointer; }
    .pjip-item:last-child { border-bottom: 0; }
    .pjip-item:hover { background: #fbfdff; border-color: #eef2f7; box-shadow: none; }
    .pjip-item[data-selected="true"] { background: #eff6ff; box-shadow: inset 3px 0 0 #2563eb; }
    .pjip-item--done { opacity: .7; }
    .pjip-item-top { display: contents; }
    .pjip-item-priority { display: inline-flex; align-items: center; gap: 7px; color: #64748b; font-size: 11px; font-weight: 700; line-height: 1.2; }
    .pjip-item-priority::before { width: 7px; height: 7px; border-radius: 999px; background: #94a3b8; content: ''; }
    .pjip-item-priority--critical { color: #b42318; }
    .pjip-item-priority--critical::before { background: #b42318; }
    .pjip-item-priority--high { color: #c2410c; }
    .pjip-item-priority--high::before { background: #dc2626; }
    .pjip-item-priority--medium { color: #b54708; }
    .pjip-item-priority--medium::before { background: #d97706; }
    .pjip-item-priority--low::before { background: #2563eb; }
    .pjip-item-priority--done::before { background: #16a34a; }
    .pjip-item-process, .pjip-item-intimation, .pjip-item-movement, .pjip-item-deadline { min-width: 0; }
    .pjip-item-process strong, .pjip-item-intimation strong { display: block; overflow: hidden; color: #172033; font-size: 11px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
    .pjip-item-process span, .pjip-item-intimation span { display: block; overflow: hidden; margin-top: 4px; color: #64748b; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .pjip-item-movement { overflow: hidden; color: #475569; font-size: 11px; line-height: 1.35; }
    .pjip-item-deadline strong { display: block; color: #334155; font-size: 11px; }
    .pjip-item-deadline span { display: block; margin-top: 4px; color: #64748b; font-size: 10px; }
    .pjip-item-deadline--late strong, .pjip-item-deadline--late span { color: #b42318; }
    .pjip-item-deadline--soon strong, .pjip-item-deadline--soon span { color: #b54708; }
    .pjip-item-deadline--critical strong, .pjip-item-deadline--critical span { color: #b42318; }
    .pjip-item-deadline--today strong, .pjip-item-deadline--today span { color: #c2410c; }
    .pjip-item-status { display: inline-flex; width: fit-content; padding: 5px 8px; border-radius: 6px; background: #f1f5f9; color: #475569; font-size: 10px; font-weight: 800; }
    .pjip-item-status--done { background: #f0fdf4; color: #15803d; }
    .pjip-item-status--late { background: #fef2f2; color: #b42318; }
    .pjip-item-status--soon { background: #fff7ed; color: #b54708; }
    .pjip-item-actions { display: flex; flex-wrap: nowrap; align-items: center; justify-content: flex-end; gap: 5px; min-width: 0; }
    .pjip-item-action { display: inline-flex; flex: 0 0 30px; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 1px solid transparent; border-radius: 7px; background: transparent; color: #64748b; cursor: pointer; }
    .pjip-item-action:hover { border-color: #dbeafe; background: #fff; color: #2563eb; }
    .pjip-item-action--danger:hover { border-color: #fecaca; color: #b42318; }
    .pjip-item-grid, .pjip-item-meta { display: none; }
    .pjip-section-title > :is(i, .pj-suite-fa), .pjip-modal-btn > :is(i, .pj-suite-fa), .pjip-item-action > :is(i, .pj-suite-fa) { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 16px; width: 16px; height: 16px; line-height: 1; }
    .pjip-empty { padding: 36px 18px; border: 1px dashed #cbd5e1; border-radius: 12px; background: #fff; color: #64748b; text-align: center; }
    .pjip-detail {
      align-self: start;
      display: grid;
      gap: 18px;
      min-width: 0;
      padding: 18px;
      border: 1px solid #e2e8f0;
      border-radius: 13px;
      background: #fff;
      box-shadow: 0 1px 2px rgba(15, 23, 42, .03);
    }
    .pjip-detail__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid #eef2f7; }
    .pjip-detail__title { margin: 0; color: #172033; font-size: 15px; font-weight: 800; }
    .pjip-detail__subtitle { margin: 5px 0 0; color: #94a3b8; font-size: 11px; }
    .pjip-detail__icon { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9px; background: #eff6ff; color: #2563eb; }
    .pjip-detail__fields { display: grid; gap: 15px; }
    .pjip-detail__field { display: grid; gap: 5px; padding-bottom: 12px; border-bottom: 1px solid #eef2f7; }
    .pjip-detail__field:last-child { padding-bottom: 0; border-bottom: 0; }
    .pjip-detail__label { color: #64748b; font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .pjip-detail__value { color: #334155; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
    .pjip-detail__value--strong { color: #172033; font-weight: 800; }
    .pjip-detail__deadline { color: #b54708; font-weight: 800; }
    .pjip-detail__actions { display: grid; gap: 8px; }
    .pjip-detail__actions .pjip-modal-btn { width: 100%; }
    .pjip-detail--empty { align-content: center; min-height: 260px; text-align: center; }
    .pjip-detail--empty .pjip-detail__icon { margin: 0 auto; background: #f1f5f9; color: #64748b; }
    .pjip-detail--empty p { margin: 0; color: #64748b; font-size: 12px; line-height: 1.5; }
    .pjip-backup-popover { background: rgba(23, 32, 51, .32); backdrop-filter: blur(4px); }
    .pjip-actions-head { background: #1e3a5f; }
    .pjip-fab, .pjip-today-deadline-fab { border-color: #1e3a5f; background: #1e3a5f; }
    #${IDS.toast} { border-color: #1e3a5f; background: #1e3a5f; }
    @container pjip-modal-body (max-width: 1240px) {
      .pjip-dashboard-workspace { grid-template-columns: minmax(0, 1fr); }
      .pjip-detail { display: none; }
    }
    @container pjip-modal-body (max-width: 760px) {
      .pjip-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .pjip-dashboard-context { display: grid; }
      .pjip-dashboard-header-tools { min-width: 0; width: 100%; }
      .pjip-toolbar-grid { grid-template-columns: minmax(0, 1fr) 1fr; }
      .pjip-toolbar-grid > .pjip-field:first-child { grid-column: 1 / -1; }
    }
    @media (max-width: 1024px) {
      .pjip-dashboard-workspace { grid-template-columns: minmax(0, 1fr); }
      .pjip-detail { display: none; }
    }
    @media (max-width: 900px) {
      #${IDS.modalOverlay} { padding: 8px; }
      #${IDS.modalPanel} { width: calc(100vw - 12px); height: calc(100vh - 16px); max-height: none; border-radius: 14px; }
      .pjip-modal-head { padding: 13px 16px; }
      .pjip-modal-body {
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(0, 1fr);
        grid-template-areas: "nav" "workspace";
      }
      .pjip-dashboard-nav { display: flex; flex-direction: row; align-items: center; gap: 4px; overflow-x: auto; padding: 8px 12px; border-right: 0; border-bottom: 1px solid #e2e8f0; }
      .pjip-dashboard-nav__label, .pjip-dashboard-nav__footer { display: none; }
      .pjip-dashboard-nav__items { display: flex; flex: 1 1 auto; gap: 4px; }
      .pjip-dashboard-nav__button { width: auto; min-width: max-content; }
      .pjip-dashboard-workspace { padding: 18px 16px; }
      .pjip-dashboard-context { display: grid; }
      .pjip-dashboard-header-tools { min-width: 0; width: 100%; }
      .pjip-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .pjip-toolbar-grid { grid-template-columns: minmax(0, 1fr) 1fr; }
      .pjip-toolbar-grid > .pjip-field:first-child { grid-column: 1 / -1; }
      .pjip-deadline-grid { grid-template-columns: 1fr; }
      .pjip-table-head { display: none; }
      .pjip-table-scroll { overflow-x: visible; border: 0; border-radius: 0; }
      .pjip-list { min-width: 0; }
      .pjip-item { grid-template-columns: 1fr 1fr; min-width: 0; gap: 10px; padding: 14px; }
      .pjip-item-priority { grid-column: 1 / -1; }
      .pjip-item-movement { grid-column: 1 / -1; }
      .pjip-item-actions { grid-column: 1 / -1; justify-content: flex-start; }
    }
    @media (max-width: 560px) {
      .pjip-dashboard-heading { font-size: 21px; }
      .pjip-dashboard-header-tools { display: grid; grid-template-columns: 1fr auto; }
      .pjip-dashboard-export { padding: 8px; }
      .pjip-dashboard-export span { display: none; }
      .pjip-metrics { gap: 8px; }
      .pjip-stat { grid-template-columns: 30px minmax(0, 1fr); min-height: 72px; padding: 10px; }
      .pjip-stat-icon { width: 30px; height: 30px; font-size: 13px; }
      .pjip-stat-value { font-size: 20px; }
      .pjip-toolbar-grid { grid-template-columns: 1fr; }
      .pjip-toolbar-grid > .pjip-field:first-child { grid-column: auto; }
      .pjip-item { grid-template-columns: 1fr; }
      .pjip-item-priority, .pjip-item-movement, .pjip-item-actions { grid-column: auto; }
    }
  `;

  /** @type {{
   * frame: HTMLIFrameElement | null,
   * frameDoc: Document | null,
   * frameWin: Window | null,
   * frameLoadHandler: ((event: Event) => void) | null,
   * pageContext: ReturnType<typeof analyzeFrameContext> | null,
   * settleObserver: MutationObserver | null,
   * settleDebounceTimer: number,
   * settleStopTimer: number,
   * refreshTimers: number[],
   * refreshNonce: number,
   * menuRegistered: boolean,
   * hostHooksAttached: boolean,
   * menuOpen: boolean,
   * modalOpen: boolean,
   * selectedItemId: string | null,
   * modalRoot: HTMLElement | null,
   * toastTimer: number,
   * backupTimer: number,
   * pdfPromise: Promise<void> | null,
   * deadlineState: ReturnType<typeof buildDeadlineState>,
   * deadlineCellAnalysisCache: WeakMap<HTMLTableCellElement, any>,
   * deadlineTargetColsCache: WeakMap<HTMLTableElement, Set<number>>,
   * store: ReturnType<typeof loadStore>
   * }}
   */
  const state = {
    frame: null,
    frameDoc: null,
    frameWin: null,
    frameLoadHandler: null,
    pageContext: null,
    settleObserver: null,
    settleDebounceTimer: 0,
    settleStopTimer: 0,
    refreshTimers: [],
    refreshNonce: 0,
    menuRegistered: false,
    hostHooksAttached: false,
    menuOpen: false,
    modalOpen: false,
    selectedItemId: null,
    modalRoot: null,
    toastTimer: 0,
    backupTimer: 0,
    pdfPromise: null,
    deadlineState: buildDeadlineState(),
    deadlineCellAnalysisCache: new WeakMap(),
    deadlineTargetColsCache: new WeakMap(),
    store: loadStore()
  };

  init();

  /**
   * Inicializa o script com o menor numero possivel de hooks permanentes.
   */
  function init() {
    injectHostStyles();
    attachHostHooks();
    attachDeadlineHooks();
    registerMenuCommand();
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      if (!event || !event.data || event.data.type !== 'pjip:open-manager') return;
      openModal();
    });
    ensureActionMenu();
    ensureTodayDeadlineFab();
    updateActionPanelState();
    bindMainFrame();
  }

  /**
   * Anexa hooks globais uma unica vez.
   */
  function attachHostHooks() {
    if (state.hostHooksAttached) return;
    state.hostHooksAttached = true;

    document.addEventListener(
      'click',
      (event) => {
        const target = resolveEventElement(event.target);
        if (!target) return;
        const root = document.getElementById(IDS.hostRoot);
        if (root && !root.contains(target)) {
          state.menuOpen = false;
          updateActionPanelState();
        }
      },
      true
    );

    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape') return;
        state.menuOpen = false;
        updateActionPanelState();
        if (state.modalOpen) closeModal();
      },
      true
    );
  }

  /**
   * Escreve log de informacao pontual.
   * @param {string} message
   * @param {unknown=} details
   */
  function logInfo(message, details) {
    if (details === undefined) {
      console.info(LOG_PREFIX, message);
      return;
    }
    console.info(LOG_PREFIX, message, details);
  }

  /**
   * Escreve log de alerta.
   * @param {string} message
   * @param {unknown=} details
   */
  function logWarn(message, details) {
    if (details === undefined) {
      console.warn(LOG_PREFIX, message);
      return;
    }
    console.warn(LOG_PREFIX, message, details);
  }

  /**
   * Escreve log de erro.
   * @param {string} message
   * @param {unknown} error
   */
  function logError(message, error) {
    console.error(LOG_PREFIX, message, error);
  }

  /**
   * Executa um bloco com tratamento de erro uniforme.
   * @template T
   * @param {string} label
   * @param {() => T} task
   * @param {T=} fallbackValue
   * @returns {T | undefined}
   */
  function safeRun(label, task, fallbackValue) {
    try {
      return task();
    } catch (error) {
      logError(label, error);
      return fallbackValue;
    }
  }

  /**
   * Obtém o iframe principal do Projudi.
   * @returns {HTMLIFrameElement | null}
   */
  function findMainFrame() {
    return /** @type {HTMLIFrameElement | null} */ (document.querySelector(SELECTORS.mainFrame));
  }

  /**
   * Vincula o script ao iframe principal e reutiliza o mesmo listener.
   */
  function bindMainFrame() {
    const frame = findMainFrame();
    if (!frame || frame === state.frame) return;

    if (state.frame && state.frameLoadHandler) {
      state.frame.removeEventListener('load', state.frameLoadHandler);
    }

    state.frame = frame;
    state.frameLoadHandler = () => {
      onFrameLoaded(frame);
    };

    frame.addEventListener('load', state.frameLoadHandler, { passive: true });
    onFrameLoaded(frame);
  }

  /**
   * Reage ao carregamento do iframe sem manter observers permanentes.
   * @param {HTMLIFrameElement} frame
   */
  function onFrameLoaded(frame) {
    clearRefreshTimers();
    if (syncFrameDocument(frame)) {
      beginFrameSettlement(state.frameDoc);
      refreshFrameContext();
    }
    scheduleRefreshBurst();
  }

  /**
   * Recaptura o documento atual porque o Projudi pode substituir o conteúdo
   * do iframe depois que o elemento principal já está disponível.
   * @param {HTMLIFrameElement} frame
   * @returns {boolean}
   */
  function syncFrameDocument(frame) {
    const currentDoc = safeRun('Falha ao acessar o documento do iframe principal.', () => frame.contentDocument, null) || null;
    const currentWin = safeRun('Falha ao acessar a janela do iframe principal.', () => frame.contentWindow, null) || null;
    if (!currentDoc || !currentDoc.body) return false;

    const documentChanged = currentDoc !== state.frameDoc;
    state.frameDoc = currentDoc;
    state.frameWin = currentWin;
    if (documentChanged) {
      state.pageContext = null;
      attachFrameHooks(currentDoc);
      beginFrameSettlement(currentDoc);
    }
    patchFrameFunctions(currentWin);
    return true;
  }

  /**
   * Anexa hooks leves ao documento do iframe.
   * Em vez de observar a arvore inteira, o script reage apenas a eventos relevantes.
   * @param {Document} doc
   */
  function attachFrameHooks(doc) {
    if (doc[PRIVATE.frameHooks]) return;
    doc[PRIVATE.frameHooks] = true;

    doc.addEventListener(
      'click',
      (event) => {
        handleFrameClick(event);
      },
      true
    );
  }

  /**
   * Encapsula funcoes de paginacao conhecidas para reagir a atualizacoes AJAX
   * sem depender de MutationObserver continuo.
   * @param {Window | null} frameWin
   */
  function patchFrameFunctions(frameWin) {
    if (!frameWin) return;

    const candidates = ['buscaDados'];
    for (const functionName of candidates) {
      const current = safeRun(`Falha ao acessar ${functionName}.`, () => frameWin[functionName], null);
      if (typeof current !== 'function') continue;
      if (current[PRIVATE.patchFlag]) continue;

      const wrapped = function (...args) {
        const result = current.apply(this, args);
        scheduleRefreshBurst();
        return result;
      };

      wrapped[PRIVATE.patchFlag] = true;
      frameWin[functionName] = wrapped;
    }
  }

  /**
   * Decide o que precisa ser feito apos um clique dentro do iframe.
   * @param {MouseEvent} event
   */
  function handleFrameClick(event) {
    const target = resolveEventElement(event.target);
    if (!target) return;

    const pagerAction = target.closest(SELECTORS.pagerClickable);
    if (pagerAction) {
      scheduleRefreshBurst();
    }
  }

  /**
   * Agenda um pequeno burst de refreshes para capturar atualizacoes AJAX
   * sem manter observers vivos durante toda a sessao.
   */
  function scheduleRefreshBurst() {
    clearRefreshTimers();
    const nonce = ++state.refreshNonce;
    const delays = [120, 450, 1200];

    for (const delay of delays) {
      const timer = window.setTimeout(() => {
        if (state.refreshNonce !== nonce) return;
        refreshFrameContext();
      }, delay);
      state.refreshTimers.push(timer);
    }
  }

  /**
   * Limpa timers de refresh pendentes.
   */
  function clearRefreshTimers() {
    for (const timer of state.refreshTimers) window.clearTimeout(timer);
    state.refreshTimers = [];
  }

  /**
   * Observa apenas a janela de montagem inicial do iframe. O Projudi insere a
   * tabela depois do evento load no Safari; o observador se desliga assim que
   * a tabela é encontrada ou, no máximo, após dez segundos.
   * @param {Document | null} doc
   */
  function beginFrameSettlement(doc) {
    endFrameSettlement(false);
    if (!doc) return;

    const root = doc.getElementById('divTabela') || doc.getElementById('divCorpo') || doc.body || doc.documentElement;
    if (!root) return;

    state.settleObserver = new MutationObserver((mutations) => {
      const changed = mutations.some(mutation =>
        mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length)
      );
      if (!changed) return;

      window.clearTimeout(state.settleDebounceTimer);
      state.settleDebounceTimer = window.setTimeout(() => {
        state.settleDebounceTimer = 0;
        if (state.frameDoc === doc) refreshFrameContext();
      }, 80);
    });
    state.settleObserver.observe(root, { childList: true, subtree: true });
    state.settleStopTimer = window.setTimeout(() => endFrameSettlement(true), 10000);
  }

  /**
   * Encerra a observação temporária do carregamento.
   * @param {boolean} refreshAfterStop
   */
  function endFrameSettlement(refreshAfterStop) {
    state.settleObserver?.disconnect();
    state.settleObserver = null;
    if (state.settleDebounceTimer) window.clearTimeout(state.settleDebounceTimer);
    if (state.settleStopTimer) window.clearTimeout(state.settleStopTimer);
    state.settleDebounceTimer = 0;
    state.settleStopTimer = 0;
    if (refreshAfterStop && state.frameDoc) refreshFrameContext();
  }

  /**
   * Reconstrói o contexto da pagina atual.
   */
  function refreshFrameContext() {
    bindMainFrame();
    ensureActionMenu();
    ensureTodayDeadlineFab();
    const hasCurrentDocument = state.frame ? syncFrameDocument(state.frame) : false;
    if (!state.frame || !hasCurrentDocument || !state.frameDoc) {
      updateActionMenuVisibility({ isIntimationPage: false, showActionMenu: false });
      updateTodayDeadlineFabVisibility({ isHomePage: false });
      if (state.modalOpen) renderModal();
      return;
    }

    const nextContext = analyzeFrameContext(state.frame, state.frameDoc);
    state.pageContext = nextContext;
    safeRun('Falha ao atualizar o menu de intimações.', () => updateActionMenuVisibility(nextContext));
    safeRun('Falha ao atualizar o balão de prazos do dia.', () => updateTodayDeadlineFabVisibility(nextContext));
    safeRun('Falha ao atualizar os filtros de prazo.', () => syncDeadlineState());

    if (!nextContext.isIntimationPage) {
      safeRun('Falha ao aplicar os filtros de prazo.', () => processDeadlineRoot(nextContext.doc));
      if (state.modalOpen) renderModal();
      return;
    }

    const hasDataRows = nextContext.markTables.some(({ table }) =>
      Array.from(table.tBodies).some(body => Array.from(body.rows).some(row => row.querySelector('td')))
    );
    if (hasDataRows) endFrameSettlement(false);
    safeRun('Falha ao aplicar os estilos da tabela de intimações.', () => injectFrameStyles(nextContext.doc));
    safeRun('Falha ao sincronizar a tabela de intimações.', () => syncPageRows(nextContext));
    safeRun('Falha ao aplicar os filtros de prazo.', () => processDeadlineRoot(nextContext.doc));

    if (state.modalOpen) {
      renderModal();
    }
  }

  /**
   * Analisa o iframe com uma unica passada sobre as tabelas.
   * @param {HTMLIFrameElement} frame
   * @param {Document} doc
   * @returns {{
   *   doc: Document,
   *   url: string,
   *   title: string,
   *   isHomePage: boolean,
   *   isIntimationPage: boolean,
   *   showActionMenu: boolean,
   *   mainTable: HTMLTableElement | null,
   *   markTables: Array<{table: HTMLTableElement, headerMap: ReturnType<typeof createHeaderMap>, legend: string}>
   * }}
   */
  function analyzeFrameContext(frame, doc) {
    const title = normalizeSpaces(doc.querySelector(SELECTORS.title)?.textContent || '');
    const url = safeRun('Falha ao ler URL do iframe.', () => frame.contentWindow?.location?.href || doc.location.href, '') || '';
    const isHomePage = isHomeDashboardFrameScreen(url);
    const isIntimationScreen = isIntimationFrameScreen(doc, url, title);
    const relevantTables = Array.from(doc.querySelectorAll(SELECTORS.relevantTable));
    const tables = relevantTables.length ? relevantTables : Array.from(doc.querySelectorAll(SELECTORS.table));

    let mainTable = null;
    let mainScore = -1;
    /** @type {Array<{table: HTMLTableElement, headerMap: ReturnType<typeof createHeaderMap>, legend: string}>} */
    const markTables = [];

    for (const candidate of tables) {
      const table = /** @type {HTMLTableElement} */ (candidate);
      const headerMap = createHeaderMap(table);
      const score = scoreMainTable(table, headerMap);
      if (score > mainScore) {
        mainScore = score;
        mainTable = table;
      }

      if (isStructuredIntimationTable(table, headerMap)) {
        const legend = normalizeSpaces(table.closest('fieldset')?.querySelector('legend')?.textContent || '');
        table[PRIVATE.tableContext] = headerMap;
        markTables.push({ table, headerMap, legend });
      }
    }

    const isIntimationPage = markTables.length > 0;
    const showActionMenu = isIntimationScreen && isIntimationPage;

    return {
      doc,
      url,
      title,
      isHomePage,
      isIntimationPage,
      showActionMenu,
      mainTable,
      markTables
    };
  }

  /**
   * Confirma se o iframe atual e a tela inicial do Projudi.
   * O Projudi usa PaginaAtual=-10 para o painel inicial do usuario.
   * @param {string} url
   * @returns {boolean}
   */
  function isHomeDashboardFrameScreen(url) {
    return /[?&]PaginaAtual=-?10(?:[&#]|$)/i.test(String(url || ''));
  }

  /**
   * Confirma se o iframe atual pertence ao fluxo real de pendências/intimações.
   * Evita falso positivo na página inicial, que também possui tabelas com colunas parecidas.
   * @param {Document} doc
   * @param {string} url
   * @param {string} title
   * @returns {boolean}
   */
  function isIntimationFrameScreen(doc, url, title) {
    const normalizedUrl = normalizeText(url);
    const normalizedTitle = normalizeText(title);
    const headingText = normalizeText(
      Array.from(doc.querySelectorAll('.area h2, fieldset > legend, .formLocalizarLegenda'))
        .map((node) => node.textContent || '')
        .join(' ')
    );

    const isPendenciaModule =
      normalizedUrl.includes('pendencia') ||
      normalizedTitle.includes('pendencia');

    const mentionsIntimationFlow =
      headingText.includes('intimac') ||
      headingText.includes('citac') ||
      headingText.includes('pendencia');

    return isPendenciaModule && mentionsIntimationFlow;
  }

  /**
   * Pontua a tabela principal de intimações.
   * @param {HTMLTableElement} table
   * @param {ReturnType<typeof createHeaderMap>} headerMap
   * @returns {number}
   */
  function scoreMainTable(table, headerMap) {
    if (!isStructuredIntimationTable(table, headerMap)) return 0;
    let score = 0;
    if (headerMap.intimationId >= 0) score += 2;
    if (headerMap.process >= 0) score += 2;
    if (headerMap.movement >= 0) score += 3;
    if (headerMap.kind >= 0) score += 1;
    if (headerMap.deadline >= 0) score += 2;
    if (headerMap.baseDate >= 0) score += 2;
    if (headerMap.mark >= 0) score += 1;
    if (hasNativeIntimationAction(table)) score += 2;
    if (table.matches(SELECTORS.relevantTable)) score += 1;
    return score;
  }

  /**
   * Verifica se a tabela possui estrutura de pendências/intimações do Projudi.
   * @param {HTMLTableElement} table
   * @param {ReturnType<typeof createHeaderMap>} headerMap
   * @returns {boolean}
   */
  function isStructuredIntimationTable(table, headerMap) {
    const hasCoreColumns = headerMap.intimationId >= 0 && headerMap.process >= 0 && headerMap.movement >= 0;
    if (!hasCoreColumns) return false;
    return (
      headerMap.baseDate >= 0 ||
      headerMap.deadline >= 0 ||
      headerMap.mark >= 0 ||
      hasNativeIntimationAction(table)
    );
  }

  /**
   * Detecta ações nativas de pendência/intimação na tabela.
   * @param {ParentNode | null} root
   * @returns {boolean}
   */
  function hasNativeIntimationAction(root) {
    if (!root || typeof root.querySelector !== 'function') return false;
    return Boolean(root.querySelector(SELECTORS.nativeDoneAction));
  }

  /**
   * Cria o mapa semantico de colunas com uma unica leitura de cabecalho.
   * @param {HTMLTableElement} table
   * @returns {{
   *   intimationId: number,
   *   process: number,
   *   movement: number,
   *   baseDate: number,
   *   deadline: number,
   *   mark: number,
   *   details: number,
   *   kind: number,
   *   actionHost: number
   * }}
   */
  function createHeaderMap(table) {
    const headerCells = Array.from(
      table.querySelectorAll('thead th').length
        ? table.querySelectorAll('thead th')
        : table.querySelectorAll('tr:first-child th, tr:first-child td')
    );
    const normalized = headerCells.map((cell) => normalizeText(cell.textContent || ''));

    const findIndex = (...needles) => normalized.findIndex((value) => needles.some((needle) => value.includes(needle)));
    const findLastIndex = (...needles) => {
      for (let index = normalized.length - 1; index >= 0; index -= 1) {
        if (needles.some((needle) => normalized[index].includes(needle))) return index;
      }
      return -1;
    };

    return {
      intimationId: findIndex('num.', 'num', 'numero', 'número'),
      process: findIndex('processo'),
      movement: findIndex('movimentacao', 'movimentação'),
      baseDate: findIndex('data leitura', 'data publicacao', 'data publicação'),
      deadline: findIndex('possivel data limite', 'possível data limite', 'data limite'),
      mark: findIndex('marcar'),
      details: findIndex('detalhes'),
      kind: findIndex('tipo'),
      actionHost: findLastIndex('opcoes', 'opções', 'opcoes', 'marcar', 'descartar', 'detalhes')
    };
  }

  /**
   * Atualiza as linhas com classes e acoes inline.
   * @param {ReturnType<typeof analyzeFrameContext>} context
   */
  function syncPageRows(context) {
    const markedIds = new Set(Object.keys(state.store.items));

    for (const tableEntry of context.markTables) {
      const { table, headerMap, legend } = tableEntry;
      table.classList.add('pjip-table');

      for (const body of Array.from(table.tBodies)) {
        for (const row of Array.from(body.rows)) {
          safeRun('Falha ao preparar uma linha da tabela de intimações.', () => {
            syncSingleRow(row, headerMap, legend, markedIds);
          });
        }
      }
    }

    ensureFontAwesome(context.doc).then(sprite => {
      if (!sprite || state.frameDoc !== context.doc) return;
      refreshInlineFontAwesomeIcons(context.doc);
    });
  }

  /**
   * Atualiza uma linha individual.
   * @param {HTMLTableRowElement} row
   * @param {ReturnType<typeof createHeaderMap>} headerMap
   * @param {string} legend
   * @param {Set<string>} markedIds
   */
  function syncSingleRow(row, headerMap, legend, markedIds) {
    const rowData = extractRowData(row, headerMap, legend);
    if (!rowData) return;

    if (state.store.items[rowData.id]) {
      mergeObservedItem(rowData.id, rowData);
    }

    const item = state.store.items[rowData.id] || null;
    const rowSignature = `${rowData.id}|${item ? 1 : 0}|${item?.done ? 1 : 0}|${state.store.ui.onlyMarkedOnPage ? 1 : 0}`;
    if (row[PRIVATE.rowSignature] === rowSignature) return;

    row.classList.toggle('pjip-row--marked', Boolean(item));
    row.classList.toggle('pjip-row--done', Boolean(item && item.done));
    row.classList.toggle('pjip-row--hidden', Boolean(state.store.ui.onlyMarkedOnPage && !markedIds.has(rowData.id)));

    const actionCellIndex = headerMap.actionHost >= 0 ? headerMap.actionHost : Math.max(headerMap.mark, headerMap.details, 0);
    const actionCell = /** @type {HTMLTableCellElement | undefined} */ (row.children[actionCellIndex]);
    if (!actionCell) {
      row[PRIVATE.rowSignature] = rowSignature;
      return;
    }
    actionCell.classList.add('pjip-native-host');
    const nativeIcon = actionCell.querySelector(':scope > i, :scope > svg, :scope > :not(.pjip-inline) i, :scope > :not(.pjip-inline) svg');
    const nativeIconStyle = nativeIcon ? row.ownerDocument.defaultView?.getComputedStyle(nativeIcon) : null;
    const nativeIconSize = Math.max(
      parseFloat(nativeIconStyle?.width) || 0,
      parseFloat(nativeIconStyle?.height) || 0,
      parseFloat(nativeIconStyle?.fontSize) || 0
    );

    let host = actionCell.querySelector('.pjip-inline');
    if (!host) {
      host = row.ownerDocument.createElement('span');
      host.className = 'pjip-inline';
      actionCell.appendChild(host);
    }
    if (nativeIconSize > 0) host.style.setProperty('--pjip-native-icon-size', `${nativeIconSize}px`);

    host.replaceChildren(
      buildInlineButton(
        row.ownerDocument,
        'star',
        item ? 'Remover das minhas intimações' : 'Marcar como minha',
        () => toggleMarked(rowData),
        false,
        Boolean(item),
        'mark'
      ),
      buildInlineButton(
        row.ownerDocument,
        'check',
        item ? (item.done ? 'Reabrir intimação' : 'Marcar como concluída') : 'Marque primeiro como sua',
        () => toggleDone(rowData.id),
        !item,
        Boolean(item?.done),
        'done'
      )
    );
    row[PRIVATE.rowSignature] = rowSignature;
  }

  /**
   * Cria um botao inline com binding direto para garantir confiabilidade do clique.
   * @param {Document} doc
   * @param {'star' | 'check'} iconName
   * @param {string} title
   * @param {() => void} onClick
   * @param {boolean=} disabled
   * @param {boolean=} active
   * @param {'mark' | 'done'=} kind
   * @returns {HTMLButtonElement}
   */
  function buildInlineButton(doc, iconName, title, onClick, disabled = false, active = false, kind = 'mark') {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `pjip-inline-btn pjip-inline-btn--${kind}`;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.dataset.active = active ? 'true' : 'false';
    button.disabled = disabled;
    button.appendChild(buildInlineFontAwesomeIcon(doc, iconName));
    if (!disabled) {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
    }
    return button;
  }

  /**
   * Cria um SVG direto para evitar renderizadores e observadores por linha.
   * @param {Document} doc
   * @param {'star' | 'check'} iconName
   * @returns {SVGSVGElement}
   */
  function buildInlineFontAwesomeIcon(doc, iconName) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'pjip-inline-icon');
    svg.dataset.icon = iconName;
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#pj-suite-fa-${iconName}`);
    svg.appendChild(use);
    return svg;
  }

  /**
   * Recria os usos após o sprite existir. O Safari não atualiza de forma
   * confiável referências internas criadas antes do símbolo correspondente.
   * @param {Document} doc
   */
  function refreshInlineFontAwesomeIcons(doc) {
    doc.querySelectorAll('.pjip-inline-icon[data-icon]').forEach(icon => {
      const iconName = icon.dataset.icon;
      if (iconName !== 'star' && iconName !== 'check') return;
      icon.replaceWith(buildInlineFontAwesomeIcon(doc, iconName));
    });
  }

  /**
   * Extrai os dados relevantes de uma linha da tabela.
   * @param {HTMLTableRowElement} row
   * @param {ReturnType<typeof createHeaderMap>} headerMap
   * @param {string} legend
   * @returns {{
   *   id: string,
   *   processNumber: string,
   *   processLink: string,
   *   movement: string,
   *   kind: string,
   *   observedAt: string,
   *   deadline: string,
   *   sourceLegend: string,
   *   nativeMarkHref: string,
   *   isNativeDone: boolean
   * } | null}
   */
  function extractRowData(row, headerMap, legend) {
    const cells = Array.from(row.children);
    const id = getCellText(cells[headerMap.intimationId]);
    const processNumber = getCellText(cells[headerMap.process]);
    const movement = getCellText(cells[headerMap.movement]);

    if (!id || !/^\d+$/.test(id) || !processNumber) return null;

    const baseUrl = row.ownerDocument.location?.href || window.location.href;
    const processElement = findNavigationElement(cells[headerMap.process], SELECTORS.processAction);
    const nativeDoneElement =
      headerMap.mark >= 0
        ? findNavigationElement(cells[headerMap.mark], SELECTORS.nativeDoneAction)
        : row.querySelector(SELECTORS.nativeDoneAction);
    // O link de uma pendência é contextual: em algumas listas o Projudi gera
    // um código de validação que só vale enquanto a linha está carregada.
    // Guarde a consulta estável pelo número do processo; quando a linha ainda
    // existe, openProcess() continua usando o clique nativo abaixo.
    const processLink = buildProcessLookupUrl(processNumber) || extractNavigableUrl(processElement, baseUrl);
    const nativeMarkHref = extractNavigableUrl(nativeDoneElement, baseUrl);

    return {
      id,
      processNumber,
      processLink,
      movement,
      kind: headerMap.kind >= 0 ? getCellText(cells[headerMap.kind]) : 'Intimação',
      observedAt: headerMap.baseDate >= 0 ? getCellText(cells[headerMap.baseDate]) : '',
      deadline: headerMap.deadline >= 0 ? getCellText(cells[headerMap.deadline]) : '',
      sourceLegend: legend,
      nativeMarkHref,
      isNativeDone: /finalizada=true/i.test(nativeMarkHref)
    };
  }

  /**
   * Marca ou desmarca uma intimacao.
   * @param {NonNullable<ReturnType<typeof extractRowData>>} rowData
   */
  function toggleMarked(rowData) {
    if (state.store.items[rowData.id]) {
      delete state.store.items[rowData.id];
    } else {
      state.store.items[rowData.id] = {
        id: rowData.id,
        processNumber: rowData.processNumber,
        processLink: rowData.processLink,
        movement: rowData.movement,
        kind: rowData.kind,
        observedAt: rowData.observedAt,
        deadline: rowData.deadline,
        sourceLegend: rowData.sourceLegend,
        nativeMarkHref: rowData.nativeMarkHref,
        nativeDone: Boolean(rowData.isNativeDone),
        done: Boolean(rowData.isNativeDone),
        updatedAt: new Date().toISOString()
      };
    }

    persistStore();
    refreshFrameContext();
  }

  /**
   * Alterna o estado de concluida.
   * @param {string} itemId
   */
  function toggleDone(itemId) {
    const item = state.store.items[itemId];
    if (!item) return;
    item.done = !item.done;
    item.updatedAt = new Date().toISOString();
    persistStore();
    refreshFrameContext();
  }

  /**
   * Mescla os dados observados em uma linha com o armazenamento local.
   * @param {string} itemId
   * @param {NonNullable<ReturnType<typeof extractRowData>>} rowData
   */
  function mergeObservedItem(itemId, rowData) {
    const item = state.store.items[itemId];
    if (!item) return;
    item.processNumber = rowData.processNumber || item.processNumber;
    item.processLink = rowData.processLink || item.processLink;
    item.movement = rowData.movement || item.movement;
    item.kind = rowData.kind || item.kind;
    item.observedAt = rowData.observedAt || item.observedAt;
    item.deadline = rowData.deadline || item.deadline;
    item.sourceLegend = rowData.sourceLegend || item.sourceLegend;
    item.nativeMarkHref = rowData.nativeMarkHref || item.nativeMarkHref;
    item.nativeDone = Boolean(rowData.isNativeDone);
  }

  /**
   * Le o armazenamento local.
   * @returns {{items: Record<string, any>, ui: {panelOpen: boolean, hideDone: boolean, onlyMarkedOnPage: boolean, query: string, statusFilter: string, sortBy: string, backupExpanded: boolean}}}
   */
  function loadStore() {
    const fallback = {
      schema: 'projudi-suite/intimacoes-data',
      version: 2,
      revision: 1,
      updatedAt: new Date().toISOString(),
      items: Object.create(null),
      deadline: Object.create(null),
      ui: {
        panelOpen: false,
        hideDone: true,
        onlyMarkedOnPage: false,
        query: '',
        statusFilter: 'active',
        sortBy: 'deadline-asc',
        backupExpanded: false
      }
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.store);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      const source = parsed && typeof parsed === 'object' ? parsed : fallback;
      const deadline = source.deadline && typeof source.deadline === 'object' ? source.deadline : Object.create(null);
      const normalized = {
        schema: 'projudi-suite/intimacoes-data',
        version: 2,
        revision: Number.isFinite(Number(source.revision)) ? Number(source.revision) : 1,
        updatedAt: String(source.updatedAt || new Date().toISOString()),
        items: source.items && typeof source.items === 'object' ? source.items : Object.create(null),
        deadline,
        ui: {
          panelOpen: Boolean(source.ui?.panelOpen),
          hideDone: source.ui?.hideDone !== false,
          onlyMarkedOnPage: Boolean(source.ui?.onlyMarkedOnPage),
          query: typeof source.ui?.query === 'string' ? source.ui.query : '',
          statusFilter: typeof source.ui?.statusFilter === 'string' ? source.ui.statusFilter : 'active',
          sortBy: typeof source.ui?.sortBy === 'string' ? source.ui.sortBy : 'deadline-asc',
          backupExpanded: Boolean(source.ui?.backupExpanded)
        }
      };
      return normalized;
    } catch (error) {
      logWarn('Falha ao carregar dados locais. O armazenamento sera reiniciado.', error);
      return fallback;
    }
  }

  /**
   * Persiste o armazenamento local e agenda backup, se configurado.
   */
  function persistStore() {
    try {
      state.store.schema = 'projudi-suite/intimacoes-data';
      state.store.version = 2;
      state.store.revision = Number(state.store.revision || 0) + 1;
      state.store.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEYS.store, JSON.stringify(state.store));
    } catch (error) {
      logError('Falha ao salvar dados locais.', error);
    }
    if (state.pageContext) updateTodayDeadlineFabVisibility(state.pageContext);
    else renderTodayDeadlineFab();
    scheduleAutoBackup();
  }

  /**
   * Normaliza configuracoes de backup.
   * @param {Partial<typeof BACKUP_DEFAULTS>=} value
   * @returns {typeof BACKUP_DEFAULTS}
   */
  function normalizeBackupSettings(value) {
    return {
      enabled: Boolean(value?.enabled),
      gistId: String(value?.gistId || '').trim(),
      token: String(value?.token || '').trim(),
      fileName: String(value?.fileName || BACKUP_DEFAULTS.fileName).trim() || BACKUP_DEFAULTS.fileName,
      autoBackupOnSave: Boolean(value?.autoBackupOnSave),
      lastBackupAt: String(value?.lastBackupAt || '').trim(),
      lastBackupSignature: String(value?.lastBackupSignature || '').trim()
    };
  }

  /**
   * Le configuracoes de backup.
   * @returns {typeof BACKUP_DEFAULTS}
   */
  function loadBackupSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.backup);
      return raw ? normalizeBackupSettings(JSON.parse(raw)) : normalizeBackupSettings(BACKUP_DEFAULTS);
    } catch (error) {
      logWarn('Falha ao carregar configuracoes de backup.', error);
      return normalizeBackupSettings(BACKUP_DEFAULTS);
    }
  }

  /**
   * Salva configuracoes de backup.
   * @param {Partial<typeof BACKUP_DEFAULTS>} settings
   * @returns {typeof BACKUP_DEFAULTS}
   */
  function saveBackupSettings(settings) {
    const normalized = normalizeBackupSettings(settings);
    try {
      localStorage.setItem(STORAGE_KEYS.backup, JSON.stringify(normalized));
    } catch (error) {
      logError('Falha ao salvar configuracoes de backup.', error);
    }
    return normalized;
  }

  /**
   * Agenda backup remoto apenas quando o conteudo mudou.
   */
  function scheduleAutoBackup() {
    window.clearTimeout(state.backupTimer);
    state.backupTimer = 0;

    const settings = loadBackupSettings();
    if (!settings.enabled || !settings.autoBackupOnSave) return;

    const signature = buildBackupSignature();
    if (signature === settings.lastBackupSignature) return;
    const lastBackupTime = new Date(settings.lastBackupAt || 0).getTime();
    const intervalWait = Number.isNaN(lastBackupTime)
      ? 0
      : Math.max(0, AUTO_BACKUP_MIN_INTERVAL_MS - (Date.now() - lastBackupTime));
    const delay = Math.max(AUTO_BACKUP_IDLE_DELAY_MS, intervalWait);

    state.backupTimer = window.setTimeout(async () => {
      try {
        await pushBackupToGist(settings, buildBackupPayload());
        saveBackupSettings({
          ...settings,
          lastBackupAt: new Date().toISOString(),
          lastBackupSignature: signature
        });
        if (state.modalOpen) renderModal();
      } catch (error) {
        logWarn('Falha no backup automatico.', error);
      }
    }, delay);
  }

  /**
   * Monta o payload de backup.
   * @returns {{schema: string, scriptId: string, scriptName: string, version: string, exportedAt: string, items: Record<string, any>}}
   */
  function buildBackupPayload() {
    return {
      schema: BACKUP_SCHEMA,
      scriptId: SCRIPT_ID,
      scriptName: SCRIPT_NAME,
      version: SCRIPT_VERSION,
      exportedAt: new Date().toISOString(),
      backupSignature: buildBackupSignature(),
      items: state.store.items
    };
  }

  function buildBackupSignature() {
    const orderedItems = Object.create(null);
    Object.keys(state.store.items || {})
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .forEach(key => {
        orderedItems[key] = state.store.items[key];
      });
    return JSON.stringify({ schema: BACKUP_SCHEMA, items: orderedItems });
  }

  /**
   * Faz requisicao ao GitHub via API do userscript.
   * @param {{method?: string, url: string, headers?: Record<string, string>, data?: string}} options
   * @returns {Promise<any>}
   */
  function githubRequest(options) {
    return new Promise((resolve, reject) => {
      if (typeof gmXmlHttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest não está disponível.'));
        return;
      }

      gmXmlHttpRequest({
        method: options.method || 'GET',
        url: options.url,
        headers: options.headers || {},
        data: options.data,
        onload: resolve,
        onerror: () => reject(new Error('Falha de rede ao acessar o GitHub.')),
        ontimeout: () => reject(new Error('Tempo esgotado ao acessar o GitHub.'))
      });
    });
  }

  /**
   * Extrai mensagem amigavel de erro do GitHub.
   * @param {{status: number, responseText?: string}} response
   * @returns {string}
   */
  function parseGithubError(response) {
    try {
      const parsed = JSON.parse(response.responseText || '{}');
      if (parsed && parsed.message) return String(parsed.message);
    } catch (_) {}
    return `GitHub respondeu com status ${response.status}.`;
  }

  /**
   * Envia backup para um Gist.
   * @param {typeof BACKUP_DEFAULTS} settings
   * @param {ReturnType<typeof buildBackupPayload>} payload
   * @returns {Promise<any>}
   */
  async function pushBackupToGist(settings, payload) {
    if (!settings.gistId) throw new Error('Informe o Gist ID.');
    if (!settings.token) throw new Error('Informe o token do GitHub.');
    const nextSignature = getPayloadBackupSignature(payload);
    const remotePayload = await readBackupFromGist(settings, { missingOk: true, invalidOk: true });
    if (remotePayload && getPayloadBackupSignature(remotePayload) === nextSignature) {
      return { skipped: true };
    }

    const response = await githubRequest({
      method: 'PATCH',
      url: `https://api.github.com/gists/${encodeURIComponent(settings.gistId)}`,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        files: {
          [settings.fileName]: {
            content: JSON.stringify(payload, null, 2)
          }
        }
      })
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(parseGithubError(response));
    }

    return { skipped: false, gist: JSON.parse(response.responseText || '{}') };
  }

  function getPayloadBackupSignature(payload) {
    if (!payload || payload.schema !== BACKUP_SCHEMA || payload.scriptId !== SCRIPT_ID || !payload.items || typeof payload.items !== 'object' || Array.isArray(payload.items)) return '';
    if (payload.backupSignature) return String(payload.backupSignature);
    const orderedItems = Object.create(null);
    Object.keys(payload.items)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .forEach(key => {
        orderedItems[key] = payload.items[key];
      });
    return JSON.stringify({ schema: BACKUP_SCHEMA, items: orderedItems });
  }

  /**
   * Restaura backup a partir de um Gist.
   * @param {typeof BACKUP_DEFAULTS} settings
   * @returns {Promise<any>}
   */
  async function readBackupFromGist(settings, options = {}) {
    if (!settings.gistId) throw new Error('Informe o Gist ID.');
    if (!settings.token) throw new Error('Informe o token do GitHub.');

    const response = await githubRequest({
      method: 'GET',
      url: `https://api.github.com/gists/${encodeURIComponent(settings.gistId)}`,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${settings.token}`
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(parseGithubError(response));
    }

    const gist = JSON.parse(response.responseText || '{}');
    const file = gist?.files?.[settings.fileName];
    if (!file) {
      if (options.missingOk) return null;
      throw new Error('Arquivo de backup não encontrado no Gist.');
    }
    let content = typeof file.content === 'string' ? file.content : '';
    if ((file.truncated || !content) && file.raw_url) {
      const rawResponse = await githubRequest({
        method: 'GET',
        url: file.raw_url,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${settings.token}`
        }
      });
      if (rawResponse.status < 200 || rawResponse.status >= 300) {
        throw new Error(`Não foi possível baixar o conteúdo completo do backup: ${parseGithubError(rawResponse)}`);
      }
      content = rawResponse.responseText || '';
    }
    if (!content) {
      if (options.invalidOk) return null;
      throw new Error('O arquivo de backup no Gist está vazio. Envie um novo backup para substituí-lo.');
    }
    try {
      return JSON.parse(content);
    } catch (_) {
      if (options.invalidOk) return null;
      throw new Error('O arquivo de backup no Gist está incompleto ou contém JSON inválido. Envie um novo backup para substituí-lo.');
    }
  }

  /**
   * Registra ou atualiza o menu do Tampermonkey.
   */
  function registerMenuCommand() {
    if (state.menuRegistered) return;
    if (typeof gmRegisterMenuCommand !== 'function') return;
    try {
      gmRegisterMenuCommand('Gerenciar Intimações', () => openModal());
      state.menuRegistered = true;
    } catch (_) {}
  }

  /**
   * Injeta estilos da pagina host uma unica vez.
   */
  function injectHostStyles() {
    if (document.getElementById(IDS.hostStyle)) return;

    const style = document.createElement('style');
    style.id = IDS.hostStyle;
    style.textContent = `
      #${IDS.hostRoot} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        width: 40px;
        height: 40px;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${IDS.hostRoot} > * {
        pointer-events: auto;
      }
      .pjip-hidden {
        display: none !important;
      }
      #${IDS.todayDeadlineRoot} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483645;
        width: 40px;
        height: 40px;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${IDS.todayDeadlineRoot} > * {
        pointer-events: auto;
      }
      .pjip-today-deadline-fab {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        padding: 0;
        border: 1px solid #174d7d;
        border-radius: 999px;
        background: linear-gradient(135deg, #175a9d, #2b78bd);
        color: #fff;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        box-shadow: 0 4px 12px rgba(15, 36, 62, .24);
        transition: transform .15s ease, filter .15s ease;
      }
      .pjip-today-deadline-fab:hover {
        filter: brightness(1.06);
        transform: translateY(-1px);
      }
      .pjip-today-deadline-fab:active {
        transform: translateY(0);
      }
      .pjip-today-deadline-count {
        position: absolute;
        top: -5px;
        right: -5px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 23px;
        height: 23px;
        padding: 0 5px;
        border: 2px solid #fff;
        border-radius: 999px;
        background: #174d7d;
        color: #fff;
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
      }
      .pjip-actions-panel {
        position: absolute;
        right: 0;
        bottom: 48px;
        width: 284px;
        border: 1px solid #d4dceb;
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 14px 28px rgba(15, 36, 62, 0.18);
        overflow: hidden;
        visibility: hidden;
        opacity: 0;
        transform-origin: bottom right;
        transform: translateY(8px) scale(.98);
        pointer-events: none;
        transition: opacity .15s ease, transform .15s ease;
      }
      .pjip-actions-panel[data-open="true"] {
        visibility: visible;
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      .pjip-actions-head {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 14px;
        background: linear-gradient(135deg, #0b315f 0%, #175a9d 60%, #2476bd 100%);
        color: #fff;
        font-size: 12px;
        font-weight: 700;
      }
      .pjip-actions-body {
        display: grid;
        gap: 4px;
        padding: 6px;
        background: #f7f9fc;
      }
      .pjip-actions-divider {
        height: 1px;
        margin: 2px 0;
        background: #dde4ef;
      }
      .pjip-action-btn,
      .pjip-modal-btn,
      .pjip-inline-btn {
        appearance: none;
        border: 1px solid #cbd8e8;
        border-radius: 8px;
        background: #fff;
        color: #173a61;
        cursor: pointer;
        font: inherit;
      }
      .pjip-modal-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .pjip-action-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 32px;
        padding: 9px 11px;
        text-align: left;
        font-size: 13px;
        font-weight: 600;
      }
      .pjip-action-btn :is(i, .pj-suite-fa) {
        width: 18px;
        color: #2b69aa;
        text-align: center;
      }
      .pjip-action-btn:hover,
      .pjip-modal-btn:hover,
      .pjip-inline-btn:hover {
        background: #edf4fc;
        border-color: #9fbbe0;
      }
      .pjip-fab {
        width: 40px;
        height: 40px;
        border-radius: 999px;
        border: 1px solid #2b69aa;
        background: linear-gradient(135deg, #175a9d, #2b78bd);
        color: #fff;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        box-shadow: 0 4px 12px rgba(0, 0, 0, .2);
      }
      .pjip-fab:hover {
        background: #245a92;
      }
      #${IDS.toast} {
        position: fixed;
        right: 16px;
        bottom: 66px;
        z-index: 2147483647;
        padding: 8px 11px;
        border-radius: 6px;
        border: 1px solid #2b69aa;
        background: #2b69aa;
        color: #fff;
        font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,.18);
        opacity: 0;
        transition: opacity .2s ease;
      }
      #${IDS.modalOverlay} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(8, 28, 52, .28);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${IDS.modalOverlay}[data-open="true"] {
        display: flex;
      }
      #${IDS.modalPanel} {
        position: relative;
        width: min(1180px, calc(100vw - 32px));
        height: min(88vh, 920px);
        display: flex;
        flex-direction: column;
        background: #fff;
        border: 1px solid #cfdaea;
        border-radius: 18px;
        box-shadow: 0 24px 54px rgba(8, 32, 61, .22);
        overflow: hidden;
      }
      #${IDS.modalPanel} :where(button, input, select, textarea):focus-visible,
      #${IDS.hostRoot} :where(button, input, select):focus-visible {
        outline: 3px solid rgba(37, 118, 189, .28);
        outline-offset: 2px;
        border-color: #2476bd;
      }
      #${IDS.modalPanel} .pj-suite-fa,
      #${IDS.hostRoot} .pj-suite-fa { width: 1em; height: 1em; }
      .pjip-modal-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 18px;
        color: #fff;
        background: linear-gradient(135deg, #0b315f 0%, #175a9d 55%, #2476bd 100%);
      }
      .pjip-modal-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .pjip-modal-brand-icon {
        width: 40px;
        height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        border: 1px solid rgba(255,255,255,.24);
        border-radius: 12px;
        background: rgba(255,255,255,.14);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.16);
        font-size: 18px;
      }
      .pjip-modal-title {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
      }
      .pjip-modal-subtitle {
        margin-top: 2px;
        font-size: 12px;
        opacity: .92;
      }
      .pjip-modal-close {
        width: 32px;
        min-width: 32px;
        height: 32px;
        border: 0;
        border-radius: 999px;
        background: rgba(255,255,255,.18);
        color: #fff;
        cursor: pointer;
        font-size: 22px;
      }
      .pjip-modal-close:hover {
        background: rgba(255,255,255,.26);
      }
      .pjip-modal-body {
        flex: 1 1 auto;
        min-height: 0;
        display: grid;
        grid-template-columns: 292px minmax(0, 1fr);
        grid-template-rows: auto auto;
        grid-template-areas:
          "rail deadline"
          "rail list";
        align-items: start;
        gap: 12px;
        padding: 12px;
        overflow: auto;
        background: #f4f7fb;
      }
      .pjip-overview {
        grid-area: rail;
        display: grid;
        align-content: start;
        gap: 12px;
      }
      .pjip-summary {
        display: grid;
        gap: 12px;
        padding: 14px;
        border: 1px solid #d6e0ef;
        border-radius: 12px;
        background: linear-gradient(145deg, #ffffff 0%, #edf5ff 100%);
        box-shadow: inset 4px 0 0 #2b70b7, 0 6px 18px rgba(15, 45, 78, .07);
      }
      .pjip-summary-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .pjip-summary-kicker {
        color: #33537a;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .04em;
        text-transform: uppercase;
      }
      .pjip-summary-title {
        margin-top: 5px;
        color: #15385f;
        font-size: 22px;
        font-weight: 800;
        line-height: 1.1;
      }
      .pjip-summary-subtitle {
        margin-top: 4px;
        color: #58718e;
        font-size: 13px;
      }
      .pjip-summary-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
      }
      .pjip-summary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .pjip-stat {
        appearance: none;
        display: grid;
        gap: 3px;
        padding: 10px 11px;
        border: 1px solid #d7e2f0;
        border-radius: 11px;
        background: #fff;
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .pjip-stat-icon { color: #2c6baa; font-size: 14px; }
      .pjip-stat:hover {
        border-color: #9fbbe0;
        box-shadow: 0 3px 10px rgba(15, 54, 102, .08);
      }
      .pjip-stat[data-active="true"] {
        border-color: #1f69d5;
        box-shadow: inset 0 0 0 1px #1f69d5;
      }
      .pjip-stat-value {
        color: #143f70;
        font-size: 22px;
        font-weight: 800;
        line-height: 1;
      }
      .pjip-stat-label {
        color: #5b7089;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .02em;
      }
      .pjip-stat--late {
        background: linear-gradient(180deg, #fff6f6 0%, #ffeaea 100%);
      }
      .pjip-stat--late .pjip-stat-value {
        color: #a02828;
      }
      .pjip-stat--soon {
        background: linear-gradient(180deg, #fffaf0 0%, #fff2d8 100%);
      }
      .pjip-stat--soon .pjip-stat-value {
        color: #9a5b00;
      }
      .pjip-stat--open {
        background: linear-gradient(180deg, #f4faff 0%, #eaf3ff 100%);
      }
      .pjip-stat--done {
        background: linear-gradient(180deg, #f3fbf5 0%, #e5f5e9 100%);
      }
      .pjip-stat--done .pjip-stat-value {
        color: #1d6f3b;
      }
      .pjip-section {
        display: grid;
        gap: 10px;
      }
      .pjip-section-title {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 0 0 0 2px;
        color: #334155;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .04em;
        text-transform: uppercase;
      }
      .pjip-section-title :is(i, .pj-suite-fa) { color: #2467a8; font-size: 12px; }
      .pjip-toolbar,
      .pjip-deadline,
      .pjip-backup,
      .pjip-list-shell,
      .pjip-item {
        display: grid;
        gap: 10px;
        padding: 12px;
        border: 1px solid #d6e0ef;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
      }
      .pjip-toolbar:hover,
      .pjip-deadline:hover,
      .pjip-list-shell:hover,
      .pjip-item:hover {
        border-color: #c4d5e8;
        box-shadow: 0 7px 20px rgba(15, 45, 78, .07);
      }
      .pjip-toolbar input[type="search"],
      .pjip-toolbar select,
      .pjip-deadline input[type="date"],
      .pjip-backup input[type="text"],
      .pjip-backup input[type="password"] {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        border: 1px solid #c9d6e9;
        border-radius: 9px;
        padding: 8px 9px;
        font: inherit;
        min-height: 40px;
      }
      .pjip-toolbar input:focus,
      .pjip-toolbar select:focus,
      .pjip-deadline input:focus,
      .pjip-backup input:focus {
        outline: 3px solid rgba(31, 105, 213, .16);
        outline-offset: 1px;
        border-color: #4b86c2;
      }
      .pjip-toolbar-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
        align-items: start;
      }
      .pjip-toolbar-row {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .pjip-deadline {
        grid-area: deadline;
        gap: 10px;
      }
      .pjip-deadline-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .pjip-deadline-status {
        color: #48627e;
        font-size: 12px;
        font-weight: 700;
      }
      .pjip-deadline-grid {
        display: grid;
        grid-template-columns: minmax(210px, .8fr) minmax(310px, 1.1fr) minmax(230px, .8fr);
        align-items: stretch;
        gap: 10px;
      }
      .pjip-deadline-card {
        display: grid;
        grid-template-rows: auto minmax(42px, 1fr) 56px;
        align-items: stretch;
        gap: 8px;
        padding: 10px;
        border: 1px solid #dbe3ef;
        border-radius: 11px;
        background: #f8fafc;
      }
      .pjip-deadline-card-title {
        color: #173a61;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .03em;
        text-transform: uppercase;
      }
      .pjip-deadline-card-desc {
        color: #61748d;
        font-size: 11px;
        line-height: 1.4;
      }
      .pjip-deadline-row {
        align-self: end;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-auto-rows: 56px;
        gap: 8px;
        align-items: stretch;
        height: 56px;
      }
      .pjip-deadline-row > input,
      .pjip-deadline-row > button {
        align-self: stretch;
        width: 100%;
        height: 56px;
        min-height: 0;
        margin: 0;
        box-sizing: border-box;
      }
      .pjip-deadline-row > input[type="date"] {
        appearance: none;
        -webkit-appearance: none;
        line-height: 1.2;
        padding: 0 12px;
      }
      .pjip-deadline-row > button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 12px;
        line-height: 1.2;
      }
      .pjip-deadline-row--range {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .pjip-field {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      .pjip-field label {
        display: block;
        color: #47627f;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .02em;
        line-height: 1.2;
      }
      .pjip-checks {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        font-size: 12px;
        color: #375272;
      }
      .pjip-checks label {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        border: 1px solid #dbe3ef;
        border-radius: 999px;
        background: #f8fbff;
        cursor: pointer;
      }
      .pjip-toolbar-meta,
      .pjip-backup-meta {
        font-size: 12px;
        color: #61748d;
      }
      .pjip-backup-actions,
      .pjip-item-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .pjip-list-shell {
        grid-area: list;
        gap: 14px;
        min-height: 0;
      }
      .pjip-list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .pjip-list-meta {
        color: #61748d;
        font-size: 12px;
      }
      .pjip-list {
        display: grid;
        gap: 8px;
      }
      .pjip-modal-btn {
        padding: 7px 10px;
        font-size: 12px;
        min-height: 40px;
      }
      .pjip-modal-btn--primary {
        border-color: #1f69d5;
        background: #1f69d5;
        color: #fff;
      }
      .pjip-modal-btn--ghost {
        background: #f8fbff;
      }
      .pjip-modal-btn--danger {
        border-color: #fecaca;
        background: #fff7f7;
        color: #b42318;
      }
      .pjip-backup {
        display: grid;
        gap: 14px;
      }
      .pjip-backup[hidden] {
        display: none;
      }
      .pjip-backup-popover {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(15, 23, 42, .34);
      }
      .pjip-backup-popover[data-open="true"] {
        display: flex;
      }
      .pjip-backup-dialog {
        width: min(720px, calc(100vw - 36px));
        max-height: min(84vh, 760px);
        padding: 16px;
        overflow: auto;
        box-sizing: border-box;
        border: 1px solid #dbe3ef;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 24px 70px rgba(2, 6, 23, .30);
      }
      .pjip-backup-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .pjip-backup-close {
        width: 32px;
        height: 32px;
        min-width: 32px;
        padding: 0;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        background: #f8fbff;
        color: #173a61;
        cursor: pointer;
        font-size: 17px;
        line-height: 1;
      }
      .pjip-backup-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 14px;
      }
      .pjip-backup-span {
        grid-column: 1 / -1;
      }
      .pjip-backup-field {
        display: grid;
        gap: 5px;
        min-width: 0;
      }
      .pjip-backup-field label {
        color: #2d4668;
        font-size: 12px;
        font-weight: 700;
      }
      .pjip-backup-actions {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-top: 14px;
      }
      .pjip-backup-primary {
        border-color: #1f69d5;
        background: #1f69d5;
        color: #fff;
      }
      .pjip-backup-success {
        border-color: #16833a;
        background: #18883f;
        color: #fff;
      }
      .pjip-backup-danger {
        border-color: #fecaca;
        background: #fff7f7;
        color: #b42318;
      }
      .pjip-item--done {
        opacity: .78;
      }
      .pjip-item {
        position: relative;
        grid-template-columns: minmax(140px, .62fr) minmax(0, 1.38fr) auto;
        align-items: center;
        gap: 14px;
        padding: 12px 14px;
      }
      .pjip-item-top {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      .pjip-item-id {
        font-size: 19px;
        font-weight: 700;
        color: #164172;
        line-height: 1.05;
      }
      .pjip-item-status {
        border-radius: 999px;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 700;
        color: #2d506f;
        background: #e8eff8;
        width: fit-content;
      }
      .pjip-item-status--done {
        color: #18663a;
        background: #dff3e5;
      }
      .pjip-item-status--late {
        color: #8f2525;
        background: #ffe1e1;
      }
      .pjip-item-status--soon {
        color: #805400;
        background: #fff0c7;
      }
      .pjip-item-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .pjip-item-pill {
        padding: 4px 7px;
        border-radius: 999px;
        background: #eef4fb;
        color: #365879;
        font-size: 11px;
        font-weight: 700;
      }
      .pjip-item-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        color: #20364f;
        font-size: 12px;
        min-width: 0;
      }
      .pjip-item-line {
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      .pjip-item-line strong {
        color: #4f6783;
        font-size: 11px;
        letter-spacing: .02em;
      }
      .pjip-item-line span {
        overflow-wrap: anywhere;
      }
      .pjip-item-actions {
        justify-content: flex-end;
        min-width: 178px;
      }
      .pjip-item-grid strong {
        color: #4f6783;
      }
      .pjip-empty {
        padding: 18px;
        border: 1px dashed #cad7ea;
        border-radius: 14px;
        background: #fff;
        color: #5c718b;
        text-align: center;
      }
      @media (max-width: 860px) {
        #${IDS.modalOverlay} {
          padding: 12px;
        }
        #${IDS.modalPanel} {
          width: min(100vw - 8px, 1180px);
          height: 92vh;
          max-height: 92vh;
        }
        .pjip-modal-body,
        .pjip-overview,
        .pjip-toolbar-grid,
        .pjip-toolbar-row,
        .pjip-deadline-grid,
        .pjip-deadline-row,
        .pjip-deadline-row--range,
        .pjip-backup-grid,
        .pjip-backup-actions,
        .pjip-summary-grid,
        .pjip-item,
        .pjip-item-grid {
          grid-template-columns: 1fr;
        }
        .pjip-modal-body {
          grid-template-areas:
            "rail"
            "deadline"
            "list";
        }
        .pjip-summary-head,
        .pjip-list-head,
        .pjip-deadline-head,
        .pjip-backup-head,
        .pjip-item-top {
          flex-direction: column;
          align-items: stretch;
        }
        .pjip-summary-actions {
          justify-content: flex-start;
        }
      }
      ${INTIMACOES_REDESIGN_CSS}
      ${BACKUP_UI_CSS}
    `;

    document.head.appendChild(style);
  }

  /**
   * Carrega a fonte de icones usada nos botoes do painel.
   */
  const fontAwesomeRoots = new WeakMap();
  const fontAwesomeSprites = new WeakMap();

  function ensureFontAwesome(doc = document) {
    if (!doc) return Promise.resolve(null);
    const styleHost = doc.head || doc.documentElement;
    if (!styleHost) return Promise.resolve(null);
    if (!doc.getElementById('pj-suite-core-style')) {
      const coreStyle = doc.createElement('style');
      coreStyle.id = 'pj-suite-core-style';
      coreStyle.textContent = SUITE_UI_CSS;
      styleHost.appendChild(coreStyle);
    }
    const mounted = doc.getElementById('pj-suite-fa-sprite');
    if (mounted) return Promise.resolve(mounted);
    if (fontAwesomeSprites.has(doc)) return fontAwesomeSprites.get(doc);
    const promise = new Promise((resolve, reject) => {
      gmXmlHttpRequest({
        method: 'GET',
        url: FA_SPRITE_URL,
        onload: response => {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`Font Awesome respondeu com status ${response.status}.`));
            return;
          }
          const Parser = doc.defaultView?.DOMParser || DOMParser;
          const source = new Parser().parseFromString(response.responseText || '', 'image/svg+xml');
          if (source.querySelector('parsererror')) {
            reject(new Error('Sprite SVG do Font Awesome inválido.'));
            return;
          }
          const existingSprite = doc.getElementById('pj-suite-fa-sprite');
          if (existingSprite) {
            resolve(existingSprite);
            return;
          }
          const sprite = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
          sprite.id = 'pj-suite-fa-sprite';
          sprite.setAttribute('aria-hidden', 'true');
          sprite.style.display = 'none';
          source.querySelectorAll('symbol[id]').forEach(symbol => {
            const clone = doc.importNode(symbol, true);
            clone.id = `pj-suite-fa-${symbol.id}`;
            sprite.appendChild(clone);
          });
          (doc.body || doc.documentElement).prepend(sprite);
          resolve(sprite);
        },
        onerror: () => reject(new Error('Falha ao carregar o sprite SVG do Font Awesome.')),
        ontimeout: () => reject(new Error('Tempo esgotado ao carregar o sprite SVG do Font Awesome.'))
      });
    }).catch(error => {
      logWarn('Falha ao preparar ícones SVG.', error);
      return null;
    });
    fontAwesomeSprites.set(doc, promise);
    return promise;
  }

  function convertFontAwesomeIcons(root) {
    const doc = root.ownerDocument || document;
    const icons = root.matches?.('i.fa-solid') ? [root] : [];
    icons.push(...root.querySelectorAll('i.fa-solid'));
    icons.forEach(icon => {
      const nameClass = [...icon.classList].find(name => /^fa-[a-z0-9-]+$/i.test(name) && name !== 'fa-solid' && !/^fa-\d+x$/i.test(name));
      if (!nameClass) return;
      const symbolId = `pj-suite-fa-${nameClass.slice(3)}`;
      if (!doc.getElementById(symbolId)) return;
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', [...new Set([...icon.classList, 'pj-suite-fa'])].join(' '));
      [...icon.attributes].forEach(attribute => {
        if (attribute.name === 'class') return;
        svg.setAttribute(attribute.name, attribute.value);
      });
      if (!svg.hasAttribute('aria-hidden')) svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#${symbolId}`);
      svg.appendChild(use);
      icon.replaceWith(svg);
    });
  }

  function renderFontAwesome(root) {
    if (!root || root.nodeType !== 1) return;
    const doc = root.ownerDocument || document;
    root.setAttribute('data-pj-suite-ui', 'intimacoes');
    const spritePromise = ensureFontAwesome(doc);
    if (!spritePromise || typeof spritePromise.then !== 'function') return;
    spritePromise.then(sprite => {
      if (!sprite || !root.isConnected) return;
      convertFontAwesomeIcons(root);
      if (fontAwesomeRoots.has(root)) return;
      const observer = new MutationObserver(() => convertFontAwesomeIcons(root));
      observer.observe(root, { childList: true, subtree: true });
      fontAwesomeRoots.set(root, observer);
    });
  }

  /**
   * Injeta estilos no iframe apenas quando ele esta em contexto relevante.
   * @param {Document} doc
   */
  function injectFrameStyles(doc) {
    if (doc.getElementById(IDS.frameStyle)) return;

    const style = doc.createElement('style');
    style.id = IDS.frameStyle;
    style.textContent = `
      .pjip-table tbody tr.pjip-row--marked > td {
        background-color: #eaf3ff !important;
      }
      .pjip-table tbody tr.pjip-row--done > td {
        background-color: #eaf8ef !important;
      }
      .pjip-row--hidden {
        display: none !important;
      }
      .pjip-inline {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        margin-left: 3px;
        white-space: nowrap;
        vertical-align: middle;
      }
      .pjip-native-host {
        white-space: nowrap;
        vertical-align: middle !important;
      }
      .pjip-inline-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        width: calc(var(--pjip-native-icon-size, 16px) + 6px);
        height: calc(var(--pjip-native-icon-size, 16px) + 6px);
        padding: 0 !important;
        margin: 0 !important;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: #1d4d87;
        line-height: 1;
        vertical-align: middle;
        box-shadow: none;
      }
      .pjip-inline-btn:hover {
        background: transparent;
        color: #114b96;
      }
      .pjip-inline-icon {
        display: block;
        width: var(--pjip-native-icon-size, 16px);
        height: var(--pjip-native-icon-size, 16px);
        overflow: visible;
        fill: currentColor;
        pointer-events: none;
      }
      .pjip-inline-btn[data-active="false"] .pjip-inline-icon {
        opacity: .46;
      }
      .pjip-inline-btn--mark[data-active="true"] {
        color: #1f69d5;
      }
      .pjip-inline-btn--done[data-active="true"] {
        color: #16833a;
      }
      .pjip-inline-btn[disabled] {
        opacity: .4;
        cursor: default;
      }
      .pjip-inline-btn[disabled]:hover {
        background: transparent;
        color: #1d4d87;
      }
    `;

    (doc.head || doc.documentElement).appendChild(style);
  }

  /**
   * Garante a existencia do menu de acoes flutuante.
   */
  function ensureActionMenu() {
    if (document.getElementById(IDS.hostRoot)) return;

    const root = document.createElement('div');
    root.id = IDS.hostRoot;
    root.classList.add('pjip-hidden');

    const panel = document.createElement('div');
    panel.id = IDS.actionsPanel;
    panel.className = 'pjip-actions-panel';
    panel.dataset.open = 'false';

    const head = document.createElement('div');
    head.className = 'pjip-actions-head';
    head.innerHTML = '<i class="fa-solid fa-bolt" aria-hidden="true"></i><span>Ações de Intimações</span>';

    const body = document.createElement('div');
    body.className = 'pjip-actions-body';

    body.appendChild(buildMenuButton('Carregar todas as páginas', () => unifyPages(null), 'fa-solid fa-layer-group'));
    body.appendChild(buildMenuButton('Carregar 10 páginas', () => unifyPages(10), 'fa-solid fa-table-list'));
    body.appendChild(
      buildMenuButton('Carregar X páginas', () => {
        const raw = window.prompt('Quantas páginas deseja carregar?', '20');
        if (raw === null) return;
        const amount = Number.parseInt(String(raw).trim(), 10);
        if (!Number.isFinite(amount) || amount < 1) {
          window.alert('Informe um número inteiro maior que 0.');
          return;
        }
        unifyPages(amount);
      }, 'fa-solid fa-hashtag')
    );

    const divider = document.createElement('div');
    divider.className = 'pjip-actions-divider';
    body.appendChild(divider);
    body.appendChild(buildMenuButton('Exportar CSV', () => exportCSV(), 'fa-solid fa-file-csv'));
    body.appendChild(buildMenuButton('Exportar PDF', () => exportPDF(), 'fa-solid fa-file-pdf'));
    body.appendChild(buildMenuButton('Minhas intimações e prazos', () => openModal(), 'fa-solid fa-calendar-check'));

    panel.append(head, body);

    const fab = document.createElement('button');
    fab.id = IDS.actionsFab;
    fab.className = 'pjip-fab';
    fab.type = 'button';
    fab.innerHTML = '<i class="fa-solid fa-bell" aria-hidden="true"></i>';
    fab.setAttribute('aria-label', 'Abrir ações de intimações');
    fab.addEventListener('click', () => {
      state.menuOpen = !state.menuOpen;
      updateActionPanelState();
    });

    root.append(panel, fab);
    document.body.appendChild(root);
    renderFontAwesome(root);
  }

  /**
   * Garante o balão de prazos do dia, usado exclusivamente na tela inicial.
   */
  function ensureTodayDeadlineFab() {
    if (document.getElementById(IDS.todayDeadlineRoot)) return;

    const root = document.createElement('div');
    root.id = IDS.todayDeadlineRoot;
    root.classList.add('pjip-hidden');

    const fab = document.createElement('button');
    fab.id = IDS.todayDeadlineFab;
    fab.className = 'pjip-today-deadline-fab';
    fab.type = 'button';
    fab.innerHTML = '<i class="fa-solid fa-hourglass-half" aria-hidden="true"></i>';
    fab.addEventListener('click', () => openTodayDeadlinePanel());

    const count = document.createElement('span');
    count.id = IDS.todayDeadlineCount;
    count.className = 'pjip-today-deadline-count';
    count.setAttribute('aria-hidden', 'true');

    fab.appendChild(count);
    root.appendChild(fab);
    document.body.appendChild(root);
    renderFontAwesome(root);
    if (state.pageContext) updateTodayDeadlineFabVisibility(state.pageContext);
    else renderTodayDeadlineFab();
  }

  /**
   * Atualiza o balão conforme a página do iframe principal.
   * @param {{isHomePage?: boolean}} context
   */
  function updateTodayDeadlineFabVisibility(context) {
    const root = document.getElementById(IDS.todayDeadlineRoot);
    if (!root) return;
    const count = getTodayDeadlineProcessCount();
    const shouldShow = Boolean(context?.isHomePage) && count > 0;
    root.classList.toggle('pjip-hidden', !shouldShow);
    if (shouldShow) renderTodayDeadlineFab(count);
  }

  /**
   * Atualiza o número e a acessibilidade do balão.
   * @param {number=} count
   */
  function renderTodayDeadlineFab(count = getTodayDeadlineProcessCount()) {
    const fab = document.getElementById(IDS.todayDeadlineFab);
    const countNode = document.getElementById(IDS.todayDeadlineCount);
    if (!fab || !countNode) return;
    const visibleCount = count > 99 ? '99+' : String(count);
    const label = `Abrir intimações vencendo: ${count} ${count === 1 ? 'processo' : 'processos'} com prazo hoje`;
    countNode.textContent = visibleCount;
    fab.title = label;
    fab.setAttribute('aria-label', label);
  }

  /**
   * Abre o painel já selecionando o filtro local "Vencem hoje".
   */
  function openTodayDeadlinePanel() {
    state.store.ui.statusFilter = 'today';
    state.store.ui.sortBy = 'deadline-asc';
    state.store.ui.query = '';
    openModal();
  }

  function applyQuickDeadlineFilter(mode) {
    const today = cloneDay(new Date());
    if (mode === 'today') {
      setDeadlineStored(DEADLINE.filterDateKey, toYmd(today));
      setDeadlineFilterMode('exact');
      setDeadlineFilterEnabled(true);
    } else if (mode === 'next7') {
      const end = cloneDay(today);
      end.setDate(end.getDate() + 6);
      setDeadlineStored(DEADLINE.filterRangeStartKey, toYmd(today));
      setDeadlineStored(DEADLINE.filterRangeEndKey, toYmd(end));
      setDeadlineFilterMode('range');
      setDeadlineFilterEnabled(true);
    } else if (mode === 'missing') {
      setDeadlineFilterMode('missing');
      setDeadlineFilterEnabled(true);
    } else {
      clearDeadlineStored(DEADLINE.filterDateKey);
      clearDeadlineStored(DEADLINE.filterRangeStartKey);
      clearDeadlineStored(DEADLINE.filterRangeEndKey);
      setDeadlineFilterMode('exact');
      setDeadlineFilterEnabled(false);
    }
    applyDeadlineSettingsChange();
    renderModal();
  }

  /**
   * Remove o menu flutuante quando a pagina deixa de ser relevante.
   */
  function teardownActionMenu() {
    state.menuOpen = false;
    document.getElementById(IDS.hostRoot)?.remove();
  }

  /**
   * Atualiza visibilidade do menu flutuante.
   * @param {ReturnType<typeof analyzeFrameContext>} context
   */
  function updateActionMenuVisibility(context) {
    const root = document.getElementById(IDS.hostRoot);
    if (!root) return;
    const shouldShowMenu = Boolean(context.showActionMenu);
    if (!shouldShowMenu) state.menuOpen = false;
    root.classList.toggle('pjip-hidden', !shouldShowMenu);
    updateActionPanelState();
  }

  /**
   * Atualiza o estado visual do painel flutuante.
   */
  function updateActionPanelState() {
    const panel = document.getElementById(IDS.actionsPanel);
    const fab = document.getElementById(IDS.actionsFab);
    if (!panel || !fab) return;
    panel.dataset.open = state.menuOpen ? 'true' : 'false';
    fab.innerHTML = state.menuOpen
      ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-bell" aria-hidden="true"></i>';
  }

  /**
   * Cria botao do menu principal.
   * @param {string} label
   * @param {() => void} onClick
   * @returns {HTMLButtonElement}
   */
  function buildMenuButton(label, onClick, iconClass = 'fa-solid fa-bolt') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pjip-action-btn';
    button.innerHTML = `<i class="${iconClass}" aria-hidden="true"></i><span>${label}</span>`;
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Mostra notificacao pequena e temporaria.
   * @param {string} message
   */
  function showToast(message) {
    let toast = document.getElementById(IDS.toast);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = IDS.toast;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      if (toast) toast.style.opacity = '0';
    }, 1800);
  }

  /**
   * Unifica multiplas paginas em uma so usando um iframe temporario e polling local.
   * @param {number | null} maxPages
   */
  async function unifyPages(maxPages) {
    const context = state.pageContext;
    if (!context?.mainTable || !state.frame) {
      window.alert('Tabela principal não encontrada.');
      return;
    }

    const button = /** @type {HTMLButtonElement | null} */ (document.activeElement instanceof HTMLButtonElement ? document.activeElement : null);
    const originalMarkup = button?.innerHTML || '';
    setBusyButtonLabel(button, 'Carregando...');

    try {
      const mainDoc = context.doc;
      const mainTable = context.mainTable;
      const targetBody = mainTable.tBodies[0] || mainTable;
      const pager = mainDoc.querySelector(SELECTORS.pager);
      const pagerInfo = analyzePager(mainDoc, pager);

      if (!pagerInfo || pagerInfo.totalPages < 2) {
        window.alert('Sem paginação disponível.');
        return;
      }

      const loader = document.createElement('iframe');
      loader.style.display = 'none';
      state.frame.parentElement?.appendChild(loader);

      try {
        loader.src = state.frame.contentWindow?.location?.href || context.url;
        await waitForFrameLoad(loader);

        const targetPage = maxPages ? Math.min(maxPages, pagerInfo.totalPages) : pagerInfo.totalPages;
        if (targetPage <= 1) return;

        for (let currentPage = 2; currentPage <= targetPage; currentPage += 1) {
          setBusyButtonLabel(button, `Página ${currentPage}/${targetPage}...`);
          await navigateLoaderToPage(loader, currentPage, pagerInfo);

          const loaderDoc = loader.contentDocument;
          if (!loaderDoc) continue;
          const nextTable = findBestMainTable(loaderDoc);
          if (!nextTable) continue;

          const rows = Array.from(nextTable.querySelectorAll('tbody tr')).filter((row) => row.querySelector('td'));
          for (const row of rows) {
            targetBody.appendChild(mainDoc.importNode(row, true));
          }
        }

        if (!maxPages || targetPage === pagerInfo.totalPages) {
          pager?.remove();
        }

        showToast('Páginas reunidas com sucesso');
        refreshFrameContext();
      } finally {
        loader.remove();
      }
    } catch (error) {
      logError('Falha ao unificar as paginas de intimacoes.', error);
      window.alert('Não foi possível unificar as páginas.');
    } finally {
      restoreBusyButton(button, originalMarkup);
    }
  }

  /**
   * Ajusta estado visual de um botao durante operacao.
   * @param {HTMLButtonElement | null} button
   * @param {string} text
   */
  function setBusyButtonLabel(button, text) {
    if (!button) return;
    button.disabled = true;
    button.textContent = text;
  }

  /**
   * Restaura o botao ao estado normal.
   * @param {HTMLButtonElement | null} button
   * @param {string} originalText
   */
  function restoreBusyButton(button, originalMarkup) {
    if (!button) return;
    button.disabled = false;
    if (originalMarkup) button.innerHTML = originalMarkup;
  }

  /**
   * Analisa o paginador.
   * @param {Document} doc
   * @param {Element | null} pagerElement
   * @returns {{totalPages: number, canCallBuscaDados: boolean, inputSelector: string | null, buttonSelector: string | null, pageSize: number | null} | null}
   */
  function analyzePager(doc, pagerElement) {
    if (!pagerElement) return null;

    const input = pagerElement.querySelector('#CaixaTextoPosicionar, .CaixaTextoPosicionar, input[type="text"], input[type="number"]');
    let totalPages = input ? Number.parseInt(String(input.value || input.getAttribute('value') || '').trim(), 10) : Number.NaN;

    if (!Number.isFinite(totalPages) || totalPages < 2) {
      const links = Array.from(pagerElement.querySelectorAll('a'));
      const lastLink = links.find((link) => /ultima|última/i.test(link.textContent || ''));
      const extracted = lastLink ? extractLastNumber(lastLink.getAttribute('href')) : null;
      if (typeof extracted === 'number') totalPages = extracted + 1;
    }

    if (!Number.isFinite(totalPages) || totalPages < 2) return null;

    const goButton = pagerElement.querySelector('.BotaoIr, input[value="Ir"], button');

    return {
      totalPages,
      canCallBuscaDados: typeof doc.defaultView?.buscaDados === 'function',
      inputSelector: input ? buildCssPath(input) : null,
      buttonSelector: goButton ? buildCssPath(goButton) : null,
      pageSize: extractSecondNumberFromPager(pagerElement)
    };
  }

  /**
   * Navega o iframe temporario ate uma pagina alvo.
   * @param {HTMLIFrameElement} loader
   * @param {number} pageNumber
   * @param {NonNullable<ReturnType<typeof analyzePager>>} pagerInfo
   */
  async function navigateLoaderToPage(loader, pageNumber, pagerInfo) {
    const loaderDoc = loader.contentDocument;
    const loaderWin = loader.contentWindow;
    if (!loaderDoc || !loaderWin) throw new Error('Iframe temporario indisponivel.');

    const currentTable = findBestMainTable(loaderDoc);
    const previousSignature = captureTableSnapshot(currentTable);

    if (pagerInfo.canCallBuscaDados && typeof loaderWin.buscaDados === 'function') {
      loaderWin.buscaDados(pageNumber - 1, pagerInfo.pageSize || 15);
      await waitForTableChange(loaderDoc, previousSignature);
      return;
    }

    if (pagerInfo.inputSelector && pagerInfo.buttonSelector) {
      const input = loaderDoc.querySelector(pagerInfo.inputSelector);
      const button = loaderDoc.querySelector(pagerInfo.buttonSelector);
      if (input && button) {
        input.value = String(pageNumber);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof button.click === 'function') button.click();
        await waitForTableChange(loaderDoc, previousSignature);
        return;
      }
    }

    const link = Array.from(loaderDoc.querySelectorAll(`${SELECTORS.pager} a, a`)).find(
      (anchor) => Number.parseInt(String(anchor.textContent || '').trim(), 10) === pageNumber
    );
    if (link) {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitForTableChange(loaderDoc, previousSignature);
      return;
    }

    loader.src = loaderWin.location.href;
    await waitForFrameLoad(loader);
  }

  /**
   * Aguarda carga do iframe.
   * @param {HTMLIFrameElement} frame
   * @returns {Promise<void>}
   */
  function waitForFrameLoad(frame) {
    return new Promise((resolve) => {
      const handler = () => {
        frame.removeEventListener('load', handler);
        resolve();
      };
      frame.addEventListener('load', handler, { once: true });
    });
  }

  /**
   * Captura uma assinatura simples da tabela.
   * @param {HTMLTableElement | null} table
   * @returns {string}
   */
  function captureTableSnapshot(table) {
    if (!table) return 'missing';
    const rows = Array.from(table.querySelectorAll('tbody tr')).filter((row) => row.querySelector('td'));
    const firstText = rows[0] ? normalizeSpaces(rows[0].textContent || '').slice(0, 80) : '';
    return `${rows.length}|${firstText}`;
  }

  /**
   * Espera uma mudanca na tabela usando polling curto e local.
   * Isso substitui MutationObserver longo e reduz uso de memoria.
   * @param {Document} doc
   * @param {string} previousSnapshot
   * @returns {Promise<void>}
   */
  function waitForTableChange(doc, previousSnapshot) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const interval = window.setInterval(() => {
        const nextTable = findBestMainTable(doc);
        const nextSnapshot = captureTableSnapshot(nextTable);
        if (nextSnapshot !== previousSnapshot || Date.now() - startedAt > 8000) {
          window.clearInterval(interval);
          resolve();
        }
      }, 120);
    });
  }

  /**
   * Exporta tabela para CSV.
   */
  function exportCSV() {
    const table = state.pageContext?.mainTable;
    if (!table) {
      window.alert('Tabela não encontrada para exportação.');
      return;
    }

    const rows = [];
    const pushRow = (values) => {
      rows.push(values.map(escapeCsv).join(';'));
    };

    const headers = Array.from((table.tHead || table).querySelectorAll('th')).map((cell) => normalizeSpaces(cell.innerText || cell.textContent || ''));
    if (headers.length) pushRow(headers);

    for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
      const values = Array.from(row.querySelectorAll('td')).map((cell) => normalizeSpaces(cell.innerText || cell.textContent || ''));
      if (values.length) pushRow(values);
    }

    const blob = new Blob(['\ufeff', rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    triggerDownload(blob, buildTimestampedFileName('intimacoes', 'csv'));
    showToast('CSV gerado');
  }

  /**
   * Exporta tabela para PDF.
   */
  function exportPDF() {
    const table = state.pageContext?.mainTable;
    if (!table) {
      window.alert('Tabela não encontrada para exportação.');
      return;
    }

    exportPdfWithJsPdf(table).catch((error) => {
      logWarn('Falha ao gerar PDF via jsPDF. Sera usado o fallback de impressao.', error);
      exportPdfViaPrint(table);
    });
  }

  /**
   * Exporta PDF com jsPDF carregado sob demanda.
   * @param {HTMLTableElement} table
   */
  async function exportPdfWithJsPdf(table) {
    await ensurePdfLibraries();

    const jsPdfNamespace = window.jspdf;
    if (!jsPdfNamespace?.jsPDF || typeof jsPdfNamespace.jsPDF.API.autoTable !== 'function') {
      throw new Error('Bibliotecas jsPDF indisponíveis.');
    }

    const matrix = tableToMatrix(table);
    if (!matrix.body.length) throw new Error('Tabela vazia.');

    const doc = new window.jspdf.jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const now = new Date();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Intimações', 10, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Gerado em: ${now.toLocaleString('pt-BR')}`, 10, 15);

    doc.autoTable({
      head: matrix.head,
      body: matrix.body,
      startY: 19,
      theme: 'grid',
      headStyles: {
        fillColor: [238, 242, 247],
        textColor: [20, 32, 54],
        fontSize: 8,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [26, 31, 44],
        valign: 'top',
        cellPadding: 1.2,
        lineColor: [215, 221, 231],
        lineWidth: 0.1
      },
      margin: { top: 19, right: 7, bottom: 10, left: 7 },
      styles: {
        overflow: 'linebreak',
        cellWidth: 'wrap',
        minCellHeight: 4
      },
      didDrawPage: () => {
        const page = doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(90, 104, 124);
        doc.text(`Página ${page}`, pageWidth - 24, doc.internal.pageSize.getHeight() - 4);
      }
    });

    doc.save(buildTimestampedFileName('intimacoes', 'pdf'));
    showToast('PDF gerado');
  }

  /**
   * Fallback de exportacao via janela de impressao.
   * @param {HTMLTableElement} table
   */
  function exportPdfViaPrint(table) {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=800');
    if (!printWindow) {
      window.alert('Bloqueador de pop-up ativo. Permita pop-up para gerar PDF.');
      return;
    }

    const generatedAt = new Date().toLocaleString('pt-BR');
    printWindow.document.open();
    printWindow.document.write(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Intimações</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:20px;color:#111}h1{font-size:18px;margin:0 0 8px}.meta{font-size:12px;margin-bottom:12px;color:#444}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #bbb;padding:6px;vertical-align:top}th{background:#f3f3f3}@media print{body{margin:10mm}}</style></head><body><h1>Intimações</h1><div class="meta">Gerado em: ${generatedAt}</div>${table.outerHTML}</body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 250);
    showToast('Impressão PDF aberta');
  }

  /**
   * Carrega jsPDF e AutoTable sob demanda.
   * @returns {Promise<void>}
   */
  async function ensurePdfLibraries() {
    if (window.jspdf?.jsPDF && typeof window.jspdf.jsPDF.API.autoTable === 'function') return;
    if (state.pdfPromise) return state.pdfPromise;

    state.pdfPromise = (async () => {
      await loadScriptOnce(PDF_CDNS.jspdf);
      await loadScriptOnce(PDF_CDNS.autoTable);
      if (!window.jspdf?.jsPDF || typeof window.jspdf.jsPDF.API.autoTable !== 'function') {
        throw new Error('Não foi possível carregar jsPDF/AutoTable.');
      }
    })();

    try {
      await state.pdfPromise;
    } finally {
      state.pdfPromise = null;
    }
  }

  /**
   * Carrega um script externo apenas uma vez.
   * @param {string} src
   * @returns {Promise<void>}
   */
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-pjip-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Falha ao carregar ${src}`)), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.async = true;
      script.src = src;
      script.dataset.pjipSrc = src;
      script.addEventListener(
        'load',
        () => {
          script.dataset.loaded = '1';
          resolve();
        },
        { once: true }
      );
      script.addEventListener('error', () => reject(new Error(`Falha ao carregar ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  /**
   * Converte tabela em matriz para exportacao.
   * @param {HTMLTableElement} table
   * @returns {{head: string[][], body: string[][]}}
   */
  function tableToMatrix(table) {
    const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
    const head = [
      Array.from(headerRow?.querySelectorAll('th,td') || []).map((cell) =>
        normalizeSpaces(cell.innerText || cell.textContent || '')
      )
    ];

    const body = Array.from(table.querySelectorAll('tbody tr'))
      .filter((row) => row.querySelector('td'))
      .map((row) =>
        Array.from(row.querySelectorAll('td')).map((cell) =>
          normalizeSpaces(cell.innerText || cell.textContent || '')
        )
      );

    return { head, body };
  }

  /**
   * Abre o painel de gerenciamento.
   */
  function openModal() {
    state.modalOpen = true;
    state.store.ui.panelOpen = true;
    persistStore();
    ensureFontAwesome();
    ensureModal();
    renderModal();
  }

  /**
   * Fecha o painel de gerenciamento.
   */
  function closeModal() {
    state.modalOpen = false;
    state.store.ui.panelOpen = false;
    state.store.ui.backupExpanded = false;
    persistStore();
    const overlay = document.getElementById(IDS.modalOverlay);
    if (overlay) overlay.dataset.open = 'false';
  }

  /**
   * Mantém a roda e o gesto vertical do trackpad ligados ao único scroller
   * do painel, mesmo quando o ponteiro está sobre a navegação ou a tabela.
   * Gestos horizontais continuam pertencendo ao wrapper da fila.
   * @param {WheelEvent} event
   * @param {HTMLElement} body
   */
  function routeModalWheel(event, body) {
    if (event.defaultPrevented || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    const target = resolveEventElement(event.target);
    if (!target || !body.contains(target) || target.closest('[data-role="backup-popover"][data-open="true"]')) return;

    const workspace = body.querySelector('.pjip-dashboard-workspace');
    if (!(workspace instanceof HTMLElement) || workspace.scrollHeight <= workspace.clientHeight) return;

    const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? workspace.clientHeight
        : 1;
    const delta = event.deltaY * multiplier;
    const canScroll = delta < 0
      ? workspace.scrollTop > 0
      : workspace.scrollTop + workspace.clientHeight < workspace.scrollHeight - 1;
    if (!canScroll) return;

    event.preventDefault();
    workspace.scrollTop += delta;
  }

  /**
   * Garante a existencia do modal apenas quando necessario.
   */
  function ensureModal() {
    if (state.modalRoot) return;

    const overlay = document.createElement('div');
    overlay.id = IDS.modalOverlay;
    overlay.dataset.open = 'false';

    const panel = document.createElement('section');
    panel.id = IDS.modalPanel;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Gerenciar Intimações');

    const head = document.createElement('div');
    head.className = 'pjip-modal-head';

    const headText = document.createElement('div');
    headText.className = 'pjip-modal-brand';
    const brandIcon = document.createElement('span');
    brandIcon.className = 'pjip-modal-brand-icon';
    brandIcon.innerHTML = '<i class="fa-solid fa-calendar-check" aria-hidden="true"></i>';
    const brandText = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'pjip-modal-title';
    title.textContent = 'Intimações';
    const subtitle = document.createElement('div');
    subtitle.className = 'pjip-modal-subtitle';
    subtitle.textContent = 'Triagem com atualização sob demanda.';
    brandText.append(title, subtitle);
    headText.append(brandIcon, brandText);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'pjip-modal-close';
    closeButton.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    closeButton.title = 'Fechar';
    closeButton.addEventListener('click', () => closeModal());

    head.append(headText, closeButton);

    const body = document.createElement('div');
    body.className = 'pjip-modal-body';
    body.innerHTML = `
      <nav class="pjip-dashboard-nav" aria-label="Navegação das intimações">
        <div class="pjip-dashboard-nav__label">Workspace</div>
        <div class="pjip-dashboard-nav__items">
          <button type="button" class="pjip-dashboard-nav__button" data-role="nav-filter" data-nav="focus" data-status="active" data-active="true"><i class="fa-solid fa-bell" aria-hidden="true"></i><span>Em foco</span></button>
          <button type="button" class="pjip-dashboard-nav__button" data-role="nav-filter" data-nav="all" data-status="all"><i class="fa-solid fa-folder" aria-hidden="true"></i><span>Todas</span></button>
          <button type="button" class="pjip-dashboard-nav__button" data-role="nav-filter" data-nav="done" data-status="done"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Concluídas</span></button>
          <button type="button" class="pjip-dashboard-nav__button" data-role="nav-settings"><i class="fa-solid fa-cloud" aria-hidden="true"></i><span>Backup remoto</span></button>
        </div>
        <div class="pjip-dashboard-nav__footer">
        </div>
      </nav>
      <main class="pjip-dashboard-workspace">
        <div class="pjip-dashboard-content">
          <section class="pjip-summary">
            <div class="pjip-dashboard-context">
              <div>
                <p class="pjip-dashboard-eyebrow">Resumo da triagem</p>
                <h1 class="pjip-dashboard-heading" data-role="summary-title">Hoje</h1>
                <p class="pjip-dashboard-description" data-role="summary-subtitle">Organizando o que exige atenção.</p>
              </div>
              <div class="pjip-dashboard-header-tools">
                <div class="pjip-dashboard-header-search">
                  <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                  <input id="pjip-modal-search" type="search" data-role="search" placeholder="Buscar intimações ou processos" aria-label="Buscar intimações ou processos">
                </div>
                <button type="button" class="pjip-modal-btn pjip-dashboard-export" data-role="export-csv"><i class="fa-solid fa-download" aria-hidden="true"></i><span>Exportar</span></button>
              </div>
            </div>
            <div class="pjip-metrics" aria-label="Resumo por prioridade">
              <button type="button" class="pjip-stat pjip-stat--late" data-role="quick-status" data-status="late">
                <i class="fa-solid fa-circle-exclamation pjip-stat-icon" aria-hidden="true"></i>
                <div class="pjip-stat-value" data-role="stat-late">0</div>
                <div class="pjip-stat-label">Vencidas</div>
              </button>
              <button type="button" class="pjip-stat pjip-stat--soon" data-role="quick-status" data-status="today">
                <i class="fa-solid fa-calendar-day pjip-stat-icon" aria-hidden="true"></i>
                <div class="pjip-stat-value" data-role="stat-today">0</div>
                <div class="pjip-stat-label">Vencem hoje</div>
              </button>
              <button type="button" class="pjip-stat pjip-stat--open" data-role="quick-status" data-status="next7">
                <i class="fa-solid fa-calendar-week pjip-stat-icon" aria-hidden="true"></i>
                <div class="pjip-stat-value" data-role="stat-next7">0</div>
                <div class="pjip-stat-label">Próximos 7 dias</div>
              </button>
              <button type="button" class="pjip-stat pjip-stat--done" data-role="quick-status" data-status="missing">
                <i class="fa-solid fa-infinity pjip-stat-icon" aria-hidden="true"></i>
                <div class="pjip-stat-value" data-role="stat-missing">0</div>
                <div class="pjip-stat-label">Sem prazo</div>
              </button>
            </div>
          </section>
          <section class="pjip-toolbar">
            <div class="pjip-toolbar-grid">
              <div class="pjip-field">
                <label for="pjip-modal-search-secondary">Busca</label>
                <input id="pjip-modal-search-secondary" type="search" data-role="search-secondary" placeholder="Buscar na fila de atenção">
              </div>
              <div class="pjip-toolbar-row">
                <div class="pjip-field">
                  <label for="pjip-modal-status">Status</label>
                  <select id="pjip-modal-status" data-role="status-filter">
                    <option value="all">Todos os status</option>
                    <option value="late">Vencidas</option>
                    <option value="soon">Vencendo</option>
                    <option value="open">Abertas</option>
                    <option value="done">Concluídas</option>
                    <option value="active">Em foco</option>
                    <option value="today">Vencem hoje</option>
                    <option value="next7">Próximos 7 dias</option>
                    <option value="missing">Sem prazo</option>
                  </select>
                </div>
                <div class="pjip-field">
                  <label for="pjip-modal-sort">Ordenação</label>
                  <select id="pjip-modal-sort" data-role="sort-by">
                    <option value="deadline-asc">Prazo mais próximo</option>
                    <option value="deadline-desc">Prazo mais distante</option>
                    <option value="updated-desc">Atualizadas recentemente</option>
                    <option value="id-asc">Número da intimação</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="pjip-checks">
              <label><input type="checkbox" data-role="hide-done"> Ocultar concluídas</label>
              <label><input type="checkbox" data-role="only-marked-page"> Mostrar só as marcadas nesta página</label>
            </div>
            <div class="pjip-toolbar-meta" data-role="meta"></div>
          </section>
          <section class="pjip-deadline" data-role="deadline-panel">
            <div class="pjip-deadline-head">
              <div class="pjip-section-title"><i class="fa-solid fa-calendar-days" aria-hidden="true"></i><span>Filtros de prazo</span></div>
              <div class="pjip-deadline-status" data-role="deadline-status"></div>
            </div>
            <div class="pjip-deadline-grid">
              <div class="pjip-deadline-card">
                <div class="pjip-deadline-card-title">Data exata</div>
                <div class="pjip-deadline-card-desc">Mostra somente os prazos da data escolhida.</div>
                <div class="pjip-deadline-row">
                  <input data-role="deadline-date" type="date" aria-label="Data exata">
                  <button type="button" class="pjip-modal-btn pjip-modal-btn--primary" data-role="deadline-apply-date"><i class="fa-solid fa-check" aria-hidden="true"></i><span>Aplicar</span></button>
                </div>
              </div>
              <div class="pjip-deadline-card">
                <div class="pjip-deadline-card-title">Período personalizado</div>
                <div class="pjip-deadline-card-desc">Limita a tabela ao intervalo informado.</div>
                <div class="pjip-deadline-row pjip-deadline-row--range">
                  <input data-role="deadline-range-start" type="date" aria-label="Data inicial">
                  <input data-role="deadline-range-end" type="date" aria-label="Data final">
                  <button type="button" class="pjip-modal-btn pjip-modal-btn--primary" data-role="deadline-apply-range"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i><span>Aplicar</span></button>
                </div>
              </div>
              <div class="pjip-deadline-card">
                <div class="pjip-deadline-card-title">Sem data limite</div>
                <div class="pjip-deadline-card-desc">Encontra linhas sem prazo preenchido.</div>
                <div class="pjip-deadline-row">
                  <button type="button" class="pjip-modal-btn pjip-modal-btn--primary" data-role="deadline-apply-missing"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span>Localizar</span></button>
                  <button type="button" class="pjip-modal-btn" data-role="deadline-clear"><i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i><span>Limpar</span></button>
                </div>
              </div>
            </div>
          </section>
          <section class="pjip-list-shell">
            <div class="pjip-list-head">
              <div>
                <div class="pjip-section-title"><i class="fa-solid fa-list-check" aria-hidden="true"></i><span>Fila de atenção</span></div>
                <div class="pjip-list-meta" data-role="list-meta"></div>
              </div>
            </div>
            <div class="pjip-table-scroll" data-role="table-scroll" aria-label="Fila de atenção com rolagem horizontal">
              <div class="pjip-table-head" aria-hidden="true"><span>Prioridade</span><span>Processo</span><span>Intimação</span><span>Movimentação</span><span>Prazo</span><span>Status</span><span>Ações</span></div>
              <section class="pjip-list" data-role="list"></section>
            </div>
          </section>
        </div>
        <aside class="pjip-detail pjip-detail--empty" data-role="detail" aria-live="polite">
          <div class="pjip-detail__icon"><i class="fa-solid fa-file-lines" aria-hidden="true"></i></div>
          <p>Selecione uma intimação para ver os detalhes e as ações disponíveis.</p>
        </aside>
      </main>
      <div class="pjip-backup-popover pj-backup-ui__popover" data-role="backup-popover">
        <section class="pjip-backup pjip-backup-dialog pj-backup-ui__dialog" data-role="backup-panel" role="dialog" aria-modal="true" aria-labelledby="pjip-backup-title">
          <div class="pjip-backup-head pj-backup-ui__header">
            <div>
              <div id="pjip-backup-title" class="pjip-section-title pj-backup-ui__title"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i><span>Backup remoto</span></div>
              <div class="pjip-backup-meta pj-backup-ui__description">Credenciais ficam somente neste navegador e nunca entram no arquivo de backup.</div>
            </div>
            <button type="button" class="pjip-backup-close pj-backup-ui__close" data-role="backup-close" title="Fechar" aria-label="Fechar"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </div>
          <div class="pjip-backup-grid pj-backup-ui__grid">
            <div class="pjip-backup-field pj-backup-ui__field">
              <label>Gist ID</label>
              <input class="pj-backup-ui__input" type="text" data-role="backup-gist-id" placeholder="Cole o Gist ID">
            </div>
            <div class="pjip-backup-field pj-backup-ui__field">
              <label>Arquivo</label>
              <input class="pj-backup-ui__input" type="text" data-role="backup-file-name" placeholder="projudi-intimacao-page.json">
            </div>
            <div class="pjip-backup-field pjip-backup-span pj-backup-ui__field pj-backup-ui__field--full">
              <label>Token do GitHub</label>
              <input class="pj-backup-ui__input" type="password" data-role="backup-token" placeholder="ghp_...">
            </div>
          </div>
          <div class="pjip-checks pj-backup-ui__toggles">
            <label class="pj-backup-ui__toggle"><input type="checkbox" data-role="backup-enabled"><span>Ativar backup por Gist no GitHub</span></label>
            <label class="pj-backup-ui__toggle"><input type="checkbox" data-role="backup-auto"><span>Backup automático</span></label>
          </div>
          <div class="pjip-backup-actions pj-backup-ui__actions">
            <button type="button" class="pjip-modal-btn pjip-backup-primary pj-backup-ui__button pj-backup-ui__button--primary" data-role="backup-send"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i><span>Enviar backup</span></button>
            <button type="button" class="pjip-modal-btn pjip-backup-success pj-backup-ui__button pj-backup-ui__button--success" data-role="backup-restore"><i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i><span>Restaurar backup</span></button>
            <button type="button" class="pjip-modal-btn pjip-backup-danger pj-backup-ui__button pj-backup-ui__button--danger" data-role="backup-clear"><i class="fa-solid fa-key" aria-hidden="true"></i><span>Remover configuração</span></button>
            <button type="button" class="pjip-modal-btn pj-backup-ui__button" data-role="backup-close"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Fechar</span></button>
          </div>
          <div class="pjip-backup-meta pj-backup-ui__status" data-role="backup-status" role="status" aria-live="polite"></div>
          <div class="pjip-backup-meta pj-backup-ui__last" data-role="backup-last"></div>
        </section>
      </div>
    `;

    overlay.appendChild(panel);
    panel.append(head, body);
    document.body.appendChild(overlay);
    renderFontAwesome(overlay);
    state.modalRoot = overlay;

    body.addEventListener('wheel', (event) => routeModalWheel(event, body), { passive: false });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });

    body.querySelector('[data-role="search"]')?.addEventListener('input', (event) => {
      const input = /** @type {HTMLInputElement} */ (event.currentTarget);
      state.store.ui.query = input.value || '';
      persistStore();
      renderModal();
    });

    body.querySelector('[data-role="search-secondary"]')?.addEventListener('input', (event) => {
      const input = /** @type {HTMLInputElement} */ (event.currentTarget);
      state.store.ui.query = input.value || '';
      persistStore();
      renderModal();
    });

    body.querySelector('[data-role="export-csv"]')?.addEventListener('click', () => exportCSV());

    body.querySelectorAll('[data-role="nav-filter"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        const target = /** @type {HTMLElement} */ (event.currentTarget);
        state.store.ui.statusFilter = target.dataset.status || 'active';
        persistStore();
        renderModal();
      });
    });

    body.querySelector('[data-role="nav-settings"]')?.addEventListener('click', () => {
      state.store.ui.backupExpanded = true;
      persistStore();
      renderModal();
    });

    body.querySelector('[data-role="hide-done"]')?.addEventListener('change', (event) => {
      const input = /** @type {HTMLInputElement} */ (event.currentTarget);
      state.store.ui.hideDone = input.checked;
      persistStore();
      renderModal();
    });

    body.querySelector('[data-role="status-filter"]')?.addEventListener('change', (event) => {
      const input = /** @type {HTMLSelectElement} */ (event.currentTarget);
      state.store.ui.statusFilter = input.value || 'active';
      persistStore();
      renderModal();
    });

    body.querySelectorAll('[data-role="quick-status"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        const target = /** @type {HTMLElement} */ (event.currentTarget);
        state.store.ui.statusFilter = target.dataset.status || 'active';
        persistStore();
        renderModal();
      });
    });

    body.querySelector('[data-role="sort-by"]')?.addEventListener('change', (event) => {
      const input = /** @type {HTMLSelectElement} */ (event.currentTarget);
      state.store.ui.sortBy = input.value || 'deadline-asc';
      persistStore();
      renderModal();
    });

    body.querySelector('[data-role="only-marked-page"]')?.addEventListener('change', (event) => {
      const input = /** @type {HTMLInputElement} */ (event.currentTarget);
      state.store.ui.onlyMarkedOnPage = input.checked;
      persistStore();
      refreshFrameContext();
      renderModal();
    });

    body.querySelectorAll('[data-role="quick-deadline"]').forEach((button) => {
      button.addEventListener('click', () => applyQuickDeadlineFilter(button.dataset.mode || 'clear'));
    });

    body.querySelectorAll('[data-role="backup-close"]').forEach(button => button.addEventListener('click', () => {
      state.store.ui.backupExpanded = false;
      persistStore();
      renderModal();
    }));

    body.querySelector('[data-role="backup-popover"]')?.addEventListener('click', (event) => {
      if (event.target !== event.currentTarget) return;
      state.store.ui.backupExpanded = false;
      persistStore();
      renderModal();
    });

    body.querySelector('[data-role="backup-send"]')?.addEventListener('click', async () => {
      const statusNode = body.querySelector('[data-role="backup-status"]');
      try {
        const settings = saveBackupSettings(readBackupSettingsFromModal(body));
        setNodeText(statusNode, 'Enviando backup...');
        if (statusNode instanceof HTMLElement) statusNode.dataset.state = 'progress';
        const signature = buildBackupSignature();
        const result = await pushBackupToGist(settings, buildBackupPayload());
        saveBackupSettings({
          ...settings,
          lastBackupAt: new Date().toISOString(),
          lastBackupSignature: signature
        });
        setNodeText(statusNode, result && result.skipped
          ? 'Backup remoto já estava atualizado; nenhum commit novo foi criado.'
          : 'Backup enviado com sucesso.');
        if (statusNode instanceof HTMLElement) statusNode.dataset.state = 'success';
        renderModal();
      } catch (error) {
        setNodeText(statusNode, error instanceof Error ? error.message : 'Falha ao enviar backup.');
        if (statusNode instanceof HTMLElement) statusNode.dataset.state = 'error';
      }
    });

    body.querySelector('[data-role="backup-restore"]')?.addEventListener('click', async () => {
      const statusNode = body.querySelector('[data-role="backup-status"]');
      try {
        const settings = saveBackupSettings(readBackupSettingsFromModal(body));
        setNodeText(statusNode, 'Restaurando backup...');
        if (statusNode instanceof HTMLElement) statusNode.dataset.state = 'progress';
        const payload = await readBackupFromGist(settings);
        if (!payload || typeof payload !== 'object' || payload.schema !== BACKUP_SCHEMA || payload.scriptId !== SCRIPT_ID || !payload.items || typeof payload.items !== 'object' || Array.isArray(payload.items)) {
          throw new Error('Backup incompatível com Intimações.');
        }
        state.store.items = payload.items;
        persistStore();
        saveBackupSettings({
          ...settings,
          lastBackupSignature: buildBackupSignature()
        });
        refreshFrameContext();
        setNodeText(statusNode, 'Backup restaurado com sucesso.');
        if (statusNode instanceof HTMLElement) statusNode.dataset.state = 'success';
        renderModal();
      } catch (error) {
        setNodeText(statusNode, error instanceof Error ? error.message : 'Falha ao restaurar backup.');
        if (statusNode instanceof HTMLElement) statusNode.dataset.state = 'error';
      }
    });

    body.querySelector('[data-role="backup-clear"]')?.addEventListener('click', () => {
      saveBackupSettings(BACKUP_DEFAULTS);
      renderModal();
    });

    body.querySelector('[data-role="deadline-apply-date"]')?.addEventListener('click', () => {
      const ymd = /** @type {HTMLInputElement | null} */ (body.querySelector('[data-role="deadline-date"]'))?.value || '';
      if (!ymdToDate(ymd)) {
        setNodeText(body.querySelector('[data-role="deadline-status"]'), 'Selecione uma data válida.');
        return;
      }
      setDeadlineStored(DEADLINE.filterDateKey, ymd);
      setDeadlineFilterMode('exact');
      setDeadlineFilterEnabled(true);
      applyDeadlineSettingsChange();
      renderModal();
    });

    body.querySelector('[data-role="deadline-apply-range"]')?.addEventListener('click', () => {
      const start = /** @type {HTMLInputElement | null} */ (body.querySelector('[data-role="deadline-range-start"]'))?.value || '';
      const end = /** @type {HTMLInputElement | null} */ (body.querySelector('[data-role="deadline-range-end"]'))?.value || '';
      if (!ymdToDate(start) || !ymdToDate(end)) {
        setNodeText(body.querySelector('[data-role="deadline-status"]'), 'Selecione data inicial e final válidas.');
        return;
      }
      setDeadlineStored(DEADLINE.filterRangeStartKey, start);
      setDeadlineStored(DEADLINE.filterRangeEndKey, end);
      setDeadlineFilterMode('range');
      setDeadlineFilterEnabled(true);
      applyDeadlineSettingsChange();
      renderModal();
    });

    body.querySelector('[data-role="deadline-apply-missing"]')?.addEventListener('click', () => {
      setDeadlineFilterMode('missing');
      setDeadlineFilterEnabled(true);
      applyDeadlineSettingsChange();
      renderModal();
    });

    body.querySelector('[data-role="deadline-clear"]')?.addEventListener('click', () => {
      clearDeadlineStored(DEADLINE.filterDateKey);
      clearDeadlineStored(DEADLINE.filterRangeStartKey);
      clearDeadlineStored(DEADLINE.filterRangeEndKey);
      setDeadlineFilterMode('exact');
      setDeadlineFilterEnabled(false);
      applyDeadlineSettingsChange();
      renderModal();
    });
  }

  /**
   * Lê configuracoes de backup a partir do modal.
   * @param {Element} root
   * @returns {typeof BACKUP_DEFAULTS}
   */
  function readBackupSettingsFromModal(root) {
    return normalizeBackupSettings({
      enabled: /** @type {HTMLInputElement | null} */ (root.querySelector('[data-role="backup-enabled"]'))?.checked,
      gistId: /** @type {HTMLInputElement | null} */ (root.querySelector('[data-role="backup-gist-id"]'))?.value,
      token: /** @type {HTMLInputElement | null} */ (root.querySelector('[data-role="backup-token"]'))?.value,
      fileName: /** @type {HTMLInputElement | null} */ (root.querySelector('[data-role="backup-file-name"]'))?.value,
      autoBackupOnSave: /** @type {HTMLInputElement | null} */ (root.querySelector('[data-role="backup-auto"]'))?.checked
    });
  }

  /**
   * Renderiza o modal apenas quando aberto.
   */
  function renderModal() {
    ensureModal();
    if (!state.modalRoot) return;

    state.modalRoot.dataset.open = state.modalOpen ? 'true' : 'false';
    if (!state.modalOpen) return;

    const root = state.modalRoot;
    const backupSettings = loadBackupSettings();
    const todayYmd = toYmd(cloneDay(new Date()));
    const filterDate = getDeadlineFilterDate() || todayYmd;
    const summary = buildItemsSummary();
    const visibleItems = getFilteredItems();
    setInputValue(root.querySelector('[data-role="search"]'), state.store.ui.query);
    setInputValue(root.querySelector('[data-role="search-secondary"]'), state.store.ui.query);
    setChecked(root.querySelector('[data-role="hide-done"]'), state.store.ui.hideDone);
    setChecked(root.querySelector('[data-role="only-marked-page"]'), state.store.ui.onlyMarkedOnPage);
    setSelectValue(root.querySelector('[data-role="status-filter"]'), state.store.ui.statusFilter);
    setSelectValue(root.querySelector('[data-role="sort-by"]'), state.store.ui.sortBy);
    setChecked(root.querySelector('[data-role="backup-enabled"]'), backupSettings.enabled);
    setChecked(root.querySelector('[data-role="backup-auto"]'), backupSettings.autoBackupOnSave);
    setInputValue(root.querySelector('[data-role="backup-gist-id"]'), backupSettings.gistId);
    setInputValue(root.querySelector('[data-role="backup-token"]'), backupSettings.token);
    setInputValue(root.querySelector('[data-role="backup-file-name"]'), backupSettings.fileName);
    setNodeText(root.querySelector('[data-role="backup-last"]'), formatLastBackupLabel(backupSettings.lastBackupAt));
    setInputValue(root.querySelector('[data-role="deadline-date"]'), filterDate);
    setInputValue(root.querySelector('[data-role="deadline-range-start"]'), getDeadlineRangeStart() || filterDate);
    setInputValue(root.querySelector('[data-role="deadline-range-end"]'), getDeadlineRangeEnd() || filterDate);
    setNodeText(root.querySelector('[data-role="deadline-status"]'), describeActiveDeadlineFilter());
    const todayLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
      .format(new Date())
      .replace(/\sde\s/g, ' ')
      .replace(/\./g, '');
    setNodeText(root.querySelector('[data-role="summary-title"]'), `Hoje, ${todayLabel}`);
    setNodeText(
      root.querySelector('[data-role="summary-subtitle"]'),
      summary.late
        ? `${summary.late} vencida(s) precisam de atenção imediata.`
        : `${formatCount(summary.visible, 'item visível', 'itens visíveis')} na fila atual.`
    );
    setNodeText(root.querySelector('[data-role="stat-late"]'), String(summary.late));
    setNodeText(root.querySelector('[data-role="stat-today"]'), String(summary.today));
    setNodeText(root.querySelector('[data-role="stat-next7"]'), String(summary.next7));
    setNodeText(root.querySelector('[data-role="stat-missing"]'), String(summary.noDeadline));
    root.querySelectorAll('[data-role="quick-status"]').forEach((button) => {
      if (button instanceof HTMLElement) {
        button.dataset.active = button.dataset.status === state.store.ui.statusFilter ? 'true' : 'false';
      }
    });
    root.querySelectorAll('[data-role="nav-filter"]').forEach((button) => {
      if (!(button instanceof HTMLElement)) return;
      const nav = button.dataset.nav;
      const active = nav === 'focus'
        ? ['active', 'late', 'soon', 'today', 'next7'].includes(state.store.ui.statusFilter)
        : nav === 'done'
          ? state.store.ui.statusFilter === 'done'
          : nav === 'all'
            ? state.store.ui.statusFilter === 'all'
            : false;
      button.dataset.active = active ? 'true' : 'false';
    });
    setNodeText(root.querySelector('[data-role="list-meta"]'), describeVisibleItems(summary.visible, summary.total, state.store.ui.statusFilter));
    setNodeText(
      root.querySelector('[data-role="meta"]'),
      `${formatCount(visibleItems.length, 'item visível', 'itens visíveis')} • ${formatCount(summary.total, 'intimação marcada', 'intimações marcadas')} • ordenação: ${resolveSortLabel(state.store.ui.sortBy)}.`
    );
    const backupPopover = root.querySelector('[data-role="backup-popover"]');
    if (backupPopover instanceof HTMLElement) {
      backupPopover.dataset.open = state.store.ui.backupExpanded ? 'true' : 'false';
    }

    const listNode = root.querySelector('[data-role="list"]');
    if (!listNode) return;
    listNode.replaceChildren();

    if (!visibleItems.length) {
      const empty = document.createElement('div');
      empty.className = 'pjip-empty';
      empty.textContent = 'Nenhuma intimação marcada para este filtro.';
      listNode.appendChild(empty);
      state.selectedItemId = null;
      renderDetail(root, null);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of visibleItems) {
      fragment.appendChild(buildModalItem(item));
    }
    listNode.appendChild(fragment);

    const selectedItem = visibleItems.find(item => String(item.id) === String(state.selectedItemId)) || visibleItems[0] || null;
    state.selectedItemId = selectedItem ? String(selectedItem.id) : null;
    renderDetail(root, selectedItem);
  }

  /**
   * Constroi um item do painel.
   * @param {any} item
   * @returns {HTMLElement}
   */
  function buildModalItem(item) {
    const card = document.createElement('article');
    card.className = `pjip-item${item.done ? ' pjip-item--done' : ''}`;
    card.dataset.selected = String(item.id) === String(state.selectedItemId) ? 'true' : 'false';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', `Ver detalhes da intimação ${item.id}`);

    const status = resolveItemStatusKey(item);
    const priorityKey = resolveItemPriorityKey(item);
    const priority = document.createElement('div');
    priority.className = `pjip-item-priority pjip-item-priority--${priorityKey}`;
    priority.textContent = priorityKey === 'critical'
      ? 'Crítica'
      : priorityKey === 'high'
        ? 'Alta'
        : priorityKey === 'medium'
          ? 'Média'
          : priorityKey === 'done'
            ? 'Concluída'
            : 'Baixa';

    const process = document.createElement('div');
    process.className = 'pjip-item-process';
    appendTextPair(process, item.processNumber || 'Sem processo', item.sourceLegend || item.kind || 'Origem não informada');

    const intimation = document.createElement('div');
    intimation.className = 'pjip-item-intimation';
    appendTextPair(intimation, String(item.id || '—'), item.kind || 'Intimação');

    const movement = document.createElement('div');
    movement.className = 'pjip-item-movement';
    movement.textContent = item.movement || 'Sem movimentação registrada.';

    const deadline = document.createElement('div');
    const deadlineTone = priorityKey === 'critical'
      ? 'critical'
      : priorityKey === 'high'
        ? 'today'
        : priorityKey === 'medium'
          ? 'soon'
          : '';
    deadline.className = `pjip-item-deadline${deadlineTone ? ` pjip-item-deadline--${deadlineTone}` : ''}`;
    appendTextPair(
      deadline,
      formatDeadlinePill(item.deadline).replace(/^Prazo\s*/, ''),
      priorityKey === 'critical'
        ? 'Vencida'
        : priorityKey === 'high'
          ? 'Hoje'
          : priorityKey === 'medium'
            ? 'Em breve'
            : item.deadline
              ? 'Dentro do prazo'
              : 'Sem prazo'
    );

    const statusNode = document.createElement('div');
    statusNode.className = `pjip-item-status ${resolveItemStatusClass(item)}`.trim();
    statusNode.textContent = resolveItemStatusLabel(item);

    const actions = document.createElement('div');
    actions.className = 'pjip-item-actions';

    const doneButton = document.createElement('button');
    doneButton.type = 'button';
    doneButton.className = 'pjip-item-action';
    doneButton.innerHTML = `<i class="fa-solid ${item.done ? 'fa-rotate-left' : 'fa-check'}" aria-hidden="true"></i>`;
    doneButton.title = item.done ? 'Reabrir intimação' : 'Concluir intimação';
    doneButton.setAttribute('aria-label', doneButton.title);
    doneButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleDone(String(item.id));
      renderModal();
    });

    const openProcessButton = document.createElement('button');
    openProcessButton.type = 'button';
    openProcessButton.className = 'pjip-item-action';
    openProcessButton.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>';
    openProcessButton.title = 'Abrir processo';
    openProcessButton.setAttribute('aria-label', 'Abrir processo');
    openProcessButton.disabled = !getProcessOpenUrl(item);
    openProcessButton.addEventListener('click', (event) => {
      event.stopPropagation();
      openProcess(item);
    });

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'pjip-item-action pjip-item-action--danger';
    removeButton.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';
    removeButton.title = 'Remover intimação';
    removeButton.setAttribute('aria-label', 'Remover intimação');
    removeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!window.confirm('Remover esta intimação do painel local?')) return;
      delete state.store.items[item.id];
      persistStore();
      refreshFrameContext();
      renderModal();
    });

    actions.append(doneButton, openProcessButton, removeButton);
    card.append(priority, process, intimation, movement, deadline, statusNode, actions);
    card.addEventListener('click', () => {
      state.selectedItemId = String(item.id);
      renderModal();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      state.selectedItemId = String(item.id);
      renderModal();
    });
    return card;
  }

  function appendTextPair(container, primary, secondary) {
    const primaryNode = document.createElement('strong');
    primaryNode.textContent = primary;
    const secondaryNode = document.createElement('span');
    secondaryNode.textContent = secondary;
    container.append(primaryNode, secondaryNode);
  }

  function renderDetail(root, item) {
    const detail = root.querySelector('[data-role="detail"]');
    if (!(detail instanceof HTMLElement)) return;
    if (!item) {
      detail.className = 'pjip-detail pjip-detail--empty';
      detail.innerHTML = '<div class="pjip-detail__icon"><i class="fa-solid fa-file-lines" aria-hidden="true"></i></div><p>Selecione uma intimação para ver os detalhes e as ações disponíveis.</p>';
      return;
    }

    detail.className = 'pjip-detail';
    detail.innerHTML = `
      <div class="pjip-detail__head">
        <div><h2 class="pjip-detail__title">Detalhes da intimação</h2><p class="pjip-detail__subtitle">ID ${escapeHtml(String(item.id || '—'))}</p></div>
        <div class="pjip-detail__icon"><i class="fa-solid fa-file-lines" aria-hidden="true"></i></div>
      </div>
      <div class="pjip-detail__fields">
        <div class="pjip-detail__field"><span class="pjip-detail__label">Processo</span><span class="pjip-detail__value pjip-detail__value--strong">${escapeHtml(item.processNumber || 'Sem processo')}</span></div>
        <div class="pjip-detail__field"><span class="pjip-detail__label">Movimentação</span><span class="pjip-detail__value">${escapeHtml(item.movement || 'Sem movimentação registrada.')}</span></div>
        <div class="pjip-detail__field"><span class="pjip-detail__label">Prazo</span><span class="pjip-detail__value pjip-detail__deadline">${escapeHtml(formatDeadlinePill(item.deadline))}</span></div>
        <div class="pjip-detail__field"><span class="pjip-detail__label">Origem</span><span class="pjip-detail__value">${escapeHtml(item.sourceLegend || item.kind || 'Intimação')}</span></div>
      </div>
      <div class="pjip-detail__actions">
        <button type="button" class="pjip-modal-btn pjip-modal-btn--primary" data-role="detail-open"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span>Abrir processo</span></button>
        <button type="button" class="pjip-modal-btn" data-role="detail-toggle"><i class="fa-solid ${item.done ? 'fa-rotate-left' : 'fa-check'}" aria-hidden="true"></i><span>${item.done ? 'Reabrir' : 'Concluir'}</span></button>
      </div>
    `;
    detail.querySelector('[data-role="detail-open"]')?.addEventListener('click', () => openProcess(item));
    detail.querySelector('[data-role="detail-toggle"]')?.addEventListener('click', () => {
      toggleDone(String(item.id));
      renderModal();
    });
  }

  /**
   * Adiciona uma linha com rotulo e valor.
   * @param {HTMLElement} container
   * @param {string} label
   * @param {string} value
   */
  function appendLabeledValue(container, label, value) {
    const line = document.createElement('div');
    line.className = 'pjip-item-line';
    const strong = document.createElement('strong');
    strong.textContent = label;
    const text = document.createElement('span');
    text.textContent = value;
    line.append(strong, text);
    container.appendChild(line);
  }

  /**
   * Cria um selo visual para metadados principais do item.
   * @param {string} text
   * @returns {HTMLElement}
   */
  function buildItemPill(text) {
    const pill = document.createElement('div');
    pill.className = 'pjip-item-pill';
    pill.textContent = text;
    return pill;
  }

  /**
   * Formata o selo de prazo sem exibir horario.
   * @param {string=} deadline
   * @returns {string}
   */
  function formatDeadlinePill(deadline) {
    const value = normalizeSpaces(deadline || '');
    if (!value) return 'Sem prazo';
    const match = value.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    return match ? `Prazo ${match[1]}` : `Prazo ${value}`;
  }

  /**
   * Filtra os itens marcados para exibicao.
   * @returns {any[]}
   */
  function getFilteredItems() {
    const query = normalizeText(state.store.ui.query);
    const items = Object.values(state.store.items).filter((item) => {
      const status = resolveItemStatusKey(item);
      if (state.store.ui.hideDone && item.done && state.store.ui.statusFilter !== 'done') return false;
      if (!matchesStatusFilter(status, state.store.ui.statusFilter, item)) return false;
      if (!query) return true;
      const haystack = normalizeText([item.id, item.processNumber, item.deadline, item.movement, item.sourceLegend].join(' '));
      return haystack.includes(query);
    });

    items.sort((left, right) => {
      const leftTime = parseBrazilianDateTime(left.deadline) || Number.MAX_SAFE_INTEGER;
      const rightTime = parseBrazilianDateTime(right.deadline) || Number.MAX_SAFE_INTEGER;
      if (state.store.ui.sortBy === 'deadline-desc') {
        if (left.done !== right.done) return left.done ? 1 : -1;
        if (leftTime !== rightTime) return rightTime - leftTime;
      } else if (state.store.ui.sortBy === 'updated-desc') {
        const leftUpdated = resolveUpdatedAtTime(left);
        const rightUpdated = resolveUpdatedAtTime(right);
        if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;
      } else if (state.store.ui.sortBy === 'id-asc') {
        return String(left.id).localeCompare(String(right.id), 'pt-BR', { numeric: true });
      } else {
        if (left.done !== right.done) return left.done ? 1 : -1;
        if (leftTime !== rightTime) return leftTime - rightTime;
      }
      return String(left.id).localeCompare(String(right.id), 'pt-BR', { numeric: true });
    });

    return items;
  }

  /**
   * Gera resumo geral para o topo do painel.
   * @returns {{total: number, visible: number, late: number, soon: number, open: number, done: number, today: number, next7: number, noDeadline: number}}
   */
  function buildItemsSummary() {
    const allItems = Object.values(state.store.items);
    let late = 0;
    let soon = 0;
    let open = 0;
    let done = 0;
    let today = 0;
    let next7 = 0;
    let noDeadline = 0;

    for (const item of allItems) {
      const status = resolveItemStatusKey(item);
      if (status === 'done') done += 1;
      else if (status === 'late') late += 1;
      else if (status === 'soon') soon += 1;
      else open += 1;

      const distance = getItemDeadlineDistance(item);
      if (distance === null) noDeadline += 1;
      else if (distance === 0) today += 1;
      else if (distance > 0 && distance <= 7) next7 += 1;
    }

    return {
      total: allItems.length,
      visible: getFilteredItems().length,
      late,
      soon,
      open,
      done,
      today,
      next7,
      noDeadline
    };
  }

  function getItemDeadlineDistance(item) {
    const deadlineDate = extractDeadlineDatesFromText(item?.deadline || '')[0] || null;
    if (!deadlineDate) return null;
    return getLocalDayNumber(deadlineDate) - getLocalDayNumber(new Date());
  }

  /**
   * Conta processos distintos com prazo no dia corrente.
   * A fonte e o indice local de intimações marcadas pelo usuario.
   * @returns {number}
   */
  function getTodayDeadlineProcessCount() {
    const todayYmd = toYmd(new Date());
    const processNumbers = new Set();

    for (const item of Object.values(state.store.items)) {
      if (!item || item.done) continue;
      const hasTodayDeadline = extractDeadlineDatesFromText(item.deadline)
        .some(date => toYmd(date) === todayYmd);
      const processNumber = normalizeSpaces(item.processNumber || '');
      if (hasTodayDeadline && processNumber) processNumbers.add(processNumber);
    }

    return processNumbers.size;
  }

  /**
   * Define se um status pertence ao filtro selecionado.
   * @param {string} status
   * @param {string} filter
   * @param {any} item
   * @returns {boolean}
   */
  function matchesStatusFilter(status, filter, item) {
    if (filter === 'all') return true;
    const dayDistance = getItemDeadlineDistance(item);
    if (filter === 'active') return dayDistance !== null && dayDistance <= 7;
    if (filter === 'today') return dayDistance === 0;
    if (filter === 'next7') return dayDistance !== null && dayDistance > 0 && dayDistance <= 7;
    if (filter === 'missing') return dayDistance === null;
    return status === filter;
  }

  /**
   * Resolve a chave de status usada nos filtros.
   * @param {any} item
   * @returns {'done' | 'late' | 'soon' | 'open'}
   */
  function resolveItemStatusKey(item) {
    if (item.done) return 'done';
    const deadlineDate = extractDeadlineDatesFromText(item.deadline)[0] || null;
    if (deadlineDate) {
      const dayDistance = getLocalDayNumber(deadlineDate) - getLocalDayNumber(new Date());
      if (dayDistance < 0) return 'late';
      if (dayDistance <= 2) return 'soon';
      return 'open';
    }
    const time = parseBrazilianDateTime(item.deadline);
    if (!time) return 'open';
    const now = Date.now();
    if (time < now) return 'late';
    if (time - now <= 2 * 24 * 60 * 60 * 1000) return 'soon';
    return 'open';
  }

  /**
   * Resolve a prioridade visual sem misturar prioridade com o filtro de status.
   * Hoje exige prioridade alta; um prazo já perdido é crítico.
   * @param {any} item
   * @returns {'done' | 'critical' | 'high' | 'medium' | 'low'}
   */
  function resolveItemPriorityKey(item) {
    if (item.done) return 'done';
    const deadlineDate = extractDeadlineDatesFromText(item?.deadline || '')[0] || null;
    const dayDistance = deadlineDate
      ? getLocalDayNumber(deadlineDate) - getLocalDayNumber(new Date())
      : (() => {
          const time = parseBrazilianDateTime(item?.deadline);
          return time ? getLocalDayNumber(new Date(time)) - getLocalDayNumber(new Date()) : null;
        })();
    if (dayDistance === null) return 'low';
    if (dayDistance < 0) return 'critical';
    if (dayDistance === 0) return 'high';
    if (dayDistance <= 2) return 'medium';
    return 'low';
  }

  function getLocalDayNumber(date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / (24 * 60 * 60 * 1000);
  }

  /**
   * Resolve um timestamp comparavel para ordenacao por atualizacao.
   * @param {any} item
   * @returns {number}
   */
  function resolveUpdatedAtTime(item) {
    const value = item.updatedAt || item.observedAt || '';
    return parseBrazilianDateTime(value) || Date.parse(value) || 0;
  }

  /**
   * Descreve a lista visivel conforme o filtro aplicado.
   * @param {number} visible
   * @param {number} total
   * @param {string} statusFilter
   * @returns {string}
   */
  function describeVisibleItems(visible, total, statusFilter) {
    const scope =
      statusFilter === 'late'
        ? 'somente vencidas'
        : statusFilter === 'soon'
          ? 'somente vencendo'
          : statusFilter === 'open'
            ? 'somente abertas'
            : statusFilter === 'done'
              ? 'somente concluídas'
        : statusFilter === 'active'
                ? 'vencidas, hoje e próximos 7 dias'
                : statusFilter === 'today'
                  ? 'somente vencendo hoje'
                  : statusFilter === 'next7'
                    ? 'somente próximos 7 dias'
                    : statusFilter === 'missing'
                      ? 'somente sem prazo'
                : 'todos os status';
    return `${formatCount(visible, 'item exibido', 'itens exibidos')} de ${formatCount(total, 'monitorado', 'monitorados')} • filtro: ${scope}.`;
  }

  /**
   * Formata contagens simples com singular e plural.
   * @param {number} count
   * @param {string} singular
   * @param {string} plural
   * @returns {string}
   */
  function formatCount(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  /**
   * Resolve o rotulo legivel da ordenacao.
   * @param {string} sortBy
   * @returns {string}
   */
  function resolveSortLabel(sortBy) {
    if (sortBy === 'deadline-desc') return 'prazo mais distante';
    if (sortBy === 'updated-desc') return 'atualizadas recentemente';
    if (sortBy === 'id-asc') return 'número da intimação';
    return 'prazo mais próximo';
  }

  /**
   * Resolve classe do status.
   * @param {any} item
   * @returns {string}
   */
  function resolveItemStatusClass(item) {
    const status = resolveItemStatusKey(item);
    if (status === 'done') return 'pjip-item-status--done';
    if (status === 'late') return 'pjip-item-status--late';
    if (status === 'soon') return 'pjip-item-status--soon';
    return '';
  }

  /**
   * Resolve rotulo do status.
   * @param {any} item
   * @returns {string}
   */
  function resolveItemStatusLabel(item) {
    const status = resolveItemStatusKey(item);
    if (status === 'done') return 'Concluída';
    if (status === 'late') return 'Vencida';
    if (status === 'soon') return 'Vencendo';
    return 'Aberta';
  }

  /**
   * Abre o processo pelo controle nativo enquanto a linha estiver presente.
   * Fora da lista, consulta pelo número: URLs de pendência podem conter um ID
   * contextual que o Projudi rejeita posteriormente como "Código inválido".
   * @param {any} item
   */
  function openProcess(item) {
    closeModal();
    const doc = state.frameDoc;
    if (doc && item.id) {
      for (const tableEntry of state.pageContext?.markTables || []) {
        const { table, headerMap, legend } = tableEntry;
        for (const body of Array.from(table.tBodies)) {
          for (const row of Array.from(body.rows)) {
            const rowData = extractRowData(row, headerMap, legend);
            if (!rowData || rowData.id !== item.id) continue;
            const processAction = findNavigationElement(row.children[headerMap.process], SELECTORS.processAction);
            if (processAction && typeof processAction.click === 'function') {
              processAction.click();
              return;
            }
          }
        }
      }
    }

    const processUrl = getProcessOpenUrl(item);
    if (!processUrl) {
      showToast('Não foi possível identificar o número do processo.');
      return;
    }
    navigateFrameTo(processUrl);
  }

  /**
   * Monta a consulta estável de processo usada pelo próprio Projudi.
   * @param {string} processNumber
   * @returns {string}
   */
  function buildProcessLookupUrl(processNumber) {
    const normalized = normalizeSpaces(processNumber || '');
    if (!normalized || normalized.length > 80 || !/\d/.test(normalized)) return '';
    return `BuscaProcesso?PaginaAtual=2&TipoConsultaProcesso=24&ProcessoNumero=${encodeURIComponent(normalized)}`;
  }

  /**
   * Prioriza a busca estável sobre links contextuais preservados em versões antigas.
   * @param {any} item
   * @returns {string}
   */
  function getProcessOpenUrl(item) {
    return buildProcessLookupUrl(String(item?.processNumber || '')) || String(item?.processLink || '');
  }

  /**
   * Navega o iframe principal com seguranca.
   * @param {string} href
   */
  function navigateFrameTo(href) {
    const resolved = resolveAllowedUrl(href, state.frameDoc?.location?.href || window.location.href);
    if (!resolved) return;

    if (state.frame && state.frame.contentWindow) {
      try {
        state.frame.contentWindow.location.href = resolved;
        return;
      } catch (error) {
        logWarn('Falha ao navegar diretamente no iframe. Sera usado src.', error);
      }
      state.frame.setAttribute('src', resolved);
      return;
    }

    window.location.assign(resolved);
  }

  /**
   * Resolve URLs navegaveis e bloqueia esquemas inseguros.
   * @param {string} href
   * @param {string} baseUrl
   * @returns {string}
   */
  function resolveAllowedUrl(href, baseUrl) {
    if (!href) return '';
    try {
      const cleaned = String(href).trim().replace(/^['"]|['"]$/g, '');
      const url = new URL(/^(https?:|\/)/i.test(cleaned) ? cleaned : `/${cleaned}`, baseUrl);
      if (!/^https?:$/i.test(url.protocol)) return '';
      return url.toString();
    } catch (error) {
      logWarn('Nao foi possivel resolver URL segura.', { href, error });
      return '';
    }
  }

  /**
   * Busca um elemento de navegacao dentro de um container.
   * @param {ParentNode | null | undefined} root
   * @param {string} preferredSelector
   * @returns {Element | null}
   */
  function findNavigationElement(root, preferredSelector) {
    if (!root || typeof root.querySelector !== 'function') return null;
    return root.querySelector(preferredSelector) || root.querySelector('a[href], button[onclick], [onclick], [href]');
  }

  /**
   * Extrai URL a partir de href ou onclick.
   * @param {Element | null} element
   * @param {string} baseUrl
   * @returns {string}
   */
  function extractNavigableUrl(element, baseUrl) {
    if (!element) return '';
    const href = element.getAttribute('href');
    const onclick = element.getAttribute('onclick');
    const raw = href ? href.replace(/&amp;/g, '&') : extractHrefFromOnclick(onclick);
    return resolveAllowedUrl(raw, baseUrl);
  }

  /**
   * Extrai href a partir de handlers inline conhecidos.
   * @param {string | null} onclickValue
   * @returns {string}
   */
  function extractHrefFromOnclick(onclickValue) {
    if (!onclickValue) return '';
    const locationMatch = onclickValue.match(/(?:window\.)?location\.href\s*=\s*['"]([^'"]+)['"]/i);
    if (locationMatch) return locationMatch[1].replace(/&amp;/g, '&');
    const genericMatch = onclickValue.match(/['"]([^'"]*(?:Pendencia|BuscaProcesso|DescartarPendenciaProcesso)[^'"]*)['"]/i);
    return genericMatch ? genericMatch[1].replace(/&amp;/g, '&') : '';
  }

  /**
   * Retorna texto de uma celula.
   * @param {Element | undefined} cell
   * @returns {string}
   */
  function getCellText(cell) {
    return normalizeSpaces(cell?.textContent || '');
  }

  /**
   * Localiza a melhor tabela principal.
   * @param {ParentNode} root
   * @returns {HTMLTableElement | null}
   */
  function findBestMainTable(root) {
    const tables = Array.from(root.querySelectorAll(SELECTORS.table));
    let best = null;
    let bestScore = -1;

    for (const candidate of tables) {
      const table = /** @type {HTMLTableElement} */ (candidate);
      const score = scoreMainTable(table, createHeaderMap(table));
      if (score > bestScore) {
        bestScore = score;
        best = table;
      }
    }

    return best;
  }

  /**
   * Gera nome de arquivo com timestamp.
   * @param {string} baseName
   * @param {string} extension
   * @returns {string}
   */
  function buildTimestampedFileName(baseName, extension) {
    const now = new Date();
    const parts = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ];
    const time = [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0')].join('-');
    return `${baseName}_${parts.join('-')}_${time}.${extension}`;
  }

  /**
   * Anexa os hooks globais usados pelo modulo de prazos.
   */
  function attachDeadlineHooks() {
    window.addEventListener(DEADLINE.settingsSyncEvent, () => {
      syncDeadlineState(true);
      if (state.frameDoc) {
        resetDeadlineFilterRows(state.frameDoc);
        processDeadlineRoot(state.frameDoc);
      }
    });

    window.addEventListener('focus', maybeRefreshDeadlinesForClockOrSettings);
    window.addEventListener('pageshow', maybeRefreshDeadlinesForClockOrSettings);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) maybeRefreshDeadlinesForClockOrSettings();
    });
  }

  /**
   * Atualiza prazos quando a data do dia ou configuracoes salvas mudam.
   */
  function maybeRefreshDeadlinesForClockOrSettings() {
    const previous = state.deadlineState;
    const next = buildDeadlineState();
    if (next.todayYmd === previous.todayYmd && next.settingsSnapshot === previous.settingsSnapshot) return;
    state.deadlineState = next;
    state.deadlineCellAnalysisCache = new WeakMap();
    if (state.pageContext) updateTodayDeadlineFabVisibility(state.pageContext);
    else renderTodayDeadlineFab();
    if (!state.frameDoc) return;
    resetDeadlineFilterRows(state.frameDoc);
    processDeadlineRoot(state.frameDoc);
  }

  /**
   * Sincroniza o estado derivado dos prazos.
   * @param {boolean=} force
   */
  function syncDeadlineState(force = false) {
    const next = buildDeadlineState();
    if (!force && next.todayYmd === state.deadlineState.todayYmd && next.settingsSnapshot === state.deadlineState.settingsSnapshot) {
      return;
    }
    state.deadlineState = next;
    state.deadlineCellAnalysisCache = new WeakMap();
  }

  /**
   * Le armazenamento do modulo de prazos.
   * @param {string} key
   * @param {any=} fallback
   * @returns {any}
   */
  function getDeadlineStored(key, fallback = '') {
    try {
      const deadline = state.store?.deadline;
      return deadline && Object.prototype.hasOwnProperty.call(deadline, key) ? deadline[key] : fallback;
    } catch (error) {
      logWarn(`Falha ao ler configuracao de prazo "${key}".`, error);
      return fallback;
    }
  }

  /**
   * Salva armazenamento do modulo de prazos.
   * @param {string} key
   * @param {any} value
   */
  function setDeadlineStored(key, value) {
    try {
      if (!state.store.deadline || typeof state.store.deadline !== 'object') state.store.deadline = Object.create(null);
      state.store.deadline[key] = value;
      persistStore();
    } catch (error) {
      logWarn(`Falha ao salvar configuracao de prazo "${key}".`, error);
    }
  }

  /**
   * Remove uma chave de armazenamento do modulo de prazos.
   * @param {string} key
   */
  function clearDeadlineStored(key) {
    try {
      if (state.store.deadline && typeof state.store.deadline === 'object') delete state.store.deadline[key];
      persistStore();
    } catch (error) {
      logWarn(`Falha ao limpar configuracao de prazo "${key}".`, error);
    }
  }

  function getDeadlineFilterDate() {
    return String(getDeadlineStored(DEADLINE.filterDateKey, '') || '');
  }

  function getDeadlineFilterEnabled() {
    const raw = getDeadlineStored(DEADLINE.filterEnabledKey, false);
    return raw === true || raw === 'true' || raw === 1 || raw === '1';
  }

  function setDeadlineFilterEnabled(enabled) {
    setDeadlineStored(DEADLINE.filterEnabledKey, Boolean(enabled));
  }

  function getDeadlineFilterMode() {
    const mode = String(getDeadlineStored(DEADLINE.filterModeKey, 'exact') || 'exact').toLowerCase();
    if (mode === 'range' || mode === 'missing') return mode;
    return 'exact';
  }

  function setDeadlineFilterMode(mode) {
    setDeadlineStored(DEADLINE.filterModeKey, mode === 'range' || mode === 'missing' ? mode : 'exact');
  }

  function getDeadlineRangeStart() {
    return String(getDeadlineStored(DEADLINE.filterRangeStartKey, '') || '');
  }

  function getDeadlineRangeEnd() {
    return String(getDeadlineStored(DEADLINE.filterRangeEndKey, '') || '');
  }

  /**
   * Monta o estado derivado dos filtros de prazo.
   * @returns {{todayYmd: string, settingsSnapshot: string}}
   */
  function buildDeadlineState() {
    const today = cloneDay(new Date());
    return {
      todayYmd: toYmd(today),
      settingsSnapshot: JSON.stringify({
        filterDate: getDeadlineFilterDate(),
        filterEnabled: getDeadlineFilterEnabled(),
        filterMode: getDeadlineFilterMode(),
        filterRangeStart: getDeadlineRangeStart(),
        filterRangeEnd: getDeadlineRangeEnd()
      })
    };
  }

  /**
   * Processa tabelas de prazo dentro de um documento ou elemento.
   * @param {Document | Element} root
   */
  function processDeadlineRoot(root) {
    getDeadlineTablesFromRoot(root).forEach(processDeadlineTable);
  }

  /**
   * Torna novamente visíveis as linhas ocultadas pelo filtro de prazo.
   * @param {Document | Element} root
   */
  function resetDeadlineFilterRows(root) {
    root.querySelectorAll?.(`tr[${DEADLINE.filterHiddenAttr}="1"]`).forEach(showDeadlineRow);
  }

  /**
   * Processa uma tabela que contenha coluna de prazo.
   * @param {HTMLTableElement} table
   */
  function processDeadlineTable(table) {
    const targetCols = getDeadlineColumnIndexes(table);
    if (!targetCols.size) return;
    const filterSpec = getActiveDeadlineFilterSpec();
    const rows = table.querySelectorAll('tbody tr');

    for (const row of rows) {
      const cells = getDeadlineRowCells(row);

      if (!filterSpec) showDeadlineRow(row);
      else if (rowMatchesDeadlineFilter(row, targetCols, filterSpec)) showDeadlineRow(row);
      else hideDeadlineRow(row);
    }
  }

  /**
   * Calcula os indices de colunas de prazo.
   * @param {HTMLTableElement} table
   * @returns {Set<number>}
   */
  function getDeadlineColumnIndexes(table) {
    const cached = state.deadlineTargetColsCache.get(table);
    if (cached) return cached;

    const rows = table.tHead?.rows?.length
      ? Array.from(table.tHead.rows)
      : Array.from(table.querySelectorAll('tr')).slice(0, 2);
    const headerRow = rows[rows.length - 1];
    const indexes = new Set();
    let index = 0;

    for (const cell of Array.from(headerRow?.children || [])) {
      const span = Number.parseInt(cell.getAttribute('colspan') || '1', 10) || 1;
      const text = normalizeText(cell.textContent || '');
      if (DEADLINE.targetHeaders.some((header) => text.includes(normalizeText(header)))) {
        for (let offset = 0; offset < span; offset += 1) indexes.add(index + offset);
      }
      index += span;
    }

    state.deadlineTargetColsCache.set(table, indexes);
    return indexes;
  }

  /**
   * Retorna todas as tabelas afetadas por uma raiz.
   * @param {Document | Element | Node} root
   * @returns {HTMLTableElement[]}
   */
  function getDeadlineTablesFromRoot(root) {
    if (!root) return [];
    const tables = new Set();
    if (root.nodeName === 'TABLE') tables.add(root);
    if (root.nodeType === 1) {
      const parentTable = typeof root.closest === 'function' ? root.closest('table') : null;
      if (parentTable) tables.add(parentTable);
      root.querySelectorAll?.('table').forEach((table) => tables.add(table));
    } else if (root.nodeType === 9) {
      root.querySelectorAll('table').forEach((table) => tables.add(table));
    }
    return Array.from(tables);
  }

  /**
   * @param {Element} row
   * @returns {HTMLTableCellElement[]}
   */
  function getDeadlineRowCells(row) {
    return Array.from(row.children || []).filter((node) => node.nodeName === 'TD');
  }

  /**
   * @param {HTMLTableCellElement} cell
   * @returns {{text: string, missing: boolean, dates: Date[]}}
   */
  function analyzeDeadlineCell(cell) {
    const text = String(cell?.textContent || '').trim();
    const cached = state.deadlineCellAnalysisCache.get(cell);
    if (cached && cached.text === text) return cached;

    const dates = extractDeadlineDatesFromText(text);
    const analysis = {
      text,
      missing: isMissingDeadlineText(text),
      dates
    };
    state.deadlineCellAnalysisCache.set(cell, analysis);
    return analysis;
  }

  /**
   * @returns {{mode: 'missing'} | {mode: 'range', from: Date, to: Date} | {mode: 'exact', date: Date, ymd: string} | null}
   */
  function getActiveDeadlineFilterSpec() {
    if (!getDeadlineFilterEnabled()) return null;
    const mode = getDeadlineFilterMode();
    if (mode === 'missing') return { mode: 'missing' };
    if (mode === 'range') {
      const start = ymdToDate(getDeadlineRangeStart());
      const end = ymdToDate(getDeadlineRangeEnd());
      if (!start || !end) return null;
      return { mode: 'range', from: start <= end ? start : end, to: start <= end ? end : start };
    }
    const exact = ymdToDate(getDeadlineFilterDate()) || cloneDay(new Date());
    return { mode: 'exact', date: exact, ymd: toYmd(exact) };
  }

  /**
   * @param {Element} row
   * @param {Set<number>} targetCols
   * @param {NonNullable<ReturnType<typeof getActiveDeadlineFilterSpec>>} filterSpec
   */
  function rowMatchesDeadlineFilter(row, targetCols, filterSpec) {
    const cells = getDeadlineRowCells(row);
    for (let col = 0; col < cells.length; col += 1) {
      if (!targetCols.has(col)) continue;
      const analysis = analyzeDeadlineCell(cells[col]);
      if (filterSpec.mode === 'missing') {
        if (analysis.missing) return true;
        continue;
      }
      for (const date of analysis.dates) {
        if (filterSpec.mode === 'exact' && toYmd(date) === filterSpec.ymd) return true;
        if (filterSpec.mode === 'range' && date >= filterSpec.from && date <= filterSpec.to) return true;
      }
    }
    return false;
  }

  function hideDeadlineRow(row) {
    row.style.setProperty('display', 'none', 'important');
    row.setAttribute(DEADLINE.filterHiddenAttr, '1');
  }

  function showDeadlineRow(row) {
    if (!row.hasAttribute(DEADLINE.filterHiddenAttr)) return;
    row.style.removeProperty('display');
    row.removeAttribute(DEADLINE.filterHiddenAttr);
  }

  /**
   * Compatibilidade: atalhos antigos de prazos agora abrem o painel integrado.
   */
  function openDeadlinePanel() {
    openModal();
  }

  /**
   * Aplica uma mudanca de configuracao de prazos ao iframe atual.
   */
  function applyDeadlineSettingsChange() {
    syncDeadlineState(true);
    if (state.frameDoc) {
      resetDeadlineFilterRows(state.frameDoc);
      processDeadlineRoot(state.frameDoc);
    }
    broadcastDeadlineSettingsSync();
  }

  /**
   * Notifica janelas do mesmo host sobre mudancas de prazo.
   */
  function broadcastDeadlineSettingsSync() {
    try {
      window.dispatchEvent(new CustomEvent(DEADLINE.settingsSyncEvent));
      state.frameWin?.dispatchEvent(new CustomEvent(DEADLINE.settingsSyncEvent));
    } catch (_) {}
  }

  /**
   * @returns {string}
   */
  function describeActiveDeadlineFilter() {
    if (!getDeadlineFilterEnabled()) return 'Filtro de data desativado.';
    const mode = getDeadlineFilterMode();
    if (mode === 'missing') return 'Filtro ativo: sem data limite.';
    if (mode === 'range') {
      const start = ymdToDate(getDeadlineRangeStart());
      const end = ymdToDate(getDeadlineRangeEnd());
      if (!start || !end) return 'Filtro por período incompleto.';
      const from = start <= end ? start : end;
      const to = start <= end ? end : start;
      return `Filtro ativo: ${formatDay(from)} até ${formatDay(to)}.`;
    }
    const exact = ymdToDate(getDeadlineFilterDate());
    return exact ? `Filtro ativo: ${formatDay(exact)}.` : 'Filtro por data incompleto.';
  }

  function cloneDay(date) {
    const copy = new Date(date.getTime());
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function ymdToDate(ymd) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function parseDeadlineDateToken(dayValue, monthValue, yearValue) {
    const day = Number(dayValue);
    const month = Number(monthValue);
    let year = Number(yearValue);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    if (String(yearValue).length === 2) year += 2000;
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function extractDeadlineDatesFromText(text) {
    const dates = [];
    const regexp = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})\b/g;
    let match;
    while ((match = regexp.exec(String(text || ''))) !== null) {
      const date = parseDeadlineDateToken(match[1], match[2], match[3]);
      if (date) dates.push(date);
    }
    return dates;
  }

  function isMissingDeadlineText(text) {
    const normalized = String(text || '').trim();
    return normalized === '' || /^[-–—]+$/.test(normalized);
  }

  function toYmd(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function formatDay(date) {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }

  /**
   * Dispara download de blob.
   * @param {Blob} blob
   * @param {string} fileName
   */
  function triggerDownload(blob, fileName) {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(anchor.href);
      anchor.remove();
    }, 800);
  }

  /**
   * Normaliza texto com remoção de acentos e lowercase.
   * @param {string} value
   * @returns {string}
   */
  function normalizeText(value) {
    return normalizeSpaces(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  /**
   * Compacta espacos em branco.
   * @param {string} value
   * @returns {string}
   */
  function normalizeSpaces(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Resolve um target de evento em Element, inclusive quando o browser entrega Text.
   * @param {EventTarget | null} target
   * @returns {Element | null}
   */
  function resolveEventElement(target) {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (target instanceof Node && target.parentElement) return target.parentElement;
    return null;
  }

  /**
   * Faz escape CSV.
   * @param {string} value
   * @returns {string}
   */
  function escapeCsv(value) {
    let normalized = String(value || '').replace(/\r?\n|\r/g, ' ').trim();
    if (/[;"\n]/.test(normalized)) normalized = `"${normalized.replace(/"/g, '""')}"`;
    return normalized;
  }

  /**
   * Formata o rotulo de ultimo backup.
   * @param {string} isoDate
   * @returns {string}
   */
  function formatLastBackupLabel(isoDate) {
    if (!isoDate) return 'Último backup: ainda não enviado.';
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return 'Último backup: ainda não enviado.';
    return `Último backup: ${date.toLocaleString('pt-BR')}.`;
  }

  /**
   * Faz parse de data/hora no formato brasileiro.
   * @param {string} value
   * @returns {number}
   */
  function parseBrazilianDateTime(value) {
    const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) return 0;
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = match;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ).getTime();
  }

  /**
   * Formata a data observada/atualizada para exibicao amigavel.
   * @param {string} value
   * @returns {string}
   */
  function formatObservedAt(value) {
    if (!value) return '—';
    const brazilianTime = parseBrazilianDateTime(value);
    if (brazilianTime) return new Date(brazilianTime).toLocaleString('pt-BR');
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('pt-BR');
  }

  /**
   * Atualiza o valor de um input.
   * @param {Element | null} element
   * @param {string} value
   */
  function setInputValue(element, value) {
    if (element instanceof HTMLInputElement) element.value = value;
  }

  /**
   * Atualiza o estado checked de um input.
   * @param {Element | null} element
   * @param {boolean} value
   */
  function setChecked(element, value) {
    if (element instanceof HTMLInputElement) element.checked = value;
  }

  /**
   * Atualiza o valor de um select.
   * @param {Element | null} element
   * @param {string} value
   */
  function setSelectValue(element, value) {
    if (element instanceof HTMLSelectElement) element.value = value;
  }

  /**
   * Atualiza texto de um no.
   * @param {Element | null} element
   * @param {string} value
   */
  function setNodeText(element, value) {
    if (element) element.textContent = value;
  }

  /**
   * Escapa texto observado antes de inseri-lo no painel de detalhes.
   * @param {unknown} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  /**
   * Atualiza conteudo de botao com icone FontAwesome.
   * @param {Element | null} element
   * @param {string} iconClass
   * @param {string} label
   */
  function setIconButton(element, iconClass, label) {
    if (!(element instanceof HTMLElement)) return;
    const icon = document.createElement('i');
    icon.className = `fa-solid ${iconClass}`;
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = label;
    element.replaceChildren(icon, text);
  }

  /**
   * Extrai ultimo numero de uma string.
   * @param {string | null} value
   * @returns {number | null}
   */
  function extractLastNumber(value) {
    if (!value) return null;
    const match = value.match(/(\d+)\D*\)?\s*$/);
    return match ? Number.parseInt(match[1], 10) : null;
  }

  /**
   * Extrai pageSize do href do paginador.
   * @param {Element} pagerElement
   * @returns {number | null}
   */
  function extractSecondNumberFromPager(pagerElement) {
    const link = pagerElement.querySelector('a[href^="javascript:buscaDados("]');
    if (!link) return null;
    const match = link.getAttribute('href')?.match(/buscaDados\(\s*\d+\s*,\s*(\d+)\s*\)/i);
    return match ? Number.parseInt(match[1], 10) : null;
  }

  /**
   * Cria seletor CSS relativamente estavel.
   * @param {Element} element
   * @returns {string}
   */
  function buildCssPath(element) {
    const segments = [];
    for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
      let segment = current.nodeName.toLowerCase();
      if (current.id) {
        segment += `#${CSS.escape(current.id)}`;
        segments.unshift(segment);
        break;
      }
      let index = 1;
      let sibling = current;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.nodeName === current.nodeName) index += 1;
      }
      segment += `:nth-of-type(${index})`;
      segments.unshift(segment);
    }
    return segments.join(' > ');
  }
})();
