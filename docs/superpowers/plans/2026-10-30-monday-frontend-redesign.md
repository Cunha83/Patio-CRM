# Plano de Implementação: Frontend Pátio-CRM estilo Monday.com Work OS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Reformular o frontend do Pátio-CRM entregando a experiência visual e ergonômica do Monday.com CRM (tabelas com grupos expansíveis, células de status sólidas, chips de relacionamento, rodapés de cálculo e modal de automações operacionais).

**Architecture:** Vanilla JS modular sobre a SPA existente, criando o módulo reutilizável `monday_board.js` e `automations_modal.js`, estilizados via classes e variáveis modernas em `style.css`, integrando-se diretamente ao estado global `S` e aos controllers existentes.

**Tech Stack:** JavaScript (ES6+), CSS3 (CSS Variables, Grid, Flexbox), HTML5, Node.js Test Runner.

**Spec:** [`monday_frontend_redesign_spec.md`](../../../../brain/fdf51ed6-341f-498d-abae-be9ccce5a465/monday_frontend_redesign_spec.md)

---

## Global Constraints
- Preservar o estado global `S`, as chamadas de API existentes e todos os identificadores de dados.
- Não introduzir dependências de build pesadas; manter compatibilidade com a SPA nativa em `index.html`.
- Manter todos os 98 testes existentes em `tests/*.test.cjs` 100% verdes.
- Garantir responsividade para telas menores e tablets de oficina.

---

## Tarefas de Execução

### Task 1: Design Tokens e Folha de Estilos Monday (`style.css`)
**Files:**
- Modify: `style.css`

- [x] Definir tokens de cores do Monday.com no `:root` (`--monday-canvas: #f5f6f8`, `--monday-green: #00c875`, `--monday-blue: #0086c0`, `--monday-amber: #fdab3d`, `--monday-purple: #a25ddc`, `--monday-red: #e2445c`, `--monday-cyan: #03a9f4`).
- [x] Criar classes de layout para a tabela do Monday (`.monday-board`, `.monday-group`, `.monday-group-header`, `.monday-table`, `.monday-row`, `.monday-cell`, `.monday-footer-row`).
- [x] Criar componentes de células visuais:
  - Célula de status sólido (`.monday-status-pill`).
  - Chips de relacionamento com ícones (`.monday-chip`).
  - Barra de progresso interna (`.monday-progress-bar`).
  - Estrelas de rating (`.monday-star-rating`).
  - Flag de telefone e link para WhatsApp (`.monday-phone-cell`).
- [x] Estilizar a barra de rodapé com somas, médias e barra segmentada de distribuição.
- [x] Estilizar o modal do Centro de Automações (`.monday-automations-modal`, categorias laterais, cards de receita).

---

### Task 2: Motor Reutilizável de Tabelas Monday (`js/modules/monday_board.js`)
**Files:**
- Create: `js/modules/monday_board.js`
- Test: `tests/monday_board.test.cjs`

- [x] Implementar a função `renderMondayBoard({ title, views, activeView, groups, columns, onAction })`.
- [x] Implementar suporte a grupos expansíveis com memória de colapso no `S.ui.mondayGroupsCollapsed`.
- [x] Implementar renderizador de células com tipagem flexível (`text`, `status`, `chip`, `progress`, `stars`, `phone`, `actions`, `money`).
- [x] Implementar rodapé de cálculos automáticos (soma de valores monetários, média percentual e contagem de itens).
- [x] Criar testes unitários para o motor de cálculo e formatação do `monday_board.js`.
- [x] Executar os testes e garantir passagem.

---

### Task 3: Modal do Centro de Automações Monday (`js/modules/automations_modal.js`)
**Files:**
- Create: `js/modules/automations_modal.js`

- [x] Criar a estrutura do modal com categorias:
  - *Automações de Pátio*
  * *Alertas WhatsApp*
  * *Controle de Gargalos*
  * *Almoxarifado & Desbloqueio*
- [x] Criar catálogo de receitas operacionais inspiradas no Pátio-CRM:
  - "Quando uma OS for marcada como 'Pronto', enviar WhatsApp com link da vistoria ao cliente".
  - "Quando o veículo estiver em box há mais de 4h sem avanço, sinalizar gargalo operacional".
  - "Quando uma peça faltar no estoque, notificar almoxarife e pausar cronômetro do mecânico".
  - "Quando o checklist de freios/suspensão for aprovado, liberar trava de portaria".
- [x] Conectar os botões "Ativar" ao feedback interativo (toast / torrada do sistema).

---

### Task 4: Reformulação da Tela de Cadastros / Contatos (`js/cadastros.js`)
**Files:**
- Modify: `js/cadastros.js`

- [x] Integrar `renderMondayBoard` na função `viewContatosUnificados`.
- [x] Organizar os contatos nos grupos **Contatos Ativos** e **Contatos Inativos/Pendentes** (conforme Imagem 3).
- [x] Renderizar colunas do Monday:
  - Contato com ícone de avatar/perfil.
  - Tipo de Contato em badge colorido (Cliente em azul, Parceiro/Frotista em laranja, Fornecedor em roxo).
  - Chip de Vínculo com Empresa/Frota.
  - Quantidade de Veículos / OS vinculadas.
  - Prioridade com tag viva (Alta em vermelho, Média em amarelo, Baixa em verde).
  - Telefone com bandeira 🇧🇷 e link direto de WhatsApp.
  - Rating de estrelas (reputação/volume do cliente).
- [x] Adicionar barra de resumo inferior com distribuição de tipos e somatório de contatos.

---

### Task 5: Reformulação da Tela do Pátio & OS (`js/modules/patio_render.js` & `js/patio.js`)
**Files:**
- Modify: `js/modules/patio_render.js`
- Modify: `js/patio.js`

- [x] Adicionar alternador de visualização na barra do Pátio: `[ 📋 Tabela Monday ]` e `[ 🏗️ Boxes Físicos ]`.
- [x] Na visão de Tabela Monday, organizar as OS em grupos por etapa:
  - **Entrada / Triagem** (Azul)
  - **Em Execução nos Boxes** (Verde)
  - **Aguardando Peças / Gargalo** (Laranja)
  - **Prontos para Retirada** (Verde Escuro)
- [x] Renderizar colunas ricas:
  - OS / Placa com badge de modelo de caminhão.
  - Box alocado (chip de guindaste/box).
  - Mecânico responsável (chip de mecânico).
  - Checklist técnico (Vistoria OK / Pendente).
  - Valor total da OS (R$).
  - Botão de ação rápida WhatsApp (notificar cliente).
- [x] Rodapé com valor total das OS por etapa e contagem agregada.

---

### Task 6: Inclusão de Scripts, Barra de Navegação & Topbar (`index.html`, `js/app.js`, `js/modules/navigation.js`)
**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `js/modules/navigation.js`

- [x] Registrar os novos módulos `js/modules/monday_board.js` e `js/modules/automations_modal.js` em `index.html`.
- [x] Adicionar botão de acesso rápido ao "Centro de Automações" na barra de navegação/topo.
- [x] Refinar o layout da barra superior (`renderTopo`) com estética moderna, busca global e visual do Monday.

---

### Task 7: Verificação, Validação & Testes Automatizados
**Files:**
- Execution: `npm test`
- Verification: Scripts de integridade e carregamento

- [x] Executar a suíte de testes de regressão (`npm test`).
- [x] Validar compatibilidade dos módulos sem erros de sintaxe ou referências ausentes.
- [x] Realizar teste fim a fim de alternância de grupos, disparo de modais e ações de linha.

