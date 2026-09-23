# Procedimento Operacional: Identificação e Auditoria de Dados Fictícios Residuais

**Finalidade:** Identificar registros de clientes no banco de dados operacional que possam ter recebido campos gerados pelas fórmulas sintéticas (seeds de documento) anteriores à implementação de indisponibilidade segura, preservando a privacidade e a rastreabilidade dos dados legítimos.

---

## 1. Campos e Assinaturas Fictícias Anteriores

Na implementação anterior, cadastros submetidos à consulta geravam:
1. `scoreSerasa`: valores inteiros gerados por `400 + (seed % 550)` ou `380 + (seed % 580)`.
2. `consultaSerasaRealizada`: `true` gravado sem protocolo de birô oficial.
3. `ie`: Inscrições calculadas aritmeticamente por `String(100000000 + (seed * 87654) % 899999999)`.
4. `endereco`: `"Rodovia Santos Dumont, KM 68"` ou `"Rua das Flores, ..."`.

---

## 2. Procedimento de Consulta e Levantamento (Somente Leitura)

O script abaixo deve ser executado pelo administrador para inspecionar os clientes sem alterar dados:

```bash
# Execução de auditoria em modo somente leitura (Node.js)
node -e "
const { initDB, get, all } = require('./db');
(async () => {
  await initDB();
  const rows = await all('SELECT key, value FROM kv WHERE key LIKE \"tenant:%:state\" OR key = \"state\"');
  for (const row of rows) {
    try {
      const state = JSON.parse(row.value);
      const clientes = state.clientes || [];
      const suspeitos = clientes.filter(c => 
        c.scoreSerasa || 
        c.consultaSerasaRealizada || 
        c.endereco === 'Rodovia Santos Dumont, KM 68'
      );
      if (suspeitos.length > 0) {
        console.log(\`[AUDITORIA] Tenant: \${row.key} possui \${suspeitos.length} clientes com dados presumidos/fictícios.\`);
        suspeitos.forEach(s => console.log(\`  - ID: \${s.id} | Doc: \${s.doc} | Score: \${s.scoreSerasa}\`));
      }
    } catch (_) {}
  }
})();
"
```

---

## 3. Protocolo de Saneamento Não-Destrutivo

Caso sejam identificados registros com dados fictícios:
1. **Preservação**: **NUNCA** apagar o registro do cliente, pois ele pode estar vinculado a Ordens de Serviço históricas, notas fiscais ou frotas.
2. **Saneamento Cirúrgico**:
   - Definir `scoreSerasa = null` e `situacaoSerasa = null`.
   - Definir `consultaSerasaRealizada = false`.
   - Manter documento (CPF/CNPJ), Razão Social, telefone e demais campos digitados manualmente.
3. **Auditoria**:
   - Registrar no `security_audit_log` o evento `CLIENT_AUDIT_PURGE_FICTITIOUS_FIELDS` com o `actorId` do operador responsável.
