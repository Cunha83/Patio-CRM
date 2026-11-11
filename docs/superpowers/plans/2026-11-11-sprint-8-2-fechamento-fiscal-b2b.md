# Plano de Implementação: Sprint 8.2 — Fechamento Fiscal B2B (Segregação NF-e/NFS-e, Retenções na Fonte e Exportação Contábil)

> **Branch:** `main`  
> **Status:** Em Execução  
> **Metodologia:** Superpowers + Vibe Coding (TDD Red-Green-Refactor, Ponytail Full, Teto Modular <= 350 linhas, Verification Before Completion)

---

## 1. Visão Geral e Arquitetura

Na operação pesada de frotas, o fechamento financeiro exige segregação tributária estrita entre **Peças** (NF-e Mod 55, ICMS/ST, CFOP `5405`, NCM `8708.80.00`) e **Serviços** (NFS-e Municipal LC 116 item `14.01`).
Grandes frotistas e transportadoras retêm tributos na fonte (`ISS`, `IRRF`, `CSRF`) calculados exclusivamente sobre a base de serviços, pagando à oficina o valor líquido descontado dessas retenções.

Esta Sprint implementa:
1. `services/fiscal/b2bFiscalClosingService.js` (NOVO, <= 350 linhas).
2. `routes/fiscal_b2b_fechamento.routes.js` (NOVO, <= 350 linhas), montado em `routes/index.js`.
3. `js/modules/fiscal_b2b_ui.js` (NOVO, <= 350 linhas).
4. `js/modules/fiscal_b2b_actions.js` (NOVO, <= 350 linhas).
5. Inclusão dos scripts em `index.html`.
6. Preservação estrita de `js/modules/events_patio_os.js` (intocado em 321 linhas).
7. `tests/sprint82_b2b_fiscal_closing_retentions.test.cjs` (NOVO, <= 350 linhas).

---

## 2. Tarefas de Execução

### Task 1: TDD Red — Suíte de Testes da Sprint 8.2
- Criar `tests/sprint82_b2b_fiscal_closing_retentions.test.cjs`.
- Teste 1.1: Configuração de Perfil Tributário e Segregação NF-e (Peças) vs NFS-e (Serviços) de OS e Borderô.
- Teste 1.2: Retenções na Fonte B2B (ISS, IRRF, CSRF sobre Serviços) — Simples Nacional vs Lucro Presumido.
- Teste 1.3: Emissão de Notas, Ajuste Líquido do Borderô e Quitação via Conciliação Bancária (`conciliarExtratoBancarioAutomatico`).
- Teste 1.4: Exportação de Lote Contábil da Competência e CSV.
- Teste 1.5: Endpoints REST e Componentes Visuais de UI.
- Executar teste para confirmar falha (RED).

### Task 2: Backend Service — `services/fiscal/b2bFiscalClosingService.js`
- Implementar `configurarPerfilTributarioOficina`.
- Implementar `gerarEspelhoFiscalOSOuBordero`.
- Implementar `emitirLoteNotasFiscaisB2B` com sincronização do saldo devedor do Borderô e Contas a Receber.
- Implementar `exportarLoteContabilFiscal`.
- Executar testes até ficarem verdes (GREEN).

### Task 3: REST API & Rotas — `routes/fiscal_b2b_fechamento.routes.js`
- `PUT /api/fiscal/perfil-tributario`
- `POST /api/fiscal/espelho-b2b/gerar`
- `POST /api/fiscal/espelho-b2b/:id/emitir-notas`
- `GET /api/fiscal/lote-contabil`
- Montar em `routes/index.js`.

### Task 4: Frontend UI & Event Actions
- `js/modules/fiscal_b2b_ui.js` (painel e modais).
- `js/modules/fiscal_b2b_actions.js` (ações e listeners delegados).
- Registrar em `index.html`.
- Confirmar `events_patio_os.js` intocado em 321 linhas.

### Task 5: Protocolo de Homologação e Quality Gates
- Testes da Sprint 8.2: 100% PASS.
- Gate modular de tamanho de arquivo (`modular_file_size_gate.test.cjs`).
- Auditoria de ações e zero cliques mortos (`ui_actions_and_bindings_audit.test.cjs`).
- Isolamento do banco de dados (`git status --porcelain data/database.json`).
- Manifesto de release SHA-256 e Clean Install (`clean_install_manifest.test.cjs`).
- Suíte completa (`npm test`).
- Commit semântico e Push.
