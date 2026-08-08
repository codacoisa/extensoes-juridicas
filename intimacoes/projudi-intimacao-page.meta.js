// ==UserScript==
// @name         Intimações
// @namespace    projudi-intimacao-page.user.js
// @version      2026.08.07-22:19
// @icon         https://img.icons8.com/ios-filled/100/scales--v1.png
// @description  Reúne intimações, exporta CSV/PDF, permite triagem local e destaca/filtra prazos do Projudi.
// @author       lourencosv
// @contributor  Codex <codex@openai.com>
// @contributor  Claude <noreply@anthropic.com>
// @license      CC BY-NC 4.0
// @updateURL    https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/intimacoes/projudi-intimacao-page.meta.js
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
