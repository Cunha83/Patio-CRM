# Especificação de Arquitetura: Modularização e Sanitização do Pátio CRM

- **Data:** 2026-10-16
- **Autor:** Antigravity / Pair Programming
- **Status:** Aprovado para Implementação
- **Objetivo:** Decompor os monólitos do sistema (iniciando pelo `server.js` de ~8.800 linhas e 199 rotas HTTP, seguido pelos arquivos de frontend em `js/`), sanitizando e organizando o código em camadas modulares e profissionais, com garantia de **zero quebras e 100% de aprovação na suíte de testes existente (66 testes)**.

---

## 1. Visão Geral e Princípios Fundamentais

1. **Preservação Rígida de Interface Pública (`server.js`):**
   O `server.js` continuará como ponto de entrada principal do backend e manterá rigorosamente os mesmos `module.exports`:
   - `app` (instância do Express)
   - `getOrLoadState`
   - `salvarEstado`
   - `gerarRelatorioExecutivo`
   - `gerarMensagensAdmin`
   - `gerarMensagensOperacao`
   - `gerarResumoCaixa`
   - `gerarResumoPatio`
   - `gerarImagemIndicadoresJPG`
   - `enviarRelatorioGrupo`
   - `enviarRelatorioAdministradores`
   - `resolverTenantPorChatId`
   - `metrics`
   - `setPasswordResetDeliveryAdapter`

2. **Nenhuma Alteração de Contrato de API:**
   Todos os 199 endpoints REST, códigos de status HTTP, estruturas de JSON de retorno, payloads de erro, cabeçalhos e permissões RBAC permanecem idênticos.

3. **Validação Contínua com Testes:**
   A cada lote de extração, a suíte de testes de regressão será executada para confirmar que não houve introdução de regressões ou erros de runtime.

---

## 2. Arquitetura do Backend Modular

### 2.1 Módulo de Contexto e Estado do Servidor (`lib/serverContext.js`)
Centraliza o estado de tempo de execução, referências compartilhadas e helpers de tenancy:
- `identityRegistry`: Registro de identidades e RBAC.
- `authMiddleware` & `requirePermission(...)`: Middlewares de autenticação e autorização.
- `enqueueWrite`: Fila serializadora de escritas SQLite.
- `nextRevision(targetState, tenantId)`: Gerador determinístico de versão de revisão.
- `extractTenantId(req)` & `getTenantKey(req)`: Resolução de tenant ativo.
- `getOrLoadState(req)` & `salvarEstado(req, state)`: Persistência unificada com isolamento por tenant.
- `persistTenantState`, `persistCurrentState`, `mutateTenantState`.
- `gerarId(prefix)`, `escapeHtml(str)`, `safeJsonParse(text)`.
- Mutexes de avaliação concorrente (`runningEvaluations`, `runningMaintenanceEvals`, `runningAfterSalesEvals`, `runningRelationshipEvals`).
- Memória de curto prazo de placas (`ultimasPlacas`).
- Instâncias de integração desacopladas via getters/setters:
  - `aiClient` (Google Gen AI)
  - `wppClient` (WhatsApp Web Client)
  - `browserRenderCache` (Puppeteer Image Render Cache)
  - `passwordResetDeliveryAdapter`
  - `serverInitializationPromise`

### 2.2 Serviços Extraídos de `server.js` para `services/`
1. `services/vehicleLookupService.js`:
   - `consultarDadosVeiculoOnline(placa, cfg)`: Consulta online de dados na APIBrasil/Sinesp com fallback gracioso.
2. `services/reportGenerationService.js`:
   - `gerarRelatorioExecutivo({ state, tenantId })`
   - `gerarMensagensAdmin({ state, tenantId })`
   - `gerarMensagensOperacao({ state, tenantId })`
   - `gerarResumoCaixa({ state, tenantId })`
   - `gerarResumoPatio({ state, tenantId })`
   - `gerarImagemIndicadoresJPG({ state, tenantId })`
   - `enviarRelatorioGrupo(...)`
   - `enviarRelatorioAdministradores(...)`
3. `services/whatsapp/whatsappClient.js` & `whatsappHandlers.js`:
   - Inicialização sob demanda (`getWhatsAppModules`, `getPuppeteer`).
   - `iniciarWhatsApp()` com listeners de QR Code, autenticação e disconnect.
   - `processarMensagemWhatsApp(msg)`:
     - OCR inteligente de imagem (Tesseract)
     - Comandos executivos (`!relatorio`, `!caixa`, `!patio`, `!ajuda`)
     - Fluxos A (status), B0 (redirecionamento de box), Intake (pré-os), B (abertura de OS), C (peças/serviços), D/E/F/G (voz e comandos naturais).
4. `services/whatsapp/whatsappScheduler.js`:
   - `iniciarAgendadorRelatorioDiario()`: Disparos matinais e de fechamento com cálculo de timezone.

### 2.3 Roteadores Express Modulares (`routes/`)
Cada domínio terá um roteador Express isolado:
1. `routes/health.routes.js`: `/health`, `/ready`, `/api/metricas/reset`
2. `routes/state.routes.js`: `/api/estado`, `/api/versao`
3. `routes/backup.routes.js`: `/api/backup/download`, `/api/backup/wal`, `/api/backup/listar`, `/api/backup/restaurar`, `/api/backup/importar`
4. `routes/os.routes.js`: `/api/os/entrada`, `/api/os/:id/anexar-foto`, `/api/veiculos/conciliar`, `/api/os/:id/pecas/consumir`, `/api/os/:id/pecas/devolver`, `/api/os/:id/custos`
5. `routes/preOs.routes.js`: `/api/pre-os`, `/api/pre-os/:id`, `/api/pre-os/:id/converter`, `/api/pre-os/:id/cancelar`, `/api/pre-os/triagem` e rotas `/api/intake/*`
6. `routes/inspection.routes.js`: `/api/inspecoes`, `/api/inspecoes/:id/*`
7. `routes/quotation.routes.js`: `/api/orcamentos`, `/api/orcamentos/:id/*`, `/aprovacao/:token`, `/api/aprovacao/:token/*`
8. `routes/inventory.routes.js`: `/api/pecas/*`, `/api/fornecedores/*`, `/api/compras/*`
9. `routes/team.routes.js`: `/api/equipe/*`, `/api/apontamentos/*`, `/api/produtividade/*`
10. `routes/pricing.routes.js`: `/api/precificacao/*`, `/api/rentabilidade/*`
11. `routes/crm.routes.js`: `/api/clientes/*`, `/api/frotas/*`, `/api/manutencao/*`, `/api/crm/*`, `/api/agendamentos/*`, `/api/pos-venda/*`
12. `routes/voice.routes.js`: `/api/upload-nota`, `/api/processar-audio-os`, `/api/comando-voz`, `/api/comando-voz/confirmar`
13. `routes/operation.routes.js`: `/api/operacao/*`, `/api/financeiro/dashboard`
14. `routes/config.routes.js`: `/api/configuracoes/*`, `/api/assistente/*`, `/api/lgpd/*`, `/api/onboarding/*`
15. `routes/auth.routes.js`: `/api/auth/*`
16. `routes/billing.routes.js`: `/api/billing/*`, `/api/assinatura/*`, `/webhooks/billing/*`, `/api/public/planos`
17. `routes/platform.routes.js`: `/api/platform/*`, `/api/auditoria`, `/api/integracao/erp/*`
18. `routes/whatsapp.routes.js`: `/api/whatsapp/*`
19. `routes/static.routes.js`: Servir páginas públicas HTML (`/`, `/precos`, `/cadastro`, `/checkout`, `/assinatura`) e controle estrito de arquivos estáticos.
20. `routes/index.js`: Registrador central que monta todos os roteadores na aplicação Express.

### 2.4 Novo `server.js` (Orquestrador)
- Carregamento de variáveis de ambiente (`dotenv`).
- Criação e configuração global da instância `app = express()`.
- Middlewares globais (correlation, helmet, parsers de JSON dinâmicos por limite, bloqueio de path traversal).
- Inicialização do suporte e fiscal (`mountSupport`, `createFiscalRouter`).
- Montagem do roteador central (`mountRoutes(app)`).
- Inicialização do SQLite e inicialização do servidor HTTP (`app.listen`).
- Gerenciamento de encerramento gracioso (`shutdown`, `SIGINT`, `SIGTERM`).
- Exportação da interface pública para compatibilidade com a suíte de testes.

---

## 3. Estratégia de Transição para o Frontend (Fase 2)

Após a estabilização e validação completa do Backend:
1. Decomposição de `js/app.js` (~115 KB) e `js/cadastros.js` (~101 KB) em módulos de domínio especializados sob `js/modules/`.
2. Sanitização de variáveis globais e desacoplamento do `state.js`.
3. Verificação de renderização visual e eventos de interface no navegador.
