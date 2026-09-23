# Design Spec: Unificação da Confirmação de Voz e Recuperação Pós-Falha de Persistência (Fase 3 — P1)

**Data:** 21 de Setembro de 2026  
**Status:** Aprovado  
**Referência:** docs/REVISAO_PERSISTENCIA_VOZ_2026-09-21.md  

---

## 1. Contexto e Diagnóstico da Causa Raiz

Na auditoria registrada em `docs/REVISAO_PERSISTENCIA_VOZ_2026-09-21.md`, foi constatado que o endpoint dedicado `/api/comando-voz/confirmar` já operava com consumo de token desacoplado (`autoConsumirToken: false`), consumindo o token somente após o sucesso físico no SQLite.

No entanto, o endpoint geral `/api/comando-voz`, ao interpretar falas ou textos de confirmação (`intencao = 'confirmar_acao'`, ex.: `{ texto: "confirmar" }`), invocava `voiceActionEngine.executarAcao` com o valor padrão `autoConsumirToken: true`.

### Impacto Diagnosticado (P1):
1. O operador solicita uma ação crítica (ex.: exclusão de OS). O sistema gera um token e coloca em `acoesPendentes`.
2. O operador confirma dizendo ou enviando `{ texto: "confirmar" }` para `/api/comando-voz`.
3. `voiceActionEngine.executarAcao` consome o token e remove a ação de `acoesPendentes` imediatamente na memória, antes de gravar no banco.
4. Ocorre uma falha de escrita no SQLite (I/O, timeout, lock). O `mutateTenantState` aborta e lança `PersistenceError`.
5. A OS não é excluída no banco (correto), mas o token e a ação pendente já foram destruídos da memória.
6. Quando o operador tenta repetir a confirmação com o mesmo token (pelo botão ou pela voz), recebe `HTTP 400: Token já utilizado anteriormente`.

---

## 2. Objetivos de Design e Requisitos

1. **Unificação Arquitetural:** O endpoint geral `/api/comando-voz` e o endpoint dedicado `/api/comando-voz/confirmar` devem compartilhar a mesma lógica de validação, reserva de concorrência, execução sob transação atômica serializada (`mutateTenantState`) e consumo definitivo pós-persistência.
2. **Preservação de Token em Falhas de Escrita:** Se a gravação no SQLite falhar, o token NÃO pode ser consumido nem removido de `acoesPendentes`. O operador deve poder retentar com sucesso quando a persistência for restabelecida.
3. **Reserva Contra Concorrência (Anti-Replay Duplo Simultâneo):** Durante o tempo em que uma confirmação está em processamento na fila de escrita do tenant, chamadas simultâneas com o mesmo token devem ser reservadas ou rejeitadas, impedindo execução duplicada.
4. **Consumo Estritamente Durável:** O token é registrado em `consumedTokens` e removido de `acoesPendentes` **única e exclusivamente após** a gravação física no SQLite ser confirmada com sucesso (`mutateRes.ok === true`).
5. **Isolamento Estrito:** Preservar vínculo de tenant (`tenantId`), operador (`actorId`), recurso (`resourceId`) e expiração (`exp`).

---

## 3. Arquitetura da Solução

### 3.1 Módulo `lib/tokens/securityToken.js`
Adicionar controle de tokens em trânsito (*in-flight*):
- `inFlightTokens = new Set()`: armazena os `jti`s de tokens que estão atualmente em execução dentro de um bloco transacional.
- `reservarTokenAcao(tokenString, expected)`:
  - Executa `validarTokenAcao(tokenString, expected)`.
  - Se `inFlightTokens.has(payload.jti)`: retorna `{ ok: false, status: 409, error: 'Confirmação concorrente já em andamento para este token.' }`.
  - Se válido: adiciona `payload.jti` a `inFlightTokens` e retorna `{ ok: true, payload }`.
- `liberarTokenAcao(tokenString)`:
  - Remove `payload.jti` de `inFlightTokens` sem registrar em `consumedTokens` (utilizado em caso de falha de persistência).
- `confirmarConsumoTokenAcao(tokenString, expected)`:
  - Remove `payload.jti` de `inFlightTokens`.
  - Adiciona `payload.jti` a `consumedTokens`.
  - Retorna `{ ok: true, payload }`.

### 3.2 Motor `services/voiceActionEngine.js`
- No bloco `intencao === 'confirmar_acao'`:
  - Definir `shouldAutoConsume = false` como padrão seguro universal em `executarAcao` (apenas valida sem queimar o token na memória).
  - Suportar resolução determinística do token a partir do contexto (`context.confirmToken` ou busca em `acoesPendentes` filtrando estritamente por `tenantId`, `actorId` e `canal`).
  - Em `acoesPendentes`, marcar `emProcessamento: true` durante a execução e remover apenas em `consumirAcaoPendente`.
  - Exportar função `abortarConfirmacaoAcao(token)` para reverter o estado `emProcessamento` caso o `mutateTenantState` falhe.

### 3.3 Rotas no `server.js`
- **Em `/api/comando-voz`:**
  - Quando `interpretado.intencao === 'confirmar_acao'`:
    - Resolver o token associado.
    - Reservar o token via `reservarTokenAcao`.
    - Executar `mutateTenantState` com `autoConsumirToken: false`.
    - Se sucesso físico: invocar `voiceActionEngine.consumirAcaoPendente(token, { tenantId, actorId })`.
    - Se falha de persistência: invocar `voiceActionEngine.abortarConfirmacaoAcao(token)` e `securityToken.liberarTokenAcao(token)`.
- **Em `/api/comando-voz/confirmar`:**
  - Utilizar a mesma reserva e o mesmo fluxo pós-commit.

---

## 4. Plano de Testes e Evidências

1. **Teste de Reprodução e Recuperação Pós-Falha:**
   - Criar OS sintética.
   - Solicitar exclusão via `/api/comando-voz` -> recebe `token`.
   - Injetar falha de escrita no SQLite.
   - Enviar `{ texto: "confirmar" }` para `/api/comando-voz`.
   - Verificar retorno HTTP de erro e OS ainda existente.
   - Remover falha de escrita.
   - Reenviar `{ token }` para `/api/comando-voz/confirmar` ou `{ texto: "confirmar" }`.
   - Verificar HTTP 200, OS excluída com sucesso e token consumido.
   - Reenviar token pela terceira vez -> verificar HTTP 400 "Token já utilizado".
2. **Teste de Concorrência com o Mesmo Token:**
   - 5 confirmações simultâneas disparadas com o mesmo token:
     - Exatamente 1 deve ser confirmada.
     - 4 devem falhar com rejeição de token duplicado/em processamento.
3. **Teste de Isolamento Cruzado:**
   - Operador de outro tenant ou usuário diferente tentando confirmar o token é bloqueado.
4. **Suíte Geral:** Reexecução dos 525 testes com zero falhas.
