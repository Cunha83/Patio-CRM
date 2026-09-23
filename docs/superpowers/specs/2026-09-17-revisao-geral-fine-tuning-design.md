# Especificação de Design: Homologação Funcional, RBAC Server-Side, Contrato Monetário e Consulta de Clientes (Sintegra/Serasa)

**Data:** 2026-09-17  
**Status:** Em Execução / Aprovado  
**Escopo:**
1. Blindagem server-side contra exposição financeira para o papel `mecanico` em todas as rotas e projeções de estado.
2. Reconciliação do contrato monetário (pt-BR localizado, numérico canônico e formatação visual).
3. Nova funcionalidade: Consulta de Cliente via API (Sintegra com popup opcional para Serasa) integrada ao formulário de cadastros.
4. Estabilização do harness de testes HTTP (eliminação de ECONNREFUSED e desalocação limpa de processos/recursos).
5. Nova suíte de testes de navegação e validação de jornadas com `agent-browser` em servidor isolado.
6. Parecer de saída com evidências formais e categorização de prontidão.

---

## 1. Matriz de Exposição Financeira & RBAC no Servidor

### A. Diagnóstico da Vulnerabilidade Anterior
Anteriormente, a função `filterStateByRole` em `lib/repository/stateRepository.js` limpava as coleções `financeiro`, `contas`, `movimentos` e `caixa`, mas preservava integralmente o array `os[]`, expondo:
- `o.total`
- `o.desc`
- `o.servicos[].valor`
- `o.servicos[].custo`
- `o.pecas[].valor`
- `o.pecas[].custo`
- `o.pecas[].venda`
- `o.orcamento` / `o.orcamentos`
- `o.itens[].valor`

Embora o frontend ocultasse elementos visualmente, qualquer mecânico inspecionando o payload JSON em `GET /api/estado` ou chamando rotas de OS diretamente tinha acesso a preços, custos e margens da oficina.

### B. Matriz de Projeção de Campos por Permissão
| Campo / Objeto | `financial:read` / Gestor / Admin | `mecanico` (sem permissão financeira) |
| :--- | :---: | :---: |
| `os[].id`, `num`, `placa`, `vei`, `cli`, `box`, `st`, `queixa`, `abertura`, `prev` | ✅ Permitido | ✅ Permitido |
| `os[].servicos[].id`, `nome`, `qtd`, `tempoMin`, `concluido`, `mecanico` | ✅ Permitido | ✅ Permitido |
| `os[].servicos[].valor`, `custo`, `subtotal` | ✅ Permitido | ❌ **Omitido (undefined)** |
| `os[].pecas[].id`, `nome`, `codigo`, `qtd`, `localizacao`, `aplicado` | ✅ Permitido | ✅ Permitido |
| `os[].pecas[].valor`, `custo`, `venda`, `margem`, `subtotal` | ✅ Permitido | ❌ **Omitido (undefined)** |
| `os[].total`, `desc`, `desconto`, `totalServicos`, `totalPecas` | ✅ Permitido | ❌ **Omitido (undefined)** |
| `os[].orcamento`, `o.faturamento`, `o.contasReceber` | ✅ Permitido | ❌ **Omitido (undefined)** |
| `estoque[].custo`, `venda`, `margem` | ✅ Permitido | ❌ **Omitido (undefined)** |
| `suppliers`, `purchaseOrders`, `purchaseQuotes` | ✅ Permitido | ❌ **Array vazio `[]`** |
| `financeiro`, `contas`, `movimentos`, `caixa` | ✅ Permitido | ❌ **Zerado / Array vazio `[]`** |

### C. Reconciliação Segura na Gravação (`persistState`)
Quando um mecânico submete uma atualização de estado (ex: alterando `st` de uma OS ou marcando um serviço como concluído), o payload enviado não possui os campos financeiros omitidos.
A função `persistState` não deve sobrescrever os campos financeiros existentes no banco com `undefined` ou `0`. Ela deve mesclar cirurgicamente os dados operacionais modificados pelo mecânico (`st`, `box`, `checklist`, `servicos[].concluido`) preservando os valores monetários originais salvos anteriormente por perfis autorizados.

---

## 2. Contrato Monetário Preciso

### A. Três Contratos Distintos
1. **Entrada Localizada Brasileira (`pt-BR`):**
   - `"1.250,50"` → `1250.50`
   - `"1.250.000,00"` → `1250000.00`
   - `"1.250.000"` (três dígitos após ponto de milhar, sem vírgula) → `1250000.00`
   - `"1.250"` → Em contexto monetário pt-BR estrito, se há apenas um ponto e três dígitos sem vírgula, representa milhar (`1250.00`). Caso haja vírgula (`"1,25"` ou `"1,250"`), a vírgula é o separador decimal.
   - `"1250.50"` → Formato numérico canônico com ponto decimal: aceito apenas quando não houver vírgulas e houver exatamente 1 ponto seguido de 1 ou 2 dígitos decimais.
   - Entradas com múltiplos pontos que não sejam separadores de milhar válidos são rejeitadas.
2. **Valor Numérico Canônico da API:**
   - Tipos numéricos (`typeof val === 'number'`): deve ser `Number.isFinite(val)`.
   - Rejeição estrita: booleanos (`false`/`true`), arrays (`[]`, `[10]`), objetos (`{}`), strings vazias ou só espaços.
   - Operações de negócio: Quando inválido, lançar exceção ou retornar erro sem assumir silenciosamente `0`.
3. **Formatação para Exibição:**
   - `formatBRL(val)`: Converte para string `R$ 1.250,50`. Em caso de valor ausente/inválido em renderização visual, fallback explícito para `R$ 0,00` demarcado.

---

## 3. Consulta de Cliente via API (Sintegra & Serasa)

### A. Fluxo de Interação no Cadastro
1. No formulário de clientes (`js/cadastros.js`), ao preencher o campo `doc_cli` (CPF ou CNPJ) ou clicar no botão "Consultar":
2. O sistema exibe um pop-up modal:
   ```text
   +-------------------------------------------------------------+
   |                Consulta Cadastral de Cliente                |
   |                                                             |
   |  Deseja consultar também a situação de crédito no SERASA?   |
   |                                                             |
   |  [ Sim, consultar Sintegra + Serasa ]   [ Não, apenas Sintegra ]
   |                        [ Cancelar ]                         |
   +-------------------------------------------------------------+
   ```
3. **Ação "Sim"**: Chama o endpoint `/api/integracoes/consulta-cliente` com `{ doc, incluirSerasa: true }`.
4. **Ação "Não"**: Chama o endpoint `/api/integracoes/consulta-cliente` com `{ doc, incluirSerasa: false }`.
5. **Preenchimento Automático dos Campos**:
   - `nome` (Razão Social / Nome)
   - `fantasia` (Nome Fantasia)
   - `ie` (Inscrição Estadual)
   - `cep`
   - `endereco` (Logradouro e número)
   - `bairro`
   - `cidade`
   - `uf`
   - `fone` (Telefone comercial)
   - Se Serasa consultado: exibe a tag de Score Serasa (`Score: 780 ✔️ Baixo Risco`).

### B. Endpoint no Backend (`server.js`)
- `POST /api/integracoes/consulta-cliente`
- Headers: `Authorization: Basic ...` ou `x-api-key`, `x-tenant-id`.
- Permissões: `clients:create`, `clients:edit` ou `admin:settings`.
- Implementa mock resiliente e compatibilidade com APIs externas (ReceitaWS/APIBrasil/Sintegra) com fallback seguro caso offline.

---

## 4. Estabilização do Test Harness HTTP

### A. Diagnóstico do `ECONNREFUSED`
No teste `tests/server_endpoints_finetune.test.cjs`:
- O loop de pooling não aguardava confirmação inequívoca de status HTTP 200 em `/ready`.
- Se o processo demorasse mais de 15s ou houvesse colisão na porta, o loop saía silenciosamente e o primeiro `fetch` tomava `ECONNREFUSED`.
- O encerramento no `t.after` não aguardava a saída efetiva do processo Node, tentando deletar arquivos travados pelo SQLite no Windows (`EBUSY`/`EPERM`).

### B. Padrão Seguro de Harness:
```javascript
const child = spawn(process.execPath, ['server.js'], { ... });
child.on('error', err => { spawnError = err; });

let ready = false;
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  if (child.exitCode !== null) throw new Error('Servidor encerrou prematuramente: ' + childLogs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ready`);
    if (res.status === 200) { ready = true; break; }
  } catch (_) {}
  await new Promise(r => setTimeout(r, 100));
}
if (!ready) throw new Error('Servidor não atingiu readiness no tempo limite. Logs: ' + childLogs);
```
No teardown:
```javascript
t.after(async () => {
  child.kill();
  await once(child, 'exit').catch(() => {});
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
});
```

---

## 5. Auditoria de Navegador Confiável via `agent-browser`

- Criação do script `scripts/run_agent_browser_verified.cjs`.
- Execução contra servidor temporário isolado (porta dinâmica, sem tocar no banco de produção).
- Validação de 5 jornadas completas com asserções observáveis no DOM.
