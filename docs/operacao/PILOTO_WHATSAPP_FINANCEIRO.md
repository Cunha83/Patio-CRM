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
