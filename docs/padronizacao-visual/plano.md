# Identidade visual da suíte Projudi — plano e checkpoint

Data: 01/10/2026. Escopo: todos os cinco userscripts ativos deste checkout.
Instruções: `AGENTS.md`. Não há `.agents/skills` local neste checkout ou no diretório GitHub. Nenhuma skill de documentos, publicação ou imagem é necessária para editar estes userscripts.

## Estado inicial

Checkout limpo, HEAD e hashes em `estado-inicial.json`; 22 contratos existentes passam. Cinco scripts independentes, sem dependência de build na instalação. Núcleo `SUITE_UI_CSS` idêntico, limitado a fonte, SVG, foco e movimento reduzido; estilos de componentes repetidos divergem. Backup já tem um contrato comum. Anotações e Customizações não possuem `.meta.js` e apontam atualização para o código completo. Font Awesome real: 7.3.1 (README dizia 7.2.0). Nenhum dado privado do navegador foi consultado.

| Extensão | Superfícies inventariadas | Metadados iniciais | Cobertura planejada |
| --- | --- | --- | --- |
| Anotações | Atalho do processo, notas flutuantes/editor/cores, gerenciador com busca/lista/JSON, backup | 2026.07.20-2328; meta ausente | Botões, campos, cabeçalho, cartões, seleção por teclado, modal e backup; conservar cores das notas |
| Central de Guias | Cartões do processo/guias, resumo inicial/tabela, avisos, gerenciador/filtros/status/ações, backup | 2026.08.16-17:02; meta existente | Mesmo núcleo, tabelas e status, navegação e modais; conservar sincronização e estados funcionais |
| Customizações | Configurações/categorias/salvar/cancelar, backup, regras de movimentações, visualizador/dock de arquivos, atalho PDF, tema opcional do Projudi | 2026.07.24-0047; meta ausente | Mesmo núcleo nos painéis e ferramentas; preservar opções e tema nativo opt-in e sua reversão |
| Intimações | Ferramentas e filtro de prazos, controles inline da tabela, gerenciador/triagem/ordenação/exportações, backup | 2026.08.07-22:19; meta existente | Mesmo núcleo, modal e filtros acessíveis; manter marcações, datas e cores funcionais nativas |
| Tarefas | Atalhos, painel inicial e do processo/compositor/listas/tags, gerenciador/filtros/status/JSON, backup | 2026.08.07-22:19; meta existente | Mesmo núcleo, compactação apropriada e modais; conservar tarefas, tags, drag e armazenamento |

Qualquer diretório chamado `arquivo`, em qualquer profundidade, fica excluído. Só se registram nomes, tamanhos e hashes para comprovar preservação; nenhum arquivo histórico será editado ou testado.

## Identidade e componentes

- **Fonte:** stack nativa `-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`; base 14 px nos gerenciadores, controles 13 px, títulos 18 px, informações auxiliares 12 px. Sem carregar fontes externas.
- **Cores:** texto `#1d2939`, secundário `#475467`, fundo `#f5f7fb`, superfície `#ffffff`, borda de campos `#7f8b9c`, borda de cartões `#d0d5dd`; azul de ação `#175cd3`, hover `#1849a9`, cabeçalho `#183b61`; sucesso `#067647`, alerta `#93370d`, perigo `#b42318`, foco `#175cd3`. Estados comunicados também por texto/ícone.
- **Botões:** alvo regular mínimo 36 px, compacto 30 px em ferramentas densas, 40 px no fechar principal; raio 8 px, ícone e rótulo com gap 8 px. Primário azul, secundário branco, perigo vermelho suave, ícone com nome acessível. Hover, active, disabled e foco visível coerentes. Não redimensionar lançadores que seguem os ícones nativos do Projudi.
- **Campos:** altura mínima 36 px, bordas legíveis, fonte herdada, rótulos acessíveis; checkbox/radio/cor/range preservam dimensões próprias. Editores de notas mantêm formato e cores.
- **Espaçamento:** escala 4/8/12/16/24 px; superfícies 12 px, painéis 16 px, cabeçalhos 16 px; sombras suaves em modais, sem excesso de gradientes ou efeitos.
- **Painéis:** marca, título e subtítulo à esquerda, fechar à direita; conteúdo em cartões, filtros próximos da lista, rolagem interna. Responsividade a 390/768/1440 px; tabelas largas rolam dentro do painel, sem alargar a página.
- **Ícones:** conservar sprite Font Awesome SVG 7.3.1 com namespace e sem runtime global. A interface deve funcionar mesmo se a CDN falhar.
- **Interações:** Tab/Shift+Tab contidos nos diálogos, Escape fecha o diálogo ativo (backup primeiro), retorno de foco ao lançador, abertura repetida sem duplicar handlers, status anunciados com `role=status`, seleção de notas com Enter/Espaço. Painéis flutuantes não modais conservam drag e tamanho.
- **Isolamento:** cada regra do núcleo depende de `[data-pj-suite-ui]`; nomes de componentes `data-pj-suite-component`; nenhum estilo genérico de body/button/input/table do Projudi. Customizações conserva as alterações nativas explicitamente configuradas pelo usuário.

## Arquitetura de implementação

Manter cada userscript autossuficiente na IIFE. Adicionar fonte canônica local `ui/suite-ui.css` e `ui/suite-ui.js`, incorporada pelo sincronizador `scripts/sync-suite-ui.mjs` nas cinco IIFEs; `--check` detecta divergências. Sem `@require`, novos grants, CDN ou API global. A montagem de componentes independe do carregamento de SVG. Aplicar o mapa somente às superfícies pertencentes à suíte, com observer restrito à raiz para componentes inseridos depois.

Criar os dois `.meta.js` copiando integralmente os cabeçalhos reais dos respectivos `.user.js`; os três existentes seguem a mesma regra. Derivar `@updateURL` do `@downloadURL` já comprovado no repositório, trocando somente o sufixo `.user.js` por `.meta.js`; não pressupor publicação. Preservar namespace, autoria, licença, match, run-at, grants e connect. Atualizar as cinco versões para o instante da edição em `America/Sao_Paulo`, sincronizadas com seus metadados.

## Execução e validação

1. Inventário, baseline, identidade e checkpoint (este documento).
2. Núcleo comum e integração de todas as superfícies; acessibilidade e metadados; documentação de manutenção.
3. Contratos e sintaxe; QA local com dados sintéticos, requisições externas bloqueadas e perfil descartável, sem instalar userscripts no navegador pessoal. Testar estado vazio/preenchido, busca/filtros, foco/Tab/Escape, backups aninhados, reabertura, dimensões, iframe e coexistência. Renderizar evidências antes/depois quando viável, revisar e corrigir.
4. Comparar `arquivo` byte a byte via hashes, conferir diff e registrar a matriz final com comandos, resultados e limitações verificadas.

Nenhum protocolo, envio, navegação autenticada real, push, publicação, deploy ou merge faz parte desta implementação. Validação na sessão real do Projudi fica explicitamente limitada pela restrição de não instalar/ativar extensões no navegador pessoal.
