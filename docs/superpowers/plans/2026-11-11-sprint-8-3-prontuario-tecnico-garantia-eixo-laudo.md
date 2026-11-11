# Plano de Implementação: Sprint 8.3 — Prontuário Técnico 360º por Placa/Eixo, Garantia por Eixo/Lado e Laudo Técnico SHA-256

> **Branch:** `main`  
> **Status:** Em Execução  
> **Metodologia:** Superpowers + Vibe Coding (TDD Red-Green-Refactor, Ponytail Full, Teto Modular <= 350 linhas, Verification Before Completion)

---

## 1. Visão Geral e Arquitetura

Na linha pesada (cavalos mecânicos e carretas 6x2, 6x4, 8x2 e articulados), a rastreabilidade técnica por eixo e por lado é fundamental para diferenciar se um feixe de molas ou balança que apresentou trinca é o mesmo item reparado anteriormente ou uma quebra nova em outro eixo/lado. Além disso, laudos técnicos com assinatura digital (SHA-256) garantem a conformidade jurídica com frotistas.

Esta Sprint implementa:
1. `services/patio/vehicleTechnicalDossierService.js` (NOVO, <= 350 linhas).
2. Extensão enxuta em `services/whatsapp/whatsappAgentSkillsService.js` (<= 20 linhas).
3. `routes/patio_prontuario_laudo.routes.js` (NOVO, <= 350 linhas), montado em `routes/index.js`.
4. `js/modules/patio_prontuario_laudo_ui.js` (NOVO, <= 350 linhas).
5. `js/modules/patio_prontuario_laudo_actions.js` (NOVO, <= 350 linhas).
6. Inclusão dos scripts em `index.html`.
7. Preservação estrita de `js/modules/events_patio_os.js` (intocado em 321 linhas).
8. `tests/sprint83_vehicle_dossier_axle_warranty_report.test.cjs` (NOVO, <= 350 linhas).

---

## 2. Tarefas de Execução

### Task 1: TDD Red — Suíte de Testes da Sprint 8.3
- Criar `tests/sprint83_vehicle_dossier_axle_warranty_report.test.cjs`.
- Teste 1.1: Registro de Intervenção por Eixo/Lado e Avaliação Precisa de Garantia (`cobertura_ativa`, `expirada_por_km`, `expirada_por_tempo`).
- Teste 1.2: Prontuário Técnico 360º Consolidado por Placa (OSs, Intervenções, Qualidade, Retrabalhos, Oportunidades e CPK).
- Teste 1.3: Emissão de Laudo Técnico de Suspensão com Assinatura SHA-256 e Consulta via WhatsApp Agente.
- Teste 1.4: Endpoints REST e Componentes Visuais de UI.
- Executar teste para confirmar falha (RED).

### Task 2: Backend Service — `services/patio/vehicleTechnicalDossierService.js`
- `registrarIntervencaoPorEixoVeiculo`.
- `avaliarCoberturaGarantiaPecaOuServico`.
- `consolidarProntuarioTecnicoPlaca`.
- `emitirLaudoTecnicoSuspensaoPesada` com SHA-256.
- Hook de consulta em `services/whatsapp/whatsappAgentSkillsService.js`.
- Executar testes até ficarem verdes (GREEN).

### Task 3: REST API & Rotas — `routes/patio_prontuario_laudo.routes.js`
- `POST /api/patio/veiculos/:placa/intervencoes-eixo`
- `GET /api/patio/veiculos/:placa/prontuario`
- `POST /api/patio/veiculos/:placa/avaliar-garantia`
- `POST /api/patio/veiculos/:placa/laudo-tecnico`
- Montar em `routes/index.js`.

### Task 4: Frontend UI & Event Actions
- `js/modules/patio_prontuario_laudo_ui.js` (mapa de eixos, KPIs e modais).
- `js/modules/patio_prontuario_laudo_actions.js` (ações e listeners delegados).
- Registrar em `index.html`.
- Confirmar `events_patio_os.js` intocado em 321 linhas.

### Task 5: Protocolo de Homologação e Quality Gates
- Testes da Sprint 8.3: 100% PASS.
- Gate modular de tamanho de arquivo (`modular_file_size_gate.test.cjs`).
- Auditoria de ações e zero cliques mortos (`ui_actions_and_bindings_audit.test.cjs`).
- Isolamento do banco de dados (`git status --porcelain data/database.json`).
- Manifesto de release SHA-256 e Clean Install (`clean_install_manifest.test.cjs`).
- Suíte completa (`npm test`).
- Commit semântico e Push.
