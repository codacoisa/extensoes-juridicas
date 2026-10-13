import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scripts } from './active-scripts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engines = await import(process.env.PROJUDI_PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.PROJUDI_QA_BROWSER || 'chromium';
const browser = await engines[engine].launch({ headless: true, ...(process.env.PROJUDI_QA_EXECUTABLE ? { executablePath: process.env.PROJUDI_QA_EXECUTABLE } : {}) });
const output = resolve(process.env.PROJUDI_QA_OUTPUT || '/tmp/projudi-process-actions-qa');
await mkdir(output, { recursive: true });
const html = await readFile(resolve(root, 'tests/fixtures/processo-acoes.html'), 'utf8');
const font = await readFile(process.env.PROJUDI_QA_NATIVE_FONT || '/tmp/projudi-native-fa-solid-900.woff2');
const sprite = await readFile(process.env.PROJUDI_QA_SPRITE || '/tmp/projudi-fa-solid.svg', 'utf8');
const legacyRoot = process.env.PROJUDI_QA_LEGACY_ROOT;
const legacySources = legacyRoot ? await Promise.all(scripts.map(path => readFile(resolve(legacyRoot, path), 'utf8'))) : null;
const sources = await Promise.all(scripts.map(path => readFile(resolve(process.env.PROJUDI_QA_SOURCE_ROOT || root, path), 'utf8')));
const before = process.argv.includes('--before');
const lateFont = process.argv.includes('--late-font');
const conciliation = process.argv.includes('--conciliation');
const report = { synthetic: true, engine, browser: await browser.version(), before, lateFont, conciliation, legacyIndex: legacySources ? Number(process.env.PROJUDI_QA_LEGACY_INDEX || 4) : null, results: [] };
const errors = [];
const combinations = legacySources ? [[0, 4], [4, 0]] : [[0], [4], [0, 4], [4, 0], [0, 1, 2, 3, 4]];
const widths = (process.env.PROJUDI_QA_WIDTHS || '1440,1180,900,768,390').split(',').map(Number);
const nativeState = target => target.evaluate(() => ['.notaProcesso', '.notaProcesso i', '#btnQueroConciliar', '#btnQueroConciliar i', '#qa-native-address', '#qa-native-address svg'].map(selector => {
  const node = document.querySelector(selector), s = getComputedStyle(node);
  return { selector, markup: node.outerHTML, color: s.color, font: s.fontFamily, fontSize: s.fontSize, transform: s.transform, hidden: s.display === "none", margin: s.margin, padding: s.padding, background: s.backgroundColor };
}));
try {
  for (const framed of [false, true]) for (const order of combinations) for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    let releaseFont;
    const fontGate = lateFont ? new Promise(resolve => { releaseFont = resolve; }) : Promise.resolve();
    await context.route('**/*', async route => {
      if (route.request().url().endsWith('qa-native-fa-solid.woff2')) { await fontGate; return route.fulfill({ status: 200, contentType: 'font/woff2', body: font }); }
      return route.fulfill({ status: 200, contentType: 'text/html', body: route.request().url().endsWith('/Wrapper') ? '<iframe id="Principal" name="userMainFrame" src="/BuscaProcesso?Id_Processo=1" style="width:100%;height:800px;border:0"></iframe>' : html });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://projudi.local.test/' + (framed ? 'Wrapper' : 'BuscaProcesso?Id_Processo=1'), { waitUntil: 'domcontentloaded' });
    if (framed) await page.frameLocator('#Principal').locator('#span_proc_numero').waitFor();
    const target = framed ? page.frames().find(frame => frame.url().includes('/BuscaProcesso')) : page;
    if (conciliation) await target.locator('#btnQueroConciliar').evaluate(button => button.style.display = 'inline-block');
    if (!lateFont) await target.evaluate(() => document.fonts.ready);
    const original = await nativeState(target);
    const toolbarMarkup = await target.locator('#qa-native-actions').evaluate(n => ({ attributes: [...n.attributes].map(a=>[a.name,a.value]) }));
    await target.evaluate(sprite => {
      window.GM_getValue = (_, fallback) => fallback;
      window.GM_setValue = () => {};
      window.GM_registerMenuCommand = () => {};
      window.GM_xmlhttpRequest = options => queueMicrotask(() => options.url.includes('/sprites/solid.svg') ? options.onload({ status: 200, responseText: sprite }) : options.onerror?.());
    }, sprite);
    for (const index of order) await target.addScriptTag({ content: legacySources && index === Number(process.env.PROJUDI_QA_LEGACY_INDEX || 4) ? legacySources[index] : sources[index] });
    await target.evaluate(() => window.dispatchEvent(new Event('focus')));
    const ids = order.filter(n=>n===0||n===4).map(n=>n===0?'pj-add-btn':'pj-todo-proc-btn');
    for (const id of ids) await target.locator(`#${id} .pj-suite-fa`).waitFor();
    releaseFont?.();
    await target.evaluate(() => document.fonts.ready);
    await target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await nativeState(target);
    const toolbarAfter = await target.locator('#qa-native-actions').evaluate(n => ({ attributes: [...n.attributes].map(a=>[a.name,a.value]) }));
    const geometry = await target.evaluate(ids => {
      const native = document.querySelector('.notaProcesso');
      const nodes = [native.querySelector('i'), ...ids.map(id => document.querySelector(`#${id} svg`))];
      if (getComputedStyle(document.getElementById('btnQueroConciliar')).display !== 'none') nodes.push(document.querySelector('#btnQueroConciliar i'));
      return { nativeColor: getComputedStyle(native).color, addedColors: ids.map(id=>getComputedStyle(document.querySelector(`#${id} svg`)).color), rects: nodes.map(n=>{ const r=n.getBoundingClientRect();return { id:n.closest("button").id || "native", x:r.x,y:r.y,width:r.width,height:r.height }; }), groupCount: document.querySelectorAll('#pj-local-process-actions').length };
    }, ids);
    const failures = [];
    const expectedOrder = [...(conciliation ? ['btnQueroConciliar'] : []), 'native', ...(order.includes(0) ? ['pj-add-btn'] : []), ...(order.includes(4) ? ['pj-todo-proc-btn'] : [])];
    if (JSON.stringify(geometry.rects.slice().sort((a,b)=>a.x-b.x).map(rect=>rect.id)) !== JSON.stringify(expectedOrder)) failures.push('Ordem visual diferente da ordem dos controles');
    if (JSON.stringify(after) !== JSON.stringify(original) || JSON.stringify(toolbarAfter.attributes.filter(([name])=>name!=='style')) !== JSON.stringify(toolbarMarkup.attributes.filter(([name])=>name!=='style'))) failures.push('Estilos ou atributos nativos alterados');
    if (geometry.addedColors.some(color=>color!==geometry.nativeColor)) failures.push('Atalhos herdaram a cor especial do alfinete');
    const rects = geometry.rects.sort((a,b)=>a.x-b.x);
    for (let n=1;n<rects.length;n++) if (rects[n].x - rects[n-1].x - rects[n-1].width < 7.9) failures.push('Desenhos de ícones sem folga de 8 px');
    for (let n=1;n<rects.length;n++) if (rects[n].x - rects[n-1].x - rects[n-1].width > 32) failures.push('Ações separadas por espaço excessivo');
    const centers = rects.map(rect => rect.y + rect.height / 2);
    if (Math.max(...centers) - Math.min(...centers) > 8) failures.push('Ações desalinhadas verticalmente');
    if (!before && geometry.groupCount !== 1) failures.push('Grupo compartilhado ausente ou duplicado');
    for (const r of rects) if (r.x < -1 || r.x+r.width > (framed ? width-16 : width)+1) failures.push('Ícone fora da largura disponível');
    const result = { framed, order, width, failures, geometry };
    report.results.push(result);
    if (width===1440 && order.length===2 && order[0]===0) {
      const offset = framed ? await page.locator('#Principal').boundingBox() : { x:0, y:0 };
      const left = Math.min(...rects.map(r=>r.x));
      const top = Math.min(...rects.map(r=>r.y));
      const right = Math.max(...rects.map(r=>r.x+r.width));
      const bottom = Math.max(...rects.map(r=>r.y+r.height));
      await page.screenshot({ path: resolve(output, `${before?'before':'after'}-${framed?'iframe':'top'}.png`), clip: { x:left+offset.x-8, y:top+offset.y-8, width:right-left+16, height:bottom-top+16 } });
    }
    if (!before) {
      assert.deepEqual(failures, [], JSON.stringify(result));
      await target.locator('.notaProcesso').click();
      assert.equal(await target.evaluate(()=>window.__qaNativeClicks), 1, 'Ação nativa perdeu seu evento');
      if (order.includes(0)) {
        await target.locator('#pj-add-btn').click();
        await target.locator('#pj-note').waitFor({ state: 'visible' });
        await target.locator('#pj-note button[title*="Fechar"]').click();
        await target.locator('#pj-note').waitFor({ state: 'hidden' });
      }
      if (order.includes(4)) {
        await target.locator('#pj-todo-proc-btn').click();
        await target.locator('#pj-todo').waitFor({ state: 'visible' });
        if (!order.includes(0)) {
          await target.locator('#pj-local-process-actions').waitFor({ state: 'detached' });
          const restoredBar = await target.locator('#qa-native-actions').evaluate(n => ({ attributes: [...n.attributes].map(a=>[a.name,a.value]) }));
          assert.deepEqual(restoredBar, toolbarMarkup, 'Layout nativo não foi restaurado sem atalhos');
          assert.deepEqual(await nativeState(target), original, 'Grupo vazio modificou o controle nativo');
        }
        await target.locator('#pj-todo .pj-todo-close-btn').click();
        await target.locator('#pj-todo-proc-btn').waitFor();
        assert.equal(await target.locator('#pj-local-process-actions').count(), 1);
        assert.equal(await target.locator('#pj-local-process-actions > #pj-add-btn').count(), order.includes(0) ? 1 : 0);
        assert.equal(await target.locator('#pj-local-process-actions > #pj-todo-proc-btn').count(), 1);
        assert.deepEqual(await nativeState(target), original, 'Abrir/fechar tarefas alterou controles nativos');
      }
    }
    result.actionsVerified = !before;
    await context.close();
    console.log(`${framed?'iframe':'top'} ${order.join('+')} ${width}: ${failures.length ? failures.join('; ') : 'OK'}`);
  }
  if (!before) assert.deepEqual(errors, []);
} finally {
  await browser.close();
  report.errors = errors;
  await writeFile(resolve(output, 'process-actions-results.json'), JSON.stringify(report, null, 2)+'\n');
}
