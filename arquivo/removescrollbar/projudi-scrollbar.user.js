// ==UserScript==
// @name         Remove Scrollbar
// @namespace    projudi-scrollbar.user.js
// @version      1.1
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

  function bind(iframe) {
    if (!iframe || iframe.dataset.tmScrollbarBound === '1') return;
    iframe.dataset.tmScrollbarBound = '1';
    const apply = () => {
      try {
        inject(iframe.contentDocument);
      } catch (_) {}
    };
    apply();
    iframe.addEventListener('load', apply, { passive: true });
  }

  function init() {
    bind(document.querySelector(SELECTOR));
    const observer = new MutationObserver(() => bind(document.querySelector(SELECTOR)));
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
