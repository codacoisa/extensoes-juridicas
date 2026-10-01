import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scripts } from './active-scripts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const path of scripts) {
  const source = await readFile(resolve(root, path), 'utf8');
  const header = source.match(/^\/\/ ==UserScript==\n[\s\S]*?\/\/ ==\/UserScript==\n/)?.[0];
  if (!header) throw new Error(`Cabeçalho ausente: ${path}`);
  const download = header.match(/^\/\/ @downloadURL\s+(.+)$/m)?.[1];
  const update = header.match(/^\/\/ @updateURL\s+(.+)$/m)?.[1];
  if (!download?.startsWith('https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/') || update !== download.replace(/\.user\.js$/, '.meta.js')) {
    throw new Error(`Verifique as URLs já publicadas no repositório: ${path}`);
  }
  const metaPath = resolve(root, path.replace(/\.user\.js$/, '.meta.js'));
  if (process.argv.includes('--check')) {
    if (await readFile(metaPath, 'utf8') !== header) throw new Error(`Metadados divergentes: ${path}`);
  } else await writeFile(metaPath, header);
}
console.log('Cabeçalhos e metadados consistentes nas cinco extensões.');
