# Documentação de Contratos & Schemas: Sprint 4.2 — Faturamento em Lote de Frotas (Borderô) & Gestão de Boletos B2B

## 1. Visão Geral
A Sprint 4.2 introduziu a infraestrutura financeira e operacional para faturamento corporativo de transportadoras e clientes frotistas. Em vez de liquidação individual de cada Ordem de Serviço no balcão, o sistema consolida as OSs finalizadas/entregues em lotes de competência (Borderôs), segrega mão de obra de peças, aplica retenções tributárias/descontos contratuais, desdobra duplicatas a receber e emite boletos bancários híbridos no padrão Febraban com QR Code Pix integrado.

---

## 2. Motor de Títulos e Boletos Bancários (`services/billing/boletoEngine.js`)

### 2.1. Padrões Febraban Suportados
- **Bancos Homologados:**
  - `001` — Banco do Brasil
  - `237` — Banco Bradesco
  - `341` — Banco Itaú
  - `756` — Sicoob
  - `748` — Sicredi
- **Código de Barras (44 dígitos):**
  - Pos 01-03: Código do Banco
  - Pos 04: Código da Moeda (`9` = Real)
  - Pos 05: Dígito Verificador Geral (Módulo 11 Febraban, pesos 2 a 9 da direita para a esquerda; resto 0, 10 ou 11 -> DV = 1)
  - Pos 06-09: Fator de Vencimento Febraban (calculado em dias desde 07/10/1997; suporte à virada de ciclo de 22/02/2025 para 1000)
  - Pos 10-19: Valor Nominal em centavos (10 posições com zeros à esquerda)
  - Pos 20-44: Campo Livre Bancário (25 posições compostas por carteira, agência, conta e nosso número)
- **Linha Digitável (47 dígitos mascarados):**
  - Campo 1: `AAABC.CCCCX` (Banco, moeda, primeiras 5 posições do campo livre e DV mod 10)
  - Campo 2: `DDDDD.DDDDDY` (Posições 6 a 15 do campo livre e DV mod 10)
  - Campo 3: `EEEEE.EEEEEZ` (Posições 16 a 25 do campo livre e DV mod 10)
  - Campo 4: `K` (Dígito verificador geral do código de barras)
  - Campo 5: `UUUUVVVVVVVVVV` (Fator de vencimento de 4 dígitos + valor de 10 dígitos)
- **Boleto Híbrido com Pix Dinâmico:**
  - Payload padrão EMVCo do Banco Central do Brasil com chave Pix, recebedor, cidade, valor, identificador txid único e checksum CRC16-CCITT (0xFFFF polinômio 0x1021).
- **Encargos por Atraso:**
  - Multa percentual configurável (padrão 2%).
  - Juros de mora mensais (padrão 1% a.m. pro rata die = 0,033% ao dia de atraso).

---

## 3. Estrutura de Dados do Borderô (`state.borderos`)

```json
{
  "id": "bord_a1b2c3d4",
  "num": "BORD-0001",
  "tenantId": "tenant_empresa_1",
  "clienteId": "cli_transp_alfa",
  "clienteNome": "Transnorte Logística Ltda",
  "clienteDoc": "12.345.678/0001-90",
  "status": "faturado",
  "osIds": ["os_101", "os_102"],
  "resumoOS": [
    {
      "osId": "os_101",
      "num": "101",
      "placa": "ABC1D23",
      "modelo": "Volvo FH 540",
      "fechamento": "2026-11-05T10:00:00Z",
      "totalMaoDeObra": 800.00,
      "totalPecas": 1200.00,
      "totalOS": 2000.00,
      "discriminacaoArticulado": []
    },
    {
      "osId": "os_102",
      "num": "102",
      "placa": "XYZ9K87",
      "modelo": "Scania R450 + Randon",
      "fechamento": "2026-11-06T14:30:00Z",
      "totalMaoDeObra": 1000.00,
      "totalPecas": 500.00,
      "totalOS": 1500.00,
      "discriminacaoArticulado": [
        { "alvo": "cavalo", "placa": "XYZ9K87", "servicos": [...], "total": 400.00 },
        { "alvo": "carreta", "placa": "CAR1A22", "servicos": [...], "total": 600.00 }
      ]
    }
  ],
  "totais": {
    "totalMaoDeObra": 1800.00,
    "totalPecas": 1700.00,
    "subtotalBruto": 3500.00,
    "descontoGeral": 100.00,
    "retencoes": { "iss": 36.00, "irrf": 52.50 },
    "totalRetencoes": 88.50,
    "totalLiquido": 3311.50
  },
  "condicaoPagamento": "14/28/42",
  "parcelas": [
    {
      "numero": 1,
      "totalParcelas": 3,
      "dias": 14,
      "vencimento": "2026-11-23",
      "valor": 1103.83,
      "contaId": "cta_11223344",
      "boletoId": "bol_55667788",
      "linhaDigitavel": "00190.00009 01234.567890 00017.000001 1 16390000110383",
      "pixCopiaECola": "000201..."
    }
  ],
  "contasIds": ["cta_11223344", "cta_11223345", "cta_11223346"],
  "criadoEm": "2026-11-09T13:00:00.000Z",
  "criadoPor": "gerente_frotas"
}
```

---

## 4. Endpoints de API (`routes/financial_bordero.routes.js`)

| Método | Rota | Permissão RBAC | Descrição |
|---|---|---|---|
| `GET` | `/api/financeiro/bordero/faturaveis` | `financial:read` | Lista OSs finalizadas aptas a faturamento por cliente e período |
| `POST` | `/api/financeiro/bordero/previa` | `financial:read` | Simula totais, retenções, parcelas e espelho sem gravar no banco |
| `POST` | `/api/financeiro/bordero/fechar` | `financial:manage` | Efetiva o borderô: trava OSs (`statusBordero: 'faturado'`) e cria títulos com boletos |
| `GET` | `/api/financeiro/bordero/:id` | `financial:read` | Detalhes do borderô |
| `GET` | `/api/financeiro/bordero/:id/espelho-pdf-data` | `financial:read` | Espelho analítico estruturado para exportação ou PDF |
| `POST` | `/api/financeiro/bordero/:id/cancelar` | `financial:admin` | Estorno atômico: libera OSs e cancela contas a receber associadas |

---

## 5. Regras de Anti-Duplicidade e Concorrência
1. Uma Ordem de Serviço vinculada a um borderô ativo (`statusBordero: 'faturado'` e `os.borderoId`) é categoricamente rejeitada em qualquer nova prévia ou tentativa de fechamento.
2. No cancelamento atômico do borderô (`POST /api/financeiro/bordero/:id/cancelar`), todas as OSs vinculadas têm `os.borderoId = null` e `os.statusBordero = 'aberto'`, permitindo novo faturamento auditado.

