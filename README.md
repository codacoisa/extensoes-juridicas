# Extensões Jurídicas

Coleção de userscripts para tornar a rotina no Projudi do TJGO mais prática. Cada extensão continua independente e mantém seu próprio histórico dentro deste monorepo.

## Extensões ativas

| Pasta | Finalidade |
| --- | --- |
| [`centraldeguias`](centraldeguias/) | Acompanhamento local de guias de pagamento, vencimentos e alertas. |
| [`tarefas`](tarefas/) | Tarefas locais vinculadas aos processos e painel de pendências. |
| [`customizacoes`](customizacoes/) | Ajustes visuais e de navegação para o uso diário do Projudi. |
| [`anotacoes`](anotacoes/) | Anotações locais organizadas dentro da interface do sistema. |
| [`intimacoes`](intimacoes/) | Triagem local de intimações, prazos, filtros e exportações. |

## Instalação

Os scripts foram feitos para gerenciadores de userscripts como Tampermonkey, Violentmonkey, Greasemonkey e Userscripts. Com um deles instalado, use os links abaixo:

| Extensão | Instalar |
| --- | --- |
| Central de Guias | [Instalar Central de Guias](https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/centraldeguias/projudi-central-guias.user.js) |
| Tarefas | [Instalar Tarefas](https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/tarefas/projudi-tarefas-locais.user.js) |
| Customizações | [Instalar Customizações](https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/customizacoes/projudi-customizacoes.user.js) |
| Anotações | [Instalar Anotações](https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/anotacoes/projudi-anotacoes-locais.user.js) |
| Intimações | [Instalar Intimações](https://raw.githubusercontent.com/codacoisa/extensoes-juridicas/refs/heads/main/intimacoes/projudi-intimacao-page.user.js) |

Para detalhes de funcionamento e configuração, consulte o `README.md` da pasta correspondente.

## Interface e armazenamento

As extensões ativas compartilham o mesmo sistema visual: tipografia nativa do sistema, componentes, estados de cor, navegação por teclado e ícones Font Awesome 7.2.0 renderizados em SVG (sem webfonts).

Cada extensão mantém somente dois documentos persistentes no navegador:

- `projudi-suite::<extensao>::data`: dados e preferências funcionais;
- `projudi-suite::<extensao>::gist`: configuração privada do backup remoto.

Token, Gist ID e demais parâmetros de conexão nunca são incluídos em exportações, assinaturas de conteúdo ou arquivos enviados ao Gist. As versões atuais migram automaticamente as chaves legadas e continuam aceitando os formatos anteriores de backup.

As versões dos userscripts seguem o instante da edição no formato `YYYY.MM.DD-HHmm`, usando o fuso `America/Sao_Paulo`. O formato mantém ordenação cronológica direta; uma nova edição não deve reutilizar o mesmo minuto da versão anterior.

## Arquivo histórico

Projetos descontinuados ficam preservados em [`arquivo/`](arquivo/), separados das extensões ativas. Eles não recebem correções, suporte ou atualizações e não são recomendados para instalação.

## Histórico

Este repositório reúne projetos que antes eram mantidos separadamente na organização CodaCoisa. Os históricos completos foram importados e reorganizados por pasta, preservando autores, datas e mensagens dos commits.

Os repositórios de origem foram consolidados e removidos. O desenvolvimento das extensões ativas passa a acontecer neste monorepo; os projetos descontinuados permanecem apenas como registro histórico.
