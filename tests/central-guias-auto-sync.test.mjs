import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../centraldeguias/projudi-central-guias.user.js', import.meta.url), 'utf8');
function declaration(name) {
  const match = source.match(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'));
  assert.ok(match, `Função ausente: ${name}`);
  const end = source.indexOf('\n  }', match.index);
  return source.slice(match.index, end + 4);
}

const processA = { key: 'fixture-A', processId: 'fixture-A', cnj: 'fixture-cnj-A', shortNumber: '0000001-01', guides: [{ number: 'fixture-old' }] };
const processB = { key: 'fixture-B', processId: 'fixture-B', cnj: 'fixture-cnj-B', shortNumber: '0000002-02', guides: [] };
function fixture() {
  const frames = [];
  const timers = new Map();
  const writes = [];
  const db = { resetId: '', processes: { [processA.key]: structuredClone(processA), [processB.key]: structuredClone(processB) } };
  const meta = { textContent: '' };
  let now = 0;
  let timerId = 0;
  let selected = processA;
  let refreshed = 0;
  let parserThrows = false;
  const context = vm.createContext({
    URL,
    state: { automaticGuidesSyncProcessKey: '', automaticGuidesSyncFrame: null, automaticGuidesSyncTimer: null, automaticGuidesSyncReadTimer: null, automaticGuidesSyncStatus: 'idle' },
    location: { href: 'https://fixture.invalid/BuscaProcesso?Id_Processo=fixture-A', origin: 'https://fixture.invalid' },
    AUTO_GUIDES_QUERY_PARAM: 'pj_central_guias_auto', AUTO_GUIDES_SYNC_TIMEOUT_MS: 20000,
    SHORT_PROC_REGEX: /\b\d{7}-\d{2}\b/,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: {
      createElement(tag) {
        assert.equal(tag, 'iframe');
        const handlers = new Map();
        const doc = {
          ready: true, readyState: 'complete', identity: structuredClone(selected), guides: [],
          querySelector(selector) {
            if (!this.ready) return null;
            if (selector === 'form#ProcessoGuias' || selector === '#Tabela') return {};
            if (selector === '#numeroProcesso') return {
              textContent: this.identity.shortNumber,
              getAttribute: () => `BuscaProcesso?Id_Processo=${this.identity.processId}`
            };
            return null;
          }
        };
        return {
          style: {}, contentDocument: doc, removed: false,
          setAttribute() {}, addEventListener(name, fn) { handlers.set(name, fn); },
          emit(name) { return handlers.get(name)?.(); }, remove() { this.removed = true; }
        };
      },
      querySelector: () => meta,
      body: { appendChild(frame) { frames.push(frame); } }
    },
    extractProcessPageContext: () => selected,
    refreshProcessCardAfterAutomaticGuidesSync: () => { refreshed++; },
    loadDb: () => db,
    ensureProcessRecord: (value, identity) => value.processes[identity.processId],
    parseGuideRows: doc => { if (parserThrows) throw new Error('fixture-parser'); return structuredClone(doc.guides); },
    nowIso: () => '2026-10-19T15:00:00Z',
    saveDbIfChanged(value) { writes.push(structuredClone(value)); return true; },
    computeProcessSummary: record => ({ total: record.guides.length }),
    showToast: () => { throw new Error('A captura automática deve ser silenciosa.'); }
  });
  const helpers = ['normalizeShortNumber', 'sameShortNumber', 'processMatchesCandidate', 'findProcessRecord', 'getQueryParam', 'textOf', 'isGuidesPage', 'extractGuidesPageContext', 'syncGuidesFromDocument', 'cancelAutomaticGuidesSync', 'matchesAutomaticGuidesProcess', 'startAutomaticGuidesSync'];
  vm.runInContext(helpers.map(declaration).join('\n'), context);
  async function advance(ms) {
    const target = now + ms;
    let count = 0;
    while (true) {
      const entry = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      assert.ok(++count < 500, 'Loop de timers detectado.');
      timers.delete(entry[0]); now = entry[1].at; await entry[1].fn();
    }
    now = target;
  }
  return {
    frames, timers, writes, meta, state: context.state, advance,
    start: (record = processA) => context.startAutomaticGuidesSync(structuredClone(record)),
    cancel: () => context.cancelAutomaticGuidesSync(),
    select: record => { selected = record; },
    setParserError: value => { parserThrows = value; },
    reset: () => { db.resetId = 'fixture-new-reset'; },
    get refreshed() { return refreshed; }
  };
}

test('captura em andamento e concluída não duplica iframes nem gravação; tabela vazia é válida', async () => {
  const f = fixture();
  f.start(); f.start();
  assert.equal(f.frames.length, 1);
  assert.equal(f.state.automaticGuidesSyncStatus, 'running');
  await f.frames[0].emit('load');
  assert.equal(f.state.automaticGuidesSyncStatus, 'complete');
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].processes['fixture-A'].guides.length, 0);
  assert.equal(f.refreshed, 1);
  f.start(); await f.frames[0].emit('load'); await f.advance(50000);
  assert.equal(f.frames.length, 1);
  assert.equal(f.writes.length, 1);
  assert.equal(f.timers.size, 0);
});

test('aguarda tabela tardia no mesmo iframe sem nova requisição', async () => {
  const f = fixture(); f.start();
  f.frames[0].contentDocument.ready = false;
  await f.frames[0].emit('load'); await f.advance(750);
  assert.equal(f.writes.length, 0);
  assert.equal(f.frames.length, 1);
  f.frames[0].contentDocument.ready = true;
  await f.advance(250);
  assert.equal(f.writes.length, 1);
  assert.equal(f.state.automaticGuidesSyncStatus, 'complete');
  assert.equal(f.timers.size, 0);
});

for (const failure of ['error', 'timeout', 'parser']) {
  test(`${failure}: libera falha e repete uma vez, permitindo sucesso`, async () => {
    const f = fixture(); f.start();
    if (failure === 'timeout') await f.advance(20000);
    else if (failure === 'parser') { f.setParserError(true); await f.frames[0].emit('load'); }
    else await f.frames[0].emit('error');
    assert.equal(f.state.automaticGuidesSyncStatus, 'retrying');
    assert.equal(f.frames[0].removed, true);
    f.start(); await f.advance(999);
    assert.equal(f.frames.length, 1);
    f.setParserError(false); await f.advance(1);
    assert.equal(f.frames.length, 2);
    await f.frames[1].emit('load'); await f.advance(50000);
    assert.equal(f.state.automaticGuidesSyncStatus, 'complete');
    assert.equal(f.writes.length, 1);
    assert.equal(f.frames.length, 2);
    assert.equal(f.timers.size, 0);
  });
}

test('duas falhas encerram repetição e liberam processo para futura tentativa explícita', async () => {
  const f = fixture(); f.start(); await f.advance(50000);
  assert.equal(f.frames.length, 2);
  assert.equal(f.state.automaticGuidesSyncStatus, 'failed');
  assert.equal(f.state.automaticGuidesSyncProcessKey, '');
  assert.equal(f.timers.size, 0);
  assert.match(f.meta.textContent, /indisponível/);
  await f.advance(100000);
  assert.equal(f.frames.length, 2);
  f.start();
  assert.equal(f.frames.length, 3);
});

test('cancelamento encerra iframe e repetição pendente sem bloquear tentativa posterior', async () => {
  const f = fixture(); f.start(); await f.frames[0].emit('error'); f.cancel(); await f.advance(50000);
  assert.equal(f.frames.length, 1);
  assert.equal(f.state.automaticGuidesSyncStatus, 'idle');
  assert.equal(f.state.automaticGuidesSyncProcessKey, '');
  f.start();
  assert.equal(f.frames.length, 2);
  f.cancel(); await f.frames[1].emit('load'); await f.frames[1].emit('error'); await f.advance(50000);
  assert.equal(f.writes.length, 0);
  assert.equal(f.frames.length, 2);
  assert.equal(f.timers.size, 0);
});

test('troca de processo ignora eventos de iframe antigo sem cancelar captura nova', async () => {
  const f = fixture(); f.start();
  f.select(processB); f.start(processB);
  assert.equal(f.frames[0].removed, true);
  await f.frames[0].emit('error'); await f.frames[0].emit('load');
  assert.equal(f.state.automaticGuidesSyncFrame, f.frames[1]);
  assert.equal(f.state.automaticGuidesSyncStatus, 'running');
  await f.frames[1].emit('load');
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].processes['fixture-B'].lastGuidesSyncAt, '2026-10-19T15:00:00Z');
  assert.equal(f.writes[0].processes['fixture-A'].lastGuidesSyncAt, undefined);
});

test('navegação durante espera por tabela cancela captura e não grava processo antigo', async () => {
  const f = fixture(); f.start(); f.frames[0].contentDocument.ready = false; await f.frames[0].emit('load');
  f.select(processB); await f.advance(50000);
  assert.equal(f.writes.length, 0);
  assert.equal(f.frames.length, 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.state.automaticGuidesSyncStatus, 'idle');
});

test('iframe de outro processo é recusado antes de gravar, com repetição limitada', async () => {
  const f = fixture(); f.start(); f.frames[0].contentDocument.identity = processB; await f.frames[0].emit('load');
  assert.equal(f.writes.length, 0);
  await f.advance(1000); f.frames[1].contentDocument.identity = processB; await f.frames[1].emit('load'); await f.advance(50000);
  assert.equal(f.writes.length, 0);
  assert.equal(f.frames.length, 2);
  assert.equal(f.state.automaticGuidesSyncStatus, 'failed');
  assert.equal(f.timers.size, 0);
});

test('iframe automático não inicializa uma segunda captura independente do pai', async () => {
  let styled = 0;
  const context = vm.createContext({
    ensureStyles: () => { styled++; }, isAutomaticGuidesFrame: () => true,
    syncGuidesFromPage: () => { throw new Error('Captura duplicada no iframe.'); }
  });
  vm.runInContext(declaration('init') + '\ninit();', context);
  assert.equal(styled, 1);
});


test('limpeza durante espera ou retry invalida captura anterior sem repor dados', async () => {
  for (const pendingRetry of [false, true]) {
    const f = fixture(); f.start();
    if (pendingRetry) await f.frames[0].emit('error');
    else { f.frames[0].contentDocument.ready = false; await f.frames[0].emit('load'); }
    f.reset();
    if (!pendingRetry) f.frames[0].contentDocument.ready = true;
    await f.advance(50000);
    assert.equal(f.writes.length, 0);
    assert.equal(f.frames.length, 1);
    assert.equal(f.timers.size, 0);
    assert.equal(f.state.automaticGuidesSyncStatus, 'idle');
  }
});
