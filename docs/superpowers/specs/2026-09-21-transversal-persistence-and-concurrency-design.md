# Design Spec: Correção Transversal de Persistência, Atomicidade HTTP e Matriz de Chamadores

Data: 2026-09-21  
Status: Proposto / Em Execução  
Referência: `docs/REVISAO_FASE2_PILOTO_2026-09-21.md`

---

## 1. Contexto e Diagnóstico do Problema

Na revisão independente da Fase 2 (`docs/REVISAO_FASE2_PILOTO_2026-09-21.md`), foi comprovado que:
- O endpoint `/api/frotas` foi corrigido com sucesso e persiste 20/20 requisições concorrentes.
- O endpoint `/api/fornecedores` ainda sofre da mesma falha P0: sob 20 POSTs simultâneos, todos retornam HTTP 200 com `{ success: true }`, mas apenas 1 registro é persistido no SQLite.
- O inventário preliminar revelou **97 chamadores** diretos e indiretos de persistência (`salvarEstado`, `persistTenantState`, `persistCurrentState`, `persistState`) espalhados por rotas de domínio (peças, estoque, compras, OS, apontamentos, inspeções, orçamentos, integrações e WhatsApp).
- A causa raiz é dupla:
  1. **Ausência de Serialização Atômica em Rotas de Domínio:** Rotas fazem `const state = await getOrLoadState(req)`, aplicam alterações em memória em um snapshot compartilhado ou obsoleto, e chamam `await salvarEstado(req, state)`. Sob concorrência, o repositório detecta conflito de versão em 19 das 20 requisições.
  2. **Silenciamento de Falhas de Persistência:** `salvarEstado` retorna `{ ok: false, status: 409, error: ... }`, mas a maioria dos chamadores ignora esse retorno e emite `res.json({ success: true, ... })`.

---

## 2. Abordagens Avaliadas

### Abordagem 1: Migração Pontual Rota a Rota
- Migrar apenas `/api/fornecedores` e fechar o chamado.
- **Desvantagens:** Rejeitada formalmente pela revisão ("Não encerre após corrigir apenas fornecedores"). Não resolve estoque, OS, compras ou apontamentos.

### Abordagem 2: Throw Indiscriminado em `salvarEstado`
- Fazer `salvarEstado` lançar exceção se `!result.ok`.
- **Desvantagens:** Sem serialização atômica, as 19 requisições concorrentes continuariam falhando com 409, impedindo operações concorrentes legítimas de diferentes usuários ou abas no mesmo tenant.

### Abordagem 3 (Recomendada e Adotada): Solução Arquitetural em Dois Níveis
1. **Serialização Atômica com `mutateTenantState` para Operações de Domínio:**
   - Todas as rotas de domínio incremental (fornecedores, peças, compras, OS, apontamentos, equipe, inspeções, orçamentos) são migradas para `mutateTenantState(req, async (draft) => { ... })`.
   - Cada requisição executa dentro da fila canônica do tenant (`tenantWriteQueues`), lê o draft mais recente (já contendo a gravação anterior) e persiste atomicamente sem conflito de versão.
   - Validação estrita: se `saveRes.ok === false`, a rota propaga explicitamente `res.status(saveRes.status || 409).json(saveRes)`.
2. **Controle Otimista Estrito em Snapshots do Cliente (`POST /api/estado`):**
   - Quando o frontend envia o estado completo, mantém-se a checagem otimista de versão (`req.body.versao === currentVersao`). Se houver divergência, retorna `HTTP 409 Conflict` com o snapshot atualizado para reconciliação no cliente, sem sobrescrita silenciosa.
3. **Propagação Centralizada de Erros de Persistência:**
   - Para qualquer chamador que continue usando `salvarEstado` ou `persistTenantState`, a função verifica o retorno e, se `!result.ok`, lança um erro tipado `PersistenceError` com `.status = result.status || 409`, garantindo que nenhum bloco de captura genérico converta silenciosamente a falha em HTTP 200.
4. **Matriz Completa dos 97 Chamadores Auditados:**
   - Classificação de cada chamador: Rota / Tarefa, Tipo (Domínio Atômico, Snapshot Otimista, Background/Sistema), Estratégia de Concorrência e Tratamento de Erro.

---

## 3. Matriz Arquitetural dos Chamadores de Persistência

A auditoria identificou os 97 pontos de persistência em `server.js`, categorizados em 4 grupos:

| Grupo | Descrição | Estratégia de Concorrência | Tratamento de Erro |
|---|---|---|---|
| **A. Cadastros & Domínio Incremental** | Fornecedores, Peças, Estoque, Compras, Apontamentos, Equipe, OS | `mutateTenantState` (fila atômica por tenant) | Retorna status da mutação (`saveRes.status || 409/500`) |
| **B. Sub-fluxos Operacionais** | Inspeções, Orçamentos, Pré-OS, Triagem, Intake, Fotos | `mutateTenantState` (fila atômica por tenant) | Retorna status da mutação (`saveRes.status || 409/500`) |
| **C. Snapshots Completos do Cliente** | `POST /api/estado` | Snapshot Otimista (`req.body.versao === db.versao`) | Retorna `HTTP 409 Conflict` em caso de versão obsoleta |
| **D. Sistema, Background & WhatsApp** | Agendador, Webhooks, Importação de Backup, Handlers WhatsApp | Fila canônica do tenant (`mutateState` / `enqueueWrite`) | Log estruturado e rollback transacional |

---

## 4. Plano de Testes e Validação

1. **Regressão HTTP de Fornecedores (`tests/http_concurrency_fornecedores.test.cjs`):**
   - 20 requisições simultâneas `POST /api/fornecedores` com nomes e CNPJs distintos.
   - Verificação de que todos os 20 IDs confirmados estão presentes em `GET /api/fornecedores`.
   - Reinício do processo Express e reexecução de `GET /api/fornecedores` confirmando 20 registros persistidos.
2. **Bateria de Concorrência de Domínio Transversal (`tests/http_concurrency_domain.test.cjs`):**
   - Teste de concorrência em Estoque/Peças (`POST /api/pecas` e `POST /api/pecas/:id/ajustar`).
   - Teste de concorrência em Apontamentos de Tempo (`POST /api/apontamentos/iniciar`).
   - Teste de concorrência cruzada no mesmo tenant (operações simultâneas de fornecedor + peça + apontamento).
3. **Atualização do Benchmark HTTP Real (`scripts/pilot_http_benchmark.cjs`):**
   - Validação dos IDs persistidos no banco SQLite além do código HTTP 200.
4. **Execução da Suíte Completa:**
   - 100% de aprovação (zero regressões).
5. **Auditoria E2E no Navegador com `agent-browser`:**
   - Verificação das jornadas completas no DOM.
