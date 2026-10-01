# Anotações

Script para adicionar anotações locais no Projudi do TJGO, com organização prática por meio de notas visuais dentro da própria rotina de trabalho.

## O que ele faz

- adiciona anotações locais na interface do sistema;
- permite organizar notas em um painel próprio;
- possibilita importar e exportar anotações;
- mantém os dados salvos localmente no navegador;
- facilita o registro rápido de observações durante o acompanhamento processual.

## Requisitos

Você precisa de um gerenciador de userscripts no navegador, como:

- Tampermonkey
- Violentmonkey
- Greasemonkey
- Userscripts (quoid/userscripts, Safari)

## Atalho

O painel pode ser aberto pela sequência **Ctrl+;** e depois **A** (em até 1,5 segundo). Funciona em Windows, Linux e macOS (use a tecla Control no Mac). Em gerenciadores que suportam menus, o item "Gerenciar Anotações" continua disponível.

## Instalação

[Instalar Anotações](https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/anotacoes/projudi-anotacoes-locais.user.js)

## Onde funciona

O script foi feito para rodar no domínio do Projudi do TJGO.

## Objetivo

A proposta é permitir anotações rápidas e organizadas dentro do próprio sistema, sem depender de ferramentas externas para observações simples do dia a dia.

## Observação

As anotações têm função exclusivamente local e organizacional. Elas não alteram o conteúdo processual nem substituem o controle formal das informações relevantes.

## Interface comum

Esta extensão usa os componentes e a identidade visual da suíte: fonte nativa, ícones SVG, botões e campos com foco visível, cartões claros e cabeçalhos azul-marinho. Nos gerenciadores, Tab/Shift+Tab ficam dentro do diálogo; Escape fecha primeiro o backup aberto e depois o painel, devolvendo o foco ao controle de abertura. Os atalhos e dados locais permanecem no mesmo formato.

Veja o [plano visual](../docs/padronizacao-visual/plano.md) e o [relatório de validação](../docs/padronizacao-visual/relatorio.md). O `.meta.js` contém somente o cabeçalho, com versão e permissões idênticas às do `.user.js`.
