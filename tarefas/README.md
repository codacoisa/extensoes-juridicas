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

Veja o [plano visual](../docs/padronizacao-visual/plano.md) e o [relatório de validação](../docs/padronizacao-visual/relatorio.md). O `.user.js` reúne o cabeçalho e o código completo; as URLs de atualização e download apontam para esse mesmo arquivo.

## Painel do processo

A janela de tarefas do processo tem largura de até 380 px e altura ajustada ao conteúdo. O estado vazio ocupa apenas o espaço necessário; listas maiores e telas baixas mantêm rolagem interna. Os atalhos de Anotações e Tarefas ficam em um grupo local, com cor normal dos botões e espaço reservado para o alfinete girado. A cor própria, os estilos e o evento do alfinete nativo são preservados.

## Limpeza de dados no painel de backup

- **Limpar dados locais** remove somente as tarefas globais, tarefas dos processos e o índice de processos da extensão neste navegador, preservando preferências, configuração, credenciais, outras extensões e o backup remoto.
- **Limpar dados remotos** valida o arquivo configurado e substitui seu conteúdo por um backup vazio da extensão. Preserva o Gist, todos os outros arquivos e os dados locais. O histórico do GitHub pode manter versões anteriores; a limpeza não elimina esse histórico.
- As duas ações exigem confirmação com aviso vermelho e ícone de atenção. **Cancelar** recebe o foco inicial; Tab/Shift+Tab circulam na confirmação e Escape cancela. Os controles ficam bloqueados durante a operação.
- A limpeza cancela o agendamento pendente e suspende o backup automático para os dados atuais, inclusive depois de recarregar. Uma edição posterior dos dados permite retomá-lo; o envio manual continua disponível.
- Falhas de armazenamento ou rede são exibidas no painel. Arquivos incompatíveis ou truncados na API do GitHub não são alterados.


## Assinaturas compactas de backup

Os novos marcadores usam `sha256-v1:` seguido de SHA-256 em Base64 URL sem preenchimento: 53 caracteres, independentemente do tamanho dos dados. O cálculo ordena as chaves dos objetos e inclui a identidade da extensão; preserva a ordem das listas, exceto coleções já ordenadas por identidade (notas e guias). Datas de exportação, versão do script e configuração privada de backup não entram na assinatura. Ela detecta mudanças e evita envios repetidos; não autentica o arquivo.

Backups e marcadores anteriores em JSON continuam legíveis, sem mudança de schema. Novos envios e limpezas gravam o formato curto. Metadados de documentos já calculados podem ser compactados na próxima gravação normal; não há conversão em lote, regravação tardia de snapshots nem alteração automática de arquivos remotos ao iniciar. Marcadores de suspensão antigos continuam impedindo a reposição automática dos dados limpos.

O cálculo exige Web Crypto com SHA-256 (acesse o Projudi por HTTPS). Se estiver indisponível ou falhar, a limpeza para antes de alterar dados. O envio usa uma cópia imutável; alterações feitas durante o cálculo ou envio permanecem pendentes para outro backup. Reabra páginas antigas após atualizar todos os scripts.
