import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = {
  anotacoes: 'anotacoes/projudi-anotacoes-locais.user.js',
  'central-guias': 'centraldeguias/projudi-central-guias.user.js',
  customizacoes: 'customizacoes/projudi-customizacoes.user.js',
  intimacoes: 'intimacoes/projudi-intimacao-page.user.js',
  tarefas: 'tarefas/projudi-tarefas-locais.user.js'
};

const sources = Object.fromEntries(
  await Promise.all(Object.entries(scripts).map(async ([id, path]) => [id, await readFile(resolve(root, path), 'utf8')]))
);

test('cada extensão usa um documento de dados e outro de Gist', () => {
  for (const [id, source] of Object.entries(sources)) {
    assert.match(source, new RegExp(`projudi-suite::${id}::data`), `${id}: chave de dados ausente`);
    assert.match(source, new RegExp(`projudi-suite::${id}::gist`), `${id}: chave de Gist ausente`);
  }
});

test('a suíte não mantém migrações ou chaves de armazenamento legadas', () => {
  for (const [id, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /\b(?:LEGACY|legacy|migrat(?:e|ed|ion)?|migra(?:ção|ções)?|deprecated|obsolete)\b/i, `${id}: compatibilidade legada encontrada`);
  }
  assert.doesNotMatch(sources.customizacoes, /projudi_highlight_movs_cfg_v28/, 'customizações ainda consulta o armazenamento antigo de Movimentações');
  assert.doesNotMatch(sources.anotacoes, /^\/\/ @grant\s+GM_listValues$/m, 'Anotações ainda solicita GM_listValues sem uso');
  assert.doesNotMatch(sources.tarefas, /^\/\/ @grant\s+GM_listValues$/m, 'Tarefas ainda solicita GM_listValues sem uso');
  for (const id of ['central-guias', 'customizacoes', 'intimacoes']) {
    assert.doesNotMatch(sources[id], /^\/\/ @grant\s+GM_deleteValue$/m, `${id}: GM_deleteValue sem uso`);
  }
});

test('restaurações exigem schema e identidade da extensão', () => {
  for (const id of ['anotacoes', 'central-guias', 'customizacoes']) {
    assert.match(sources[id], /payload\.schema !== BACKUP_SCHEMA/, `${id}: schema do backup não é validado`);
    assert.match(sources[id], /payload\.scriptId !== SCRIPT_META\.id/, `${id}: identidade do backup não é validada`);
  }
  assert.match(sources.intimacoes, /payload\.schema !== BACKUP_SCHEMA/, 'intimacoes: schema do backup não é validado');
  assert.match(sources.intimacoes, /payload\.scriptId !== SCRIPT_ID/, 'intimacoes: identidade do backup não é validada');
  assert.match(sources.tarefas, /parsed\.schema !== expectedSchema/, 'tarefas: schema do backup não é validado');
  assert.match(sources.tarefas, /parsed\.scriptId !== SCRIPT_META\.id/, 'tarefas: identidade do backup não é validada');
  const taskBackupBuilder = sources.tarefas.match(/function buildTodoBackupPayload\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(taskBackupBuilder, /schema:\s*EXPORT_SCHEMA/, 'tarefas: payload remoto não preserva o schema atual');
  assert.doesNotMatch(taskBackupBuilder, /\.\.\.exportTodoPayload\(\)/, 'tarefas: exportação local sobrescreve o schema remoto');
});

test('Font Awesome é SVG+JS 7.2.0 e não usa webfont', () => {
  for (const [id, source] of Object.entries(sources)) {
    assert.match(source, /fontawesome-free@7\.2\.0\/js\/all\.min\.js/, `${id}: runtime SVG incorreto`);
    assert.doesNotMatch(source, /font-awesome\/.+\/css\//, `${id}: CSS de webfont encontrado`);
    assert.doesNotMatch(source, /\.(?:otf|woff2?)(?:["'?#]|$)/i, `${id}: arquivo de fonte encontrado`);
  }
});

test('Font Awesome fica isolado nas raízes da suíte', () => {
  const coreContracts = [];
  for (const [id, source] of Object.entries(sources)) {
    assert.match(source, /autoReplaceSvg\s*=\s*['"]false['"]/, `${id}: substituição global não foi desativada`);
    assert.match(source, /observeMutations\s*=\s*['"]false['"]/, `${id}: observação global não foi desativada`);
    assert.doesNotMatch(source, /autoReplaceSvg\s*=\s*['"]nest['"]/, `${id}: substituição global ainda usa nest`);
    assert.match(source, /autoReplaceSvgRoot:\s*root/, `${id}: raiz de conversão não está isolada`);
    assert.match(source, /observeMutationsRoot:\s*root/, `${id}: observer não está isolado`);
    assert.match(source, /data-pj-suite-ui/, `${id}: marcador de isolamento ausente`);
    assert.match(source, /pj-suite-core-style/, `${id}: núcleo visual comum não é injetado`);
    assert.doesNotMatch(source, /autoReplaceSvgRoot:\s*document|observeMutationsRoot:\s*document/, `${id}: documento inteiro ainda é observado`);
    const coreMatch = source.match(/const SUITE_UI_CSS = String\.raw`([\s\S]*?)`;\n/);
    assert.ok(coreMatch, `${id}: contrato visual comum ausente`);
    coreContracts.push(coreMatch[1].replace(/\s+/g, ' ').trim());
  }
  assert.equal(new Set(coreContracts).size, 1, 'os contratos visuais básicos divergiram');
  assert.doesNotMatch(sources.customizacoes, /:where\(i\.fa, i\.fas/, 'customizações ainda redimensiona ícones globais do Projudi');
  assert.match(sources.customizacoes, /:not\(\[data-pj-suite-ui\] \*\)/, 'customizações não exclui os painéis da suíte');
});

test('versões seguem data e hora crescentes', () => {
  for (const [id, source] of Object.entries(sources)) {
    const match = source.match(/^\/\/ @version\s+(\d{4}\.\d{2}\.\d{2}-\d{4})$/m);
    assert.ok(match, `${id}: versão fora do formato YYYY.MM.DD-HHmm`);
    const [, value] = match;
    const [, year, month, day, hour, minute] = value.match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})(\d{2})$/);
    const instant = new Date(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`);
    assert.equal(Number.isNaN(instant.getTime()), false, `${id}: data de versão inválida`);
    assert.equal(instant.getUTCFullYear(), Number(year), `${id}: ano de versão inválido`);
  }
});

test('payloads de backup não serializam a configuração privada', () => {
  for (const [id, source] of Object.entries(sources)) {
    const builders = [...source.matchAll(/function build\w*BackupPayload[\s\S]*?(?=\n\s*(?:async\s+)?function\s)/g)];
    assert.ok(builders.length > 0, `${id}: builder de backup ausente`);
    for (const builder of builders) {
      assert.doesNotMatch(builder[0], /(?:gistId|token|BACKUP_SETTINGS_KEY|BACKUP_STORAGE_KEY|BACKUP_KEY|KEY_BACKUP)\s*:/);
    }
  }
});

test('a pasta histórica não faz parte da suíte ativa', () => {
  for (const path of Object.values(scripts)) assert.doesNotMatch(path, /^arquivo\//);
});

test('o pop-up de backup usa o mesmo contrato visual nas cinco extensões', () => {
  const requiredClasses = [
    'pj-backup-ui__popover',
    'pj-backup-ui__dialog',
    'pj-backup-ui__header',
    'pj-backup-ui__title',
    'pj-backup-ui__description',
    'pj-backup-ui__close',
    'pj-backup-ui__grid',
    'pj-backup-ui__field',
    'pj-backup-ui__input',
    'pj-backup-ui__toggles',
    'pj-backup-ui__toggle',
    'pj-backup-ui__actions',
    'pj-backup-ui__button--primary',
    'pj-backup-ui__button--success',
    'pj-backup-ui__button--danger',
    'pj-backup-ui__status',
    'pj-backup-ui__last'
  ];
  const cssContracts = [];
  for (const [id, source] of Object.entries(sources)) {
    for (const className of requiredClasses) assert.match(source, new RegExp(className), `${id}: classe ${className} ausente`);
    const match = source.match(/const BACKUP_UI_CSS = String\.raw`([\s\S]*?)`;\n/);
    assert.ok(match, `${id}: contrato CSS de backup ausente`);
    cssContracts.push(match[1].replace(/\s+/g, ' ').trim());
  }
  assert.equal(new Set(cssContracts).size, 1, 'os contratos CSS de backup divergiram');
});

test('backups grandes ou remotos inválidos não bloqueiam novo envio', () => {
  for (const [id, source] of Object.entries(sources)) {
    assert.match(source, /file\.truncated\s*\|\|\s*!content/, `${id}: fallback de Gist truncado ausente`);
    assert.match(source, /file\.raw_url/, `${id}: leitura do raw_url ausente`);
    assert.match(source, /^\/\/ @connect\s+gist\.githubusercontent\.com$/m, `${id}: permissão para raw_url ausente`);
    if (id !== 'customizacoes') assert.match(source, /invalidOk:\s*true/, `${id}: envio não tolera JSON remoto inválido`);
    assert.match(source, /incompleto ou contém JSON inválido/, `${id}: erro amigável de restauração ausente`);
  }
});
