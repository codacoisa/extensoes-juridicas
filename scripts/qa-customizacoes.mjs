// Perfis descartáveis, requisições interceptadas e dados fictícios.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engines = await import(process.env.PROJUDI_PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.PROJUDI_QA_BROWSER || 'chromium';
const browser = await engines[engine].launch({ headless: true, ...(process.env.PROJUDI_QA_EXECUTABLE ? { executablePath: process.env.PROJUDI_QA_EXECUTABLE } : {}) });
const output = resolve(process.env.PROJUDI_QA_OUTPUT || '/tmp/projudi-customizacoes-qa');
await mkdir(output, { recursive: true });
const html = await readFile(resolve(root, 'tests/fixtures/processo.html'), 'utf8');
const sprite = await readFile(process.env.PROJUDI_QA_SPRITE || '/tmp/projudi-fa-solid.svg', 'utf8');
const paths = ['customizacoes/projudi-customizacoes.user.js', 'intimacoes/projudi-intimacao-page.user.js'];
const sources = await Promise.all(paths.map(path => readFile(resolve(process.env.PROJUDI_QA_SOURCE_ROOT || root, path), 'utf8')));
const instrument = (source, name, hooks) => { const at = source.lastIndexOf('})();'); return source.slice(0, at) + `window.${name} = ${hooks};\n` + source.slice(at); };
const customSource = instrument(sources[0], '__qaCustom', '{ openSettingsPanel, saveSettings, applySettingsNow, injectWidthCSS, resetLayoutEffects, syncNativePopupTableContext, syncModernTableSemantics }');
const intimSource = instrument(sources[1], '__qaIntim', '{ openModal, closeModal, refreshFrameContext }');
const report = { synthetic: true, engine, browser: await browser.version(), checks: [], errors: [] };
const profiles = [
  { id: 'moderno', settings: { modernVisualEnabled: true } },
  { id: 'tabelas', settings: { modernTablesEnabled: true, stickyTableHeadersEnabled: true, highlightHoveredRowEnabled: true } },
  { id: 'formularios', settings: { modernFormsEnabled: true } },
  { id: 'completo', settings: { modernVisualEnabled: true, modernTablesEnabled: true, modernFormsEnabled: true, compactMode: true, fontScaleEnabled: true, fontScalePercent: 120, stickyTableHeadersEnabled: true, highlightHoveredRowEnabled: true, enableWidthAdjustments: true, contentWidthPercent: 90 } }
];
const check = (name, details = {}) => { report.checks.push({ name, ...details }); console.log('OK:', name, JSON.stringify(details)); };
const setup = async (target, settings) => target.evaluate(({ sprite, settings }) => {
  window.__qaSettings = settings;
  window.GM_getValue = (key, fallback) => key === 'projudi-suite::customizacoes::data' ? JSON.stringify(window.__qaSettings) : fallback;
  window.GM_setValue = (key, value) => { if (key === 'projudi-suite::customizacoes::data') window.__qaSaved = typeof value === 'string' ? JSON.parse(value) : value; };
  window.GM_registerMenuCommand = () => {};
  window.GM_xmlhttpRequest = options => queueMicrotask(() => options.url.includes('/sprites/solid.svg') ? options.onload({ status: 200, responseText: sprite }) : options.onerror?.());
}, { sprite, settings });
const surfaceSnapshot = target => target.evaluate(() => [...document.querySelectorAll('#qa-suite-surface, #qa-suite-surface *')].map(node => {
  const s=getComputedStyle(node);return {tag:node.tagName,color:s.color,background:s.backgroundColor,padding:s.padding,border:s.borderColor,fontSize:s.fontSize};
}));
const snapshot = target => target.evaluate(() => {
  const selectors = ['#pjip-modal-panel', '.pjip-modal-title', '.pjip-modal-head', '[data-role="search"]', '.pjip-stat', '.pjip-deadline'];
  return selectors.map(selector => { const s = getComputedStyle(document.querySelector(selector)); return { selector, color:s.color, background:s.backgroundColor, border:s.borderColor, padding:s.padding, font:s.fontFamily, fontSize:s.fontSize }; });
});
try {
  for (const framed of [false, true]) for (const order of [[0,1],[1,0]]) for (const width of [1440,768,390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: route.request().url().includes('/Wrapper') ? '<!doctype html><html><head></head><body style="margin:0"><iframe id="Principal" name="userMainFrame" src="/Pendencia" style="width:100%;height:850px;border:0"></iframe></body></html>' : html }));
    const page = await context.newPage(); page.setDefaultTimeout(6000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://projudi.local.test/' + (framed ? 'Wrapper' : 'Usuario?PaginaAtual=-10'));
    if (framed) await page.frameLocator('#Principal').locator('#Tabela').waitFor();
    const target = framed ? page.frames().find(frame => frame.url().includes('/Pendencia')) : page;
    const base = { enabled:true, applyToStandalonePages:true, enableWidthAdjustments:false, enableProcessMirrorPdf:false };
    await setup(page, base); if (framed) await setup(target, base);
    for (const index of order) await page.addScriptTag({ content:index === 0 ? customSource : intimSource });
    await page.waitForFunction(() => !!window.__qaCustom && !!window.__qaIntim);
    await page.waitForTimeout(350);
    await page.evaluate(() => window.__qaIntim.openModal());
    await page.locator('#pjip-modal-panel').waitFor({ state:'visible' });
    const original = await snapshot(page);
    await target.evaluate(() => {
      const surface=document.createElement('section');surface.id='qa-suite-surface';surface.dataset.pjSuiteUi='fixture';
      surface.style.cssText='font-size:14px;color:#213345;font-family:Arial;background:white';
      surface.innerHTML='<div class="wrapper"><h2>Título de extensão</h2><fieldset><legend>Campos de extensão</legend><input value="Sintético"></fieldset><div role="tablist"><button role="tab" aria-selected="true">Aba</button></div><table class="Tabela"><tr><th>Qtde</th></tr><tr><td>2</td></tr></table></div>';
      surface.hidden=true;document.body.append(surface);
    });
    const ownStyles=await surfaceSnapshot(target);
    // Semântica real da tabela gerenciada por Intimações, no iframe.
    const managed = framed ? await target.locator('#Tabela').evaluate(node => node.classList.contains('pjip-table')) : false;
    if (framed) assert.equal(managed,true,'Intimações não preparou a tabela do iframe');
    const nativeBefore = await target.locator('#Tabela th').first().evaluate(n => { const s=getComputedStyle(n); return { padding:s.padding, background:s.backgroundColor }; });
    for (const profile of profiles) {
      await page.evaluate(({ base, profile, framed }) => {
        window.__qaCustom.saveSettings({ ...base, ...profile.settings });
        window.__qaCustom.applySettingsNow();
        window.__qaCustom.injectWidthCSS(framed ? document.getElementById('Principal').contentDocument : document);
      }, { base, profile, framed });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.deepEqual(await snapshot(page), original, 'Tema alterou os componentes de Intimações');
      assert.deepEqual(await surfaceSnapshot(target),ownStyles,'Tema invadiu superfície isolada de extensão');
      assert.equal(await page.locator('#pjip-modal-panel').evaluate(n=>n.scrollWidth <= n.clientWidth+1), true);
      if (managed) assert.deepEqual(await target.locator('#Tabela th').first().evaluate(n => { const s=getComputedStyle(n); return { padding:s.padding, background:s.backgroundColor }; }), nativeBefore, 'Tema alterou tabela gerenciada por Intimações');
      await page.locator('[data-role="search"]').fill('sintético');
      await page.locator('[data-role="search"]').fill('');
      await page.locator('[data-role="deadline-date"]').fill('2026-01-02');
      if (framed) {
        await page.locator('[data-role="deadline-apply"]').click();
        assert.equal(await target.locator('#Tabela tbody tr:visible').count(),1,'Filtro exato não limitou as linhas');
        await page.locator('[data-role="deadline-clear"]').click();
        assert.equal(await target.locator('#Tabela tbody tr:visible').count(),2,'Limpar filtro não restaurou a tabela');
      }
      check('Integração de tema e Intimações', { framed, order, width, profile:profile.id });
    }
    if (width===1440 && order[0]===0) await page.screenshot({ path:resolve(output,`intimacoes-${framed?'iframe':'direta'}.png`) });
    await target.evaluate(() => {
      const popup=document.createElement('div');popup.id='qa-native-popup';popup.className='ui-dialog';
      popup.innerHTML='<table class="Tabela"><tr><th>Qtde</th></tr><tr><td>2</td></tr></table>';document.body.append(popup);
    });
    await page.evaluate(framed => {
      const doc=framed?document.getElementById('Principal').contentDocument:document;
      window.__qaCustom.syncNativePopupTableContext(doc);window.__qaCustom.syncModernTableSemantics(doc);
    },framed);
    assert.equal(await target.locator('#qa-native-popup table').getAttribute('data-pjc-native-popup-table'),'true');
    assert.equal(await target.locator('#qa-suite-surface [data-pjc-native-popup-table], #qa-suite-surface [data-pjc-column-kind]').count(),0);
    await target.locator('#qa-native-popup').evaluate(node=>node.remove());
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__qaCustom.saveSettings(baseForTest()); function baseForTest(){ return {enabled:true,enableWidthAdjustments:false,applyToStandalonePages:true,enableProcessMirrorPdf:false,movimentacoesConfig:{qa:'preservar'}}; } window.__qaCustom.applySettingsNow(); window.__qaCustom.injectWidthCSS(document); window.__qaCustom.openSettingsPanel(); });
    await page.locator('.pjc-panel').waitFor({state:'visible'});
    const panelBox=await page.locator('.pjc-panel').boundingBox();
    assert.ok(panelBox.x >= -1 && panelBox.x+panelBox.width <= width+1,'Painel de opções fora da janela');
    assert.equal(await page.locator('.pjc-panel').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'Opções com rolagem horizontal');
    const savedBeforePreset=await page.evaluate(()=>window.__qaSaved);
    await page.locator('[data-pjc-preset="comfortable"]').click();
    assert.deepEqual(await page.evaluate(()=>window.__qaSaved),savedBeforePreset,'Perfil salvou sem confirmação pelo botão Salvar');
    assert.equal(await page.locator('#pj-modern-visual').isChecked(),true);
    assert.equal(await page.locator('#pj-font-scale').inputValue(),'110');
    await page.locator('[data-pjc-preset="compact"]').click();
    assert.equal(await page.locator('#pj-compact-mode').isChecked(),true);
    await page.locator('[data-pjc-preset="original"]').click();
    assert.equal(await page.locator('#pj-modern-visual').isChecked(),false);
    await page.locator('#pjc-tab-layout').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#pjc-tab-nav').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('[data-pjc-pane]:visible').count(),1);
    await page.keyboard.press('End');
    assert.equal(await page.locator('#pjc-tab-backup').getAttribute('aria-selected'),'true');
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#pj-standalone').isEnabled(),true,'Páginas diretas dependem da largura');
    await page.locator('#pj-standalone').check();
    if(width===1440 && order[0]===0) await page.screenshot({path:resolve(output,`opcoes-${framed?'iframe':'direta'}.png`)});
    await page.locator('#pj-save').click();
    assert.equal(await page.evaluate(()=>window.__qaSaved.applyToStandalonePages),true);
    assert.deepEqual(await page.evaluate(()=>window.__qaSaved.movimentacoesConfig),{qa:'preservar'},'Salvar opções apagou configuração das movimentações');
    const savedBeforeCancel=await page.evaluate(()=>window.__qaSaved);
    await page.evaluate(()=>window.__qaCustom.openSettingsPanel());
    await page.locator('[data-pjc-preset="compact"]').click();
    await page.locator('#pj-cancel').click();
    assert.deepEqual(await page.evaluate(()=>window.__qaSaved),savedBeforeCancel,'Cancelar gravou alterações');
    check('Perfis, abas por teclado, cancelamento e preservação de preferências',{framed,order,width});
    await page.evaluate(() => window.__qaCustom.resetLayoutEffects());
    assert.equal(await target.locator('#projudi-ajuste-largura').count(),0);
    await context.close();
  }
  assert.deepEqual(report.errors,[]);
} finally {
  await browser.close();
  await writeFile(resolve(output,'resultados.json'),JSON.stringify(report,null,2)+'\n');
}
