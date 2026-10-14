# Barra do processo com conciliação — 13/10/2026

> Atualização de 14/10/2026: as extensões ativas agora usam apenas `.user.js`, sem arquivos de metadados separados ou gerador de `.meta.js`. As menções abaixo registram o estado histórico da revisão. Para manutenção atual, consulte o README principal.

## Causa da falha anterior

O novo print e a inspeção do Safari mostraram conciliação visível, alfinete à direita e os atalhos locais fora da sequência. A regra que faltava na fixture é `.notaProcesso { position: relative; float: right; }`, carregada pelo [CSS nativo especificos.css](https://projudi.tjgo.jus.br/css/especificos.css?v=20230516). A barra `.divBotoesDireita` também flutua à direita.

A fixture da revisão anterior reproduzia o contêiner e a fonte, mas omitia esse float do botão e mantinha a conciliação oculta. Seus testes não verificavam a ordem visual nem limitavam os espaços excessivos. Isso permitiu que uma correção incompleta passasse. Com a regra real e conciliação visível, a versão `fbbeb48` falhou nos dez cenários de regressão: ordem visual incorreta e folga insuficiente entre desenhos.

## Implementação

A barra inteira agora dispõe seus filhos em uma única linha flexível, na ordem **conciliação → alfinete → anotações → tarefas**. O float nativo deixa de controlar a posição do alfinete quando ele é um item flex, mantendo o nó, as classes e o evento originais.

Somente o layout do contêiner é administrado: `display`, `align-items` e `column-gap`. Cores, fontes, rotação e atributos dos botões/ícones nativos são preservados. A folga considera o desenho girado e acompanha o carregamento da fonte. Quando não há atalhos locais, os três estilos anteriores do contêiner são restaurados.

Grupos locais de uma versão anterior são substituídos preservando seus botões e eventos. Isso permite atualizar Anotações e Tarefas em momentos diferentes. A lógica está no núcleo comum, sincronizado nas cinco IIFEs; os outros três scripts não chamam o helper de atalhos locais. Versão das fontes: `2026.10.13-10:38`.

## Resultado sintético

Antes, com o código anterior e CSS nativo completo da barra:

![Conciliação e atalhos antes do alfinete](evidencias/antes.png)

Depois, no WebKit:

![Quatro controles em sequência e alinhados](evidencias/webkit-top.png)

Depois, no Chromium dentro do iframe:

![Quatro controles em sequência no iframe](evidencias/chromium-iframe.png)

Os recortes incluem as extremidades do desenho girado; não se limitam à caixa do botão ou contêiner.

## Validação executada

| Cobertura | WebKit | Chromium |
| --- | --- | --- |
| Conciliação visível; 5 larguras, 5 combinações de scripts, página e iframe | 50 aprovados | 50 aprovados |
| Conciliação oculta; mesma matriz | 50 aprovados | 50 aprovados |
| Fonte tardia com conciliação visível | 20 aprovados | 20 aprovados |
| Tarefas anterior + Anotações nova; duas ordens, duas larguras, página/iframe | 8 aprovados | 8 aprovados |
| Anotações anterior + Tarefas nova; mesma matriz | 8 aprovados | 8 aprovados |
| QA geral de interações da suíte | 17 aprovados | 17 aprovados |

Total: **272 cenários específicos e 34 verificações gerais**, sem falhas nessas execuções. Também passaram os **27 contratos**, a sintaxe das cinco fontes, sincronização de núcleo/metadados e `git diff --check`.

As larguras são 1440, 1180, 900, 768 e 390 px. Os testes agora exigem ordem visual correta, centros alinhados, pelo menos 8 px de folga entre desenhos e ausência de espaços superiores a 32 px entre ações. Verificam também cores/fontes/rotação/atributos/eventos nativos, abertura/fechamento dos painéis, ausência de grupos duplicados e restauração do contêiner sem atalhos.

Relatórios e hashes das fontes estão em [evidencias](evidencias/). A fixture é fictícia; nenhuma imagem privada, nome, CPF ou conteúdo de processo foi copiado para o repositório.

## Reprodução

Com Playwright, navegadores e os assets locais da revisão anterior disponíveis:

```sh
node scripts/sync-suite-ui.mjs --check
node --test tests/suite-contract.test.mjs
node scripts/qa-process-actions.mjs --conciliation
node scripts/qa-process-actions.mjs
PROJUDI_QA_WIDTHS=1440,390 node scripts/qa-process-actions.mjs --conciliation --late-font
node scripts/qa-interactions.mjs
```

Definir `PROJUDI_PLAYWRIGHT_MODULE`, `PROJUDI_QA_BROWSER`, `PROJUDI_QA_EXECUTABLE` e `PROJUDI_QA_OUTPUT`. `PROJUDI_QA_NATIVE_FONT` e `PROJUDI_QA_SPRITE` permitem indicar os assets locais. Para atualização parcial, usar `PROJUDI_QA_LEGACY_ROOT` com uma cópia das fontes em `fbbeb48`, `PROJUDI_QA_LEGACY_INDEX=0` ou `4`, e `PROJUDI_QA_WIDTHS=1440,390`.

O Safari foi usado para diagnosticar a versão instalada. O wBlock permanece inalterado, conforme a orientação do usuário. As novas fontes foram validadas em perfis Chromium/WebKit descartáveis e precisam ser carregadas no gerenciador para aparecer na sessão instalada. As alterações permanecem locais; não houve push.
