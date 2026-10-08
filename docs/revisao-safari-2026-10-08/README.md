# Revisão das cinco extensões — Safari / wBlock — 08/10/2026

Versões instaladas: **Central de Guias 2026.10.08-01:01**; **Anotações, Customizações, Intimações e Tarefas 2026.10.08-00:28**. Escopo: Anotações, Central de Guias, Customizações, Intimações e Tarefas. A pasta `arquivo/` não foi alterada.

## Correções

| Área | Problema observado | Correção |
| --- | --- | --- |
| Interface comum | Seletores nativos do Safari ficavam menores que campos e botões | Aparência, altura, espaçamento e seta dos seletores uniformizados, limitados às raízes da suíte |
| Interface comum | Tab podia saltar botões no Safari | Navegação explícita entre controles dos diálogos, incluindo Shift+Tab; Escape e retorno de foco preservados |
| Interface comum | Etiquetas podiam esticar verticalmente | Alinhamento central e largura ajustada ao conteúdo |
| Anotações | URLs antigas de BuscaProcesso ocupavam o subtítulo | Rótulo legível “Anotação do processo”, preservando a chave e o conteúdo originais |
| Anotações | Botão Excluir disputava espaço com o número do processo | Grade com coluna própria para a ação e quebra de texto em telas estreitas |
| Anotações | Excluir a última nota não atualizava corretamente a tela vazia | Reaplicação da busca atual e atualização do estado vazio |
| Central de Guias | Só as primeiras 300 linhas eram acessíveis | Paginação de 100 linhas, contagem e navegação; busca e filtros reiniciam a página e limitam a renderização |
| Central de Guias | Cartão Críticas filtrava apenas vencimentos próximos | Filtro conjunto de vencidas, hoje e em breve, coerente com seu contador |
| Central de Guias | Cartões do resumo dependiam do mouse | Botões semânticos, estado pressionado, Enter/Space e recuperação do foco |
| Central de Guias | Resumo inicial não aparecia no Projudi atual | Detecção pelo título da Área do Advogado e montagem antes do bloco de processos, aceitando contêineres aninhados |
| Intimações | Campos de período truncavam datas e tinham altura rígida | Duas colunas de datas, botão na linha seguinte e altura automática; grade adaptável à largura disponível |
| Intimações | Ações espremiam o texto da movimentação | Ações abaixo dos detalhes, movimentação com largura útil e metadados em duas colunas |
| Intimações | O núcleo tratava o contêiner de layout inteiro como cartão | Mapeamento ajustado à seção de prazos, evitando caixas e espaçamentos sobrepostos |
| Customizações | Cartões em duas colunas ficavam estreitos demais | Colunas automáticas com largura mínima, passando a uma coluna quando necessário |
| Tarefas | Ícone de concluídas branco sobre verde claro | Ícone verde com contraste visível |
| Tarefas | Atributos aria-/data- eram propriedades JS sem atributo DOM | Criação correta de atributos; identifica as linhas para reordenar e fornece nomes acessíveis |
| Tarefas | Checkboxes não identificavam a tarefa | Nome “Concluir/Reabrir tarefa: …” |
| Tarefas | Painel flutuante podia ficar fora da tela | Limites na abertura, no arraste e no redimensionamento; controles interativos não iniciam arraste |
| Tarefas | Escape e limpeza do painel eram inconsistentes | Região acessível, fechamento por Escape e remoção de listeners/observadores ao fechar |

O núcleo canônico em `ui/` foi sincronizado nas cinco fontes independentes; os cinco `.meta.js` têm cabeçalhos idênticos aos respectivos `.user.js`.

## Verificação automatizada

Todos os testes de navegador usam páginas e dados **sintéticos**, perfis descartáveis e requisições interceptadas. Não acessam o Projudi autenticado ou Gists reais.

| Verificação | Resultado |
| --- | --- |
| Contratos estáticos | 27 passaram, 0 falharam |
| Sintaxe das cinco fontes | Passou |
| Sincronização de núcleo e metadados | Passou |
| WebKit com dados preenchidos, larguras 1440, 1180, 900, 768 e 390 px | 25 casos passaram |
| Chromium com dados preenchidos, mesmas larguras | 25 casos passaram |
| WebKit sem dados e sem rede de ícones, altura 650 px, larguras 1180, 768 e 390 px | 15 casos passaram |
| Interações WebKit, cinco extensões juntas e iframe | 14 verificações passaram |

Os testes cobrem busca, paginação além de 300 guias, filtro crítico e teclado; filtros de intimações no iframe; editor de notas; compositores de tarefas; reordenação persistida; limites do painel após resize; coexistência do núcleo e sprite; abertura repetida de movimentações; minimizar/restaurar/fechar o visualizador de documentos; cartões de guias no início, processo e página de guias; detecção automática do início em estruturas antiga e atual e ausência do resumo em outras páginas. Exclusão, conclusão e gravação nesses testes atingem somente dados sintéticos.

Os relatórios JSON em `qa/` registram os resultados e as versões dos motores. As imagens salvas usam apenas dados sintéticos. As telas reais com nomes, processos e conteúdo de notas não foram copiadas para o repositório.

## Instalação e conferência no Safari real

- Inspeção inicial dos cinco painéis na sessão autenticada do Projudi para identificar os defeitos.
- Cinco versões corrigidas importadas no wBlock; somente essas versões estão ativas. As cinco instalações anteriores foram mantidas **desativadas**, sem apagar seus registros.
- Anotações foi importado por arquivo. Os outros quatro foram importados por texto, após o seletor de arquivos do wBlock não concluir a abertura. O código foi copiado das fontes atuais pelo Editor de Texto. O ajuste final da Central de Guias foi aplicado no editor do wBlock à mesma instalação local: versão e dois trechos de detecção/montagem, conferidos no editor, sem criar outra cópia ativa.
- A sessão expirou durante a revisão e foi restabelecida. A conferência abaixo foi concluída no Projudi autenticado.
- Os cinco gerenciadores foram reabertos no Safari pela sequência Ctrl+; seguida de A/G/C/I/T e inspecionados visualmente com os dados locais existentes.
- Confirmadas **27 notas**, **525 guias em 347 processos**, **115 tarefas (19 ativas e 96 concluídas)** e **547 intimações monitoradas**. Anotações e tarefas conservaram seus registros; Customizações conservou largura de 90%, centralização e aplicação em páginas diretas.
- Na Central de Guias, conferidas as páginas 1 a 6, incluindo **501–525 de 525**. O cartão Críticas selecionou **52 de 525**, igual ao contador, incluindo guias vencidas.
- Intimações exibiu datas completas, cartões ajustados e ações abaixo da movimentação. Tarefas exibiu ícone de concluídas e etiquetas com o novo alinhamento.

- Em processo aberto diretamente no Safari: botões e editor de Anotações, compositor de Tarefas e cartão compacto da Central de Guias conferidos. A ação “Abrir guias” levou à página direta de emissão, com cartão e tabela nativa preservados.
- Em processo aberto no iframe do Projudi: editor de notas, painel de tarefas e atalho de Customizações conferidos; o gerenciador abriu no documento principal. A ação “Abrir guias” também funcionou dentro do iframe.
- A sincronização normal durante a navegação passou de 525 para **526 guias nos mesmos 347 processos**; o gerenciador final confirmou a nova contagem e manteve a paginação em seis páginas.
- Na página inicial autenticada: o resumo da Central de Guias apareceu antes do bloco de processos, com contadores, tabela e ações legíveis. O gerenciador continuou disponível no menu superior.
- Filtro de Intimações aplicado a 08/10/2026: cinco linhas do diário exibidas. Ao limpar, as linhas originais voltaram; os totais nativos foram preservados. O filtro foi deixado inativo.

Os testes que criam, excluem, concluem e reordenam registros usam somente dados sintéticos. No Safari autenticado, a conferência de notas e tarefas foi feita sem digitar novos registros. Nenhuma nota real foi excluída, tarefa concluída, guia marcada como paga ou petição enviada. Visitar processos e páginas de guias executou a sincronização local normal dos scripts.

As importações locais no wBlock não são atualizadas automaticamente. Os arquivos no workspace são a fonte desta versão; futuras atualizações precisam ser importadas novamente ou publicadas no fluxo remoto existente. Não houve commit, push ou publicação remota. Reativar instalações antigas exige cuidado com dados alterados posteriormente: elas têm armazenamento GM próprio e não representam um backup sincronizado das futuras alterações.

## Reproduzir

```sh
node --test tests/suite-contract.test.mjs
node scripts/sync-suite-ui.mjs --check
node scripts/sync-metadata.mjs --check
node scripts/qa-browser.mjs --populated
node scripts/qa-interactions.mjs
```

Para outro motor ou instalação de Playwright, definir `PROJUDI_PLAYWRIGHT_MODULE`, `PROJUDI_QA_BROWSER` e, se necessário, `PROJUDI_QA_EXECUTABLE`. `PROJUDI_QA_OUTPUT` seleciona uma pasta nova para evidências. Para telas baixas/offline: `PROJUDI_QA_HEIGHT=650`, `PROJUDI_QA_WIDTHS=1180,768,390` e `node scripts/qa-browser.mjs --offline-icons`. O sprite de QA pode ser indicado por `PROJUDI_QA_SPRITE`.

Os hashes SHA-256 das cinco fontes instaladas estão em [fontes-verificadas.json](fontes-verificadas.json).
