# Tarefas

Script para criar tarefas locais por processo no Projudi do TJGO, com visão geral na página inicial e painel de gestão para acompanhar pendências com mais praticidade.

## O que ele faz

- permite criar tarefas locais vinculadas a cada processo;
- reúne as tarefas em uma visão geral com resumo, contadores e busca por texto, tag ou processo;
- oferece um painel próprio para gestão das pendências;
- mantém as informações salvas localmente no navegador;
- facilita o controle operacional da rotina sem depender de ferramentas externas.

## Requisitos

Você precisa de um gerenciador de userscripts no navegador, como:

- Tampermonkey
- Violentmonkey
- Greasemonkey
- Userscripts (quoid/userscripts, Safari)

## Atalho

Em qualquer gerenciador compatível, o painel pode ser aberto pela sequência **Ctrl+;** e depois **T** (em até 1,5 segundo). Funciona em Windows, Linux e macOS (use a tecla Control no Mac). Nos gerenciadores que suportam menus (Tampermonkey, Violentmonkey, Greasemonkey), o item "Gerenciar Tarefas" também continua disponível.

## Instalação

[Instalar Tarefas](https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/tarefas/projudi-tarefas-locais.user.js)

## Onde funciona

O script foi feito para rodar no domínio do Projudi do TJGO.

## Objetivo

A proposta é organizar tarefas e pendências de forma mais simples dentro do próprio sistema, com uma visualização prática tanto no processo quanto na página inicial.

## Observação

As tarefas têm função exclusivamente local e organizacional. Elas não alteram o conteúdo processual nem substituem o controle formal das providências do caso.

## Interface comum

Esta extensão usa os componentes e a identidade visual da suíte: fonte nativa, ícones SVG, botões e campos com foco visível, cartões claros e cabeçalhos azul-marinho. Nos gerenciadores, Tab/Shift+Tab ficam dentro do diálogo; Escape fecha primeiro o backup aberto e depois o painel, devolvendo o foco ao controle de abertura. Os atalhos e dados locais permanecem no mesmo formato.

Veja o [plano visual](../docs/padronizacao-visual/plano.md) e o [relatório de validação](../docs/padronizacao-visual/relatorio.md). O `.meta.js` contém somente o cabeçalho, com versão e permissões idênticas às do `.user.js`.

## Painel do processo

A janela de tarefas do processo tem largura de até 380 px e altura ajustada ao conteúdo. O estado vazio ocupa apenas o espaço necessário; listas maiores e telas baixas mantêm rolagem interna. O atalho junto às anotações acompanha a cor e a escala do botão nativo do Projudi.
