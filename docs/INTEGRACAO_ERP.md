# Guia de Integração com ERP Fiscal-Contábil Externo — Pátio CRM

Manual de especificação técnica para integração do **Pátio CRM** com sistemas ERP de escrituração fiscal e contabilidade societária (ex: Totvs, Omie, Sankhya, ContaAzul, Bling, Senior, SAP Business One).

---

## 1. Posicionamento e Princípios de Arquitetura

O **Pátio CRM** atua na linha de frente da oficina mecânica pesada:
- Gerenciamento de boxes, agendamento e pátio.
- Abertura, diagnóstico e execução de Ordens de Serviço (OS).
- Orçamentos assistidos com aprovação digital via WhatsApp/Link.
- Apontamento de horas de mecânicos e controle de estoque operacional.

**Papel do ERP Fiscal-Contábil Externo:**
- Emissão de Documentos Fiscais Eletrônicos (NF-e de peças, NFS-e de serviços).
- Apuração de tributos (ICMS, IPI, PIS/COFINS, ISS, Simples Nacional).
- Escrituração fiscal (SPED Fiscal, EFD-Contribuições, REINF) e contabilidade oficial (DRE Societária, Balanço Patrimonial).

---

## 2. Autenticação e Protocolo de Comunicação

As requisições à API de integração devem utilizar HTTPS e autenticação via cabeçalhos:
- `x-api-key`: Chave de API da oficina gerada no Pátio CRM com escopo `erp:sync` ou `*`.
- `x-tenant-id`: Identificador único da oficina no ambiente multi-tenant (ex: `oficina_sao_cristovao`).
- `Content-Type`: `application/json`

---

## 3. Endpoints de Consulta e Exportação Canônica

Todos os endpoints de exportação suportam os seguintes query parameters opcionais:
- `desde`: Data ISO para filtro incremental (ex: `?desde=2026-09-01T00:00:00Z`).
- `limit`: Quantidade máxima de registros por página (padrão: 50, máx: 200).
- `cursor`: ID estável da última entidade recebida para paginação sequencial sem perdas.

### 3.1 Clientes (`GET /api/integracao/erp/exportar/clientes`)
Exporta o cadastro de frotistas e proprietários de veículos para cadastramento no ERP.
```json
{
  "schemaVersion": "1.0.0",
  "total": 120,
  "count": 1,
  "nextCursor": "cli_101",
  "items": [
    {
      "id": "cli_101",
      "erpSyncId": "cli_cli_101",
      "razaoSocial": "Transportadora Rápido Goiás Ltda",
      "nomeFantasia": "Rápido Goiás",
      "tipoPessoa": "J",
      "cpfCnpj": "01234567000189",
      "inscricaoEstadual": "109876543",
      "telefone": "6232001122",
      "email": "financeiro@rapidogoias.com.br",
      "endereco": "Av. Brasil Central, 1500, Setor Industrial",
      "cidade": "Goiânia",
      "uf": "GO",
      "cep": "74000000",
      "ativo": true,
      "atualizadoEm": "2026-09-14T08:30:00.000Z"
    }
  ]
}
```

### 3.2 Fornecedores (`GET /api/integracao/erp/exportar/fornecedores`)
Exporta fornecedores de peças de linha pesada e terceirizados de serviços.

### 3.3 Peças e Produtos (`GET /api/integracao/erp/exportar/pecas`)
Exporta itens com SKU, NCM, custo médio gerencial apurado e saldo em estoque.

### 3.4 Ordens de Serviço Faturadas (`GET /api/integracao/erp/exportar/os`)
Exporta ordens de serviço concluídas e aptas para emissão fiscal no ERP:
- Discriminando serviços com código e valores para emissão da **NFS-e**.
- Discriminando peças aplicadas com SKU e valores para emissão da **NF-e de mercadorias**.
- Indicação do meio de pagamento pactuado e vencimento sugerido.

### 3.5 Títulos do Contas a Pagar/Receber (`GET /api/integracao/erp/exportar/contas`)
Exporta duplicatas gerenciais e previsões para conciliação no módulo financeiro do ERP.

---

## 4. Confirmação de Sincronismo e Idempotência (`POST /api/integracao/erp/sincronizar`)

Após processar a entidade e emitir o documento fiscal no ERP, o integrador envia a confirmação para atualizar o status e salvar o número fiscal no Pátio CRM:

```json
{
  "entityType": "os",
  "entityId": "os_2026_094",
  "erpExternalId": "NFE_98241",
  "status": "synced",
  "errorMessage": null
}
```

---

## 5. Exemplo de Chamada com cURL

```bash
curl -X GET "https://app.patio-crm.com.br/api/integracao/erp/exportar/os?status=finalizada&limit=50" \
  -H "x-api-key: patio-api-secret-2026" \
  -H "x-tenant-id: default"
```
