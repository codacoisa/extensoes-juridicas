import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../centraldeguias/projudi-central-guias.user.js', import.meta.url), 'utf8');
const DATA = 'projudi-suite::central-guias::data';
const BACKUP = 'projudi-suite::central-guias::gist';
const EVENT = 'projudi-suite::central-guias::data-changed';
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const empty = () => ({ version: 1, processes: {} });
const seed = () => ({ version: 1, processes: { fixture: { key: 'fixture', processId: 'fixture', cnj: 'fixture-cnj', shortNumber: 'fixture-short', guides: [{ guideId: 'fixture-guide', number: 'fixture-guide', manual: { paid: false, notified: true } }] } } });
function declaration(name) {
  const match = source.match(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'));
  assert.ok(match, `Função real ausente: ${name}`);
  return source.slice(match.index, source.indexOf('\n  }', match.index) + 4);
}
function environment(initial = seed()) {
  const local = new Map(initial === null ? [] : [[DATA, JSON.stringify(initial)]]);
  local.set(BACKUP, JSON.stringify({ token: 'fixture-private-token', gistId: 'fixture-private-gist', enabled: false }));
  const clients = [];
  const writes = [];
  let queue = Promise.resolve();
  let serial = 0;
  const locks = { request(_name, callback) { const result = queue.then(callback); queue = result.catch(() => {}); return result; } };
  function client(gmData = seed(), { deferGm = false, top = null } = {}) {
    const gm = new Map([[DATA, clone(gmData)], [BACKUP, { token: 'fixture-stale-token' }]]);
    const pending = [];
    const timers = new Map();
    const events = new Map();
    const panel = { rows: -1, renders: 0, query: 'fixture-search', filter: 'all' };
    const win = {
      CustomEvent: class { constructor(type) { this.type = type; } },
      addEventListener(type, handler) { const list = events.get(type) || []; list.push(handler); events.set(type, list); },
      dispatchEvent(event) { for (const handler of events.get(event.type) || []) handler(event); }
    };
    const context = vm.createContext({
      STORAGE_KEY: DATA, BACKUP_KEY: BACKUP, DATA_CHANGED_EVENT: EVENT,
      CLEANUP_SIGNATURE_KEY: 'projudi-suite::central-guias::cleanup-backup-signature',
      BACKUP_SCHEMA: 'fixture-backup-schema', SCRIPT_META: { id: 'fixture-script', name: 'fixture', version: 'fixture' }, location: { host: 'fixture.invalid' },
      dataSnapshots: new WeakMap(),
      navigator: { locks },
      TextEncoder, btoa: value => Buffer.from(value, 'binary').toString('base64'),
      crypto: { subtle: webcrypto.subtle, randomUUID: () => `fixture-write-${++serial}` },
      state: { automaticGuidesSyncStatus: 'idle', automaticGuidesSyncResetId: '', managerRender: null, dataRefreshTimer: null, backupTimer: null, alertsShown: new Set(), homeAlertShown: false },
      window: win, CustomEvent: win.CustomEvent,
      getTopWindow: () => top ? top.window : win,
      localStorage: {
        getItem: key => local.get(key) ?? null,
        setItem(key, value) {
          writes.push([key, value]); local.set(key, value);
          for (const other of clients) if (other.window !== win) other.window.dispatchEvent({ type: 'storage', key });
        }
      },
      GM_getValue: (key, fallback) => gm.has(key) ? clone(gm.get(key)) : fallback,
      GM_setValue(key, value) {
        if (!deferGm) { gm.set(key, clone(value)); return Promise.resolve(); }
        return new Promise(resolve => pending.push(() => { gm.set(key, clone(value)); resolve(); }));
      },
      setTimeout(callback) { const id = Symbol('fixture-timer'); timers.set(id, callback); return id; },
      clearTimeout: id => timers.delete(id),
      scheduleAutoBackup: () => {},
      cancelAutomaticGuidesSync: () => { context.state.automaticGuidesSyncStatus = 'idle'; },
      nowIso: () => '2026-10-19T16:00:00Z',
      computeGuideStatus: () => 'open',
      extractGuidesPageContext: doc => doc.context,
      parseGuideRows: doc => clone(doc.guides),
      computeProcessSummary: proc => ({ total: proc.guides.length }),
      showToast: () => { throw new Error('Fixture de captura usa silent.'); }
    });
    const names = ['normalizeManual','normalizeDb','loadDb','createDataWriteId','saveDb','saveDbIfChanged','normalizeShortNumber','sameShortNumber','pickCanonicalShortNumber','processMatchesCandidate','mergeGuideLists','ensureProcessRecord','syncGuidesFromDocument','buildBackupDbSnapshot','buildBackupSignature','buildBackupSignatureInput','normalizeBackupSignatureInput','buildBackupPayload','applyBackupPayload','writeCleanupValue','isCleanupBackupSuppressed','clearLocalExtensionData','allProcessesSorted','flattenGuides','notifyCentralDataChanged','onCentralDataChanged'];
    const storageCode = source.match(/^  const storage = \{[\s\S]*?^  \};/m)[0];
    const helpers = source.match(/  \/\/ BEGIN BACKUP_SIGNATURE_HELPERS[\s\S]*?  \/\/ END BACKUP_SIGNATURE_HELPERS/)[0];
    vm.runInContext("const BACKUP_SIGNATURE_DOMAIN = 'projudi-central-guias';\n" + helpers + '\n' + storageCode + '\n' + names.map(declaration).join('\n') + '\nglobalThis.storeApi = storage;', context);
    win.addEventListener(EVENT, context.onCentralDataChanged);
    win.addEventListener('storage', context.onCentralDataChanged);
    context.state.managerRender = () => { panel.rows = context.flattenGuides(context.loadDb()).length; panel.renders++; };
    const result = { context, window: win, panel, gm, pending, timers, flush() { while (timers.size) { const entries = [...timers.values()]; timers.clear(); entries.forEach(fn => fn()); } } };
    clients.push(result);
    return result;
  }
  return { local, writes, client, locks };
}

test('top com GM antigo lê captura do iframe sem reverter localStorage ou credenciais', async () => {
  const e = environment(empty()); const top = e.client(empty()); const frame = e.client(empty(), { top });
  const db = frame.context.loadDb(); db.processes = seed().processes;
  await frame.context.saveDb(db);
  const before = e.writes.length;
  assert.equal(top.context.flattenGuides(top.context.loadDb()).length, 1);
  assert.equal(e.writes.length, before, 'Ler não deve gravar réplica antiga.');
  assert.equal(top.gm.get(DATA).processes.fixture, undefined, 'Simular cache GM antigo no top.');
  assert.equal(JSON.parse(e.local.get(BACKUP)).token, 'fixture-private-token');
  assert.equal(top.context.storeApi.get(BACKUP, {}).token, 'fixture-private-token');
  assert.equal(e.writes.length, before);
});

test('primeira leitura aceita GM quando local não existe, sem gravar durante consulta', () => {
  const e = environment(null); const c = e.client(seed());
  assert.equal(c.context.flattenGuides(c.context.loadDb()).length, 1);
  assert.equal(e.local.has(DATA), false);
  assert.equal(e.writes.length, 0);
});

test('corrida entre snapshots é serializada e snapshot antigo é recusado sem merge', async () => {
  const e = environment(); const a = e.client(); const b = e.client();
  const left = a.context.loadDb(); const right = b.context.loadDb();
  left.processes.fixture.guides[0].manual.paid = true;
  right.processes.fixture.guides.push({ guideId: 'fixture-new', number: 'fixture-new' });
  const result = await Promise.allSettled([a.context.saveDb(left), b.context.saveDb(right)]);
  assert.deepEqual(result.map(r => r.status), ['fulfilled','rejected']);
  assert.match(result[1].reason.message, /mudaram em outro contexto/);
  const kept = JSON.parse(e.local.get(DATA));
  assert.equal(kept.processes.fixture.guides.length, 1);
  assert.equal(kept.processes.fixture.guides[0].manual.paid, true);
  const retry = b.context.loadDb(); retry.processes.fixture.guides.push({ guideId: 'fixture-new', number: 'fixture-new' });
  await b.context.saveDb(retry);
  assert.equal(JSON.parse(e.local.get(DATA)).processes.fixture.guides.length, 2);
  assert.equal(JSON.parse(e.local.get(DATA)).processes.fixture.guides[0].manual.paid, true);
});

test('limpeza intencional impede restauração por snapshot antigo, GM atrasado ou leitura', async () => {
  const e = environment(); const old = e.client(seed(), { deferGm: true }); const fresh = e.client(seed());
  const stale = old.context.loadDb();
  const oldWrite = old.context.loadDb(); oldWrite.processes.fixture.guides[0].manual.paid = true;
  await old.context.saveDb(oldWrite);
  await fresh.context.clearLocalExtensionData();
  const reset = fresh.context.loadDb().resetId;
  assert.ok(reset);
  assert.equal(Object.keys(fresh.context.loadDb().processes).length, 0);
  await assert.rejects(old.context.saveDb(stale), /mudaram em outro contexto/);
  old.pending.reverse().forEach(resolve => resolve()); await Promise.resolve();
  assert.equal(old.gm.get(DATA).processes.fixture.guides.length, 1, 'Cache antigo continua simulado.');
  assert.equal(Object.keys(old.context.loadDb().processes).length, 0);
  assert.equal(JSON.parse(e.local.get(DATA)).resetId, reset);
  assert.equal(await fresh.context.isCleanupBackupSuppressed(fresh.context.loadDb()), true);
});

test('evento de dados do iframe atualiza painel aberto sem mudar filtros ou fazer gravações', async () => {
  const e = environment(empty()); const top = e.client(empty()); const frame = e.client(empty(), { top });
  top.context.state.managerRender(); assert.equal(top.panel.rows, 0);
  const db = frame.context.loadDb(); db.processes = seed().processes;
  await frame.context.saveDb(db);
  const writes = e.writes.length;
  top.flush();
  assert.equal(top.panel.rows, 1);
  assert.equal(top.panel.query, 'fixture-search'); assert.equal(top.panel.filter, 'all');
  assert.equal(e.writes.length, writes);
  const before = top.panel.renders;
  top.window.dispatchEvent({ type: 'storage', key: BACKUP }); top.flush();
  assert.equal(top.panel.renders, before, 'Evento de credenciais não deve disparar atualização dos dados.');
  assert.match(source, /state\.managerRender = render;/);
  assert.match(source, /if \(state\.managerRender === render\) state\.managerRender = null;/);
});

test('reset recebido por evento cancela captura antiga antes de atualizar painel', async () => {
  const e = environment(); const top = e.client(); const frame = e.client(seed(), { top });
  frame.context.state.automaticGuidesSyncStatus = 'running'; frame.context.state.automaticGuidesSyncResetId = '';
  await top.context.clearLocalExtensionData(); frame.flush();
  assert.equal(frame.context.state.automaticGuidesSyncStatus, 'idle');
  assert.equal(frame.panel.rows, 0);
});

test('captura real válida preenche base compartilhada e mantém resposta vazia válida', async () => {
  const e = environment(empty()); const frame = e.client(empty()); const top = e.client(empty());
  const doc = { context: { processId:'fixture', shortNumber:'fixture-short' }, guides: seed().processes.fixture.guides };
  const result = await frame.context.syncGuidesFromDocument(doc, { silent: true });
  assert.equal(result.processRecord.guides.length, 1);
  assert.equal(top.context.flattenGuides(top.context.loadDb()).length, 1);
  await frame.context.syncGuidesFromDocument({ ...doc, guides: [] }, { silent: true });
  assert.equal(top.context.flattenGuides(top.context.loadDb()).length, 0);
  assert.equal(Object.keys(top.context.loadDb().processes).length, 1, 'Uma captura sem guias continua registrando o processo.');
});

test('backup antigo restaura explicitamente sem metadados locais; payload remoto permanece compatível', async () => {
  const e = environment(empty()); const c = e.client(empty());
  const stale = c.context.loadDb();
  await c.context.applyBackupPayload({ schema:'fixture-backup-schema', scriptId:'fixture-script', db: seed() });
  const restored = c.context.loadDb();
  assert.equal(restored.processes.fixture.guides[0].manual.notified, true);
  assert.ok(restored.resetId);
  await assert.rejects(c.context.saveDb(stale), /mudaram em outro contexto/);
  const payload = c.context.buildBackupPayload();
  assert.deepEqual(Object.keys(payload.db).sort(), ['processes','version']);
  assert.equal(JSON.stringify(payload).includes('fixture-private-token'), false);
  assert.equal(JSON.stringify(payload).includes('resetId'), false);
  assert.equal(JSON.stringify(payload).includes('writeId'), false);
});

test('falha de espelho GM mantém limpeza local e não permite ressuscitar dado antigo', async () => {
  const e = environment(); const c = e.client();
  c.context.GM_setValue = () => Promise.reject(new Error('fixture GM unavailable'));
  await assert.rejects(c.context.clearLocalExtensionData(), /fixture GM unavailable/);
  // A falha da assinatura ocorre antes da limpeza, portanto dados ficam intactos.
  assert.equal(c.context.flattenGuides(c.context.loadDb()).length, 1);
  await assert.rejects(c.context.saveDb(c.context.normalizeDb(empty()), { replace:true, reset:true, autoBackup:false, strictMirror:true }), /fixture GM unavailable/);
  assert.equal(c.context.flattenGuides(c.context.loadDb()).length, 0);
  assert.equal(c.gm.get(DATA).processes.fixture.guides.length, 1);
});

test('conteúdo local inválido e ausência de lock falham sem substituir dados', async () => {
  const e = environment(); const c = e.client();
  e.local.set(DATA, '{fixture-invalid-json');
  assert.throws(() => c.context.loadDb(), /ilegíveis/);
  assert.equal(e.writes.length, 0);
  e.local.set(DATA, JSON.stringify(seed()));
  const db = c.context.loadDb(); c.context.navigator.locks = null;
  await assert.rejects(c.context.saveDb(db), /não oferece bloqueio/);
  assert.equal(e.writes.length, 0);
});
