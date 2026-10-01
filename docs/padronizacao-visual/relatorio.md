# Padronização visual — relatório final

Concluída nas **cinco extensões ativas** em 01/10/2026. Versão dos cinco userscripts e seus cinco metadados: **2026.10.01-14:20**, no fuso `America/Sao_Paulo`. Commit local autorizado pelo usuário após a entrega da implementação. Sem push, publicação, deploy ou merge.

## Resultado

A suíte passa a ter uma fonte canônica de identidade, componentes e interação em `ui/suite-ui.css` e `ui/suite-ui.js`, incorporada nas cinco IIFEs. Os userscripts permanecem independentes e autossuficientes. Não foram acrescentados grants, domínios de conexão, runtime de fontes, `@require` ou APIs globais de produção.

Foram uniformizados cabeçalhos azul-marinho, superfícies claras, fonte nativa, títulos, descrições, cartões, campos, botões primários/secundários/perigo, badges, tabelas próprias, estados selecionados e foco. Os controles compactos e os lançadores integrados preservam sua densidade; as cores funcionais de notas, prazos e linhas nativas continuam presentes. O CSS comum é restrito a `[data-pj-suite-ui]`, inclusive na camada `pj-suite-components`, e o mapa de componentes só visita raízes pertencentes às extensões.

Os diálogos agora têm nome acessível, foco inicial, contenção de Tab/Shift+Tab, fechamento com Escape e retorno de foco. Backups aninhados fecham antes do painel principal. Quando uma ação substitui a linha focada, o teclado permanece no diálogo. Anotações ganham seleção de notas com Enter/Espaço. O fechamento libera os handlers e observers dos gerenciadores. Painéis flutuantes continuam com seus controles, drag e armazenamento existentes.

`anotacoes/projudi-anotacoes-locais.meta.js` e `customizacoes/projudi-customizacoes.meta.js` foram criados; os três outros metadados foram sincronizados. Os cinco `.meta.js` são cópias integrais dos cabeçalhos `.user.js`. Os `@updateURL` foram derivados dos `@downloadURL` já existentes, trocando apenas o sufixo; não houve consulta ou alegação de publicação desses novos arquivos. Namespace, autoria, licença, match, run-at, grants e connect foram preservados.

## Matriz de cobertura

| Extensão | Implementação | QA verificado |
| --- | --- | --- |
| Anotações | Gerenciador, busca, lista, dados/backup, ações de notas/editor/cores, seleção por teclado e foco | Vazio/preenchido; 3 larguras; filtro; Enter; backup/Tab/Escape/reabertura; editor no iframe gravando nota fictícia, conservando cor e fechando; atalho A no iframe |
| Central de Guias | Gerenciador, tabelas/filtros/badges, cartões inicial/processo/página de guias, botões compactos, avisos e backup | Vazio/preenchido; 3 larguras; busca; backup/teclado/reabertura; montagem dos 3 cartões com fixture; sincronização da tabela fictícia; atalho G no iframe; falha de sprite sem erro de execução |
| Customizações | Configurações/categorias/salvar/cancelar, backup, painel de movimentações e ferramentas do visualizador/dock; tema nativo opt-in preservado | Vazio/preenchido; 3 larguras; categoria Dados e backup; Tab/Escape/reabertura; regras de movimentações com abertura repetida; arquivo fictício minimiza/restaura sem duplicar/fecha; atalho C no iframe; contratos existentes de reversão do tema/PDF |
| Intimações | Gerenciador, filtros/datas/triagem/lista/badges/backup, ferramentas existentes e foco durante conclusão; inicialização corrigida | Vazio/preenchido; 3 larguras; busca; concluir sem perder foco; backup/teclado/reabertura; marcação/conclusão inline no iframe; aplicar/limpar filtro de datas; atalho I no iframe; linhas e estados preservados |
| Tarefas | Gerenciador, busca/status/JSON/backup, compositor inicial e do processo, listas/tags/abas/ações; rolagem do painel do processo | Vazio/preenchido; 3 larguras; busca; backup/teclado/reabertura; criar tarefa global e do processo com dados fictícios; conteúdo do compositor e lista acessível; atalho T no iframe; contratos existentes de abas e dimensionamento de lançadores |

Todas as extensões foram carregadas juntas numa fixture: **um núcleo CSS e um sprite por documento**, sem duplicação de menus no iframe. O campo nativo de controle conserva fonte, cor, fundo, borda e padding em todos os gerenciadores.

## Falhas encontradas e corrigidas

- **Intimações:** `init()` era chamado antes da declaração de `fontAwesomeSprites`, causando `ReferenceError` na inicialização. A execução foi movida para depois das declarações. A mesma falha foi reproduzida nas cópias iniciais; não havia painel inicial para capturar nessas três larguras.
- **Central de Guias:** a falha de download do sprite chamava `logWarn`, que não existia. O tratamento agora registra o aviso diretamente, libera o cache e permite novo carregamento.
- **Ícones:** Anotações, Guias e Tarefas liberam o cache após falha, como já faziam os outros scripts. O núcleo de componentes é preparado antes da requisição e o fechar possui fallback visual local.
- **Contraste:** a borda de campo proposta inicialmente não alcançava 3:1. Foi ajustada para `#7f8b9c`; texto, cores de ação e estados principais alcançam 4,5:1 contra branco.
- **Painéis:** a revisão visual levou a ajustar o preenchimento dos corpos e a rolagem/bases flexíveis de Tarefas, reservar altura útil ao painel do processo, preservar o padding da busca com ícone e retirar borda duplicada do campo de tags. A fixture também passou a usar a altura nativa do iframe por atributo, preservada quando Customizações remove a altura inline desativada.
- **Visualizador de arquivos:** minimizar e fechar agora têm rótulos acessíveis explícitos; minimizar usa o sprite SVG. O cabeçalho compacto tem dimensões próprias e o fechamento libera seu observer.
- **Manutenção:** o gerador não deixa espaços em linhas vazias; o README corrigiu a versão real de Font Awesome e a descrição desatualizada de migrações.

## Validação final

| Verificação | Resultado |
| --- | --- |
| `node --test tests/suite-contract.test.mjs` | **27/27** contratos passam; baseline era 22/22 |
| Sintaxe dos 5 `.user.js`, 5 `.meta.js`, 5 scripts de manutenção/QA e `ui/suite-ui.js` | **16 arquivos**, todos passam em `node --check` |
| `node scripts/sync-suite-ui.mjs --check` | Núcleo e helpers idênticos nas 5 extensões |
| `node scripts/sync-metadata.mjs --check` | Cabeçalhos integrais, versões e URLs consistentes nas 5 extensões |
| `git diff --check` | Sem erros de whitespace |
| QA de gerenciadores com dados vazios | **15/15**: 5 extensões × 1440/768/390 px |
| QA de gerenciadores com dados preenchidos | **15/15**: busca, seleção/conclusão, foco, backup e reabertura |
| QA simulando falha da CDN de ícones | **15/15**: componentes, nomes, teclado e fechamento funcionam, sem erros JS |
| QA de coexistência/iframe/painéis secundários | **12/12** grupos de verificações, sem erros JS |
| Preservação de `arquivo` | Mesmos **11 arquivos**, nomes, tamanhos e SHA-256 idênticos; `git diff -- arquivo` vazio |

Ambiente: **Chromium 151.0.7922.34**, Playwright já disponível no Mac, navegador de teste baixado para `/tmp/projudi-qa-browsers`, perfil descartável. O sandbox do macOS impediu a inicialização do navegador; execução fora dele foi autorizada pelo auto-review. Não houve rejeição de aprovação pendente. Todas as páginas, iframes e dados de QA são sintéticos; as requisições dos contextos foram interceptadas, e o sprite foi fornecido localmente ou deliberadamente falhou. Nenhum protocolo, envio, alteração de processo real ou leitura de credenciais pessoais ocorreu.

### Reproduzir o QA

O Playwright e seu navegador precisam estar disponíveis. Os scripts aceitam `PROJUDI_PLAYWRIGHT_MODULE` para uma instalação existente e `PLAYWRIGHT_BROWSERS_PATH` para o navegador de teste. `PROJUDI_QA_SPRITE` aponta para uma cópia local do sprite SVG 7.3.1 já utilizado pelo projeto; o padrão usado nesta execução foi `/tmp/projudi-fa-solid.svg`.

```sh
node --test tests/suite-contract.test.mjs
node scripts/sync-suite-ui.mjs --check
node scripts/sync-metadata.mjs --check
node scripts/qa-browser.mjs
node scripts/qa-browser.mjs --populated
node scripts/qa-browser.mjs --offline-icons
node scripts/qa-interactions.mjs
```

`qa-browser.mjs --before --populated` usa as cópias temporárias em `/tmp/extensoes-juridicas-visual-before`, capturadas antes das alterações. As evidências iniciais e seus hashes ficam registradas no repositório; não é necessário executar scripts históricos para comparar.

## Evidências e entrega

- [Plano e inventário](plano.md), [estado inicial](estado-inicial.json), [estado final](estado-final.json), [preservação de arquivo](preservacao-arquivo.json).
- [QA vazio](qa/after-empty-results.json), [QA preenchido](qa/after-populated-results.json), [falha de ícones](qa/after-empty-offline-results.json), [interações/iframe](qa/interactions-results.json), [comparação inicial](qa/before-populated-results.json).
- Capturas antes/depois, backups e painéis secundários em [`qa/`](qa/). Exemplos: [Anotações antes](qa/before-populated-anotacoes-1440.png)/[depois](qa/after-populated-anotacoes-1440.png), [Guias depois](qa/after-populated-centraldeguias-1440.png), [Customizações depois](qa/after-populated-customizacoes-1440.png), [Intimações no celular](qa/after-populated-intimacoes-390.png), [Tarefas depois](qa/after-populated-tarefas-1440.png), [Tarefas do processo](qa/task-process-iframe.png), [regras de movimentações](qa/custom-movimentacoes.png).

## Limitações verificadas

Não se instalou nem ativou extensão no navegador pessoal. Portanto, o QA não valida a sessão autenticada real do Projudi, Safari/wBlock, particularidades de cada gerenciador, documentos reais/PDFs ou operações remotas de Gist. As permissões e essas rotinas foram preservadas e seus contratos existentes continuam passando; as interações DOM foram verificadas com fixtures. Se a CDN estiver indisponível, alguns ícones decorativos podem faltar, mas os rótulos, componentes, foco e fechamento continuam operantes.

**Não há bloqueio de implementação pendente.** A validação na sessão real e a disponibilização remota dos novos metadados permanecem fora da execução autorizada desta tarefa.
