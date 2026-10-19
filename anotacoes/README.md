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

Veja o [plano visual](../docs/padronizacao-visual/plano.md) e o [relatório de validação](../docs/padronizacao-visual/relatorio.md). O `.user.js` reúne o cabeçalho e o código completo; as URLs de atualização e download apontam para esse mesmo arquivo.

## Atalho no processo

Anotações e Tarefas usam um grupo de ações locais, separado do alfinete nativo. Os atalhos seguem a cor normal dos botões; a cor própria e a rotação do alfinete permanecem originais. O espaçamento considera o desenho girado e o carregamento da fonte, sem alterar os controles nativos.

## Limpeza de dados no painel de backup

- **Limpar dados locais** remove somente as notas e suas cores da extensão neste navegador, preservando preferências, configuração, credenciais, outras extensões e o backup remoto.
- **Limpar dados remotos** valida o arquivo configurado e substitui seu conteúdo por um backup vazio da extensão. Preserva o Gist, todos os outros arquivos e os dados locais. O histórico do GitHub pode manter versões anteriores; a limpeza não elimina esse histórico.
- As duas ações exigem confirmação com aviso vermelho e ícone de atenção. **Cancelar** recebe o foco inicial; Tab/Shift+Tab circulam na confirmação e Escape cancela. Os controles ficam bloqueados durante a operação.
- A limpeza cancela o agendamento pendente e suspende o backup automático para os dados atuais, inclusive depois de recarregar. Uma edição posterior dos dados permite retomá-lo; o envio manual continua disponível.
- Falhas de armazenamento ou rede são exibidas no painel. Arquivos incompatíveis ou truncados na API do GitHub não são alterados.
