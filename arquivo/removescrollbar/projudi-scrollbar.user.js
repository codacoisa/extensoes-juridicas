// ==UserScript==
// @name         Remove Scrollbar
// @namespace    projudi-scrollbar.user.js
// @version      1.2
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Esconde as barras do iframe, mantendo o scroll.
// @author       lourencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/5ed42604857f11f1a92226196f636d0d/raw/projudi-scrollbar.user.js
// @downloadURL  https://gist.githubusercontent.com/lourencosv/5ed42604857f11f1a92226196f636d0d/raw/projudi-scrollbar.user.js
// @match        *://projudi.tjgo.jus.br/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SELECTOR = 'iframe#Principal.Tela, iframe#Principal';
  const STYLE_ID = 'tm-no-scrollbar-style';
  const CSS = 'html,body{-ms-overflow-style:none!important;scrollbar-width:none!important;}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;background:transparent!important;}';
  const BIND_DEBOUNCE_MS = 80;

  let initialized = false;
  let rootObserver = null;
  let bindTimer = null;
  const boundIframes = new WeakSet();

  function inject(doc) {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
    doc.documentElement.style.overflowY = 'auto';
    doc.documentElement.style.overflowX = 'hidden';
    if (doc.body) {
      doc.body.style.overflowY = 'auto';
      doc.body.style.overflowX = 'hidden';
    }
  }

  function findIframe() {
    return document.querySelector(SELECTOR);
  }

  function applyToIframe(iframe) {
    if (!iframe) return;
    try {
      inject(iframe.contentDocument);
    } catch (_) {}
  }

  function bind(iframe) {
    if (!iframe) return;
    if (boundIframes.has(iframe)) {
      applyToIframe(iframe);
      return;
    }
    boundIframes.add(iframe);
    applyToIframe(iframe);
    iframe.addEventListener('load', () => applyToIframe(iframe), { passive: true });
  }

  function scheduleBind() {
    if (bindTimer) clearTimeout(bindTimer);
    bindTimer = setTimeout(() => {
      bindTimer = null;
      bind(findIframe());
    }, BIND_DEBOUNCE_MS);
  }

  function mutationIsRelevant(mutations) {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      if (!mutation.addedNodes.length && !mutation.removedNodes.length) continue;

      const changedNodes = [mutation.target, ...mutation.addedNodes, ...mutation.removedNodes];
      for (const node of changedNodes) {
        if (!node || node.nodeType !== 1) continue;
        const el = node;
        if (el.matches && el.matches(SELECTOR)) return true;
        if (el.querySelector && el.querySelector(SELECTOR)) return true;
      }
    }
    return false;
  }

  function cleanup() {
    if (bindTimer) {
      clearTimeout(bindTimer);
      bindTimer = null;
    }
    if (rootObserver) {
      rootObserver.disconnect();
      rootObserver = null;
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    bind(findIframe());
    rootObserver = new MutationObserver((mutations) => {
      if (mutationIsRelevant(mutations)) scheduleBind();
    });
    rootObserver.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('pagehide', cleanup, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
