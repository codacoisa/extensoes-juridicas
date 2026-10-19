# Customizações

Script para reunir ajustes visuais e de navegação no Projudi do TJGO, deixando a interface mais prática para o uso diário.

## O que ele faz

- centraliza customizações visuais em um único script;
- oferece visual moderno opcional para cabeçalho, superfícies, títulos e abas;
- melhora tabelas com linhas alternadas e cabeçalhos destacados, preservando cores funcionais e tabelas controladas por outros scripts;
- moderniza campos e deixa o foco de teclado mais visível, preservando os botões nativos do Projudi;
- mantém as abas do processo legíveis e permite fixá-las durante a rolagem;
- permite fixar cabeçalhos de tabelas extensas sem alterar as cores das movimentações;
- realça a linha sob o cursor para facilitar a leitura horizontal;
- permite ocultar as barras de rolagem do iframe principal;
- integra o destaque configurável de movimentações processuais;
- aplica ajustes de navegação na interface do sistema;
- melhora a usabilidade em tarefas repetitivas do dia a dia;
- atua de forma integrada no ambiente do Projudi;
- reduz a necessidade de mudanças manuais na visualização.

Os perfis **Visual original**, **Leitura confortável** e **Leitura compacta** preparam as opções de tema, tipografia e leitura. Eles preservam largura, navegação, processos e backup, e só são aplicados ao clicar em **Salvar alterações**. **Cancelar** descarta o rascunho.

As opções visuais são independentes e ficam desativadas por padrão. Assim, cada pessoa pode habilitar somente os ajustes que façam sentido para sua rotina.

O painel organiza as configurações nas categorias **Visual e fonte**, **Tela e topo**, **Leitura e tabelas**, **Processo** e **Dados e backup**, exibindo uma categoria por vez. As setas esquerda/direita, Home e End percorrem as categorias pelo teclado.

## Requisitos

Você precisa de um gerenciador de userscripts no navegador, como:

- Tampermonkey
- Violentmonkey
- Greasemonkey
- Userscripts (quoid/userscripts, Safari)

## Atalho

O painel pode ser aberto pela sequência **Ctrl+;** e depois **C** (em até 1,5 segundo). Funciona em Windows, Linux e macOS (use a tecla Control no Mac). Em gerenciadores que suportam menus, o item "Gerenciar Customizações" continua disponível.

## Instalação

[Instalar Customizações](https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/customizacoes/projudi-customizacoes.user.js)

## Onde funciona

O script foi feito para rodar no domínio do Projudi do TJGO.

## Objetivo

A proposta é concentrar, em um só lugar, ajustes que deixem a navegação e a visualização do sistema mais simples, fluídas e funcionais.

## Observação

O script atua na experiência de uso da interface, sem alterar o conteúdo processual.

## Interface comum

Esta extensão usa os componentes e a identidade visual da suíte: fonte nativa, ícones SVG, botões e campos com foco visível, cartões claros e cabeçalhos azul-marinho. Nos gerenciadores, Tab/Shift+Tab ficam dentro do diálogo; Escape fecha primeiro o backup aberto e depois o painel, devolvendo o foco ao controle de abertura. Os atalhos e dados locais permanecem no mesmo formato.

Veja o [plano visual](../docs/padronizacao-visual/plano.md) e o [relatório de validação](../docs/padronizacao-visual/relatorio.md). O `.user.js` reúne o cabeçalho e o código completo; as URLs de atualização e download apontam para esse mesmo arquivo.

## Compatibilidade e manutenção

O tema, a escala de texto, as tabelas e os formulários preservam as superfícies marcadas pelas outras extensões e as tabelas gerenciadas por Intimações. O visual moderno mantém o tamanho do texto nativo quando a opção de escala está desativada. A opção de páginas diretas funciona sem depender do ajuste de largura. Salvar o painel preserva a configuração personalizada de destaque das movimentações.

O CSS de tema tem cache, as tentativas de aplicação param quando o iframe está pronto e os observers ignoram alterações internas das extensões. O [relatório de 14/10/2026](../docs/customizacoes-2026-10-14/README.md) contém evidências e o limite da validação no Safari. O QA específico está em `scripts/qa-customizacoes.mjs`, com dados fictícios e navegadores descartáveis.

## Limpeza de dados

O painel **Backup remoto** inclui **Limpar dados locais** e **Limpar dados remotos**. As duas ações exigem confirmação com aviso vermelho e ícone de atenção. **Cancelar** recebe o foco inicial; Escape cancela, Tab e Shift+Tab permanecem na confirmação e o foco volta ao botão de origem. Os controles ficam bloqueados durante a operação, com resultado ou erro no próprio painel.

Nesta extensão, os dados locais são as próprias preferências: a limpeza redefine as personalizações para o padrão, inclusive as regras de destaque das movimentações. As credenciais, a configuração de backup e o backup remoto são preservados. A limpeza remota verifica a identidade do backup e substitui somente o arquivo configurado por um backup válido sem personalizações (`settings: {}`), preservando o Gist e seus demais arquivos. Arquivos ausentes, truncados, inválidos ou de outra extensão interrompem a operação. O histórico do GitHub pode manter versões anteriores; a extensão não oferece desfazer.

Após a limpeza, o envio automático ao salvar fica suspenso para as mesmas preferências, inclusive após reabrir o painel ou recarregar. Novas alterações permitem novos backups; **Enviar backup** continua disponível como ação explícita. Os dados das outras extensões não são alterados.


## Assinaturas compactas de backup

Os novos marcadores usam `sha256-v1:` seguido de SHA-256 em Base64 URL sem preenchimento: 53 caracteres, independentemente do tamanho dos dados. O cálculo ordena as chaves dos objetos e inclui a identidade da extensão; preserva a ordem das listas, exceto coleções já ordenadas por identidade (notas e guias). Datas de exportação, versão do script e configuração privada de backup não entram na assinatura. Ela detecta mudanças e evita envios repetidos; não autentica o arquivo.

Backups e marcadores anteriores em JSON continuam legíveis, sem mudança de schema. Novos envios e limpezas gravam o formato curto. Metadados de documentos já calculados podem ser compactados na próxima gravação normal; não há conversão em lote, regravação tardia de snapshots nem alteração automática de arquivos remotos ao iniciar. Marcadores de suspensão antigos continuam impedindo a reposição automática dos dados limpos.

O cálculo exige Web Crypto com SHA-256 (acesse o Projudi por HTTPS). Se estiver indisponível ou falhar, a limpeza para antes de alterar dados. O envio usa uma cópia imutável; alterações feitas durante o cálculo ou envio permanecem pendentes para outro backup. Reabra páginas antigas após atualizar todos os scripts.

Em Customizações, o marcador compacto identifica a suspensão após limpeza; o backup remoto mantém somente seu formato de configurações, sem acrescentar um campo de assinatura.
