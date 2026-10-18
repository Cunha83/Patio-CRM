# Guia Operacional: Piloto WhatsApp Financeiro

Este guia descreve os passos práticos para configuração, ativação segura, operação e contingência do agente financeiro e relatórios via WhatsApp no ambiente de piloto do **Pátio CRM**.

---

## 1. Variáveis de Ambiente (.env)

Para operar o WhatsApp em produção/piloto mantendo a emissão fiscal (SEFAZ/Focus NFe) isolada/desligada:

```env
# Manter integrações ativas no servidor, mas WhatsApp controlado especificamente
DISABLE_INTEGRATIONS=false
DISABLE_WHATSAPP=false

# Fiscal desligado ou em modo homologação/não configurado (nunca emite SEFAZ real em piloto)
FISCAL_PROVIDER=nao_configurado

# Horário e parâmetros do envio matinal
HORA_RELATORIO_DIARIO=07:30
ENVIO_AUTOMATICO_RELATORIO=true
RELATORIO_APENAS_DIAS_UTEIS=false

# Números admin globais de fallback (DDI 55 + DDD + Número sem espaços/máscaras)
WHATSAPP_ADMIN_NUMBERS=5511999990001
```

---

## 2. Cadastro de Administradores e Limites de Lançamento

Apenas usuários com perfil **Dono** (`dono` ou `tenant_admin`) podem autorizar números para comandos e alterar limites de valor.

### Configurar via API (`POST /api/whatsapp/config-relatorio`)
```bash
curl -X POST http://localhost:3000/api/whatsapp/config-relatorio \
  -H "Authorization: Bearer <TOKEN_JWT_DONO>" \
  -H "x-tenant-id: oficina_piloto" \
  -H "Content-Type: application/json" \
  -d '{
    "adminFones": ["5511999990001", "5511988880002"],
    "comandosFinanceirosEscrita": true,
    "limiteValorLancamentoWhatsapp": 1000.00,
    "avisarCaixaWhatsapp": true,
    "horaRelatorio": "07:30",
    "envioAutomatico": true
  }'
```

- **Whitelist (`adminFones`)**: Somente estes números conseguem consultar saldos ou operar caixa. Números desconhecidos recebem resposta neutra sem vazar informações.
- **Limite (`limiteValorLancamentoWhatsapp`)**: Padrão R$ 1.000,00 por lançamento. Valores acima são sumariamente recusados pelo bot antes de pedir confirmação.
- **Áudio / Voz**: Comandos de escrita financeira e confirmações enviadas por áudio são bloqueados pelo servidor; o agente orienta a digitar.

---

## 3. Fluxo de Confirmação e Idempotência

1. O operador envia texto (ex: `Lançar saída 150 peças`).
2. O agente responde com resumo e solicita a palavra exata `CONFIRMAR`.
3. Validade: **2 minutos**. Qualquer outra resposta cancela a operação.
4. Idempotência durável: toda mensagem possui chave única armazenada em SQLite KV por tenant com TTL de 24h, impedindo reexecuções por reentrega de rede.

---

## 4. Procedimentos de Kill Switch (Contingência)

Se ocorrer qualquer anomalia operacional durante o piloto, utilize um dos níveis de corte:

### Nível 1: Desligar Apenas a Escrita Financeira (Mantém Leitura e Relatório Diário)
Via API pelo Dono:
```json
{ "comandosFinanceirosEscrita": false }
```
O agente responderá a qualquer tentativa de movimentação que as operações de escrita estão temporariamente suspensas.

### Nível 2: Desligar Todo o WhatsApp Imediatamente
1. No arquivo `.env`, altere:
   ```env
   DISABLE_WHATSAPP=true
   ```
2. Reinicie a aplicação (`pm2 restart patio-crm` ou serviço Windows correspondente).
3. O servidor continuará funcionando normalmente para o sistema Web, e o agendador ignorará envios em silêncio.

---

## 5. Rotina de Backup Obrigatório

Antes de iniciar o piloto com lançamentos financeiros via WhatsApp, execute o snapshot/backup do banco SQLite:

1. **Via Rota de Backup WAL**:
   ```bash
   curl -X POST http://localhost:3000/api/backup/executar-wal \
     -H "Authorization: Bearer <TOKEN_JWT_DONO>"
   ```
2. **Cópia Manual do Arquivo**:
   Certifique-se de que o checkpoint de WAL foi concluído e copie `patio.db` para um diretório seguro externo antes de liberar a whitelist para a equipe.

---

## 6. Roteiro Passo a Passo de Smoke Test e Go-Live do Piloto

Este checklist formal deve ser executado no ambiente de homologação/host real antes de liberar a interação para a equipe da oficina.

### A. Checklist Pré-Voo (Ambiente e Configurações)

1. **Variáveis de Ambiente (`.env`)**:
   - `PORT`: Porta padrão configurada (ex: `3000`).
   - `DATA_DIR`: Caminho com permissão de leitura/escrita para banco SQLite e logs.
   - `DISABLE_INTEGRATIONS=false` e `DISABLE_WHATSAPP=false`.
   - `FISCAL_PROVIDER=nao_configurado` (garante que emissão SEFAZ/Focus NFe permaneça bloqueada).
   - `WHATSAPP_ADMIN_NUMBERS`: Telefone do gestor no padrão DDI 55 + DDD + Número (ex: `5511999990001`).

2. **Integridade da Base SQLite & KV Store**:
   - Verifique que o banco `patio.db` foi inicializado e possui as tabelas `security_audit_log` e `kv_store` (responsável pelo TTL de idempotência).
   - Teste de conexão: `sqlite3 patio.db "SELECT count(*) FROM users;"`.

3. **Conferência das Flags do Tenant**:
   - `adminFones`: Telefones autorizados cadastrados no tenant.
   - `comandosFinanceirosEscrita`: `true` (ativado para o piloto controlado).
   - `limiteValorLancamentoWhatsapp`: Limite nominal por lançamento (padrão R$ 1.000,00).
   - `avisarCaixaWhatsapp`: `true` para receber confirmação de abertura/fechamento no grupo admin.

---

### B. Bateria de 5 Passos de Smoke Test em Host Real

Realize os 5 passos na ordem estrita abaixo antes de anunciar o Go-Live:

#### Passo 1: Isolamento de Número Desconhecido (Fail-Closed)
- **Ação**: A partir de um telefone pessoal ou número NÃO cadastrado em `adminFones`, envie a mensagem `saldo` ou `abrir caixa`.
- **Comportamento Esperado**: O bot responde com a mensagem institucional neutra:
  > *"Olá! Sou o assistente do Pátio CRM. No momento, o atendimento automatizado está disponível apenas para motoristas e clientes com veículos em serviço ou administradores autorizados..."*
- **Critério de Sucesso**: Nenhum centavo ou dado de caixa é revelado. No banco, o evento é registrado como `recusado_nao_autorizado` na `security_audit_log`.

#### Passo 2: Leitura com Resolução de 9º Dígito e JID
- **Ação**: A partir do número do Dono/Admin cadastrado na whitelist (teste com e sem o 9º dígito se disponível), envie `!caixa` ou `saldo`.
- **Comportamento Esperado**: O bot reconhece o remetente e retorna a mensagem estruturada com a *Posição Financeira*:
  > *"💰 POSIÇÃO FINANCEIRA DO CAIXA... Saldo Atual em Caixa: R$ X,XX..."*
- **Critério de Sucesso**: Resumo financeiro retornado perfeitamente e auditoria gravada com `sucesso`.

#### Passo 3: Bloqueio Preventivo de Limite de Valor
- **Ação**: A partir do número admin, envie uma instrução com valor superior ao teto configurado (ex: `lançar saída de R$ 1.500,00 referente a compra de peças`).
- **Comportamento Esperado**: O agente recusa a operação **imediatamente**, sem solicitar confirmação:
  > *"🔒 Limite Excedido: O valor solicitado de R$ 1.500,00 ultrapassa o teto máximo permitido via WhatsApp (R$ 1.000,00). Por favor, realize movimentações deste porte diretamente pelo Pátio CRM Web."*
- **Critério de Sucesso**: Nenhuma confirmação é aberta e a auditoria é registrada com `negado_limite`.

#### Passo 4: Ciclo Completo de Escrita com Confirmação e Idempotência
- **Ação**:
  1. Envie comando dentro do limite: `lançar entrada de R$ 120,00 referente a adiantamento OS 101`.
  2. O bot deve responder com o resumo: Ação (*Lançar Entrada*), Valor (*R$ 120,00*) e Descrição (*adiantamento OS 101*), solicitando `CONFIRMAR` ou `SIM` em até 2 minutos.
  3. Envie exatamente `CONFIRMAR` ou `SIM`.
- **Comportamento Esperado**: O bot responde:
  > *"✅ Entrada Registrada com Sucesso! • Valor: R$ 120,00 • Turno: #X..."*
- **Critério de Sucesso**:
  - Saldo em caixa atualizado imediatamente.
  - Movimentação no estado com metadados: `origem: 'whatsapp'`, `autorNumero` e `confirmadoEm`.
  - Reenvio da mesma mensagem ou reentrega não duplica o lançamento (idempotência no SQLite KV).

#### Passo 5: Resiliência, Timeout e Cancelamento Seguro
- **Ação**:
  1. Envie um comando de escrita: `lançar saída de R$ 45,00 lanche`.
  2. Quando o bot solicitar a confirmação, envie `cancelar`, `não` ou aguarde mais de 2 minutos antes de responder.
- **Comportamento Esperado**: O bot confirma o cancelamento da operação (ou notifica expiração do prazo de 2 minutos).
- **Critério de Sucesso**: O valor **não** é debitado do caixa e a pendência é purgada da memória.

---

### C. Monitoramento e Rollback Operacional em Produção

1. **Auditoria em Tempo Real**:
   Para acompanhar as ações financeiras disparadas via WhatsApp diretamente no SQLite:
   ```bash
   sqlite3 patio.db "SELECT timestamp, actor_id, action, details_json FROM security_audit_log WHERE actor_id LIKE 'whatsapp:%' ORDER BY id DESC LIMIT 20;"
   ```

2. **Rollback Cirúrgico Imediato (Kill Switch de Escrita)**:
   Se for detectado qualquer comportamento imprevisto pela equipe em campo, o Dono pode desativar a escrita em tempo real via API, mantendo o WhatsApp ativo para leitura, consultas e relatórios matinais:
   ```bash
   curl -X POST http://localhost:3000/api/whatsapp/config-relatorio \
     -H "Authorization: Bearer <TOKEN_JWT_DONO>" \
     -H "Content-Type: application/json" \
     -d '{"comandosFinanceirosEscrita": false}'
   ```
   *Efeito*: Movimentações de escrita respondem imediatamente que estão suspensas, sem necessidade de reiniciar o processo Node.js ou interromper o atendimento aos clientes.
