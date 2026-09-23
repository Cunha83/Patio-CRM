# Homologação Funcional, RBAC Server-Side, Contrato Monetário e Consulta de Clientes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar blindagem completa server-side de campos financeiros para perfis sem `financial:read` (especialmente mecânicos) com reconciliação segura na gravação; corrigir o contrato monetário para entrada pt-BR, numéricos de API e exibição; estabilizar o harness de testes HTTP; criar a consulta de clientes via API com popup Serasa/Sintegra; e validar jornadas no navegador via `agent-browser` em servidor isolado.

**Architecture:** 
- Camada de Repositório (`lib/repository/stateRepository.js`): projeção de campos permitidos por papel/permissão em `filterStateByRole` e mesclagem não-destrutiva em `persistState`.
- Camada de Servidor (`server.js`): projeção consistente em rotas específicas de OS e novo endpoint `POST /api/integracoes/consulta-cliente`.
- Camada de Helpers de Estado (`js/state.js`): parsing monetário robusto determinístico separando pt-BR de float canônico.
- Camada de Interface (`js/cadastros.js`, `js/app.js`): pop-up modal para escolha de consulta Serasa e auto-preenchimento dos dados do cliente.
- Camada de Testes & Verificação: testes HTTP rigorosos com usuários sintéticos, estabilização de harness e runner E2E `agent-browser`.

**Tech Stack:** Node.js, Express 5, SQLite WAL, Vanilla JS ES6+, Agent-Browser CLI (Vercel Labs), Node Test Runner (`node:test`).

**Spec:** `docs/superpowers/specs/2026-09-17-revisao-geral-fine-tuning-design.md`

## Global Constraints
- NUNCA apagar dados financeiros no banco SQLite nem substituir por zero quando um mecânico grava uma alteração operacional.
- Isolar estritamente por tenant (`x-tenant-id`) todas as rotas e consultas.
- Preservar 100% dos testes existentes na suíte.
- Não executar testes contra dados ou servidores operacionais (usar porta dinâmica e banco em `os.tmpdir()`).

---

### Task 1: Blindagem Server-Side de Dados Financeiros para Perfil Mecânico (Projeção e Reconciliação na Escrita)

**Files:**
- Modify: `lib/repository/stateRepository.js`
- Modify: `server.js:460-610`
- Test: `tests/rbac_mechanic_financial_projection.test.cjs`

**Interfaces:**
- Consumes: `state`, `context = { role, permissions, tenantId }`
- Produces: `filterStateByRole(state, context)` omitindo valores financeiros de OS, itens, peças, compras e relatórios; `persistState` preservando dados financeiros pré-existentes quando gravados por perfil mecânico.

- [ ] **Step 1: Escrever teste de unidade e integração HTTP para blindagem financeira do mecânico**

Criar `tests/rbac_mechanic_financial_projection.test.cjs` testando:
1. `filterStateByRole` omite `total`, `servicos[].valor`, `pecas[].valor`, `pecas[].venda`, `pecas[].custo`, `orcamento` para contexto `mecanico`.
2. Preserva dados operacionais: `num`, `placa`, `box`, `st`, `queixa`, `servicos[].nome`, `servicos[].qtd`, `pecas[].nome`, `pecas[].qtd`.
3. `persistState` chamado por mecânico atualizando o status de uma OS de `fila` para `executando` NÃO apaga nem zera os valores financeiros já gravados no banco.
4. Requisições HTTP em servidor isolado: usuário com papel `mecanico` autenticado recebe 200 em `GET /api/estado`, mas a resposta JSON é desprovida de cifras financeiras; usuário `gestor` recebe todos os valores.

- [ ] **Step 2: Executar teste para verificar falha inicial**

Run: `node --require ./scripts/test-preload.cjs --test tests/rbac_mechanic_financial_projection.test.cjs`
Expected: FAIL (campos financeiros ainda presentes na OS filtrada).

- [ ] **Step 3: Implementar projeção e reconciliação em `lib/repository/stateRepository.js`**

Em `filterStateByRole`:
- Quando `!perms.includes('financial:read') && role !== 'financeiro'`:
  - Mapear `filtered.os`: para cada OS, remover `total`, `desc`, `desconto`, `orcamento`, `faturamento`, `contasReceber`.
  - Para cada serviço em `os.servicos`: remover `valor`, `custo`, `subtotal`.
  - Para cada peça em `os.pecas`: remover `valor`, `venda`, `custo`, `margem`, `subtotal`.
  - Para peças do `estoque`: remover `custo`, `venda`, `margem`.
Em `persistState`:
- Se o autor da gravação não possui `financial:read`:
  - Carregar o estado anterior do banco e reconciliar os arrays `os`, `estoque`, `financeiro`, `contas`, preservando os campos financeiros existentes para cada item correspondente por `id`.

- [ ] **Step 4: Re-executar teste e validar aprovação**

Run: `node --require ./scripts/test-preload.cjs --test tests/rbac_mechanic_financial_projection.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/repository/stateRepository.js server.js tests/rbac_mechanic_financial_projection.test.cjs
git commit -m "security(rbac): blindagem server-side de campos financeiros para perfil mecanico com reconciliacao na gravacao"
```

---

### Task 2: Reconciliação do Contrato Monetário (Entrada pt-BR, Numérico da API e Exibição)

**Files:**
- Modify: `js/state.js:270-340`
- Test: `tests/monetary_contracts.test.cjs`

**Interfaces:**
- Consumes: string, number, ou qualquer valor de entrada
- Produces: 
  * `parseBRL(val, options)`: parsing preciso diferenciando pt-BR de float canônico
  * `isValidMoney(val, options)`: validação estrita sem coerção de booleanos ou arrays
  * `formatBRL(val)`: formatação visual canônica `R$ 1.250,50`

- [ ] **Step 1: Escrever teste de regressão para casos ambíguos e complexos**

Criar `tests/monetary_contracts.test.cjs` cobrindo explicitamente:
- `"1.250.000"` deve resultar em `1250000` (e NÃO 1.25).
- `"1.250.000,00"` deve resultar em `1250000`.
- `"1.250,50"` deve resultar em `1250.50`.
- `"1250.50"` deve resultar em `1250.50`.
- `"1,250"` deve resultar em `1.25` (pt-BR decimal).
- Entradas inválidas (`"1.250.000.00"`, `"abc"`, `false`, `[]`, `{}`) não devem ser interpretadas como dinheiro válido nem converter silenciosamente para `0` em validações estritas de negócio.

- [ ] **Step 2: Executar teste para confirmar a falha de "1.250.000"**

Run: `node --require ./scripts/test-preload.cjs --test tests/monetary_contracts.test.cjs`
Expected: FAIL (falha em "1.250.000" retornando 1.25).

- [ ] **Step 3: Implementar algoritmo rigoroso de parsing em `js/state.js`**

Implementar lógica que:
1. Detecta separadores: conta ocorrências de `.` e `,`.
2. Se houver vírgula e pontos: verifica se pontos são milhares válidos (`\d{1,3}(\.\d{3})+,\d{1,2}`) e vírgula decimal.
3. Se não houver vírgula: se houver múltiplos pontos no padrão de milhares (`\d{1,3}(\.\d{3})+`), remove pontos e trata como inteiro. Se houver 1 ponto seguido de exatamente 1 ou 2 dígitos (formato canônico da API `1250.50`), preserva ponto decimal. Se for padrão de milhar pt-BR (`1.250`), converte para `1250`.
4. Rejeita substrings parciais (não usar `parseFloat` sem validação de término da string).

- [ ] **Step 4: Re-executar teste e garantir aprovação**

Run: `node --require ./scripts/test-preload.cjs --test tests/monetary_contracts.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/state.js tests/monetary_contracts.test.cjs
git commit -m "fix(finance): resolucao de parsing monetario pt-BR para milhares e decimais sem truncamento"
```

---

### Task 3: Estabilização do Test Harness HTTP e Prevenção de ECONNREFUSED

**Files:**
- Modify: `tests/server_endpoints_finetune.test.cjs`
- Modify: `tests/e2e_operational_recovery.test.cjs`

**Interfaces:**
- Consumes: `spawn(process.execPath, ['server.js'], { ... })`
- Produces: Inicialização determinística com confirmação obrigatória de `/ready`, captura sanitizada de erros de spawn/timeout e encerramento limpo via `await once(child, 'exit')`.

- [ ] **Step 1: Refatorar o harness em `tests/server_endpoints_finetune.test.cjs`**

- Adicionar listener `child.on('error', err => { spawnError = err; })`.
- Substituir o loop fixo por loop com deadline explícito (30s) e flag `isReady`.
- Se `!isReady`, lançar erro descritivo detalhando se o processo morreu (com exitCode) ou se expirou o timeout, exibindo `childLogs` sanitizados.
- No teardown `t.after`, chamar `child.kill()`, aguardar `await once(child, 'exit').catch(() => {})`, e somente então desalocar arquivos temporários com retentativas.

- [ ] **Step 2: Executar teste isolado repetidamente (3x seguidas)**

Run: `node --require ./scripts/test-preload.cjs --test tests/server_endpoints_finetune.test.cjs`
Expected: PASS em 100% das execuções sem ECONNREFUSED.

- [ ] **Step 3: Commit**

```bash
git add tests/server_endpoints_finetune.test.cjs
git commit -m "test(harness): estabilizacao de inicializacao de servidor, captura de readiness e teardown limpo"
```

---

### Task 4: Nova Funcionalidade — Consulta de Cliente via API (Sintegra & Pop-up Serasa)

**Files:**
- Modify: `server.js` (novo endpoint `POST /api/integracoes/consulta-cliente`)
- Modify: `js/cadastros.js` (botão de consulta, pop-up modal Serasa/Sintegra, preenchimento automático)
- Modify: `js/app.js` (funções auxiliares de integração e modal)
- Test: `tests/consulta_cliente_api.test.cjs`

**Interfaces:**
- Consumes: `{ doc, incluirSerasa: boolean }`
- Produces: `{ success: true, dados: { doc, nome, fantasia, ie, cep, endereco, bairro, cidade, uf, fone, scoreSerasa } }`

- [ ] **Step 1: Escrever teste de unidade e API para `POST /api/integracoes/consulta-cliente`**

Criar `tests/consulta_cliente_api.test.cjs` testando:
1. Validação de documento: CPF (11 dígitos) e CNPJ (14 dígitos).
2. Consulta apenas Sintegra (`incluirSerasa: false`): retorna dados cadastrais e fiscais sem dados de crédito.
3. Consulta com Serasa (`incluirSerasa: true`): retorna dados cadastrais + `scoreSerasa` e indicador de risco.
4. Permissões RBAC e isolamento por tenant.

- [ ] **Step 2: Implementar endpoint no backend (`server.js`)**

Registrar `POST /api/integracoes/consulta-cliente` com validação de documento, rate limiting, simulação e integração com serviços fiscais.

- [ ] **Step 3: Implementar popup modal e integração no frontend (`js/cadastros.js`)**

- Criar `modalConfirmarSerasa(doc, callback)`: exibe caixa de diálogo moderna perguntando se deseja incluir consulta de crédito no Serasa.
- Criar `executarConsultaCliente(doc, incluirSerasa)`: dispara requisição para a API, exibe indicador de carregamento e popula automaticamente os campos do formulário `rc`: `nome`, `fantasia`, `ie`, `cep`, `endereco`, `bairro`, `cidade`, `uf`, `fone`.
- Vincular ao botão "Consultar" e ao evento `change`/`blur` do campo `doc_cli`.

- [ ] **Step 4: Executar teste automatizado e validar**

Run: `node --require ./scripts/test-preload.cjs --test tests/consulta_cliente_api.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server.js js/cadastros.js js/app.js tests/consulta_cliente_api.test.cjs
git commit -m "feat(integracoes): consulta cadastral de clientes via api com modal opcional serasa e preenchimento automatico"
```

---

### Task 5: Validação de Jornadas E2E no Navegador com `agent-browser` em Servidor Isolado

**Files:**
- Create: `scripts/run_agent_browser_verified.cjs`
- Output: `docs/evidencias/agent-browser-verified.log`

**Interfaces:**
- Consumes: Servidor próprio temporário iniciado pelo script em porta dinâmica com banco SQLite isolado em `os.tmpdir()`.
- Produces: Execução verificada das 5 jornadas principais:
  1. Cadastro de cliente (com caracteres acentuados) e veículo.
  2. Abertura de OS e inclusão de itens com valores monetários.
  3. Consulta e visualização por perfil Mecânico (comprovando ausência de dados financeiros).
  4. Orçamento, transições de status e encerramento.
  5. Configuração do assistente de voz e persistência após recarregamento da página.

- [ ] **Step 1: Criar `scripts/run_agent_browser_verified.cjs` com asserções estritas e servidor dedicado**

O script deve:
- Alocar porta dinâmica livre e iniciar `server.js` em ambiente temporário.
- Aguardar `/ready` com sucesso antes de abrir o navegador.
- Interagir através do CLI `agent-browser` checando o código de saída e assertando textos específicos na árvore do snapshot a cada etapa.
- Registrar o log completo em `docs/evidencias/agent-browser-verified.log`.
- Encerrar o servidor e desalocar arquivos temporários no encerramento.

- [ ] **Step 2: Executar auditoria E2E no navegador**

Run: `node scripts/run_agent_browser_verified.cjs`
Expected: Todas as 5 jornadas concluídas com sucesso e evidências registradas.

- [ ] **Step 3: Commit**

```bash
git add scripts/run_agent_browser_verified.cjs docs/evidencias/agent-browser-verified.log
git commit -m "test(e2e): validacao de jornadas completas no navegador via agent-browser com servidor isolado"
```

---

### Task 6: Execução da Suíte Completa e Emissão do Parecer Técnico de Prontidão

**Files:**
- Modify: `docs/evidencias/testes-completos-execucao.txt`
- Create: `docs/evidencias/parecer-prontidao-final.md`

- [ ] **Step 1: Executar suíte completa de testes (`npm test`)**

Run: `npm test`
Expected: 440+ testes, 0 falhas, exit code 0.

- [ ] **Step 2: Atualizar registros de evidências e gerar Parecer Técnico de Prontidão**

Gerar tabela detalhada por achado:
`causa-raiz → correção → teste → evidência → estado`.
Classificar os níveis de prontidão (A, B, C, D, E) com transparência sobre riscos residuais e integrações externas.

- [ ] **Step 3: Commit final**

```bash
git add docs/evidencias/
git commit -m "docs: parecer tecnico de prontidao e consolidacao final de evidencias"
```
