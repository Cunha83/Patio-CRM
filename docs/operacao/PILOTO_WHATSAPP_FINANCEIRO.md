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

---

## 7. Rastreabilidade de Origem e Rotina de Estorno Contábil Auditado

Para garantir conformidade com boas práticas fiscais e auditoria interna na operação híbrida (WhatsApp + Painel Web), o sistema conta com rastreabilidade de ponta a ponta e rotina de estorno imutável.

### A. Metadados de Origem e Visualização no Painel Web

1. **Selo de Identificação de Canal**:
   - Cada movimentação registrada via bot do WhatsApp recebe metadados gravados de forma permanente:
     * `origem: 'whatsapp'`
     * `canal: 'whatsapp'`
     * `autorNumero`: Número telefônico normalizado do administrador que confirmou a operação.
     * `confirmadoEm`: Carimbo de data/hora ISO da confirmação explícita.
   - Na interface web (abas **Dashboard Executivo**, **Fluxo de Caixa** e **Verônica Analista**):
     * Lançamentos do WhatsApp exibem o selo verde `📱 WhatsApp` acompanhado do telefone autorizador e horário.
     * Lançamentos realizados diretamente pelo sistema web exibem o selo neutro `💻 Painel Web`.

2. **Filtro Rápido por Origem**:
   - No extrato da aba **Fluxo de Caixa**, o usuário pode filtrar instantaneamente por canal:
     * `Todas as Origens`
     * `📱 WhatsApp` (somente movimentações criadas via bot)
     * `💻 Painel Web` (somente movimentações criadas via sistema web)
     * `⚠️ Estornados` (apenas lançamentos cancelados contabilmente)

3. **Consolidação nos KPIs e Dashboard Executivo**:
   - A barra de auditoria de origem no Dashboard resume o volume financeiro e quantidade de lançamentos por canal no período selecionado (`resumoOrigem`), alertando sobre eventuais estornos ocorridos.

---

### B. Rotina de Estorno Contábil Auditado (Imutabilidade e Segurança)

Caso um lançamento seja realizado por engano via WhatsApp ou Web (ex.: valor digitado errado ou duplicidade de rede), a operação deve ser revertida através da rotina de estorno contábil.

1. **Princípio da Imutabilidade Contábil**:
   - O registro original **nunca é apagado** do banco de dados ou do extrato.
   - O lançamento original é marcado com:
     * `estornado: true`
     * `estornadoEm: <timestamp ISO>`
     * `estornadoPor: <identificador do Dono>`
     * `motivoEstorno: <justificativa obrigatória, mín. 3 caracteres>`
   - O sistema gera automaticamente um **movimento compensatório inverso** de mesmo valor (se entrada -> saída; se saída -> entrada) vinculado pelo campo `estornoDeId`, recompondo o saldo do caixa ativo com exatidão matemática.

2. **Regras de Acesso e RBAC**:
   - **Exclusividade do Dono/Admin**: Somente usuários com perfil administrativo superior (`dono`, `tenant_admin`, `owner`, `platform_admin`, `admin`) têm permissão para estornar.
   - Perfis operacionais (`mecanico`, `atendente`) recebem `403 Forbidden` ao tentar estornar.

3. **Travas de Idempotência e Integridade**:
   - **Bloqueio de Duplo Estorno**: Se o lançamento já estiver com `estornado: true`, novas tentativas retornam `409 Conflict`.
   - **Bloqueio de Estorno Compensatório**: Lançamentos que já são compensações (`estornoDeId` presente) não podem ser estornados diretamente (`400 Bad Request`).

4. **Trilha de Auditoria no SQLite (`security_audit_log`)**:
   - Toda operação de estorno é gravada no banco:
     * `financeiro:movimento:estornar`: Estorno autorizado, registrando operador, ID do lançamento original, valor e justificativa.
     * `financeiro:movimento:estorno_negado`: Tentativas não autorizadas bloqueadas por perfil.

5. **Como Executar o Estorno**:
   - **Via Painel Web**:
     1. Na aba **Fluxo de Caixa** ou **Verônica Analista**, localize o lançamento ativo e clique em `↩️ Estornar`.
     2. No modal de confirmação, digite o motivo obrigatório (ex.: *"Lançamento digitado em duplicidade"*).
     3. Clique em **Confirmar Estorno**. O saldo do caixa é recalculado na hora e a linha original passa a ser exibida como estornada (tachada com o motivo visível).
   - **Via API HTTP**:
     ```bash
     curl -X POST http://localhost:3000/api/financeiro/movimentacoes/mv_123/estornar \
       -H "Authorization: Bearer <TOKEN_JWT_DONO>" \
       -H "Content-Type: application/json" \
       -d '{"motivo": "Lançamento incorreto via WhatsApp"}'
     ```

---

## 8. Fechamento Auditado por Origem, Meios de Pagamento e Vinculação de OS/Placa

Para garantir conformidade na conciliação diária de caixas de oficina e oficinas a diesel que operam turnos híbridos, o Pátio-CRM consolida automaticamente as movimentações por canais, meios de pagamento e vínculos operacionais.

### A. Meios de Pagamento Canônicos e Vinculação de OS/Placa
1. **Normalização dos Meios de Pagamento**:
   - Cada movimentação financeira (via bot WhatsApp ou Painel Web) é classificada em um meio canônico:
     * pix: Pagamentos instantâneos via Pix.
     * dinheiro: Espécie e fundo de troco físico.
     * cartao_credito: Cartão de crédito.
     * cartao_debito: Cartão de débito.
     * oleto: Boletos bancários compensados.
     * 	ransferencia: TED/DOC e transferências entre contas.
2. **Vinculação de Ordens de Serviço e Placas**:
   - Comandos de lançamento via WhatsApp aceitam menção a OS e veículo (ex.: lançar entrada de R$ 350,00 referente a adiantamento OS #401 placa ABC1D23 pix).
   - O bot extrai automaticamente osId e placa, repassando-os para a movimentação e exibindo-os com selos temáticos na tabela de extrato web e no mobile.
3. **Consolidação em APIs e Dashboards**:
   - O endpoint GET /api/financeiro/movimentacoes expõe o objeto esumoMeiosPagamento, computando quantidade e volume total por meio financeiro no período filtrado.

### B. Boletim de Fechamento Auditado e Trava de Imutabilidade
1. **Snapshot de Fechamento no Banco de Dados**:
   - Ao encerrar o caixa (echar caixa via WhatsApp ou botão 🔒 Fechar Caixa do Turno no painel web), o objeto echamento armazena:
     * esumoOrigem: Volumes e quantidades de lançamentos WhatsApp vs Web vs Estornos.
     * esumoTextoWhatsapp: Texto pré-formatado pronto para disparo ou compartilhamento nos grupos gerenciais.
     * inanceiro:caixa:fechar: Evento registrado perenemente na tabela security_audit_log.
2. **Trava de Imutabilidade em Caixas Encerrados**:
   - Uma vez fechado o turno, movimentações vinculadas àquele caixa tornam-se estritamente imutáveis.
   - Qualquer tentativa de estorno ou inclusão de novos lançamentos em caixa encerrado é bloqueada imediatamente com status  9 Conflict (CAIXA_JA_FECHADO).
3. **Comandos de Resumo e Fechamento Parcial via WhatsApp**:
   - Envie esumo caixa ou echamento parcial para o bot para visualizar a qualquer momento o boletim de posição parcial do turno atual (com quebra por origem e meios de pagamento).
4. **Visualização e Cópia no Painel Web**:
   - Na aba **Fluxo de Caixa**, utilize o botão **📜 Boletim de Fechamento** para abrir a janela com o texto completo do turno e copiar com 1 clique para o WhatsApp.

---

## 9. Conciliação Financeira de OS, Sangria/Suprimento e Exportação Contábil com Assinatura SHA-256

Para elevar o rigor operacional e atender a auditorias financeiras e contábeis de oficinas mecânicas, o módulo financeiro do Pátio-CRM disponibiliza rotinas avançadas de conciliação por Ordem de Serviço, operações de tesouraria de caixa (sangria e suprimento) e exportação com integridade criptográfica.

### A. Conciliação e Extrato por Ordem de Serviço (OS)
1. **Comando de Leitura via WhatsApp**:
   - Envie `extrato os <numero>` ou `financeiro os <numero>` (ex.: `extrato os 101`).
   - O bot responde instantaneamente com:
     * Status da OS, placa e modelo do veículo;
     * Total orçado, adiantamentos e pagamentos já realizados;
     * Saldo devedor pendente;
     * Detalhamento de cada movimentação vinculada (data, valor, meio de pagamento e canal).
2. **Endpoint HTTP de Conciliação**:
   - `GET /api/financeiro/os/:osId/resumo` (requer permissão `financial:read`).
   - Retorna o sumário financeiro consolidado da OS, indicando `totalPago`, `totalOrcado`, `saldoRestante`, `quitada` e a lista completa de movimentações ativas.

### B. Operações de Sangria e Suprimento de Caixa
1. **Naturezas Operacionais Dedicadas**:
   - **Sangria (Retirada/Despesa)**: Saída de dinheiro em espécie da gaveta de caixa para depósito bancário ou pagamento de despesa extraordinária.
   - **Suprimento (Aporte/Receita)**: Entrada de recursos para reforço ou troco no caixa.
2. **Comandos de Escrita com Confirmação em 2 Etapas via WhatsApp**:
   - `sangria <valor> <motivo>` (ex.: `sangria 250 deposito bancario`).
   - `suprimento <valor> <motivo>` (ex.: `suprimento 100 troco inicial`).
   - O bot valida o saldo disponível em caixa (rejeitando sangrias com valor superior ao saldo atual).
   - Solicita confirmação explícita (`CONFIRMAR`) com TTL de 2 minutos.
3. **Controle de Acesso e Auditoria**:
   - Apenas perfis `dono` e `financeiro` podem operar sangria e suprimento.
   - Rotas dedicadas: `POST /api/financeiro/caixa/sangria` e `POST /api/financeiro/caixa/suprimento`.
   - Eventos auditados no banco: `financeiro:caixa:sangria` e `financeiro:caixa:suprimento`.
   - Boletim de fechamento destaca montantes e quantidades de sangrias e suprimentos do turno.

### C. Exportação Contábil Auditada com Assinatura SHA-256
1. **Formatos Suportados**:
   - **CSV Compatível com Excel**: Inclui marca de ordem de byte UTF-8 (`\uFEFF`) e separador `;` com cabeçalho contábil canônico:
     `ID;DataHora;Tipo;Natureza;Valor;MeioPagamento;Origem;OS;Placa;Autor;StatusEstorno;Descricao`
   - **JSON Estruturado**: Contém metadados de exportação, resumo por origem, consolidação por meios de pagamento e o objeto `integridade` com o hash SHA-256 do payload.
2. **Assinatura e Validação Criptográfica**:
   - O endpoint `GET /api/financeiro/exportar` calcula o hash SHA-256 do arquivo gerado e o envia no cabeçalho HTTP `X-Export-SHA256`.
   - Permite à contabilidade externa conferir se o arquivo baixado foi corrompido ou adulterado.
   - Cada exportação grava evento `financeiro:relatorio:exportar` no log de auditoria permanente.
3. **Filtros Combinados no Painel Web**:
   - No menu **Fluxo de Caixa**, o usuário pode filtrar simultaneamente por **Canal/Origem** (Todos, WhatsApp, Web, Estornados) e **Meio de Pagamento** (Todos, PIX, Dinheiro, Cartão, Boleto).
   - O botão **📥 Exportar CSV Auditado** aciona o download automático respeitando os filtros ativos e confirmando o hash SHA-256 na notificação em tela.

---

## 10. Faturamento a Prazo de OS, Liberação Financeira de Pátio e Agenda de Vencimentos no WhatsApp

Para resolver a fricção operacional entre a finalização mecânica de serviços e a liberação de veículos para entrega, o Pátio-CRM implementa o fluxo integrado de faturamento a prazo, indicadores visuais de liberação de pátio e liquidação de títulos tanto pelo painel web quanto pelo WhatsApp.

### A. Faturamento a Prazo de Saldo de OS e Geração Automática de Títulos
1. **Regra de Faturamento do Saldo Devedor**:
   - Quando um veículo é concluído mas o cliente opta por pagar a prazo (ou quando há adiantamento e saldo restante), o saldo devedor (`saldoRestante = totalOrcado - totalPago`) pode ser faturado em parcelas (1x a 12x).
   - O sistema gera automaticamente os títulos a receber em `contas` com vencimentos escalonados (padrão 30/60/90 dias), arredondamento centesimal exato na primeira parcela e vinculação estrita à OS e cliente.
2. **Endpoint HTTP de Faturamento**:
   - `POST /api/financeiro/os/:osId/faturar` (requer `financial:write` / `financial:manage`).
   - Recebe `parcelas`, `meioPagamento` (`boleto`, `pix`, `promissoria`, `cheque`, `cartao_credito`), `vencimentoInicial` e `observacao`.
   - Grava auditoria contábil `financeiro:os:faturar` na tabela `security_audit_log`.

### B. Badges e Regras de Liberação Física vs Financeira de Pátio
Para evitar liberação indevida de veículos sem quitação ou faturamento formal, a interface visual classifica cada OS em três estados canônicos:
- `🟢 Liberado (Quitado)`: OS com 100% do valor recebido no caixa ativo (`saldoRestante <= 0.01`).
- `🔵 Liberado (Faturado)`: OS cujo saldo pendente está 100% coberto por títulos a receber a prazo (`totalFaturadoPrazo >= saldoRestante`).
- `🟡 Retido (Saldo Pendente)`: OS com saldo pendente não coberto por títulos ou recebimentos (`saldoRestante > 0`).

O badge é renderizado no card de box do Pátio, no modal da Ordem de Serviço e no **Radar de Liberação Financeira de Pátio** (aba Verônica Analista).

### C. Consulta de Vencimentos e Agenda Financeira via WhatsApp
1. **Comandos de Leitura Aceitos**:
   - `vencimentos`, `contas hoje`, `agenda financeira`, `compromissos hoje`, `!vencimentos`, `!contas`.
2. **Detalhamento do Boletim de Vencimentos**:
   - Total e quantidade de títulos a receber hoje.
   - Total e quantidade de contas a pagar hoje.
   - Resultado líquido previsto do dia.
   - Lista detalhada de títulos com seus respectivos identificadores (`#tit_101`, `#cnt_202`) e instruções para baixa direta pelo aplicativo.

### D. Baixa Integrada de Títulos a Pagar e Receber via WhatsApp
1. **Comandos de Baixa Suportados**:
   - `baixar <id> [meio]` (ex.: `baixar tit_101 pix`, `baixar 101 dinheiro`).
   - `pagar conta <id> [meio]` (ex.: `pagar conta cnt_202 dinheiro`).
   - `receber titulo <id> [meio]` (ex.: `receber titulo tit_101 pix`).
2. **Trava de Segurança e Fluxo de Confirmação em 2 Etapas**:
   - O bot localiza o título e confere se não foi liquidado previamente (evitando duplicidade).
   - Valida a existência de um **caixa aberto** no turno atual.
   - Valida o valor contra o teto monetário do WhatsApp (`limiteValorLancamentoWhatsapp`, padrão R$ 1.000,00). Valores superiores exigem liquidação pelo sistema web.
   - Solicita confirmação explícita (`CONFIRMAR` ou `SIM`) com validade de 2 minutos.
3. **Efetivação Contábil e Auditoria**:
   - Ao confirmar, o título é marcado como `pago: true` e `status: 'liquidado'`.
   - Gera a movimentação de caixa integrada (entrada para recebimento, saída para pagamento).
   - Grava auditoria permanente `financeiro:titulo:liquidar` no banco de dados SQLite.

---

## 11. Governança de Pátio, Reabertura Automática de Títulos, DRE e Cobrança Amigável

### A. Trava de Liberação de Pátio e Estados Canônicos de Portaria
Para garantir que nenhum veículo saia da oficina sem quitação, faturamento formal ou consentimento superior explícito, o Pátio-CRM implementa quatro estados canônicos de liberação:
- `🟢 Liberado (Quitado)`: Ordem com 100% do saldo recebido no caixa ativo (`saldoRestante <= 0.01`).
- `🔵 Liberado (Faturado)`: Ordem cujo saldo remanescente está formalizado em títulos a receber a prazo (`totalFaturadoPrazo >= saldoRestante`).
- `🟣 Liberado (Exceção Auditada)`: Ordem retida que recebeu autorização excepcional concedida por perfil superior com justificativa registrada e auditada.
- `🟡 Retido (Saldo Pendente)`: Ordem com pendência financeira em aberto sem cobertura de pagamento ou faturamento. A portaria física e a API bloqueiam a entrega da OS.

### B. Liberação Excepcional Auditada com RBAC (Portaria / WhatsApp / Web)
Quando um cliente necessita retirar o veículo antes da compensação bancária ou do fechamento de faturamento corporativo:
1. **Pela Interface Web**:
   - No Radar de Liberação Financeira ou na folha da OS, clique no botão `🔓 Liberar c/ Justificativa`.
   - Informe a justificativa detalhada (mínimo de 5 caracteres).
   - O sistema aciona `POST /api/financeiro/os/:osId/liberar-saida` exigindo perfil Dono/Admin e registra o evento `financeiro:os:liberar_saida_excepcional` no `security_audit_log`.
2. **Pelo WhatsApp**:
   - O administrador envia: `liberar os <id> <justificativa>` (ex.: `liberar os 901 Autorizado faturamento no dia 25`).
   - O bot exige perfil superior e confirmação em 2 etapas (`CONFIRMAR`), com TTL de 2 minutos.
   - Ao confirmar, a OS é atualizada para `liberado_excepcional` e o veículo é liberado no pátio.

### C. Reabertura Bidirecional Automática de Títulos por Estorno
Para manter estrita consonância entre a tesouraria física e o contas a receber:
- Quando uma movimentação de caixa vinculada à liquidação de um título for estornada (seja pelo botão `Estornar` na web ou pelo comando `estornar ultimo <motivo>` no WhatsApp):
  1. O título correspondente é automaticamente reaberto (`pago: false`, `status: 'aberto'`).
  2. São gravados os metadados `reabertoPorEstornoEm` e `ultimoEstornoId`.
  3. A Ordem de Serviço vinculada tem seu diagnóstico recalculado imediatamente, retornando seu status de liberação de pátio para `liberado_faturado`.
  4. O saldo do caixa do turno é compensado sem quebras de integridade.

### D. Demonstrativo DRE Operacional e Segregação de Tesouraria Neutra
O Demonstrativo de Resultado Operacional (DRE) simplificado do Pátio-CRM isola o desempenho do negócio das movimentações patrimoniais:
- **Expurgos Contábeis**: Suprimentos (aportes de capital/troco) e sangrias (retiradas para depósito bancário/cofre) não afetam o resultado das operações.
- **Métricas Apuradas**:
  - *Receita Operacional Bruta*: Total de entradas operacionais do período.
  - *Despesas Operacionais*: Total de saídas operacionais e custos com peças/serviços.
  - *Lucro/Prejuízo Operacional Líquido*: Receitas operacionais − Despesas operacionais.
  - *Margem Operacional Percentual*: `(Lucro / Receita) * 100`, formatada no padrão brasileiro (`X,X%`).
  - *Movimentação de Tesouraria Neutra*: Total de Suprimentos vs Sangrias e saldo de caixa em custódia.
- **Canais de Consulta**:
  - WhatsApp: Comandos `dre`, `resultado operacional`, `demonstrativo dre`.
  - Web: Card compacto `📊 DRE Operacional (Visão Gerencial)` no painel da Verônica Analista e resumo da API (`GET /api/financeiro/resumo`).

### E. Notificação e Mensagem Pronta de Cobrança Amigável via WhatsApp
Para agilizar o contato com devedores e evitar atritos de cobrança:
- **Pelo WhatsApp**:
  - Envie `cobranca os <id>` ou `aviso vencimento <id>`.
  - O bot retorna o texto completo cordial já formatado com nome do cliente, placa/veículo, valores e chave Pix da oficina para pagamento imediato.
  - Se a OS já estiver quitada, o bot confirma a regularidade e informa que não há saldo devedor.
- **Pela Interface Web**:
  - No Radar de Liberação de Pátio, cada OS com saldo pendente disponibiliza o botão `📲 Copiar Aviso`.
  - O clique copia o texto estruturado para a área de transferência para colagem rápida no chat do cliente.

### F. Controle de Boxes/Valetas de Oficina e Prevenção de Colisão Física
Para gerenciar a ocupação das valetas e boxes de serviços pesados:
- **Estrutura de Boxes**: O pátio conta com boxes identificados (ex.: `BOX-01`, `BOX-02`, etc.) e estados canônicos:
  - `livre`: disponível para receber um novo veículo/OS.
  - `ocupado`: veículo em atendimento mecânico ativo no box.
  - `bloqueado_peca`: veículo aguardando peças/insumos, retendo fisicamente o box.
- **Trava de Colisão Física (`BOX_JA_OCUPADO` / HTTP 409)**:
  - Se um operador tentar alocar uma OS para um box já ocupado por outro veículo ativo, a operação é rejeitada com erro `409` (`BOX_JA_OCUPADO`).
  - Se o veículo já ocupava outro box, a transferência para um novo box libera o box anterior automaticamente.
- **Auditoria SQLite**: Todas as alocações e liberações são registradas em `security_audit_log` (`patio:os:alocar_box` e `patio:os:liberar_box`).

### G. Apontamento de Mecânicos e Comandos de Pátio via WhatsApp (RBAC Chão de Oficina)
Os perfis `mecanico`, `atendente`, `financeiro` e `dono` podem realizar apontamentos diretamente no chão de fábrica via bot do WhatsApp:
- `box <num_box> os <id> [mecanico]` (ex.: `box 2 os 101 Joao`): aloca a OS no box especificado e define o mecânico responsável.
- `iniciar os <id> [box <n>]` (ex.: `iniciar os 101 box 2`): marca a OS como `em_execucao`, define data/hora de início e associa ao box.
- `pausar os <id> <motivo>` (ex.: `pausar os 101 aguardando feixe de mola`): pausa a OS com status `pausado_gargalo` e altera o box para `bloqueado_peca`.
- `finalizar os <id>` ou `pronto os <id>`: conclui a etapa mecânica, define a OS como `pronto_retirada` e desocupa automaticamente o box.
- `gargalos` / `radar patio` / `status boxes`: exibe o resumo completo de boxes (livres, ocupados e bloqueados por peça), a lista de gargalos operacionais e os veículos prontos aguardando liberação financeira.

### H. Radar de Gargalos e Badges Operacionais no Frontend
- **Badges Operacionais**: Exibidos em cards de pátio e na folha da OS:
  - `🏗️ Box 01` (box alocado).
  - `👨‍🔧 João` (mecânico responsável).
  - `⚙️ Em Execução` (trabalho mecânico ativo).
  - `⏸️ GARGALO: <motivo>` (veículo e box parados por peças/fornecedor).
  - `✅ Pronto p/ Retirada` (etapa mecânica finalizada).
  - `🔩 X peça(s)` (peças requisitadas do estoque para a OS).
- **Radar Operacional de Boxes & Gargalos**: Painel superior na visão de pátio consolidando o mapa de boxes, contadores em tempo real e avisos rápidos de gargalos operacionais e veículos retidos financeiramente.

### I. Controle de Estoque, Requisição de Peças na OS e Desbloqueio Automático de Gargalos
Para integrar a operação de almoxarifado ao chão de oficina e eliminar paradas ocultas:
- **Catálogo de Peças e Alerta de Estoque Mínimo**:
  - Cada item possui saldo físico (`quantidade`), nível de segurança (`estoqueMinimo`), custo e preço de venda.
  - Alerta automático `⚠️ CRÍTICO` é acionado quando `quantidade <= estoqueMinimo`.
- **Trava de Estoque Insuficiente (`ESTOQUE_INSUFICIENTE` / HTTP 409)**:
  - A requisição de peças na OS valida o saldo disponível no almoxarifado. Se a quantidade solicitada exceder o estoque, a operação é rejeitada com código `409` impedindo furos de estoque.
  - Toda requisição bem-sucedida abate o saldo da peça, calcula o subtotal e atualiza `os.totalPecas` e `os.pecasUtilizadas`.
- **Comandos de Almoxarifado via WhatsApp**:
  - `estoque [termo]` ou `consultar peca <termo>`: consulta rápida de peças com saldo e alertas críticos.
  - `peca os <osId> <qtd> <nome_ou_codigo>` (ex.: `peca os 101 2 MOL-01`): requisita a peça diretamente para a OS, debitando o estoque.
  - `chegou peca os <osId> [obs]` ou `retomar os <osId>`: desbloqueia o gargalo, muda a OS de `pausado_gargalo` para `em_execucao`, limpa a justificativa de parada e restaura o status do box de `bloqueado_peca` para `ocupado`.
- **Ações Rápidas no Frontend**:
  - Cards de OS exibem o botão `▶️ Retomar / Peça Chegou` para destravar veículos pausados por peças com 1 clique.
  - Botão `🔩 +Peça` permite requisição imediata direto da visão de pátio ou folha da OS.
  - Todas as movimentações geram trilha de auditoria em SQLite (`patio:os:requisitar_peca` e `patio:os:liberar_gargalo_peca`).

---

## 12. Reabertura Bidirecional de Títulos/Peças, DRE Operacional e Aviso ao Cliente

### A. Reabertura Bidirecional de Títulos e Devolução de Peças ao Estoque
A operação mecânica e financeira agora mantém integridade bidirecional completa:
1. **Sincronia Caixa <-> Títulos Liquidados**:
   - Ao estornar um movimento de caixa associado à liquidação de um título, o título é reaberto para status `pendente` (`pago: false`), preenchendo os metadados de auditoria `reabertoPorEstornoEm` e `ultimoEstornoId`.
   - O saldo em aberto da Ordem de Serviço vinculada é imediatamente recalculado, atualizando seu status de liberação de pátio na portaria.
2. **Devolução / Estorno de Peças da OS**:
   - Permite cancelar ou devolver itens requisitados incorretamente para uma OS sem distorções no estoque ou na cobrança.
   - Pelo WhatsApp: `devolver peca os <id> <nome_ou_codigo>` (ex.: `devolver peca os 101 MOL-01`).
   - Pela API: `POST /api/financeiro/os/:osId/estornar-peca`.
   - O saldo da peça é recomposto no almoxarifado (`quantidade += qtdDevolvida`), a lista `os.pecasUtilizadas` é atualizada e o valor de `os.totalPecas` é rebaixado proporcionalmente, registrando o evento `patio:os:estornar_peca` no `security_audit_log`.

### B. Demonstrativo DRE Operacional Integrado (Gestão Segregada)
O novo DRE operacional (`calcularDREOperacional`) reflete a performance pura da oficina sem distorções:
1. **Segregação de Tesouraria Neutra**:
   - Aportes de capital/troco (`suprimento`) e retiradas para cofre ou depósito (`sangria`) são isolados em seção própria ("Tesouraria Neutra") e **não afetam** o cálculo do lucro operacional líquido nem a margem percentual.
2. **Custo de Peças em OSs Ativas**:
   - Computa o montante total de peças alocadas em Ordens de Serviço em execução no pátio (`custoPecasAplicadasOS`), permitindo apuração precisa do capital em trânsito operacional.
3. **Canais de Acesso**:
   - **API**: `GET /api/financeiro/dre` e enriquecimento de `GET /api/financeiro/resumo`.
   - **WhatsApp**: Comandos `dre` ou `resultado operacional` para administradores autorizados.
   - **Web**: Card gerencial `📊 DRE Operacional (Visão Gerencial)` no painel da Verônica Analista com indicadores de receita, despesas, peças aplicadas, resultado operacional líquido, margem percentual e tesouraria neutra.

### C. Aviso Estruturado de Cobrança / Retirada ao Cliente
Facilita o atendimento ao cliente e a liberação física dos veículos na portaria:
1. **Comunicação Padronizada via WhatsApp**:
   - Comando: `aviso retirada os <id>` ou `cobranca os <id>`.
   - Retorna mensagem estruturada e personalizada contendo: identificação da OS e da oficina, modelo do caminhão, placa, total orçado, total de peças aplicadas, total pago/adiantado, saldo pendente, chave Pix para quitação e status de liberação na portaria (Quitado, Faturado, Excepcional ou Retido).
2. **Ação Rápida no Pátio Web**:
   - Os cards de OS em exibição no pátio e na folha da OS contam com o botão `📲 Copiar Aviso` (`data-act="copiar-aviso-os"`).
   - O clique requisita os dados consolidados da rota `GET /api/financeiro/os/:osId/aviso-cliente` e copia o texto completo para a área de transferência do usuário, pronto para envio no WhatsApp do cliente com um único clique.

---

## 13. Checklist Técnico Pesado (Suspensão & Freios), Trava de Qualidade e Laudo de Vistoria

### A. Os 5 Itens Canônicos do Checklist Técnico de Linha Pesada
Para garantir segurança mecânica impecável antes da entrega e rodagem de cavalos mecânicos e implementos rodoviários, cada Ordem de Serviço possui uma rotina de vistoria padronizada composta por 5 itens obrigatórios:
1. `grampos_feixe_molas`: Torque e reaperto de grampos, molas mestras e feixe de molas.
2. `pino_centro_alinhamento`: Verificação de integridade do pino de centro e alinhamento do eixo.
3. `embuchamento_balanca`: Inspeção de folgas críticas em embuchamentos, braços tensores e balança.
4. `sistema_pneumatico_freio`: Estanqueidade pneumática geral, atuação de cuícas duplas/simples e regulagem de catracas de freio.
5. `reaperto_final_rodas`: Torque final conferido nas porcas de roda e teste de segurança.

### B. Trava de Qualidade e Bloqueio de Conclusão (`CHECKLIST_TECNICO_REPROVADO` / HTTP 409)
- **Estados Canônicos de Vistoria**:
  - `🟡 Pendente`: Vistoria ainda não apontada na OS.
  - `🛡️ Aprovado`: Todos os 5 itens conferidos e atestados pelo mecânico ou inspetor técnico.
  - `❌ Reprovado Crítico`: Pelo menos um item apresentou inconformidade ou risco à rodagem.
- **Trava de Segurança Operacional**:
  - Se a OS estiver com status `reprovado_critico`, qualquer tentativa de finalizar a OS (`finalizar os <id>` ou `acao: 'finalizar'`) é bloqueada imediatamente com erro HTTP `409` (`CHECKLIST_TECNICO_REPROVADO`).
  - O veículo só pode ser concluído e liberado para entrega após a correção técnica da falha e novo apontamento de aprovação.

### C. Comandos de Vistoria e Laudo via WhatsApp Bot
Mecânicos e inspetores podem registrar e consultar o laudo de vistoria diretamente no WhatsApp:
- `checklist os <id> ok [obs]` ou `vistoria os <id> ok`: aprova todos os 5 itens simultaneamente e emite o selo `🛡️ VISTORIA TÉCNICA APROVADA`.
- `checklist os <id> falha <motivo>` (ex.: `checklist os 101 falha vazamento valvula pedal`): aponta reprovação crítica, detalha o motivo e ativa a trava de bloqueio de finalização.
- `laudo os <id>` ou `checklist os <id>`: consulta o laudo completo estruturado com o status individual de cada item, dados do avaliador e recomendações técnicas.

### D. Selo de Vistoria Técnica e Ações Rápidas no Frontend
- **Badges nos Cards de Pátio**:
  - `🛡️ Vistoria OK`: exibido com destaque verde quando todos os testes estão conformes.
  - `⚠️ Falha Vistoria`: exibido em vermelho de alerta quando há falha de segurança bloqueando o pátio.
- **Ação Rápida**:
  - Botão `🛡️ Checklist OK` (`data-act="aprovar-checklist-os"`) nos cards de OS, permitindo aprovação rápida com 1 clique pelo inspetor ou mecânico.
- **Trilha de Auditoria**:
  - Todas as aprovações e reprovações de checklist são registradas no SQLite (`patio:os:checklist_tecnico`).

---

## 14. Rastreamento de Garantia por Placa (90 dias), Retorno em Garantia e Dossiê Operacional

### A. Regra da Janela de Garantia (90 Dias Canônicos)
Para frotistas e transportadoras de linha pesada, a confiabilidade de peças e serviços de molas, suspensão e freios é crítica.
- **Janela Padrão**: 90 dias corridos a partir da data de entrega/conclusão de qualquer Ordem de Serviço anterior.
- **Dossiê Unificado**: A busca por placa unifica todo o histórico de manutenções, peças aplicadas, datas de intervenção e alertas de garantia ativa.

### B. Liberação Isenta de Portaria (`liberado_garantia`)
Quando um caminhão retorna à oficina em garantia:
- A OS atual é vinculada formalmente à OS de origem (`isRetornoGarantia: true`, `osOrigemGarantiaId`, `motivoGarantia`).
- O status de liberação do veículo é definido como `liberado_garantia`.
- **Portaria Inteligente**: Veículos em retorno de garantia são autorizados a sair do pátio sem exigência de quitação financeira ou faturamento a prazo, evitando paradas indevidas na guarita.
- **Aviso ao Cliente**: Os avisos gerados pelo WhatsApp destacam a isenção de custos decorrente da cobertura de garantia.

### C. Comandos do WhatsApp Bot
1. **Consulta de Histórico e Garantia por Placa**:
   - `garantia placa <placa>` ou `historico placa <placa>` ou `consultar placa <placa>`
   - Exemplo: `garantia placa ABC1D23`
   - Retorna dossiê com total de OSs, indicador se o veículo está em garantia ativa de 90 dias, data da última entrega e relação consolidada de peças aplicadas.
2. **Vinculação de Retorno de Garantia na OS**:
   - `garantia os <osId> origem <osOrigemId> <motivo>`
   - Exemplo: `garantia os 105 origem 101 mola quebrou novamente`
   - Vincula a OS atual à OS de origem, marca o serviço como isento, atribui o status `liberado_garantia` e notifica o canal operacional.

### D. Indicadores Visuais e Dossiê no Frontend
- **Badges no Card da OS**:
  - `🔄 Garantia (OS #<origem>)`: destaca imediatamente para os mecânicos e pátio que o serviço se trata de um retrabalho coberto.
  - `🛡️ Liberado (Garantia)`: identifica que a liberação na portaria está autorizada sem pendência financeira.
- **Ação Rápida no Pátio**:
  - Botão `🔍 Histórico Placa` (`data-act="historico-placa-os"`): permite que qualquer operador consulte o dossiê completo de manutenções e peças daquele cavalo mecânico com 1 clique direto no card.
- **Trilha de Auditoria**:
  - Toda vinculação de retorno de garantia é persistida e auditada no SQLite (`patio:os:retorno_garantia`).

---

## 15. Dashboard BI, Relatórios Periódicos de Produtividade (Boxes/Mecânicos) e Comissões (Release v1.0.0)

### A. Visão Geral do Módulo BI
O módulo de Business Intelligence & Produtividade Operacional consolida o desempenho técnico e financeiro do pátio e chão de oficina, integrando as Ordens de Serviço aos boxes físicos e mecânicos responsáveis.

### B. Cartões de KPI e Indicadores Canônicos
1. **💰 Faturamento Total de Mão de Obra**: Soma dos valores de serviços executados no período selecionado.
2. **⏱️ Tempo Médio de Box**: Duração média de permanência dos caminhões em boxes de oficina.
3. **🔄 Taxa de Giro de Oficina**: Proporção de OSs concluídas em relação ao número total de boxes disponíveis.
4. **🤝 Total de Comissões a Pagar**: Total apurado de comissões da equipe técnica (alíquota padrão de 20%).
   - **Regra de Exclusão de Garantia**: Retornos em garantia (`isRetornoGarantia: true`) são estritamente expurgados da base comissionável, remunerando apenas mão de obra nova faturada.

### C. Visualizações e Gráficos em Barras Responsivos
- **Ranking de Produtividade por Mecânico**: Barra de progresso proporcional com faturamento bruto de mão de obra gerada, total de OSs atendidas/finalizadas e valor individual de comissão apurada.
- **Atendimentos & Ocupação por Box**: Volume de veículos atendidos em cada baia física de oficina e tempo médio de giro.
- **Seletor de Período Dinâmico**: Alternador interativo entre `📅 Visão Semanal` (últimos 7 dias) e `🗓️ Visão Mensal` (mês corrente).

### D. Comandos via WhatsApp Bot
Disponíveis para perfis autorizados (`mecanico`, `atendente`, `financeiro`, `dono`, `gerente`):
- `relatorio semanal` ou `produtividade semana`: emite o boletim analítico resumido dos últimos 7 dias.
- `relatorio mensal` ou `fechamento mes`: emite o consolidado executivo mensal.
- `comissoes` ou `minha comissao`:
  - Se enviado pelo mecânico cadastrado: emite o extrato individual com base de cálculo, OSs finalizadas, deduções de garantia e valor líquido a receber.
  - Se enviado por gestor/financeiro: emite o relatório consolidado de comissões de toda a equipe.

### E. Consolidação da Release v1.0.0
Com a conclusão da Frente 10 (10A, 10B e 10C), o Patio-CRM atinge o marco **v1.0.0**, com todas as rotinas operacionais (boxes, pátio, apontamento, almoxarifado, checklist pesado, garantias por placa, DRE operacional e BI de comissões) totalmente integradas, auditadas no SQLite e validadas criptograficamente pelo Manifesto de Release.

---

## 16. Checklist de Homologação, Homologação E2E e Critérios de Aceite para Produção

### A. Matriz de Homologação e Critérios de Aceite (Go/No-Go)
Para a liberação definitiva em ambiente operacional de produção, o sistema deve atender rigorosamente aos seguintes critérios inegociáveis:
1. **Segurança RBAC Estrita**: Bloqueio compulsório com HTTP `403 Forbidden` para tentativas de acesso a endpoints financeiros críticos (`sangria`, `suprimento`, `estorno`, `faturamento`) por perfis não autorizados (`mecanico`, `atendente`).
2. **Resiliência e Idempotência**: Travas de colisão em nível de domínio (`BOX_JA_OCUPADO`, `MOVIMENTO_JA_ESTORNADO`, `CAIXA_JA_FECHADO`, `ESTOQUE_INSUFICIENTE`) respondendo com HTTP `409 Conflict` e sem corrupção de estado.
3. **Auditoria Transacional no SQLite**: Registro persistente e assíncrono de todos os eventos de mutação em `security_audit_log` (`patio:*` e `financeiro:*`).
4. **Integridade do Banco de Dados**: Execução sem falhas de `PRAGMA integrity_check` retornando status `ok`.
5. **Cobertura de Testes**: 100% de aprovação na bateria de suítes de teste executadas com `--test-concurrency=1`.
6. **Integridade Criptográfica**: Todos os arquivos do repositório validados contra seus respectivos hashes SHA-256 no Manifesto de Release.

### B. Suíte E2E da Jornada Completa de Linha Pesada (`tests/homologacao_e2e.test.cjs`)
Valida a simulação ponta a ponta do fluxo real de atendimento de veículos pesados:
1. **Etapa 1 — Entrada e Alocação de Box**: Registro da OS vinculada à placa e ocupação do box físico (`BOX-01`), com bloqueio automático contra sobreposição.
2. **Etapa 2 — Início e Baixa de Peças**: Apontamento de início de serviço pelo mecânico e requisição de componentes de suspensão com dedução imediata no estoque.
3. **Etapa 3 — Gestão de Gargalo Operacional**: Pausa do atendimento por falta de peça e desbloqueio/retomada com registro histórico de gargalo.
4. **Etapa 4 — Vistoria Técnica e Qualidade**: Preenchimento e aprovação compulsória do Checklist Técnico de Linha Pesada (torque de grampos de mola, buchas e freios) antes da conclusão.
5. **Etapa 5 — Pagamento Misto e Faturamento**: Recebimento de sinal via Pix no caixa ativo e faturamento do saldo residual a prazo via Boleto Bancário gerando títulos em Contas a Receber.
6. **Etapa 6 — Portaria e Produtividade**: Validação da saída autorizada (`liberado_faturado`), desocupação do box e apuração de produtividade com cálculo de comissões expurgando ordens de retorno em garantia.

### C. Blindagem de Segurança RBAC e Trilha de Auditoria SQLite (`tests/security_rbac_hardening.test.cjs`)
- Valida o isolamento de privilégios com base no perfil autenticado (`req.securityContext`).
- Injeção de payloads de teste de intrusão e caracteres especiais comprovando que o middleware de permissões aborta a requisição antes da camada de persistência.
- Trilha de auditoria no SQLite gravando tentativas negadas e execuções autorizadas.

### D. Estabilidade de Concorrência, Transações Atômicas e Travas de Idempotência (`tests/concurrency_stability.test.cjs`)
- Simulação de disparos concorrentes em paralelo (`Promise.all`) disputando o mesmo box de oficina, comprovando que apenas uma OS conquista a vaga e as demais recebem HTTP `409 Conflict`.
- Teste de idempotência contra duplicidade de estornos contábeis e fechamentos repetidos de caixa.
- Verificação de estoque mínimo e prevenção de saldos negativos sob alta concorrência.

### E. Checklist de Prontidão Operacional e Conclusão da Release v1.0.0-homologacao
- [x] Árvore Git limpa e sincronizada com `origin/main`.
- [x] Arquivo canônico `docs/evidencias/implantacao_real_host_2026-09-21.json` 100% intocado.
- [x] Manifesto de release criptográfico (`manifesto_release.json`) atualizado com hashes SHA-256 de todos os artefatos.
- [x] Suíte completa de testes unitários, de integração, segurança, estabilidade e E2E aprovada com zero falhas.
- [x] Versão pronta para implantação assistida e homologação de campo: **v1.0.0-homologacao**.








