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
