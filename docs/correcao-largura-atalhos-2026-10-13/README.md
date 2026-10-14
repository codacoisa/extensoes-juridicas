# Largura do grupo de atalhos — 13/10/2026

O Safari e o print mostram a sequência correta dos quatro ícones, mas um vazio após Tarefas. A causa é a regra nativa `.VisualizaDados span`: ela reserva 255 px de largura e 5 px de padding em cada lado para campos de dados. O grupo local também é um `span` e herdava essa largura. A fixture anterior não reproduzia essa regra.

O grupo agora usa largura automática, não encolhe como item flex e não recebe padding à direita. O padding à esquerda permanece para preservar a distância já aprovada entre o alfinete e Anotações. A alteração afeta somente o grupo `#pj-local-process-actions`; os botões nativos, cores e eventos permanecem intactos. Funciona também com Anotações ou Tarefas da versão anterior, em qualquer ordem de carregamento.

A lógica está em `ui/suite-ui.js`, incorporada às cinco fontes autossuficientes. Apenas Anotações e Tarefas chamam esse helper. Fontes e metadados: `2026.10.13-23:38`. `arquivo/` permanece intacto.

## Evidência sintética

Antes, usando a versão `6fa2a7b` com a regra nativa de largura:

![Vazio após Tarefas](evidencias/antes.png)

Depois, no WebKit:

![Grupo ocupa apenas os ícones](evidencias/webkit.png)

Depois, no Chromium dentro do iframe:

![Grupo alinhado à direita no iframe](evidencias/chromium-iframe.png)

Os recortes incluem toda a largura da barra, inclusive o espaço após o último ícone.

## Validação

A fixture agora reproduz as regras nativas de `div` e `span` dentro de `.VisualizaDados`. O QA mede a distância do último desenho até o fim da barra (máximo 6 px) e o alinhamento da barra à borda direita do conteúdo (tolerância de 1 px), além das verificações existentes de ordem, espaçamento entre desenhos, cores, eventos, painéis e restauração do layout.

Passaram **272 cenários de layout**, **34 verificações gerais de interação** (17 por motor), **27 contratos**, sintaxe das cinco fontes, sincronização de núcleo/metadados e `git diff --check`. O cenário anterior falhou em todos os 20 casos de regressão: sobravam 174–226 px após o último ícone. Com o ajuste, a folga é de 6 px e a barra chega à borda direita do conteúdo. A variação máxima entre os espaçamentos internos antes/depois foi inferior a 0,001 px.

Os resultados consolidados e hashes estão em [evidencias/resultados.json](evidencias/resultados.json). Todos os dados e imagens de teste são fictícios. O código-fonte do processo usado no diagnóstico foi salvo apenas temporariamente e não integra o repositório.

Para reproduzir, usar `scripts/qa-process-actions.mjs`, `--conciliation`, `--late-font` e as variáveis descritas no [relatório da barra](../correcao-barra-processo-2026-10-13/README.md). Para atualização parcial, `PROJUDI_QA_LEGACY_ROOT` deve apontar para as fontes de `6fa2a7b`. Executar também `node --test tests/suite-contract.test.mjs`, verificações de sintaxe e sincronização, `git diff --check` e `scripts/qa-interactions.mjs`.

O Safari foi inspecionado para diagnosticar a versão instalada. A nova fonte foi validada em perfis descartáveis Chromium/WebKit. O wBlock não foi alterado; esta rodada não confirma a instalação da nova versão na sessão pessoal. As alterações permanecem locais; não houve push.
