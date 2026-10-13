# Correção de Anotações e Tarefas — 13/10/2026

## Diagnóstico no Safari

A sessão autenticada estava aberta em um processo no iframe `userMainFrame`. A inspeção visual e uma cópia do código-fonte do quadro, exportada pelo diálogo nativo do Safari, confirmaram a estrutura `.divBotoesDireita` com o botão `notaProcesso`. O alfinete nativo possui `fa-3x`, rotação de 45° e cor própria `#85c1e9`. A barra usa fluxo em linha dentro de um contêiner flutuado à direita. A cópia privada permanece temporária, fora deste repositório.

O teste anterior usava um SVG de 24 px, sem rotação. Comparava caixas de botões, sem medir o desenho girado, e esperava que os atalhos copiassem a cor especial do alfinete. Na reprodução atual, o código anterior falhou nos dez cenários executados em WebKit: ausência de folga entre desenhos e uso dessa cor especial nos atalhos.

Não foi comprovada alteração da cor do próprio alfinete por Anotações/Tarefas: o azul claro já está no HTML nativo. A correção preserva essa cor e aplica aos atalhos a cor normal do botão nativo, separadamente.

## Correção

- Os dois atalhos passam a um único grupo local, com ordem estável: Anotações e Tarefas. A ordem de instalação/carregamento não muda a disposição.
- O alfinete permanece no mesmo contêiner, com suas classes, estilos, cor, rotação e evento originais. Outros controles nativos também ficam intactos.
- Há 12 px de espaçamento no grupo. A margem junto ao alfinete considera o desenho girado que ultrapassa a caixa do botão, reservando pelo menos 8 px entre os desenhos.
- O espaço é recalculado após o carregamento da fonte e quando as dimensões do ícone mudam. O grupo vazio e seus observadores são removidos.
- Abrir e fechar os painéis restaura os atalhos sem duplicação. Os controles nativos não entram na renderização de SVG da suíte.

A lógica funcional alterada está em Anotações e Tarefas. O helper pertence ao núcleo comum `ui/suite-ui.js`; por isso sua cópia autossuficiente e os metadados foram sincronizados nos cinco scripts. Os outros três não chamam esse novo helper. Versão das fontes: `2026.10.13-10:10`.

## Validação

| Validação | Resultado |
| --- | --- |
| Regressão com código anterior no WebKit | 10 cenários reproduziram o problema |
| Chromium: página/iframe × cinco ordens de carregamento × cinco larguras | 50 cenários aprovados |
| WebKit: mesma matriz | 50 cenários aprovados |
| Chromium: fonte nativa tardia, larguras 1440/390 | 20 cenários aprovados |
| WebKit: fonte nativa tardia, larguras 1440/390 | 20 cenários aprovados |
| QA geral de interações Chromium | 17 verificações aprovadas |
| QA geral de interações WebKit, execução isolada | 17 verificações aprovadas |
| Contratos | 27 aprovados |
| Sintaxe, núcleo/metadados e `git diff --check` | Aprovados |

Os 140 cenários específicos verificam dimensões reais dos desenhos, ausência de sobreposição, estilos/atributos nativos iguais antes/depois, eventos nativos preservados, abertura/fechamento de Anotações e Tarefas e remoção de grupos vazios. As larguras da matriz principal são 1440, 1180, 900, 768 e 390 px. As combinações incluem Anotações sozinha, Tarefas sozinha, ambas nas duas ordens e coexistência dos cinco scripts.

A primeira execução concorrente do QA geral no WebKit falhou na contagem de linhas após aplicar um filtro de Intimações. A reexecução isolada passou nas 17 verificações, sem alterações funcionais em Intimações. Esse QA geral usa esperas temporizadas; a causa da falha inicial não foi determinada. A matriz específica dos atalhos passou integralmente nos dois motores.

Todas as páginas de teste contêm dados fictícios, em perfis descartáveis com requisições interceptadas. A fonte Font Awesome 6.2.0 usada pela fixture reproduz os ícones nativos; os userscripts continuam usando apenas seu sprite SVG isolado.

## Evidências sintéticas

Antes:

![Atalhos anteriores](evidencias/antes.png)

Depois no WebKit:

![Alfinete preservado e atalhos separados](evidencias/webkit-top.png)

Depois no Chromium:

![Alfinete preservado e atalhos separados](evidencias/chromium-top.png)

Relatórios JSON, imagens de iframe e hashes das fontes estão em [evidencias](evidencias/).

## Reproduzir

Com Playwright e navegadores disponíveis, definir `PROJUDI_PLAYWRIGHT_MODULE`, `PROJUDI_QA_BROWSER`, `PROJUDI_QA_EXECUTABLE` e `PROJUDI_QA_OUTPUT`. O sprite da suíte fica em `PROJUDI_QA_SPRITE` e a fonte nativa em `PROJUDI_QA_NATIVE_FONT`.

```sh
curl -fLsS https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@7.3.1/sprites/solid.svg -o /private/tmp/projudi-fa-solid.svg
curl -fLsS https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/webfonts/fa-solid-900.woff2 -o /private/tmp/projudi-native-fa-solid-900.woff2
node scripts/sync-suite-ui.mjs --check
node scripts/sync-metadata.mjs --check
node --test tests/suite-contract.test.mjs
node scripts/qa-process-actions.mjs
PROJUDI_QA_WIDTHS=1440,390 node scripts/qa-process-actions.mjs --late-font
node scripts/qa-interactions.mjs
```

O Safari foi usado para diagnóstico da versão instalada. O wBlock não foi alterado, e a nova versão não foi carregada na sessão pessoal. A aprovação em WebKit automatizado é validação das fontes no motor, sem afirmar instalação no Safari. Nenhum dado real de tarefa/anotação foi criado ou alterado. As alterações permanecem locais; não houve push.
