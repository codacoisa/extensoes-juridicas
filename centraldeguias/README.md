# Central de Guias

Script para acompanhar guias de pagamento no Projudi do TJGO em uma central local, com visualização prática de vencimentos e alertas operacionais.

## O que ele faz

- sincroniza localmente as guias de pagamento dos processos;
- ao abrir um processo, tenta capturar automaticamente as guias em segundo plano;
- registra um resumo do polo ativo e do polo passivo para identificar o processo;
- organiza as guias em um painel próprio;
- destaca vencimentos próximos e guias vencidas;
- mostra alertas para situações que exigem atenção;
- mantém os dados salvos localmente no navegador;
- permite backup e restauração das informações.

Ao abrir um processo autenticado, a extensão consulta em segundo plano a mesma
página de guias usada pelo Projudi (`GuiaEmissao?PaginaAtual=6`). A leitura é
local, depende da sessão já aberta no Projudi e mantém o botão “Sincronizar”
como alternativa quando a captura automática não estiver disponível.

Para manter o painel compacto, cada polo exibe somente a primeira parte
identificada. Quando houver mais de uma, o resumo aparece como “primeiro nome e
outro(s)”.

## Requisitos

Você precisa de um gerenciador de userscripts no navegador, como:

- Tampermonkey
- Violentmonkey
- Greasemonkey
- Userscripts (quoid/userscripts, Safari)

## Atalho

A central pode ser aberta pela sequência **Ctrl+;** e depois **G** (em até 1,5 segundo). Funciona em Windows, Linux e macOS (use a tecla Control no Mac). Em gerenciadores que suportam menus, o item de menu também continua disponível.

## Instalação

[Instalar a Central de Guias](https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/centraldeguias/projudi-central-guias.user.js)

## Onde funciona

O script foi feito para rodar no domínio do Projudi do TJGO.

## Objetivo

A proposta é facilitar o acompanhamento das guias de pagamento, com uma visão mais clara de status, vencimentos e pendências dentro da rotina processual.

## Observação

O script funciona como apoio operacional e organizacional. A conferência das guias, dos valores e das providências cabíveis continua dependendo da análise do usuário.

## Interface comum

Esta extensão usa os componentes e a identidade visual da suíte: fonte nativa, ícones SVG, botões e campos com foco visível, cartões claros e cabeçalhos azul-marinho. Nos gerenciadores, Tab/Shift+Tab ficam dentro do diálogo; Escape fecha primeiro o backup aberto e depois o painel, devolvendo o foco ao controle de abertura. Os atalhos e dados locais permanecem no mesmo formato.

Veja o [plano visual](../docs/padronizacao-visual/plano.md) e o [relatório de validação](../docs/padronizacao-visual/relatorio.md). O `.meta.js` contém somente o cabeçalho, com versão e permissões idênticas às do `.user.js`.

## Resumo na página inicial

Abra **Central de Guias** pelo menu do Projudi ou pelo atalho `Ctrl+;` seguido de `G`. Em **Filtros e navegação**, desmarque **Mostrar resumo na página inicial** para ocultar o cartão inicial e os alertas emitidos por ele. Marque novamente para reativar. A preferência fica neste navegador; os cartões do processo e da consulta de guias continuam disponíveis.
