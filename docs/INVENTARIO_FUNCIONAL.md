# Inventário Funcional e Arquitetural — Pátio CRM

Data de levantamento: 2026-09-16  
Ambiente de Referência: Node.js v24.19.0 · npm 11.17.0 · Windows NT 10.0.26200.0 · Express 5.2.1 · SQLite 3 WAL

---

## 1. Visão Geral da Arquitetura e Fluxo de Dados

O Pátio CRM opera segundo a cadeia:
$$\text{Interface (SPA)} \longrightarrow \text{Endpoints REST / Webhooks} \longrightarrow \text{Auth Context / RBAC} \longrightarrow \text{Services / Engines} \longrightarrow \text{SQLite WAL (KV + Relacional)} \longrightarrow \text{Outbox / Integradores}$$

### 1.1 Camadas do Sistema
1. **Frontend:** Single Page Application modular sem bundlers (`js/app.js`, `js/patio.js`, `js/cadastros.js`, `js/estoque.js`, `js/financeiro.js`, `js/relatorios.js`, `js/dashboard_operacional.js`, `js/fiscal.js`, `js/voz.js`, `js/support-widget.js`, `js/whatsapp.js`). Escapamento universal de strings via `esc()` em `js/state.js` e sanitização de esquemas de imagem (`data:image/`, `https?://`).
2. **Camada de Borda e Roteamento:** `server.js` (Express 5.2.1, 7.831 linhas), Helmet, Rate Limiters segmentados (global 5000/15min, uploads 60/15min, aprovação pública 300/15min, fiscal 60/min), Bloqueio de arquivos de sistema (`.env`, `.db`, `node_modules`).
3. **Identidade e Autorização:** `lib/auth/identity.js`, `lib/auth/context.js`, `lib/auth/userRepository.js` (scrypt, 9 papéis de RBAC, bloqueio por tentativas 5/15min, isolamento estrito multi-tenant via `x-tenant-id` e sessões de suporte temporárias auditadas).
4. **Motores de Regra de Negócio:**
   - Financeiro e Caixa: `services/financialEngine.js`, `services/costingService.js`, `services/pricingEngine.js`.
   - Operação de Chão de Fábrica: `services/preOSEngine.js`, `services/technicalIntakeEngine.js`, `services/inspectionService.js`, `services/quotationService.js`, `services/laborTrackingService.js`, `services/productivityService.js`.
   - Suprimentos e Estoque: `services/inventoryService.js`, `services/procurementService.js`, `services/supplierService.js`.
   - Frotas e Pós-Venda: `services/customerTimelineService.js`, `services/maintenancePlanService.js`, `services/afterSalesService.js`, `services/relationshipService.js`.
   - Inteligência & Automação: `services/voiceActionEngine.js`, `services/operationalIntelligenceEngine.js`, `services/operationalSummaryService.js`.
   - Cobrança SaaS: `services/billing/billingService.js`, `services/billing/paymentProviderAdapter.js`, `services/billing/platformAdminService.js`.
   - Módulo Fiscal: `services/fiscal/` (Focus NFe Adapter, cálculo decimal BigInt, isolamento estrito em homologação).
   - Continuidade & Privacidade: `services/backupService.js`, `services/lgpdService.js`, `services/incidentResponseService.js`.
5. **Persistência:** SQLite 3 nativo em modo WAL (`db.js`), transações via `AsyncLocalStorage` (`BEGIN IMMEDIATE`), savepoints aninhados sequenciais, controle otimista de versão (`versao`), persistência KV transacional (`lib/repository/stateRepository.js`).

---

## 2. Inventário Módulo a Módulo e Situação de Validação

| Módulo | Finalidade & Usuários | Telas & Rotas Principais | Permissões | Persistência & Integrações | Testes Automatizados | Situação de Validação |
|---|---|---|---|---|---|---|
| **Cadastros (Clientes & Frotas)** | Gestão de frotistas e veículos pesados. | `js/cadastros.js` · `/api/estado` (clientes, veiculos, fleets) | `crm:read`, `crm:write` | SQLite KV `tenant:*:state` | `crm_fleet_and_maintenance.test.cjs` | **Verificado em Suíte Automatizada** |
| **Pátio, Boxes & Agendamento** | Controle de boxes e agendamento. | `js/patio.js` · `/api/estado` (boxes, appointments) | `operation:read`, `operation:manage` | SQLite KV | `workshop_day.test.cjs` | **Verificado em Suíte Automatizada** |
| **Triagem Técnica & Pré-OS** | Coleta de sintomas via voz/texto e abertura assistida de Pré-OS. | `js/voz.js` · `/api/intake/*`, `/api/pre-os/*` | `os:read`, `os:write` | SQLite KV · Gemini AI | `technical_intake.test.cjs`, `pre_os.test.cjs` | **Verificado em Suíte Automatizada** |
| **Inspeção & Diagnóstico** | Checklist veicular e fotos de avarias. | `js/patio.js` · `/api/inspecoes/*` | `inspection:read`, `inspection:write` | SQLite KV + `/uploads/` | `inspection_and_quotation.test.cjs` | **Verificado em Suíte Automatizada** |
| **Orçamento & Aprovação Digital** | Orçamento com link público criptográfico. | `js/patio.js` · `/aprovacao/:token` | Pública por Token / `quotation:write` | SQLite KV · HMAC-SHA256 tokens | `inspection_and_quotation.test.cjs` | **Verificado em Suíte Automatizada** |
| **OS & Execução (Oficina)** | Ordem de serviço progressiva e peças. | `js/patio.js` · `/api/estado` (os) | `os:read`, `os:write`, `os:delete` | SQLite KV | `progressive_os.test.cjs` | **Verificado em Suíte Automatizada** |
| **Mão de Obra & Mecânicos** | Apontamento de tempos e anti-sobreposição. | `js/patio.js` · `/api/apontamentos/*` | `labor:read`, `labor:write` | SQLite KV | `labor_and_costing.test.cjs` | **Verificado em Suíte Automatizada** |
| **Estoque & Suprimentos** | Saldo de peças pesadas e cotação de compras. | `js/estoque.js` · `/api/estoque/*`, `/api/compras/*` | `inventory:*`, `purchase:*` | SQLite KV | `inventory_and_procurement.test.cjs` | **Verificado em Suíte Automatizada** |
| **Financeiro Gerencial & Caixa** | Fluxo de caixa de 30d (regime de caixa). | `js/financeiro.js` · `/api/estado` (contas, movimentos) | `financial:read`, `financial:write` | SQLite KV | `financial_dashboard.test.cjs` | **Verificado em Suíte Automatizada** |
| **Relatórios Executivos** | KPIs e infográfico JPG via Puppeteer. | `js/relatorios.js` · `/api/indicadores/jpg` | `reports:read` | Puppeteer / ImageRenderCache | `financial_dashboard.test.cjs` | **Verificado em Suíte Automatizada** |
| **WhatsApp Assistant** | Atendimento de motoristas e fotos de placas. | `js/whatsapp.js` · `whatsapp-web.js` | `whatsapp:admin` / Webhook | LocalAuth / Cache | `voice.test.cjs`, `http.test.cjs` | **Risco Residual Mapeado (Dependência Externa)** |
| **Fiscal (NF-e/NFS-e)** | Rascunho, cálculo decimal, homologação sintética. | `js/fiscal.js` · `/api/fiscal/*` | `fiscal:read`, `fiscal:emit`, `fiscal:cancel` | SQLite `fiscal_*` · Focus NFe | `fiscal_hardening.test.cjs`, `fiscal_lifecycle_and_events.test.cjs` | **Homologação Sintética Concluída / Produção Bloqueada** |
| **Integração ERP** | Camada outbox para sincronização com ERPs contábeis. | `/api/integracao/erp/*` | `erp:sync`, `*` | SQLite `erp_outbox` | `erp_integration.test.cjs` | **Verificado em Suíte Automatizada** |
| **SaaS & Cobrança (Plataforma)** | Planos Pro/Enterprise e webhooks idempotentes. | `/api/platform/*`, `/webhooks/billing` | `platform:manage` / Webhook Auth | SQLite `billing_*` · Asaas | `saas_customer_lifecycle.test.cjs` | **Verificado em Suíte Automatizada** |
| **Continuidade & Backup** | Backup atômico WAL, integridade SHA-256 e recuperação. | `/api/backup/*` | `backup:manage`, `backup:global` | SQLite WAL / Backups | `wal_backup_and_recovery.test.cjs`, `backup_security_controls.test.cjs`, `e2e_operational_recovery.test.cjs` | **Medições Operacionais Comprovadas** |
| **LGPD & Segurança** | Exportação consolidada de titular com dados fiscais e auditoria. | `/api/lgpd/*` | `crm:read`, `crm:write`, `admin:settings` | SQLite `security_audit_log`, `fiscal_documents` | `lgpd_fiscal_export_hardening.test.cjs`, `workshop_day.test.cjs` | **Verificado com Testes Fiscais Reais** |

---

## 3. Matriz de Necessidades Setoriais e Fronteiras de Escopo

| Setor Empresarial | Necessidade Específica | Classificação | Justificativa Técnica |
|---|---|---|---|
| **Operacional / Oficina** | Abertura ágil de OS, alocação de boxes, checklists e apontamento de mecânicos | **Atendida nativamente** | Módulos `preOS`, `technicalIntake`, `inspection`, `laborTracking` operando integralmente no CRM. |
| **Suprimentos** | Saldo físico de peças pesadas e cotação com fornecedores | **Atendida nativamente** | Módulos `inventoryService` e `procurementService` com prevenção de saldo negativo e tracking. |
| **Financeiro** | Liquidez imediata, contas a pagar/receber e fluxo de caixa | **Atendida nativamente** | Motor gerencial de regime de caixa (`financialEngine`), DSR e fluxo de caixa de 30 dias. |
| **Controladoria** | DRE Contábil Societária por competência e Balanço Patrimonial | **Dependente de integração** | Regime de competência e escrituração contábil devem ser gerados no ERP integrado via `/api/integracao/erp/exportar`. |
| **Fiscal** | Emissão de NF-e e NFS-e | **Bloqueada para produção** | Motor de cálculo decimal e integração Focus funcionais em homologação; bloqueada para emissão real por pendências documentais/fiscais externas. |
| **Contabilidade** | Apuração de tributos (ICMS/PIS/COFINS/ISS), SPED Fiscal e EFD-Contribuições | **Fora do escopo** | Responsabilidade da assessoria contábil e do ERP contábil integrado. |
| **Administração / Gestão** | Painel executivo, gestão RBAC, trilha de auditoria e backups WAL | **Atendida nativamente** | RBAC granular com 9 papéis, backups WAL atômicos com integridade criptográfica e auditoria estruturada. |
