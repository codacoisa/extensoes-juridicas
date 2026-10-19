import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../centraldeguias/projudi-central-guias.user.js', import.meta.url), 'utf8');
function declaration(name) {
  const match = source.match(new RegExp(`^  function ${name}\\(`, 'm'));
  assert.ok(match, `Função ausente: ${name}`);
  return source.slice(match.index, source.indexOf('\n  }', match.index) + 4);
}
function fixture() {
  const context = vm.createContext({
    startOfToday: () => new Date('2026-10-19T00:00:00Z'),
    computeGuideStatus: () => 'open',
    htmlEscape: value => String(value),
    STALE_SYNC_DAYS: 10,
    allProcessesSorted: db => Object.values(db.processes)
  });
  vm.runInContext(['normalizeManual','normalizeDb','buildBackupDbSnapshot','computeProcessSummary','summarizeManagerRows','buildSummaryStats'].map(declaration).join('\n'), context);
  return context;
}

test('painel e cartões não oferecem contador, botão, badge ou handler de Avisadas', () => {
  assert.doesNotMatch(source, />Avisadas<|Cliente avisado|Marcar aviso|Desfazer aviso/);
  assert.doesNotMatch(source, /data-action="notify"|action === 'notify'/);
  assert.doesNotMatch(source, /summary\.notified|stats\.notified|labels\.extra \|\| 'Avisadas'/);
  assert.equal((source.match(/manual\.notified/g) || []).length, 1, 'Reter apenas leitura compatível dos dados antigos.');
});

test('marcação antiga não muda status ou contadores e resumo inicial mantém processos ativos', () => {
  const c = fixture();
  const base = { processes: { fixture: { key: 'fixture', processId: 'fixture', guides: [{ number: 'fixture-guide', manual: { notified: true } }] } } };
  const marked = c.normalizeDb(base);
  const unmarked = c.normalizeDb({ processes: { fixture: { ...base.processes.fixture, guides: [{ number: 'fixture-guide', manual: { notified: false } }] } } });
  const summary = c.computeProcessSummary(marked.processes.fixture);
  assert.equal(JSON.stringify(summary), JSON.stringify(c.computeProcessSummary(unmarked.processes.fixture)));
  const rows = [{ processRecord: marked.processes.fixture, guide: marked.processes.fixture.guides[0], status:'open' }];
  assert.equal('notified' in c.summarizeManagerRows(marked, rows), false);
  const card = c.buildSummaryStats(summary);
  assert.equal((card.match(/class="pj-guides-stat"/g) || []).length, 3);
  assert.equal(card.includes('Avisadas'), false);
  const home = c.buildSummaryStats({ ...summary, extra: 4 }, { extra:'Processos ativos' });
  assert.match(home, /Processos ativos/);
  assert.match(home, />4<\/span>/);
});

test('normalização e exportação preservam guia e metadado de backup antigo sem migração destrutiva', () => {
  const c = fixture();
  const old = { version:1, processes: { fixture: { processId:'fixture', guides:[{ guideId:'fixture-id', number:'fixture-guide', manual:{ paid:true, notified:true, ignored:false } }] } } };
  const normalized = c.normalizeDb(old);
  const snapshot = c.buildBackupDbSnapshot(normalized);
  assert.equal(snapshot.processes.fixture.guides.length, 1);
  assert.equal(snapshot.processes.fixture.guides[0].guideId, 'fixture-id');
  assert.equal(snapshot.processes.fixture.guides[0].manual.notified, true);
  assert.equal(snapshot.processes.fixture.guides[0].manual.paid, true);
  assert.equal(old.processes.fixture.guides[0].manual.notified, true);
});
