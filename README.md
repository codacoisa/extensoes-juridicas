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

As extensões ativas compartilham o mesmo sistema visual: tipografia nativa do sistema, componentes, estados de cor, navegação por teclado e ícones Font Awesome 7.3.1 renderizados em SVG (sem webfonts).

Cada extensão mantém somente dois documentos persistentes no navegador:

- `projudi-suite::<extensao>::data`: dados e preferências funcionais;
- `projudi-suite::<extensao>::gist`: configuração privada do backup remoto.

Token, Gist ID e demais parâmetros de conexão nunca são incluídos em exportações, assinaturas de conteúdo ou arquivos enviados ao Gist. A importação valida o formato e a identidade de cada extensão antes de restaurar os dados.

As novas versões dos userscripts seguem o instante da edição no formato `YYYY.MM.DD-HH:MM`, usando o fuso `America/Sao_Paulo` e hora/minuto sempre preenchidos com dois dígitos. O formato mantém ordenação cronológica direta; uma nova edição não deve reutilizar o mesmo minuto da versão anterior. Versões históricas anteriores a 2026.08.05 podem manter a grafia legada `HHmm`.

## Arquivo histórico

Projetos descontinuados ficam preservados em [`arquivo/`](arquivo/), separados das extensões ativas. Eles não recebem correções, suporte ou atualizações e não são recomendados para instalação.

## Histórico

Este repositório reúne projetos que antes eram mantidos separadamente na organização CodaCoisa. Os históricos completos foram importados e reorganizados por pasta, preservando autores, datas e mensagens dos commits.

Os repositórios de origem foram consolidados e removidos. O desenvolvimento das extensões ativas passa a acontecer neste monorepo; os projetos descontinuados permanecem apenas como registro histórico.

## Manutenção da interface

O [plano visual e inventário](docs/padronizacao-visual/plano.md) e o [relatório de validação](docs/padronizacao-visual/relatorio.md) registram a cobertura das cinco extensões, as evidências sintéticas e as limitações.

Os arquivos `ui/suite-ui.css` e `ui/suite-ui.js` são a fonte comum de cores, componentes e interação de diálogos. Cada userscript contém uma cópia autossuficiente dentro da sua IIFE; a instalação não depende de build, `@require` ou novos serviços. Após editar o núcleo, execute:

```sh
node scripts/sync-suite-ui.mjs
node scripts/sync-metadata.mjs
node scripts/sync-suite-ui.mjs --check
node scripts/sync-metadata.mjs --check
node --test tests/suite-contract.test.mjs
```

Atualize primeiro `@version` dos userscripts afetados no formato e fuso documentados; o sincronizador de metadados copia os cabeçalhos integrais. As URLs de atualização dos cinco scripts apontam para os respectivos `.meta.js`, derivados dos caminhos de download existentes. Os arquivos preparados localmente só ficam disponíveis remotamente quando o responsável publicar o checkout.

O núcleo usa seletores limitados a `[data-pj-suite-ui]` e uma camada CSS para proteger os componentes contra estilos nativos. Os temas opcionais de Customizações continuam sujeitos às preferências existentes. Os diálogos contêm Tab/Shift+Tab, fecham com Escape (backup primeiro) e devolvem o foco ao controle de abertura.

O QA reproduzível fica em `scripts/qa-browser.mjs` e `scripts/qa-interactions.mjs`, com fixtures em `tests/fixtures`. Requer Playwright e um navegador de teste; use um perfil descartável. Todas as requisições são interceptadas e os dados são fictícios. Consulte o relatório para os comandos e variáveis de ambiente; não instale userscripts no navegador pessoal para executar esses testes.

Os [ajustes dos cinco prints de 08/10/2026](docs/ajustes-prints-2026-10-08/README.md) registram os controles de exibição do resumo, filtros unificados, ações nativas e janela compacta, com evidências sintéticas e o limite da validação no Safari.
