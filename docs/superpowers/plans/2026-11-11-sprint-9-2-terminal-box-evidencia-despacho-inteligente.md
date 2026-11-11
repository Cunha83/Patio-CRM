# Plano de Implementação: Sprint 9.2 — Terminal Operacional de Box, Evidência Técnica de Peça Condenada & Despacho Inteligente de Mecânicos

> **Branch:** `main`  
> **Status:** Concluído & Homologado (908 testes passando, 0 falhas)  
> **Metodologia:** Superpowers + Vibe Coding (TDD Red-Green-Refactor, Ponytail Full, Teto Modular <= 350 linhas, Verification Before Completion)

---

## 1. Visão Geral e Arquitetura

A **Sprint 9.2** implementa a operação de chão de fábrica para mecânicos e pátio pesado, integrando terminal operacional de box, evidência de desmontagem e recomendação algorítmica:

1. **Terminal Operacional de Chão de Oficina por Box:**
   - Visualização da OS alocada, serviços pendentes/em execução, status do box e semáforo de gargalo.
   - Apontamento de tempo em tempo real com validação de conflito de mecânico.

2. **Registro de Evidência Técnica de Peça Condenada na Desmontagem:**
   - Mecânico registra fotos, descrição, código e motivo técnico da condenação durante a desmontagem pesada.
   - Inserção automática da peça na OS com flag `origemCondenacaoBox: true` e `statusAprovacao: 'pendente_frotista'`.
   - Acionamento imediato do semáforo de parada: bloqueio do box com gargalo `aguardando_aprovacao_frotista`.
   - Geração automática de link tokenizado externo para o frotista com trilha jurídica SHA-256.
   - Ciclo de fechamento: quando o frotista aprova no portal externo, o box é destravado automaticamente para `status: 'ocupado'`.

3. **Motor de Despacho Inteligente por Especialidade:**
   - Matriz de especialidades técnicas por mecânico (ex: `suspensao_pesada`, `freios_ar`, `alinhamento_laser`, `motor_diesel`).
   - Algoritmo de score ponderado (0 a 100+):
     $$\text{scoreDespacho} = (\text{disponivelImediato} ? 50 : 0) + (\text{nivelEspecialidade} \times 20) + \min(30, \text{round}(\text{eficienciaHistorica} \times 0.2)) - (\text{retrabalhosCount} \times 15)$$
   - Alocação e despacho de serviços acionando o cronômetro de apontamento e vinculando o box.

4. **REST API & Interface SPA:**
   - 5 novos endpoints com governança RBAC.
   - Componentes visuais para terminal de box, modal de condenação e modal de especialidades.
   - Listener delegado no `document` via `[data-act]`, mantendo `events_patio_os.js` estritamente intocado.

---

## 2. Guardrails de Tamanho e Arquivos Envolvidos

- `services/patio/mechanicSmartDispatchBoxService.js` (NOVO, <= 350 linhas).
- `routes/patio_terminal_box_despacho.routes.js` (NOVO, <= 350 linhas), montado em `routes/index.js`.
- `js/modules/patio_terminal_box_ui.js` (NOVO, <= 350 linhas).
- `js/modules/patio_terminal_box_actions.js` (NOVO, <= 350 linhas).
- `index.html` (MODIFICADO, inclusão dos 2 scripts na seção de pátio).
- `tests/sprint92_box_terminal_evidence_smart_dispatch.test.cjs` (NOVO, <= 350 linhas).

**Arquivos Estritamente Intocados:**
- `services/executive/controlTowerService.js` (347 linhas)
- `routes/crm_manutencao_oportunidades.routes.js` (343 linhas)
- `services/billing/fleetBorderoService.js` (341 linhas)
- `js/modules/orcamento_parcial_ui.js` (339 linhas)
- `js/modules/crm_conversao_oportunidades_ui.js` (336 linhas)
- `js/modules/events_patio_os.js` (333 linhas)
- `services/fiscal/b2bFiscalClosingService.js` (332 linhas)
- `services/patio/mechanicTimeTrackingService.js` (317 linhas)
- `services/quotation/externalFleetApprovalService.js` (313 linhas)
- `services/whatsapp/whatsappAgentSkillsService.js` (311 linhas)

---

## 3. Tarefas de Implementação

### Task 1: TDD Red — Suíte de Testes da Sprint 9.2
- Criar `tests/sprint92_box_terminal_evidence_smart_dispatch.test.cjs`.
- Sub-teste 1.1: Matriz de especialidades e recomendação algorítmica (`recomendarMecanicoIdealParaServico` & `despacharServicoBoxInteligente`).
- Sub-teste 1.2: Registro de evidência técnica de peça condenada com acionamento de gargalo e emissão de token B2B (`registrarEvidenciaPecaCondenadaBox`).
- Sub-teste 1.3: Ciclo ponta a ponta: Condenação no box -> Portal B2B -> Aprovação externa -> Destravamento do Box (`status: 'ocupado'`).
- Sub-teste 1.4: Endpoints REST e componentes visuais de UI.
- Executar teste e confirmar falha inicial (RED).

### Task 2: Backend Service — `services/patio/mechanicSmartDispatchBoxService.js`
- Implementar `configurarPerfilEspecialidadesMecanico(state, payload)`.
- Implementar `recomendarMecanicoIdealParaServico(state, options)`.
- Implementar `despacharServicoBoxInteligente(state, payload)`.
- Implementar `registrarEvidenciaPecaCondenadaBox(state, payload)`.
- Implementar `listarFilaTerminalOperacionalBox(state, options)`.
- Executar suíte da Sprint 9.2 até atingir GREEN.

### Task 3: REST API & Rotas — `routes/patio_terminal_box_despacho.routes.js`
- `PUT  /api/patio/mecanicos/:mecanicoId/especialidades`
- `GET  /api/patio/despacho-inteligente/recomendar`
- `POST /api/patio/despacho-inteligente/alocar`
- `POST /api/patio/terminal-box/evidencia-peca-condenada`
- `GET  /api/patio/terminal-box/painel`
- Montar em `routes/index.js`.

### Task 4: Frontend UI & Event Actions
- Criar `js/modules/patio_terminal_box_ui.js`:
  - `renderPainelTerminalBoxEDespachoHtml(dados)`
  - `modalRegistrarEvidenciaPecaCondenadaHtml(dados)`
  - `modalConfigurarEspecialidadeMecanicoHtml(dados)`
- Criar `js/modules/patio_terminal_box_actions.js`:
  - `abrirModalEspecialidadeMecanico`, `salvarEspecialidadeMecanicoAction`, `executarDespachoInteligenteAction`, `abrirModalEvidenciaPecaCondenada`, `confirmarEvidenciaPecaCondenadaAction`.
  - Listener delegado em `document` via `[data-act]`.
- Registrar scripts em `index.html`.
- Confirmar `events_patio_os.js` intocado em 333 linhas.

### Task 5: Protocolo de Homologação e Quality Gates
- Suíte da Sprint 9.2 (100% PASS).
- Gate modular de tamanho de arquivo (`modular_file_size_gate.test.cjs`).
- Auditoria de ações e zero cliques mortos (`ui_actions_and_bindings_audit.test.cjs`).
- Isolamento do banco de dados (`git status --porcelain data/database.json`).
- Manifesto de release SHA-256 e Clean Install (`clean_install_manifest.test.cjs`).
- Suíte completa (`npm test` >= 910 testes, 0 falhas).
- Atualizar `progress.md`, commit semântico e Push.
