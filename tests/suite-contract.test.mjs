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

test('Font Awesome é SVG+JS 7.2.0 e não usa webfont', () => {
  for (const [id, source] of Object.entries(sources)) {
    assert.match(source, /fontawesome-free@7\.2\.0\/js\/all\.min\.js/, `${id}: runtime SVG incorreto`);
    assert.doesNotMatch(source, /font-awesome\/.+\/css\//, `${id}: CSS de webfont encontrado`);
    assert.doesNotMatch(source, /\.(?:otf|woff2?)(?:["'?#]|$)/i, `${id}: arquivo de fonte encontrado`);
  }
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
