import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  anotacoes: 'anotacoes/projudi-anotacoes-locais.user.js',
  'central-guias': 'centraldeguias/projudi-central-guias.user.js',
  customizacoes: 'customizacoes/projudi-customizacoes.user.js',
  intimacoes: 'intimacoes/projudi-intimacao-page.user.js',
  tarefas: 'tarefas/projudi-tarefas-locais.user.js'
};
const sources = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([id, path]) => [id, await readFile(resolve(root, path), 'utf8')])));
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// Only named functions and literal constants are evaluated. The userscript IIFE,
// page DOM, real browser storage and real GM/network APIs are never executed.
function functionSource(source, name) {
  const start = new RegExp(`^([ \\t]*)(?:async )?function ${name}\\(`, 'm').exec(source);
  assert.ok(start, `Função ${name} ausente`);
  const end = new RegExp(`^${start[1]}\\}`, 'm').exec(source.slice(start.index + start[0].length));
  assert.ok(end, `Fechamento de ${name} ausente`);
  return source.slice(start.index, start.index + start[0].length + end.index + end[0].length);
}

function constantSource(source, name) {
  const match = new RegExp(`^([ \\t]*)const ${name} = ([^\\n]*);$`, 'm').exec(source);
  if (match) return match[0];
  const start = new RegExp(`^([ \\t]*)const ${name} = [\\[{]`, 'm').exec(source);
  assert.ok(start, `Constante literal ${name} ausente`);
  const end = new RegExp(`^${start[1]}[\\]}];`, 'm').exec(source.slice(start.index + start[0].length));
  assert.ok(end, `Fechamento de ${name} ausente`);
  return source.slice(start.index, start.index + start[0].length + end.index + end[0].length);
}

function harness(id) {
  const source = sources[id];
  const dataKey = `projudi-suite::${id}::data`;
  const backupKey = `projudi-suite::${id}::gist`;
  const settings = { enabled: true, autoBackupOnSave: true, gistId: 'fixture-gist', token: 'fixture-token', fileName: `${id}-fixture.json`, lastBackupAt: '', lastBackupSignature: '' };
  const local = new Map();
  const gm = new Map();
  const requests = [];
  const timers = new Map();
  const effects = { applied: 0, cancelledSync: 0, invalidated: 0 };
  const initial = id === 'anotacoes'
    ? { schema: 'projudi-suite/anotacoes-data', version: 2, revision: 4, values: { 'projudi_note::cnj_1::main': '<p>Nota</p>', 'projudi_note_meta::cnj_1::main': '{"colorId":"blue"}', 'pj-notes-preference': { sort: 'recent' }, 'other-extension': 'keep' } }
    : id === 'tarefas'
      ? { schema: 'projudi-suite/tarefas-data', version: 2, revision: 4, values: { 'projudi_todo::index': ['1'], 'projudi_todo::global::items': [{ id: 'g', text: 'Global' }], 'projudi_todo::1::items': [{ id: 'p', text: 'Processo' }], 'projudi_todo::global::ui': { right: 30 }, 'projudi_todo::1::ui': { top: 20 }, 'other-extension': 'keep' } }
      : id === 'central-guias'
        ? { version: 1, processes: { p1: { processId: '1', guides: [{ guideId: 'g1', number: '123' }] } } }
        : id === 'intimacoes'
          ? { version: 1, revision: 4, items: { p1: { note: 'Intimação', done: false } }, preferences: { sort: 'date' } }
          : { enabled: true, customHeaderEnabled: true, fontScaleEnabled: true, fontScalePercent: 125 };
  const seed = (key, value) => { local.set(key, JSON.stringify(value)); gm.set(key, copy(value)); };
  seed(dataKey, initial);
  seed(backupKey, settings);
  seed('projudi-suite::unrelated::data', { secret: 'synthetic-other-extension' });
  seed('projudi-suite::unrelated::gist', { token: 'synthetic-other-token' });
  const getData = () => JSON.parse(local.get(dataKey));
  const mockGet = (key, fallback) => gm.has(key) ? copy(gm.get(key)) : copy(fallback);
  const context = vm.createContext({
    fixtureSettings: settings,
    initialData: copy(initial),
    localStorage: {
      getItem: key => local.has(key) ? local.get(key) : null,
      setItem: (key, value) => { local.set(key, String(value)); },
      removeItem: () => { throw new Error('Nenhuma exclusão ampla é permitida no teste.'); },
      clear: () => { throw new Error('localStorage.clear proibido.'); }
    },
    GM_getValue: mockGet,
    GM_setValue: async (key, value) => { gm.set(key, copy(value)); },
    rawPersistentGet: mockGet,
    rawStorageGet: mockGet,
    invalidateNotesCaches: () => { effects.invalidated++; },
    cancelAutomaticGuidesSync: () => { effects.cancelledSync++; },
    applySettingsNow: () => { effects.applied++; },
    location: { host: 'fixture.invalid' },
    clearTimeout: handle => timers.delete(handle),
    setTimeout: callback => { const handle = Symbol('fixture-timer'); timers.set(handle, callback); return handle; },
    loadBackupSettings: () => copy(settings),
    saveBackupSettings: () => { throw new Error('A limpeza não deve sobrescrever credenciais.'); },
    logWarn: () => {},
    nowIso: () => '2026-10-19T12:00:00.000Z',
    githubRequest: async request => {
      requests.push(copy(request));
      return responder(request);
    }
  });
  context.window = { clearTimeout: context.clearTimeout, setTimeout: context.setTimeout };
  const names = ['clearLocalExtensionData', 'clearRemoteExtensionData', 'parseGithubError'];
  const constants = [];
  let setup = '';
  if (id === 'intimacoes') {
    constants.push('STORAGE_KEYS', 'BACKUP_SCHEMA', 'SCRIPT_ID', 'SCRIPT_NAME');
    names.push('buildBackupSignature', 'getPayloadBackupSignature', 'scheduleAutoBackup', 'buildBackupPayload', 'setBackupBusy');
    context.loadStore = getData;
    setup = 'var SCRIPT_VERSION = "fixture"; var state = { store: initialData, backupTimer: null, backupBusy: false };';
  } else {
    const scriptId = source.match(/const fallbackId = ['"]([^'"]+)/)[1];
    setup = `var SCRIPT_META = ${JSON.stringify({ id: scriptId, name: id, version: 'fixture', fileName: `${id}.json` })};`;
    if (id === 'anotacoes' || id === 'tarefas') {
      constants.push('DATA_KEY');
      names.push('updateExtensionDataForClear', 'readBackupFromGist', 'getPayloadBackupSignature');
      setup += 'var extensionDataBusy = false; var backupRequestInFlight = false;';
      if (id === 'anotacoes') {
        constants.push('NOTE_PREFIX', 'NOTE_META_PREFIX', 'BACKUP_SCHEMA');
        names.push('normalizeNotesDataEnvelope', 'loadNotesDataEnvelope', 'buildBackupSignature', 'scheduleAutoBackup', 'buildBackupPayload');
        context.getAllNotes = () => Object.entries(getData().values).filter(([key]) => key.startsWith('projudi_note::')).map(([key, html]) => ({ key, html, cnj: '1', subkey: 'main' }));
        context.getNoteColorMeta = () => ({ id: 'blue' });
        setup += 'var state = { backupTimer: null }; var notesDataCache = null;';
      } else {
        constants.push('KEY_PREFIX', 'KEY_INDEX', 'KEY_GLOBAL_ITEMS', 'KEY_GLOBAL_UI', 'KEY_BACKUP', 'EXPORT_EXCLUDED_KEYS', 'EXPORT_SCHEMA');
        names.push('normalizeTaskDataEnvelope', 'loadTaskDataEnvelope', 'exportTodoPayload', 'buildTodoBackupSignature', 'scheduleTodoAutoBackup', 'buildTodoBackupPayload');
        context.listTodoKeys = () => Object.keys(getData().values).filter(key => key.startsWith('projudi_todo::'));
        context.storage = { get: (key, fallback) => getData().values[key] ?? fallback };
        setup += 'var backupTimer = null; var taskDataCache = null;';
      }
    } else {
      constants.push('STORAGE_KEY', 'CLEANUP_SIGNATURE_KEY', 'BACKUP_SCHEMA');
      names.push('writeCleanupValue', 'isCleanupBackupSuppressed', 'buildBackupPayload');
      if (id === 'central-guias') {
        names.push('normalizeDb', 'normalizeManual', 'loadDb', 'buildBackupDbSnapshot', 'buildBackupSignature', 'scheduleAutoBackup');
        context.storage = { get: (key, fallback) => local.has(key) ? JSON.parse(local.get(key)) : fallback };
        setup += 'var state = { backupTimer: null, backupBusy: false, alertsShown: new Set(["p1"]), homeAlertShown: true };';
      } else {
        constants.push('DEFAULT_SETTINGS');
        names.push('normalizeSettings', 'sanitizeWidthPercent', 'sanitizePopupSize', 'sanitizeFontScale', 'sanitizeGoogleFontFamily', 'sanitizeSideBackground');
        setup += 'var settings = initialData;';
      }
    }
  }
  setup += 'var AUTO_BACKUP_IDLE_DELAY_MS = 10; var AUTO_BACKUP_MIN_INTERVAL_MS = 100;';
  vm.runInContext(`${setup}\n${constants.map(name => constantSource(source, name)).join('\n')}\n${names.map(name => functionSource(source, name)).join('\n')}`, context, { filename: `${id}-extracted-fixture.js` });
  const payload = id === 'tarefas' ? context.buildTodoBackupPayload() : context.buildBackupPayload();
  let remoteFiles = { [settings.fileName]: { content: JSON.stringify(payload) }, 'other-extension.json': { content: '{"keep":true}' } };
  let responder = request => {
    if (request.method === 'GET') return { status: 200, responseText: JSON.stringify({ id: settings.gistId, files: remoteFiles }) };
    if (request.method === 'PATCH') {
      for (const [key, value] of Object.entries(JSON.parse(request.data).files)) {
        assert.notEqual(value, null, 'Não excluir arquivos: manter backup vazio inclusive em Gist de arquivo único.');
        remoteFiles[key] = { content: value.content };
      }
      return { status: 200, responseText: '{}' };
    }
    throw new Error(`Método remoto proibido: ${request.method}`);
  };
  const currentSignature = () => id === 'tarefas' ? context.buildTodoBackupSignature() : id === 'customizacoes' ? JSON.stringify(context.normalizeSettings(context.settings)) : context.buildBackupSignature();
  return {
    id, source, context, local, gm, dataKey, backupKey, settings, initial, payload, requests, timers, effects, getData, currentSignature,
    clearLocal: () => context.clearLocalExtensionData(),
    clearRemote: () => context.clearRemoteExtensionData(settings),
    remoteFiles: () => copy(remoteFiles),
    setFiles: files => { remoteFiles = copy(files); },
    respond: handler => { responder = handler; },
    schedule: () => id === 'tarefas' ? context.scheduleTodoAutoBackup() : id === 'customizacoes' ? !context.isCleanupBackupSuppressed(context.settings) : context.scheduleAutoBackup(),
    suppressed: () => id === 'customizacoes' ? context.isCleanupBackupSuppressed(context.settings) : id === 'central-guias' ? context.isCleanupBackupSuppressed(context.loadDb()) : id === 'intimacoes' ? context.state.store.clearedBackupSignature === currentSignature() : (id === 'anotacoes' ? context.loadNotesDataEnvelope() : context.loadTaskDataEnvelope()).pausedBackupSignature === currentSignature()
  };
}

function assertEmptyData(id, value) {
  if (id === 'anotacoes') assert.ok(Object.keys(value.values).every(key => !key.startsWith('projudi_note::') && !key.startsWith('projudi_note_meta::')));
  if (id === 'tarefas') {
    assert.deepEqual(value.values['projudi_todo::index'], []);
    assert.deepEqual(value.values['projudi_todo::global::items'], []);
    assert.ok(Object.keys(value.values).every(key => !key.endsWith('::items') || key === 'projudi_todo::global::items'));
  }
  if (id === 'central-guias') assert.deepEqual(value.processes, {});
  if (id === 'intimacoes') assert.deepEqual(value.items, {});
  if (id === 'customizacoes') {
    assert.equal(value.customHeaderEnabled, false);
    assert.equal(value.fontScaleEnabled, false);
    assert.equal(value.fontScalePercent, 100);
  }
}

for (const id of Object.keys(paths)) {
  test(`${id}: limpeza local preserva credenciais, preferências e outras extensões`, async () => {
    const h = harness(id);
    const preserved = new Map([...h.local].filter(([key]) => key !== h.dataKey));
    await h.clearLocal();
    assertEmptyData(id, h.getData());
    for (const [key, value] of preserved) {
      assert.equal(h.local.get(key), value, `${key} deve permanecer intacta`);
      assert.deepEqual(h.gm.get(key), JSON.parse(value));
    }
    if (id === 'anotacoes') assert.deepEqual(h.getData().values['pj-notes-preference'], h.initial.values['pj-notes-preference']);
    if (id === 'tarefas') {
      assert.deepEqual(h.getData().values['projudi_todo::global::ui'], h.initial.values['projudi_todo::global::ui']);
      assert.deepEqual(h.getData().values['projudi_todo::1::ui'], h.initial.values['projudi_todo::1::ui']);
    }
    if (id === 'intimacoes') assert.deepEqual(h.getData().preferences, h.initial.preferences);
    assert.equal(h.requests.length, 0, 'A limpeza local não deve acessar o Gist.');
    assert.equal(h.suppressed(), true, 'Uma atualização de interface não deve recriar o backup.');
    h.schedule();
    assert.equal(h.timers.size, 0, 'Não agendar upload do estado recém-limpo.');
  });

  test(`${id}: limpeza remota faz GET/PATCH somente no arquivo atual e mantém Gist de arquivo único`, async () => {
    for (const singleFile of [false, true]) {
      const h = harness(id);
      if (singleFile) h.setFiles({ [h.settings.fileName]: h.remoteFiles()[h.settings.fileName] });
      const beforeFiles = h.remoteFiles();
      const beforeCredentials = h.local.get(h.backupKey);
      const beforeData = copy(h.initial);
      await h.clearRemote();
      assert.deepEqual(h.requests.map(request => request.method), ['GET', 'PATCH']);
      const patch = h.requests[1];
      assert.equal(patch.url, 'https://api.github.com/gists/fixture-gist');
      assert.deepEqual(Object.keys(JSON.parse(patch.data).files), [h.settings.fileName]);
      const files = h.remoteFiles();
      assert.deepEqual(Object.keys(files), Object.keys(beforeFiles));
      for (const key of Object.keys(files).filter(key => key !== h.settings.fileName)) assert.deepEqual(files[key], beforeFiles[key]);
      const empty = JSON.parse(files[h.settings.fileName].content);
      assert.equal(empty.schema, h.payload.schema);
      assert.equal(empty.scriptId, h.payload.scriptId);
      if (id === 'customizacoes') assert.deepEqual(empty.settings, {});
      else assertEmptyData(id, id === 'anotacoes' ? { values: Object.fromEntries(empty.notes.map(note => [note.key, note.html])) } : id === 'tarefas' ? { values: empty.data } : id === 'central-guias' ? empty.db : empty);
      assert.equal(JSON.stringify(empty).includes('fixture-token'), false);
      assert.equal(h.local.get(h.backupKey), beforeCredentials);
      const localData = h.getData();
      if (id === 'anotacoes' || id === 'tarefas') assert.deepEqual(localData.values, beforeData.values);
      if (id === 'intimacoes') assert.deepEqual(localData.items, beforeData.items);
      if (id === 'central-guias' || id === 'customizacoes') assert.deepEqual(localData, beforeData);
      assert.equal(h.suppressed(), true);
      h.schedule();
      assert.equal(h.timers.size, 0, 'O conteúdo local antigo não deve repovoar automaticamente o remoto.');
    }
  });

  test(`${id}: backup ausente, inválido, truncado ou de outra extensão nunca recebe PATCH`, async () => {
    const variants = [
      null,
      { content: '{malformed' },
      { content: JSON.stringify({ ...harness(id).payload, scriptId: 'other-extension' }) },
      { content: JSON.stringify({ ...harness(id).payload, schema: 'other-schema' }) },
      { content: JSON.stringify(harness(id).payload), truncated: true, raw_url: 'https://fixture.invalid/untrusted-raw' }
    ];
    for (const file of variants) {
      const h = harness(id);
      const before = [...h.local];
      h.setFiles(file ? { [h.settings.fileName]: file } : {});
      await assert.rejects(h.clearRemote());
      assert.deepEqual(h.requests.map(request => request.method), ['GET']);
      assert.deepEqual([...h.local], before, 'Não alterar armazenamento local sem validar a identidade remota.');
    }
  });

  test(`${id}: erros HTTP e de persistência interrompem a limpeza sem ampliar o alcance`, async () => {
    const h = harness(id);
    h.respond(() => ({ status: 403, responseText: '{"message":"fixture denied"}' }));
    await assert.rejects(h.clearRemote(), /fixture denied/);
    assert.deepEqual(h.requests.map(request => request.method), ['GET']);
    const patchFailure = harness(id);
    patchFailure.respond(request => request.method === 'GET'
      ? { status: 200, responseText: JSON.stringify({ files: patchFailure.remoteFiles() }) }
      : { status: 500, responseText: '{"message":"fixture patch failure"}' });
    await assert.rejects(patchFailure.clearRemote(), /fixture patch failure/);
    assert.deepEqual(patchFailure.requests.map(request => request.method), ['GET', 'PATCH']);
    assert.equal(patchFailure.local.get(patchFailure.backupKey), JSON.stringify(patchFailure.settings));
    const storageFailure = harness(id);
    storageFailure.context.localStorage.setItem = () => { throw new Error('fixture storage failure'); };
    await assert.rejects(async () => storageFailure.clearLocal());
    assert.equal(storageFailure.requests.length, 0);
    const remoteStorageFailure = harness(id);
    remoteStorageFailure.context.localStorage.setItem = () => { throw new Error('fixture storage failure'); };
    await assert.rejects(remoteStorageFailure.clearRemote());
    assert.deepEqual(remoteStorageFailure.requests.map(request => request.method), ['GET'], 'Persistir a supressão antes de enviar PATCH.');
  });
}

for (const id of ['anotacoes', 'tarefas']) {
  test(`${id}: preserva valores distintos em GM e localStorage e recusa envelopes desconhecidos`, async () => {
    const h = harness(id);
    h.gm.get(h.dataKey).values['fixture-gm-only-preference'] = { keep: true };
    const localData = h.getData();
    localData.values['fixture-local-only-preference'] = { keep: true };
    h.local.set(h.dataKey, JSON.stringify(localData));
    await h.clearLocal();
    assert.deepEqual(h.gm.get(h.dataKey).values['fixture-gm-only-preference'], { keep: true });
    assert.deepEqual(h.getData().values['fixture-local-only-preference'], { keep: true });
    assertEmptyData(id, h.gm.get(h.dataKey));
    const invalid = harness(id);
    invalid.gm.set(invalid.dataKey, { schema: 'unknown', values: { important: 'keep' } });
    const beforeLocal = invalid.local.get(invalid.dataKey);
    await assert.rejects(invalid.clearLocal(), /Formato de dados locais inesperado/);
    assert.equal(invalid.local.get(invalid.dataKey), beforeLocal);
    assert.deepEqual(invalid.gm.get(invalid.dataKey), { schema: 'unknown', values: { important: 'keep' } });
  });
}

for (const id of Object.keys(paths)) {
  test(`${id}: nova edição dos dados libera a suspensão de backup automático`, async () => {
    const h = harness(id);
    await h.clearRemote();
    assert.equal(h.suppressed(), true);
    const edited = h.getData();
    if (id === 'anotacoes') edited.values['projudi_note::cnj_1::main'] = '<p>Nova nota</p>';
    if (id === 'tarefas') edited.values['projudi_todo::global::items'].push({ id: 'new', text: 'Nova tarefa' });
    if (id === 'central-guias') edited.processes.p1.guides.push({ guideId: 'new', number: '456' });
    if (id === 'intimacoes') edited.items.p1.done = true;
    if (id === 'customizacoes') edited.fontScalePercent = 110;
    h.local.set(h.dataKey, JSON.stringify(edited));
    h.gm.set(h.dataKey, copy(edited));
    if (id === 'anotacoes') h.context.notesDataCache = null;
    if (id === 'tarefas') h.context.taskDataCache = null;
    if (id === 'intimacoes') h.context.state.store = edited;
    if (id === 'customizacoes') h.context.settings = edited;
    assert.equal(h.suppressed(), false);
    h.schedule();
    if (id !== 'customizacoes') assert.equal(h.timers.size, 1);
  });
  if (id !== 'customizacoes') {
    test(`${id}: callback antigo de outra aba não repõe dados depois da limpeza`, async () => {
      const h = harness(id);
      let uploads = 0;
      h.context.pushBackupToGist = async () => { uploads++; };
      h.schedule();
      const oldCallback = [...h.timers.values()][0];
      assert.equal(typeof oldCallback, 'function');
      await h.clearLocal();
      // Simulate a callback already queued by another frame before cancellation.
      await oldCallback();
      assert.equal(uploads, 0);
      assert.equal(h.requests.length, 0);
    });
  }
}

function cleanupHandlers(id) {
  const source = sources[id];
  const callbacks = {};
  const calls = { confirms: 0, local: 0, remote: 0, refreshed: 0 };
  let resolveConfirmation;
  const node = () => ({
    disabled: false, isConnected: true, dataset: {}, value: 'fixture', textContent: '',
    setAttribute() {}, removeAttribute() {}, focus() { this.focused = true; },
    addEventListener(event, callback) { if (event === 'click') this.click = callback; }
  });
  const local = node();
  const remote = node();
  const originallyDisabled = { ...node(), disabled: true };
  const status = node();
  const panel = node();
  panel.querySelector = selector => selector.includes('remote') ? remote : selector.includes('local') ? local : panel;
  panel.querySelectorAll = () => [local, remote, originallyDisabled];
  panel.ownerDocument = { activeElement: local };
  const elements = { cleanLocal: local, cleanRemote: remote, popover: panel, gist: node(), token: node(), file: node() };
  const confirm = () => { calls.confirms++; return new Promise(resolve => { resolveConfirmation = resolve; }); };
  const context = vm.createContext({
    panel, body: panel, backupBox: panel, backupPopover: panel, elements, statusNode: status,
    backupGistInput: node(), backupTokenInput: node(), backupFileInput: node(), searchInput: node(),
    state: { backupBusy: false }, extensionDataBusy: false, backupRequestInFlight: false,
    backupBusy: false, backupControls: [], options: {}, backupSettings: {},
    document: { getElementById: () => null, querySelectorAll: () => [] },
    confirmExtensionDataClear: confirm, confirmExtensionCleanup: confirm,
    clearLocalExtensionData: async () => { calls.local++; return {}; },
    clearRemoteExtensionData: async () => { calls.remote++; },
    normalizeBackupSettings: value => value,
    readBackupSettingsFromPanel: () => ({}), readBackupSettingsFromModal: () => ({}),
    setBackupStatus() {}, showBackupStatus() {}, setNodeText() {},
    invalidateNotesCaches() {}, renderNoteItems() {}, updateNoteIndicator() {},
    unmount() {}, scheduleEvaluate() {}, renderManagerRows() {}, syncPanelStates() {},
    applySettingsToForm() {}, isHomePage: () => false,
    refreshFrameContext: () => { calls.refreshed++; }, renderModal() {}
  });
  let code;
  if (id === 'anotacoes' || id === 'tarefas') {
    code = `${functionSource(source, 'setBackupBusy')}\n${functionSource(source, 'runDataClear')}`;
    callbacks.local = () => context.runDataClear('local', local);
    callbacks.remote = () => context.runDataClear('remote', remote);
  } else if (id === 'intimacoes') {
    context.state.modalRoot = panel;
    const start = source.indexOf("    ['local', 'remote'].forEach(scope => {");
    const end = source.indexOf('\n    });', start) + '\n    });'.length;
    assert.ok(start >= 0 && end > start, 'Registro dos handlers de Intimações ausente');
    code = `${functionSource(source, 'setBackupBusy')}\n${source.slice(start, end)}`;
    callbacks.local = () => local.click();
    callbacks.remote = () => remote.click();
  } else {
    if (id === 'central-guias') code = functionSource(source, 'withBackupLock');
    else {
      const start = source.indexOf('        const withBackupLock = async (action) => {');
      const end = source.indexOf('\n        };', start) + '\n        };'.length;
      assert.ok(start >= 0 && end > start, 'Lock de Customizações ausente');
      code = source.slice(start, end);
      context.backupCleanLocal = local;
      context.backupCleanRemote = remote;
    }
    for (const [scope, target] of [['local', id === 'central-guias' ? 'elements.cleanLocal' : 'backupCleanLocal'], ['remote', id === 'central-guias' ? 'elements.cleanRemote' : 'backupCleanRemote']]) {
      const start = source.indexOf(`${target}.addEventListener('click', () => withBackupLock(async () => {`);
      const ending = /\n[ \t]*\}\)\);/.exec(source.slice(start));
      assert.ok(start >= 0 && ending, `${id}: handler ${scope} ausente`);
      code += `\n${source.slice(start, start + ending.index + ending[0].length)}`;
    }
    callbacks.local = () => local.click();
    callbacks.remote = () => remote.click();
  }
  vm.runInContext(code, context, { filename: `${id}-handlers-fixture.js` });
  return { context, callbacks, calls, local, remote, originallyDisabled, confirm: value => resolveConfirmation(value) };
}

for (const id of Object.keys(paths)) {
  test(`${id}: cancelar não limpa; duplo clique não duplica confirmação ou operação`, async () => {
    const h = cleanupHandlers(id);
    const first = h.callbacks.local();
    const duplicate = h.callbacks.remote();
    assert.equal(h.calls.confirms, 1, 'Bloquear concorrência antes de aguardar a confirmação.');
    h.confirm(false);
    await Promise.all([first, duplicate]);
    assert.equal(h.calls.local, 0);
    assert.equal(h.calls.remote, 0);
    assert.equal(h.local.disabled, false);
    assert.equal(h.remote.disabled, false);
    if (id !== 'intimacoes') assert.equal(h.originallyDisabled.disabled, true);
    const approved = h.callbacks.remote();
    const secondDuplicate = h.callbacks.remote();
    assert.equal(h.calls.confirms, 2);
    h.confirm(true);
    await Promise.all([approved, secondDuplicate]);
    assert.equal(h.calls.remote, 1);
    assert.equal(h.calls.local, 0);
    assert.equal(h.context.extensionDataBusy || h.context.backupBusy || h.context.state.backupBusy, false);
  });

  test(`${id}: falha na limpeza libera controles para tentar novamente`, async () => {
    const h = cleanupHandlers(id);
    h.context.clearRemoteExtensionData = async () => { throw new Error('fixture cleanup failure'); };
    const operation = h.callbacks.remote();
    h.confirm(true);
    await operation;
    assert.equal(h.local.disabled, false);
    assert.equal(h.remote.disabled, false);
    assert.equal(h.context.extensionDataBusy || h.context.backupBusy || h.context.state.backupBusy, false);
    const retry = h.callbacks.remote();
    assert.equal(h.calls.confirms, 2);
    h.confirm(false);
    await retry;
  });
}
