// QA real do DOM dos userscripts, inteiramente offline e em perfil descartável.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scripts } from './active-scripts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = process.env.PROJUDI_PLAYWRIGHT_MODULE || 'playwright';
const engines = await import(modulePath);
const engine = process.env.PROJUDI_QA_BROWSER || 'chromium';
const browser = await engines[engine].launch({ headless: true, ...(process.env.PROJUDI_QA_EXECUTABLE ? { executablePath: process.env.PROJUDI_QA_EXECUTABLE } : {}) });
const output = resolve(process.env.PROJUDI_QA_OUTPUT || resolve(root, 'docs/padronizacao-visual/qa'));
await mkdir(output, { recursive: true });
const html = await readFile(resolve(root, 'tests/fixtures/projudi.html'), 'utf8');
const sprite = await readFile(process.env.PROJUDI_QA_SPRITE || '/tmp/projudi-fa-solid.svg', 'utf8').catch(() => '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const before = process.argv.includes('--before');
const smoke = process.argv.includes('--smoke');
const populated = process.argv.includes('--populated');
const offlineIcons = process.argv.includes('--offline-icons');
const report = { mode: (before ? 'before' : 'after') + (populated ? '-populated' : '-empty') + (offlineIcons ? '-offline' : ''), synthetic: true, engine, browser: await browser.version(), results: [] };
const configs = [
  { id: 'anotacoes', dialog: '.pj-panel', overlay: '#pj-notes-panel', search: '.pj-filter-input', backup: 'button:has-text("Backup remoto")', item: '.pj-note-item' },
  { id: 'centraldeguias', dialog: '.pj-guides-manager', overlay: '#pj-guides-manager-overlay', search: '#pj-guides-search', backup: '#pj-guides-backup-toggle-btn', item: '.pj-guides-manager__table tbody tr' },
  { id: 'customizacoes', dialog: '.pjc-panel', overlay: '#projudi-wide-panel-overlay', backup: '#pj-backup-open' },
  { id: 'intimacoes', dialog: '#pjip-modal-panel', overlay: '#pjip-modal-overlay', search: '[data-role="search"]', backup: '[data-role="backup-toggle"]', item: '.pjip-item' },
  { id: 'tarefas', dialog: '.pjm-panel', overlay: '#pj-task-manager-overlay', search: '#pjm-search', backup: '#pjm-backup-open', item: '.pjm-item' }
];

try {
  for (const [index, config] of configs.entries()) {
    for (const width of smoke ? [1440] : (process.env.PROJUDI_QA_WIDTHS || '1440,1180,900,768,390').split(',').map(Number)) {
      const context = await browser.newContext({ viewport: { width, height: Number(process.env.PROJUDI_QA_HEIGHT || 1000) }, reducedMotion: 'reduce' });
      // Nenhuma requisição chega à rede, inclusive iframes, exportadores ou Gist.
      await context.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://projudi.local.test/Inicio');
      await page.evaluate(({ sprite, populated, offlineIcons }) => {
        if (populated) {
          const cnj = '0000001-00.2026.8.09.0001';
          const now = new Date().toISOString();
          localStorage.setItem('projudi-suite::anotacoes::data', JSON.stringify({ values: { ['projudi_note::cnj_' + cnj + '::Resumo']: '<p>Conferir documentação sintética</p>', ['projudi_note::cnj_' + cnj + '::/BuscaProcesso?Id_Processo=1&Parametro=' + 'x'.repeat(150)]: '<p>Preparar roteiro de perguntas</p>' } }));
          localStorage.setItem('projudi-suite::central-guias::data', JSON.stringify({ processes: { teste: { key: 'teste', cnj, shortNumber: '0000001-00', processId: '1', activeParty: 'Parte Sintética A', passiveParty: 'Parte Sintética B', lastGuidesSyncAt: now, guides: [{ number: 'GUIA-001', type: 'Custas iniciais', dueDate: new Date(Date.now() - 90 * 86400000).toISOString(), situation: 'Em aberto' }, { number: 'GUIA-002', type: 'Taxa judiciária', dueDate: new Date(Date.now() + 90 * 86400000).toISOString(), situation: 'Em aberto' }, { number: 'GUIA-003', type: 'Diligência', dueDate: new Date(Date.now() + 90 * 86400000).toISOString(), manual: { paid: true } }, ...Array.from({ length: 302 }, (_, n) => ({ number: `GUIA-${String(n + 4).padStart(3, '0')}`, type: 'Taxa sintética', dueDate: new Date(Date.now() + 90 * 86400000).toISOString(), situation: 'Em aberto' }))] } } }));
          localStorage.setItem('projudi-suite::tarefas::data', JSON.stringify({ values: { 'projudi_todo::global::items': [{ id: 't1', text: 'Conferir documentação sintética', tags: ['Urgente'], done: false }, { id: 't2', text: 'Preparar audiência sintética', tags: ['Audiência'], done: false }, { id: 't3', text: 'Providência concluída', tags: [], done: true }], 'projudi_todo::index': [{ key: 'cnj_' + cnj, cnj }], ['projudi_todo::cnj_' + cnj + '::items']: [{ id: 't4', text: 'Revisar prazo do processo sintético', tags: ['Prazo'], done: false }] } }));
          localStorage.setItem('projudi-suite::intimacoes::data', JSON.stringify({ items: { i1: { id: 'i1', processNumber: cnj, movement: 'Conferir documentação sintética', deadline: '01/01/2026', updatedAt: now, done: false }, i2: { id: 'i2', processNumber: cnj, movement: 'Preparar resposta sintética', deadline: '01/12/2026', updatedAt: now, done: false }, i3: { id: 'i3', processNumber: cnj, movement: 'Providência concluída', updatedAt: now, done: true } } }));
        }
        window.__qaMenus = [];
        window.GM_registerMenuCommand = (label, callback) => window.__qaMenus.push({ label, callback });
        window.GM_getValue = (key, fallback) => JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
        window.GM_setValue = (key, value) => localStorage.setItem(key, JSON.stringify(value));
        window.GM_deleteValue = key => localStorage.removeItem(key);
        // Sprite mínimo sintético: somente a rede/ícones são substituídos, nunca o DOM da extensão.
        window.GM_xmlhttpRequest = options => {
          if (!options.url.includes('/sprites/solid.svg')) throw new Error('Requisição não permitida no QA: ' + options.url);
          queueMicrotask(() => offlineIcons ? options.onerror?.() : options.onload({ status: 200, responseText: sprite }));
        };
      }, { sprite, populated, offlineIcons });
      const nativeBefore = await page.locator('#qa-native-input').evaluate(node => {
        const s = getComputedStyle(node); return { font: s.fontFamily, color: s.color, background: s.backgroundColor, border: s.borderColor, padding: s.padding };
      });
      const path = before ? resolve('/tmp/extensoes-juridicas-visual-before', scripts[index]) : resolve(root, scripts[index]);
      await page.addScriptTag({ content: await readFile(path, 'utf8') });
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForFunction(() => window.__qaMenus.length > 0, null, { timeout: 5000 });
      await page.locator('#qa-launcher').focus();
      if (before && config.id === 'intimacoes' && errors.length) {
        report.results.push({ id: config.id, width, initialStartupErrors: errors, screenshotUnavailable: true });
        console.log(`before: intimacoes ${width} — erro de inicialização confirmado`);
        await context.close();
        continue;
      }
      await page.evaluate(() => window.__qaMenus[0].callback());
      const dialog = page.locator(config.dialog);
      await dialog.waitFor({ state: 'visible' });
      await page.waitForTimeout(100);
      const bounds = await dialog.boundingBox();
      const styles = await dialog.evaluate(node => {
        const header = node.querySelector('[data-pj-suite-component="header"]');
        const s = getComputedStyle(node); return { font: s.fontFamily, borderRadius: s.borderRadius, header: header ? getComputedStyle(header).backgroundColor : null, width: s.width };
      });
      if (!before) {
        assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, `${config.id}: painel fora da largura ${width}`);
        assert.ok(bounds.y >= -1 && bounds.y + bounds.height <= Number(process.env.PROJUDI_QA_HEIGHT || 1000) + 1, `${config.id}: painel fora da altura`);
        assert.equal(await dialog.getAttribute('role'), 'dialog');
        assert.ok(await dialog.evaluate(node => node.contains(document.activeElement)), `${config.id}: foco inicial fora do painel`);
        assert.equal(styles.header, 'rgb(24, 59, 97)');
        const nativeAfter = await page.locator('#qa-native-input').evaluate(node => {
          const s = getComputedStyle(node); return { font: s.fontFamily, color: s.color, background: s.backgroundColor, border: s.borderColor, padding: s.padding };
        });
        assert.deepEqual(nativeAfter, nativeBefore, `${config.id}: CSS alterou controle nativo`);
      }
      await page.screenshot({ path: resolve(output, `${report.mode}-${config.id}-${width}.png`) });
      if (!before && !smoke) {
        const accessible = await dialog.evaluate(node => [...node.querySelectorAll('button, input:not([type="hidden"]):not([type="file"]), select, textarea')].filter(n => n.getClientRects().length && !n.disabled).filter(n => !(n.textContent.trim() || n.getAttribute('aria-label') || n.getAttribute('aria-labelledby') || n.labels?.length || n.title)).map(n => n.outerHTML.slice(0, 200)));
        assert.deepEqual(accessible, [], `${config.id}: controles sem nome acessível`);
        await page.keyboard.press('Shift+Tab');
        assert.ok(await dialog.evaluate(n => n.contains(document.activeElement)), `${config.id}: Shift+Tab escapou`);
        const count = await dialog.locator('button, input, select, textarea, [tabindex="0"]').count();
        for (let n = 0; n < count + 2; n++) await page.keyboard.press('Tab');
        assert.ok(await dialog.evaluate(n => n.contains(document.activeElement)), `${config.id}: Tab escapou`);
        if (config.id === 'customizacoes') await dialog.locator('[data-pjc-section-target="backup"]').click();
        if (populated && config.search) {
          assert.ok(await dialog.locator(config.item).count() >= 2, `${config.id}: dados sintéticos não renderizados`);
          await dialog.locator(config.search).fill('inexistente-qa-zzzz');
          await page.waitForTimeout(220);
          assert.equal(await dialog.locator(config.item).count(), 0, `${config.id}: busca não filtrou`);
          await dialog.locator(config.search).fill('');
          await page.waitForTimeout(220);
          assert.ok(await dialog.locator(config.item).count() >= 2, `${config.id}: limpar busca não restaurou lista`);
        }
        for (const select of await dialog.locator('select:visible').all()) {
          assert.ok((await select.boundingBox()).height >= 35, `${config.id}: seletor comprimido no Safari`);
        }
        if (populated && config.id === 'centraldeguias') {
          assert.equal(await dialog.locator(config.item).count(), 100);
          await dialog.locator('[data-action="page-next"]').click();
          assert.match(await dialog.locator('.pj-guides-pagination').innerText(), /Página 2 de 4/);
          await dialog.locator(config.search).fill('GUIA-305');
          await page.waitForTimeout(220);
          assert.equal(await dialog.locator(config.item).count(), 1, 'Guia depois do antigo limite de 300 inacessível');
          await dialog.locator(config.search).fill('');
          await page.waitForTimeout(220);
          const critical = dialog.locator('[data-filter="critical"]');
          await critical.focus(); await page.keyboard.press('Enter');
          assert.equal(await dialog.locator(config.item).count(), 1, 'Filtro Críticas omitiu guia vencida');
          assert.equal(await dialog.locator('#pj-guides-filter').inputValue(), 'critical');
          assert.ok(await critical.evaluate(n => n === document.activeElement), 'Resumo perdeu foco após filtrar');
          await dialog.locator('#pj-guides-filter').selectOption('all');
        }
        if (populated && config.id === 'intimacoes') {
          const card = dialog.locator('.pjip-item').first();
          const actionBounds = await card.locator('.pjip-item-actions').boundingBox();
          const detailBounds = await card.locator('.pjip-item-grid').boundingBox();
          assert.ok(actionBounds.y >= detailBounds.y + detailBounds.height - 1, 'Ações comprimem os detalhes da intimação');
          for (const date of await dialog.locator('input[type="date"]:visible').all()) {
            assert.ok((await date.boundingBox()).width >= 120, 'Data truncada por falta de largura');
          }

          await dialog.locator('.pjip-item .pjip-modal-btn--primary').first().click();
          await page.waitForTimeout(50);
          assert.ok(await dialog.evaluate(n => n.contains(document.activeElement)), 'Intimações: concluir perdeu foco de teclado');
        }
        if (populated && config.id === 'anotacoes') {
          const note = dialog.locator('.pj-note-item').first();
          await note.focus();
          await page.keyboard.press('Enter');
          assert.equal(await note.getAttribute('aria-current'), 'true');
          assert.ok(!(await dialog.locator('.pj-note-line2').allTextContents()).some(text => text.includes('/BuscaProcesso')), 'URL técnica apresentada como título');
          page.on('dialog', dialog => dialog.accept());
          while (await dialog.locator('.pj-note-delete').count()) await dialog.locator('.pj-note-delete').first().click();
          assert.equal(await dialog.locator('.pj-note-item').count(), 0);
          assert.match(await dialog.locator('.pj-note-list').innerText(), /Nenhuma nota encontrada/);

        }
        const backup = dialog.locator(config.backup);
        if (await backup.count()) {
          await backup.first().click();
          const popover = dialog.locator('.pj-backup-ui__popover');
          await popover.waitFor({ state: 'visible' });
          assert.ok(await popover.evaluate(n => n.contains(document.activeElement)), `${config.id}: backup sem foco`);
          await page.screenshot({ path: resolve(output, `${report.mode}-${config.id}-${width}-backup.png`) });
          await page.keyboard.press('Escape');
          await popover.waitFor({ state: 'hidden' });
          assert.ok(await dialog.isVisible(), `${config.id}: Escape do backup fechou o principal`);
        }
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => document.activeElement.id), 'qa-launcher', `${config.id}: retorno de foco`);
        for (let n = 0; n < 3; n++) {
          await page.evaluate(() => window.__qaMenus[0].callback());
          await dialog.waitFor({ state: 'visible' });
          await page.keyboard.press('Escape');
          await dialog.waitFor({ state: 'hidden' });
        }
      }
      assert.deepEqual(errors, [], `${config.id}: erros de execução`);
      report.results.push({ id: config.id, width, bounds, styles, errors });
      console.log(`${report.mode}: ${config.id} ${width} — OK`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, `${report.mode}-results.json`), JSON.stringify(report, null, 2) + '\n');
}
