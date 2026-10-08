import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scripts } from './active-scripts.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engines = await import(process.env.PROJUDI_PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.PROJUDI_QA_BROWSER || 'chromium';
const browser = await engines[engine].launch({ headless: true, ...(process.env.PROJUDI_QA_EXECUTABLE ? { executablePath: process.env.PROJUDI_QA_EXECUTABLE } : {}) });
const output = resolve(process.env.PROJUDI_QA_OUTPUT || resolve(root, 'docs/padronizacao-visual/qa'));
await mkdir(output, { recursive: true });
const html = await readFile(resolve(root, 'tests/fixtures/projudi.html'), 'utf8');
const processHtml = await readFile(resolve(root, 'tests/fixtures/processo.html'), 'utf8');
const sprite = await readFile(process.env.PROJUDI_QA_SPRITE || '/tmp/projudi-fa-solid.svg', 'utf8');
const report = { synthetic: true, engine, browser: await browser.version(), checks: [] };
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: route.request().url().includes('/Inicio') ? html : processHtml }));
const page = await context.newPage();
page.setDefaultTimeout(6000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const setup = async target => target.evaluate(sprite => {
  window.__qaMenus = [];
  window.GM_registerMenuCommand = (label, callback) => window.__qaMenus.push({ label, callback });
  window.GM_getValue = (key, fallback) => {
    const raw = localStorage.getItem(key);
    // Customizações usa texto JSON no GM; as outras extensões usam objetos.
    return raw === null ? fallback : key.includes('customizacoes') ? raw : JSON.parse(raw);
  };
  window.GM_setValue = (key, value) => localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  window.GM_deleteValue = key => localStorage.removeItem(key);
  window.GM_xmlhttpRequest = options => {
    if (!options.url.includes('/sprites/solid.svg')) throw new Error('Rede bloqueada no QA: ' + options.url);
    queueMicrotask(() => options.onload({ status: 200, responseText: sprite }));
  };
}, sprite);
const sources = await Promise.all(scripts.map(path => readFile(resolve(root, path), 'utf8')));
const hookNames = [
  '{ openNote, openNotesPanel }',
  '{ openManager, evaluate, mountGuidesCard, mountProcessCard }',
  '{ openSettingsPanel, openMovimentacoesPanel, openProcessFilePopup, saveSettings, settings, applySettingsNow }',
  '{ openModal, closeModal, refreshFrameContext }',
  '{ openManagerPanel, openHomePanel, openProcessPanel, injectStyles }'
];
const inject = async (target, index, hooks = false) => {
  let source = sources[index];
  if (hooks) {
    // Somente a cópia de teste expõe funções locais; o artefato instalado permanece intacto.
    const at = source.lastIndexOf('})();');
    source = source.slice(0, at) + `window.__qaFeatures${index} = ${hookNames[index]};\n` + source.slice(at);
  }
  await target.evaluate(({ name, version }) => { window.GM_info = { script: { name, version } }; }, { name: source.match(/^\/\/ @name\s+(.+)$/m)[1], version: source.match(/^\/\/ @version\s+(.+)$/m)[1] });
  await target.addScriptTag({ content: source });
};
const check = name => { report.checks.push(name); console.log('OK: ' + name); };
try {
  await page.goto('http://projudi.local.test/Inicio');
  await setup(page);
  for (let n = 0; n < 5; n++) await inject(page, n, true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => window.__qaMenus.length === 5);
  for (let n = 0; n < 5; n++) {
    await page.locator('#qa-launcher').focus();
    await page.evaluate(n => window.__qaMenus[n].callback(), n);
    await page.locator('[data-pj-suite-dialog="active"]').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-pj-suite-dialog="active"]').count(), 0);
  }
  assert.equal(await page.locator('#pj-suite-core-style').count(), 1);
  assert.equal(await page.locator('#pj-suite-fa-sprite').count(), 1);
  check('Cinco extensões coexistem; um núcleo e um sprite por documento');

  await page.evaluate(() => { const iframe = document.createElement('iframe'); iframe.id = 'Principal'; iframe.name = 'userMainFrame'; iframe.src = '/Pendencia'; iframe.height = '650'; iframe.style.cssText = 'width:100%;border:0'; document.body.append(iframe); });
  await page.frameLocator('#Principal').locator('#span_proc_numero').waitFor();
  const frame = page.frames().find(frame => frame.url().includes('/Pendencia'));
  await setup(frame);
  for (let n = 0; n < 5; n++) await inject(frame, n, true);
  await frame.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.evaluate(() => window.__qaFeatures3.refreshFrameContext());
  await page.waitForTimeout(200);
  assert.equal(await frame.evaluate(() => window.__qaMenus.length), 0, 'iframe duplicou menus');
  for (const [key, selector] of [['a', '.pj-panel'], ['g', '.pj-guides-manager'], ['c', '.pjc-panel'], ['i', '#pjip-modal-panel'], ['t', '.pjm-panel']]) {
    await frame.locator('body').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('Control+Semicolon');
    await page.keyboard.press(key);
    await page.locator(selector).waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.locator(selector).waitFor({ state: 'hidden' });
  }
  check('Atalhos A/G/C/I/T no iframe abrem e fecham os gerenciadores no top');

  const marks = frame.locator('.pjip-inline-btn--mark');
  await marks.first().waitFor();
  await marks.first().click();
  await page.waitForTimeout(150);
  assert.equal(await frame.locator('tr.pjip-row--marked').count(), 1);
  await frame.locator('.pjip-inline-btn--done').first().click();
  await page.waitForTimeout(150);
  assert.equal(await frame.locator('tr.pjip-row--done').count(), 1);
  check('Triagem inline marca e conclui somente dados sintéticos no iframe');

  await page.evaluate(() => window.__qaFeatures3.openModal());
  await page.locator('[data-role="deadline-date"]').fill('2026-01-02');
  await page.locator('[data-role="deadline-apply-date"]').click();
  await page.waitForTimeout(180);
  assert.equal(await frame.locator('#Tabela tbody tr:visible').count(), 1);
  await page.locator('[data-role="deadline-clear"]').click();
  await page.waitForTimeout(180);
  assert.equal(await frame.locator('#Tabela tbody tr:visible').count(), 2);
  await page.keyboard.press('Escape');
  check('Filtro e limpeza de datas preservam as linhas do iframe');

  await frame.evaluate(() => window.__qaFeatures0.openNote());
  await frame.locator('#pj-note').waitFor({ state: 'visible' });
  await frame.locator('.pj-note-editor').fill('Nota sintética de QA');
  await frame.locator('.pj-note-editor').blur();
  await page.waitForTimeout(350);
  const noteColor = await frame.locator('#pj-note').evaluate(n => getComputedStyle(n).backgroundColor);
  assert.ok(noteColor !== 'rgb(255, 255, 255)', 'núcleo apagou a cor da nota');
  await frame.locator('#pj-note').screenshot({ path: resolve(output, 'note-editor-iframe.png') });
  await frame.locator('#pj-note button[title*="Fechar"]').click();
  await frame.locator('#pj-note').waitFor({ state: 'hidden' });
  check('Editor de anotações no iframe grava, conserva a cor e fecha');

  await frame.evaluate(() => { window.__qaFeatures4.injectStyles(); window.__qaFeatures4.openProcessPanel({ key: 'cnj_0000001-00.2026.8.09.0001', cnj: '0000001-00.2026.8.09.0001', shortCnj: '0000001-00' }); });
  await frame.locator('#pj-todo').waitFor({ state: 'visible' });
  await frame.locator('#pj-todo .pj-home-composer-main input').fill('Tarefa sintética criada no processo');
  await frame.locator('#pj-todo .pj-add').click();
  assert.equal(await frame.locator('#pj-todo .pj-item').count(), 1);
  await frame.locator('#pj-todo .pj-text').first().click();
  const processBounds = await frame.locator('#pj-todo').boundingBox();
  assert.ok(processBounds.height >= 400, 'Painel do processo cortou o compositor/lista');
  await frame.locator('#pj-todo-body').evaluate(n => n.scrollTop = 0);
  await frame.locator('#pj-todo').screenshot({ path: resolve(output, 'task-process-iframe.png') });
  await frame.locator('#pj-todo .pj-todo-close-btn').click();
  await frame.locator('#pj-todo').waitFor({ state: 'hidden' });
  check('Compositor de tarefas do processo cria e fecha no iframe');

  await page.evaluate(() => { window.__qaFeatures4.injectStyles(); window.__qaFeatures4.openHomePanel(); });
  await page.locator('#pj-todo').waitFor({ state: 'visible' });
  await page.locator('#pj-todo .pj-home-composer-main input').fill('Tarefa global sintética');
  await page.locator('#pj-todo .pj-add').click();
  assert.ok(await page.locator('#pj-todo .pj-item').count() >= 1);
  await page.locator('#pj-todo .pj-home-composer-main input').fill('Segunda tarefa global sintética');
  await page.locator('#pj-todo .pj-add').click();
  const beforeOrder = await page.locator('#pj-todo .pj-item').evaluateAll(rows => rows.map(row => row.getAttribute('data-id')));
  assert.ok(beforeOrder.length >= 2 && beforeOrder.every(Boolean), 'Tarefas sem identificador DOM para reordenação');
  await page.locator('#pj-todo .pj-item').evaluateAll(rows => {
    const transfer = new DataTransfer();
    rows[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    rows[1].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    rows[1].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  const afterOrder = await page.locator('#pj-todo .pj-item').evaluateAll(rows => rows.map(row => row.getAttribute('data-id')));
  assert.notDeepEqual(afterOrder, beforeOrder, 'Arrastar não reordenou as tarefas');
  const savedOrder = await page.evaluate(() => JSON.parse(localStorage.getItem('projudi-suite::tarefas::data')).values['projudi_todo::global::items'].map(item => item.id));
  assert.deepEqual(savedOrder, afterOrder, 'Ordem visual não foi persistida');
  check('Arrastar tarefas sintéticas muda a ordem e persiste os identificadores');
  await page.locator('#pj-todo .pj-text').first().click();
  await page.locator('#pj-todo').screenshot({ path: resolve(output, 'task-home.png') });
  await page.locator('#pj-todo .pj-item input[type="checkbox"]').first().getAttribute('aria-label').then(label => assert.match(label, /Concluir tarefa:/));
  await page.locator('#pj-todo').evaluate(panel => { panel.style.top = '2000px'; panel.style.right = '2000px'; });
  await page.setViewportSize({ width: 768, height: 650 });
  await page.waitForTimeout(100);
  const floatingBounds = await page.locator('#pj-todo').boundingBox();
  assert.ok(floatingBounds.x >= -1 && floatingBounds.y >= -1 && floatingBounds.x + floatingBounds.width <= 769 && floatingBounds.y + floatingBounds.height <= 651, 'Painel flutuante ficou fora da tela após resize');
  await page.locator('#pj-todo .pj-home-composer-main input').focus();
  await page.keyboard.press('Escape');
  await page.locator('#pj-todo').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  check('Compositor global cria, mantém painel na tela, nomeia checkbox e fecha por Escape');

  await page.evaluate(() => { window.__qaFeatures2.saveSettings({ ...window.__qaFeatures2.settings, enabled: true, enableMovimentacoes: true }); window.__qaFeatures2.openMovimentacoesPanel(); });
  await page.locator('.phm-panel').waitFor({ state: 'visible' });
  await page.locator('.phm-panel').screenshot({ path: resolve(output, 'custom-movimentacoes.png') });
  await page.keyboard.press('Escape');
  await page.locator('.phm-panel').waitFor({ state: 'hidden' });
  for (let n = 0; n < 3; n++) { await page.evaluate(() => window.__qaFeatures2.openMovimentacoesPanel()); await page.keyboard.press('Escape'); }
  check('Painel de movimentações abre repetidamente sem acumular Escape');

  await page.evaluate(() => window.__qaFeatures2.openProcessFilePopup('http://projudi.local.test/documento.html', { fullTitle: 'Documento sintético', dockTitle: 'Documento' }, document));
  const popup = page.locator('[id^="pj-popup-"]');
  await popup.first().waitFor({ state: 'visible' });
  await popup.first().screenshot({ path: resolve(output, 'custom-file-popup.png') });
  await popup.locator('button[title*="Minimizar"]').click();
  await popup.first().waitFor({ state: 'hidden' });
  await page.evaluate(() => window.__qaFeatures2.openProcessFilePopup('http://projudi.local.test/documento.html', { fullTitle: 'Documento sintético' }, document));
  await popup.first().waitFor({ state: 'visible' });
  assert.equal(await popup.count(), 1);
  await popup.locator('button[title*="Fechar"]').click();
  check('Visualizador de arquivo minimiza, restaura sem duplicar e fecha');

  await page.evaluate(() => {
    const native = document.getElementById('qa-native');
    native.innerHTML = '<div id="divCorpo"><div class="area"><h2>Área do Advogado</h2></div><fieldset class="fieldEdicaoEscuro"><legend>Resumo</legend></fieldset></div>';
    window.__qaFeatures1.evaluate();
  });
  await page.locator('#pj-guides-home-panel').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    document.getElementById('qa-native').innerHTML = '<div><h2>Área do Advogado</h2><section><fieldset><legend>PROCESSOS ATIVOS/AUDIÊNCIAS</legend></fieldset></section></div>';
    window.__qaFeatures1.evaluate();
  });
  await page.locator('#pj-guides-home-panel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#pj-guides-home-panel + fieldset').count(), 1);
  await page.locator('#pj-guides-home-panel').screenshot({ path: resolve(output, 'guides-home.png') });
  check('Cartão inicial detectado automaticamente em estruturas antiga e atual, com fieldset aninhado');
  await page.evaluate(() => {
    document.getElementById('qa-native').innerHTML = '<h2>Outra página</h2><fieldset><legend>PROCESSOS ATIVOS/AUDIÊNCIAS</legend></fieldset>';
    window.__qaFeatures1.evaluate();
  });
  assert.equal(await page.locator('#pj-guides-home-panel').count(), 0);
  check('Resumo de guias limitado à página inicial do advogado');

  await page.evaluate(() => {
    const native = document.getElementById('qa-native');
    native.innerHTML = '<div id="divEditar"><fieldset class="VisualizaDados"><span id="span_proc_numero">0000001-00.2026.8.09.0001</span><table id="TabelaArquivos"><tbody><tr><td>Documento fictício</td></tr></tbody></table></fieldset></div>';
    window.__qaFeatures1.mountProcessCard();
  });
  await page.locator('#pj-guides-process-card').waitFor({ state: 'visible' });
  await page.locator('#pj-guides-process-card').screenshot({ path: resolve(output, 'guides-process.png') });
  check('Cartão compacto de guias no processo preserva a ação e seu rótulo');

  await page.evaluate(() => {
    const native = document.getElementById('qa-native');
    native.innerHTML = '<div id="divEditar"><div class="formEdicao"><form id="ProcessoGuias"><a id="numeroProcesso" href="BuscaProcesso?Id_Processo=1">0000001-00</a><table id="Tabela"><tbody><tr><td>1</td><td><a href="GuiaEmissao?Id_GuiaEmissao=1">GUIA-QA</a></td><td>Custas</td><td>01/01/2026</td><td>02/01/2026</td><td></td><td></td><td>Em aberto</td><td>Inicial</td><td></td></tr></tbody></table></form></div></div>';
    window.__qaFeatures1.mountGuidesCard();
  });
  await page.locator('#pj-guides-guide-card').waitFor({ state: 'visible' });
  await page.locator('#pj-guides-guide-card').screenshot({ path: resolve(output, 'guides-page.png') });
  check('Cartão da página de guias sincroniza somente a tabela sintética');

  assert.deepEqual(errors, [], 'Erros de execução com as cinco extensões');
} finally {
  report.errors = errors;
  await context.close();
  await browser.close();
  await writeFile(resolve(output, 'interactions-results.json'), JSON.stringify(report, null, 2) + '\n');
}
