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

test('Font Awesome usa sprite SVG 7.3.1 sem runtime ou webfont global', () => {
  for (const [id, source] of Object.entries(sources)) {
    assert.match(source, /fontawesome-free@7\.3\.1\/sprites\/solid\.svg/, `${id}: sprite SVG incorreto`);
    assert.doesNotMatch(source, /fontawesome-free@[^/]+\/js\/all\.min\.js/, `${id}: runtime global do Font Awesome encontrado`);
    assert.doesNotMatch(source, /defaultView\s*&&\s*[^\n]*FontAwesome|\.FontAwesome\b/, `${id}: API global do Font Awesome encontrada`);
    assert.doesNotMatch(source, /font-awesome\/.+\/css\//, `${id}: CSS de webfont encontrado`);
    assert.doesNotMatch(source, /\.(?:otf|woff2?)(?:["'?#]|$)/i, `${id}: arquivo de fonte encontrado`);
    assert.match(source, /^\/\/ @connect\s+cdn\.jsdelivr\.net$/m, `${id}: permissão do sprite ausente`);
  }
});

test('Font Awesome fica isolado nas raízes da suíte', () => {
  const coreContracts = [];
  for (const [id, source] of Object.entries(sources)) {
    assert.match(source, /root\.querySelectorAll\(['"]i\.fa-solid['"]\)/, `${id}: conversão não está limitada à raiz`);
    assert.match(source, /observer\.observe\(root,\s*\{\s*childList:\s*true,\s*subtree:\s*true\s*\}\)/, `${id}: observer não está limitado à raiz`);
    assert.match(source, /pj-suite-fa-sprite/, `${id}: sprite interno não é montado`);
    assert.match(source, /const existingSprite = [^;]+getElementById\(['"]pj-suite-fa-sprite['"]\)/, `${id}: corrida entre extensões pode duplicar o sprite`);
    assert.match(source, /pj-suite-fa-\$\{symbol\.id\}/, `${id}: símbolos não recebem namespace`);
    assert.match(source, /data-pj-suite-ui/, `${id}: marcador de isolamento ausente`);
    assert.match(source, /pj-suite-core-style/, `${id}: núcleo visual comum não é injetado`);
    const coreMatch = source.match(/const SUITE_UI_CSS = String\.raw`([\s\S]*?)`;\n/);
    assert.ok(coreMatch, `${id}: contrato visual comum ausente`);
    coreContracts.push(coreMatch[1].replace(/\s+/g, ' ').trim());
  }
  assert.equal(new Set(coreContracts).size, 1, 'os contratos visuais básicos divergiram');
  assert.doesNotMatch(sources.customizacoes, /:where\(i\.fa, i\.fas/, 'customizações ainda redimensiona ícones globais do Projudi');
  assert.match(sources.customizacoes, /:not\(\[data-pj-suite-ui\] \*\)/, 'customizações não exclui os painéis da suíte');
  assert.doesNotMatch(sources['central-guias'], /renderFontAwesome\(ul\)/, 'Central de Guias ainda altera a fonte do menu nativo');
  assert.doesNotMatch(sources.customizacoes, /body \*:not\(i\)/, 'fonte personalizada ainda alcança elementos globais do cabeçalho');
  assert.doesNotMatch(sources.customizacoes, /#cssmenu a\s*\{[^}]*font-family/s, 'fonte personalizada ainda alcança os atalhos de ícone do cabeçalho');
});

test('ícones SVG preservam os contratos usados pelas extensões', () => {
  for (const [id, source] of Object.entries(sources)) {
    assert.match(source, /new Set\(\[\.\.\.icon\.classList, ['"]pj-suite-fa['"]\]\)/, `${id}: classes originais do ícone não são preservadas`);
    assert.match(source, /\[\.\.\.icon\.attributes\]\.forEach/, `${id}: atributos originais do ícone não são preservados`);
    assert.match(source, /\.pj-suite-fa\.fa-2x\s*\{\s*font-size:\s*2em/, `${id}: escala fa-2x não é suportada`);
    assert.match(source, /\.pj-suite-fa\.fa-spin\s*\{\s*animation:/, `${id}: animação fa-spin não é suportada`);
  }
  assert.match(sources.anotacoes, /#pj-add-btn :is\(i, \.pj-suite-fa\)/, 'anotações não dimensiona o SVG convertido');
  assert.match(sources.tarefas, /#\$\{ID_PROC_BTN\} :is\(i, \.pj-suite-fa\)/, 'tarefas não dimensiona o SVG convertido');
  assert.doesNotMatch(sources.tarefas, /script\[data-pj-fa-svg/, 'tarefas ainda contém referência ao runtime removido');
});

test('atalhos do processo e filtros de intimações mantêm o comportamento atual', () => {
  assert.match(sources.anotacoes, /const nativeIconSize = Math\.max\([\s\S]{0,300}?--pj-integrated-icon-size/, 'anotações não mede o ícone nativo');
  assert.match(sources.anotacoes, /width: var\(--pj-integrated-icon-size, 32px\) !important;/, 'ícone de anotações não acompanha a escala nativa');
  assert.match(sources.tarefas, /function matchProcessLauncherSize\(button, anchor\)/, 'tarefas não mede o atalho vizinho');
  assert.match(sources.tarefas, /width: var\(--pj-process-icon-size, 32px\) !important;/, 'ícone de tarefas não acompanha a escala vizinha');

  const intimacoes = sources.intimacoes;
  assert.match(intimacoes, /\.pjip-table tbody tr\.pjip-row--marked > td\s*\{\s*background-color: #eaf3ff !important;/, 'linhas a fazer não recebem o fundo azul');
  assert.match(intimacoes, /\.pjip-table tbody tr\.pjip-row--done > td\s*\{\s*background-color: #eaf8ef !important;/, 'linhas concluídas não recebem o fundo verde');
  assert.match(intimacoes, /else hideDeadlineRow\(row\);/, 'o filtro de data não oculta linhas incompatíveis');
  assert.match(intimacoes, /safeRun\('Falha ao preparar uma linha da tabela de intimações\.'/, 'uma linha inválida ainda interrompe toda a tabela');
  assert.doesNotMatch(intimacoes, /host\.replaceChildren\([\s\S]{0,800}?renderFontAwesome\(host\)/, 'os controles textuais da linha ainda acionam o carregador de ícones');
  assert.doesNotMatch(intimacoes, /item \? '★' : '☆'|buildInlineButton\([\s\S]{0,120}?['"]✓['"]/, 'os controles inline ainda dependem de glifos da fonte');
  assert.match(intimacoes, /buildInlineFontAwesomeIcon\(doc, iconName\)/, 'os controles inline não usam SVG direto');
  assert.match(intimacoes, /--pjip-native-icon-size/, 'os controles inline não acompanham os ícones nativos da tabela');
  assert.match(intimacoes, /use\.setAttribute\('href', `#pj-suite-fa-\$\{iconName\}`\)/, 'os SVGs inline não usam o sprite isolado da suíte');
  assert.match(intimacoes, /svg\.dataset\.icon = iconName;/, 'os SVGs inline não preservam o nome necessário à reconstrução no Safari');
  assert.match(intimacoes, /ensureFontAwesome\(context\.doc\)\.then\(sprite =>[\s\S]{0,240}?refreshInlineFontAwesomeIcons\(context\.doc\)/, 'os ícones criados antes do sprite não são reconstruídos no Safari');
  assert.match(intimacoes, /if \(!doc\) return Promise\.resolve\(null\);/, 'o carregador SVG não tolera documentos antigos do Projudi');
  assert.match(intimacoes, /const styleHost = doc\.head \|\| doc\.documentElement;/, 'o CSS isolado exige indevidamente um elemento head');
  assert.match(intimacoes, /beginFrameSettlement\(state\.frameDoc\);\s*refreshFrameContext\(\);[\s\S]{0,80}?scheduleRefreshBurst\(\);/, 'a carga inicial não acompanha a montagem tardia do iframe');
  assert.match(intimacoes, /state\.settleObserver = new MutationObserver[\s\S]{0,700}?state\.settleObserver\.observe\(root, \{ childList: true, subtree: true \}\)/, 'a tabela montada após o load não dispara nova sincronização');
  assert.match(intimacoes, /endFrameSettlement\(false\);\s*safeRun\('Falha ao aplicar os estilos da tabela de intimações\.'[\s\S]{0,260}?safeRun\('Falha ao sincronizar a tabela de intimações\.'/, 'a sincronização principal não encerra a observação temporária ou não está isolada de falhas');
  assert.match(intimacoes, /const hasCurrentDocument = state\.frame \? syncFrameDocument\(state\.frame\) : false;/, 'as atualizações continuam usando uma referência antiga do iframe');
  assert.match(intimacoes, /const documentChanged = currentDoc !== state\.frameDoc;/, 'a substituição do documento interno não é detectada');
  assert.doesNotMatch(intimacoes, /pageSignature|buildPageSignature/, 'o cache obsoleto de página ainda pode ocultar as ações');
  assert.doesNotMatch(intimacoes, /DEADLINE_WEEKDAY_PALETTE|DEADLINE_WEEKEND_COLOR|applyDeadlineHighlightToCell|tm-hl7d/, 'o destaque obsoleto por célula foi reintroduzido');
});

test('abas da visão geral de tarefas ficam isoladas dos botões do Projudi', () => {
  const tarefas = sources.tarefas;
  assert.doesNotMatch(tarefas, /el\('button',\s*\{\s*className:\s*'pj-home-tab/, 'as abas ainda herdam os estilos globais de button do Projudi');
  assert.match(tarefas, /el\('div',\s*\{\s*className:\s*'pj-home-tab active',\s*role:\s*'tab'/, 'a aba global não usa um controle isolado com semântica de tab');
  assert.match(tarefas, /#pj-todo\.pj-todo-home \.pj-home-tab\s*\{\s*all:\s*unset;/, 'os estilos das abas não estão isolados e limitados à raiz da extensão');
  assert.match(tarefas, /tabGlobal\.addEventListener\('keydown'/, 'as abas isoladas não preservam a navegação por teclado');
});

test('painel interno do processo acompanha a visão geral de tarefas', () => {
  const tarefas = sources.tarefas;
  assert.match(tarefas, /className:\s*'pj-todo-modern pj-todo-process'/, 'o painel do processo não usa a estrutura visual reformulada');
  assert.match(tarefas, /'Nova tarefa deste processo'/, 'o painel do processo não possui o compositor reformulado');
  assert.match(tarefas, /className:\s*'pj-process-count-pill'/, 'o painel do processo não informa a quantidade de pendências');
  assert.match(tarefas, /:is\(\.pj-home-layout, \.pj-process-layout\) \.pj-item/, 'os cartões reformulados não são compartilhados com o painel do processo');
});

test('script de tarefas não conserva a interface flutuante removida', () => {
  const tarefas = sources.tarefas;
  assert.doesNotMatch(tarefas, /ID_MIN_BTN|FAB_UI|mountFloatingMinButton/, 'o lançador flutuante sem uso ainda permanece no script');
  assert.doesNotMatch(tarefas, /\.pj-sec-head|\.pj-new\s*\{|#pj-todo-title/, 'estilos da interface anterior ainda são injetados');
  assert.doesNotMatch(tarefas, /minimized/, 'o estado visual sem efeito ainda é persistido');
  assert.match(tarefas, /function createModernPanelHeader\(/, 'os painéis modernos ainda duplicam a construção do cabeçalho');
  assert.match(tarefas, /function createTaskComposer\(/, 'os painéis modernos ainda duplicam o compositor de tarefas');
  assert.match(tarefas, /function normalizePanelUI\(/, 'a posição salva do painel não é normalizada');
});

test('Customizações reverte integralmente recursos visuais', () => {
  const source = sources.customizacoes;
  assert.match(source, /function restoreCustomHeaderStructure\(\)/, 'cabeçalho personalizado não possui restauração explícita');
  assert.match(source, /function resetLayoutEffects\(\)[\s\S]{0,1800}?restoreCustomHeaderStructure\(\);/, 'desativar personalizações deixa a estrutura do cabeçalho alterada');
  assert.match(source, /if \(!settings\.enabled \|\| !settings\.enableIframeAutoHeight\) \{\s*iframe\.style\.removeProperty\("height"\);/, 'desativar altura automática deixa a altura anterior no iframe');
  assert.match(source, /const iframeTop = Math\.max\(0, iframe\.getBoundingClientRect\(\)\.top\);/, 'altura automática ignora a posição real do iframe');
  assert.match(source, /function resetLayoutEffects\(\)[\s\S]{0,350}?unbindIframeLoadListener\(\);/, 'desativar personalizações deixa listeners do iframe ativos');
  assert.match(source, /const hasHeaderAdjust = settings\.enabled && !isPublicLandingPage\(\);/, 'a estabilização do cabeçalho nativo alcança a entrada pública ou deixa páginas autenticadas sem proteção');
  assert.match(source, /#pgn_cabecalho \{[\s\S]{0,180}?width: \$\{widthValue\} !important;/, 'a largura não alcança o conteúdo do cabeçalho');
  assert.match(source, /#menuPrinciapl\.menu \{[\s\S]{0,220}?width: \$\{widthValue\} !important;/, 'a largura não alcança a navegação principal');
  assert.match(source, /const widthLayoutCss = widthEnabled \? `[\s\S]{0,900}?#divCorpo,[\s\S]{0,500}?width: \$\{widthValue\} !important;/, 'a largura não sobrescreve os contêineres nativos do conteúdo');
  assert.match(source, /body > div\[style\*="width:"\]\[style\*="margin"\],[\s\S]{0,160}?width: \$\{widthValue\} !important;/, 'a largura não alcança os contêineres inline usados pelo Projudi');
  assert.match(source, /--pjc-header-primary:[\s\S]{0,1500}?radial-gradient\([\s\S]{0,220}?linear-gradient\(/, 'o cabeçalho personalizado não possui identidade visual própria');
  assert.match(source, /#menuPrinciapl\.menu > ul > li\.active > a,[\s\S]{0,260}?box-shadow: inset 0 -2px 0/, 'a navegação personalizada não diferencia a seção ativa');
  assert.match(source, /const header = document\.getElementById\("Cabecalho"\) \|\| document\.getElementById\("pgn_cabecalho"\);/, 'o cabeçalho personalizado não reconhece páginas autônomas');
  assert.match(source, /!settings\.customHeaderEnabled \|\| !document\.body \|\| isPublicLandingPage\(\)/, 'o cabeçalho personalizado ainda alcança a entrada pública');
  assert.match(source, /#pjc-custom-header-root #pgn_cabecalho h1 \{\s*color: #ffffff !important;/, 'o visual moderno pode apagar o título do cabeçalho autônomo');
  assert.match(source, /#menuPrinciapl\.menu \{[\s\S]{0,240}?display: flex !important;[\s\S]{0,240}?flex-wrap: nowrap !important;/, 'a navegação personalizada não mantém os itens na mesma faixa');
  assert.match(source, /#menuPrinciapl\.menu > ul \{[\s\S]{0,220}?flex: 0 0 auto !important;/, 'os grupos nativos do menu ainda ocupam a barra inteira');
  assert.match(source, /const customHeaderWidth = widthEnabled \? widthValue : "100%";/, 'o cabeçalho personalizado não acompanha a largura configurada');
  assert.match(source, /#pjc-custom-header-root \{[\s\S]{0,500}?width: \$\{customHeaderWidth\} !important;[\s\S]{0,180}?margin: 0 \$\{customHeaderMargins\} 12px !important;/, 'a raiz do cabeçalho personalizado não se alinha ao conteúdo');
  assert.match(source, /#menuPrinciapl\.menu > ul:hover,[\s\S]{0,380}?background: transparent !important;[\s\S]{0,120}?box-shadow: none !important;/, 'o hover do menu ainda deixa o fundo cinza nativo exposto');
  assert.match(source, /#cssmenu > ul > li > #btn-voz-pesquisa,[\s\S]{0,240}?#ContrasteAlterar,[\s\S]{0,240}?#FonteAumentar,[\s\S]{0,240}?#FonteDiminuir \{[\s\S]{0,420}?min-width: 34px !important;/, 'os controles de acessibilidade não compartilham o contrato dos demais ícones');
  assert.match(source, /const stableNativeHeaderCss = `[\s\S]{0,500}?#cssmenu > ul \{[\s\S]{0,220}?flex-wrap: nowrap !important;/, 'o cabeçalho nativo permite que o botão de saída caia para outra linha');
  assert.match(source, /const css = `\$\{stableNativeHeaderCss\}[\s\S]{0,180}?\$\{visibilityCss\}`;/, 'as preferências de visibilidade são sobrescritas pelo visual do cabeçalho');
  assert.match(source, /#pjc-custom-header-root #pgn_cabecalho > div\[style\*="float: right"\][\s\S]{0,100}?display: none !important;/, 'ocultar ícones não prevalece no cabeçalho personalizado');
  assert.match(source, /const customHeaderIframeClearanceCss = settings\.customHeaderEnabled && isIframeDocument[\s\S]{0,160}?body \{[\s\S]{0,140}?padding-top: 16px !important;/, 'o cabeçalho personalizado não reserva espaço suficiente no topo das páginas internas');
  assert.match(source, /const customHeaderIframeClearanceCss = settings\.customHeaderEnabled && isIframeDocument[\s\S]{0,380}?\.divCorpo > \.area:first-child,[\s\S]{0,160}?margin-top: 0 !important;/, 'a margem negativa do título inicial anula a folga do iframe');
  assert.match(source, /const h = Math\.max\(200, Math\.floor\(window\.innerHeight - iframeTop\)\);[\s\S]{0,100}?iframe\.style\.height = h \+ "px";/, 'a altura automática conserva uma altura obsoleta em janelas menores');
  assert.match(source, /if \(settings\.enableIframeAutoHeight\) requestAnimationFrame\(ajustarAlturaIframe\);/, 'a altura do iframe não é recalculada após o cabeçalho estabilizar');
  assert.match(source, /function cancelIframeInjectionRetries\(\)[\s\S]{0,140}?iframeRetryRunId \+= 1;/, 'as tentativas de injeção do iframe não possuem cancelamento centralizado');
  assert.match(source, /function retryInjectInIframe[\s\S]{0,500}?runId !== iframeRetryRunId \|\| !settings\.enabled \|\| !shouldManageIframeFeatures\(\)/, 'uma tentativa obsoleta ainda pode alterar o iframe');
  assert.match(source, /function initProcessMirrorPdfFeature\(doc\)[\s\S]{0,500}?mirrorPdfObserver && mirrorPdfObservedDoc === doc[\s\S]{0,220}?teardownProcessMirrorPdfFeature\(\);[\s\S]{0,120}?mirrorPdfObservedDoc = doc;/, 'o observer do espelho é recriado ou permanece ligado ao documento anterior');
  assert.match(source, /function teardownProcessMirrorPdfFeature\(doc\)[\s\S]{0,500}?new Set\(\[mirrorPdfObservedDoc, doc\]\.filter\(Boolean\)\)/, 'a limpeza do espelho não alcança o documento observado anteriormente');
  assert.match(source, /const mirrorPdfDepsPromises = new WeakMap\(\);/, 'as dependências do PDF não possuem cache por documento');
  assert.match(source, /function ensureMirrorPdfDeps\(doc\)[\s\S]{0,700}?mirrorPdfDepsPromises\.get\(doc\)/, 'as dependências do PDF são compartilhadas entre documentos diferentes');
  assert.match(source, /function ensureMirrorPdfDeps\(doc\)[\s\S]{0,500}?hasJsPdf\(\) && hasAutoTable\(\)[\s\S]{0,700}?!hasJsPdf\(\) \|\| !hasAutoTable\(\)/, 'o espelho não valida jsPDF e AutoTable em conjunto');
  assert.match(source, /function syncMovimentacoesModule\(\)[\s\S]{0,180}?if \(!enabled && !movimentacoesModule\) return;/, 'o módulo de movimentações é inicializado mesmo desativado');
  assert.match(source, /function setMovimentacoesEnabled\(enabled\)[\s\S]{0,180}?if \(CFG\.enabled === nextEnabled\) return;/, 'o módulo de movimentações reprocesa uma configuração inalterada');
  assert.match(source, /fontAwesomeSprites\.delete\(doc\);[\s\S]{0,100}?Falha ao preparar ícones SVG/, 'uma falha temporária de ícones permanece armazenada');
  assert.match(source, /function ensureFontAwesome\(doc = document\) \{\s*if \(!doc \|\| !doc\.head\) return Promise\.resolve\(null\);/, 'a preparação de ícones pode devolver um valor incompatível com renderFontAwesome');
  assert.doesNotMatch(source, /projudi-customizacoes-open-settings|MOV_TABLE_ROWS_SELECTOR/, 'o script conserva protocolos ou seletores sem consumidor');
  assert.match(source, /function syncModernTableSemantics\(doc\)[\s\S]{0,700}?normalizeLabel\(cell\.textContent\) === "qtde"[\s\S]{0,180}?data-pjc-column-kind", "quantity"/, 'a coluna Qtde não recebe semântica de alinhamento');
  assert.match(source, /table\$\{nativePopupTableGuard\} :is\(th, td\)\[data-pjc-column-kind="quantity"\] \{\s*text-align: center !important;/, 'o cabeçalho Qtde não acompanha o alinhamento dos valores');
  assert.match(source, /function findNativePopupRoots\(doc\)[\s\S]{0,500}?"\.ui-dialog"[\s\S]{0,300}?"#simplemodal-container"/, 'os diálogos nativos conhecidos não são reconhecidos');
  assert.match(source, /normalizeLabel\(ownText\)\.startsWith\("consulta de "\)[\s\S]{0,700}?current\.querySelector\("table"\)/, 'consultas modais sem classe conhecida não possuem detecção estrutural');
  assert.match(source, /new MutationObserver\(\(\) => scheduleNativePopupTableSync\(doc\)\)[\s\S]{0,140}?childList: true, subtree: true/, 'tabelas inseridas dinamicamente em pop-ups não são protegidas');
  assert.match(source, /const nativePopupTableGuard = ":not\(\[data-pjc-native-popup-table\]\)";[\s\S]{0,450}?table\.Tabela:not\(\.pjip-table\)\$\{nativePopupTableGuard\}/, 'tabelas de pop-ups ainda recebem o espaçamento do tema moderno');
  assert.match(source, /function resetLayoutEffects\(\)[\s\S]{0,900}?teardownNativePopupTableObserver\(document\);[\s\S]{0,900}?teardownNativePopupTableObserver\(iframe\.contentDocument\);/, 'desativar as customizações deixa observers de pop-up ativos');
  assert.match(source, /function syncServentiaSelectionContext\(doc\)[\s\S]{0,850}?data-pjc-serventia-selection/, 'a seleção de serventias não possui contexto visual próprio');
  assert.match(source, /html\[data-pjc-serventia-selection\] body > div\[style\*="background-color"\]\[style\*="#ccc"\]\[style\*="height:28px"\][\s\S]{0,100}?display: none !important;/, 'o separador cinza legado permanece na seleção de serventias');
  assert.match(source, /html\[data-pjc-serventia-selection\] #divCorpo > fieldset[\s\S]{0,420}?border-left: 4px solid #2d79b3 !important;/, 'as serventias não usam cartões coerentes com o visual moderno');
  assert.match(source, /html\[data-pjc-serventia-selection\] body > fieldset \{[\s\S]{0,280}?width: \$\{widthEnabled \? widthValue/, 'os cartões autônomos de serventia escapam da largura configurada');
  assert.match(source, /html\[data-pjc-serventia-selection\] body > fieldset > legend/, 'a estrutura real da seleção de serventias não recebe o visual especializado');
  assert.match(source, /const BASE_CONTENT_FONT_PX = 12;/, 'o tema moderno não preserva a escala tipográfica nativa do Projudi');
  assert.match(source, /font-size: \$\{settings\.fontScaleEnabled \? scaledFontPx : BASE_CONTENT_FONT_PX\}px !important;/, 'o tema moderno ainda impõe uma fonte maior quando a escala está desativada');
  assert.match(source, /function isPublicLandingPage\(\)[\s\S]{0,360}?pathname === "\/"/, 'a página pública inicial não é reconhecida explicitamente');
  assert.match(source, /function isStandaloneContentPage\(\)[\s\S]{0,260}?isPublicLandingPage\(\)[\s\S]{0,220}?\/\\\/Usuario\\b\/i/, 'páginas autônomas autenticadas não estão separadas da entrada pública');
  assert.match(source, /!settings\.applyToStandalonePages && !hasStandaloneVisualFeatures\(\)/, 'o visual autônomo ainda depende do ajuste de largura');
  assert.doesNotMatch(source, /table\.listagem:not\(\.pjip-table\) th,[\s\S]{0,650}?vertical-align: middle !important;\s*text-align: left !important;/, 'tabelas legíveis sobrescrevem o alinhamento semântico dos cabeçalhos');
});

test('APIs auxiliares e mensagens ficam isoladas do contexto global da página', () => {
  for (const [id, source] of Object.entries(sources)) {
    assert.match(source, /const gmRegisterMenuCommand =/, `${id}: wrapper local do menu ausente`);
    assert.match(source, /const gmXmlHttpRequest =/, `${id}: wrapper local de requisição ausente`);
    assert.doesNotMatch(source, /window\.(?:GM_registerMenuCommand|GM_xmlhttpRequest|__pjLeaderUntil|__pjTodoApi)/, `${id}: API auxiliar publicada no window`);
    assert.doesNotMatch(source, /window\[INSTANCE_KEY\]/, `${id}: instância publicada diretamente no window`);
    assert.doesNotMatch(source, /postMessage\([\s\S]{0,180}?,\s*['"]\*['"]\s*\)/, `${id}: mensagem enviada sem origem de destino`);
    const messageListeners = [...source.matchAll(/addEventListener\(['"]message['"]/g)].length;
    const originChecks = [...source.matchAll(/\.origin !== window\.location\.origin/g)].length;
    assert.ok(originChecks >= messageListeners, `${id}: listener de mensagem sem validação de origem`);
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
