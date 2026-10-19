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

Veja o [plano visual](../docs/padronizacao-visual/plano.md) e o [relatório de validação](../docs/padronizacao-visual/relatorio.md). O `.user.js` reúne o cabeçalho e o código completo; as URLs de atualização e download apontam para esse mesmo arquivo.

## Resumo na página inicial

Abra **Central de Guias** pelo menu do Projudi ou pelo atalho `Ctrl+;` seguido de `G`. Em **Filtros e navegação**, desmarque **Mostrar resumo na página inicial** para ocultar o cartão inicial e os alertas emitidos por ele. Marque novamente para reativar. A preferência fica neste navegador; os cartões do processo e da consulta de guias continuam disponíveis.

## Limpeza de dados

O painel **Backup remoto** inclui **Limpar dados locais** e **Limpar dados remotos**. As duas ações exigem confirmação com aviso vermelho e ícone de atenção. **Cancelar** recebe o foco inicial; Escape cancela, Tab e Shift+Tab permanecem na confirmação e o foco volta ao botão de origem. Os controles ficam bloqueados durante a operação, com resultado ou erro no próprio painel.

A limpeza local redefine apenas processos, guias e marcações desta extensão, preservando a preferência do resumo inicial, as credenciais e a configuração de backup. A limpeza remota verifica a identidade do backup e substitui somente o arquivo configurado por um backup válido vazio, preservando o Gist e seus demais arquivos. Arquivos ausentes, truncados, inválidos ou de outra extensão interrompem a operação. O histórico do GitHub pode manter versões anteriores; a extensão não oferece desfazer.

A limpeza cancela o envio automático pendente e grava uma proteção local que suspende novos envios automáticos para a mesma assinatura dos dados, inclusive após reabrir o painel ou recarregar. Novas alterações nos dados permitem novos backups; **Enviar backup** continua disponível como ação explícita. Os dados das outras extensões não são alterados.

## Captura automática ao abrir processo

A captura distingue execução em andamento, repetição pendente e leitura concluída. Se a tabela de guias aparecer depois do carregamento do iframe, a extensão aguarda dentro do limite de 20 segundos. Uma tabela válida sem guias é aceita normalmente.

Erro ou timeout permite uma única nova leitura após um segundo, sem repetição contínua. A navegação ou o cancelamento interrompe as tentativas pendentes; eventos de um iframe antigo são ignorados e a identidade do processo é conferida antes da gravação local. Se as duas tentativas falharem, o cartão orienta abrir as guias para conferir. Isso é independente do backup remoto por Gist.

## Armazenamento e atualização do painel

A cópia existente em `localStorage` é a referência compartilhada entre top e iframe, inclusive depois de uma limpeza intencional. Leituras não gravam dados nem mesclam registros com caches GM antigos. GM é consultado somente quando a chave local não existe e continua recebendo um espelho das gravações. Credenciais e preferências de backup permanecem em chave separada.

As gravações usam Web Locks da origem e verificam se o snapshot ainda é atual; uma edição concorrente antiga é recusada para nova tentativa, sem substituir dados mais recentes. Sem suporte a Web Locks, a extensão permite leitura e recusa gravações. Limpeza e restauração explícitas criam um novo marcador que cancela capturas anteriores. Metadados de revisão ficam apenas no documento local; o formato do backup permanece inalterado.

O painel aberto se atualiza ao receber eventos da chave de dados ou aviso da própria extensão, sem apagar busca/filtros nem disparar captura ou backup ao renderizar. Depois de instalar a atualização, reabra as páginas já abertas para que todos os contextos executem o mesmo protocolo. A correção não recupera automaticamente registros que já tenham sido sobrescritos; uma recuperação deve usar um backup escolhido pelo usuário.
