// ==UserScript==
// @name         Projudi - Remove Scrollbar
// @namespace    projudi-scrollbar.user.js
// @version      1.0
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Esconde as barras do iframe, mantendo o scroll.
// @author       lourencosv (GPT)
// @license      CC BY-NC 4.0
// @updateURL    https://gist.githubusercontent.com/lourencosv/5ed42604857f11f1a92226196f636d0d/raw
// @downloadURL  https://gist.githubusercontent.com/lourencosv/5ed42604857f11f1a92226196f636d0d/raw
// @match        *://projudi.tjgo.jus.br/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SELECTOR = 'iframe#Principal.Tela, iframe#Principal';

  function injectCSS(doc) {
    if (!doc || doc.getElementById('tm-no-scrollbar-style')) return;

    const css = `
      /* Firefox / IE legado */
      html, body { -ms-overflow-style: none !important; scrollbar-width: none !important; }
      /* WebKit */
      html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }
    `;
    const st = doc.createElement('style');
    st.id = 'tm-no-scrollbar-style';
    st.textContent = css;
    (doc.head || doc.documentElement).appendChild(st);

    // Mantém rolagem vertical ativa e esconde horizontal
    doc.documentElement.style.overflowY = 'auto';
    doc.documentElement.style.overflowX = 'hidden';
    if (doc.body) {
      doc.body.style.overflowY = 'auto';
      doc.body.style.overflowX = 'hidden';
    }
  }

  function apply() {
    const iframe = document.querySelector(SELECTOR);
    if (!iframe) return;
    try { injectCSS(iframe.contentDocument); } catch (_) {}
  }

  function init() {
    const iframe = document.querySelector(SELECTOR);
    if (!iframe) return;
    // Aplica agora (se já carregado) e também a cada load
    apply();
    iframe.addEventListener('load', apply);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
