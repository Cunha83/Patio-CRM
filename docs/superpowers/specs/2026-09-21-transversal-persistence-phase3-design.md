# Design Spec: Correção Transversal Centralizada de Persistência e Concorrência de Voz (Fase 3)

## 1. Contexto e Motivação
Na auditoria independente de Fase 3 (`docs/REVISAO_FASE3_PILOTO_2026-09-21.md`), foi constatado que:
1. Cadastros de frotas e fornecedores sob concorrência persistem 20/20 registros com sucesso.
2. Contudo, em `/api/comando-voz`, 20 aberturas de OS simultâneas responderam com `HTTP 200 { success: true, ok: true, acao: 'abrir_os' }`, mas apenas 1 OS foi persistida no SQLite (19 foram perdidas silenciosamente).
3. A causa raiz transversal é que `salvarEstado(req, state)` retorna `{ ok: false, status: 409 }` sem lançar exceção. O chamador não inspeciona o retorno e os blocos `try/catch` não capturam o erro, resultando em respostas falsas de sucesso (200).
4. O mesmo padrão de persistência desprotegida atinge `/api/comando-voz/confirmar`, aprovação digital de orçamentos (`/api/aprovacao/:token/decidir`) e rotas internas.

## 2. Decisões Arquiteturais

### D1: Exceção Tipada `PersistenceError` em `salvarEstado`
O helper imperativo `salvarEstado` (e seus aliases `persistTenantState`, `persistCurrentState`) não pode retornar silenciosamente um objeto com `ok: false`.
Se `persistState` retornar `ok: false`, `salvarEstado` deve obrigatoriamente lançar:
```javascript
class PersistenceError extends Error {
  constructor(message, { status = 500, conflict = false, versao, cause, result } = {}) {
    super(message);
    this.name = 'PersistenceError';
    this.status = status;
    this.conflict = conflict;
    this.versao = versao;
    this.cause = cause;
    this.result = result;
  }
}
```
Isso impede que qualquer chamador de `salvarEstado` considere a operação bem-sucedida sem verificar o retorno.
Em rotas HTTP, o middleware de erro ou o bloco `catch (err)` mapeia `PersistenceError` para:
- HTTP 409 se `err.conflict === true` (com objeto de conflito e versão para recuperação de rascunho).
- HTTP 500 se for falha de infraestrutura.
Nunca converte erro em HTTP 200.

### D2: Separação entre Interpretação e Aplicação de Voz (`/api/comando-voz`)
Conforme solicitado pelo auditor (Item 3):
1. **Fase 1 (Interpretação fora da fila de escrita):**
   - Executa `voiceActionEngine.interpretarComando({ input, context, state: projectedState, aiClient })`.
   - Se a intenção for apenas de leitura (consultar_status, consultar_financeiro, ajuda, etc.) ou se for negada, executa `executarAcao` em modo somente leitura sobre o snapshot atual e retorna imediatamente.
2. **Fase 2 (Mutação Serializada via `mutateTenantState`):**
   - Se a intenção for de mutação (abrir_os, adicionar_reclamacao, etc.) e necessitar de confirmação humana, gera token criptográfico pendente em memória sem mutar o banco.
   - Se for uma mutação autorizada e pronta para aplicação, executa `executarAcao` DENTRO do callback de `mutateTenantState(req, (draft) => { ... })`.
   - Dentro da mutação, o `draft` é o estado real e mais recente do tenant. A ação é aplicada sobre o `draft`, serializada na fila do tenant e salva no SQLite.
   - Todas as 20 aberturas de OS simultâneas são serializadas ordenadamente na fila do tenant: todas as 20 são aplicadas a estados sucessivos e todas persistem (20/20).

### D3: Confirmação de Uso Único de Voz (`/api/comando-voz/confirmar`)
1. Não consome o token antes da persistência durável.
2. Executa a aplicação da ação confirmada dentro de `mutateTenantState`.
3. O token só é invalidado/consumido quando `saveRes.ok === true`.
4. Em caso de falha de persistência ou conflito, o token permanece válido para retentativa do operador ou aborta com erro explícito.

### D4: Aprovação Digital de Orçamento (`/api/aprovacao/:token/decidir`)
1. Valida a assinatura do token criptográfico.
2. Executa `quotationService.processarAprovacaoCliente` dentro de `mutateTenantState`.
3. Se a mutação for abortada ou o status for inválido, propaga status 400/404/409 e não marca como aprovado.
4. Garante persistência durável de 100% das aprovações/recusas de clientes.

### D5: Canais Opcionais e Bots (WhatsApp Bot)
Conforme diretriz do auditor (Item 6):
1. O WhatsApp webhooks / bot listener que processa comandos autônomos sem contexto de sessão interativa do operador deve ter suas mutações bloqueadas no perfil de piloto, respondendo que a operação de gravação autônoma via WhatsApp está indisponível neste canal durante o piloto controlado e orientando o uso do Pátio Web / Voz.
2. Isso garante que nenhum canal desprotegido permaneça aberto a perda de dados.

### D6: Matriz de 97 Chamadores com Evidência por Chamador
Atualizar `docs/evidencias/MATRIZ_CHAMADORES_PERSISTENCIA_2026-09-21.md` documentando para cada um dos 97 chamadores:
- Identificador da chamada e linha em `server.js`
- Tipo (Domínio Atômico, Snapshot Otimista, Administrativo, Interno/Scheduler)
- Mecanismo de segurança (`mutateTenantState`, `PersistenceError thrown`, bloqueio de canal no piloto)
- Teste representativo automatizado associado.
