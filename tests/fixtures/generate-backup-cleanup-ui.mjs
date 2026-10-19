import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

// Executa somente helpers de apresentação extraídos dos scripts. Não carrega seus
// bootstraps, armazenamento, requisições nem operações de limpeza reais.
const repo = fileURLToPath(new URL('../../', import.meta.url));
const output = path.resolve(process.argv[2] || path.join(repo, '../ui-fixture.html'));
const specs = [
  ['anotacoes/projudi-anotacoes-locais.user.js', 'Anotações', 'pj-notes-panel', 'scope'],
  ['centraldeguias/projudi-central-guias.user.js', 'Central de Guias', 'pj-guides-fixture', 'description'],
  ['customizacoes/projudi-customizacoes.user.js', 'Customizações', 'pjc-fixture', 'description'],
  ['intimacoes/projudi-intimacao-page.user.js', 'Intimações', 'pjip-fixture', 'settings'],
  ['tarefas/projudi-tarefas-locais.user.js', 'Tarefas', 'pj-task-manager-overlay', 'scope']
];

function declaration(source, name) {
  const match = source.match(new RegExp(`^( *)function ${name}\\(`, 'm'));
  if (!match) throw new Error(`Helper ausente: ${name}`);
  const start = match.index;
  const end = source.indexOf(`\n${match[1]}}`, start);
  if (end < 0) throw new Error(`Fim do helper ausente: ${name}`);
  return source.slice(start, end + match[1].length + 2);
}

function cssDeclaration(source, name) {
  const start = source.indexOf(`const ${name} = String.raw\``);
  const end = source.indexOf('`;', start);
  if (start < 0 || end < 0) throw new Error(`CSS ausente: ${name}`);
  return source.slice(start, end + 2);
}

function json(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

const bundles = [];
for (const [file, name, id, kind] of specs) {
  const source = await readFile(path.join(repo, file), 'utf8');
  const helpers = source.slice(source.indexOf('// BEGIN SUITE_UI_HELPERS'), source.indexOf('// END SUITE_UI_HELPERS'));
  const helper = kind === 'description' ? 'confirmExtensionCleanup' : 'confirmExtensionDataClear';
  const ownCss = source.split('\n').filter(line => /^\s*#.*\.(pj-notes|pjm)-clear-confirm/.test(line)).join('\n');
  let descriptions = null;
  if (kind === 'description') {
    descriptions = [...source.matchAll(/confirmExtensionCleanup\(panel, ('[^']*'),\s*('[^']*'|`[^`]*`)\)/g)].map(match =>
      vm.runInNewContext(`[${match[1]}, ${match[2]}]`, {
        target: { fileName: 'fixture-sem-dados.json', gistId: 'fixture-sem-rede' }
      })
    );
    if (descriptions.length !== 2) throw new Error(`Avisos de ${name}: esperados 2, encontrados ${descriptions.length}`);
  }
  bundles.push(`(() => {
    ${cssDeclaration(source, 'SUITE_UI_CSS')}
    ${cssDeclaration(source, 'BACKUP_UI_CSS')}
    const fontAwesomeRoots = new WeakMap();
    ${helpers}
    ${declaration(source, helper)}
    function renderFontAwesome(root) {
      root.querySelectorAll('i').forEach(icon => {
        const symbol = root.ownerDocument.createElement('span');
        symbol.textContent = '⚠';
        symbol.setAttribute('aria-hidden', 'true');
        icon.replaceWith(symbol);
      });
    }
    const style = document.createElement('style');
    style.textContent = SUITE_UI_CSS + BACKUP_UI_CSS + ${json(ownCss)};
    document.head.appendChild(style);
    const descriptions = ${json(descriptions)};
    return {
      name: ${json(name)}, id: ${json(id)},
      open(host, scope) {
        ${kind === 'description' ? `return ${helper}(host, ...descriptions[scope === 'local' ? 0 : 1]);` : kind === 'settings' ? `return ${helper}(host, scope === 'remote', { fileName: 'fixture-sem-dados.json' });` : `return ${helper}(host, scope);`}
      }
    };
  })()`);
}

const runtime = `
  'use strict';
  const extensions = [${bundles.join(',\n')}];
  const results = [];
  const memory = new Map();
  window.fixtureResults = results;
  window.fixtureMemory = memory;
  function record(name, ok, detail = '') {
    results.push({ name, ok, detail });
    const row = document.createElement('li');
    row.className = ok ? 'pass' : 'fail';
    row.textContent = (ok ? 'PASS — ' : 'FAIL — ') + name + (detail ? ': ' + detail : '');
    document.querySelector('#results').appendChild(row);
    const failures = results.filter(result => !result.ok).length;
    document.querySelector('#summary').textContent = results.length + ' verificações; ' + failures + ' falhas';
    document.querySelector('#summary').className = failures ? 'fail' : 'pass';
  }
  function assert(value, message) { if (!value) throw new Error(message); }
  function current(host) { return host.querySelector('[data-pj-suite-dialog="active"]'); }
  function key(dialog, name, shiftKey = false) {
    dialog.ownerDocument.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }));
  }
  function createCard(extension) {
    const host = document.createElement('section');
    host.id = extension.id;
    host.className = 'fixture-card';
    host.setAttribute('data-pj-suite-ui', 'fixture');
    host.innerHTML = '<h2></h2><div data-role="backup-panel"><div class="fixture-actions"></div></div><p class="fixture-outcome">Nenhuma ação executada.</p>';
    host.querySelector('h2').textContent = extension.name;
    const fileIds = extension.id === 'pj-notes-panel' ? ['pj-notes-backup-file'] : extension.id === 'pj-task-manager-overlay' ? ['pjm-backup-file-name'] : [];
    for (const id of fileIds) {
      const file = document.createElement('input');
      file.id = id;
      file.type = 'hidden';
      file.value = 'fixture-sem-dados.json';
      host.appendChild(file);
    }
    for (const scope of ['local', 'remote']) {
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.dataset.scope = scope;
      trigger.textContent = 'Limpar dados ' + (scope === 'local' ? 'locais' : 'remotos');
      trigger.addEventListener('click', async () => {
        if (host.dataset.busy === 'true') return;
        host.dataset.busy = 'true';
        try {
          const confirmed = await extension.open(host, scope);
          if (confirmed) memory.set(extension.name + ':' + scope, []);
          host.querySelector('.fixture-outcome').textContent = confirmed ? 'Confirmado somente na memória da fixture (' + scope + ').' : 'Cancelado; memória preservada.';
        } finally { host.dataset.busy = 'false'; }
      });
      host.querySelector('.fixture-actions').appendChild(trigger);
    }
    document.querySelector('#cards').appendChild(host);
    return host;
  }
  async function check(extension, host, scope) {
    const label = extension.name + ' / ' + scope;
    const trigger = host.querySelector('[data-scope="' + scope + '"]');
    let pending;
    try {
      trigger.focus();
      pending = extension.open(host, scope);
      let dialog = current(host);
      assert(dialog, 'diálogo ausente');
      const [cancel, confirm] = dialog.querySelectorAll('button');
      assert(cancel.textContent.trim() === 'Cancelar', 'primeira ação deve ser Cancelar');
      assert(document.activeElement === cancel, 'Cancelar deve receber foco inicial');
      assert(dialog.getAttribute('aria-modal') === 'true', 'aria-modal ausente');
      const description = document.getElementById(dialog.getAttribute('aria-describedby'));
      assert(description && description.textContent.length > 80, 'descrição de alcance ausente');
      assert(description.textContent.includes('preservad'), 'preservação não descrita');
      assert(/irreversível|não pode ser desfeit/i.test(description.textContent), 'irreversibilidade não descrita');
      assert(getComputedStyle(description).color === 'rgb(180, 35, 24)', 'aviso deve ser vermelho');
      assert(dialog.querySelector('svg[aria-hidden="true"] path[d]'), 'ícone SVG local de atenção ausente');
      key(dialog, 'Tab');
      assert(document.activeElement === confirm, 'Tab deve avançar à confirmação');
      key(dialog, 'Tab');
      assert(document.activeElement === cancel, 'Tab deve circular ao Cancelar');
      key(dialog, 'Tab', true);
      assert(document.activeElement === confirm, 'Shift+Tab deve circular à confirmação');
      key(dialog, 'Escape');
      assert(await pending === false, 'Escape deve cancelar');
      assert(!current(host), 'Escape deve remover diálogo');
      assert(document.activeElement === trigger, 'Escape deve restaurar foco');
      record(label + ' / teclado, aviso e foco', true);
      trigger.focus();
      pending = extension.open(host, scope);
      current(host).querySelector('button').click();
      assert(await pending === false, 'Cancelar deve resolver false');
      assert(document.activeElement === trigger, 'Cancelar deve restaurar foco');
      record(label + ' / Cancelar', true);
      trigger.focus();
      pending = extension.open(host, scope);
      current(host).querySelectorAll('button')[1].click();
      assert(await pending === true, 'Confirmar deve resolver true');
      assert(!current(host), 'Confirmar deve remover diálogo');
      assert(document.activeElement === trigger, 'Confirmar deve restaurar foco');
      record(label + ' / Confirmar sem executar limpeza', true);
    } catch (error) {
      const dialog = current(host);
      if (dialog) key(dialog, 'Escape');
      if (pending) await pending;
      record(label, false, error.message);
    }
  }
  (async () => {
    for (const extension of extensions) {
      const host = createCard(extension);
      for (const scope of ['local', 'remote']) await check(extension, host, scope);
    }
    window.fixtureDone = true;
  })();
`;

function documentHtml(title, iframe = '') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self' about:; connect-src 'none'; img-src 'none'; font-src 'none'">
<title>${title}</title><style>
body{margin:0;padding:24px;background:#edf2f8;color:#173a61;font:15px/1.5 system-ui,sans-serif}main{max-width:1100px;margin:auto}h1{margin:0 0 8px;font-size:24px}h2{font-size:17px;margin:0 0 12px}.notice{padding:12px;background:#fff;border:1px solid #c7d6e6;border-radius:10px}#cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.fixture-card{padding:16px;background:#fff;border:1px solid #c7d6e6;border-radius:12px}.fixture-actions{display:flex;flex-wrap:wrap;gap:8px}.fixture-actions button{padding:9px 12px;border:1px solid #b42318;background:#fff7f7;color:#b42318;border-radius:8px;cursor:pointer;font:inherit}.fixture-actions button:focus-visible{outline:3px solid #1f69d5;outline-offset:2px}.fixture-outcome{font-size:12px}.pass{color:#146b3a}.fail{color:#b42318}#results{font-size:12px;columns:2;padding-left:22px}li{break-inside:avoid}iframe{width:100%;height:760px;border:2px solid #90a7c0;border-radius:12px;background:white}svg.pj-suite-fa{width:1em;height:1em;fill:currentColor}@media(max-width:600px){body{padding:12px}#results{columns:1}}
</style></head><body><main><h1>${title}</h1><p class="notice">Fixture isolada. Helpers e estilos extraídos dos cinco scripts. Nenhum bootstrap, dado de usuário, credencial, armazenamento persistente ou acesso à rede. Confirmar altera somente memória de demonstração.</p><p id="summary" aria-live="polite">Executando autoverificações...</p><div id="cards"></div><details open><summary>Resultados de teclado, aviso, resolução e retorno do foco</summary><ol id="results"></ol></details>${iframe}</main><script>${runtime.replaceAll('</script', '<\\/script')}</script></body></html>`;
}

const child = documentHtml('Confirmações — iframe isolado');
const escapedChild = child.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const html = documentHtml('Confirmações — página principal', `<h2>Mesmo teste em iframe same-origin</h2><iframe title="Confirmações no iframe isolado" srcdoc="${escapedChild}"></iframe>`);
await writeFile(output, html);
console.log(`Fixture gerada: ${output}`);
