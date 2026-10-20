# 📑 Inventário Técnico de Funções, Motores e Triggers (v1.0.0)

**Pátio-CRM — Sistema Operacional de Chão de Oficina, Pátio e Tesouraria Pesada**  
**Versão Homologada:** `v1.0.0-homologacao`  
**Data:** 2026-10-20  
**Ambiente:** Produção / Piloto Operacional  

Este documento reúne o inventário completo e exaustivo das funções de negócio, parsers de comandos conversacionais e gatilhos de auditoria transacional implementados na release oficial v1.0.0 do **Pátio-CRM**.

---

## 📑 Índice
1. [Motor Analítico e Financeiro (`services/financialAnalystService.js`)](#1-motor-analítico-e-financeiro-servicesfinancialanalystservicejs)
2. [Motor de Mensageria e Bot WhatsApp (`services/whatsapp/whatsappHandlers.js`)](#2-motor-de-mensageria-e-bot-whatsapp-serviceswhatsappwhatsapphandlersjs)
3. [Catálogo de Eventos de Auditoria SQLite (`security_audit_log`)](#3-catálogo-de-eventos-de-auditoria-sqlite-security_audit_log)
4. [Mapeamento de Códigos de Status e Travas de Negócio (HTTP 409)](#4-mapeamento-de-códigos-de-status-e-travas-de-negócio-http-409)

---

## 1. Motor Analítico e Financeiro (`services/financialAnalystService.js`)

Centraliza as regras de negócio, mutações atômicas de estado e cálculos do sistema.

### 1.1 `projetarMovimentacao(draft, payload)`
- **Objetivo:** Adiciona ou projeta uma movimentação financeira de entrada ou saída no estado do tenant.
- **Parâmetros:**
  - `tipo` (`'entrada'` | `'saida'`): Natureza contábil do lançamento.
  - `valor` (Number): Valor nominal em reais (R$).
  - `formaPagamento` (`'dinheiro'`, `'pix'`, `'cartao'`, `'boleto'`, etc.).
  - `categoria` (String): Classificação gerencial (`'Recebimento OS'`, `'Peças'`, `'Despesas Gerais'`).
  - `origem` (`'web'` | `'whatsapp'`): Rastreabilidade do canal criador.
  - `osId` (String, opcional): Vínculo com a Ordem de Serviço.
- **Retorno:** Objeto com a movimentação gerada, ID único, data/hora SP e status de consolidação.

### 1.2 `estornarMovimentacao(draft, payload)`
- **Objetivo:** Executa estorno contábil compensatório de lançamento prévio com trava de duplicidade (`MOVIMENTO_JA_ESTORNADO`).
- **Parâmetros:**
  - `movimentoId` (String): ID do movimento alvo a ser estornado.
  - `motivo` (String): Justificativa obrigatória (mínimo de 3 caracteres).
  - `operador` (String/Objeto): Identificação do responsável (exige perfil Dono/Gestor).
- **Comportamento:**
  - Marca o movimento original com `estornado: true`.
  - Gera um movimento compensatório de contrapartida com valor invertido e `estornoDeId`.
  - Se vinculado a uma OS ou título, reabre o saldo devedor de forma bidirecional.
- **Retorno:** `{ ok: true, movimentoOriginal, movimentoCompensatorio, saldoCaixaAtual }` ou erro 409 se já estornado.

### 1.3 `faturarSaldoOS(draft, payload)`
- **Objetivo:** Fatura a prazo o saldo remanescente de uma OS, convertendo-o em títulos a receber.
- **Parâmetros:**
  - `osId` (String): Identificador da OS.
  - `formaPagamento` (`'boleto'` | `'duplicata'` | `'cheque'` | `'promissoria'`).
  - `parcelas` (Number): Quantidade de parcelas (padrão 1).
  - `prazoDias` (Number): Dias até o primeiro vencimento (ex.: 28 ou 30).
- **Comportamento:**
  - Calcula o saldo líquido devedor (total da OS menos entradas registradas).
  - Cria títulos em `draft.contas` (`tipo: 'receber'`).
  - Atualiza o status de liberação da OS para `liberado_faturado`.
- **Retorno:** `{ ok: true, valorFaturado, parcelas, titulos, resumoOS }`.

### 1.4 `liquidarTituloFinanceiro(draft, payload)`
- **Objetivo:** Realiza a liquidação total ou parcial de um título financeiro pendente.
- **Parâmetros:**
  - `tituloId` (String): ID do título a pagar ou a receber.
  - `valorPago` (Number, opcional): Valor da liquidação (assume saldo total se omitido).
  - `formaPagamento` (String): Meio utilizado (`'pix'`, `'dinheiro'`, `'transferencia'`).
- **Comportamento:**
  - Gera lançamento financeiro compensatório no caixa.
  - Atualiza o título para `pago: true`, `status: 'liquidado'` e data de liquidação.
- **Retorno:** `{ ok: true, tituloLiquidado, movimentacaoGerada }`.

### 1.5 `validarOuAutorizarSaidaPatioOS(draft, payload)`
- **Objetivo:** Valida se a OS possui elegibilidade para transpor a portaria e deixar a oficina.
- **Parâmetros:**
  - `osId` (String): ID da OS.
  - `forcarLiberacao` (Boolean, opcional): Flag para liberação excepcional.
  - `justificativa` (String, se forçada): Motivo registrado na auditoria.
  - `operador` (Objeto): Credenciais do operador (perfil gestor obrigatório se forçado).
- **Critérios de Liberação Automática:**
  - `liberado_quitado`: Saldo devedor zerado.
  - `liberado_faturado`: Saldo residual faturado a prazo em títulos a receber.
  - `liberado_garantia`: OS classificada como retorno de garantia (isenta).
- **Retorno:** `{ ok: true, autorizado: true, statusLiberacaoPatio }` ou erro 409 se retida.

### 1.6 `alocarBoxOS(draft, payload)`
- **Objetivo:** Aloca a Ordem de Serviço em uma baia/box físico de trabalho.
- **Parâmetros:**
  - `osId` (String): ID da OS.
  - `boxId` (String): Identificador do box (ex.: `'BOX-01'`).
  - `mecanico` (String, opcional): Nome do mecânico responsável.
- **Comportamento:**
  - Verifica disponibilidade do box: se ocupado por outra OS, lança erro `BOX_JA_OCUPADO` (HTTP 409).
  - Se a OS já ocupava outro box, libera o box anterior automaticamente.
  - Atualiza o status do box para `'ocupado'` e vincula o `osId`.
- **Retorno:** `{ ok: true, os, box, resumoBoxes }`.

### 1.7 `liberarBoxOS(draft, payload)`
- **Objetivo:** Desocupa o box físico, liberando a vaga para outro caminhão.
- **Parâmetros:**
  - `osId` (String): ID da OS a ser desvinculada do box.
  - `boxId` (String, opcional): ID específico do box.
- **Retorno:** `{ ok: true, boxLiberado, totalBoxesLivres }`.

### 1.8 `registrarApontamentoPatioOS(draft, payload)`
- **Objetivo:** Registra as etapas de trabalho do mecânico no chão de fábrica.
- **Parâmetros:**
  - `osId` (String): ID da OS.
  - `acao` (`'iniciar'` | `'pausar'` | `'finalizar'` | `'pronto'`).
  - `mecanico` (String): Mecânico executante.
  - `motivoGargalo` (String, se pausa): Razão da interrupção (ex.: `'aguardando peca'`).
- **Trava de Qualidade:** Se `acao === 'finalizar'` e o checklist técnico estiver com `statusChecklist === 'reprovado_critico'`, a operação é rejeitada com HTTP 409 (`CHECKLIST_TECNICO_REPROVADO`).
- **Retorno:** `{ ok: true, os, historicoApontamento }`.

### 1.9 `listarEstoquePecas(state, opcoes)`
- **Objetivo:** Retorna o catálogo do almoxarifado com quantidades físicas, custos, preços de venda e alertas de estoque mínimo.
- **Filtros:** Busca textual por termo, código ou SKU.

### 1.10 `requisitarPecaOS(draft, payload)`
- **Objetivo:** Requisita componente do almoxarifado para aplicação na OS, deduzindo o estoque.
- **Parâmetros:**
  - `osId` (String): ID da OS receptora.
  - `pecaIdOuNome` (String): Código, ID ou nome da peça.
  - `quantidade` (Number): Quantidade a ser aplicada.
  - `valorUnitario` (Number, opcional): Preço praticado.
- **Trava de Estoque:** Se `saldoAtual < quantidade`, lança erro `ESTOQUE_INSUFICIENTE` (HTTP 409) sem deduzir nada.
- **Retorno:** `{ ok: true, os, itemPeca, novoSaldoEstoque }`.

### 1.11 `liberarGargaloPecaOS(draft, payload)`
- **Objetivo:** Notifica a chegada de peças que estavam bloqueando a execução da OS, removendo o gargalo e retomando a OS.
- **Retorno:** `{ ok: true, os, statusGargalo: 'desbloqueado' }`.

### 1.12 `estornarPecaOS(draft, payload)`
- **Objetivo:** Devolve peça requisitada na OS de volta ao almoxarifado, recompondo o saldo de estoque e recalculando o total da OS.
- **Retorno:** `{ ok: true, os, pecaDevolvida, novoSaldoEstoque }`.

### 1.13 `calcularDREOperacional(state, opcoes)` / `calcularDRESimplificado(state, opcoes)`
- **Objetivo:** Apura o Demonstrativo de Resultado Operacional gerencial em regime de caixa.
- **Métricas:** Receita Bruta de Serviços, Receita de Peças, Custo de Peças Aplicadas (CMV), Deduções Operacionais, Lucro Bruto e Margem de Contribuição Operacional (%).

### 1.14 `gerarAvisoClienteOS(state, osId)`
- **Objetivo:** Gera modelo de mensagem WhatsApp amigável para envio ao cliente com resumo de serviços, saldo devedor e aviso de prontidão para retirada.

### 1.15 `obterChecklistTecnicoOS(state, osId)`
- **Objetivo:** Retorna o estado da vistoria técnica da OS com laudo detalhado e inicialização canônica dos 5 itens de segurança pesada.
- **Itens Canônicos:**
  1. Torque/Reaperto de Grampos e Feixe de Molas
  2. Alinhamento e Embuchamento de Eixo / Pinos de Centro
  3. Desgaste e Espessura de Lonas/Pastilhas de Freio
  4. Vedação, Cuícas e Válvulas do Sistema Pneumático
  5. Teste de Rodagem e Verificação de Folgas

### 1.16 `registrarChecklistTecnicoOS(draft, payload)`
- **Objetivo:** Registra a aprovação técnica ou reprovação crítica de segurança na OS.
- **Parâmetros:**
  - `osId` (String): ID da OS.
  - `modo` (`'aprovar'` | `'reprovar_critico'`).
  - `observacao` (String): Laudo do técnico.
  - `operador` (String): Responsável pela inspeção.
- **Retorno:** `{ ok: true, statusChecklist, laudoFormatado }`.

### 1.17 `obterHistoricoGarantiaPlaca(state, placa)`
- **Objetivo:** Realiza a varredura completa do histórico de atendimentos da placa nos últimos 90 dias canônicos (Art. 26 CDC).
- **Retorno:** `{ placa, garantiaAtiva, diasRestantes, osAnteriores, servicosExecutados, laudoGarantia }`.

### 1.18 `registrarRetornoGarantiaOS(draft, payload)`
- **Objetivo:** Vincula uma nova OS aberta a uma OS anterior concluída em até 90 dias como retorno em garantia.
- **Efeitos:** Isenta cobrança de mão de obra (`isRetornoGarantia: true`) e expurga o serviço da base comissionável do mecânico.
- **Retorno:** `{ ok: true, os, osOrigem, statusLiberacaoPatio: 'liberado_garantia' }`.

### 1.19 `calcularProdutividadeEComissoes(state, opcoes)`
- **Objetivo:** Motor de BI para produtividade de boxes e apuração de comissões da equipe técnica.
- **Parâmetros:**
  - `periodo` (`'semanal'` | `'mensal'` | `'todos'` | `'custom'`).
  - `dataRef` (String ISO): Data de referência para os cálculos.
  - `percentualComissao` (Number, padrão 0.20 = 20%).
- **Regra de Expurgo de Garantia:**
  - Serviços em garantia (`isRetornoGarantia: true` ou `isentoGarantia: true`) somam em `totalGarantias` e têm comissão zero (R$ 0,00).
- **Retorno:** Objeto com resumo consolidado, ranking de mecânicos (`produtividadeMecanicos`), giro de boxes e taxas de retrabalho.

---

## 2. Motor de Mensageria e Bot WhatsApp (`services/whatsapp/whatsappHandlers.js`)

Centraliza o processamento conversacional em linguagem natural com suporte a comandos diretos, confirmações em duas etapas e segurança em nível de número de telefone.

### 2.1 Comandos de Consulta Imediata (Leitura Direta)
- `!caixa` / `caixa`: Exibe o saldo do caixa ativo, resumo de entradas, saídas e títulos previstos para o dia.
- `!extrato [hoje/semana/mes]`: Emite o extrato contábil discriminado por origem e forma de pagamento.
- `!contas` / `!vencimentos`: Relação de contas a receber e a pagar com alertas de vencimento.
- `!dre` / `dre`: Demonstrativo resumido de resultado operacional gerencial.
- `boxes` / `status boxes`: Mapa de ocupação de todas as baias da oficina.
- `gargalos` / `radar patio`: Lista de OSs paradas no pátio com tempo de estagnação e motivos.
- `estoque [termo]`: Consulta instantânea de saldo e preço de peças pesadas.
- `garantia <placa>`: Dossiê completo da placa e verificação de vigência de garantia de 90 dias.
- `relatorio semanal` / `produtividade semana`: Boletim dos últimos 7 dias.
- `relatorio mensal` / `fechamento mes`: Fechamento executivo mensal.
- `comissoes` / `minha comissao`: Extrato de produtividade e comissão líquida do mecânico ou geral.

### 2.2 Comandos de Chão de Oficina (Apontamento & Pátio)
- `box <n> os <id> [mecanico]`: Aloca o veículo no box especificado.
- `iniciar os <id> [box <n>]`: Registra o início do serviço pelo mecânico.
- `pausar os <id> <motivo>`: Registra pausa por gargalo com notificação ao supervisor.
- `pronto os <id>` / `finalizar os <id>`: Conclui o serviço e move o veículo para a etapa de liberação.
- `peca os <id> <qtd> <peca>`: Requisita componentes na OS com baixa automática de estoque.
- `chegou peca os <id>`: Notifica chegada de componentes e desbloqueia o atendimento.
- `devolver peca os <id> <peca>`: Estorna peça requisitada, devolvendo-a ao almoxarifado.
- `checklist os <id> ok [obs]`: Emite laudo técnico de conformidade da suspensão e freios.
- `checklist os <id> reprovar [obs]`: Retém o veículo com bloqueio de conclusão por falha grave.
- `retorno garantia os <nova> os <origem>`: Vincula a nova OS ao histórico de garantia.

### 2.3 Comandos com Confirmação e Segurança (Escrita Financeira)
- `sangria <valor> <motivo>`: Solicita retirada de numerário. Exige confirmação `sim` em até 60 segundos por perfil autorizado.
- `suprimento <valor> <motivo>`: Solicita aporte de fundo de troco. Exige confirmação `sim`.
- `estorno <mov-id> <motivo>`: Solicita estorno contábil. Requer perfil Dono/Gestor e confirmação explícita.
- `liberar os <id>`: Validação de saída na portaria; se houver pendência financeira, recusa a saída a menos que seja forçada por gestor.

### 2.4 Mecanismos de Proteção do Bot
- **Rate Limiting:** Máximo de requisições por janela temporal para evitar flooding.
- **Idempotência de Mensagens:** Hash único por mensagem (`messageId` e timestamp) evitando execuções duplicadas sob oscilações de rede.
- **Whitelist de Grupos & Números Autorizados:** Verificação de perfil telefônico cruzando com `mecanicos`, `atendentes` e `adminFones`.

---

## 3. Catálogo de Eventos de Auditoria SQLite (`security_audit_log`)

Todos os eventos de impacto contábil, operacional ou de segurança persistem de forma atômica e irreversível na tabela `security_audit_log`.

| Action Auditada | Entidade | Descrição do Evento |
| :--- | :--- | :--- |
| `financeiro:caixa:abrir` | `caixa_diario` | Abertura de turno de caixa com saldo inicial declarado |
| `financeiro:caixa:fechar` | `caixa_turno` | Encerramento de turno de caixa com apuração de diferenças |
| `financeiro:caixa:sangria` | `caixa_diario` | Retirada de numerário em espécie para cofre/banco |
| `financeiro:caixa:suprimento` | `caixa_diario` | Aporte de dinheiro em espécie para fundo de troco |
| `financeiro:movimento:estornar` | `financeiro_movimento` | Execução de estorno contábil compensatório auditado |
| `financeiro:movimento:estorno_negado` | `financeiro_movimento` | Tentativa de estorno rejeitada por falta de permissão |
| `financeiro:os:faturar` | `ordem_servico` | Faturamento do saldo restante da OS em títulos a prazo |
| `financeiro:titulo:liquidar` | `titulo_financeiro` | Quitação total ou parcial de duplicata/boleto |
| `financeiro:os:liberar_saida_excepcional` | `ordem_servico` | Liberação forçada de veículo na portaria com saldo em aberto |
| `financeiro:os:liberar_saida_negada` | `ordem_servico` | Bloqueio de saída de veículo com pendência financeira |
| `financeiro:relatorio:exportar` | `relatorio_financeiro` | Exportação de dados contábeis em formato tabular/JSON |
| `patio:os:alocar_box` | `ordem_servico` | Ocupação de box físico por uma Ordem de Serviço |
| `patio:os:liberar_box` | `ordem_servico` | Desocupação e liberação de baia de trabalho |
| `patio:os:apontamento` | `ordem_servico` | Apontamento de mecânico (iniciar, pausar por gargalo ou finalizar) |
| `patio:os:requisitar_peca` | `ordem_servico` | Aplicação de peças pesadas na OS com baixa de estoque |
| `patio:os:liberar_gargalo_peca` | `ordem_servico` | Desbloqueio de OS após entrega do componente em falta |
| `patio:os:estornar_peca` | `ordem_servico` | Devolução de peças da OS para o almoxarifado |
| `patio:os:checklist_tecnico` | `ordem_servico` | Laudo de vistoria técnica pesada (aprovação ou reprovação) |
| `patio:os:retorno_garantia` | `ordem_servico` | Vinculação de atendimento em garantia por placa (90 dias) |
| `patio:relatorio:produtividade_bi` | `patio_bi` | Emissão de relatório de produtividade e comissões |

---

## 4. Mapeamento de Códigos de Status e Travas de Negócio (HTTP 409)

O Pátio-CRM utiliza códigos de erro semânticos e padronizados para garantir que o cliente (Web ou Bot) compreenda imediatamente a causa de impedimento sem ambiguidade:

| Código de Erro | Status HTTP | Causa / Regra de Negócio Violada |
| :--- | :--- | :--- |
| `BOX_JA_OCUPADO` | `409 Conflict` | O box selecionado já está ocupado por outro caminhão no pátio. |
| `MOVIMENTO_JA_ESTORNADO` | `409 Conflict` | O lançamento contábil já foi objeto de estorno anterior. |
| `CAIXA_JA_FECHADO` | `409 Conflict` | Tentativa de fechar um caixa já encerrado ou operar sem turno ativo. |
| `ESTOQUE_INSUFICIENTE` | `409 Conflict` | Quantidade requisitada é maior do que o saldo físico no almoxarifado. |
| `CHECKLIST_TECNICO_REPROVADO` | `409 Conflict` | Veículo reprovado no checklist de segurança não pode ser finalizado/entregue. |
| `OS_RETIDA_PENDENCIA_FINANCEIRA`| `409 Conflict` | Veículo retido na portaria por ausência de quitação ou faturamento formal. |
| `OS_JA_QUITADA_OU_FATURADA` | `409 Conflict` | Tentativa de faturar OS cujo saldo devedor já está zerado ou em duplicatas. |
| `ACESSO_NEGADO_RBAC` | `403 Forbidden` | Perfil sem permissão para executar operação financeira restrita. |

---

© 2026 Real Soluções & Cunha83 — Documentação de Engenharia e Homologação v1.0.0.
