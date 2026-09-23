# Especificação de Design — Estabilização Piloto Fase 2: Atomicidade HTTP, Eliminação de Falso Sucesso e Validação E2E

**Data:** 21/09/2026  
**Status:** Aprovado  
**Documento de Origem:** `docs/REVISAO_WALKTHROUGH_PILOTO_2026-09-21.md`  

---

## 1. Contexto e Problema

A revisão independente em `docs/REVISAO_WALKTHROUGH_PILOTO_2026-09-21.md` reproduziu e comprovou uma falha crítica P0 no Pátio CRM:
- 20 requisições simultâneas em `/api/frotas` receberam HTTP 200 com `{ success: true }`, mas apenas 1 frota foi persistida no SQLite. 19 foram descartadas silenciosamente devido a conflito de versão no repositório, que foi ignorado pela rota HTTP.
- O helper `mutateTenantState` foi definido em `server.js`, mas nenhuma rota de domínio o utilizava.
- A função `mutateState` em `lib/repository/stateRepository.js` dependia de um `enqueueWrite` opcional; sem ele, realizava persistência com `force: true` sem garantia real de fila/serialização.
- Chamadores remanescentes em `server.js` (como upload de notas e fluxos WhatsApp) mantinham incrementos prematuros manuais de versão (`targetState.versao = nextRevision(...)`).
- A sonda `/ready` não possuía testes negativos comprovando HTTP 503 em falhas de banco e de armazenamento, e a flag `DISABLE_WHATSAPP` não era verificada no arranque do cliente WhatsApp.
- O benchmark anterior media o repositório em processo, sem mensurar a camada HTTP real.

---

## 2. Abordagens Analisadas

### Abordagem A: Concorrência Otimista com Rejeição Estrita 409 em Todas as Rotas
- Cada rota lê o estado, aplica a mutação e tenta gravar. Se houver concorrência, retorna HTTP 409.
- **Desvantagem:** Em alta concorrência operacional (ex: 20 veículos/frotas cadastrados simultaneamente por operadores ou integrações), 19 falham e exigem que o cliente reenvie em loops de retry complexos.

### Abordagem B: Mutação Atômica Serializada por Tenant nos Endpoints de Domínio + Concorrência Otimista Estrita no Upload Geral de Estado (RECOMENDADA)
- Rotas de ação específica no servidor (`/api/frotas`, `/api/os`, `/api/agendamentos`, etc.) utilizam `mutateTenantState(req, draft => ...)`. A fila de escrita do tenant serializa as operações: cada uma lê a versão mais recente dentro da fila, aplica sua alteração e persiste atomicamente. Todas as 20 requisições são persistidas com sucesso real e integridade total.
- Rotas de upload de snapshot completo (`POST /api/estado`) mantêm verificação otimista estrita: se a versão do cliente divergir da versão do banco, rejeitam com HTTP 409 explícito, sem mascaramento.
- Se qualquer gravação falhar, a rota propaga o erro com status apropriado (409 ou 500) e **nunca** retorna HTTP 200 se a persistência não foi confirmada.
- `stateRepository.js` passa a ter uma fila canônica interna por tenant (`getTenantQueue(tenantId)`), garantindo que `mutateState` jamais execute sem serialização real, mesmo se o chamador não passar `enqueueWrite`.

---

## 3. Arquitetura e Contratos Técnicos

### 3.1 `lib/repository/stateRepository.js`
1. **Fila Canônica Interna:**
   - Implementação de `tenantWriteQueues = new Map()` com função `getTenantWriteQueue(tenantId)`.
   - `mutateState(context, mutatorFn, options)` usa `options.enqueueWrite || getTenantWriteQueue(tenantId)`. Se `force: true` for usado internamente, ele é seguro porque opera sob a fila serializada do tenant.
2. **Propagação Estrita de Conflito:**
   - Em `persistState`, se `expectedVersao !== currentVersao` e não for `force: true`, retorna `{ ok: false, status: 409, conflict: true, versao: currentVersao, error: '...' }`.

### 3.2 `server.js`
1. **Migração dos Endpoints para `mutateTenantState`:**
   - `/api/frotas` (POST): insere frota via `mutateTenantState` e só responde 201 após confirmação.
   - `/api/frotas/:id/veiculos` (POST): associa veículos à frota via `mutateTenantState`.
   - `/api/agendamentos` e `/api/agendamentos/:id/converter-pre-os`: usam `mutateTenantState`.
   - Rotas de CRM, garantias e ordens de serviço: auditadas para usar `mutateTenantState` ou checar estritamente `saveRes.ok`.
2. **Auditoria Geral de `salvarEstado` / `persistTenantState`:**
   - Toda rota que invoca `persistTenantState(req, state)` ou `salvarEstado(req, state)` DEVE verificar:
     ```javascript
     const saveRes = await persistTenantState(req, state);
     if (!saveRes || !saveRes.ok) {
       return res.status(saveRes?.status || 409).json({ success: false, error: saveRes?.error || 'Falha ao persistir alterações.' });
     }
     ```
3. **Eliminação de Incrementos Prematuros de Versão:**
   - Remoção de qualquer `targetState.versao = nextRevision(...)` restante em `server.js` (incluindo rotas de upload de notas fiscais e handlers de mensagens WhatsApp). O repositório é o único responsável por publicar a nova versão ao persistir.
4. **Aplicação Real das Flags no Arranque e Sondas:**
   - Em `server.js:6273`, verificar `process.env.DISABLE_WHATSAPP !== 'true'` antes de chamar `iniciarWhatsApp()`.
   - Em `/ready`, verificar o status real do cliente WhatsApp (`wppClient?.info ? 'connected' : (wppClient ? 'initializing' : 'disabled'))`.

---

## 4. Plano de Testes e Validação

1. **Teste HTTP de Concorrência Real (`tests/http_concurrency_frotas.test.cjs`):**
   - Disparo de 20 POSTs simultâneos via HTTP `fetch` para `/api/frotas` em porta efêmera com SQLite temporário.
   - Verificação de que todas as 20 retornam HTTP 201/200.
   - `GET /api/frotas` comprova que exatamente 20 frotas existem na memória/banco.
   - Reinicialização completa do processo Express (`shutdown` e novo `spawn`).
   - Novo `GET /api/frotas` comprova que as 20 frotas permanecem íntegras no SQLite após reinício.
2. **Testes Negativos de Prontidão (`tests/readiness_probe_negative.test.cjs`):**
   - Cenário 1: Banco de dados com falha/fechado -> `/ready` retorna HTTP 503 com `checks.database !== 'ok'`.
   - Cenário 2: Diretório de uploads inacessível / somente leitura -> `/ready` retorna HTTP 503 com `checks.storage !== 'ok'`.
3. **Benchmark HTTP Real (`scripts/pilot_http_benchmark.cjs`):**
   - Carga sintética de 5 tenants com 10 clientes simultâneos via chamadas HTTP reais (`fetch`).
   - Medição de latência HTTP (p50, p95), requisições por segundo, taxa de conflitos (0%) e uso de memória do servidor.
4. **Validação E2E no Navegador:**
   - Execução do fluxo operacional automatizado no navegador (login -> cliente -> veículo -> OS -> box -> verificação de persistência).
5. **Suíte Completa:**
   - Execução de `npm test` garantindo 100% de aprovação (0 falhas).

---

## 5. Critérios de Aceite

- [x] Zero falsos sucessos: nenhum endpoint HTTP retorna 200/201 sem gravação confirmada no SQLite.
- [x] 20 cadastros concorrentes em `/api/frotas` resultam em 20 frotas no GET e persistem após reinício do servidor.
- [x] `/ready` testado positivamente (200) e negativamente (503 para banco e storage).
- [x] Todas as chamadas de persistência verificam e propagam erros explicitamente.
- [x] Benchmark HTTP formal registrado em `docs/evidencias/`.
- [x] Base de dados operacional `patio.db` preservada intacta.
- [x] Parecer final sustentado por evidências irrefutáveis.
