// ==UserScript==
// @name         Customizações
// @namespace    projudi-customizacoes.user.js
// @version      2026.07.24-0018
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Centraliza customizações visuais, navegação, scrollbar e destaques de movimentações do Projudi.
// @author       lourencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/customizacoes/projudi-customizacoes.user.js
// @downloadURL  https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/customizacoes/projudi-customizacoes.user.js
// @match        *://projudi.tjgo.jus.br/*
// @run-at       document-end
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// @connect      cdn.jsdelivr.net
// ==/UserScript==

(function () {
    "use strict";

    // Compatibilidade local com gestores de userscript, sem publicar APIs no window do Projudi.
    const gmRegisterMenuCommand = typeof GM_registerMenuCommand === "function" ? GM_registerMenuCommand : () => null;
    const gmXmlHttpRequest = typeof GM_xmlhttpRequest === "function"
        ? GM_xmlhttpRequest
        : (typeof GM !== "undefined" && GM && typeof GM.xmlHttpRequest === "function"
            ? opts => GM.xmlHttpRequest(opts)
            : opts => {
                try {
                    fetch(opts.url, { method: opts.method || "GET", headers: opts.headers || {} })
                        .then(response => response.text().then(responseText => ({ status: response.status, responseText, finalUrl: response.url })))
                        .then(result => { if (typeof opts.onload === "function") opts.onload(result); })
                        .catch(error => { if (typeof opts.onerror === "function") opts.onerror(error); });
                } catch (error) {
                    if (typeof opts.onerror === "function") opts.onerror(error);
                }
                return null;
            });
    (function pjShortcut() {
        // Leader: Ctrl+; libera 1500ms para pressionar C (Customizacoes).
        var ID = "customizacoes";
        var CODE = "KeyC";
        var isTop = window.top === window.self;
        var leaderUntil = 0;
        function inField(e) {
            var t = e && e.target;
            var tag = (t && t.tagName) || "";
            return /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (t && t.isContentEditable);
        }
        function openHere() {
            if (isTop) { try { openSettingsPanel(); } catch (_) {} }
            else { try { window.top.postMessage({ type: "pj-open-panel", script: ID }, window.location.origin); } catch (_) {} }
        }
        window.addEventListener("keydown", function (e) {
            if (!e || e.repeat) return;
            if (inField(e)) return;
            var isLeader = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.code === "Semicolon";
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
            window.addEventListener("message", function (ev) {
                if (ev.origin !== window.location.origin) return;
                if (!ev || !ev.data || ev.data.type !== "pj-open-panel" || ev.data.script !== ID) return;
                try { openSettingsPanel(); } catch (_) {}
            });
        }
    })();

    const STORAGE_KEY = "projudi-suite::customizacoes::data";
    const BASE_CONTENT_FONT_PX = 12;
    const SCRIPT_META = (() => {
        const fallbackName = "Customizacoes";
        const fallbackId = "projudi-customizacoes";
        try {
            const script = GM_info && GM_info.script ? GM_info.script : {};
            const name = String(script.name || fallbackName).trim() || fallbackName;
            const namespace = String(script.namespace || "").trim();
            const version = String(script.version || "unknown").trim() || "unknown";
            const base = (namespace || name || fallbackId)
                .replace(/\.user\.js$/i, "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-zA-Z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .toLowerCase();
            const id = base || fallbackId;
            return { name, version, id, fileName: `${id}.json` };
        } catch (_) {
            return { name: fallbackName, version: "unknown", id: fallbackId, fileName: `${fallbackId}.json` };
        }
    })();
    const BACKUP_STORAGE_KEY = "projudi-suite::customizacoes::gist";
    const BACKUP_SCHEMA = "projudi-customizacoes-backup-v1";
    const LOG_PREFIX = "[Customizações]";
    const FA_SPRITE_URL = "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@7.3.1/sprites/solid.svg";
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
    const DEFAULT_SETTINGS = {
        enabled: true,
        autoHideHeader: false,
        enableIframeAutoHeight: false,
        openProcessFilesInPopup: false,
        popupSizePercent: 98,
        enableWidthAdjustments: false,
        contentWidthPercent: 100,
        centerContent: true,
        compactMode: false,
        fontScaleEnabled: false,
        fontScalePercent: 100,
        googleFontEnabled: false,
        googleFontFamily: "",
        sideBackgroundEnabled: false,
        sideBackground: "original",
        customHeaderEnabled: false,
        modernVisualEnabled: false,
        modernTablesEnabled: false,
        modernFormsEnabled: false,
        stickyActionsEnabled: false,
        stickyTableHeadersEnabled: false,
        highlightHoveredRowEnabled: false,
        hideClock: false,
        hideHeaderIcons: false,
        applyToStandalonePages: false,
        enableProcessMirrorPdf: true,
        enableRemoveScrollbar: false,
        enableMovimentacoes: false,
        movimentacoesConfig: null
    };
    const DEFAULT_BACKUP_SETTINGS = {
        enabled: false,
        gistId: "",
        token: "",
        fileName: SCRIPT_META.fileName,
        autoBackupOnSave: false,
        lastBackupAt: ""
    };

    const OPTOUT_ATTR = "data-projudi-wide-optout";
    let settings = loadSettings();
    let isInitialized = false;
    let headerRevealZone = null;
    let boundIframeEl = null;
    let boundAutoHideIframeEl = null;
    let iframeAvailabilityObserver = null;
    let standaloneDomObserver = null;
    let pendingIframeRetryTimers = [];
    let iframeRetryRunId = 0;
    let topDomWorkScheduled = false;
    let standaloneDomWorkScheduled = false;
    let mouseMoveListenerBound = false;
    let menuRegistered = false;
    let popupHookedDoc = null;
    let popupHookCleanup = null;
    let popupOwnerDoc = null;
    let popupDock = null;
    let popupDockToggle = null;
    let popupDockMenu = null;
    let popupWindowCounter = 0;
    const popupWindows = new Map();
    let popupBackdrop = null;
    let popupUnlockBodyScroll = null;
    let popupActiveId = null;
    let popupPrintCleanup = null;
    let popupContextObserver = null;
    let popupContextObservedDoc = null;
    let popupContextSyncScheduled = false;
    let mirrorPdfObserver = null;
    let mirrorPdfObservedDoc = null;
    let mirrorPdfWorkFrame = 0;
    const mirrorPdfDepsPromises = new WeakMap();
    let movimentacoesModule = null;
    let customHeaderMount = null;
    const NO_SCROLLBAR_STYLE_ID = "tm-no-scrollbar-style";
    const NO_SCROLLBAR_CSS = "html,body{-ms-overflow-style:none!important;scrollbar-width:none!important;}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;background:transparent!important;}";

    function logInfo(message, meta) {
        if (typeof console === "undefined" || typeof console.info !== "function") return;
        if (meta === undefined) {
            console.info(`${LOG_PREFIX} ${message}`);
            return;
        }
        console.info(`${LOG_PREFIX} ${message}`, meta);
    }

    function logWarn(message, meta) {
        if (typeof console === "undefined" || typeof console.warn !== "function") return;
        if (meta === undefined) {
            console.warn(`${LOG_PREFIX} ${message}`);
            return;
        }
        console.warn(`${LOG_PREFIX} ${message}`, meta);
    }

    function logError(message, error) {
        if (typeof console === "undefined" || typeof console.error !== "function") return;
        console.error(`${LOG_PREFIX} ${message}`, error);
    }

    function safeRun(label, task, fallbackValue) {
        try {
            return task();
        } catch (error) {
            logError(label, error);
            return fallbackValue;
        }
    }

    function onIframeLoad() {
        retryInjectInIframe(14, 220);
        syncPopupModeFromIframeContext();
    }

    function onIframeMouseEnter() {
        if (!settings.enabled || !settings.autoHideHeader) return;
        setHeaderHidden(true);
    }

    function onDocumentMouseMove(e) {
        if (!settings.enabled || !settings.autoHideHeader) return;
        if (e.clientY < 80) setHeaderHidden(false);
    }

    function rememberTimeout(id) {
        pendingIframeRetryTimers.push(id);
        return id;
    }

    function clearPendingIframeRetryTimers() {
        if (!pendingIframeRetryTimers.length) return;
        pendingIframeRetryTimers.forEach(id => clearTimeout(id));
        pendingIframeRetryTimers = [];
    }

    function cancelIframeInjectionRetries() {
        clearPendingIframeRetryTimers();
        iframeRetryRunId += 1;
    }

    function formatLastBackupLabel(value) {
        if (!value) return "Último backup: ainda não enviado.";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Último backup: ainda não enviado.";
        return `Último backup: ${date.toLocaleString("pt-BR")}.`;
    }

    const fontAwesomeRoots = new WeakMap();
    const fontAwesomeSprites = new WeakMap();

    function ensureFontAwesome(doc = document) {
        if (!doc || !doc.head) return Promise.resolve(null);
        if (!doc.getElementById("pj-suite-core-style")) {
            const coreStyle = doc.createElement("style");
            coreStyle.id = "pj-suite-core-style";
            coreStyle.textContent = SUITE_UI_CSS;
            doc.head.appendChild(coreStyle);
        }
        const mounted = doc.getElementById("pj-suite-fa-sprite");
        if (mounted) return Promise.resolve(mounted);
        if (fontAwesomeSprites.has(doc)) return fontAwesomeSprites.get(doc);
        const promise = new Promise((resolve, reject) => {
            gmXmlHttpRequest({
                method: "GET",
                url: FA_SPRITE_URL,
                onload: response => {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(`Font Awesome respondeu com status ${response.status}.`));
                        return;
                    }
                    const Parser = doc.defaultView?.DOMParser || DOMParser;
                    const source = new Parser().parseFromString(response.responseText || "", "image/svg+xml");
                    if (source.querySelector("parsererror")) {
                        reject(new Error("Sprite SVG do Font Awesome inválido."));
                        return;
                    }
                    const existingSprite = doc.getElementById("pj-suite-fa-sprite");
                    if (existingSprite) {
                        resolve(existingSprite);
                        return;
                    }
                    const sprite = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
                    sprite.id = "pj-suite-fa-sprite";
                    sprite.setAttribute("aria-hidden", "true");
                    sprite.style.display = "none";
                    source.querySelectorAll("symbol[id]").forEach(symbol => {
                        const clone = doc.importNode(symbol, true);
                        clone.id = `pj-suite-fa-${symbol.id}`;
                        sprite.appendChild(clone);
                    });
                    (doc.body || doc.documentElement).prepend(sprite);
                    resolve(sprite);
                },
                onerror: () => reject(new Error("Falha ao carregar o sprite SVG do Font Awesome.")),
                ontimeout: () => reject(new Error("Tempo esgotado ao carregar o sprite SVG do Font Awesome."))
            });
        }).catch(error => {
            fontAwesomeSprites.delete(doc);
            logWarn("Falha ao preparar ícones SVG.", error);
            return null;
        });
        fontAwesomeSprites.set(doc, promise);
        return promise;
    }

    function convertFontAwesomeIcons(root) {
        const doc = root.ownerDocument || document;
        const icons = root.matches?.("i.fa-solid") ? [root] : [];
        icons.push(...root.querySelectorAll("i.fa-solid"));
        icons.forEach(icon => {
            const nameClass = [...icon.classList].find(name => /^fa-[a-z0-9-]+$/i.test(name) && name !== "fa-solid" && !/^fa-\d+x$/i.test(name));
            if (!nameClass) return;
            const symbolId = `pj-suite-fa-${nameClass.slice(3)}`;
            if (!doc.getElementById(symbolId)) return;
            const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("class", [...new Set([...icon.classList, "pj-suite-fa"])].join(" "));
            [...icon.attributes].forEach(attribute => {
                if (attribute.name === "class") return;
                svg.setAttribute(attribute.name, attribute.value);
            });
            if (!svg.hasAttribute("aria-hidden")) svg.setAttribute("aria-hidden", "true");
            svg.setAttribute("focusable", "false");
            const use = doc.createElementNS("http://www.w3.org/2000/svg", "use");
            use.setAttribute("href", `#${symbolId}`);
            svg.appendChild(use);
            icon.replaceWith(svg);
        });
    }

    function renderFontAwesome(root) {
        if (!root || root.nodeType !== 1) return;
        const doc = root.ownerDocument || document;
        root.setAttribute("data-pj-suite-ui", "customizacoes");
        ensureFontAwesome(doc).then(sprite => {
            if (!sprite || !root.isConnected) return;
            convertFontAwesomeIcons(root);
            if (fontAwesomeRoots.has(root)) return;
            const observer = new MutationObserver(() => convertFontAwesomeIcons(root));
            observer.observe(root, { childList: true, subtree: true });
            fontAwesomeRoots.set(root, observer);
        });
    }

    function shouldManageIframeFeatures() {
        return !!(
            settings.enableIframeAutoHeight ||
            settings.autoHideHeader ||
            settings.customHeaderEnabled ||
            settings.enableWidthAdjustments ||
            settings.compactMode ||
            settings.fontScaleEnabled ||
            settings.googleFontEnabled ||
            settings.modernVisualEnabled ||
            settings.modernTablesEnabled ||
            settings.modernFormsEnabled ||
            settings.stickyActionsEnabled ||
            settings.stickyTableHeadersEnabled ||
            settings.highlightHoveredRowEnabled ||
            settings.openProcessFilesInPopup ||
            settings.enableProcessMirrorPdf ||
            settings.enableRemoveScrollbar
        );
    }

    function isTopWindow() {
        return window.top === window.self;
    }

    function lockBodyScroll(doc = document) {
        const body = doc && doc.body;
        const html = doc && doc.documentElement;
        if (!body || !html) return () => {};
        const win = (doc && doc.defaultView) || window;
        const KEY = "__pjBodyScrollLock__";
        const state = win[KEY] || (win[KEY] = {
            count: 0,
            prevBodyOverflow: "",
            prevHtmlOverflow: "",
            prevBodyOverscroll: "",
            prevHtmlOverscroll: ""
        });
        if (state.count === 0) {
            state.prevBodyOverflow = body.style.overflow;
            state.prevHtmlOverflow = html.style.overflow;
            state.prevBodyOverscroll = body.style.overscrollBehavior;
            state.prevHtmlOverscroll = html.style.overscrollBehavior;
            body.style.overflow = "hidden";
            html.style.overflow = "hidden";
            body.style.overscrollBehavior = "none";
            html.style.overscrollBehavior = "none";
        }
        state.count += 1;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            state.count = Math.max(0, state.count - 1);
            if (state.count === 0) {
                body.style.overflow = state.prevBodyOverflow;
                html.style.overflow = state.prevHtmlOverflow;
                body.style.overscrollBehavior = state.prevBodyOverscroll;
                html.style.overscrollBehavior = state.prevHtmlOverscroll;
            }
        };
    }

    function loadSettings() {
        try {
            if (typeof GM_getValue === "function") {
                const raw = GM_getValue(STORAGE_KEY, "");
                if (raw) {
                    localStorage.setItem(STORAGE_KEY, raw);
                    return normalizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
                }
            }
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                return normalizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
            }
        } catch (error) {
            logWarn("Falha ao carregar configurações; usando padrão.", error);
        }
        return normalizeSettings(DEFAULT_SETTINGS);
    }

    function saveSettings(next) {
        settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...next });
        if (typeof GM_setValue === "function") {
            try {
                GM_setValue(STORAGE_KEY, JSON.stringify(settings));
            } catch (error) {
                logError("Falha ao salvar configurações.", error);
            }
        }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) {}
    }

    function normalizeBackupSettings(value) {
        const next = { ...DEFAULT_BACKUP_SETTINGS, ...(value || {}) };
        next.enabled = !!next.enabled;
        next.gistId = String(next.gistId || "").trim();
        next.token = String(next.token || "").trim();
        next.fileName = String(next.fileName || SCRIPT_META.fileName).trim() || SCRIPT_META.fileName;
        next.autoBackupOnSave = !!next.autoBackupOnSave;
        next.lastBackupAt = String(next.lastBackupAt || "").trim();
        return next;
    }

    function loadBackupSettings() {
        try {
            if (typeof GM_getValue === "function") {
                const raw = GM_getValue(BACKUP_STORAGE_KEY, "");
                if (raw) {
                    localStorage.setItem(BACKUP_STORAGE_KEY, raw);
                    return normalizeBackupSettings(JSON.parse(raw));
                }
            }
            const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
            if (raw) {
                return normalizeBackupSettings(JSON.parse(raw));
            }
        } catch (error) {
            logWarn("Falha ao carregar configuração de backup; usando padrão.", error);
        }
        return normalizeBackupSettings(DEFAULT_BACKUP_SETTINGS);
    }

    function saveBackupSettings(next) {
        const normalized = normalizeBackupSettings(next);
        if (typeof GM_setValue === "function") {
            try {
                GM_setValue(BACKUP_STORAGE_KEY, JSON.stringify(normalized));
            } catch (error) {
                logError("Falha ao salvar configuração de backup.", error);
            }
        }
        try { localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(normalized)); } catch (_) {}
        return normalized;
    }

    function buildBackupPayload(nextSettings = settings) {
        return {
            schema: BACKUP_SCHEMA,
            scriptId: SCRIPT_META.id,
            scriptName: SCRIPT_META.name,
            version: SCRIPT_META.version,
            exportedAt: new Date().toISOString(),
            host: location.host,
            settings: normalizeSettings(nextSettings)
        };
    }

    function applyBackupPayload(payload) {
        if (!payload || typeof payload !== "object" || payload.schema !== BACKUP_SCHEMA || payload.scriptId !== SCRIPT_META.id || !payload.settings || typeof payload.settings !== "object") {
            throw new Error("Backup incompatível com Customizações.");
        }
        saveSettings(payload.settings);
        settings = loadSettings();
        applySettingsNow();
        return settings;
    }

    function githubRequest(options) {
        return new Promise((resolve, reject) => {
            if (typeof gmXmlHttpRequest !== "function") {
                reject(new Error("GM_xmlhttpRequest indisponível."));
                return;
            }
            gmXmlHttpRequest({
                method: options.method || "GET",
                url: options.url,
                headers: options.headers || {},
                data: options.data,
                onload: (response) => resolve(response),
                onerror: () => reject(new Error("Falha de rede ao acessar o GitHub.")),
                ontimeout: () => reject(new Error("Tempo esgotado ao acessar o GitHub."))
            });
        });
    }

    function parseGithubError(response) {
        try {
            const parsed = JSON.parse(response.responseText || "{}");
            if (parsed && parsed.message) return parsed.message;
        } catch (_) {}
        return `GitHub respondeu com status ${response.status}.`;
    }

    async function pushBackupToGist(backupSettings, payload) {
        if (!backupSettings.gistId) throw new Error("Informe o Gist ID.");
        if (!backupSettings.token) throw new Error("Informe o token do GitHub.");
        const response = await githubRequest({
            method: "PATCH",
            url: `https://api.github.com/gists/${encodeURIComponent(backupSettings.gistId)}`,
            headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${backupSettings.token}`,
                "Content-Type": "application/json"
            },
            data: JSON.stringify({
                files: {
                    [backupSettings.fileName]: {
                        content: JSON.stringify(payload, null, 2)
                    }
                }
            })
        });
        if (response.status < 200 || response.status >= 300) {
            throw new Error(parseGithubError(response));
        }
        return JSON.parse(response.responseText || "{}");
    }

    async function readBackupFromGist(backupSettings, options = {}) {
        if (!backupSettings.gistId) throw new Error("Informe o Gist ID.");
        if (!backupSettings.token) throw new Error("Informe o token do GitHub.");
        const response = await githubRequest({
            method: "GET",
            url: `https://api.github.com/gists/${encodeURIComponent(backupSettings.gistId)}`,
            headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${backupSettings.token}`
            }
        });
        if (response.status < 200 || response.status >= 300) {
            throw new Error(parseGithubError(response));
        }
        const gist = JSON.parse(response.responseText || "{}");
        const file = gist && gist.files ? gist.files[backupSettings.fileName] : null;
        if (!file) {
            if (options.missingOk) return null;
            throw new Error("Arquivo de backup não encontrado no Gist.");
        }
        let content = typeof file.content === "string" ? file.content : "";
        if ((file.truncated || !content) && file.raw_url) {
            const rawResponse = await githubRequest({
                method: "GET",
                url: file.raw_url,
                headers: {
                    "Accept": "application/json",
                    "Authorization": `Bearer ${backupSettings.token}`
                }
            });
            if (rawResponse.status < 200 || rawResponse.status >= 300) {
                throw new Error(`Não foi possível baixar o conteúdo completo do backup: ${parseGithubError(rawResponse)}`);
            }
            content = rawResponse.responseText || "";
        }
        if (!content) {
            if (options.invalidOk) return null;
            throw new Error("O arquivo de backup no Gist está vazio. Envie um novo backup para substituí-lo.");
        }
        try {
            return JSON.parse(content);
        } catch (_) {
            if (options.invalidOk) return null;
            throw new Error("O arquivo de backup no Gist está incompleto ou contém JSON inválido. Envie um novo backup para substituí-lo.");
        }
    }

    function normalizeSettings(value) {
        const next = { ...DEFAULT_SETTINGS, ...(value || {}) };
        next.enabled = next.enabled !== false;
        next.autoHideHeader = !!next.autoHideHeader;
        next.enableIframeAutoHeight = !!next.enableIframeAutoHeight;
        next.openProcessFilesInPopup = !!next.openProcessFilesInPopup;
        next.popupSizePercent = sanitizePopupSize(next.popupSizePercent);
        next.enableWidthAdjustments = !!next.enableWidthAdjustments;
        next.contentWidthPercent = sanitizeWidthPercent(next.contentWidthPercent);
        next.centerContent = next.centerContent !== false;
        next.compactMode = !!next.compactMode;
        next.fontScaleEnabled = !!next.fontScaleEnabled;
        next.fontScalePercent = sanitizeFontScale(next.fontScalePercent);
        next.googleFontEnabled = !!next.googleFontEnabled;
        next.googleFontFamily = sanitizeGoogleFontFamily(next.googleFontFamily);
        next.sideBackgroundEnabled = !!next.sideBackgroundEnabled;
        next.sideBackground = sanitizeSideBackground(next.sideBackground);
        next.customHeaderEnabled = !!next.customHeaderEnabled;
        next.modernVisualEnabled = !!next.modernVisualEnabled;
        next.modernTablesEnabled = !!next.modernTablesEnabled;
        next.modernFormsEnabled = !!next.modernFormsEnabled;
        next.stickyActionsEnabled = !!next.stickyActionsEnabled;
        next.stickyTableHeadersEnabled = !!next.stickyTableHeadersEnabled;
        next.highlightHoveredRowEnabled = !!next.highlightHoveredRowEnabled;
        next.hideClock = !!next.hideClock;
        next.hideHeaderIcons = !!next.hideHeaderIcons;
        next.applyToStandalonePages = !!next.applyToStandalonePages;
        next.enableProcessMirrorPdf = next.enableProcessMirrorPdf !== false;
        next.enableRemoveScrollbar = !!next.enableRemoveScrollbar;
        next.enableMovimentacoes = !!next.enableMovimentacoes;
        return next;
    }

    function sanitizeWidthPercent(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return DEFAULT_SETTINGS.contentWidthPercent;
        return Math.max(60, Math.min(100, Math.round(n)));
    }

    function sanitizePopupSize(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return DEFAULT_SETTINGS.popupSizePercent;
        return Math.max(60, Math.min(100, Math.round(n)));
    }

    function sanitizeFontScale(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return DEFAULT_SETTINGS.fontScalePercent;
        return Math.max(80, Math.min(130, Math.round(n / 5) * 5));
    }

    function sanitizeGoogleFontFamily(value) {
        return String(value || "").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 80);
    }

    function sanitizeSideBackground(value) {
        return ["original", "white", "light"].includes(value)
            ? value
            : DEFAULT_SETTINGS.sideBackground;
    }

    function registerMenu() {
        if (menuRegistered) return;
        if (typeof gmRegisterMenuCommand !== "function") return;
        // Projudi serve o iframe interno na mesma origem do top, fazendo o
        // userscript rodar duas vezes. Registramos o menu apenas no top para
        // evitar duplicacao (alguns gestores mostram um item por frame).
        if (!isTopWindow()) return;
        try {
            gmRegisterMenuCommand("Gerenciar Customizações", () => {
                openSettingsPanel();
            });
            menuRegistered = true;
        } catch (_) {}
    }

    function openSettingsPanel() {
        if (!isTopWindow()) return;
        if (document.getElementById("projudi-wide-panel-overlay")) return;

        ensureFontAwesome(document);
        let backupSettings = loadBackupSettings();
        const unlockBodyScroll = lockBodyScroll(document);
        const overlay = document.createElement("div");
        overlay.id = "projudi-wide-panel-overlay";
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(11, 18, 32, .50); z-index: 2147483647;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            padding: 18px;
        `;

        const panel = document.createElement("div");
        panel.className = "pjc-panel";
        panel.style.cssText = `
            width: min(1180px, calc(100vw - 28px)); height: min(88vh, 900px); background: #ffffff; color: #0f172a;
            border-radius: 18px; box-shadow: 0 24px 70px rgba(2, 6, 23, .30);
            border: 1px solid #dbe3ef;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 14px;
            line-height: 1.35;
            overflow: hidden;
            max-height: min(88vh, 900px);
            display: flex;
            flex-direction: column;
            transform: translateY(6px) scale(.985);
            opacity: .96;
            transition: transform .16s ease, opacity .16s ease;
        `;

        const scopedStyle = document.createElement("style");
        scopedStyle.textContent = `
            #projudi-wide-panel-overlay .pjc-panel *,
            #projudi-wide-panel-overlay .pjc-panel *::before,
            #projudi-wide-panel-overlay .pjc-panel *::after {
                box-sizing: border-box;
            }

            #projudi-wide-panel-overlay .pjc-panel,
            #projudi-wide-panel-overlay .pjc-panel *:not(i):not([class^="fa"]):not([class*=" fa-"]) {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
            }

            #projudi-wide-panel-overlay .pj-suite-fa { width: 1em; height: 1em; }

            #projudi-wide-panel-overlay #pj-reset,
            #projudi-wide-panel-overlay #pj-cancel,
            #projudi-wide-panel-overlay #pj-save,
            #projudi-wide-panel-overlay #pj-close {
                text-indent: 0 !important;
                letter-spacing: normal !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                text-transform: none !important;
                line-height: 1.2 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
                white-space: nowrap !important;
            }

            #projudi-wide-panel-overlay #pj-reset,
            #projudi-wide-panel-overlay #pj-cancel {
                color: #1e293b !important;
                background: #ffffff !important;
                border: 1px solid #cbd5e1 !important;
            }

            #projudi-wide-panel-overlay #pj-save {
                color: #ffffff !important;
                background: #0f3e75 !important;
                border: 1px solid #0f3e75 !important;
            }

            #projudi-wide-panel-overlay #pj-close {
                color: #ffffff !important;
            }

            #projudi-wide-panel-overlay #pj-reset,
            #projudi-wide-panel-overlay #pj-cancel,
            #projudi-wide-panel-overlay #pj-save {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 7px !important;
            }

            #projudi-wide-panel-overlay input[type="number"] {
                color: #0f172a !important;
                background: #ffffff !important;
                border: 1px solid #cbd5e1 !important;
                font: inherit !important;
            }

            #projudi-wide-panel-overlay #pj-panel-body {
                overflow: auto !important;
                max-height: calc(min(90vh, 900px) - 86px - 64px) !important;
                padding: 16px !important;
                background: linear-gradient(180deg, #f8fbff 0%, #f2f6fc 100%) !important;
            }

            #projudi-wide-panel-overlay #pj-panel-header {
                flex: 0 0 auto !important;
            }

            #projudi-wide-panel-overlay .pjc-panel-brand {
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 0;
            }

            #projudi-wide-panel-overlay .pjc-panel-brand-icon {
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

            #projudi-wide-panel-overlay #pj-panel-footer {
                flex: 0 0 auto !important;
                position: sticky !important;
                bottom: 0 !important;
                z-index: 2 !important;
                background: #f8fafc !important;
            }

            #projudi-wide-panel-overlay select {
                color: #0f172a !important;
                background: #ffffff !important;
                border: 1px solid #cbd5e1 !important;
                font: inherit !important;
            }

            #projudi-wide-panel-overlay label,
            #projudi-wide-panel-overlay input,
            #projudi-wide-panel-overlay select,
            #projudi-wide-panel-overlay button {
                font-family: inherit !important;
            }

            #projudi-wide-panel-overlay .pjc-body {
                display: grid;
                grid-template-columns: 230px minmax(0, 1fr);
                grid-template-areas: "summary content";
                gap: 18px;
                align-items: start;
            }

            #projudi-wide-panel-overlay .pjc-section--summary {
                grid-area: summary;
                position: sticky;
                top: 0;
            }

            #projudi-wide-panel-overlay .pjc-section--nav,
            #projudi-wide-panel-overlay .pjc-section--layout,
            #projudi-wide-panel-overlay .pjc-section--reading {
                grid-area: content;
            }

            #projudi-wide-panel-overlay .pjc-section--process,
            #projudi-wide-panel-overlay .pjc-section--backup {
                grid-area: content;
            }

            #projudi-wide-panel-overlay [data-pjc-pane] {
                display: none !important;
            }

            #projudi-wide-panel-overlay [data-pjc-pane][data-active="true"] {
                display: flex !important;
            }

            #projudi-wide-panel-overlay .pjc-section {
                display: flex;
                flex-direction: column;
                gap: 10px;
                min-width: 0;
            }

            #projudi-wide-panel-overlay .pjc-section-title {
                margin: 0 0 0 2px;
                color: #334155;
                font-size: 12px;
                font-weight: 700;
                letter-spacing: .03em;
                text-transform: uppercase;
            }

            #projudi-wide-panel-overlay .pjc-pane-head {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 2px 2px 10px;
                border-bottom: 1px solid #dbe3ef;
            }

            #projudi-wide-panel-overlay .pjc-pane-icon {
                width: 38px;
                height: 38px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 auto;
                border-radius: 11px;
                background: #e8f1fa;
                color: #175a9d;
                font-size: 16px;
            }

            #projudi-wide-panel-overlay .pjc-pane-title {
                margin: 0;
                color: #102a43;
                font-size: 18px;
                font-weight: 800;
                line-height: 1.2;
            }

            #projudi-wide-panel-overlay .pjc-pane-desc {
                margin: 2px 0 0;
                color: #64748b;
                font-size: 12px;
            }

            #projudi-wide-panel-overlay .pjc-subsection {
                grid-column: 1 / -1;
                display: flex;
                align-items: center;
                gap: 7px;
                margin: 4px 2px -2px;
                color: #36536f;
                font-size: 12px;
                font-weight: 800;
                letter-spacing: .02em;
            }

            #projudi-wide-panel-overlay .pjc-subsection :is(i, .pj-suite-fa) {
                width: 15px;
                color: #1f69a8;
                text-align: center;
            }

            #projudi-wide-panel-overlay .pjc-stack {
                display: grid;
                grid-template-columns: 1fr;
                gap: 10px;
            }

            #projudi-wide-panel-overlay .pjc-stack--two {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            #projudi-wide-panel-overlay .pjc-card {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 12px;
                padding: 12px 14px;
                border: 1px solid #dbe3ef;
                border-radius: 12px;
                background: #ffffff;
                box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
                transition: border-color .15s ease, box-shadow .15s ease, background-color .15s ease;
            }

            #projudi-wide-panel-overlay .pjc-card:hover {
                border-color: #b8c9da;
                box-shadow: 0 4px 14px rgba(15, 45, 78, .07);
            }

            #projudi-wide-panel-overlay .pjc-card--hero {
                display: block;
                padding: 16px;
                background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
            }

            #projudi-wide-panel-overlay .pjc-card--soft {
                background: #f8fbff;
            }

            #projudi-wide-panel-overlay .pjc-card-body {
                min-width: 0;
                flex: 1;
            }

            #projudi-wide-panel-overlay .pjc-card-title {
                margin: 0;
                color: #0f172a;
                font-size: 14px;
                font-weight: 700;
                line-height: 1.25;
            }

            #projudi-wide-panel-overlay .pjc-summary-title {
                margin: 4px 0 4px;
                color: #12385f;
                font-size: 20px;
                font-weight: 800;
                line-height: 1.1;
            }

            #projudi-wide-panel-overlay .pjc-category-nav {
                display: grid;
                grid-template-columns: 1fr;
                gap: 6px;
                margin-top: 14px;
            }

            #projudi-wide-panel-overlay .pjc-category-button {
                display: flex;
                align-items: center;
                gap: 9px;
                width: 100%;
                border: 1px solid #dbe3ef;
                border-radius: 8px;
                background: #ffffff;
                padding: 9px 10px;
                color: #334155;
                font: inherit;
                font-weight: 700;
                text-align: left;
                cursor: pointer;
            }

            #projudi-wide-panel-overlay .pjc-category-button:hover {
                border-color: #9eb8d2;
                background: #f1f6fb;
            }

            #projudi-wide-panel-overlay .pjc-category-button[data-active="true"] {
                border-color: #1f5ca4;
                background: #e8f1fa;
                color: #12385f;
                box-shadow: inset 3px 0 0 #1f5ca4;
            }

            #projudi-wide-panel-overlay .pjc-category-button :is(i, .pj-suite-fa) {
                width: 16px;
                color: #1f5ca4;
                text-align: center;
            }

            #projudi-wide-panel-overlay .pjc-card-desc {
                margin: 3px 0 0;
                color: #64748b;
                font-size: 12px;
                line-height: 1.4;
            }

            #projudi-wide-panel-overlay .pjc-card-check {
                appearance: none !important;
                -webkit-appearance: none !important;
                position: relative;
                width: 38px;
                height: 22px;
                margin: 0;
                flex: 0 0 auto;
                border: 1px solid #b8c5d3;
                border-radius: 999px;
                background: #dbe3ec;
                cursor: pointer;
                transition: background-color .16s ease, border-color .16s ease;
            }

            #projudi-wide-panel-overlay .pjc-card-check::before {
                content: "";
                position: absolute;
                top: 2px;
                left: 2px;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #fff;
                box-shadow: 0 1px 3px rgba(15, 23, 42, .28);
                transition: transform .16s ease;
            }

            #projudi-wide-panel-overlay .pjc-card-check:checked {
                border-color: #1767a7;
                background: #1767a7;
            }

            #projudi-wide-panel-overlay .pjc-card-check:checked::before {
                transform: translateX(16px);
            }

            #projudi-wide-panel-overlay .pjc-card-check:disabled {
                opacity: .5;
                cursor: default;
            }

            #projudi-wide-panel-overlay .pjc-inline-controls {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
                justify-content: flex-end;
                flex: 0 0 auto;
            }

            #projudi-wide-panel-overlay .pjc-inline-controls--compact {
                gap: 6px;
            }

            #projudi-wide-panel-overlay .pjc-inline-controls span {
                color: #334155;
                font-size: 13px;
            }

            #projudi-wide-panel-overlay .pjc-input,
            #projudi-wide-panel-overlay .pjc-select,
            #projudi-wide-panel-overlay .pjc-text {
                width: 100%;
                padding: 7px 9px;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                background: #ffffff;
                color: #0f172a;
                font: inherit;
            }

            #projudi-wide-panel-overlay .pjc-input--number {
                width: 72px;
                text-align: right;
            }

            #projudi-wide-panel-overlay .pjc-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 10px;
            }

            #projudi-wide-panel-overlay .pjc-checkline {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                color: #334155;
                font-size: 13px;
                font-weight: 500;
            }

            #projudi-wide-panel-overlay .pjc-checkline input[type="checkbox"] {
                width: 16px;
                height: 16px;
                margin: 0;
            }

            #projudi-wide-panel-overlay .pjc-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                margin-top: 10px;
            }

            #projudi-wide-panel-overlay .pjc-btn-secondary,
            #projudi-wide-panel-overlay .pjc-btn-danger {
                min-width: 130px;
                padding: 7px 11px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
            }

            #projudi-wide-panel-overlay .pjc-btn-secondary {
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #1e293b;
            }

            #projudi-wide-panel-overlay .pjc-btn-danger {
                border: 1px solid #fecaca;
                background: #fff5f5;
                color: #b42318;
            }

            #projudi-wide-panel-overlay .pjc-card-action {
                min-width: 122px;
                padding: 7px 11px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                background: #ffffff;
                color: #1e293b;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
            }

            #projudi-wide-panel-overlay .pjc-backup-toggle {
                width: min(240px, 100%);
                min-height: 42px;
                align-self: center;
                border-color: #cbd5e1;
                background: #ffffff;
                color: #1e293b;
            }

            #projudi-wide-panel-overlay .pjc-section--backup .pjc-card {
                flex-direction: column;
                align-items: stretch;
                min-height: auto;
            }

            #projudi-wide-panel-overlay .pjc-section--backup .pjc-card-body {
                width: 100%;
            }

            #projudi-wide-panel-overlay .pjc-storage-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }

            #projudi-wide-panel-overlay .pjc-storage-card {
                display: grid;
                grid-template-columns: 38px 1fr;
                align-items: center;
                gap: 12px;
            }

            #projudi-wide-panel-overlay .pjc-storage-icon {
                width: 38px;
                height: 38px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 11px;
                background: #e8f1fa;
                color: #175a9d;
            }

            #projudi-wide-panel-overlay .pjc-backup-popover {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 18px;
                background: rgba(15, 23, 42, .34);
            }

            #projudi-wide-panel-overlay .pjc-backup-popover[data-open="true"] {
                display: flex;
            }

            #projudi-wide-panel-overlay .pjc-backup-dialog {
                display: block;
                width: min(720px, calc(100vw - 36px));
                max-height: min(84vh, 760px);
                padding: 16px;
                overflow: auto;
                box-sizing: border-box;
                border: 1px solid #dbe3ef;
                border-radius: 12px;
                background: #ffffff;
                box-shadow: 0 24px 70px rgba(2, 6, 23, .30);
            }

            #projudi-wide-panel-overlay .pjc-backup-head {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 12px;
            }

            #projudi-wide-panel-overlay .pjc-backup-close {
                width: 32px;
                height: 32px;
                border: 1px solid #cbd5e1;
                border-radius: 999px;
                background: #f8fbff;
                color: #173a61;
                cursor: pointer;
                font-size: 17px;
                line-height: 1;
            }

            #projudi-wide-panel-overlay .pjc-backup-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
                margin-top: 14px;
            }

            #projudi-wide-panel-overlay .pjc-backup-span {
                grid-column: 1 / -1;
            }

            #projudi-wide-panel-overlay .pjc-backup-field {
                display: grid;
                gap: 5px;
                min-width: 0;
            }

            #projudi-wide-panel-overlay .pjc-backup-field label {
                color: #2d4668;
                font-size: 12px;
                font-weight: 700;
            }

            #projudi-wide-panel-overlay .pjc-backup-toggles {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
                margin-top: 12px;
            }

            #projudi-wide-panel-overlay .pjc-backup-toggles .pjc-checkline {
                padding: 8px 10px;
                border: 1px solid #dbe3ef;
                border-radius: 999px;
                background: #f8fbff;
            }

            #projudi-wide-panel-overlay .pjc-backup-actions {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 8px;
                margin-top: 14px;
            }

            #projudi-wide-panel-overlay .pjc-backup-actions .pjc-btn-secondary,
            #projudi-wide-panel-overlay .pjc-backup-actions .pjc-btn-danger {
                min-width: 0;
                min-height: 40px;
            }

            #projudi-wide-panel-overlay .pjc-backup-primary {
                border-color: #1f69d5;
                background: #1f69d5;
                color: #fff;
            }

            #projudi-wide-panel-overlay .pjc-backup-success {
                border-color: #16833a;
                background: #18883f;
                color: #fff;
            }

            #projudi-wide-panel-overlay .pjc-card-action:disabled {
                opacity: .5;
                cursor: default;
            }

            #projudi-wide-panel-overlay .pjc-note {
                margin: 0;
                color: #64748b;
                font-size: 12px;
                line-height: 1.45;
            }

            #projudi-wide-panel-overlay .pjc-meta {
                color: #94a3b8;
                font-size: 11px;
            }

            @media (max-width: 960px) {
                #projudi-wide-panel-overlay .pjc-body {
                    grid-template-columns: 1fr;
                    grid-template-areas:
                        "summary"
                        "content";
                }
                #projudi-wide-panel-overlay .pjc-section--summary {
                    position: static;
                }
                #projudi-wide-panel-overlay .pjc-category-nav {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                #projudi-wide-panel-overlay #pj-panel-body {
                    padding: 12px !important;
                }
                #projudi-wide-panel-overlay #pj-panel-footer {
                    padding: 10px 12px !important;
                }
                #projudi-wide-panel-overlay .pjc-card {
                    flex-direction: column;
                }
                #projudi-wide-panel-overlay .pjc-stack--two,
                #projudi-wide-panel-overlay .pjc-storage-grid,
                #projudi-wide-panel-overlay .pjc-grid,
                #projudi-wide-panel-overlay .pjc-backup-grid,
                #projudi-wide-panel-overlay .pjc-backup-actions {
                    grid-template-columns: 1fr;
                }
                #projudi-wide-panel-overlay .pjc-inline-controls {
                    width: 100%;
                    justify-content: flex-start;
                }
                #projudi-wide-panel-overlay .pjc-input--number {
                    width: 84px;
                }
                #projudi-wide-panel-overlay #pj-panel-footer .pjc-note {
                    display: none;
                }
            }
            ${BACKUP_UI_CSS}
        `;

        panel.innerHTML = `
            <div id="pj-panel-header" style="padding:16px 18px; background:linear-gradient(135deg,#0b315f 0%,#175a9d 55%,#2476bd 100%); color:#fff;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <div class="pjc-panel-brand">
                        <span class="pjc-panel-brand-icon"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></span>
                        <div>
                            <div style="font-size:17px; font-weight:800; line-height:1.2;">Aparência do Projudi</div>
                            <div style="font-size:12px; opacity:.9; margin-top:2px;">Personalize a interface sem alterar o funcionamento do sistema</div>
                        </div>
                    </div>
                    <button id="pj-close" title="Fechar" style="border:0; background:rgba(255,255,255,.2); color:#fff; width:30px; height:30px; border-radius:999px; cursor:pointer; font-size:14px; font-weight:500; line-height:1.2;"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>
            </div>
            <div id="pj-panel-body">
                <div class="pjc-body">
                    <section class="pjc-section pjc-section--summary">
                        <div class="pjc-section-title">Configurações</div>
                        <div class="pjc-card pjc-card--hero">
                            <p class="pjc-summary-title">Escolha uma área</p>
                            <p class="pjc-card-desc">As opções foram separadas pelo efeito que produzem na interface.</p>
                            <div class="pjc-category-nav" aria-label="Categorias de configurações">
                                <button type="button" class="pjc-category-button" data-pjc-section-target="layout" data-active="true"><i class="fa-solid fa-palette" aria-hidden="true"></i><span>Visual e fonte</span></button>
                                <button type="button" class="pjc-category-button" data-pjc-section-target="nav"><i class="fa-solid fa-window-maximize" aria-hidden="true"></i><span>Tela e topo</span></button>
                                <button type="button" class="pjc-category-button" data-pjc-section-target="reading"><i class="fa-solid fa-table-list" aria-hidden="true"></i><span>Leitura e tabelas</span></button>
                                <button type="button" class="pjc-category-button" data-pjc-section-target="process"><i class="fa-solid fa-folder-open" aria-hidden="true"></i><span>Processo</span></button>
                                <button type="button" class="pjc-category-button" data-pjc-section-target="backup"><i class="fa-solid fa-database" aria-hidden="true"></i><span>Dados e backup</span></button>
                            </div>
                        </div>
                        <label class="pjc-card pjc-card--soft">
                            <div class="pjc-card-body">
                                <p class="pjc-card-title">Personalizações ativas</p>
                                <p class="pjc-card-desc">Desative para voltar temporariamente ao visual original.</p>
                            </div>
                            <input type="checkbox" id="pj-enabled" class="pjc-card-check">
                        </label>
                    </section>

                    <section class="pjc-section pjc-section--nav" data-pjc-pane="nav" data-active="false">
                        <div class="pjc-pane-head">
                            <span class="pjc-pane-icon"><i class="fa-solid fa-window-maximize" aria-hidden="true"></i></span>
                            <div><p class="pjc-pane-title">Tela e topo</p><p class="pjc-pane-desc">Controle o cabeçalho e o aproveitamento vertical da janela.</p></div>
                        </div>
                        <div class="pjc-stack pjc-stack--two">
                            <div class="pjc-subsection"><i class="fa-solid fa-heading" aria-hidden="true"></i><span>Cabeçalho</span></div>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Cabeçalho personalizado</p>
                                    <p class="pjc-card-desc">Moderniza cores e menus sem alterar a estrutura nativa do topo.</p>
                                </div>
                                <input type="checkbox" id="pj-custom-header" class="pjc-card-check">
                            </label>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Ocultar cabeçalho automaticamente</p>
                                    <p class="pjc-card-desc">Recolhe o topo quando o cursor entra na área do processo.</p>
                                </div>
                                <input type="checkbox" id="pj-auto-hide" class="pjc-card-check">
                            </label>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Ocultar relógio</p>
                                    <p class="pjc-card-desc">Esconde somente o cronômetro do topo.</p>
                                </div>
                                <input type="checkbox" id="pj-hide-clock" class="pjc-card-check">
                            </label>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Ocultar ícones utilitários</p>
                                    <p class="pjc-card-desc">Esconde fonte, ajuda, downloads, voltar e sair.</p>
                                </div>
                                <input type="checkbox" id="pj-hide-icons" class="pjc-card-check">
                            </label>
                            <div class="pjc-subsection"><i class="fa-solid fa-expand" aria-hidden="true"></i><span>Área de trabalho</span></div>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Remover barras de rolagem do iframe</p>
                                    <p class="pjc-card-desc">Esconde as barras visuais do iframe principal mantendo a rolagem ativa.</p>
                                </div>
                                <input type="checkbox" id="pj-remove-scrollbar" class="pjc-card-check">
                            </label>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Ajuste automático da altura</p>
                                    <p class="pjc-card-desc">Calcula a altura ideal do iframe para usar melhor a tela.</p>
                                </div>
                                <input type="checkbox" id="pj-iframe-height" class="pjc-card-check">
                            </label>
                        </div>
                    </section>

                    <section class="pjc-section pjc-section--layout" data-pjc-pane="layout" data-active="true">
                        <div class="pjc-pane-head">
                            <span class="pjc-pane-icon"><i class="fa-solid fa-palette" aria-hidden="true"></i></span>
                            <div><p class="pjc-pane-title">Visual e fonte</p><p class="pjc-pane-desc">Defina dimensões, densidade e identidade visual do conteúdo.</p></div>
                        </div>
                        <div class="pjc-stack pjc-stack--two">
                            <div class="pjc-subsection"><i class="fa-solid fa-ruler-combined" aria-hidden="true"></i><span>Dimensões</span></div>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Largura da página</p>
                                    <p class="pjc-card-desc">Limita a área útil inteira entre 60% e 100%, sem estreitar blocos internos.</p>
                                </div>
                                <div class="pjc-inline-controls pjc-inline-controls--compact">
                                    <input type="number" id="pj-content-width" min="60" max="100" step="1" class="pjc-input pjc-input--number">
                                    <span>%</span>
                                    <input type="checkbox" id="pj-enable-width" title="Ativar ajuste de largura" class="pjc-card-check">
                                </div>
                            </label>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Centralizar conteúdo</p>
                                    <p class="pjc-card-desc">Centraliza a área útil; desative para alinhá-la à esquerda.</p>
                                </div>
                                <input type="checkbox" id="pj-center-content" class="pjc-card-check">
                            </label>
                            <label id="pj-row-standalone" class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Aplicar em páginas diretas</p>
                                    <p class="pjc-card-desc">Aplica ajustes também em links abertos fora do iframe.</p>
                                </div>
                                <input type="checkbox" id="pj-standalone" class="pjc-card-check">
                            </label>
                            <label id="pj-row-side-bg" class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Fundo lateral</p>
                                    <p class="pjc-card-desc">Cor das áreas laterais quando a largura for menor que 100%.</p>
                                </div>
                                <div class="pjc-inline-controls">
                                    <select id="pj-side-bg" class="pjc-select">
                                        <option value="original">Original</option>
                                        <option value="white">Branco</option>
                                        <option value="light">Cinza claro</option>
                                    </select>
                                    <input type="checkbox" id="pj-enable-side-bg" title="Ativar ajuste de fundo lateral" class="pjc-card-check">
                                </div>
                            </label>
                            <div class="pjc-subsection"><i class="fa-solid fa-font" aria-hidden="true"></i><span>Tipografia e densidade</span></div>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Modo compacto</p>
                                    <p class="pjc-card-desc">Reduz espaços verticais em telas e tabelas.</p>
                                </div>
                                <input type="checkbox" id="pj-compact-mode" class="pjc-card-check">
                            </label>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Tamanho da fonte</p>
                                    <p class="pjc-card-desc">Ajusta a escala do texto do conteúdo.</p>
                                </div>
                                <div class="pjc-inline-controls">
                                    <select id="pj-font-scale" class="pjc-select">
                                        <option value="80">80%</option>
                                        <option value="90">90%</option>
                                        <option value="100">100%</option>
                                        <option value="110">110%</option>
                                        <option value="120">120%</option>
                                        <option value="130">130%</option>
                                    </select>
                                    <input type="checkbox" id="pj-enable-font-scale" title="Ativar ajuste de fonte" class="pjc-card-check">
                                </div>
                            </label>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Fonte do Google Fonts</p>
                                    <p class="pjc-card-desc">Informe qualquer família, por exemplo: Inter, Lato ou Source Sans 3.</p>
                                </div>
                                <div class="pjc-inline-controls">
                                    <input id="pj-google-font" class="pjc-select" type="text" placeholder="Inter" maxlength="80">
                                    <input type="checkbox" id="pj-enable-google-font" title="Ativar fonte personalizada" class="pjc-card-check">
                                </div>
                            </label>
                            <div class="pjc-subsection"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>Estilo geral</span></div>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Visual moderno</p>
                                    <p class="pjc-card-desc">Aplica tipografia confortável, superfícies, títulos e abas mais atuais.</p>
                                </div>
                                <input type="checkbox" id="pj-modern-visual" class="pjc-card-check">
                            </label>
                        </div>
                    </section>

                    <section class="pjc-section pjc-section--reading" data-pjc-pane="reading" data-active="false">
                        <div class="pjc-pane-head">
                            <span class="pjc-pane-icon"><i class="fa-solid fa-table-list" aria-hidden="true"></i></span>
                            <div><p class="pjc-pane-title">Leitura e tabelas</p><p class="pjc-pane-desc">Melhore a leitura de formulários, listas e movimentações extensas.</p></div>
                        </div>
                        <div class="pjc-stack pjc-stack--two">
                            <div class="pjc-subsection"><i class="fa-solid fa-layer-group" aria-hidden="true"></i><span>Componentes</span></div>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Tabelas mais legíveis</p>
                                    <p class="pjc-card-desc">Destaca cabeçalhos e alterna linhas sem apagar cores funcionais.</p>
                                </div>
                                <input type="checkbox" id="pj-modern-tables" class="pjc-card-check">
                            </label>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Formulários modernos</p>
                                    <p class="pjc-card-desc">Melhora campos, seletores e indicadores de foco.</p>
                                </div>
                                <input type="checkbox" id="pj-modern-forms" class="pjc-card-check">
                            </label>
                            <div class="pjc-subsection"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i><span>Auxílios de leitura</span></div>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Fixar abas do processo</p>
                                    <p class="pjc-card-desc">Mantém a barra de abas visível durante a rolagem.</p>
                                </div>
                                <input type="checkbox" id="pj-sticky-actions" class="pjc-card-check">
                            </label>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Fixar cabeçalhos das tabelas</p>
                                    <p class="pjc-card-desc">Mantém os nomes das colunas visíveis em listas extensas.</p>
                                </div>
                                <input type="checkbox" id="pj-sticky-table-headers" class="pjc-card-check">
                            </label>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Realçar linha em leitura</p>
                                    <p class="pjc-card-desc">Marca discretamente a linha sob o cursor.</p>
                                </div>
                                <input type="checkbox" id="pj-highlight-hovered-row" class="pjc-card-check">
                            </label>
                        </div>
                    </section>

                    <section class="pjc-section pjc-section--process" data-pjc-pane="process" data-active="false">
                        <div class="pjc-pane-head">
                            <span class="pjc-pane-icon"><i class="fa-solid fa-folder-open" aria-hidden="true"></i></span>
                            <div><p class="pjc-pane-title">Processo e arquivos</p><p class="pjc-pane-desc">Configure movimentações, documentos e ferramentas de geração.</p></div>
                        </div>
                        <div class="pjc-stack pjc-stack--two">
                            <div class="pjc-subsection"><i class="fa-solid fa-file-lines" aria-hidden="true"></i><span>Documentos e movimentações</span></div>
                            <div class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Destacar movimentações</p>
                                    <p class="pjc-card-desc">Aplica cores e formatação às movimentações do processo. As opções avançadas ficam em um pop-up próprio.</p>
                                </div>
                                <div class="pjc-inline-controls">
                                    <button type="button" id="pj-mov-settings" class="pjc-card-action">Opções</button>
                                    <input type="checkbox" id="pj-enable-movimentacoes" class="pjc-card-check">
                                </div>
                            </div>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Abrir arquivos do processo em pop-up</p>
                                    <p class="pjc-card-desc">Nos eventos do processo, abre arquivos na mesma aba com opção de minimizar e fechar.</p>
                                </div>
                                <input type="checkbox" id="pj-process-popup" class="pjc-card-check">
                            </label>
                            <label class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Botão “Gerar espelho do processo”</p>
                                    <p class="pjc-card-desc">Mostra o botão ao lado do PDF padrão para gerar capa e movimentações via script.</p>
                                </div>
                                <input type="checkbox" id="pj-process-mirror-pdf" class="pjc-card-check">
                            </label>
                            <label id="pj-row-popup-size" class="pjc-card">
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Tamanho do pop-up</p>
                                    <p class="pjc-card-desc">Define a largura e altura do pop-up entre 60% e 100% da janela.</p>
                                </div>
                                <div class="pjc-inline-controls pjc-inline-controls--compact">
                                    <input type="number" id="pj-popup-size" min="60" max="100" step="1" class="pjc-input pjc-input--number">
                                    <span>%</span>
                                </div>
                            </label>
                        </div>
                        <p class="pjc-note">As alterações são salvas e aplicadas imediatamente.</p>
                    </section>

                    <section class="pjc-section pjc-section--backup" data-pjc-pane="backup" data-active="false">
                        <div class="pjc-pane-head">
                            <span class="pjc-pane-icon"><i class="fa-solid fa-database" aria-hidden="true"></i></span>
                            <div><p class="pjc-pane-title">Dados e backup</p><p class="pjc-pane-desc">As preferências já ficam salvas neste navegador; o Gist cria uma cópia remota opcional.</p></div>
                        </div>
                        <div class="pjc-storage-grid">
                            <div class="pjc-card pjc-storage-card">
                                <span class="pjc-storage-icon"><i class="fa-solid fa-hard-drive" aria-hidden="true"></i></span>
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Preferências locais</p>
                                    <p class="pjc-card-desc">Aparência, navegação e Movimentações ficam reunidas em um único documento versionado.</p>
                                </div>
                            </div>
                            <div class="pjc-card pjc-storage-card">
                                <span class="pjc-storage-icon"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span>
                                <div class="pjc-card-body">
                                    <p class="pjc-card-title">Credenciais isoladas</p>
                                    <p class="pjc-card-desc">Token e Gist ID ficam separados e nunca entram no conteúdo enviado ou restaurado.</p>
                                </div>
                            </div>
                        </div>
                        <div class="pjc-card pjc-card--soft">
                            <div class="pjc-card-body">
                                <p class="pjc-card-title">Cópia no GitHub Gist</p>
                                <p class="pjc-card-desc">Configure token, restauração e envio automático em uma janela separada.</p>
                            </div>
                            <button id="pj-backup-open" type="button" class="pjc-btn-secondary pjc-backup-toggle"><i class="fa-solid fa-cloud" aria-hidden="true"></i><span>Backup remoto</span></button>
                        </div>
                    </section>
                </div>
            </div>
            <div class="pjc-backup-popover pj-backup-ui__popover" id="pj-backup-popover">
                <section class="pjc-card pjc-backup-dialog pj-backup-ui__dialog" role="dialog" aria-modal="true" aria-labelledby="pj-backup-title">
                    <div class="pjc-card-body">
                        <div class="pjc-backup-head pj-backup-ui__header">
                            <div>
                                <div id="pj-backup-title" class="pjc-section-title pj-backup-ui__title"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i><span>Backup remoto</span></div>
                                <p class="pjc-card-desc pj-backup-ui__description">Credenciais ficam somente neste navegador e nunca entram no arquivo de backup.</p>
                            </div>
                            <button type="button" class="pjc-backup-close pj-backup-ui__close" data-pj-backup-close title="Fechar" aria-label="Fechar"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                        </div>
                        <div class="pjc-stack">
                            <div class="pjc-backup-grid pj-backup-ui__grid">
                                <div class="pjc-backup-field pj-backup-ui__field">
                                    <label for="pj-backup-gist-id">Gist ID</label>
                                    <input type="text" id="pj-backup-gist-id" placeholder="Cole o Gist ID" class="pjc-input pj-backup-ui__input">
                                </div>
                                <div class="pjc-backup-field pj-backup-ui__field">
                                    <label for="pj-backup-file-name">Arquivo</label>
                                    <input type="text" id="pj-backup-file-name" placeholder="projudi-customizacoes.json" class="pjc-input pj-backup-ui__input">
                                </div>
                                <div class="pjc-backup-field pjc-backup-span pj-backup-ui__field pj-backup-ui__field--full">
                                    <label for="pj-backup-token">Token do GitHub</label>
                                    <input type="password" id="pj-backup-token" placeholder="ghp_..." class="pjc-input pj-backup-ui__input">
                                </div>
                            </div>
                            <div class="pjc-backup-toggles pj-backup-ui__toggles">
                                <label class="pjc-checkline pj-backup-ui__toggle">
                                    <input type="checkbox" id="pj-backup-enabled">
                                    <span>Ativar backup por Gist no GitHub</span>
                                </label>
                                <label class="pjc-checkline pj-backup-ui__toggle">
                                    <input type="checkbox" id="pj-backup-auto">
                                    <span>Backup automático</span>
                                </label>
                            </div>
                            <div class="pjc-backup-actions pj-backup-ui__actions">
                                <button id="pj-backup-send" type="button" class="pjc-btn-secondary pjc-backup-primary pj-backup-ui__button pj-backup-ui__button--primary"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i><span>Enviar backup</span></button>
                                <button id="pj-backup-restore" type="button" class="pjc-btn-secondary pjc-backup-success pj-backup-ui__button pj-backup-ui__button--success"><i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i><span>Restaurar backup</span></button>
                                <button id="pj-backup-clear" type="button" class="pjc-btn-danger pj-backup-ui__button pj-backup-ui__button--danger"><i class="fa-solid fa-key" aria-hidden="true"></i><span>Remover configuração</span></button>
                                <button type="button" class="pjc-btn-secondary pj-backup-ui__button" data-pj-backup-close><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Fechar</span></button>
                            </div>
                            <div id="pj-backup-status" class="pjc-note pj-backup-ui__status" role="status" aria-live="polite"></div>
                            <div id="pj-backup-last" class="pjc-meta pj-backup-ui__last">${formatLastBackupLabel(backupSettings.lastBackupAt)}</div>
                        </div>
                    </div>
                </section>
            </div>
            <div id="pj-panel-footer" style="display:flex; align-items:center; gap:8px; justify-content:flex-end; padding:12px 16px; border-top:1px solid #dbe3ef; background:#f8fafc;">
                <span class="pjc-note" style="margin-right:auto;"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> As mudanças são aplicadas ao salvar.</span>
                <button id="pj-reset" style="padding:8px 12px; min-width:96px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer;"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Restaurar</button>
                <button id="pj-cancel" style="padding:8px 12px; min-width:86px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer;">Cancelar</button>
                <button id="pj-save" style="padding:8px 14px; min-width:132px; background:#0f3e75; color:#fff; border:0; border-radius:8px; cursor:pointer; font-weight:700;"><i class="fa-solid fa-check" aria-hidden="true"></i> Salvar alterações</button>
            </div>
        `;

        overlay.appendChild(scopedStyle);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        renderFontAwesome(overlay);
        requestAnimationFrame(() => {
            panel.style.transform = "translateY(0) scale(1)";
            panel.style.opacity = "1";
        });

        const autoHide = panel.querySelector("#pj-auto-hide");
        const iframeH = panel.querySelector("#pj-iframe-height");
        const enableWidth = panel.querySelector("#pj-enable-width");
        const contentW = panel.querySelector("#pj-content-width");
        const enabled = panel.querySelector("#pj-enabled");
        const centerContent = panel.querySelector("#pj-center-content");
        const compactMode = panel.querySelector("#pj-compact-mode");
        const enableFontScale = panel.querySelector("#pj-enable-font-scale");
        const fontScale = panel.querySelector("#pj-font-scale");
        const enableGoogleFont = panel.querySelector("#pj-enable-google-font");
        const googleFont = panel.querySelector("#pj-google-font");
        const enableSideBg = panel.querySelector("#pj-enable-side-bg");
        const sideBg = panel.querySelector("#pj-side-bg");
        const customHeader = panel.querySelector("#pj-custom-header");
        const modernVisual = panel.querySelector("#pj-modern-visual");
        const modernTables = panel.querySelector("#pj-modern-tables");
        const modernForms = panel.querySelector("#pj-modern-forms");
        const stickyActions = panel.querySelector("#pj-sticky-actions");
        const stickyTableHeaders = panel.querySelector("#pj-sticky-table-headers");
        const highlightHoveredRow = panel.querySelector("#pj-highlight-hovered-row");
        const hideClock = panel.querySelector("#pj-hide-clock");
        const hideIcons = panel.querySelector("#pj-hide-icons");
        const removeScrollbar = panel.querySelector("#pj-remove-scrollbar");
        const enableMovimentacoes = panel.querySelector("#pj-enable-movimentacoes");
        const movSettings = panel.querySelector("#pj-mov-settings");
        const standalone = panel.querySelector("#pj-standalone");
        const processPopup = panel.querySelector("#pj-process-popup");
        const processMirrorPdf = panel.querySelector("#pj-process-mirror-pdf");
        const popupSize = panel.querySelector("#pj-popup-size");
        const rowSideBg = panel.querySelector("#pj-row-side-bg");
        const rowStandalone = panel.querySelector("#pj-row-standalone");
        const rowPopupSize = panel.querySelector("#pj-row-popup-size");
        const backupOpen = panel.querySelector("#pj-backup-open");
        const backupPopover = panel.querySelector("#pj-backup-popover");
        const backupEnabled = panel.querySelector("#pj-backup-enabled");
        const backupGistId = panel.querySelector("#pj-backup-gist-id");
        const backupToken = panel.querySelector("#pj-backup-token");
        const backupFileName = panel.querySelector("#pj-backup-file-name");
        const backupAuto = panel.querySelector("#pj-backup-auto");
        const backupSend = panel.querySelector("#pj-backup-send");
        const backupRestore = panel.querySelector("#pj-backup-restore");
        const backupClear = panel.querySelector("#pj-backup-clear");
        const backupStatus = panel.querySelector("#pj-backup-status");
        const backupLast = panel.querySelector("#pj-backup-last");
        const categoryButtons = [...panel.querySelectorAll("[data-pjc-section-target]")];
        const categoryPanes = [...panel.querySelectorAll("[data-pjc-pane]")];
        const hasBackupUi = [
            backupEnabled,
            backupGistId,
            backupToken,
            backupFileName,
            backupAuto,
            backupSend,
            backupRestore,
            backupClear,
            backupStatus,
            backupLast
        ].every(Boolean);

        enabled.checked = settings.enabled !== false;
        autoHide.checked = !!settings.autoHideHeader;
        iframeH.checked = !!settings.enableIframeAutoHeight;
        enableWidth.checked = !!settings.enableWidthAdjustments;
        contentW.value = String(sanitizeWidthPercent(settings.contentWidthPercent));
        centerContent.checked = settings.centerContent !== false;
        compactMode.checked = !!settings.compactMode;
        enableFontScale.checked = !!settings.fontScaleEnabled;
        fontScale.value = String(sanitizeFontScale(settings.fontScalePercent));
        enableGoogleFont.checked = !!settings.googleFontEnabled;
        googleFont.value = sanitizeGoogleFontFamily(settings.googleFontFamily);
        enableSideBg.checked = !!settings.sideBackgroundEnabled;
        sideBg.value = sanitizeSideBackground(settings.sideBackground);
        customHeader.checked = !!settings.customHeaderEnabled;
        modernVisual.checked = !!settings.modernVisualEnabled;
        modernTables.checked = !!settings.modernTablesEnabled;
        modernForms.checked = !!settings.modernFormsEnabled;
        stickyActions.checked = !!settings.stickyActionsEnabled;
        stickyTableHeaders.checked = !!settings.stickyTableHeadersEnabled;
        highlightHoveredRow.checked = !!settings.highlightHoveredRowEnabled;
        hideClock.checked = !!settings.hideClock;
        hideIcons.checked = !!settings.hideHeaderIcons;
        removeScrollbar.checked = !!settings.enableRemoveScrollbar;
        enableMovimentacoes.checked = !!settings.enableMovimentacoes;
        standalone.checked = !!settings.applyToStandalonePages;
        processPopup.checked = !!settings.openProcessFilesInPopup;
        processMirrorPdf.checked = settings.enableProcessMirrorPdf !== false;
        popupSize.value = String(sanitizePopupSize(settings.popupSizePercent));
        if (hasBackupUi) {
            backupEnabled.checked = backupSettings.enabled;
            backupGistId.value = backupSettings.gistId;
            backupToken.value = backupSettings.token;
            backupFileName.value = backupSettings.fileName;
            backupAuto.checked = backupSettings.autoBackupOnSave;
        }

        const syncPanelStates = () => {
            contentW.disabled = !enableWidth.checked;
            fontScale.disabled = !enableFontScale.checked;
            googleFont.disabled = !enableGoogleFont.checked;
            sideBg.disabled = !enableSideBg.checked;
            standalone.disabled = !enableWidth.checked;
            popupSize.disabled = !processPopup.checked;
            rowSideBg.style.display = enableWidth.checked ? "flex" : "none";
            rowStandalone.style.display = enableWidth.checked ? "flex" : "none";
            rowPopupSize.style.display = processPopup.checked ? "flex" : "none";
            movSettings.disabled = !enabled.checked || !enableMovimentacoes.checked;
        };
        const setBackupStatus = (message, tone) => {
            if (!hasBackupUi) return;
            backupStatus.textContent = message || "";
            backupStatus.dataset.state = !message ? "idle" : tone === "error" ? "error" : tone === "ok" ? "success" : "progress";
        };
        const updateBackupLast = () => {
            if (!hasBackupUi) return;
            backupLast.textContent = formatLastBackupLabel(backupSettings.lastBackupAt);
        };
        const readBackupSettingsFromPanel = () => {
            if (!hasBackupUi) return backupSettings;
            return normalizeBackupSettings({
                enabled: backupEnabled.checked,
                gistId: backupGistId.value,
                token: backupToken.value,
                fileName: backupFileName.value,
                autoBackupOnSave: backupAuto.checked
            });
        };
        const applySettingsToForm = (nextSettings) => {
            enabled.checked = nextSettings.enabled !== false;
            autoHide.checked = !!nextSettings.autoHideHeader;
            iframeH.checked = !!nextSettings.enableIframeAutoHeight;
            enableWidth.checked = !!nextSettings.enableWidthAdjustments;
            contentW.value = String(sanitizeWidthPercent(nextSettings.contentWidthPercent));
            centerContent.checked = nextSettings.centerContent !== false;
            compactMode.checked = !!nextSettings.compactMode;
            enableFontScale.checked = !!nextSettings.fontScaleEnabled;
            fontScale.value = String(sanitizeFontScale(nextSettings.fontScalePercent));
            enableGoogleFont.checked = !!nextSettings.googleFontEnabled;
            googleFont.value = sanitizeGoogleFontFamily(nextSettings.googleFontFamily);
            enableSideBg.checked = !!nextSettings.sideBackgroundEnabled;
            sideBg.value = sanitizeSideBackground(nextSettings.sideBackground);
            customHeader.checked = !!nextSettings.customHeaderEnabled;
            modernVisual.checked = !!nextSettings.modernVisualEnabled;
            modernTables.checked = !!nextSettings.modernTablesEnabled;
            modernForms.checked = !!nextSettings.modernFormsEnabled;
            stickyActions.checked = !!nextSettings.stickyActionsEnabled;
            stickyTableHeaders.checked = !!nextSettings.stickyTableHeadersEnabled;
            highlightHoveredRow.checked = !!nextSettings.highlightHoveredRowEnabled;
            hideClock.checked = !!nextSettings.hideClock;
            hideIcons.checked = !!nextSettings.hideHeaderIcons;
            removeScrollbar.checked = !!nextSettings.enableRemoveScrollbar;
            enableMovimentacoes.checked = !!nextSettings.enableMovimentacoes;
            standalone.checked = !!nextSettings.applyToStandalonePages;
            processPopup.checked = !!nextSettings.openProcessFilesInPopup;
            processMirrorPdf.checked = nextSettings.enableProcessMirrorPdf !== false;
            popupSize.value = String(sanitizePopupSize(nextSettings.popupSizePercent));
            syncPanelStates();
        };
        const getPanelSettingsPayload = () => {
            const widthPercent = sanitizeWidthPercent(contentW.value);
            const popupPercent = sanitizePopupSize(popupSize.value);
            contentW.value = String(widthPercent);
            popupSize.value = String(popupPercent);
            return {
                enabled: enabled.checked,
                autoHideHeader: autoHide.checked,
                enableIframeAutoHeight: iframeH.checked,
                enableWidthAdjustments: enableWidth.checked,
                contentWidthPercent: widthPercent,
                centerContent: centerContent.checked,
                compactMode: compactMode.checked,
                fontScaleEnabled: enableFontScale.checked,
                fontScalePercent: sanitizeFontScale(fontScale.value),
                googleFontEnabled: enableGoogleFont.checked,
                googleFontFamily: sanitizeGoogleFontFamily(googleFont.value),
                sideBackgroundEnabled: enableSideBg.checked,
                sideBackground: sanitizeSideBackground(sideBg.value),
                customHeaderEnabled: customHeader.checked,
                modernVisualEnabled: modernVisual.checked,
                modernTablesEnabled: modernTables.checked,
                modernFormsEnabled: modernForms.checked,
                stickyActionsEnabled: stickyActions.checked,
                stickyTableHeadersEnabled: stickyTableHeaders.checked,
                highlightHoveredRowEnabled: highlightHoveredRow.checked,
                hideClock: hideClock.checked,
                hideHeaderIcons: hideIcons.checked,
                enableRemoveScrollbar: removeScrollbar.checked,
                enableMovimentacoes: enableMovimentacoes.checked,
                applyToStandalonePages: enableWidth.checked && standalone.checked,
                openProcessFilesInPopup: processPopup.checked,
                popupSizePercent: popupPercent,
                enableProcessMirrorPdf: processMirrorPdf.checked
            };
        };
        const runBackupNow = async (nextSettings) => {
            const currentBackupSettings = readBackupSettingsFromPanel();
            backupSettings = saveBackupSettings(currentBackupSettings);
            setBackupStatus("Enviando backup...", "muted");
            await pushBackupToGist(backupSettings, buildBackupPayload(nextSettings));
            backupSettings = saveBackupSettings({ ...backupSettings, lastBackupAt: new Date().toISOString() });
            updateBackupLast();
            setBackupStatus("Backup enviado com sucesso.", "ok");
        };
        updateBackupLast();
        syncPanelStates();
        const showPanelSection = (sectionName) => {
            categoryButtons.forEach((button) => {
                const active = button.dataset.pjcSectionTarget === sectionName;
                button.dataset.active = String(active);
                button.setAttribute("aria-pressed", String(active));
            });
            categoryPanes.forEach((pane) => {
                pane.dataset.active = String(pane.dataset.pjcPane === sectionName);
            });
            const body = panel.querySelector("#pj-panel-body");
            if (body) body.scrollTop = 0;
        };
        categoryButtons.forEach((button) => {
            button.addEventListener("click", () => showPanelSection(button.dataset.pjcSectionTarget));
        });
        if (backupOpen && backupPopover) {
            backupOpen.addEventListener("click", () => {
                backupPopover.dataset.open = "true";
            });
            backupPopover.addEventListener("click", (event) => {
                if (event.target === backupPopover || event.target.closest("[data-pj-backup-close]")) {
                    backupPopover.dataset.open = "false";
                }
            });
        }
        enableWidth.addEventListener("change", syncPanelStates);
        enableFontScale.addEventListener("change", syncPanelStates);
        enableGoogleFont.addEventListener("change", syncPanelStates);
        enableSideBg.addEventListener("change", syncPanelStates);
        processPopup.addEventListener("change", syncPanelStates);
        enabled.addEventListener("change", syncPanelStates);
        enableMovimentacoes.addEventListener("change", syncPanelStates);
        movSettings.addEventListener("click", () => {
            if (!enabled.checked || !enableMovimentacoes.checked) return;
            saveSettings({ ...settings, ...getPanelSettingsPayload() });
            applySettingsNow();
            openMovimentacoesPanel();
        });

        const escClose = (ev) => {
            if (ev.key !== "Escape") return;
            closePanel();
        };

        const closePanel = () => {
            document.removeEventListener("keydown", escClose);
            unlockBodyScroll();
            overlay.remove();
        };

        panel.querySelector("#pj-close").addEventListener("click", closePanel);
        panel.querySelector("#pj-cancel").addEventListener("click", closePanel);

        panel.querySelector("#pj-reset").addEventListener("click", () => {
            enabled.checked = DEFAULT_SETTINGS.enabled;
            autoHide.checked = DEFAULT_SETTINGS.autoHideHeader;
            iframeH.checked = DEFAULT_SETTINGS.enableIframeAutoHeight;
            enableWidth.checked = DEFAULT_SETTINGS.enableWidthAdjustments;
            contentW.value = String(DEFAULT_SETTINGS.contentWidthPercent);
            centerContent.checked = DEFAULT_SETTINGS.centerContent;
            compactMode.checked = DEFAULT_SETTINGS.compactMode;
            enableFontScale.checked = DEFAULT_SETTINGS.fontScaleEnabled;
            fontScale.value = String(DEFAULT_SETTINGS.fontScalePercent);
            enableGoogleFont.checked = DEFAULT_SETTINGS.googleFontEnabled;
            googleFont.value = DEFAULT_SETTINGS.googleFontFamily;
            enableSideBg.checked = DEFAULT_SETTINGS.sideBackgroundEnabled;
            sideBg.value = DEFAULT_SETTINGS.sideBackground;
            customHeader.checked = DEFAULT_SETTINGS.customHeaderEnabled;
            modernVisual.checked = DEFAULT_SETTINGS.modernVisualEnabled;
            modernTables.checked = DEFAULT_SETTINGS.modernTablesEnabled;
            modernForms.checked = DEFAULT_SETTINGS.modernFormsEnabled;
            stickyActions.checked = DEFAULT_SETTINGS.stickyActionsEnabled;
            stickyTableHeaders.checked = DEFAULT_SETTINGS.stickyTableHeadersEnabled;
            highlightHoveredRow.checked = DEFAULT_SETTINGS.highlightHoveredRowEnabled;
            hideClock.checked = DEFAULT_SETTINGS.hideClock;
            hideIcons.checked = DEFAULT_SETTINGS.hideHeaderIcons;
            removeScrollbar.checked = DEFAULT_SETTINGS.enableRemoveScrollbar;
            enableMovimentacoes.checked = DEFAULT_SETTINGS.enableMovimentacoes;
            standalone.checked = DEFAULT_SETTINGS.applyToStandalonePages;
            processPopup.checked = DEFAULT_SETTINGS.openProcessFilesInPopup;
            processMirrorPdf.checked = DEFAULT_SETTINGS.enableProcessMirrorPdf;
            popupSize.value = String(DEFAULT_SETTINGS.popupSizePercent);
            syncPanelStates();
        });

        if (hasBackupUi) {
            backupSend.addEventListener("click", async () => {
                try {
                    await runBackupNow(getPanelSettingsPayload());
                } catch (error) {
                    setBackupStatus(error && error.message ? error.message : "Falha ao enviar backup.", "error");
                }
            });

            backupRestore.addEventListener("click", async () => {
                try {
                    backupSettings = saveBackupSettings(readBackupSettingsFromPanel());
                    setBackupStatus("Lendo backup...", "muted");
                    const payload = await readBackupFromGist(backupSettings);
                    const restored = applyBackupPayload(payload);
                    applySettingsToForm(restored);
                    setBackupStatus("Backup restaurado com sucesso.", "ok");
                } catch (error) {
                    setBackupStatus(error && error.message ? error.message : "Falha ao restaurar backup.", "error");
                }
            });

            backupClear.addEventListener("click", () => {
                backupSettings = saveBackupSettings(DEFAULT_BACKUP_SETTINGS);
                backupEnabled.checked = backupSettings.enabled;
                backupGistId.value = backupSettings.gistId;
                backupToken.value = backupSettings.token;
                backupFileName.value = backupSettings.fileName;
                backupAuto.checked = backupSettings.autoBackupOnSave;
                updateBackupLast();
                setBackupStatus("Configuração de backup removida.", "ok");
            });
        }

        panel.querySelector("#pj-save").addEventListener("click", async () => {
            const nextSettings = getPanelSettingsPayload();
            backupSettings = saveBackupSettings(readBackupSettingsFromPanel());
            saveSettings(nextSettings);
            applySettingsNow();
            if (backupSettings.enabled && backupSettings.autoBackupOnSave) {
                try {
                    await runBackupNow(nextSettings);
                } catch (error) {
                    setBackupStatus(error && error.message ? error.message : "Falha ao enviar backup.", "error");
                    return;
                }
            }
            closePanel();
        });

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closePanel();
        });

        document.addEventListener("keydown", escClose);
    }

    function restoreCustomHeaderStructure() {
        if (!customHeaderMount) return;
        customHeaderMount.items.forEach(({ node, marker }) => {
            if (marker.parentNode) marker.parentNode.insertBefore(node, marker);
            marker.remove();
        });
        customHeaderMount.root.remove();
        customHeaderMount = null;
    }

    function syncCustomHeaderStructure() {
        const attrs = [
            "data-pjc-custom-header-shell",
            "data-pjc-custom-nav-shell",
            "data-pjc-custom-nav"
        ];
        attrs.forEach(attr => {
            document.querySelectorAll(`[${attr}]`).forEach(node => node.removeAttribute(attr));
        });
        if (!settings.customHeaderEnabled || !document.body || isPublicLandingPage()) {
            restoreCustomHeaderStructure();
            return;
        }

        const header = document.getElementById("Cabecalho") || document.getElementById("pgn_cabecalho");
        const nav = document.getElementById("menuPrinciapl");
        if (!header) return;
        header.setAttribute("data-pjc-custom-header-shell", "true");
        if (nav) nav.setAttribute("data-pjc-custom-nav", "true");

        const navShell = nav && nav.parentElement && nav.parentElement !== document.body
            ? nav.parentElement
            : nav;
        if (navShell) navShell.setAttribute("data-pjc-custom-nav-shell", "true");

        if (customHeaderMount?.root?.isConnected) return;
        restoreCustomHeaderStructure();
        const topChild = node => {
            let current = node;
            while (current?.parentElement && current.parentElement !== document.body) current = current.parentElement;
            return current?.parentElement === document.body ? current : null;
        };
        const nodes = [...new Set([topChild(header), topChild(navShell)].filter(Boolean))];
        if (!nodes.length) return;
        nodes.sort((left, right) => [...document.body.children].indexOf(left) - [...document.body.children].indexOf(right));

        const root = document.createElement("section");
        root.id = "pjc-custom-header-root";
        root.setAttribute("aria-label", "Cabeçalho personalizado do Projudi");
        document.body.insertBefore(root, nodes[0]);
        const items = nodes.map(node => {
            const marker = document.createComment("projudi-custom-header-position");
            node.parentNode.insertBefore(marker, node);
            root.appendChild(node);
            return { node, marker };
        });
        customHeaderMount = { root, items };
    }

    function injectTopHeaderCSS() {
        syncCustomHeaderStructure();
        syncGoogleFont(document);
        const widthEnabled = !!settings.enableWidthAdjustments;
        const widthPercent = widthEnabled ? sanitizeWidthPercent(settings.contentWidthPercent) : 100;
        const widthValue = `${widthPercent}%`;
        const centeredMargins = settings.centerContent && widthPercent < 100 ? "auto" : "0";
        const horizontalGutter = settings.centerContent && widthPercent < 100
            ? `calc((100% - ${widthValue}) / 2)`
            : "0px";
        const customHeaderWidth = widthEnabled ? widthValue : "100%";
        const customHeaderMargins = widthEnabled ? centeredMargins : "0";
        const customHeaderInnerWidth = widthEnabled ? "100%" : "min(1480px, calc(100% - 28px))";
        const topPageBg =
            widthEnabled && settings.sideBackgroundEnabled && settings.sideBackground === "white"
                ? "#ffffff"
                : widthEnabled && settings.sideBackgroundEnabled && settings.sideBackground === "light"
                    ? "#f3f4f6"
                    : "";
        const hasHeaderAdjust = settings.enabled && !isPublicLandingPage();
        if (!hasHeaderAdjust) {
            removeStyleFromDoc(document, "projudi-top-header-style");
            return;
        }

        const widthCss = widthEnabled ? `
            ${topPageBg ? `body.fundo { background-color: ${topPageBg} !important; }` : ""}
            #Cabecalho {
                width: 100% !important;
                max-width: 100% !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
            }
            #pgn_cabecalho {
                width: ${widthValue} !important;
                max-width: ${widthValue} !important;
                margin-left: ${centeredMargins} !important;
                margin-right: ${centeredMargins} !important;
                box-sizing: border-box !important;
            }
            #cssmenu {
                width: 100% !important;
                max-width: 100% !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
                padding-left: ${horizontalGutter} !important;
                padding-right: ${horizontalGutter} !important;
                box-sizing: border-box !important;
            }
            #menuPrinciapl.menu {
                float: none !important;
                display: block !important;
                width: ${widthValue} !important;
                max-width: ${widthValue} !important;
                margin-left: ${centeredMargins} !important;
                margin-right: ${centeredMargins} !important;
                box-sizing: border-box !important;
                clear: both !important;
            }
        ` : "";

        const stableNativeHeaderCss = `
            #pgn_cabecalho > div[style*="float: right"] {
                white-space: nowrap !important;
            }
            #cssmenu > ul {
                display: flex !important;
                align-items: center !important;
                justify-content: flex-end !important;
                flex-wrap: nowrap !important;
            }
            #cssmenu > ul > li {
                flex: 0 0 auto !important;
            }
        `;

        const visibilityCss = `
            ${settings.hideClock ? "#cronometro { display: none !important; }" : ""}
            ${settings.hideHeaderIcons ? `
                #pgn_cabecalho > div[style*="float: right"],
                #pjc-custom-header-root #pgn_cabecalho > div[style*="float: right"] {
                    display: none !important;
                }
            ` : ""}
        `;

        // Preserva a estrutura funcional do Projudi e aplica uma identidade visual moderna em duas faixas.
        const stableCustomHeaderCss = settings.customHeaderEnabled ? `
            #pjc-custom-header-root {
                --pjc-header-primary: #0b3b67;
                --pjc-header-accent: #176fa6;
                --pjc-header-ink: #17324d;
                --pjc-header-muted: #5f7185;
                --pjc-header-border: #d7e3ee;
                position: relative !important;
                z-index: 1200 !important;
                width: ${customHeaderWidth} !important;
                max-width: ${customHeaderWidth} !important;
                margin: 0 ${customHeaderMargins} 12px !important;
                overflow: visible !important;
                background: #f5f8fb !important;
                border-bottom: 1px solid var(--pjc-header-border) !important;
                box-shadow: 0 4px 14px rgba(15, 45, 78, .11) !important;
            }
            #pjc-custom-header-root [data-pjc-custom-header-shell="true"] {
                position: relative !important;
                z-index: 2 !important;
                overflow: visible !important;
                min-height: 56px !important;
                border-bottom: 1px solid rgba(255,255,255,.14) !important;
                background:
                    radial-gradient(circle at 78% -120%, rgba(111, 205, 238, .42), transparent 42%),
                    linear-gradient(118deg, #092f55 0%, var(--pjc-header-primary) 52%, var(--pjc-header-accent) 100%) !important;
                box-shadow: inset 0 -1px 0 rgba(3, 20, 38, .22) !important;
            }
            #pjc-custom-header-root #pgn_cabecalho {
                width: ${customHeaderInnerWidth} !important;
                max-width: none !important;
                min-height: 56px !important;
                margin-left: auto !important;
                margin-right: auto !important;
                padding-left: 18px !important;
                padding-right: 18px !important;
                box-sizing: border-box !important;
                color: #ffffff !important;
                letter-spacing: -.012em !important;
            }
            #pjc-custom-header-root #pgn_cabecalho h1 {
                color: #ffffff !important;
            }
            #pjc-custom-header-root #img_logotj {
                max-height: 38px !important;
                width: auto !important;
                margin-left: 0 !important;
                margin-right: 12px !important;
                vertical-align: middle !important;
                filter: drop-shadow(0 2px 5px rgba(2, 18, 34, .28)) !important;
            }
            #pjc-custom-header-root #pgn_cabecalho > div[style*="float: right"] {
                display: flex !important;
                align-items: center !important;
                gap: 4px !important;
                min-height: 56px !important;
            }
            #pjc-custom-header-root #cssmenu,
            #pjc-custom-header-root #cssmenu > ul {
                overflow: visible !important;
                background: transparent !important;
            }
            #pjc-custom-header-root #cssmenu > ul {
                display: flex !important;
                align-items: center !important;
                justify-content: flex-end !important;
                gap: 4px !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            #pjc-custom-header-root #cssmenu > ul > li {
                float: none !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            #pjc-custom-header-root #cssmenu > ul > li:hover,
            #pjc-custom-header-root #cssmenu > ul > li:focus-within {
                border: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            #pjc-custom-header-root #cssmenu > ul > li > a,
            #pjc-custom-header-root #cssmenu > ul > li > #btn-voz-pesquisa,
            #pjc-custom-header-root #cssmenu > ul > li > #ContrasteAlterar,
            #pjc-custom-header-root #cssmenu > ul > li > #FonteAumentar,
            #pjc-custom-header-root #cssmenu > ul > li > #FonteDiminuir {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                min-width: 34px !important;
                width: auto !important;
                min-height: 34px !important;
                padding: 0 9px !important;
                color: #ffffff !important;
                border: 1px solid transparent !important;
                border-radius: 10px !important;
                box-sizing: border-box !important;
                cursor: pointer !important;
                font-size: 13px !important;
                font-style: normal !important;
                line-height: 1 !important;
                white-space: nowrap !important;
                transition: background-color .15s ease, border-color .15s ease, transform .15s ease !important;
            }
            #pjc-custom-header-root #cssmenu > ul > li:hover > a,
            #pjc-custom-header-root #cssmenu > ul > li:focus-within > a,
            #pjc-custom-header-root #cssmenu > ul > li:hover > #btn-voz-pesquisa,
            #pjc-custom-header-root #cssmenu > ul > li:focus-within > #btn-voz-pesquisa,
            #pjc-custom-header-root #cssmenu > ul > li:hover > #ContrasteAlterar,
            #pjc-custom-header-root #cssmenu > ul > li:focus-within > #ContrasteAlterar,
            #pjc-custom-header-root #cssmenu > ul > li:hover > #FonteAumentar,
            #pjc-custom-header-root #cssmenu > ul > li:focus-within > #FonteAumentar,
            #pjc-custom-header-root #cssmenu > ul > li:hover > #FonteDiminuir,
            #pjc-custom-header-root #cssmenu > ul > li:focus-within > #FonteDiminuir {
                color: #ffffff !important;
                border-color: rgba(255,255,255,.18) !important;
                background: rgba(255,255,255,.13) !important;
                transform: translateY(-1px) !important;
            }
            #pjc-custom-header-root [data-pjc-custom-nav-shell="true"],
            #pjc-custom-header-root #menuPrinciapl.menu {
                position: relative !important;
                z-index: 1 !important;
                overflow: visible !important;
                min-height: 42px !important;
                border-bottom: 0 !important;
                background: rgba(255,255,255,.96) !important;
                backdrop-filter: blur(12px) !important;
                -webkit-backdrop-filter: blur(12px) !important;
            }
            #pjc-custom-header-root #menuPrinciapl.menu {
                display: flex !important;
                align-items: center !important;
                flex-wrap: nowrap !important;
                gap: 3px !important;
                width: ${customHeaderInnerWidth} !important;
                max-width: none !important;
                margin-left: auto !important;
                margin-right: auto !important;
                padding: 5px 8px !important;
                box-sizing: border-box !important;
            }
            #pjc-custom-header-root #menuPrinciapl.menu > ul {
                display: block !important;
                flex: 0 0 auto !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                border-radius: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
                box-sizing: border-box !important;
            }
            #pjc-custom-header-root #menuPrinciapl.menu > ul > li {
                float: none !important;
                position: relative !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                border-radius: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            #pjc-custom-header-root #menuPrinciapl.menu > ul:hover,
            #pjc-custom-header-root #menuPrinciapl.menu > ul:focus-within,
            #pjc-custom-header-root #menuPrinciapl.menu > ul > li:hover,
            #pjc-custom-header-root #menuPrinciapl.menu > ul > li:focus-within {
                border: 0 !important;
                border-radius: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            #pjc-custom-header-root #menuPrinciapl.menu > ul > li > a,
            #pjc-custom-header-root #menuPrinciapl.menu > a {
                display: inline-flex !important;
                align-items: center !important;
                min-height: 32px !important;
                padding: 0 11px !important;
                border: 1px solid transparent !important;
                border-radius: 9px !important;
                color: var(--pjc-header-ink) !important;
                font-weight: 650 !important;
                line-height: 1.2 !important;
                text-decoration: none !important;
                transition: background-color .15s ease, border-color .15s ease, color .15s ease !important;
            }
            #pjc-custom-header-root #menuPrinciapl.menu > ul > li:hover > a,
            #pjc-custom-header-root #menuPrinciapl.menu > ul > li:focus-within > a {
                border-color: #cfe1ef !important;
                background: #edf5fb !important;
                color: #0b5d91 !important;
            }
            #pjc-custom-header-root #menuPrinciapl.menu > ul > li.active > a,
            #pjc-custom-header-root #menuPrinciapl.menu > ul > li.ativo > a {
                border-color: #bdd7e9 !important;
                background: #e5f1f9 !important;
                color: #084f7d !important;
                box-shadow: inset 0 -2px 0 #1682bd !important;
            }
            #pjc-custom-header-root #menuPrinciapl.menu ul ul {
                border: 1px solid var(--pjc-header-border) !important;
                border-radius: 10px !important;
                background: #ffffff !important;
                box-shadow: 0 14px 32px rgba(15, 45, 78, .18) !important;
            }
            #pjc-custom-header-root #menuPrinciapl.menu ul ul > li,
            #pjc-custom-header-root #menuPrinciapl.menu ul ul > li:hover,
            #pjc-custom-header-root #menuPrinciapl.menu ul ul > li:focus-within {
                border: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            #pjc-custom-header-root #menuPrinciapl.menu ul ul > li > a {
                border-radius: 7px !important;
                background: transparent !important;
                color: var(--pjc-header-ink) !important;
            }
            #pjc-custom-header-root #menuPrinciapl.menu ul ul > li:hover > a,
            #pjc-custom-header-root #menuPrinciapl.menu ul ul > li:focus-within > a {
                background: #edf5fb !important;
                color: #0b5d91 !important;
            }
            #pjc-custom-header-root #cronometro {
                margin: 6px 10px 6px auto !important;
                padding: 5px 9px !important;
                border: 1px solid #d7e5ef !important;
                border-radius: 999px !important;
                background: #f0f6fa !important;
                color: var(--pjc-header-muted) !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                line-height: 1 !important;
            }
            @media (max-width: 1080px) {
                #pjc-custom-header-root #menuPrinciapl.menu > ul > li > a {
                    padding-left: 8px !important;
                    padding-right: 8px !important;
                }
            }
        ` : "";

        const topFontCss = settings.googleFontEnabled && settings.googleFontFamily
            ? `
                #menuPrinciapl a {
                    font-family: "${settings.googleFontFamily}", sans-serif !important;
                }
            `
            : "";
        const css = `${stableNativeHeaderCss}\n${stableCustomHeaderCss}\n${widthCss}\n${topFontCss}\n${visibilityCss}`;

        let style = document.getElementById("projudi-top-header-style");
        if (!style) {
            style = document.createElement("style");
            style.id = "projudi-top-header-style";
            document.head.appendChild(style);
        }
        if (style.textContent !== css) style.textContent = css;
        if (settings.enableIframeAutoHeight) requestAnimationFrame(ajustarAlturaIframe);
    }

    function ajustarAlturaIframe() {
        const iframe = document.getElementById("Principal");
        if (!iframe) return;
        if (!settings.enabled || !settings.enableIframeAutoHeight) {
            iframe.style.removeProperty("height");
            return;
        }

        const iframeTop = Math.max(0, iframe.getBoundingClientRect().top);
        const h = Math.max(200, Math.floor(window.innerHeight - iframeTop));
        iframe.style.height = h + "px";
    }

    let headerHidden = false;
    function findHeaderGrayBar() {
        return Array.from(document.body.children).find(
            d => d && d.style && d.style.height === "28px" && d.style.backgroundColor === "#ccc"
        ) || null;
    }

    function toggleElementDisplay(el, hidden) {
        if (!el) return;
        const attr = "data-pj-prev-display";
        if (hidden) {
            if (!el.hasAttribute(attr)) el.setAttribute(attr, el.style.display || "");
            el.style.display = "none";
            return;
        }
        if (el.hasAttribute(attr)) {
            el.style.display = el.getAttribute(attr) || "";
            el.removeAttribute(attr);
        }
    }

    function getHeaderHideTargets() {
        const targets = [];
        const cab = document.getElementById("Cabecalho");
        const grayBar = findHeaderGrayBar();
        const menu = document.getElementById("cssmenu");

        if (cab) targets.push(cab);
        if (grayBar) targets.push(grayBar);
        if (menu && cab && !cab.contains(menu)) {
            targets.push(menu.closest("div") || menu);
        }

        return targets.filter(Boolean);
    }

    function setHeaderHidden(hidden) {
        if (!settings.enabled) hidden = false;
        if (headerHidden === hidden) {
            updateHeaderRevealZone();
            return;
        }
        headerHidden = hidden;
        const targets = getHeaderHideTargets();
        if (!targets.length) return;
        targets.forEach(el => toggleElementDisplay(el, hidden));
        updateHeaderRevealZone();
        setTimeout(() => {
            if (!hidden && settings.enabled) injectTopHeaderCSS();
            ajustarAlturaIframe();
        }, 20);
    }

    function setupHeaderAutoHide() {
        const iframe = document.getElementById("Principal");
        if (!settings.enabled || !settings.autoHideHeader) {
            if (mouseMoveListenerBound) {
                document.removeEventListener("mousemove", onDocumentMouseMove, { passive: true });
                mouseMoveListenerBound = false;
            }
            if (boundAutoHideIframeEl) {
                boundAutoHideIframeEl.removeEventListener("mouseenter", onIframeMouseEnter);
                boundAutoHideIframeEl = null;
            }
            return;
        }
        if (!mouseMoveListenerBound) {
            document.addEventListener("mousemove", onDocumentMouseMove, { passive: true });
            mouseMoveListenerBound = true;
        }
        if (!iframe) return;

        if (boundAutoHideIframeEl && boundAutoHideIframeEl !== iframe) {
            boundAutoHideIframeEl.removeEventListener("mouseenter", onIframeMouseEnter);
            boundAutoHideIframeEl = null;
        }
        if (boundAutoHideIframeEl === iframe) return;

        iframe.addEventListener("mouseenter", onIframeMouseEnter);
        boundAutoHideIframeEl = iframe;
    }

    function ensureHeaderRevealZone() {
        if (headerRevealZone || !isTopWindow() || !document.body) return;
        const zone = document.createElement("div");
        zone.id = "projudi-header-reveal-zone";
        zone.style.cssText = [
            "position:fixed",
            "top:0",
            "left:0",
            "right:0",
            "height:10px",
            "z-index:2147483000",
            "background:transparent",
            "display:none"
        ].join(";");
        zone.addEventListener("mouseenter", () => {
            if (!settings.enabled || !settings.autoHideHeader) return;
            setHeaderHidden(false);
        });
        document.body.appendChild(zone);
        headerRevealZone = zone;
    }

    function updateHeaderRevealZone() {
        if (!isTopWindow()) return;
        ensureHeaderRevealZone();
        if (!headerRevealZone) return;
        headerRevealZone.style.display = settings.enabled && settings.autoHideHeader && headerHidden ? "block" : "none";
    }

    function getPopupHostWindow() {
        try {
            return window.top || window;
        } catch (_) {
            return window;
        }
    }

    function getPopupHostDoc(fallbackDoc = document) {
        const hostWin = getPopupHostWindow();
        try {
            return hostWin.document || fallbackDoc;
        } catch (_) {
            return fallbackDoc;
        }
    }

    function ensurePopupHost(sourceDoc) {
        const hostWin = getPopupHostWindow();
        const hostDoc = getPopupHostDoc(sourceDoc);
        if (popupOwnerDoc && popupOwnerDoc !== hostDoc) removeProcessPopupUi();
        popupOwnerDoc = hostDoc;
        return { hostWin, hostDoc };
    }

    function updatePopupBodyScrollLock() {
        const hasVisible = [...popupWindows.values()].some(state => !state.minimized);
        if (hasVisible) {
            if (!popupUnlockBodyScroll && popupOwnerDoc) popupUnlockBodyScroll = lockBodyScroll(popupOwnerDoc);
            updatePopupBackdropVisibility();
            return;
        }
        if (popupUnlockBodyScroll) {
            try {
                popupUnlockBodyScroll();
            } catch (_) {}
            popupUnlockBodyScroll = null;
        }
        updatePopupBackdropVisibility();
    }

    function ensurePopupBackdrop(doc) {
        if (popupBackdrop && popupBackdrop.ownerDocument === doc) return popupBackdrop;
        if (popupBackdrop) {
            try {
                popupBackdrop.remove();
            } catch (_) {}
            popupBackdrop = null;
        }
        const backdrop = doc.createElement("div");
        backdrop.id = "pj-process-file-popup-backdrop";
        backdrop.style.cssText = [
            "position:fixed",
            "inset:0",
            "z-index:2147483646",
            "display:none",
            "background:rgba(15,23,42,.18)",
            "backdrop-filter:blur(8px)",
            "-webkit-backdrop-filter:blur(8px)"
        ].join(";");
        (doc.body || doc.documentElement).appendChild(backdrop);
        popupBackdrop = backdrop;
        return backdrop;
    }

    function updatePopupBackdropVisibility() {
        if (!popupOwnerDoc) return;
        const backdrop = ensurePopupBackdrop(popupOwnerDoc);
        if (!backdrop) return;
        const hasVisible = [...popupWindows.values()].some(state => !state.minimized);
        backdrop.style.display = hasVisible ? "block" : "none";
    }

    function getActivePopupState() {
        const active = popupActiveId ? popupWindows.get(popupActiveId) : null;
        if (active && !active.minimized) return active;
        const values = Array.from(popupWindows.values()).reverse();
        return values.find(state => !state.minimized) || null;
    }

    function tryPrintPopupContent(state) {
        if (!state || !state.contentEl) return false;
        const tag = (state.contentEl.tagName || "").toUpperCase();
        if (tag === "IFRAME") {
            try {
                const w = state.contentEl.contentWindow;
                if (!w || typeof w.print !== "function") return false;
                w.focus();
                w.print();
                return true;
            } catch (_) {
                return false;
            }
        }
        return false;
    }

    function refreshPopupViewportAfterRestore(state) {
        if (!state || !state.panel) return;
        const panel = state.panel;
        const contentEl = state.contentEl;
        const prevTransform = panel.style.transform;
        panel.style.transform = "translateZ(0)";
        void panel.offsetHeight;

        if (contentEl && String(contentEl.tagName || "").toUpperCase() === "IFRAME") {
            const frame = contentEl;
            const prevDisplay = frame.style.display;
            frame.style.display = "none";
            void frame.offsetHeight;
            frame.style.display = prevDisplay || "block";
            frame.style.transform = "translateZ(0)";
            requestAnimationFrame(() => {
                frame.style.removeProperty("transform");
            });
        }

        requestAnimationFrame(() => {
            panel.style.transform = prevTransform || "";
            panel.style.removeProperty("will-change");
        });
    }

    function ensurePopupPrintHandler(doc) {
        if (!doc) return;
        if (popupPrintCleanup && popupOwnerDoc === doc) return;
        if (popupPrintCleanup) {
            try {
                popupPrintCleanup();
            } catch (_) {}
            popupPrintCleanup = null;
        }
        const onKeyDown = (event) => {
            const key = String(event.key || "").toLowerCase();
            if (!(event.ctrlKey || event.metaKey) || key !== "p") return;
            const state = getActivePopupState();
            if (!state) return;
            if (!tryPrintPopupContent(state)) return;
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        };
        doc.addEventListener("keydown", onKeyDown, true);
        popupPrintCleanup = () => {
            try {
                doc.removeEventListener("keydown", onKeyDown, true);
            } catch (_) {}
        };
    }

    function updatePopupDockVisibility() {
        if (!popupDock) return;
        const minimized = [...popupWindows.values()].filter(state => state.minimized);
        const hasMinimized = minimized.length > 0;
        popupDock.style.display = hasMinimized ? "block" : "none";
        if (!hasMinimized) {
            if (popupDockMenu) popupDockMenu.style.display = "none";
            return;
        }
        if (popupDockToggle) popupDockToggle.textContent = `Arquivos (${minimized.length})`;
        renderPopupDockMenu();
    }

    function renderPopupDockMenu() {
        if (!popupDockMenu) return;
        popupDockMenu.innerHTML = "";
        const minimized = Array.from(popupWindows.values()).filter(state => state.minimized).reverse();
        minimized.forEach((state) => {
            const row = popupDockMenu.ownerDocument.createElement("div");
            row.style.cssText = "display:flex; align-items:center; gap:8px;";

            const openBtn = popupDockMenu.ownerDocument.createElement("button");
            openBtn.type = "button";
            openBtn.textContent = state.dockTitle || state.title || "Arquivo";
            openBtn.title = state.title || state.dockTitle || "Arquivo";
            openBtn.style.cssText = [
                "flex:1",
                "height:30px",
                "padding:0 10px",
                "border:1px solid #cbd5e1",
                "border-radius:8px",
                "background:#fff",
                "color:#0f172a",
                "font:500 12px/1.2 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Arial,sans-serif",
                "text-align:left",
                "white-space:nowrap",
                "overflow:hidden",
                "text-overflow:ellipsis",
                "cursor:pointer"
            ].join(";");
            openBtn.addEventListener("click", () => {
                state.restore();
                if (popupDockMenu) popupDockMenu.style.display = "none";
            });

            const closeBtn = popupDockMenu.ownerDocument.createElement("button");
            closeBtn.type = "button";
            closeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
            closeBtn.title = "Fechar arquivo";
            closeBtn.style.cssText = "width:30px; height:30px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#334155; cursor:pointer;";
            closeBtn.addEventListener("click", () => state.close());

            row.appendChild(openBtn);
            row.appendChild(closeBtn);
            popupDockMenu.appendChild(row);
        });
    }

    function ensurePopupDock(doc) {
        if (popupDock && popupDock.ownerDocument === doc) return popupDock;
        if (popupDock) {
            try {
                popupDock.remove();
            } catch (_) {}
            popupDock = null;
        }
        const dock = doc.createElement("div");
        dock.id = "pj-process-file-popup-dock";
        dock.style.cssText = [
            "position:fixed",
            "right:14px",
            "bottom:14px",
            "z-index:2147483647",
            "display:none",
            "width:min(200px, calc(100vw - 24px))"
        ].join(";");

        const toggle = doc.createElement("button");
        toggle.type = "button";
        toggle.textContent = "Arquivos (0)";
        toggle.style.cssText = [
            "width:100%",
            "height:30px",
            "padding:0 10px",
            "border:1px solid rgba(15,62,117,.25)",
            "border-radius:8px",
            "background:linear-gradient(180deg,#0f3e75,#0d3360)",
            "color:#fff",
            "font:600 12px/1.2 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Arial,sans-serif",
            "cursor:pointer",
            "box-shadow:0 6px 14px rgba(2,6,23,.22)"
        ].join(";");

        const menu = doc.createElement("div");
        menu.style.cssText = [
            "display:none",
            "margin-top:8px",
            "padding:8px",
            "border:1px solid #dbe3ef",
            "border-radius:10px",
            "background:#f8fafc",
            "box-shadow:0 8px 20px rgba(2,6,23,.18)",
            "max-height:min(45vh, 360px)",
            "overflow:auto",
            "flex-direction:column",
            "gap:8px"
        ].join(";");

        toggle.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!popupDockMenu) return;
            popupDockMenu.style.display = popupDockMenu.style.display === "flex" ? "none" : "flex";
        });

        doc.addEventListener("mousedown", (event) => {
            if (!popupDock || !popupDockMenu) return;
            if (!popupDock.contains(event.target)) popupDockMenu.style.display = "none";
        }, true);

        dock.appendChild(toggle);
        dock.appendChild(menu);
        (doc.body || doc.documentElement).appendChild(dock);
        renderFontAwesome(dock);
        popupDock = dock;
        popupDockToggle = toggle;
        popupDockMenu = menu;
        return dock;
    }

    function removeProcessPopupUi() {
        if (popupHookCleanup) {
            popupHookCleanup();
            popupHookCleanup = null;
        }
        popupHookedDoc = null;
        popupWindows.forEach((entry) => {
            try {
                entry.panel.remove();
            } catch (_) {}
        });
        popupWindows.clear();
        if (popupDock) {
            try {
                popupDock.remove();
            } catch (_) {}
            popupDock = null;
        }
        if (popupBackdrop) {
            try {
                popupBackdrop.remove();
            } catch (_) {}
            popupBackdrop = null;
        }
        popupDockToggle = null;
        popupDockMenu = null;
        if (popupUnlockBodyScroll) {
            try {
                popupUnlockBodyScroll();
            } catch (_) {}
            popupUnlockBodyScroll = null;
        }
        if (popupPrintCleanup) {
            try {
                popupPrintCleanup();
            } catch (_) {}
            popupPrintCleanup = null;
        }
        popupActiveId = null;
        popupOwnerDoc = null;
    }

    function getPopupFileUrl(anchor, doc) {
        if (!anchor || !doc) return "";
        const onclick = String(anchor.getAttribute("onclick") || "");
        if (/buscarArquivosMovimentacaoJSON/i.test(onclick)) return "";

        const hrefAttr = String(anchor.getAttribute("href") || "").trim();
        if (/^javascript:\s*buscarArquivosMovimentacaoJSON/i.test(hrefAttr)) return "";

        const openMatch = onclick.match(/window\.open\(\s*['"]([^'"]+)['"]/i);
        const raw = openMatch ? openMatch[1] : hrefAttr;
        if (!raw || raw === "#" || /^javascript:\s*void/i.test(raw)) return "";

        try {
            return new URL(raw, doc.location.href).href;
        } catch (_) {
            return "";
        }
    }

    function shouldHandleProcessFileLink(anchor, doc) {
        if (!anchor || !doc) return false;
        if (!settings.enabled || !settings.openProcessFilesInPopup) return false;
        if (!doc.getElementById("TabelaArquivos")) return false;
        if (!anchor.closest("#TabelaArquivos")) return false;

        const url = getPopupFileUrl(anchor, doc);
        if (!url) return false;

        const hrefLower = url.toLowerCase();
        if (anchor.target === "_blank") return true;
        if (/id_movimentacaoarquivo=|movimentacaoarquivo|pdfservico|download|arquivo/.test(hrefLower)) return true;
        if (/\.(pdf|mp4|webm|ogg|html?|txt|png|jpe?g|gif|docx?|xlsx?|pptx?)(\?|#|$)/.test(hrefLower)) return true;
        return !!anchor.closest("td.colunaMinima");
    }

    function buildPopupContent(url, doc) {
        const lower = String(url || "").toLowerCase();
        if (/\.(mp4|webm|ogg)(\?|#|$)/.test(lower)) {
            const video = doc.createElement("video");
            video.controls = true;
            video.autoplay = false;
            video.preload = "metadata";
            video.src = url;
            video.style.cssText = "width:100%; height:100%; background:#000;";
            return video;
        }
        const frame = doc.createElement("iframe");
        frame.src = url;
        frame.style.cssText = [
            "display:block",
            "width:calc(100% + 18px)",
            "max-width:none",
            "height:100%",
            "min-height:100%",
            "margin-right:-18px",
            "border:0",
            "background:#fff",
            "scrollbar-width:none",
            "-ms-overflow-style:none"
        ].join(";");
        frame.setAttribute("allow", "autoplay; fullscreen");
        frame.addEventListener("load", () => hidePopupScrollbarsInFrame(frame));
        return frame;
    }

    function hidePopupScrollbarsInFrame(frame) {
        if (!frame) return;
        try {
            const frameDoc = frame.contentDocument || frame.contentWindow?.document;
            if (!frameDoc || !frameDoc.head) return;
            if (frameDoc.getElementById("pj-popup-hidden-scrollbar-style")) return;
            const style = frameDoc.createElement("style");
            style.id = "pj-popup-hidden-scrollbar-style";
            style.textContent = [
                "html,body{scrollbar-width:none!important;-ms-overflow-style:none!important;overflow:auto!important;}",
                "html::-webkit-scrollbar,body::-webkit-scrollbar,*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;background:transparent!important;}",
                "*{scrollbar-width:none!important;-ms-overflow-style:none!important;}",
                "iframe{scrollbar-width:none!important;-ms-overflow-style:none!important;}"
            ].join("");
            frameDoc.head.appendChild(style);
        } catch (_) {}
    }

    function getFilenameFromUrl(url) {
        try {
            const u = new URL(url);
            const pathName = decodeURIComponent(u.pathname || "");
            const fromPath = pathName.split("/").filter(Boolean).pop() || "";
            if (fromPath && /\.[a-z0-9]{2,6}$/i.test(fromPath)) return fromPath;
            const params = u.searchParams;
            const keys = ["nomearquivo", "nome_arquivo", "filename", "file", "arquivo", "nome"];
            for (const key of keys) {
                const value = params.get(key);
                if (value && String(value).trim()) return String(value).trim();
            }
        } catch (_) {}
        return "";
    }

    function getMovementNumberFromRow(row) {
        if (!row || !row.querySelector) return "";
        const firstCell = row.querySelector("td.colunaMinima, td");
        if (!firstCell) return "";
        const raw = String(firstCell.textContent || "").replace(/\s+/g, " ").trim();
        if (!raw) return "";
        const match = raw.match(/\d+/);
        return match ? match[0] : "";
    }

    function getMovementLabel(anchor) {
        if (!anchor || !anchor.closest) return "";
        let row = anchor.closest("tr");
        while (row) {
            if (row.matches && row.matches("tr[movi_codigo]")) {
                const number = getMovementNumberFromRow(row);
                if (number) return `Mov. ${number}`;
            }
            row = row.previousElementSibling;
        }

        const nestedHost = anchor.closest("td[id^='pai_']");
        if (!nestedHost) return "";
        const holderRow = nestedHost.closest("tr[id^='linha_']");
        if (!holderRow) return "";
        let prev = holderRow.previousElementSibling;
        while (prev) {
            if (prev.matches && prev.matches("tr[movi_codigo]")) {
                const number = getMovementNumberFromRow(prev);
                if (number) return `Mov. ${number}`;
                break;
            }
            prev = prev.previousElementSibling;
        }
        return "";
    }

    function getFileOrderLabel(anchor) {
        const parseOrder = (value) => {
            const raw = String(value || "")
                .replace(/\u00A0/g, " ")
                .replace(/\s+/g, " ")
                .trim();
            if (!raw) return "";
            if (/[:/]/.test(raw)) return "";
            const exact = raw.match(/^(\d{1,4})$/);
            if (exact) return exact[1];
            const prefixed = raw.match(/^(\d{1,4})\s*[-–.)]?\s*$/);
            if (prefixed) return prefixed[1];
            return "";
        };

        if (anchor && anchor.closest) {
            const li = anchor.closest("li");
            if (li) {
                const blocks = Array.from(li.querySelectorAll("div, span"));
                for (let i = 0; i < blocks.length; i += 1) {
                    const el = blocks[i];
                    const hint = `${String(el.getAttribute("title") || "")} ${String(el.getAttribute("alt") || "")}`.toLowerCase();
                    if (hint && !/arquiv/.test(hint)) continue;
                    const number = parseOrder(el.textContent);
                    if (number) return `Arq. ${number}`;
                }
            }
        }

        const row = anchor && anchor.closest ? anchor.closest("tr") : null;
        if (!row) return "";
        const anchorCell = anchor.closest ? anchor.closest("td") : null;
        const cells = Array.from(row.children).filter((el) => (el.tagName || "").toUpperCase() === "TD");
        if (!cells.length) return "";
        const anchorCellIndex = anchorCell ? cells.indexOf(anchorCell) : -1;
        const scanLimit = anchorCellIndex > 0 ? anchorCellIndex : cells.length;
        const scope = cells.slice(0, scanLimit);
        const ordered = [
            ...scope.filter((cell) => cell.classList && cell.classList.contains("colunaMinima")),
            ...scope.filter((cell) => !(cell.classList && cell.classList.contains("colunaMinima")))
        ];

        for (let i = 0; i < ordered.length; i += 1) {
            const cell = ordered[i];
            const number = parseOrder(cell.textContent);
            if (number) return `Arq. ${number}`;
        }
        return "";
    }

    function getFilenameFromTooltip(rawTitle) {
        const full = String(rawTitle || "").trim();
        if (!full) return "";
        const lines = full.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
        for (const line of lines) {
            const m = line.match(/([a-z0-9._-]+\.[a-z0-9]{2,8})/i);
            if (m && m[1]) return m[1];
        }
        const first = lines[0] || "";
        return first;
    }

    function getPopupTitleMeta(anchor, url) {
        const movement = getMovementLabel(anchor);
        const fileOrder = getFileOrderLabel(anchor);
        const prefix = [movement, fileOrder].filter(Boolean).join(" • ");
        const titleAttr = String(anchor.getAttribute("title") || "").trim();
        const fromTooltip = getFilenameFromTooltip(titleAttr);
        if (fromTooltip) return { fullTitle: prefix ? `${prefix} • ${fromTooltip}` : fromTooltip, dockTitle: prefix || "Arquivo" };
        const fromUrl = getFilenameFromUrl(url);
        if (fromUrl) return { fullTitle: prefix ? `${prefix} • ${fromUrl}` : fromUrl, dockTitle: prefix || "Arquivo" };
        if (titleAttr && /\.[a-z0-9]{2,6}$/i.test(titleAttr)) return { fullTitle: prefix ? `${prefix} • ${titleAttr}` : titleAttr, dockTitle: prefix || "Arquivo" };
        const text = String(anchor.textContent || "").trim();
        if (text) return { fullTitle: prefix ? `${prefix} • ${text}` : text, dockTitle: prefix || "Arquivo" };
        return { fullTitle: prefix ? `${prefix} • Arquivo do processo` : "Arquivo do processo", dockTitle: prefix || "Arquivo" };
    }

    function createPopupWindow(doc, url, title, dockTitle) {
        popupWindowCounter += 1;
        const popupId = `pj-popup-${popupWindowCounter}`;
        const popupSize = sanitizePopupSize(settings.popupSizePercent);

        const panel = doc.createElement("div");
        panel.id = popupId;
        panel.style.cssText = [
            "position:fixed",
            "top:50%",
            "left:50%",
            "transform:translate(-50%,-50%)",
            `width:min(${popupSize}vw, calc(100vw - 20px))`,
            `height:min(${popupSize}vh, calc(100vh - 20px))`,
            "z-index:2147483647",
            "display:flex",
            "flex-direction:column",
            "background:#fff",
            "border:1px solid #dbe3ef",
            "border-radius:12px",
            "box-shadow:0 24px 70px rgba(2,6,23,.30)",
            "overflow:hidden",
            "overscroll-behavior:contain"
        ].join(";");

        const head = doc.createElement("div");
        head.style.cssText = [
            "height:42px",
            "padding:0 10px",
            "display:flex",
            "align-items:center",
            "justify-content:space-between",
            "gap:10px",
            "background:linear-gradient(135deg,#0f3e75,#1f5ca4)",
            "color:#fff",
            "font:500 13px/1.2 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Arial,sans-serif"
        ].join(";");

        const titleEl = doc.createElement("div");
        titleEl.style.cssText = [
            "min-width:0",
            "flex:1",
            "line-height:1.2",
            "white-space:nowrap",
            "overflow:hidden",
            "text-overflow:ellipsis"
        ].join(";");
        titleEl.textContent = title || "Arquivo do processo";
        titleEl.title = title || "Arquivo do processo";

        const actions = doc.createElement("div");
        actions.style.cssText = "display:flex; gap:8px; align-items:center; flex:none;";

        const minBtn = doc.createElement("button");
        minBtn.type = "button";
        minBtn.textContent = "—";
        minBtn.style.cssText = "width:28px; height:28px; border:0; border-radius:999px; background:rgba(255,255,255,.2); color:#fff; cursor:pointer;";

        const closeBtn = doc.createElement("button");
        closeBtn.type = "button";
        closeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        closeBtn.style.cssText = "width:28px; height:28px; border:0; border-radius:999px; background:rgba(255,255,255,.2); color:#fff; cursor:pointer;";

        actions.appendChild(minBtn);
        actions.appendChild(closeBtn);
        head.appendChild(titleEl);
        head.appendChild(actions);

        const body = doc.createElement("div");
        body.style.cssText = "flex:1; min-height:0; background:#fff; overflow:hidden; overscroll-behavior:contain;";
        const content = buildPopupContent(url, doc);
        body.appendChild(content);

        ensurePopupBackdrop(doc);
        panel.appendChild(head);
        panel.appendChild(body);
        (doc.body || doc.documentElement).appendChild(panel);
        renderFontAwesome(panel);

        ensurePopupDock(doc);
        ensurePopupPrintHandler(doc);

        const state = {
            id: popupId,
            title: title || "Arquivo",
            dockTitle: dockTitle || title || "Arquivo",
            url: String(url || ""),
            panel,
            contentEl: content,
            minimized: false,
            restore: null,
            close: null
        };
        popupWindows.set(popupId, state);
        popupActiveId = popupId;

        const minimize = () => {
            state.minimized = true;
            panel.style.display = "none";
            updatePopupDockVisibility();
            updatePopupBodyScrollLock();
        };

        const restore = () => {
            state.minimized = false;
            panel.style.display = "flex";
            popupActiveId = popupId;
            updatePopupDockVisibility();
            updatePopupBodyScrollLock();
            refreshPopupViewportAfterRestore(state);
        };

        const close = () => {
            try {
                panel.remove();
            } catch (_) {}
            popupWindows.delete(popupId);
            if (popupActiveId === popupId) popupActiveId = null;
            updatePopupDockVisibility();
            updatePopupBodyScrollLock();
            if (!popupWindows.size && popupDock) {
                try {
                    popupDock.remove();
                } catch (_) {}
                popupDock = null;
                popupDockToggle = null;
                popupDockMenu = null;
            }
        };

        state.restore = restore;
        state.close = close;

        minBtn.addEventListener("click", minimize);
        closeBtn.addEventListener("click", close);
        panel.addEventListener("mousedown", () => {
            popupActiveId = popupId;
        }, true);

        updatePopupDockVisibility();
        updatePopupBodyScrollLock();
    }

    function findPopupByUrlOrTitle(url, title) {
        const normalized = String(url).trim();
        const normalizedTitle = String(title || "").trim();
        if (!normalized && !normalizedTitle) return null;
        for (const state of popupWindows.values()) {
            const stateUrl = String(state.url || "").trim();
            const stateTitle = String(state.title || "").trim();
            if (normalized && stateUrl === normalized) return state;
            if (normalizedTitle && stateTitle && stateTitle === normalizedTitle) return state;
        }
        return null;
    }

    function openProcessFilePopup(url, titleMeta, sourceDoc) {
        if (!url) return;
        const normalized = String(url).trim();
        const normalizedTitle = String((titleMeta && titleMeta.fullTitle) || "").trim();
        const normalizedDockTitle = String((titleMeta && titleMeta.dockTitle) || "").trim();
        const existing = findPopupByUrlOrTitle(normalized, normalizedTitle);
        if (existing) {
            existing.restore();
            return;
        }
        const { hostDoc } = ensurePopupHost(sourceDoc || document);
        createPopupWindow(hostDoc, normalized, normalizedTitle || "Arquivo", normalizedDockTitle || normalizedTitle || "Arquivo");
    }

    function hookProcessFilePopupInDoc(doc) {
        if (!doc || popupHookedDoc === doc) return;

        if (popupHookCleanup) {
            popupHookCleanup();
            popupHookCleanup = null;
        }

        const onClickCapture = (event) => {
            if (event.defaultPrevented) return;
            if (event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const anchor = event.target && event.target.closest ? event.target.closest("a") : null;
            if (!anchor) return;
            if (!shouldHandleProcessFileLink(anchor, doc)) return;

            const url = getPopupFileUrl(anchor, doc);
            if (!url) return;

            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

            const titleMeta = getPopupTitleMeta(anchor, url);
            openProcessFilePopup(url, titleMeta, doc);
        };

        doc.addEventListener("click", onClickCapture, true);
        popupHookedDoc = doc;
        popupHookCleanup = () => {
            try {
                doc.removeEventListener("click", onClickCapture, true);
            } catch (_) {}
            if (popupHookedDoc === doc) popupHookedDoc = null;
        };
    }

    function syncProcessPopupModeForDoc(doc) {
        const targetDoc = doc || document;
        const canUsePopup = settings.enabled && settings.openProcessFilesInPopup;
        const hasProcessTable = !!(targetDoc && targetDoc.getElementById && targetDoc.getElementById("TabelaArquivos"));
        if (!canUsePopup) {
            if (popupHookCleanup) popupHookCleanup();
            removeProcessPopupUi();
            return;
        }
        if (hasProcessTable) {
            hookProcessFilePopupInDoc(targetDoc);
            return;
        }
        if (isInitialUserHomeDoc(targetDoc)) {
            if (popupHookCleanup) popupHookCleanup();
            removeProcessPopupUi();
        }
    }

    function hasRelevantProcessPopupNode(nodes) {
        return Array.from(nodes || []).some(node => {
            if (!node || node.nodeType !== 1) return false;
            if (node.id === "TabelaArquivos" || node.id === "tabListaProcesso") return true;
            if (node.matches?.("#TabelaArquivos, #tabListaProcesso")) return true;
            if (node.querySelector?.("#TabelaArquivos, #tabListaProcesso")) return true;
            return false;
        });
    }

    function isInitialUserHomeDoc(doc) {
        if (!doc) return false;
        let pathname = "";
        let search = "";
        try {
            const loc = doc.location;
            pathname = (loc && loc.pathname) || "";
            search = (loc && loc.search) || "";
        } catch (_) {
            return false;
        }

        if (!/\/Usuario\b/i.test(pathname)) return false;
        const params = new URLSearchParams(search || "");
        const paginaAtual = params.get("PaginaAtual");
        return paginaAtual === "-10" || paginaAtual === "10";
    }

    function getIframeContextDoc() {
        const iframe = document.getElementById("Principal");
        if (!iframe) return null;
        try {
            return iframe.contentDocument || null;
        } catch (_) {
            return null;
        }
    }

    /**
     * Sincroniza a captura de arquivos do processo com o documento atual do iframe.
     * @returns {void}
     */
    function syncPopupModeFromIframeContext() {
        if (!isTopWindow()) return;
        const iframeDoc = getIframeContextDoc();
        if (iframeDoc) {
            bindPopupContextObserver(iframeDoc);
            syncProcessPopupModeForDoc(iframeDoc);
            return;
        }
        stopPopupContextObserver();
        syncProcessPopupModeForDoc(document);
    }

    function stopPopupContextObserver() {
        if (popupContextObserver) {
            popupContextObserver.disconnect();
            popupContextObserver = null;
        }
        popupContextObservedDoc = null;
        popupContextSyncScheduled = false;
    }

    function schedulePopupContextSync() {
        if (popupContextSyncScheduled) return;
        popupContextSyncScheduled = true;
        requestAnimationFrame(() => {
            popupContextSyncScheduled = false;
            syncPopupModeFromIframeContext();
        });
    }

    /**
     * Observa apenas mutações relevantes da área de arquivos do processo.
     * @param {Document} doc
     * @returns {void}
     */
    function bindPopupContextObserver(doc) {
        if (!isTopWindow()) return;
        if (!doc || !doc.body) {
            stopPopupContextObserver();
            return;
        }
        if (popupContextObservedDoc === doc && popupContextObserver) return;
        stopPopupContextObserver();
        popupContextObservedDoc = doc;
        popupContextObserver = new MutationObserver(mutations => {
            if (!settings.enabled || !settings.openProcessFilesInPopup) return;
            if (!mutations.some(m => hasRelevantProcessPopupNode(m.addedNodes) || hasRelevantProcessPopupNode(m.removedNodes))) return;
            schedulePopupContextSync();
        });
        popupContextObserver.observe(doc.body, { childList: true, subtree: true });
    }

    function canInjectIntoDoc(doc) {
        const html = doc.documentElement;
        const body = doc.body;
        return !(
            (html && html.hasAttribute(OPTOUT_ATTR)) ||
            (body && body.hasAttribute(OPTOUT_ATTR))
        );
    }

    /**
     * Injeta o CSS mínimo necessário para largura, tipografia e modo compacto.
     * @param {Document} doc
     * @returns {void}
     */
    function syncGoogleFont(doc) {
        if (!doc || !doc.head) return;
        const id = "projudi-google-font-link";
        const family = sanitizeGoogleFontFamily(settings.googleFontFamily);
        let link = doc.getElementById(id);
        if (!settings.googleFontEnabled || !family) {
            if (link) link.remove();
            return;
        }
        const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`;
        if (!link) {
            link = doc.createElement("link");
            link.id = id;
            link.rel = "stylesheet";
            doc.head.appendChild(link);
        }
        if (link.href !== href) link.href = href;
    }

    function syncServentiaSelectionContext(doc) {
        if (!doc || !doc.documentElement) return false;
        let routeMatches = false;
        try {
            const url = new URL(doc.defaultView?.location?.href || window.location.href);
            routeMatches = /\/Usuario\b/i.test(url.pathname) && url.searchParams.get("PaginaAtual") === "9";
        } catch (_) {
            routeMatches = false;
        }
        const heading = normalizeLabel(doc.querySelector("#divCorpo > h2, .divCorpo > h2, h2")?.textContent);
        const contentMatches = heading.includes("serventias disponiveis");
        const matches = routeMatches || contentMatches;
        doc.documentElement.toggleAttribute("data-pjc-serventia-selection", matches);
        return matches;
    }

    function syncModernTableSemantics(doc) {
        if (!doc) return;
        doc.querySelectorAll('[data-pjc-column-kind="quantity"]').forEach(cell => {
            cell.removeAttribute("data-pjc-column-kind");
        });
        if (!settings.modernTablesEnabled) return;
        doc.querySelectorAll("table tr:first-child > th, table tr:first-child > td").forEach(cell => {
            if (normalizeLabel(cell.textContent) === "qtde") {
                cell.setAttribute("data-pjc-column-kind", "quantity");
            }
        });
    }

    function injectWidthCSS(doc) {
        if (!settings.enabled || !doc || !doc.head || !canInjectIntoDoc(doc)) return;
        syncGoogleFont(doc);
        syncServentiaSelectionContext(doc);
        syncModernTableSemantics(doc);
        const widthEnabled = !!settings.enableWidthAdjustments;
        const widthPercent = widthEnabled ? sanitizeWidthPercent(settings.contentWidthPercent) : 100;
        const widthValue = widthPercent + "%";
        const centeredMargins = settings.centerContent && widthPercent < 100 ? "auto" : "0";
        const pageBg =
            widthEnabled && settings.sideBackgroundEnabled && settings.sideBackground === "white"
                ? "#ffffff"
                : widthEnabled && settings.sideBackgroundEnabled && settings.sideBackground === "light"
                    ? "#f3f4f6"
                    : "";
        const scaledFontPx = Math.round(BASE_CONTENT_FONT_PX * sanitizeFontScale(settings.fontScalePercent) / 100 * 10) / 10;
        const fontScaleCss = settings.fontScaleEnabled
            ? `
                body,
                :where(table, td, th, label, input, select, textarea, button):not([data-pj-suite-ui] *) {
                    font-size: ${scaledFontPx}px !important;
                }
            `
            : "";
        const googleFontCss = settings.googleFontEnabled && settings.googleFontFamily
            ? `
                body :where(p, li, td, th, label, input, select, textarea, h1, h2, h3, h4, h5, h6):not([data-pj-suite-ui] *) {
                    font-family: "${settings.googleFontFamily}", sans-serif !important;
                }
            `
            : "";
        const compactCss = settings.compactMode
            ? `
                table:not([data-pj-suite-ui] *) { border-spacing: 0 !important; }
                table:not(.pjip-table):not([data-pj-suite-ui] *) td,
                table:not(.pjip-table):not([data-pj-suite-ui] *) th {
                    padding-top: 2px !important;
                    padding-bottom: 2px !important;
                    line-height: 1.15 !important;
                }
                table.Tabela:not(.pjip-table) td,
                table.Tabela:not(.pjip-table) th,
                .Tabela table:not(.pjip-table) td,
                .Tabela table:not(.pjip-table) th {
                    padding-top: 2px !important;
                    padding-bottom: 2px !important;
                    line-height: 1.15 !important;
                }
                table:not(.pjip-table):not([data-pj-suite-ui] *) tr { line-height: 1.15 !important; }
                #divCorpo, .divCorpo, #Corpo, #conteudo, #conteudoPrincipal, #pgn_corpo, #Formulario, .Tela, .Corpo, .conteudo {
                    padding-top: 4px !important;
                }
                :where(h1, h2, h3, h4, h5, h6):not([data-pj-suite-ui] *) { margin-top: 4px !important; margin-bottom: 4px !important; }
                p:not([data-pj-suite-ui] *) { margin-top: 4px !important; margin-bottom: 4px !important; }
            `
            : "";
        let isIframeDocument = false;
        try {
            isIframeDocument = !!doc.defaultView && doc.defaultView !== doc.defaultView.top;
        } catch (_) {
            isIframeDocument = true;
        }
        const customHeaderIframeClearanceCss = settings.customHeaderEnabled && isIframeDocument
            ? `
                body {
                    box-sizing: border-box !important;
                    padding-top: 16px !important;
                    scroll-padding-top: 16px !important;
                }
                body > .area,
                #divCorpo > .area:first-child,
                .divCorpo > .area:first-child,
                body > h2.area:first-of-type {
                    margin-top: 0 !important;
                }
            `
            : "";

        const modernVisualCss = settings.modernVisualEnabled ? `
            :root {
                --pj-ui-primary: #174f86;
                --pj-ui-primary-soft: #e8f1fa;
                --pj-ui-text: #172033;
                --pj-ui-muted: #5c6b7d;
                --pj-ui-border: #d7e1ec;
                --pj-ui-surface: #ffffff;
                --pj-ui-canvas: #eef3f8;
                --pj-ui-radius: 10px;
                --pj-ui-shadow: 0 4px 16px rgba(15, 45, 78, .08);
            }
            body {
                background: var(--pj-ui-canvas) !important;
                color: var(--pj-ui-text) !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
                font-size: ${settings.fontScaleEnabled ? scaledFontPx : BASE_CONTENT_FONT_PX}px !important;
                line-height: 1.48 !important;
            }
            :where(table, td, th, label, input, select, textarea, button):not([data-pj-suite-ui] *) {
                font-size: ${settings.fontScaleEnabled ? scaledFontPx : BASE_CONTENT_FONT_PX}px !important;
            }
            #divCorpo, .divCorpo, #Corpo, #conteudo, #conteudoPrincipal,
            #pgn_corpo, #Formulario, .Tela, .Corpo, .conteudo, #content,
            #container, #principal, .container, .wrapper, .main {
                background: var(--pj-ui-surface) !important;
                border-color: var(--pj-ui-border) !important;
            }
            fieldset {
                border: 1px solid var(--pj-ui-border) !important;
                border-radius: var(--pj-ui-radius) !important;
            }
            body > fieldset,
            #divCorpo > fieldset,
            .divCorpo > fieldset,
            #Corpo > fieldset,
            #Formulario > fieldset {
                background: var(--pj-ui-surface) !important;
                box-shadow: var(--pj-ui-shadow) !important;
            }
            legend {
                padding: 3px 9px !important;
                border-radius: 5px !important;
                color: var(--pj-ui-primary) !important;
                font-weight: 700 !important;
            }
            h1, h2, h3, h4, h5, h6,
            .titulo, .Titulo, .tituloTela, .tituloPagina {
                color: var(--pj-ui-primary) !important;
                letter-spacing: -.01em !important;
            }
            #abas > .ui-tabs-nav,
            .abas > .ui-tabs-nav,
            .ui-tabs > .ui-tabs-nav,
            [role="tablist"] {
                border-color: var(--pj-ui-border) !important;
                background: #f8fafc !important;
            }
            #abas > .ui-tabs-nav > li > a,
            .abas > .ui-tabs-nav > li > a,
            .ui-tabs > .ui-tabs-nav > li > a,
            [role="tablist"] > [role="tab"],
            [role="tablist"] > [role="tab"] > a {
                border-radius: 7px 7px 0 0 !important;
                color: #334155 !important;
                font-weight: 600 !important;
                text-decoration: none !important;
            }
            #abas > .ui-tabs-nav > li:not(.ui-tabs-active):not(.ui-tabs-selected) > a:hover,
            .abas > .ui-tabs-nav > li:not(.ui-tabs-active):not(.ui-tabs-selected) > a:hover,
            .ui-tabs > .ui-tabs-nav > li:not(.ui-tabs-active):not(.ui-tabs-selected) > a:hover,
            [role="tablist"] > [role="tab"]:not([aria-selected="true"]):hover,
            [role="tablist"] > [role="tab"]:not([aria-selected="true"]) > a:hover {
                background: var(--pj-ui-primary-soft) !important;
                color: var(--pj-ui-primary) !important;
            }
            #abas > .ui-tabs-nav > li.ui-tabs-active > a,
            #abas > .ui-tabs-nav > li.ui-tabs-selected > a,
            .abas > .ui-tabs-nav > li.ui-tabs-active > a,
            .abas > .ui-tabs-nav > li.ui-tabs-selected > a,
            .ui-tabs > .ui-tabs-nav > li.ui-tabs-active > a,
            .ui-tabs > .ui-tabs-nav > li.ui-tabs-selected > a,
            [role="tablist"] > [role="tab"][aria-selected="true"],
            [role="tablist"] > [role="tab"][aria-selected="true"] > a {
                background: var(--pj-ui-primary) !important;
                color: #ffffff !important;
                text-shadow: 0 1px 1px rgba(0, 0, 0, .18) !important;
            }
            a {
                text-underline-offset: 2px;
            }
            hr {
                border: 0 !important;
                border-top: 1px solid var(--pj-ui-border) !important;
            }
            html[data-pjc-serventia-selection] body {
                min-height: 100vh !important;
                background: var(--pj-ui-canvas) !important;
            }
            html[data-pjc-serventia-selection] body > div[style*="background-color"][style*="#ccc"][style*="height:28px"] {
                display: none !important;
            }
            html[data-pjc-serventia-selection] #divCorpo,
            html[data-pjc-serventia-selection] .divCorpo {
                padding: 24px 6px 40px !important;
                border: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            html[data-pjc-serventia-selection] body > h2 {
                width: ${widthEnabled ? widthValue : "min(1180px, calc(100% - 32px))"} !important;
                max-width: ${widthEnabled ? widthValue : "1180px"} !important;
                margin-left: ${widthEnabled ? centeredMargins : "auto"} !important;
                margin-right: ${widthEnabled ? centeredMargins : "auto"} !important;
                box-sizing: border-box !important;
            }
            html[data-pjc-serventia-selection] #divCorpo > h2,
            html[data-pjc-serventia-selection] .divCorpo > h2,
            html[data-pjc-serventia-selection] body > h2 {
                margin-top: 0 !important;
                margin-bottom: 18px !important;
                padding: 0 2px 12px !important;
                border-bottom: 1px solid var(--pj-ui-border) !important;
                color: var(--pj-ui-primary) !important;
                font-size: 18px !important;
                font-weight: 750 !important;
                line-height: 1.25 !important;
            }
            html[data-pjc-serventia-selection] body > fieldset {
                width: ${widthEnabled ? widthValue : "min(1180px, calc(100% - 32px))"} !important;
                max-width: ${widthEnabled ? widthValue : "1180px"} !important;
                margin-left: ${widthEnabled ? centeredMargins : "auto"} !important;
                margin-right: ${widthEnabled ? centeredMargins : "auto"} !important;
                box-sizing: border-box !important;
            }
            html[data-pjc-serventia-selection] #divCorpo > fieldset,
            html[data-pjc-serventia-selection] .divCorpo > fieldset,
            html[data-pjc-serventia-selection] body > fieldset {
                margin-top: 0 !important;
                margin-bottom: 14px !important;
                padding: 14px 18px 16px !important;
                border: 1px solid var(--pj-ui-border) !important;
                border-left: 4px solid #2d79b3 !important;
                border-radius: 10px !important;
                background: var(--pj-ui-surface) !important;
                box-shadow: 0 4px 14px rgba(15, 45, 78, .07) !important;
                transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease !important;
            }
            html[data-pjc-serventia-selection] #divCorpo > fieldset:hover,
            html[data-pjc-serventia-selection] #divCorpo > fieldset:focus-within,
            html[data-pjc-serventia-selection] .divCorpo > fieldset:hover,
            html[data-pjc-serventia-selection] .divCorpo > fieldset:focus-within,
            html[data-pjc-serventia-selection] body > fieldset:hover,
            html[data-pjc-serventia-selection] body > fieldset:focus-within {
                border-color: #a9c8df !important;
                border-left-color: #176fa6 !important;
                box-shadow: 0 8px 22px rgba(15, 45, 78, .11) !important;
                transform: translateY(-1px) !important;
            }
            html[data-pjc-serventia-selection] #divCorpo > fieldset > legend,
            html[data-pjc-serventia-selection] .divCorpo > fieldset > legend,
            html[data-pjc-serventia-selection] body > fieldset > legend {
                max-width: calc(100% - 20px) !important;
                padding: 3px 8px !important;
                border: 0 !important;
                background: var(--pj-ui-primary-soft) !important;
                color: #174f86 !important;
                font-size: 12.5px !important;
                font-weight: 750 !important;
                line-height: 1.35 !important;
                white-space: normal !important;
            }
            html[data-pjc-serventia-selection] #divCorpo > fieldset a,
            html[data-pjc-serventia-selection] .divCorpo > fieldset a,
            html[data-pjc-serventia-selection] body > fieldset a {
                display: inline-flex !important;
                align-items: center !important;
                min-height: 30px !important;
                margin-top: 2px !important;
                padding: 2px 8px !important;
                border-radius: 7px !important;
                color: #176fa6 !important;
                font-weight: 700 !important;
                text-decoration: none !important;
            }
            html[data-pjc-serventia-selection] #divCorpo > fieldset a:hover,
            html[data-pjc-serventia-selection] #divCorpo > fieldset a:focus-visible,
            html[data-pjc-serventia-selection] .divCorpo > fieldset a:hover,
            html[data-pjc-serventia-selection] .divCorpo > fieldset a:focus-visible,
            html[data-pjc-serventia-selection] body > fieldset a:hover,
            html[data-pjc-serventia-selection] body > fieldset a:focus-visible {
                background: var(--pj-ui-primary-soft) !important;
                color: #0b5d91 !important;
            }
        ` : "";

        const modernTablesCss = settings.modernTablesEnabled ? `
            table.Tabela:not(.pjip-table), table#Tabela:not(.pjip-table),
            .Tabela table:not(.pjip-table), .divTabela table:not(.pjip-table),
            #TabelaArquivos:not(.pjip-table), table.lista:not(.pjip-table),
            table.listagem:not(.pjip-table) {
                overflow: ${settings.stickyTableHeadersEnabled ? "visible" : "hidden"} !important;
                border: 1px solid #d7e1ec !important;
                border-collapse: separate !important;
                border-spacing: 0 !important;
                border-radius: 9px !important;
                background: #fff !important;
                box-shadow: 0 3px 12px rgba(15, 45, 78, .07) !important;
            }
            table.Tabela:not(.pjip-table) th, table#Tabela:not(.pjip-table) th,
            .Tabela table:not(.pjip-table) th, .divTabela table:not(.pjip-table) th,
            #TabelaArquivos:not(.pjip-table) th, table.lista:not(.pjip-table) th,
            table.listagem:not(.pjip-table) th,
            table:not(.pjip-table) tr.fundoCabecalhoTabela > td,
            table:not(.pjip-table) tr.tituloTabela > td {
                padding: 8px 9px !important;
                border-color: #c9d8e8 !important;
                background: #e8f1fa !important;
                color: #173f69 !important;
                font-weight: 700 !important;
                line-height: 1.25 !important;
                height: auto !important;
                vertical-align: middle !important;
            }
            table:not(.pjip-table) th[align="center"],
            table:not(.pjip-table) tr.fundoCabecalhoTabela > td[align="center"],
            table:not(.pjip-table) tr.tituloTabela > td[align="center"] {
                text-align: center !important;
            }
            table:not(.pjip-table) th[align="right"],
            table:not(.pjip-table) tr.fundoCabecalhoTabela > td[align="right"],
            table:not(.pjip-table) tr.tituloTabela > td[align="right"] {
                text-align: right !important;
            }
            table :is(th, td)[data-pjc-column-kind="quantity"] {
                text-align: center !important;
            }
            table.Tabela:not(.pjip-table) td, table#Tabela:not(.pjip-table) td,
            .Tabela table:not(.pjip-table) td, .divTabela table:not(.pjip-table) td,
            #TabelaArquivos:not(.pjip-table) td, table.lista:not(.pjip-table) td,
            table.listagem:not(.pjip-table) td {
                padding: 7px 9px !important;
                border-color: #e3eaf2 !important;
                transition: background-color .12s ease !important;
            }
            table.Tabela:not(.pjip-table) > thead:first-child > tr:first-child > :first-child,
            table#Tabela:not(.pjip-table) > thead:first-child > tr:first-child > :first-child,
            table:not(.pjip-table) > tbody:first-child > tr.fundoCabecalhoTabela:first-child > :first-child {
                border-top-left-radius: 8px !important;
            }
            table.Tabela:not(.pjip-table) > thead:first-child > tr:first-child > :last-child,
            table#Tabela:not(.pjip-table) > thead:first-child > tr:first-child > :last-child,
            table:not(.pjip-table) > tbody:first-child > tr.fundoCabecalhoTabela:first-child > :last-child {
                border-top-right-radius: 8px !important;
            }
            table.Tabela:not(.pjip-table) > tbody:last-child > tr:last-child > :first-child,
            table#Tabela:not(.pjip-table) > tbody:last-child > tr:last-child > :first-child { border-bottom-left-radius: 8px !important; }
            table.Tabela:not(.pjip-table) > tbody:last-child > tr:last-child > :last-child,
            table#Tabela:not(.pjip-table) > tbody:last-child > tr:last-child > :last-child { border-bottom-right-radius: 8px !important; }
            table.Tabela:not(.pjip-table) tbody tr:nth-child(even):not([data-phm-styled]):not([style*="background"]) > td,
            table#Tabela:not(.pjip-table) tbody tr:nth-child(even):not([data-phm-styled]):not([style*="background"]) > td,
            .Tabela table:not(.pjip-table) tbody tr:nth-child(even):not([data-phm-styled]):not([style*="background"]) > td,
            .divTabela table:not(.pjip-table) tbody tr:nth-child(even):not([data-phm-styled]):not([style*="background"]) > td,
            #TabelaArquivos:not(.pjip-table) tbody tr:nth-child(even):not([data-phm-styled]):not([style*="background"]) > td,
            table.lista:not(.pjip-table) tbody tr:nth-child(even):not([data-phm-styled]):not([style*="background"]) > td,
            table.listagem:not(.pjip-table) tbody tr:nth-child(even):not([data-phm-styled]):not([style*="background"]) > td {
                background-color: #f8fafc !important;
            }
        ` : "";

        const modernFormsCss = settings.modernFormsEnabled ? `
            input:not([type="image"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([data-pj-suite-ui] *),
            select:not([data-pj-suite-ui] *), textarea:not([data-pj-suite-ui] *) {
                min-height: 32px !important;
                padding: 5px 8px !important;
                border: 1px solid #b9c8d8 !important;
                border-radius: 7px !important;
                background: #fff !important;
                color: #172033 !important;
                box-shadow: inset 0 1px 2px rgba(15, 45, 78, .05) !important;
                box-sizing: border-box !important;
            }
            textarea:not([data-pj-suite-ui] *) { min-height: 72px !important; }
            input:not([type="image"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([data-pj-suite-ui] *):focus,
            select:not([data-pj-suite-ui] *):focus, textarea:not([data-pj-suite-ui] *):focus,
            button:not([data-pj-suite-ui] *):focus-visible, a:not([data-pj-suite-ui] *):focus-visible {
                outline: 3px solid rgba(30, 103, 173, .22) !important;
                outline-offset: 1px !important;
                border-color: #1e67ad !important;
            }
            input:disabled:not([type="button"]):not([type="submit"]):not([type="reset"]):not([data-pj-suite-ui] *),
            select:not([data-pj-suite-ui] *):disabled, textarea:not([data-pj-suite-ui] *):disabled {
                cursor: not-allowed !important;
                opacity: .62 !important;
            }
        ` : "";

        const stickyActionsCss = settings.stickyActionsEnabled ? `
            #abas > .ui-tabs-nav,
            .abas > .ui-tabs-nav,
            .ui-tabs > .ui-tabs-nav {
                position: sticky !important;
                top: 0 !important;
                z-index: 900 !important;
                padding-top: 5px !important;
                padding-bottom: 5px !important;
                background-color: rgba(255, 255, 255, .96) !important;
                box-shadow: 0 4px 10px rgba(15, 45, 78, .08) !important;
                backdrop-filter: blur(7px) !important;
                -webkit-backdrop-filter: blur(7px) !important;
            }
        ` : "";

        const stickyTableHeadersCss = settings.stickyTableHeadersEnabled ? `
            table.Tabela:not(.pjip-table) > thead > tr > th,
            table.Tabela:not(.pjip-table) > thead > tr > td,
            table#Tabela:not(.pjip-table) > thead > tr > th,
            table#Tabela:not(.pjip-table) > thead > tr > td,
            #TabelaArquivos:not(.pjip-table) > thead > tr > th,
            #TabelaArquivos:not(.pjip-table) > thead > tr > td,
            #tabListaProcesso:not(.pjip-table) > thead > tr > th,
            #tabListaProcesso:not(.pjip-table) > thead > tr > td,
            .Tabela table:not(.pjip-table) > thead > tr > th,
            .Tabela table:not(.pjip-table) > thead > tr > td,
            .divTabela table:not(.pjip-table) > thead > tr > th,
            .divTabela table:not(.pjip-table) > thead > tr > td,
            table.lista:not(.pjip-table) > thead > tr > th,
            table.lista:not(.pjip-table) > thead > tr > td,
            table.listagem:not(.pjip-table) > thead > tr > th,
            table.listagem:not(.pjip-table) > thead > tr > td {
                position: sticky !important;
                top: ${settings.stickyActionsEnabled ? "44px" : "0"} !important;
                z-index: 850 !important;
                box-shadow: 0 2px 0 rgba(15, 62, 117, .16) !important;
            }
        ` : "";

        const highlightHoveredRowCss = settings.highlightHoveredRowEnabled ? `
            table.Tabela:not(.pjip-table) > tbody > tr:hover,
            table#Tabela:not(.pjip-table) > tbody > tr:hover,
            #TabelaArquivos:not(.pjip-table) > tbody > tr:hover,
            #tabListaProcesso:not(.pjip-table) > tbody > tr:hover {
                outline: 1px solid rgba(23, 79, 134, .34) !important;
                outline-offset: -1px !important;
            }
            table.Tabela:not(.pjip-table) > tbody > tr:hover > td:first-child,
            table#Tabela:not(.pjip-table) > tbody > tr:hover > td:first-child,
            #TabelaArquivos:not(.pjip-table) > tbody > tr:hover > td:first-child,
            #tabListaProcesso:not(.pjip-table) > tbody > tr:hover > td:first-child {
                box-shadow: inset 3px 0 0 #1f67a6 !important;
            }
        ` : "";

        const widthLayoutCss = widthEnabled ? `
            html, body {
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 !important;
                box-sizing: border-box !important;
                ${pageBg ? `background-color: ${pageBg} !important;` : ""}
            }

            #divCorpo,
            .divCorpo,
            #Corpo,
            #conteudo,
            #conteudoPrincipal,
            #pgn_corpo,
            .Tela,
            .Corpo,
            .conteudo,
            table[width="980"],
            table[width="1000"] {
                width: ${widthValue} !important;
                max-width: ${widthValue} !important;
                margin-left: ${centeredMargins} !important;
                margin-right: ${centeredMargins} !important;
                box-sizing: border-box !important;
            }

            #Formulario,
            #divEditar,
            .divEditar,
            .VisualizaDados,
            #abas {
                width: 100% !important;
                max-width: 100% !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
                box-sizing: border-box !important;
            }
            table, .Tabela, .divTabela, .divTabela table {
                max-width: 100% !important;
            }

            body > div[style*="width:"][style*="margin"],
            body > table[style*="width:"] {
                width: ${widthValue} !important;
                max-width: ${widthValue} !important;
                margin-left: ${centeredMargins} !important;
                margin-right: ${centeredMargins} !important;
            }
        ` : "";

        const styleId = "projudi-ajuste-largura";
        const hasCssAdjust = widthEnabled || !!settings.customHeaderEnabled ||
            !!settings.compactMode || !!settings.fontScaleEnabled ||
            !!settings.googleFontEnabled ||
            !!settings.modernVisualEnabled || !!settings.modernTablesEnabled ||
            !!settings.modernFormsEnabled || !!settings.stickyActionsEnabled ||
            !!settings.stickyTableHeadersEnabled || !!settings.highlightHoveredRowEnabled;
        if (!hasCssAdjust) {
            removeStyleFromDoc(doc, styleId);
            return;
        }
        let style = doc.getElementById(styleId);

        const css = `
            ${widthLayoutCss}
            ${fontScaleCss}
            ${googleFontCss}
            ${compactCss}
            ${customHeaderIframeClearanceCss}
            ${modernVisualCss}
            ${modernTablesCss}
            ${modernFormsCss}
            ${stickyActionsCss}
            ${stickyTableHeadersCss}
            ${highlightHoveredRowCss}
        `;

        if (!style) {
            style = doc.createElement("style");
            style.id = styleId;
            doc.head.appendChild(style);
        }

        if (style.textContent !== css) style.textContent = css;
    }

    function isPublicLandingPage() {
        if (!isTopWindow()) return false;
        const pathname = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
        return pathname === "/" || /\/(?:index|default)\.(?:html?|jsp)$/i.test(pathname);
    }

    function hasStandaloneVisualFeatures() {
        return !!(
            settings.compactMode ||
            settings.fontScaleEnabled ||
            settings.googleFontEnabled ||
            settings.modernVisualEnabled ||
            settings.modernTablesEnabled ||
            settings.modernFormsEnabled ||
            settings.stickyActionsEnabled ||
            settings.stickyTableHeadersEnabled ||
            settings.highlightHoveredRowEnabled
        );
    }

    function isStandaloneContentPage() {
        if (!isTopWindow()) return false;
        if (document.getElementById("Principal")) return false;
        if (isPublicLandingPage()) return false;
        if (!settings.applyToStandalonePages && !hasStandaloneVisualFeatures()) return false;

        return (
            /\/Usuario\b/i.test(window.location.pathname) ||
            /\/BuscaProcesso\b/i.test(window.location.pathname) ||
            /\bId_Processo=/i.test(window.location.search) ||
            !!document.querySelector(
                "#divCorpo, .divCorpo, #Corpo, #conteudo, #conteudoPrincipal, #pgn_corpo, #Formulario, .Tela, .Corpo, .conteudo"
            )
        );
    }

    function injectCSSInIframe() {
        if (!settings.enabled) return;
        const iframe = document.getElementById("Principal");
        if (!iframe || !iframe.contentDocument) return;

        iframe.style.width = "100%";
        iframe.style.display = "block";

        const iframeDoc = iframe.contentDocument;
        if (!shouldManageIframeFeatures()) {
            removeStyleFromDoc(iframeDoc, "projudi-ajuste-largura");
            syncGoogleFont(iframeDoc);
            removeNoScrollbarStyle(iframeDoc);
            teardownProcessMirrorPdfFeature(iframeDoc);
            return;
        }
        injectWidthCSS(iframeDoc);
        syncNoScrollbarForDoc(iframeDoc);
        if (settings.enableProcessMirrorPdf) initProcessMirrorPdfFeature(iframeDoc);
        else teardownProcessMirrorPdfFeature(iframeDoc);
    }

    function retryInjectInIframe(times = 12, delay = 240) {
        if (!settings.enabled || !shouldManageIframeFeatures()) {
            cancelIframeInjectionRetries();
            return;
        }
        cancelIframeInjectionRetries();
        const runId = iframeRetryRunId;
        let n = 0;
        const tick = () => {
            if (runId !== iframeRetryRunId || !settings.enabled || !shouldManageIframeFeatures()) return;
            injectCSSInIframe();
            ajustarAlturaIframe();
            n += 1;
            if (n < times) rememberTimeout(setTimeout(tick, delay));
        };
        tick();
    }

    function bindIframeLoadListener() {
        if (!shouldManageIframeFeatures()) return;
        const iframe = document.getElementById("Principal");
        if (!iframe) return;
        if (boundIframeEl && boundIframeEl !== iframe) {
            boundIframeEl.removeEventListener("load", onIframeLoad);
            boundIframeEl = null;
        }
        if (boundIframeEl !== iframe) {
            iframe.addEventListener("load", onIframeLoad);
            boundIframeEl = iframe;
        }

        retryInjectInIframe(14, 220);
    }

    function unbindIframeLoadListener() {
        cancelIframeInjectionRetries();
        if (!boundIframeEl) return;
        boundIframeEl.removeEventListener("load", onIframeLoad);
        boundIframeEl = null;
    }

    function scheduleTopDomMaintenance() {
        if (topDomWorkScheduled) return;
        topDomWorkScheduled = true;
        requestAnimationFrame(() => {
            topDomWorkScheduled = false;
            safeRun("Falha ao sincronizar observers do topo.", () => {
                injectTopHeaderCSS();
                bindIframeLoadListener();
                setupHeaderAutoHide();
                ajustarAlturaIframe();
            });
        });
    }

    function mutationTouchesTopShell(mutations) {
        return mutations.some(mutation => {
            if (hasRelevantProcessPopupNode(mutation.addedNodes) || hasRelevantProcessPopupNode(mutation.removedNodes)) return true;
            return Array.from([mutation.target, ...mutation.addedNodes, ...mutation.removedNodes]).some(node => {
                if (!node || node.nodeType !== 1) return false;
                if (node.id === "Principal" || node.id === "Cabecalho" || node.id === "cssmenu") return true;
                if (node.matches?.("#Principal, #Cabecalho, #cssmenu")) return true;
                if (node.querySelector?.("#Principal, #Cabecalho, #cssmenu")) return true;
                return false;
            });
        });
    }

    function watchForIframeAvailability() {
        if (!shouldManageIframeFeatures()) return;
        bindIframeLoadListener();
        setupHeaderAutoHide();

        if (iframeAvailabilityObserver) iframeAvailabilityObserver.disconnect();
        iframeAvailabilityObserver = new MutationObserver(mutations => {
            if (!mutationTouchesTopShell(mutations)) return;
            scheduleTopDomMaintenance();
        });
        iframeAvailabilityObserver.observe(document.body, { childList: true, subtree: true });

        if (!document.getElementById("Principal")) {
            rememberTimeout(setTimeout(bindIframeLoadListener, 500));
            rememberTimeout(setTimeout(bindIframeLoadListener, 1600));
        }
    }

    function scheduleStandaloneRefresh() {
        if (standaloneDomWorkScheduled) return;
        standaloneDomWorkScheduled = true;
        requestAnimationFrame(() => {
            standaloneDomWorkScheduled = false;
            if (settings.enabled && isStandaloneContentPage()) injectWidthCSS(document);
        });
    }

    function hasStandaloneRelevantMutation(mutations) {
        return mutations.some(mutation => {
            return Array.from([mutation.target, ...mutation.addedNodes, ...mutation.removedNodes]).some(node => {
                if (!node || node.nodeType !== 1) return false;
                if (node.id === "Principal") return true;
                if (node.matches?.("#divCorpo, .divCorpo, #Corpo, #conteudo, #conteudoPrincipal, #pgn_corpo, #Formulario, .Tela, .Corpo, .conteudo")) return true;
                if (node.querySelector?.("#Principal, #divCorpo, .divCorpo, #Corpo, #conteudo, #conteudoPrincipal, #pgn_corpo, #Formulario, .Tela, .Corpo, .conteudo")) return true;
                return false;
            });
        });
    }

    /**
     * Mantém ativos apenas os observers necessários para os recursos atualmente habilitados.
     * @returns {void}
     */
    function syncTopObservers() {
        if (iframeAvailabilityObserver) {
            iframeAvailabilityObserver.disconnect();
            iframeAvailabilityObserver = null;
        }
        if (standaloneDomObserver) {
            standaloneDomObserver.disconnect();
            standaloneDomObserver = null;
        }

        if (!settings.enabled) {
            stopPopupContextObserver();
            return;
        }

        if (shouldManageIframeFeatures()) watchForIframeAvailability();
        else unbindIframeLoadListener();

        if ((!settings.applyToStandalonePages && !hasStandaloneVisualFeatures()) ||
            document.getElementById("Principal") ||
            isPublicLandingPage()) return;
        standaloneDomObserver = new MutationObserver(mutations => {
            if (!hasStandaloneRelevantMutation(mutations)) return;
            scheduleStandaloneRefresh();
        });
        standaloneDomObserver.observe(document.body, { childList: true, subtree: true });
    }

    function initTop() {
        safeRun("Falha ao aplicar configurações iniciais do topo.", () => applySettingsNow());

        window.addEventListener("resize", ajustarAlturaIframe, { passive: true });
        syncTopObservers();
    }

    function initInsideFrame() {
        safeRun("Falha ao inicializar customizações dentro do iframe.", () => {
            if (settings.enabled) injectWidthCSS(document);
            syncNoScrollbarForDoc(document);
            syncProcessPopupModeForDoc(document);
        });
    }

    function normalizeText(value) {
        return String(value || "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function removeDiacritics(value) {
        return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function normalizeLabel(value) {
        return removeDiacritics(normalizeText(value)).toLowerCase();
    }

    function isProcessPageDoc(doc) {
        if (!doc) return false;
        return !!(
            doc.getElementById("TabelaArquivos") &&
            doc.getElementById("tabListaProcesso") &&
            doc.getElementById("span_proc_numero")
        );
    }

    function findExistingProcessPdfButton(doc) {
        if (!doc) return null;
        return (
            doc.querySelector("button[title*='Gerar PDF de Processo Completo']") ||
            doc.querySelector("button[alt*='Gerar PDF de Processo Completo']") ||
            doc.querySelector(".divBotoesDireita button .fa-file-pdf")?.closest("button") ||
            null
        );
    }

    function extractNextMeaningfulText(node) {
        if (!node) return "";
        let cursor = node.nextSibling;
        while (cursor) {
            if (cursor.nodeType === 3) {
                const txt = normalizeText(cursor.textContent);
                if (txt) return txt;
            } else if (cursor.nodeType === 1) {
                const tag = (cursor.tagName || "").toUpperCase();
                if (tag === "BR" || tag === "SCRIPT" || tag === "STYLE") {
                    cursor = cursor.nextSibling;
                    continue;
                }
                const txt = normalizeText(cursor.textContent);
                if (txt) return txt;
            }
            cursor = cursor.nextSibling;
        }
        return "";
    }

    function getFieldValueByLabel(fieldset, label) {
        if (!fieldset) return "";
        const normalizedLabel = normalizeLabel(label);
        const candidates = Array.from(fieldset.querySelectorAll("div, span, label"));
        for (const el of candidates) {
            const currentLabel = normalizeLabel(el.textContent);
            if (currentLabel !== normalizedLabel) continue;
            const value = extractNextMeaningfulText(el);
            if (value) return value;
        }
        return "";
    }

    function findFieldsetByLegend(doc, textMatch) {
        if (!doc) return null;
        const normalizedMatch = normalizeLabel(textMatch);
        const fieldsets = Array.from(doc.querySelectorAll("fieldset"));
        for (const fs of fieldsets) {
            const legend = fs.querySelector("legend");
            if (!legend) continue;
            if (normalizeLabel(legend.textContent).includes(normalizedMatch)) return fs;
        }
        return null;
    }

    function extractPartyNames(doc, poloLabel) {
        const fs = findFieldsetByLegend(doc, poloLabel);
        if (!fs) return [];
        const namesFromTitle = Array.from(
            fs.querySelectorAll('[title="Nome da Parte"], [alt="Nome da Parte"]')
        )
            .map(el => normalizeText(el.textContent))
            .filter(Boolean);

        let names = namesFromTitle;
        if (!names.length) {
            const labels = Array.from(fs.querySelectorAll("div, label"))
                .filter(el => normalizeLabel(el.textContent) === "nome");
            names = labels
                .map(label => normalizeText(extractNextMeaningfulText(label)))
                .filter(Boolean);
        }

        if (!names.length) return [];
        const seen = new Set();
        const unique = [];
        names.forEach(name => {
            if (seen.has(name)) return;
            seen.add(name);
            unique.push(name);
        });
        return unique;
    }

    function collectProcessSnapshotData(doc) {
        const processNumber = normalizeText(doc.getElementById("span_proc_numero")?.textContent || "");
        const infoFieldset = findFieldsetByLegend(doc, "Outras Informações");
        const identityContainer = doc.querySelector(".aEsquerda");
        const classe = getFieldValueByLabel(infoFieldset, "Classe");
        const assunto = getFieldValueByLabel(infoFieldset, "Assunto(s)");
        const area = normalizeText(getFieldValueByLabel(identityContainer || doc, "Área"));
        const movimentacoes = Array.from(doc.querySelectorAll("#tabListaProcesso tr[movi_codigo]"))
            .map(row => {
                const cols = row.querySelectorAll("td");
                if (!cols || cols.length < 4) return null;
                const numero = normalizeText(cols[0].textContent);
                const tipo = normalizeText(cols[1].querySelector(".filtro_tipo_movimentacao")?.textContent || "");
                const textoIntegral = normalizeText(cols[1].textContent);
                const detalhe = normalizeText(textoIntegral.replace(tipo, ""));
                const movimentacao = normalizeText([tipo, detalhe].filter(Boolean).join(" - "));
                const data = normalizeText(cols[2].textContent);
                const usuario = normalizeText(cols[3].textContent);
                if (!numero && !movimentacao && !data && !usuario) return null;
                return { numero, movimentacao, data, usuario };
            })
            .filter(Boolean);

        return {
            processNumber,
            area,
            serventia: getFieldValueByLabel(infoFieldset, "Serventia"),
            classe,
            assunto,
            valorCausa: getFieldValueByLabel(infoFieldset, "Valor da Causa"),
            fase: getFieldValueByLabel(infoFieldset, "Fase Processual"),
            distribuicao: getFieldValueByLabel(infoFieldset, "Dt. Distribuição"),
            status: getFieldValueByLabel(infoFieldset, "Status"),
            prioridade: getFieldValueByLabel(infoFieldset, "Prioridade"),
            poloAtivos: extractPartyNames(doc, "Polo Ativo"),
            poloPassivos: extractPartyNames(doc, "Polo Passivo"),
            movimentacoes
        };
    }

    function loadExternalScript(doc, src) {
        return new Promise((resolve, reject) => {
            const existing = doc.querySelector(`script[src="${src}"]`);
            if (existing) {
                if (existing.dataset.loaded === "true") {
                    resolve();
                    return;
                }
                existing.addEventListener("load", () => resolve(), { once: true });
                existing.addEventListener("error", () => reject(new Error(`Falha ao carregar ${src}`)), { once: true });
                return;
            }
            const script = doc.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = () => {
                script.dataset.loaded = "true";
                resolve();
            };
            script.onerror = () => {
                script.remove();
                reject(new Error(`Falha ao carregar ${src}`));
            };
            (doc.head || doc.documentElement).appendChild(script);
        });
    }

    async function ensureMirrorPdfDeps(doc) {
        const win = doc && doc.defaultView;
        const hasJsPdf = () => typeof win?.jspdf?.jsPDF === "function";
        const hasAutoTable = () => typeof win?.jspdf?.jsPDF?.API?.autoTable === "function";
        if (hasJsPdf() && hasAutoTable()) return;

        const pending = mirrorPdfDepsPromises.get(doc);
        if (pending) {
            await pending;
            return;
        }

        const promise = (async () => {
            if (!hasJsPdf()) {
                await loadExternalScript(doc, "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
            }
            if (!hasAutoTable()) {
                await loadExternalScript(doc, "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js");
            }
            if (!hasJsPdf() || !hasAutoTable()) {
                throw new Error("As dependências do espelho do processo não foram inicializadas.");
            }
        })();
        mirrorPdfDepsPromises.set(doc, promise);
        try {
            await promise;
        } finally {
            if (mirrorPdfDepsPromises.get(doc) === promise) {
                mirrorPdfDepsPromises.delete(doc);
            }
        }
    }

    function isRelevantMirrorPdfMutation(mutations) {
        const selectors = "#TabelaArquivos, #tabListaProcesso, .divBotoesDireita, fieldset, #projudi-mirror-pdf-btn";
        return mutations.some((mutation) => {
            return Array.from([mutation.target, ...mutation.addedNodes, ...mutation.removedNodes]).some((node) => {
                if (!node || node.nodeType !== 1) return false;
                if (node.matches?.(selectors)) return true;
                if (node.querySelector?.(selectors)) return true;
                return false;
            });
        });
    }

    const PDF_THEME = {
        primary: [15, 62, 117],
        primaryLight: [31, 92, 164],
        text: [15, 23, 42],
        muted: [83, 103, 132],
        border: [214, 224, 238],
        surface: [248, 251, 255],
        soft: [238, 245, 253],
        white: [255, 255, 255]
    };

    function getPdfPageSize(pdf) {
        return {
            width: pdf.internal.pageSize.getWidth(),
            height: pdf.internal.pageSize.getHeight()
        };
    }

    function drawPdfHeader(pdf, title, subtitle, options = {}) {
        const { width } = getPdfPageSize(pdf);
        const margin = options.margin || 38;
        const height = options.height || 92;
        pdf.setFillColor(...PDF_THEME.primary);
        pdf.rect(0, 0, width, height, "F");
        pdf.setTextColor(...PDF_THEME.white);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(options.titleSize || 22);
        pdf.text(title, margin, 38);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10.5);
        pdf.text(subtitle, margin, 58);
        if (options.meta) {
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(9.2);
            pdf.text(options.meta, margin, 76);
        }
        return height;
    }

    function drawPdfSectionTitle(pdf, title, left, top) {
        pdf.setTextColor(...PDF_THEME.primary);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12.5);
        pdf.text(title, left, top);
        pdf.setDrawColor(...PDF_THEME.border);
        pdf.line(left, top + 8, pdf.internal.pageSize.getWidth() - left, top + 8);
    }

    function getInfoCardHeight(pdf, width, value, minHeight = 58) {
        const wrapped = pdf.splitTextToSize(normalizeText(value || "-"), width - 24);
        return Math.max(minHeight, 34 + wrapped.length * 11.5 + 12);
    }

    function drawInfoCard(pdf, left, top, width, title, value, options = {}) {
        const height = options.height || getInfoCardHeight(pdf, width, value, options.minHeight || 58);
        pdf.setDrawColor(...PDF_THEME.border);
        pdf.setFillColor(...(options.fill || PDF_THEME.surface));
        pdf.roundedRect(left, top, width, height, 7, 7, "FD");
        pdf.setTextColor(...PDF_THEME.muted);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.8);
        pdf.text(normalizeText(title || "-").toUpperCase(), left + 12, top + 17);
        pdf.setTextColor(...PDF_THEME.text);
        pdf.setFont("helvetica", options.boldValue ? "bold" : "normal");
        pdf.setFontSize(options.valueSize || 10);
        const wrapped = pdf.splitTextToSize(normalizeText(value || "-"), width - 24);
        pdf.text(wrapped, left + 12, top + 34, { lineHeightFactor: 1.18 });
        return height;
    }

    function drawTwoColumnCards(pdf, y, left, totalWidth, gap, cards, data) {
        const colWidth = (totalWidth - gap) / 2;
        for (let index = 0; index < cards.length; index += 2) {
            const first = cards[index];
            const second = cards[index + 1];
            const firstHeight = getInfoCardHeight(pdf, colWidth, first.value, first.minHeight || 58);
            const secondHeight = second ? getInfoCardHeight(pdf, colWidth, second.value, second.minHeight || 58) : firstHeight;
            const rowHeight = Math.max(firstHeight, secondHeight);
            if (data) y = ensureCoverSpace(pdf, y, rowHeight + 10, data);
            drawInfoCard(pdf, left, y, colWidth, first.title, first.value, { ...first, height: rowHeight });
            if (second) {
                drawInfoCard(pdf, left + colWidth + gap, y, colWidth, second.title, second.value, { ...second, height: rowHeight });
            }
            y += rowHeight + 10;
        }
        return y;
    }

    function ensureCoverSpace(pdf, y, needed, data) {
        const { height } = getPdfPageSize(pdf);
        if (y + needed <= height - 54) return y;
        pdf.addPage();
        drawPdfHeader(pdf, "Espelho do Processo", `Processo ${data.processNumber || "-"}`, {
            height: 86,
            titleSize: 17,
            meta: "Continuação dos dados processuais"
        });
        return 112;
    }

    function drawFullWidthCard(pdf, y, left, width, title, value, data, minHeight = 58) {
        const height = getInfoCardHeight(pdf, width, value, minHeight);
        y = ensureCoverSpace(pdf, y, height + 12, data);
        drawInfoCard(pdf, left, y, width, title, value, { height, minHeight });
        return y + height + 10;
    }

    function drawCoverPage(pdf, data) {
        const { width } = getPdfPageSize(pdf);
        const margin = 38;
        const contentWidth = width - margin * 2;
        const generatedAt = new Date().toLocaleString("pt-BR");
        let y = drawPdfHeader(pdf, "Espelho do Processo", `Processo ${data.processNumber || "-"}`, {
            meta: `Gerado em ${generatedAt}`
        }) + 28;

        drawPdfSectionTitle(pdf, "Resumo", margin, y);
        y += 20;
        y = drawTwoColumnCards(pdf, y, margin, contentWidth, 10, [
            { title: "Área", value: data.area, minHeight: 54 },
            { title: "Status", value: data.status, minHeight: 54, boldValue: true },
            { title: "Serventia", value: data.serventia, minHeight: 54 },
            { title: "Prioridade", value: data.prioridade, minHeight: 54 }
        ], data);

        y += 10;
        y = ensureCoverSpace(pdf, y, 48, data);
        drawPdfSectionTitle(pdf, "Dados processuais", margin, y);
        y += 20;
        y = drawTwoColumnCards(pdf, y, margin, contentWidth, 10, [
            { title: "Classe", value: data.classe, minHeight: 66 },
            { title: "Assunto(s)", value: data.assunto, minHeight: 66 },
            { title: "Valor da causa", value: data.valorCausa, minHeight: 54 },
            { title: "Fase processual", value: data.fase, minHeight: 54 }
        ], data);

        const ativoList = data.poloAtivos && data.poloAtivos.length ? data.poloAtivos.map(name => `• ${name}`).join("\n") : "-";
        const passivoList = data.poloPassivos && data.poloPassivos.length ? data.poloPassivos.map(name => `• ${name}`).join("\n") : "-";
        y = drawFullWidthCard(pdf, y, margin, contentWidth, "Distribuição", data.distribuicao, data, 54);
        y = drawFullWidthCard(pdf, y, margin, contentWidth, "Polo ativo", ativoList, data, 60);
        y = drawFullWidthCard(pdf, y, margin, contentWidth, "Polo passivo", passivoList, data, 60);
    }

    function drawMovementsHeader(pdf, data) {
        const margin = 38;
        const { width } = getPdfPageSize(pdf);
        pdf.setFillColor(...PDF_THEME.white);
        pdf.rect(0, 0, width, 94, "F");
        pdf.setFillColor(...PDF_THEME.primary);
        pdf.rect(0, 0, width, 68, "F");
        pdf.setTextColor(...PDF_THEME.white);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(17);
        pdf.text("Movimentações do Processo", margin, 34);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.8);
        pdf.text(`Processo ${data.processNumber || "-"} • ${(data.movimentacoes || []).length} movimentação(ões)`, margin, 52);
        pdf.setDrawColor(...PDF_THEME.border);
        pdf.line(margin, 86, width - margin, 86);
    }

    function drawMovementsPage(pdf, data) {
        pdf.addPage();
        const { width, height } = getPdfPageSize(pdf);
        const margin = 38;
        const body = (data.movimentacoes || []).map(item => [
            item.numero || "-",
            item.movimentacao || "-",
            item.data || "-",
            item.usuario || "-"
        ]);

        if (typeof pdf.autoTable === "function") {
            pdf.autoTable({
                startY: 104,
                margin: { top: 104, left: margin, right: margin, bottom: 44 },
                head: [["Nº", "Movimentação", "Data", "Usuário"]],
                body,
                theme: "grid",
                styles: {
                    font: "helvetica",
                    fontSize: 8.4,
                    cellPadding: { top: 6, right: 6, bottom: 6, left: 6 },
                    lineColor: PDF_THEME.border,
                    lineWidth: 0.35,
                    textColor: PDF_THEME.text,
                    valign: "top",
                    overflow: "linebreak"
                },
                headStyles: {
                    fillColor: PDF_THEME.primary,
                    textColor: PDF_THEME.white,
                    fontStyle: "bold",
                    fontSize: 8.8,
                    halign: "left"
                },
                alternateRowStyles: {
                    fillColor: PDF_THEME.surface
                },
                columnStyles: {
                    0: { cellWidth: 34, halign: "center" },
                    1: { cellWidth: 270 },
                    2: { cellWidth: 86 },
                    3: { cellWidth: "auto" }
                },
                didDrawPage: () => drawMovementsHeader(pdf, data)
            });
            return;
        }

        drawMovementsHeader(pdf, data);
        let y = 112;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setTextColor(...PDF_THEME.primary);
        pdf.text("Nº | Movimentação | Data | Usuário", margin, y);
        y += 16;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.7);
        pdf.setTextColor(...PDF_THEME.text);
        body.forEach(row => {
            const line = `${row[0]} | ${row[1]} | ${row[2]} | ${row[3]}`;
            const wrapped = pdf.splitTextToSize(line, width - margin * 2);
            if (y + wrapped.length * 11 > height - 44) {
                pdf.addPage();
                drawMovementsHeader(pdf, data);
                y = 112;
            }
            pdf.text(wrapped, margin, y, { lineHeightFactor: 1.18 });
            y += wrapped.length * 11 + 8;
        });
    }

    function applyPdfPageNumbers(pdf) {
        const total = pdf.internal.getNumberOfPages();
        const margin = 38;
        for (let page = 1; page <= total; page += 1) {
            pdf.setPage(page);
            const { width, height } = getPdfPageSize(pdf);
            pdf.setDrawColor(...PDF_THEME.border);
            pdf.line(margin, height - 34, width - margin, height - 34);
            pdf.setTextColor(...PDF_THEME.muted);
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(8.8);
            pdf.text("Documento gerado automaticamente pelo script de customizações.", margin, height - 18);
            pdf.text(`Página ${page} de ${total}`, width - margin, height - 18, { align: "right" });
        }
    }

    async function generateProcessMirrorPdf(doc, triggerButton) {
        if (!isProcessPageDoc(doc)) return;
        const button = triggerButton || doc.getElementById("projudi-mirror-pdf-btn");
        const originalHtml = button ? button.innerHTML : "";
        try {
            if (button) {
                button.disabled = true;
                button.style.opacity = "0.7";
                button.innerHTML = "<i class='fa-solid fa-spinner fa-spin fa-2x'></i>";
            }
            await ensureMirrorPdfDeps(doc);
            const win = doc.defaultView || window;
            const jsPDFClass = win?.jspdf?.jsPDF;
            if (!jsPDFClass) throw new Error("Biblioteca jsPDF indisponível.");

            const data = collectProcessSnapshotData(doc);
            if (!data.processNumber) throw new Error("Não foi possível identificar os dados do processo.");

            const pdf = new jsPDFClass({ unit: "pt", format: "a4", compress: true });
            drawCoverPage(pdf, data);
            drawMovementsPage(pdf, data);
            applyPdfPageNumbers(pdf);
            const filename = `espelho_processo_${data.processNumber.replace(/[^\d]/g, "") || "projudi"}.pdf`;
            pdf.save(filename);
        } catch (error) {
            const msg = error && error.message ? error.message : "Falha ao gerar o espelho do processo.";
            if (typeof doc.defaultView?.mostrarMensagemErro === "function") {
                doc.defaultView.mostrarMensagemErro("Espelho do Processo", msg);
            } else {
                doc.defaultView?.alert(`Espelho do Processo: ${msg}`);
            }
        } finally {
            if (button) {
                button.disabled = false;
                button.style.opacity = "";
                button.innerHTML = originalHtml;
            }
        }
    }

    function ensureProcessMirrorPdfButton(doc) {
        if (!isProcessPageDoc(doc)) return false;
        if (doc.getElementById("projudi-mirror-pdf-btn")) return true;
        const originalPdfButton = findExistingProcessPdfButton(doc);
        if (!originalPdfButton || !originalPdfButton.parentElement) return false;

        const button = doc.createElement("button");
        button.type = "button";
        button.id = "projudi-mirror-pdf-btn";
        button.setAttribute("title", "Gerar espelho do processo");
        button.setAttribute("alt", "Gerar espelho do processo");
        button.style.cssText = "margin-left: 6px; border: none; background: none; cursor: pointer;";
        button.innerHTML = "<i class='fa-solid fa-file-circle-plus fa-2x' style='color:#3e5f8c;'></i>";
        button.addEventListener("click", () => {
            generateProcessMirrorPdf(doc, button);
        });

        originalPdfButton.insertAdjacentElement("afterend", button);
        renderFontAwesome(button);
        return true;
    }

    function scheduleProcessMirrorPdfRefresh(doc) {
        if (mirrorPdfWorkFrame || doc !== mirrorPdfObservedDoc) return;
        mirrorPdfWorkFrame = requestAnimationFrame(() => {
            mirrorPdfWorkFrame = 0;
            if (doc !== mirrorPdfObservedDoc || !settings.enabled || !settings.enableProcessMirrorPdf) return;
            safeRun("Falha ao sincronizar botão de espelho do processo.", () => ensureProcessMirrorPdfButton(doc));
        });
    }

    function initProcessMirrorPdfFeature(doc) {
        if (!doc || !doc.body || !isProcessPageDoc(doc)) {
            teardownProcessMirrorPdfFeature(doc);
            return;
        }
        if (mirrorPdfObserver && mirrorPdfObservedDoc === doc) {
            ensureProcessMirrorPdfButton(doc);
            return;
        }
        teardownProcessMirrorPdfFeature();
        mirrorPdfObservedDoc = doc;
        ensureProcessMirrorPdfButton(doc);
        mirrorPdfObserver = new MutationObserver((mutations) => {
            if (!isRelevantMirrorPdfMutation(mutations)) return;
            scheduleProcessMirrorPdfRefresh(doc);
        });
        mirrorPdfObserver.observe(doc.body, { childList: true, subtree: true });
    }

    function teardownProcessMirrorPdfFeature(doc) {
        if (mirrorPdfWorkFrame) {
            cancelAnimationFrame(mirrorPdfWorkFrame);
            mirrorPdfWorkFrame = 0;
        }
        if (mirrorPdfObserver) {
            mirrorPdfObserver.disconnect();
            mirrorPdfObserver = null;
        }
        const docs = new Set([mirrorPdfObservedDoc, doc].filter(Boolean));
        mirrorPdfObservedDoc = null;
        docs.forEach(targetDoc => {
            const btn = targetDoc && targetDoc.getElementById
                ? targetDoc.getElementById("projudi-mirror-pdf-btn")
                : null;
            if (btn) btn.remove();
        });
    }


    function injectNoScrollbarStyle(doc) {
        if (!doc || !doc.documentElement) return;
        let style = doc.getElementById(NO_SCROLLBAR_STYLE_ID);
        if (!style) {
            style = doc.createElement("style");
            style.id = NO_SCROLLBAR_STYLE_ID;
            style.textContent = NO_SCROLLBAR_CSS;
            (doc.head || doc.documentElement).appendChild(style);
        }
        doc.documentElement.style.overflowY = "auto";
        doc.documentElement.style.overflowX = "hidden";
        if (doc.body) {
            doc.body.style.overflowY = "auto";
            doc.body.style.overflowX = "hidden";
        }
    }

    function removeNoScrollbarStyle(doc) {
        if (!doc || !doc.documentElement) return;
        removeStyleFromDoc(doc, NO_SCROLLBAR_STYLE_ID);
        doc.documentElement.style.removeProperty("overflow-y");
        doc.documentElement.style.removeProperty("overflow-x");
        if (doc.body) {
            doc.body.style.removeProperty("overflow-y");
            doc.body.style.removeProperty("overflow-x");
        }
    }

    function syncNoScrollbarForDoc(doc) {
        if (settings.enabled && settings.enableRemoveScrollbar) injectNoScrollbarStyle(doc);
        else removeNoScrollbarStyle(doc);
    }

    function syncNoScrollbarForCurrentIframe() {
        const iframe = document.getElementById("Principal");
        if (!iframe) return;
        try {
            if (iframe.contentDocument) syncNoScrollbarForDoc(iframe.contentDocument);
        } catch (_) {}
    }

    function ensureMovimentacoesModule() {
        if (!isTopWindow()) return null;
        if (!movimentacoesModule) movimentacoesModule = createMovimentacoesModule();
        return movimentacoesModule;
    }

    function syncMovimentacoesModule() {
        const enabled = settings.enabled && settings.enableMovimentacoes;
        if (!enabled && !movimentacoesModule) return;
        const module = ensureMovimentacoesModule();
        if (!module) return;
        module.setEnabled(enabled);
    }

    function openMovimentacoesPanel() {
        if (!settings.enabled || !settings.enableMovimentacoes) {
            window.alert("Ative o módulo de movimentações antes de configurar as opções.");
            return;
        }
        ensureFontAwesome(document);
        const module = ensureMovimentacoesModule();
        if (module) module.openPanel();
    }

    function createMovimentacoesModule() {
          if (window.top !== window.self) return;

          const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
          const ARROW_STR = '(?:-\\s*>|→|⇒|»|›)';

          const TYPES_ORDER = [
            'Despacho',
            'Decisão',
            'Julgamento',
            'Juntada',
            'Autos Conclusos',
            'Petição Enviada',
            'Recebido',
            'Despacho Autos ao Contador',
            'Relatório',
            'Juntada Documento Histórico Processo Físico'
          ];

          const DISPLAY_NAMES = {
            'Despacho Autos ao Contador': 'Autos ao Contador',
            'Juntada Documento Histórico Processo Físico': 'Histórico Proc. Físico'
          };

          const USER_DEFAULT_RED_TYPES = new Set([
            'Despacho',
            'Decisão',
            'Julgamento',
            'Despacho Autos ao Contador',
            'Relatório'
          ]);

          const DEFAULTS = {
            enabled: settings.enabled && settings.enableMovimentacoes,
            padding: '6px 8px',
            colors: {
              'Despacho': '#eedbdb',
              'Decisão': '#eedbdb',
              'Julgamento': '#eedbdb',
              'Juntada': '#e8f5e9',
              'Autos Conclusos': '#d6d6d6',
              'Petição Enviada': '#d1effc',
              'Recebido': '#d1effc',
              'Despacho Autos ao Contador': '#eedbdb',
              'Relatório': '#eedbdb',
              'Juntada Documento Histórico Processo Físico': '#d1effc'
            },
            textColorsMov: TYPES_ORDER.reduce((acc, k) => {
              acc[k] = '#111827';
              return acc;
            }, {}),
            textColorsUser: TYPES_ORDER.reduce((acc, k) => {
              acc[k] = USER_DEFAULT_RED_TYPES.has(k) ? '#dc2626' : '#111827';
              return acc;
            }, {}),
            enabledTypes: TYPES_ORDER.reduce((acc, k) => {
              acc[k] = true;
              return acc;
            }, {}),
            noBackgroundTypes: TYPES_ORDER.reduce((acc, k) => {
              acc[k] = false;
              return acc;
            }, {}),
            boldTypesMov: TYPES_ORDER.reduce((acc, k) => {
              acc[k] = true;
              return acc;
            }, {}),
            italicTypesMov: TYPES_ORDER.reduce((acc, k) => {
              acc[k] = false;
              return acc;
            }, {}),
            boldTypesUser: TYPES_ORDER.reduce((acc, k) => {
              acc[k] = USER_DEFAULT_RED_TYPES.has(k);
              return acc;
            }, {}),
            italicTypesUser: TYPES_ORDER.reduce((acc, k) => {
              acc[k] = false;
              return acc;
            }, {}),
            targets: {
              mov: TYPES_ORDER.reduce((acc, k) => {
                acc[k] = true;
                return acc;
              }, {}),
              user: TYPES_ORDER.reduce((acc, k) => {
                acc[k] = USER_DEFAULT_RED_TYPES.has(k);
                return acc;
              }, {})
            },
            movTextMode: 'first-line'
          };

          const DOC_STYLE_ID = 'phm-doc-style-v28';
          const PANEL_OVERLAY_ID = 'phm-overlay-root';
          const MOV_TABLES_SELECTOR = '#TabelaArquivos, #tabListaProcesso';
          const PRIMARY_FRAME_SELECTOR = 'iframe#Principal, iframe[name="userMainFrame"], frame#Principal, frame[name="userMainFrame"]';
          const LOG_PREFIX = '[Movimentações]';
          const PAGE_ORIGIN = window.location.origin;

          function logInfo(message, meta) {
            if (meta === undefined) {
              console.info(LOG_PREFIX, message);
              return;
            }
            console.info(LOG_PREFIX, message, meta);
          }

          function logWarn(message, meta) {
            if (meta === undefined) {
              console.warn(LOG_PREFIX, message);
              return;
            }
            console.warn(LOG_PREFIX, message, meta);
          }

          function logError(message, error) {
            console.error(LOG_PREFIX, message, error);
          }

          function safeRun(label, task, fallbackValue) {
            try {
              return task();
            } catch (error) {
              logError(label, error);
              return fallbackValue;
            }
          }

          function lockBodyScroll(doc = document) {
            const body = doc && doc.body;
            if (!body) return () => {};
            const win = (doc && doc.defaultView) || window;
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

          function deepMerge(base, add) {
            for (const k in add) {
              const v = add[k];
              if (v && typeof v === 'object' && !Array.isArray(v)) {
                base[k] = deepMerge(base[k] || {}, v);
              } else {
                base[k] = v;
              }
            }
            return base;
          }

          function readCfg() {
            try {
              const parsed = settings.movimentacoesConfig && typeof settings.movimentacoesConfig === 'object'
                ? settings.movimentacoesConfig
                : null;
              if (!parsed) return deepClone(DEFAULTS);
              const cfg = deepMerge(deepClone(DEFAULTS), parsed);

              if (!cfg.targets || typeof cfg.targets !== 'object') cfg.targets = { mov: {}, user: {} };
              if (!cfg.targets.mov) cfg.targets.mov = {};
              if (!cfg.targets.user) cfg.targets.user = {};
              delete cfg.targets.row;

              if (cfg.movTextMode !== 'first-line' && cfg.movTextMode !== 'full') {
                cfg.movTextMode = 'first-line';
              }

              return cfg;
            } catch (error) {
              logWarn('Falha ao ler configuração. Voltando para o padrão.', error);
              return deepClone(DEFAULTS);
            }
          }

          function saveCfg(cfg) {
            safeRun('Falha ao salvar configuração.', () => {
              settings = normalizeSettings({ ...settings, movimentacoesConfig: cfg });
              saveSettings(settings);
            });
          }

          function toHexColor(any) {
            if (/^#([0-9a-f]{3}){1,2}$/i.test(any || '')) return any;
            const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(any || '');
            if (!m) return '#111827';
            const [r, g, b] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
            return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
          }

          let CFG = readCfg();

          addMovimentacoesStyle(`
            #${PANEL_OVERLAY_ID} {
              position: fixed;
              inset: 0;
              z-index: 2147483647;
              background: rgba(11, 18, 32, .5);
              backdrop-filter: blur(4px);
              -webkit-backdrop-filter: blur(4px);
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 18px;
            }

            #${PANEL_OVERLAY_ID} .phm-panel {
              width: min(1180px, calc(100vw - 24px));
              max-height: min(90vh, 900px);
              border-radius: 14px;
              border: 1px solid #dbe3ef;
              background: #ffffff;
              box-shadow: 0 24px 70px rgba(2, 6, 23, .30);
              overflow: hidden;
              display: flex;
              flex-direction: column;
              color: #0f172a;
              font: 14px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
              transform: translateY(6px) scale(.985);
              opacity: .96;
              animation: phm-pop-in .16s ease forwards;
            }

            @keyframes phm-pop-in {
              from { transform: translateY(6px) scale(.985); opacity: .96; }
              to { transform: translateY(0) scale(1); opacity: 1; }
            }

            #${PANEL_OVERLAY_ID} .phm-panel *,
            #${PANEL_OVERLAY_ID} .phm-panel *::before,
            #${PANEL_OVERLAY_ID} .phm-panel *::after {
              box-sizing: border-box;
            }

            #${PANEL_OVERLAY_ID} button,
            #${PANEL_OVERLAY_ID} input,
            #${PANEL_OVERLAY_ID} label,
            #${PANEL_OVERLAY_ID} span {
              text-indent: 0 !important;
              letter-spacing: normal !important;
              text-transform: none !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
            }

            #${PANEL_OVERLAY_ID} .phm-head {
              flex: 0 0 auto;
              padding: 14px 16px;
              color: #ffffff;
              background: linear-gradient(135deg, #0f3e75, #1f5ca4);
              border-bottom: 1px solid #dbe3ef;
            }

            #${PANEL_OVERLAY_ID} .phm-head-bar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
            }

            #${PANEL_OVERLAY_ID} .phm-title-wrap {
              display: flex;
              align-items: center;
              gap: 11px;
              min-width: 0;
            }

            #${PANEL_OVERLAY_ID} .phm-title-icon {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              flex: 0 0 38px;
              width: 38px;
              height: 38px;
              border: 1px solid rgba(255,255,255,.22);
              border-radius: 11px;
              background: rgba(255,255,255,.14);
              color: #fff;
              font-size: 17px;
            }

            #${PANEL_OVERLAY_ID} .phm-title-copy { min-width: 0; }

            #${PANEL_OVERLAY_ID} .phm-title {
              margin: 0;
              font-size: 16px;
              font-weight: 700;
              line-height: 1.2;
              color: #ffffff !important;
              text-transform: none !important;
              text-decoration: none !important;
              border: 0 !important;
              border-bottom: 0 !important;
              padding: 0 !important;
            }

            #${PANEL_OVERLAY_ID} .phm-subtitle {
              margin: 2px 0 0;
              font-size: 12px;
              opacity: .92;
              color: #ffffff !important;
              text-transform: none !important;
              text-decoration: none !important;
              border: 0 !important;
              border-bottom: 0 !important;
              padding: 0 !important;
            }

            #${PANEL_OVERLAY_ID} .phm-close {
              border: 0;
              width: 28px;
              height: 28px;
              border-radius: 999px;
              background: rgba(255, 255, 255, .2);
              color: #ffffff;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              line-height: 1.2;
            }

            #${PANEL_OVERLAY_ID} .phm-close:hover {
              background: rgba(255, 255, 255, .3);
            }

            #${PANEL_OVERLAY_ID} .phm-body {
              flex: 1 1 auto;
              min-height: 0;
              overflow: auto;
              padding: 16px;
              display: grid;
              grid-template-columns: 1fr;
              gap: 14px;
              background: linear-gradient(180deg, #f8fbff 0%, #f2f6fc 100%);
            }

            #${PANEL_OVERLAY_ID} .phm-global {
              border: 1px solid #dbe3ef;
              border-radius: 12px;
              background: #ffffff;
              padding: 14px 16px;
              box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
            }

            #${PANEL_OVERLAY_ID} .phm-global-title {
              margin: 0 0 10px;
              color: #334155;
              font-size: 12px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: .03em;
              text-align: left;
            }

            #${PANEL_OVERLAY_ID} .phm-global-options {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 10px;
            }

            #${PANEL_OVERLAY_ID} .phm-global-options label {
              display: inline-flex;
              align-items: center;
              gap: 7px;
              padding: 9px 12px;
              border: 1px solid #dbe3ef;
              border-radius: 999px;
              background: #f8fbff;
              color: #334155;
              font-size: 13px;
              font-weight: 600;
              cursor: pointer;
            }

            #${PANEL_OVERLAY_ID} .phm-global-options input[type='radio'] {
              margin: 0;
              accent-color: #0f3e75;
            }

            #${PANEL_OVERLAY_ID} .phm-accordion {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 10px;
              align-items: start;
            }

            #${PANEL_OVERLAY_ID} .phm-rule {
              border: 1px solid #dbe3ef;
              border-radius: 12px;
              background: #ffffff;
              overflow: hidden;
              box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
            }

            #${PANEL_OVERLAY_ID} .phm-rule.is-disabled {
              opacity: .62;
            }

            #${PANEL_OVERLAY_ID} .phm-rule-head {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              padding: 12px 14px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
              cursor: pointer;
              user-select: none;
              list-style: none;
            }

            #${PANEL_OVERLAY_ID} .phm-rule-head::-webkit-details-marker {
              display: none;
            }

            #${PANEL_OVERLAY_ID} .phm-rule:not([open]) .phm-rule-head {
              border-bottom: 0;
            }

            #${PANEL_OVERLAY_ID} .phm-rule[open] .phm-rule-head {
              border-bottom: 1px solid #e5edf8;
            }

            #${PANEL_OVERLAY_ID} .phm-rule-content {
              padding: 14px;
              background: #fbfdff;
            }

            #${PANEL_OVERLAY_ID} .phm-type {
              display: inline-flex;
              align-items: center;
              gap: 9px;
              min-width: 0;
              cursor: pointer;
            }

            #${PANEL_OVERLAY_ID} .phm-type input[type='checkbox'] {
              width: 18px;
              height: 18px;
              margin: 0;
              cursor: pointer;
            }

            #${PANEL_OVERLAY_ID} .phm-type span {
              overflow: hidden;
              white-space: normal;
              font-weight: 600;
              color: #1e293b;
              font-size: 15px;
              line-height: 1.2;
            }

            #${PANEL_OVERLAY_ID} .phm-rule-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 10px;
              align-items: start;
            }

            #${PANEL_OVERLAY_ID} .phm-field {
              min-width: 0;
              border: 1px solid #dbe3ef;
              border-radius: 12px;
              background: #ffffff;
              padding: 11px 12px;
            }

            #${PANEL_OVERLAY_ID} .phm-field-title {
              margin: 0 0 8px;
              color: #334155;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: .03em;
              text-align: left;
            }

            #${PANEL_OVERLAY_ID} .phm-field-body {
              display: flex;
              flex-direction: column;
              align-items: flex-start;
              gap: 10px;
            }

            #${PANEL_OVERLAY_ID} .phm-color-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              width: 100%;
            }

            #${PANEL_OVERLAY_ID} .phm-color-row span {
              color: #64748b;
              font-size: 12px;
              font-weight: 600;
            }

            #${PANEL_OVERLAY_ID} .phm-center {
              display: flex;
              align-items: center;
              gap: 10px;
              flex-wrap: wrap;
              justify-content: flex-start;
            }

            #${PANEL_OVERLAY_ID} .phm-options-row {
              display: flex;
              align-items: center;
              justify-content: flex-start;
              gap: 10px;
              flex-wrap: wrap;
              width: 100%;
            }

            #${PANEL_OVERLAY_ID} .phm-center input[type='color'] {
              width: 52px;
              height: 34px;
              border: 1px solid #cbd5e1;
              border-radius: 999px;
              padding: 3px;
              background: #fff;
              cursor: pointer;
            }

            #${PANEL_OVERLAY_ID} .phm-center label {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              color: #334155;
              font-size: 12px;
              font-weight: 600;
              white-space: nowrap;
              cursor: pointer;
            }

            #${PANEL_OVERLAY_ID} .phm-center label input[type='checkbox'] {
              width: 16px;
              height: 16px;
              margin: 0;
              cursor: pointer;
            }

            #${PANEL_OVERLAY_ID} .phm-chip {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              min-width: 88px;
              height: 32px;
              border: 1px solid #dbe3ef;
              border-radius: 999px;
              font-size: 13px;
              font-weight: 700;
              color: #111827;
              background: #f8fbff;
              padding: 0 10px;
            }

            #${PANEL_OVERLAY_ID} .phm-foot {
              flex: 0 0 auto;
              display: flex;
              justify-content: flex-end;
              gap: 8px;
              padding: 12px 16px;
              border-top: 1px solid #dbe3ef;
              background: #f8fafc;
            }

            #${PANEL_OVERLAY_ID} .phm-btn {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 7px;
              min-width: 86px;
              padding: 8px 12px;
              border-radius: 8px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              line-height: 1.2;
              color: #1e293b;
              background: #ffffff;
              border: 1px solid #cbd5e1;
            }

            #${PANEL_OVERLAY_ID} .phm-btn:hover {
              background: #f8fafc;
            }

            #${PANEL_OVERLAY_ID} .phm-btn-save {
              color: #ffffff;
              background: #0f3e75;
              border-color: #0f3e75;
              font-weight: 600;
            }

            #${PANEL_OVERLAY_ID} .phm-btn-save:hover {
              background: #0d3562;
            }

            @media (max-width: 1040px) {
              #${PANEL_OVERLAY_ID} .phm-body {
                padding: 12px;
              }

              #${PANEL_OVERLAY_ID} .phm-foot {
                padding: 10px 12px;
              }

              #${PANEL_OVERLAY_ID} .phm-rule-head {
                padding: 10px 12px;
              }

              #${PANEL_OVERLAY_ID} .phm-rule-content {
                padding: 12px;
              }

              #${PANEL_OVERLAY_ID} .phm-rule-grid {
                grid-template-columns: 1fr;
              }

              #${PANEL_OVERLAY_ID} .phm-accordion,
              #${PANEL_OVERLAY_ID} .phm-global-options {
                grid-template-columns: 1fr;
              }
            }

            @media (max-width: 700px) {
              #${PANEL_OVERLAY_ID} .phm-rule-head {
                flex-direction: column;
                align-items: flex-start;
              }

              #${PANEL_OVERLAY_ID} .phm-rule-grid {
                grid-template-columns: 1fr;
              }
            }
          `);

          function ensureDocStyle(doc) {
            safeRun('Falha ao injetar estilo do documento.', () => {
              if (!doc || !doc.head) return;
              if (doc.getElementById(DOC_STYLE_ID)) return;
              const style = doc.createElement('style');
              style.id = DOC_STYLE_ID;
              style.textContent = `
                .phm-bold-fragment, .phm-bold-fragment * { font-weight: 700 !important; }
                .phm-italic-fragment, .phm-italic-fragment * { font-style: italic !important; }
              `;
              doc.head.appendChild(style);
            });
          }

          const PADROES_MOV = [
            {
              key: 'Juntada Documento Histórico Processo Físico',
              re: /^\s*Juntada\s+de\s+Documento\s*(?:\r?\n|\s+)\s*Hist[óo]rico\s+Processo\s+F[ií]sico\b/iu
            },
            { key: 'Despacho', re: new RegExp('^\\s*Despacho\\s*' + ARROW_STR, 'iu') },
            { key: 'Decisão', re: new RegExp('^\\s*Decis[aã]o\\s*' + ARROW_STR, 'iu') },
            { key: 'Julgamento', re: new RegExp('^\\s*Julgamento\\s*' + ARROW_STR, 'iu') },
            { key: 'Juntada', re: new RegExp('^\\s*Juntada\\s*' + ARROW_STR, 'iu') },
            { key: 'Autos Conclusos', re: /^(\s*)Autos\s+Conclusos\b/iu },
            { key: 'Petição Enviada', re: /^(\s*)Peti[cç][aã]o\s+Enviada\b/iu },
            { key: 'Recebido', re: /^(\s*)Recebido\b/iu },
            { key: 'Despacho Autos ao Contador', re: /^(\s*)Despacho\s+Autos\s+ao\s+Contador\b/iu },
            { key: 'Relatório', re: new RegExp('^\\s*Relat[óo]rio\\s*' + ARROW_STR, 'iu') }
          ];

          function matchKind(text) {
            for (const p of PADROES_MOV) {
              if (CFG.enabledTypes[p.key] === false) continue;
              if (p.re.test(text)) return p.key;
            }
            return null;
          }

          function removeFirstLineWrapper(td) {
            const wrappers = td.querySelectorAll('span.phm-format-fragment[data-phm-firstline="1"]');
            wrappers.forEach((wrap) => {
              const parent = wrap.parentNode;
              if (!parent) return;
              while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap);
              parent.removeChild(wrap);
            });
          }

          function applyFirstLogicalLineFormat(td, kind) {
            removeFirstLineWrapper(td);
            if (!kind) return;

            const bold = !!CFG.boldTypesMov[kind];
            const italic = !!CFG.italicTypesMov[kind];
            if (!bold && !italic) return;

            const nodes = Array.from(td.childNodes);
            if (!nodes.length) return;

            const selected = [];
            let hasContent = false;

            for (const node of nodes) {
              if (node.nodeType === Node.ELEMENT_NODE && node.nodeName === 'BR') {
                if (!hasContent) continue;
                break;
              }

              if (node.nodeType === Node.TEXT_NODE) {
                let txt = node.nodeValue || '';
                while (!hasContent && txt.length && (txt[0] === '\n' || txt[0] === '\r')) {
                  txt = txt.slice(1);
                  node.nodeValue = txt;
                }

                if (!txt.length) {
                  selected.push(node);
                  continue;
                }

                const idx = txt.search(/[\n\r]/);
                if (idx >= 0) {
                  if (idx === 0) {
                    if (!hasContent) {
                      node.nodeValue = txt.slice(1);
                      continue;
                    }
                    break;
                  }

                  const tail = node.splitText(idx);
                  tail.nodeValue = tail.nodeValue.replace(/^\r?\n/, '');
                  const br = td.ownerDocument.createElement('br');
                  td.insertBefore(br, tail);

                  selected.push(node);
                  if (/\S/.test(node.nodeValue || '')) hasContent = true;
                  break;
                }

                selected.push(node);
                if (/\S/.test(txt)) hasContent = true;
                continue;
              }

              selected.push(node);
              hasContent = true;
            }

            if (!selected.length || !hasContent) return;

            const wrap = td.ownerDocument.createElement('span');
            wrap.className = 'phm-format-fragment';
            if (bold) wrap.classList.add('phm-bold-fragment');
            if (italic) wrap.classList.add('phm-italic-fragment');
            wrap.setAttribute('data-phm-firstline', '1');

            td.insertBefore(wrap, selected[0]);
            selected.forEach((n) => {
              if (n.parentNode === td) wrap.appendChild(n);
            });
          }

          function clearStyles(tr, movTd, userTd) {
            tr.style.background = '';
            tr.removeAttribute('data-phm-styled');

            const cells = tr.children ? Array.from(tr.children) : [];
            cells.forEach((cell) => {
              cell.style.color = '';
              cell.style.fontWeight = '';
              cell.style.fontStyle = '';
            });

            if (movTd) {
              movTd.style.padding = '';
              removeFirstLineWrapper(movTd);
            }

            if (userTd) {
              userTd.style.color = '';
              userTd.style.fontWeight = '';
              userTd.style.fontStyle = '';
            }
          }

          function isTargetEnabled(kind, target) {
            return !!(CFG.targets && CFG.targets[target] && CFG.targets[target][kind]);
          }

          function styleRow(tr, kind) {
            const bg = CFG.colors[kind] || '#eef2ff';
            const noBg = !!CFG.noBackgroundTypes[kind];
            tr.style.background = noBg ? '' : bg;
          }

          function styleCell(td, kind) {
            if (!isTargetEnabled(kind, 'mov')) return;
            const fg = CFG.textColorsMov[kind] || '#111827';
            const bold = !!CFG.boldTypesMov[kind];
            const italic = !!CFG.italicTypesMov[kind];
            const useFirstLineMode = CFG.movTextMode !== 'full';

            td.style.color = fg;
            td.style.padding = CFG.padding;

            if (useFirstLineMode) {
              td.style.fontWeight = '';
              td.style.fontStyle = '';
              applyFirstLogicalLineFormat(td, kind);
            } else {
              removeFirstLineWrapper(td);
              td.style.fontWeight = bold ? '700' : '400';
              td.style.fontStyle = italic ? 'italic' : 'normal';
            }
          }

          function styleUserCell(td, kind) {
            if (!td || !isTargetEnabled(kind, 'user')) return;
            const fg = CFG.textColorsUser[kind] || '#111827';
            const bold = !!CFG.boldTypesUser[kind];
            const italic = !!CFG.italicTypesUser[kind];
            td.style.color = fg;
            td.style.fontWeight = bold ? '700' : '400';
            td.style.fontStyle = italic ? 'italic' : 'normal';
          }

          function getMovCell(tr) {
            return tr.querySelector('td.filtro_coluna_movimentacao');
          }

          function getUserCell(tr) {
            const cells = tr.children;
            if (!cells || cells.length < 4) return null;
            return cells[3];
          }

          /**
           * Resolves the frame src using the owner document base URI.
           * @param {HTMLIFrameElement|HTMLFrameElement} frame
           * @returns {URL|null}
           */
          function resolveFrameUrl(frame) {
            if (!frame || typeof frame.getAttribute !== 'function') return null;
            const rawSrc = String(frame.getAttribute('src') || '').trim();
            if (!rawSrc) return null;
            try {
              return new URL(rawSrc, (frame.ownerDocument && frame.ownerDocument.baseURI) || document.baseURI);
            } catch {
              return null;
            }
          }

          /**
           * Avoids touching frames that are explicitly cross-origin, such as file previews hosted on S3.
           * @param {HTMLIFrameElement|HTMLFrameElement} frame
           * @returns {boolean}
           */
          function isTrackableFrame(frame) {
            const frameUrl = resolveFrameUrl(frame);
            if (!frameUrl) return true;
            if (frameUrl.protocol === 'about:') return frameUrl.href === 'about:blank';
            if (frameUrl.protocol !== 'http:' && frameUrl.protocol !== 'https:') return false;
            return frameUrl.origin === PAGE_ORIGIN;
          }

          /**
           * Returns the document of a same-origin frame when it is accessible.
           * Cross-origin or not-yet-ready frames are skipped silently.
           * @param {HTMLIFrameElement|HTMLFrameElement} frame
           * @returns {Document|null}
           */
          function getAccessibleFrameDocument(frame) {
            if (!frame) return null;
            if (!isTrackableFrame(frame)) return null;
            try {
              const frameDoc = frame.contentDocument;
              if (frameDoc && frameDoc.documentElement) return frameDoc;
            } catch {
              return null;
            }

            try {
              const frameWindow = frame.contentWindow;
              if (!frameWindow || !frameWindow.document || !frameWindow.document.documentElement) {
                return null;
              }
              return frameWindow.document;
            } catch {
              return null;
            }
          }

          /**
           * The Projudi content lives in the main frame. Nested frames inside the process page
           * often host file previews and should not be traversed by this script.
           * @param {ParentNode} root
           * @returns {(HTMLIFrameElement|HTMLFrameElement)[]}
           */
          function getProcessableFrames(root) {
            if (!root || typeof root.querySelectorAll !== 'function') return [];
            return Array.from(root.querySelectorAll(PRIMARY_FRAME_SELECTOR)).filter((frame) => isTrackableFrame(frame));
          }

          function walkDocuments(callback) {
            const visited = new WeakSet();
            if (!document || visited.has(document)) return;
            visited.add(document);
            callback(document);

            getProcessableFrames(document).forEach((frame) => {
              const frameDoc = getAccessibleFrameDocument(frame);
              if (!frameDoc || visited.has(frameDoc)) return;
              visited.add(frameDoc);
              callback(frameDoc);
            });
          }

          function buildConfigSignature() {
            return JSON.stringify({
              enabled: CFG.enabled,
              padding: CFG.padding,
              colors: CFG.colors,
              textColorsMov: CFG.textColorsMov,
              textColorsUser: CFG.textColorsUser,
              enabledTypes: CFG.enabledTypes,
              noBackgroundTypes: CFG.noBackgroundTypes,
              boldTypesMov: CFG.boldTypesMov,
              italicTypesMov: CFG.italicTypesMov,
              boldTypesUser: CFG.boldTypesUser,
              italicTypesUser: CFG.italicTypesUser,
              targets: CFG.targets,
              movTextMode: CFG.movTextMode
            });
          }

          function buildRowSignature(movText, userText, kind, configSignature) {
            return [kind || '', movText.trim(), userText.trim(), configSignature].join('||');
          }

          const rowStateCache = new WeakMap();
          let configSignature = buildConfigSignature();

          /**
           * Applies or clears styling for a single table row based on cached state.
           * @param {HTMLTableRowElement} row
           */
          function processRow(row) {
            const movTd = getMovCell(row);
            const userTd = getUserCell(row);
            if (!movTd) return;

            const movText = movTd.textContent || '';
            const userText = userTd ? (userTd.textContent || '') : '';
            const kind = CFG.enabled ? matchKind(movText) : null;
            const signature = buildRowSignature(movText, userText, kind, configSignature);
            const previous = rowStateCache.get(row);

            if (previous && previous.signature === signature) return;

            if (!kind) {
              clearStyles(row, movTd, userTd);
              rowStateCache.set(row, { signature, kind: null });
              return;
            }

            styleRow(row, kind);
            styleCell(movTd, kind);
            styleUserCell(userTd, kind);
            row.setAttribute('data-phm-styled', '1');
            rowStateCache.set(row, { signature, kind });
          }

          /**
           * Processes all movement rows contained in a table.
           * @param {Document} doc
           * @param {Element} table
           */
          function processTable(doc, table) {
            ensureDocStyle(doc);
            const rows = table.querySelectorAll('tbody tr, tr');
            rows.forEach((row) => processRow(row));
          }

          function processDoc(doc) {
            if (!doc) return;
            const tables = doc.querySelectorAll(MOV_TABLES_SELECTOR);
            tables.forEach((table) => processTable(doc, table));
          }

          function reapply() {
            configSignature = buildConfigSignature();
            walkDocuments((doc) => {
              safeRun('Falha ao reaplicar destaques.', () => {
                ensureDocStyle(doc);
                const rows = doc.querySelectorAll('tr[data-phm-styled="1"]');
                rows.forEach((row) => {
                  rowStateCache.delete(row);
                  clearStyles(row, getMovCell(row), getUserCell(row));
                });
                processDoc(doc);
              });
            });
          }

          function panelHtml() {
            const items = TYPES_ORDER.map((key) => {
              const label = DISPLAY_NAMES[key] || key;
              const bg = toHexColor(CFG.colors[key] || '#eef2ff');
              const fgMov = toHexColor(CFG.textColorsMov[key] || '#111827');
              const fgUser = toHexColor(CFG.textColorsUser[key] || '#111827');
              const enabled = CFG.enabledTypes[key] !== false ? 'checked' : '';
              const noBg = CFG.noBackgroundTypes[key] ? 'checked' : '';
              const boldMov = CFG.boldTypesMov[key] ? 'checked' : '';
              const italicMov = CFG.italicTypesMov[key] ? 'checked' : '';
              const boldUser = CFG.boldTypesUser[key] ? 'checked' : '';
              const italicUser = CFG.italicTypesUser[key] ? 'checked' : '';
              const targetMov = (CFG.targets && CFG.targets.mov && CFG.targets.mov[key]) ? 'checked' : '';
              const targetUser = (CFG.targets && CFG.targets.user && CFG.targets.user[key]) ? 'checked' : '';
              const open = key === TYPES_ORDER[0] ? 'open' : '';
              return `
                <details class="phm-rule" data-phm-rule="${key}" ${open}>
                  <summary class="phm-rule-head">
                    <label class="phm-type">
                      <input type="checkbox" data-phm-enabled="${key}" ${enabled}>
                      <span>${label}</span>
                    </label>
                    <span class="phm-chip" data-phm-chip="${key}">Prévia</span>
                  </summary>
                  <div class="phm-rule-content">
                    <div class="phm-rule-grid">
                    <div class="phm-field">
                      <p class="phm-field-title">Cor de fundo</p>
                      <div class="phm-field-body">
                        <div class="phm-center phm-color-row">
                          <span>Fundo da linha</span>
                          <input type="color" value="${bg}" data-phm-color-bg="${key}" title="Cor de fundo">
                        </div>
                        <div class="phm-options-row">
                          <label><input type="checkbox" data-phm-nobg="${key}" ${noBg}> Sem fundo</label>
                        </div>
                      </div>
                    </div>
                    <div class="phm-field">
                      <p class="phm-field-title">Texto Mov.</p>
                      <div class="phm-field-body">
                        <div class="phm-center phm-color-row">
                          <span>Cor do texto</span>
                          <input type="color" value="${fgMov}" data-phm-color-fg-mov="${key}" title="Cor do texto da coluna Movimentação">
                        </div>
                        <div class="phm-options-row">
                          <label><input type="checkbox" data-phm-target-mov="${key}" ${targetMov}> Aplicar</label>
                          <label><input type="checkbox" data-phm-bold-mov="${key}" ${boldMov}> Negrito</label>
                          <label><input type="checkbox" data-phm-italic-mov="${key}" ${italicMov}> Itálico</label>
                        </div>
                      </div>
                    </div>
                    <div class="phm-field">
                      <p class="phm-field-title">Texto Usuário</p>
                      <div class="phm-field-body">
                        <div class="phm-center phm-color-row">
                          <span>Cor do texto</span>
                          <input type="color" value="${fgUser}" data-phm-color-fg-user="${key}" title="Cor do texto da coluna Usuário">
                        </div>
                        <div class="phm-options-row">
                          <label><input type="checkbox" data-phm-target-user="${key}" ${targetUser}> Aplicar</label>
                          <label><input type="checkbox" data-phm-bold-user="${key}" ${boldUser}> Negrito</label>
                          <label><input type="checkbox" data-phm-italic-user="${key}" ${italicUser}> Itálico</label>
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>
                </details>
              `;
            }).join('');

            return `
              <div class="phm-head">
                <div class="phm-head-bar">
                  <div class="phm-title-wrap">
                    <span class="phm-title-icon"><i class="fa-solid fa-highlighter" aria-hidden="true"></i></span>
                    <div class="phm-title-copy">
                      <h3 class="phm-title">Destaques de movimentações</h3>
                      <p class="phm-subtitle">Defina cores e ênfases por tipo, sem alterar o conteúdo do processo.</p>
                    </div>
                  </div>
                  <button class="phm-close" data-phm-action="close" title="Fechar"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>
              </div>
              <div class="phm-body">
                <div class="phm-global">
                  <p class="phm-global-title">Texto da coluna Movimentação</p>
                  <div class="phm-global-options">
                    <label><input type="radio" name="phm-mov-text-mode" value="first-line" ${CFG.movTextMode !== 'full' ? 'checked' : ''}> Negrito/itálico só na primeira linha</label>
                    <label><input type="radio" name="phm-mov-text-mode" value="full" ${CFG.movTextMode === 'full' ? 'checked' : ''}> Negrito/itálico no texto completo</label>
                  </div>
                </div>
                <div class="phm-accordion">${items}</div>
              </div>
              <div class="phm-foot">
                <button class="phm-btn" data-phm-action="reset"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Restaurar padrão</button>
                <button class="phm-btn" data-phm-action="cancel"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Fechar</button>
                <button class="phm-btn phm-btn-save" data-phm-action="save"><i class="fa-solid fa-check" aria-hidden="true"></i> Salvar alterações</button>
              </div>
            `;
          }

          function refreshPanelPreviews(root) {
            TYPES_ORDER.forEach((key) => {
              const row = root.querySelector(`[data-phm-rule="${CSS.escape(key)}"]`);
              const chip = root.querySelector(`[data-phm-chip="${CSS.escape(key)}"]`);
              const enabledInput = root.querySelector(`[data-phm-enabled="${CSS.escape(key)}"]`);
              const bgInput = root.querySelector(`[data-phm-color-bg="${CSS.escape(key)}"]`);
              const fgMovInput = root.querySelector(`[data-phm-color-fg-mov="${CSS.escape(key)}"]`);
              const fgUserInput = root.querySelector(`[data-phm-color-fg-user="${CSS.escape(key)}"]`);
              const noBgInput = root.querySelector(`[data-phm-nobg="${CSS.escape(key)}"]`);
              const boldMovInput = root.querySelector(`[data-phm-bold-mov="${CSS.escape(key)}"]`);
              const italicMovInput = root.querySelector(`[data-phm-italic-mov="${CSS.escape(key)}"]`);
              const boldUserInput = root.querySelector(`[data-phm-bold-user="${CSS.escape(key)}"]`);
              const italicUserInput = root.querySelector(`[data-phm-italic-user="${CSS.escape(key)}"]`);
              const targetMovInput = root.querySelector(`[data-phm-target-mov="${CSS.escape(key)}"]`);
              const targetUserInput = root.querySelector(`[data-phm-target-user="${CSS.escape(key)}"]`);
              if (!row || !chip || !enabledInput || !bgInput || !fgMovInput || !fgUserInput || !noBgInput || !boldMovInput || !italicMovInput || !boldUserInput || !italicUserInput || !targetMovInput || !targetUserInput) return;

              chip.style.background = noBgInput.checked ? 'transparent' : bgInput.value;
              chip.style.color = targetUserInput.checked && !targetMovInput.checked ? fgUserInput.value : fgMovInput.value;
              chip.style.fontWeight = (boldMovInput.checked || boldUserInput.checked) ? '700' : '600';
              chip.style.fontStyle = (italicMovInput.checked || italicUserInput.checked) ? 'italic' : 'normal';
              chip.style.opacity = (targetMovInput.checked || targetUserInput.checked) ? '1' : '.55';
              row.classList.toggle('is-disabled', !enabledInput.checked);
            });
          }

          function closePanel() {
            const overlay = document.getElementById(PANEL_OVERLAY_ID);
            if (!overlay) return;
            if (typeof overlay.__phmUnlockScroll === "function") overlay.__phmUnlockScroll();
            overlay.remove();
          }

          function ensurePanel() {
            if (document.getElementById(PANEL_OVERLAY_ID)) return;

            const overlay = document.createElement('div');
            overlay.id = PANEL_OVERLAY_ID;
            overlay.className = 'phm-overlay';
            overlay.innerHTML = `<div class="phm-panel" role="dialog" aria-modal="true">${panelHtml()}</div>`;
            overlay.__phmUnlockScroll = lockBodyScroll(document);

            overlay.addEventListener('click', (ev) => {
              if (ev.target === overlay) closePanel();
            });

            overlay.addEventListener('input', (ev) => {
              const t = ev.target;
              if (
                t.matches('[data-phm-enabled], [data-phm-color-bg], [data-phm-color-fg-mov], [data-phm-color-fg-user], [data-phm-nobg], [data-phm-bold-mov], [data-phm-italic-mov], [data-phm-bold-user], [data-phm-italic-user], [data-phm-target-mov], [data-phm-target-user], input[name="phm-mov-text-mode"]')
              ) {
                refreshPanelPreviews(overlay);
              }
            });

            overlay.addEventListener('click', (ev) => {
              const btn = ev.target.closest('[data-phm-action]');
              if (!btn) return;
              const action = btn.getAttribute('data-phm-action');

              if (action === 'close') {
                closePanel();
                return;
              }

              if (action === 'cancel') {
                closePanel();
                return;
              }

              if (action === 'reset') {
                CFG = deepClone(DEFAULTS);
                saveCfg(CFG);
                closePanel();
                ensurePanel();
                reapply();
                return;
              }

              if (action === 'save') {
                overlay.querySelectorAll('[data-phm-enabled]').forEach((inp) => {
                  CFG.enabledTypes[inp.getAttribute('data-phm-enabled')] = inp.checked;
                });

                overlay.querySelectorAll('[data-phm-color-bg]').forEach((inp) => {
                  CFG.colors[inp.getAttribute('data-phm-color-bg')] = inp.value;
                });

                overlay.querySelectorAll('[data-phm-color-fg-mov]').forEach((inp) => {
                  CFG.textColorsMov[inp.getAttribute('data-phm-color-fg-mov')] = inp.value;
                });

                overlay.querySelectorAll('[data-phm-color-fg-user]').forEach((inp) => {
                  CFG.textColorsUser[inp.getAttribute('data-phm-color-fg-user')] = inp.value;
                });

                overlay.querySelectorAll('[data-phm-nobg]').forEach((inp) => {
                  CFG.noBackgroundTypes[inp.getAttribute('data-phm-nobg')] = inp.checked;
                });

                overlay.querySelectorAll('[data-phm-bold-mov]').forEach((inp) => {
                  CFG.boldTypesMov[inp.getAttribute('data-phm-bold-mov')] = inp.checked;
                });

                overlay.querySelectorAll('[data-phm-italic-mov]').forEach((inp) => {
                  CFG.italicTypesMov[inp.getAttribute('data-phm-italic-mov')] = inp.checked;
                });

                overlay.querySelectorAll('[data-phm-bold-user]').forEach((inp) => {
                  CFG.boldTypesUser[inp.getAttribute('data-phm-bold-user')] = inp.checked;
                });

                overlay.querySelectorAll('[data-phm-italic-user]').forEach((inp) => {
                  CFG.italicTypesUser[inp.getAttribute('data-phm-italic-user')] = inp.checked;
                });

                overlay.querySelectorAll('[data-phm-target-mov]').forEach((inp) => {
                  CFG.targets.mov[inp.getAttribute('data-phm-target-mov')] = inp.checked;
                });

                overlay.querySelectorAll('[data-phm-target-user]').forEach((inp) => {
                  CFG.targets.user[inp.getAttribute('data-phm-target-user')] = inp.checked;
                });

                const movTextModeInput = overlay.querySelector('input[name="phm-mov-text-mode"]:checked');
                CFG.movTextMode = movTextModeInput && movTextModeInput.value === 'full' ? 'full' : 'first-line';

                saveCfg(CFG);
                reapply();
                closePanel();
                return;
              }
            });

            document.body.appendChild(overlay);
            renderFontAwesome(overlay);
            refreshPanelPreviews(overlay);
          }

          const docObservers = new WeakMap();
          const frameListeners = new WeakSet();
          const docProcessState = new WeakMap();

          function getDocProcessState(doc) {
            const existing = docProcessState.get(doc);
            if (existing) return existing;
            const created = { raf: 0 };
            docProcessState.set(doc, created);
            return created;
          }

          function isRelevantMutationNode(node) {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
            const element = /** @type {Element} */ (node);
            return Boolean(
              (element.matches && (
                element.matches('iframe, frame') ||
                element.matches(MOV_TABLES_SELECTOR) ||
                element.matches('tbody, tr') ||
                element.matches('td.filtro_coluna_movimentacao')
              )) ||
              (element.querySelector && (
                element.querySelector('iframe, frame') ||
                element.querySelector(MOV_TABLES_SELECTOR) ||
                element.querySelector('td.filtro_coluna_movimentacao')
              ))
            );
          }

          function scheduleProcessDoc(doc) {
            const state = getDocProcessState(doc);
            if (state.raf) return;
            state.raf = requestAnimationFrame(() => {
              state.raf = 0;
              safeRun('Falha ao processar documento.', () => {
                CFG = readCfg();
                configSignature = buildConfigSignature();
                processDoc(doc);
                ensureObservers();
              });
            });
          }

          function observeDoc(doc) {
            if (!doc || !doc.documentElement || docObservers.has(doc)) return;
            ensureDocStyle(doc);
            const observer = new MutationObserver((mutations) => {
              const hasRelevantMutation = mutations.some((mutation) => {
                if (mutation.type !== 'childList') return false;
                if (isRelevantMutationNode(mutation.target)) return true;
                return Array.from(mutation.addedNodes).some((node) => isRelevantMutationNode(node));
              });
              if (!hasRelevantMutation) return;
              scheduleProcessDoc(doc);
            });
            observer.observe(doc.documentElement, { subtree: true, childList: true });
            docObservers.set(doc, observer);
          }

          function ensureObservers() {
            walkDocuments((doc) => {
              observeDoc(doc);
              const frames = doc === document ? getProcessableFrames(doc) : [];
              frames.forEach((frame) => {
                if (!isTrackableFrame(frame)) return;
                if (frameListeners.has(frame)) return;
                frameListeners.add(frame);
                frame.addEventListener('load', () => {
                  if (!isTrackableFrame(frame)) return;
                  const frameDoc = getAccessibleFrameDocument(frame);
                  if (!frameDoc) return;
                  scheduleProcessDoc(frameDoc);
                }, true);
              });
            });
          }

          function reviveAfterReturn() {
            walkDocuments((doc) => scheduleProcessDoc(doc));
          }

          function bootMovimentacoes() {
            ensureObservers();
            walkDocuments((doc) => scheduleProcessDoc(doc));

            window.addEventListener('pageshow', reviveAfterReturn, true);
            window.addEventListener('focus', reviveAfterReturn, true);
            document.addEventListener('visibilitychange', () => {
              if (!document.hidden) reviveAfterReturn();
            });

            document.addEventListener('keydown', (ev) => {
              if (ev.key === 'Escape') closePanel();
            }, true);
          }

          function setMovimentacoesEnabled(enabled) {
            const nextEnabled = !!enabled;
            if (CFG.enabled === nextEnabled) return;
            CFG.enabled = nextEnabled;
            saveCfg(CFG);
            reapply();
          }

          function addMovimentacoesStyle(css) {
            if (!document.head) return;
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
          }

          bootMovimentacoes();
          return { openPanel: ensurePanel, closePanel, reapply, setEnabled: setMovimentacoesEnabled };

    }

    function removeStyleFromDoc(doc, styleId) {
        if (!doc) return;
        const style = doc.getElementById(styleId);
        if (style) style.remove();
    }

    function resetLayoutEffects() {
        unbindIframeLoadListener();
        if (iframeAvailabilityObserver) {
            iframeAvailabilityObserver.disconnect();
            iframeAvailabilityObserver = null;
        }
        if (standaloneDomObserver) {
            standaloneDomObserver.disconnect();
            standaloneDomObserver = null;
        }
        stopPopupContextObserver();
        if (mouseMoveListenerBound) {
            document.removeEventListener("mousemove", onDocumentMouseMove, { passive: true });
            mouseMoveListenerBound = false;
        }
        if (boundAutoHideIframeEl) {
            boundAutoHideIframeEl.removeEventListener("mouseenter", onIframeMouseEnter);
            boundAutoHideIframeEl = null;
        }
        removeStyleFromDoc(document, "projudi-top-header-style");
        removeStyleFromDoc(document, "projudi-ajuste-largura");
        restoreCustomHeaderStructure();
        if (movimentacoesModule) movimentacoesModule.setEnabled(false);
        if (popupHookCleanup) popupHookCleanup();
        removeProcessPopupUi();
        setHeaderHidden(false);
        updateHeaderRevealZone();

        const iframe = document.getElementById("Principal");
        if (iframe) {
            iframe.style.removeProperty("height");
            iframe.style.removeProperty("width");
            iframe.style.removeProperty("display");
            try {
                if (iframe.contentDocument) {
                    removeStyleFromDoc(iframe.contentDocument, "projudi-ajuste-largura");
                    removeNoScrollbarStyle(iframe.contentDocument);
                    teardownProcessMirrorPdfFeature(iframe.contentDocument);
                }
            } catch (_) {}
        }
    }

    function applySettingsNow() {
        if (!isTopWindow()) {
            safeRun("Falha ao aplicar configurações no iframe.", () => {
                if (settings.enabled) injectWidthCSS(document);
                else removeStyleFromDoc(document, "projudi-ajuste-largura");
                syncNoScrollbarForDoc(document);
                if (settings.enabled && settings.enableProcessMirrorPdf) initProcessMirrorPdfFeature(document);
                else teardownProcessMirrorPdfFeature(document);
                syncProcessPopupModeForDoc(document);
            });
            return;
        }

        if (!settings.enabled) {
            resetLayoutEffects();
            return;
        }

        registerMenu();
        injectTopHeaderCSS();
        syncTopObservers();
        syncNoScrollbarForCurrentIframe();
        if (isStandaloneContentPage()) injectWidthCSS(document);
        else removeStyleFromDoc(document, "projudi-ajuste-largura");
        syncPopupModeFromIframeContext();
        syncMovimentacoesModule();
        ajustarAlturaIframe();
        if (headerHidden && !settings.autoHideHeader) setHeaderHidden(false);
        updateHeaderRevealZone();
        injectCSSInIframe();
        if (shouldManageIframeFeatures()) retryInjectInIframe(3, 120);
    }

    function init() {
        if (isInitialized) return;
        isInitialized = true;
        registerMenu();
        if (isTopWindow()) {
            initTop();
        } else {
            initInsideFrame();
        }
        logInfo("Script inicializado.");
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(init, 300);
    } else {
        document.addEventListener("DOMContentLoaded", () => setTimeout(init, 300));
    }
})();
