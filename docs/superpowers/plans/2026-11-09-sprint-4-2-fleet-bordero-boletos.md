# Sprint 4.2 — Faturamento em Lote de Frotas (Borderô) & Gestão de Boletos B2B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o motor de fechamento em lote (Borderô) de Ordens de Serviço para frotistas e transportadoras corporativas, com segregação de mão de obra vs peças, suporte a conjuntos articulados (cavalo + carreta), bloqueio anti-duplicidade de faturamento, desdobramento de duplicatas em contas a receber, emissão padronizada Febraban de boletos híbridos (com Pix Copia e Cola) para os bancos 001, 237, 341, 756 e 748, rotas de API com controle de acesso RBAC e auditoria atômica append-only.

**Architecture:**
- `services/billing/boletoEngine.js`: Motor padronizado Febraban com Módulo 10, Módulo 11, fator de vencimento (com suporte ao ciclo 2025-2050), formatação de código de barras (44 posições), linha digitável (47 posições mascaradas), payload híbrido Pix (EMVCo CRC16) e cálculo de juros/multa por atraso.
- `services/billing/fleetBorderoCalc.js`: Módulo funcional de cálculo analítico: discriminação de itens por veículo/conjunto articulado, totalização segregada (mão de obra vs peças), aplicação de descontos contratuais e retenções (ISSQN, IRRF, INSS), e desdobramento de prazos de faturamento (14/28/42, 30 DDL, parcela única).
- `services/billing/fleetBorderoService.js`: Fachada orquestradora do ciclo de vida: busca de OSs faturáveis por cliente/competência, prévia analítica, fechamento com trava de estado nas OSs (`statusBordero: 'faturado'`), geração de contas a receber com dados de boleto, cancelamento atômico com estorno e formatação de notificação WhatsApp para o financeiro da transportadora.
- `routes/financial_bordero.routes.js`: Sub-roteador financeiro modular montado em `routes/financial.routes.js`, protegido por RBAC (`financial:read`, `financial:manage`, `financial:admin`) e auditoria atômica (`recordSecurityAudit`).

**Tech Stack:** Node.js (CommonJS), Express, SQLite (via `lib/serverContext.js` / `stateRepository.js`), Crypto, Padrão Febraban 240/400 e EMVCo QR Code.

**Spec:** `docs/benchmark_e_gap_analysis_patio_crm_v1.1.2.md` e diretrizes de execução da Sprint 4.2.

## Global Constraints

- **Teto Modular Rigoroso:** Todos os arquivos novos e modificados em `services/`, `routes/`, `lib/` e `js/` devem ter **estritamente <= 350 linhas** (`tests/modular_file_size_gate.test.cjs`).
- **Isolamento de Estado:** Os testes automatizados NUNCA devem tocar ou alterar `data/database.json`. Execução obrigatória com `--require ./scripts/test-preload.cjs`.
- **Integridade Criptográfica:** Atualizar `docs/operacao/manifesto_release.json` via `node scripts/gerar_manifesto_release.cjs` e validar com `tests/clean_install_manifest.test.cjs`.
- **Auditoria de UI:** Nenhum clique morto (`tests/ui_actions_and_bindings_audit.test.cjs`).
- **Suíte Verde:** 100% dos testes da suíte (`npm test`) devem passar sem regressões.

## Review Focus

1. **Anti-duplicidade de OS em Borderôs concorrentes:** Uma OS já vinculada a um borderô ativo não pode ser selecionada nem faturada em outro lote.
2. **Cálculo Febraban do Fator de Vencimento:** Suporte correto à virada de ciclo Febraban ocorrida em 22/02/2025.
3. **Módulo 11 do Código de Barras:** Tratamento rigoroso de restos 0, 10 ou 11 (resultando em DV = 1 conforme norma Febraban).
4. **Conjuntos Articulados (Cavalo + Carreta):** O espelho analítico do borderô deve evidenciar separadamente os serviços executados no cavalo mecânico e no semirreboque/carreta.
5. **Atomicidade no Cancelamento:** O cancelamento de um borderô deve liberar as OSs associadas e cancelar os títulos gerados em contas a receber simultaneamente.

---

### Task 1: Motor de Títulos e Boletos Bancários (`services/billing/boletoEngine.js`)

**Files:**
- Create: `services/billing/boletoEngine.js`
- Test: `tests/boletoEngine.test.cjs`

- [x] **Step 1.1:** Criar teste com falha `tests/boletoEngine.test.cjs` cobrindo cálculo de Módulo 10, Módulo 11 Febraban, fator de vencimento (pré e pós-2025), geração de código de barras de 44 dígitos e linha digitável de 47 dígitos para os 5 bancos (001 Banco do Brasil, 237 Bradesco, 341 Itaú, 756 Sicoob, 748 Sicredi), payload Pix EMVCo e cálculo de encargos por atraso.
- [x] **Step 1.2:** Executar o teste e certificar que falha (RED) devido à ausência do módulo: `node --require ./scripts/test-preload.cjs --test tests/boletoEngine.test.cjs`.
- [x] **Step 1.3:** Implementar `services/billing/boletoEngine.js` (mantendo <= 300 linhas) com todas as funções exportadas: `calcularModulo10`, `calcularModulo11Febraban`, `calcularFatorVencimento`, `formatarValorNominal`, `gerarCampoComposicaoBancaria`, `gerarCodigoBarrasELinhaDigitavel`, `gerarPayloadPixHibrido`, `calcularEncargosAtraso`, `gerarBoletoCompleto`.
- [x] **Step 1.4:** Executar o teste e certificar que passa (GREEN): `node --require ./scripts/test-preload.cjs --test tests/boletoEngine.test.cjs`.
- [x] **Step 1.5:** Validar teto de linhas do módulo: `node --test tests/modular_file_size_gate.test.cjs`.

---

### Task 2: Motor de Cálculo e Faturamento em Lote de Frotas (`services/billing/fleetBorderoCalc.js` e `services/billing/fleetBorderoService.js`)

**Files:**
- Create: `services/billing/fleetBorderoCalc.js`
- Create: `services/billing/fleetBorderoService.js`
- Test: `tests/fleetBorderoService.test.cjs`

- [x] **Step 2.1:** Criar teste com falha `tests/fleetBorderoService.test.cjs` cobrindo:
  - Listagem de OSs faturáveis por cliente e período;
  - Bloqueio anti-duplicidade (OS já faturada é rejeitada);
  - Prévia do borderô com segregação de mão de obra e peças, conjuntos articulados (cavalo + carreta), descontos e retenções;
  - Fechamento de borderô: atualização de `state.os`, criação de duplicatas em `state.contas` com dados de boleto Febraban gerados;
  - Cancelamento de borderô: reversão de OSs e cancelamento de títulos;
  - Espelho analítico de faturamento;
  - Formatação de notificação WhatsApp para financeiro da transportadora.
- [x] **Step 2.2:** Executar o teste e certificar que falha (RED): `node --require ./scripts/test-preload.cjs --test tests/fleetBorderoService.test.cjs`.
- [x] **Step 2.3:** Implementar `services/billing/fleetBorderoCalc.js` (<= 250 linhas) com funções puras de segregação de itens, discriminação de conjuntos articulados, cálculo de retenções, totalizações e desdobramento de parcelas por condição de pagamento.
- [x] **Step 2.4:** Implementar `services/billing/fleetBorderoService.js` (<= 300 linhas) orquestrando o estado do CRM, persistência de `borderos` e `contas`, chamadas ao `boletoEngine` e formatação WhatsApp.
- [x] **Step 2.5:** Executar o teste e certificar que passa (GREEN): `node --require ./scripts/test-preload.cjs --test tests/fleetBorderoService.test.cjs`.
- [x] **Step 2.6:** Validar teto de linhas de ambos os arquivos: `node --test tests/modular_file_size_gate.test.cjs`.

---

### Task 3: Rotas de API e Controle de Acesso RBAC (`routes/financial_bordero.routes.js`)

**Files:**
- Create: `routes/financial_bordero.routes.js`
- Modify: `routes/financial.routes.js:20-28`
- Test: `tests/borderoRoutes.test.cjs`

- [x] **Step 3.1:** Criar teste com falha `tests/borderoRoutes.test.cjs` validando endpoints:
  - `POST /api/financeiro/bordero/previa` (200 com `financial:read`, 403 sem permissão);
  - `POST /api/financeiro/bordero/fechar` (201 com `financial:manage`, 403 sem permissão);
  - `GET /api/financeiro/bordero/:id` (200 com `financial:read`);
  - `GET /api/financeiro/bordero/:id/espelho-pdf-data` (200 com dados estruturados);
  - `POST /api/financeiro/bordero/:id/cancelar` (200 com `financial:admin`, 403 para operador sem admin);
  - `GET /api/financeiro/bordero/faturaveis` (200 lista OSs elegíveis);
  - Gravação de auditoria em `security_audit_log`.
- [x] **Step 3.2:** Executar o teste e certificar que falha (RED): `node --require ./scripts/test-preload.cjs --test tests/borderoRoutes.test.cjs`.
- [x] **Step 3.3:** Implementar `routes/financial_bordero.routes.js` (<= 250 linhas) utilizando `mutateTenantState`, `getOrLoadState`, `requirePermission`, `extractTenantId` e `recordSecurityAudit`.
- [x] **Step 3.4:** Montar o novo sub-roteador em `routes/financial.routes.js`: `router.use(require('./financial_bordero.routes'));`.
- [x] **Step 3.5:** Executar o teste e certificar que passa (GREEN): `node --require ./scripts/test-preload.cjs --test tests/borderoRoutes.test.cjs`.
- [x] **Step 3.6:** Validar teto de linhas das rotas: `node --test tests/modular_file_size_gate.test.cjs`.

---

### Task 4: Quality Gates, Manifesto SHA-256 e Documentação de Contratos

**Files:**
- Create: `docs/SPRINT_4.2_CONTRATOS_E_SCHEMAS.md`
- Update: `docs/operacao/manifesto_release.json` (via script)

- [x] **Step 4.1:** Documentar os contratos de API, schemas de payload e regras Febraban em `docs/SPRINT_4.2_CONTRATOS_E_SCHEMAS.md`.
- [x] **Step 4.2:** Executar regeneração do manifesto de release: `node scripts/gerar_manifesto_release.cjs`.
- [x] **Step 4.3:** Executar validação de manifesto limpo: `node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs`.
- [x] **Step 4.4:** Executar validação de ações de UI e binds: `node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs`.
- [x] **Step 4.5:** Executar smoke test E2E do servidor: `node --require ./scripts/test-preload.cjs --test tests/server_smoke_e2e.test.cjs`.
- [x] **Step 4.6:** Executar o gate modular geral: `node --test tests/modular_file_size_gate.test.cjs`.
- [x] **Step 4.7:** Validar isolamento estrito de banco: `git status --porcelain data/database.json` (deve retornar vazio).
- [x] **Step 4.8:** Executar a suíte completa de testes (`npm test`) e comprovar aprovação de 100% dos testes.

