import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
import { scripts } from './active-scripts.mjs';
const css = (await readFile(resolve(root, 'ui/suite-ui.css'), 'utf8')).trimEnd();
const js = (await readFile(resolve(root, 'ui/suite-ui.js'), 'utf8')).trimEnd();
for (const path of scripts) {
  const source = await readFile(resolve(root, path), 'utf8');
  const match = source.match(/^(\s*)const SUITE_UI_CSS = String\.raw`[\s\S]*?`;\n/m);
  if (!match) throw new Error(`Núcleo não encontrado: ${path}`);
  const indent = match[1].replace(/^\n/, '');
  const block = `${indent}const SUITE_UI_CSS = String.raw\`\n${css.split('\n').map(line => line ? indent + line : '').join('\n')}\n${indent}\`;\n${indent}// BEGIN SUITE_UI_HELPERS\n${js.split('\n').map(line => line ? indent + line : '').join('\n')}\n${indent}// END SUITE_UI_HELPERS\n`;
  const next = source.replace(/^(\s*)const SUITE_UI_CSS = String\.raw`[\s\S]*?`;\n(?:\s*\/\/ BEGIN SUITE_UI_HELPERS[\s\S]*?\/\/ END SUITE_UI_HELPERS\n)?/m, () => block);
  if (process.argv.includes('--check')) {
    if (source !== next) throw new Error(`Núcleo divergente: ${path}. Execute node scripts/sync-suite-ui.mjs.`);
  } else if (source !== next) await writeFile(resolve(root, path), next);
}
console.log('Núcleo visual consistente nas cinco extensões.');
