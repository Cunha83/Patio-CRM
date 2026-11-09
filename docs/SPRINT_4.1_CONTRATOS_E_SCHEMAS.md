# Pátio CRM — Contratos de API e Schemas (Sprint 4.1: Linha Pesada & Comissionamento)

**Versão:** Pátio CRM `v1.2.0-alpha` / Sprint 4.1  
**Data:** 2026-11-09  
**Módulos Adicionados:** `services/vehicleArticulatedResolver.js`, `services/commissionService.js`, `services/springReclampTrigger.js`, `routes/financial_commission.routes.js`.

---

## 1. Schema e Contratos: Conjuntos Articulados (Cavalo + Carreta)

### 1.1. Objeto `conjunto` na Ordem de Serviço (`os.conjunto`)
```json
{
  "isArticulado": true,
  "tipoConjunto": "cavalo_carreta", // "simples" | "cavalo_carreta" | "bitrem_rodotrem"
  "cavalo": {
    "id": "v_123456",
    "placa": "BRA2E19",
    "modelo": "Scania R440",
    "marca": "Scania"
  },
  "implementos": [
    {
      "id": "v_789012",
      "placa": "PRT9F88",
      "tipo": "Carreta", // "Carreta" | "Semirreboque" | "Bitrem" | "Dolly"
      "modelo": "Semirreboque Graneleiro",
      "eixos": 3
    }
  ]
}
```

### 1.2. Segregação de Itens (Serviços e Peças)
Cada item em `os.servicos` e `os.pecas` suporta os atributos de alocação no conjunto:
- `alvo`: `'cavalo'` | `'carreta'` | `'implemento'`
- `placaAlvo`: Placa específica do veículo destinatário do serviço/peça (ex: `"PRT9F88"`).

### 1.3. Contrato da Fachada `vehicleEntryService.processarEntradaVeiculo`
```javascript
const resultado = await processarEntradaVeiculo({
  placa: 'BRA2E19',              // Placa do cavalo mecânico ou veículo principal
  placaCarreta: 'PRT9F88',        // Opcional: placa da carreta engatada
  placasImplementos: ['PRT9F88'], // Opcional: lista para bitrem/rodotrem
  clienteNome: 'Transportes Rápidos Ltda',
  clienteFone: '11988887777',
  textoOriginal: 'Revisão de suspensão do cavalo e troca de molas da carreta',
  servicos: [
    { id: 's1', nome: 'Troca de buchas', valor: 300, alvo: 'cavalo', placaAlvo: 'BRA2E19' },
    { id: 's2', nome: 'Arqueamento de feixe', valor: 600, alvo: 'carreta', placaAlvo: 'PRT9F88' }
  ],
  req
});
```

---

## 2. Endpoints e Contratos: Motor de Comissionamento de Mecânicos

### 2.1. `GET /api/financeiro/comissoes`
- **Permissão Exigida:** `financial:read` ou `productivity:manage`
- **Query Params:**
  - `dataInicio` (ISO: `YYYY-MM-DD`): data inicial do período de fechamento
  - `dataFim` (ISO: `YYYY-MM-DD`): data final do período de fechamento
  - `workerId` (opcional): filtra apenas um colaborador específico
- **Resposta (200 OK):**
```json
{
  "ok": true,
  "periodo": {
    "inicio": "2026-11-01",
    "fim": "2026-11-15"
  },
  "resumoGeral": {
    "totalMaoDeObra": 1800.00,
    "totalComissoes": 219.00,
    "totalServicos": 3,
    "totalColaboradores": 2
  },
  "colaboradores": [
    {
      "workerId": "wrk_joao",
      "nome": "João Mecânico Mestre",
      "funcao": "Mecânico Suspensão",
      "percentualPadrao": 12.0,
      "totalServicos": 2,
      "totalMaoDeObra": 1675.00,
      "totalComissao": 201.00,
      "detalhesOS": [
        {
          "osId": "os_101",
          "osNum": "101",
          "data": "2026-11-05",
          "placa": "BRA2E19",
          "serviceNome": "Troca de Feixe de Molas Traseiro",
          "valorMaoDeObra": 1000.00,
          "percentualAplicado": 12.0,
          "valorComissao": 120.00,
          "bloqueada": false,
          "motivoBloqueio": null
        }
      ]
    }
  ]
}
```

### 2.2. `GET /api/financeiro/comissoes/colaborador/:workerId`
- **Permissão Exigida:** `financial:read`, `productivity:manage` ou `labor:read` (para auto-consulta do mecânico)
- **Resposta (200 OK):** Extrato consolidado do colaborador com totalizador e histórico de OSs faturadas.

---

## 3. Gatilho Preventivo de Reaperto de Grampos de Mola (D+7 / 500 km)

### 3.1. Objeto Criado em `state.opportunities`
```json
{
  "id": "opp_1731154200_a1b2c3",
  "tenantId": "default",
  "tipo": "reaperto_preventivo_grampos",
  "origemOSId": "os_1001",
  "origemOSNum": "1001",
  "vehicleId": "v_scania_1",
  "placa": "SCN1A23",
  "clienteId": "cli_frota_1",
  "clienteNome": "Transportes Rápidos Ltda",
  "titulo": "Reaperto Preventivo Gratuito de Grampos (500 km / 7d) - Placa SCN1A23",
  "descricao": "Reaperto obrigatório de garantia após manutenção no feixe de molas/suspensão na OS #1001.",
  "dataPrevista": "2026-11-09",
  "kmEstimado": 245500,
  "gratuito": true,
  "valorEstimado": 0.00,
  "status": "agendada",
  "termosIdentificados": ["feixe", "mola", "grampo"],
  "criadoEm": "2026-11-09T12:00:00.000Z"
}
```

### 3.2. Formato da Notificação WhatsApp
Disparada automaticamente no canal da transportadora / motorista alertando sobre o retorno gratuito de 20 minutos para reaperto de garantia com torquímetro.
