# Intimações

Script para reunir intimações do Projudi do TJGO em uma página única e facilitar a triagem local das pendências.

## O que ele faz

- reúne intimações em uma visualização mais prática;
- destaca prazos próximos diretamente nas colunas de data limite;
- permite filtrar a página por data exata, período ou ausência de prazo;
- permite marcar e organizar itens localmente;
- oferece exportação em CSV e PDF;
- mantém os dados salvos no navegador;
- foi pensado para funcionar com baixo consumo de memória.

## Requisitos

Você precisa de um gerenciador de userscripts no navegador, como:

- Tampermonkey
- Violentmonkey
- Greasemonkey
- Userscripts (quoid/userscripts, Safari)

## Atalho

O gerenciador pode ser aberto pela sequência **Ctrl+;** e depois **I** (em até 1,5 segundo). Funciona em Windows, Linux e macOS (use a tecla Control no Mac). Em gerenciadores que suportam menus, o item "Gerenciar Intimações" continua disponível.

## Instalação

[Instalar Intimações](https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/intimacoes/projudi-intimacao-page.user.js)

## Onde funciona

O script foi feito para rodar no domínio do Projudi do TJGO.

## Objetivo

A proposta é concentrar e organizar a análise das intimações, tornando a triagem mais rápida dentro da rotina de acompanhamento processual.

## Observação

O script funciona como apoio operacional e organizacional. A conferência do conteúdo e das providências cabíveis continua dependendo da análise do usuário.

## Interface comum

Esta extensão usa os componentes e a identidade visual da suíte: fonte nativa, ícones SVG, botões e campos com foco visível, cartões claros e cabeçalhos azul-marinho. Nos gerenciadores, Tab/Shift+Tab ficam dentro do diálogo; Escape fecha primeiro o backup aberto e depois o painel, devolvendo o foco ao controle de abertura. Os atalhos e dados locais permanecem no mesmo formato.

Veja o [plano visual](../docs/padronizacao-visual/plano.md) e o [relatório de validação](../docs/padronizacao-visual/relatorio.md). O `.user.js` reúne o cabeçalho e o código completo; as URLs de atualização e download apontam para esse mesmo arquivo.

## Filtro de prazos na tabela

No painel, escolha **Data exata**, **Período** ou **Sem data limite** e clique em **Aplicar filtro**. São exibidos somente os campos do tipo escolhido. O texto abaixo indica o filtro ativo; **Limpar filtro da tabela** restaura todas as linhas e limpa os campos de data e período. Esses controles atuam na tabela da página atual do Projudi, enquanto busca e status atuam nos itens monitorados do painel. Períodos invertidos não são aplicados.

## Limpar dados no painel de backup

**Limpar dados locais** remove apenas os itens monitorados de Intimações e preserva filtros, preferências e credenciais. **Limpar dados remotos** valida a identidade do arquivo selecionado e substitui seu conteúdo por um backup vazio da extensão; preserva o Gist e os demais arquivos, inclusive quando há apenas um arquivo. O histórico do GitHub pode conservar versões anteriores.

As duas ações exigem confirmação com aviso vermelho e ícone de atenção. Cancelar recebe o foco inicial; Escape cancela e Tab/Shift+Tab circulam no diálogo. A limpeza não pode ser desfeita pela extensão. O backup automático permanece suspenso para os dados limpos até uma mudança nos itens; o envio manual continua disponível. Falhas de validação ou armazenamento são exibidas no painel.
