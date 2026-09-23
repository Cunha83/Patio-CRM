# Pátio CRM — CRM Operacional para Oficinas Pesadas

CRM operacional e sistema de gestão de pátio para oficinas mecânicas de linha pesada (caminhões, carretas, ônibus e frotistas), **integrado ao ERP fiscal-contábil da empresa**.

> [!NOTE]
> **POSICIONAMENTO E ESCOPO:** O Pátio CRM é um software de gestão de chão de fábrica e relacionamento operacional (pátio, boxes, ordens de serviço, orçamentos rápidos, aprovação digital, apontamento de mecânicos e estoque de peças pesadas). O Pátio CRM **não é um ERP completo nem emissor/escriturador fiscal**. A emissão de notas fiscais (NF-e, NFS-e) e a escrituração contábil/fiscal oficial devem ser realizadas através do ERP externo integrado da empresa.

---

## 1. Primeiros Passos e Execução

1. Instale as dependências:
   ```bash
   npm ci
   ```
2. Configure as variáveis de ambiente a partir do exemplo:
   ```bash
   copy .env.example .env
   ```
   *Defina uma chave de API forte em `API_KEY` (mínimo 12 caracteres).*
3. Provisione o primeiro administrador de forma explícita e segura:
   ```bash
   # Administrador da plataforma SaaS (Real Soluções)
   node scripts/provision-admin.js --role platform_admin --username admin@realsolucoes.com.br

   # Administrador de oficina (tenant_admin)
   node scripts/provision-admin.js --role tenant_admin --tenant default --username gestor@oficina.com.br --password "MinhaSenhaForte@2026"
   ```
4. Inicie o servidor:
   ```bash
   npm start
   ```
   Acesse via navegador em `http://localhost:3000`.

---

## 2. Autenticação Persistente & RBAC Granular

- **Armazenamento Seguro:** Usuários, senhas criptografadas com `crypto.scrypt` (salt aleatório de 16 bytes), status de bloqueio por tentativas e vínculos com oficinas (*memberships*) são persistidos no SQLite (`users`, `memberships`).
- **Política de Senhas:** Validação de entropia (mínimo de 12 caracteres, letras maiúsculas, minúsculas, números e símbolos). Senhas fracas ou padrões (como `patio`) são rejeitadas.
- **Papéis Granulares:**
  - `platform_admin`: Superusuário do SaaS com acesso restrito a `/api/platform/*`.
  - `platform_support`: Suporte com sessão auditada e temporária (`x-support-session`).
  - `tenant_admin`: Administrador da oficina com controle total do tenant.
  - `gerente`, `atendente`, `compras`, `estoquista`, `mecanico`, `financeiro`: Papéis operacionais com filtragem estrita de coleções no servidor.
- **Proteção de Dados Sensíveis:** Usuários sem permissão financeira não recebem nem podem alterar saldos, contas ou movimentações.
- **Trilha de Auditoria Imutável:** Registros de auditoria (`auditoria`) são estritamente acumulativos (*append-only*) para todos os usuários, incluindo administradores.

---

## 3. Indicadores Financeiros Gerenciais

Todos os indicadores e relatórios de rentabilidade no Pátio CRM são de **natureza gerencial operacional**:
- **Demonstrativo Gerencial de Resultados (Regime de Caixa):** Calculado exclusivamente a partir das entradas e saídas financeiras realizadas no caixa da oficina para controle de liquidez imediata.
- **Não substitui a DRE Contábil:** A DRE societária por competência e os livros fiscais oficiais são gerados pelo ERP contábil integrado da empresa.

---

## 4. Integração com ERP Fiscal-Contábil

O Pátio CRM disponibiliza uma camada documentada de integração via API REST para alimentar ERPs externos (Totvs, Omie, Sankhya, ContaAzul, Bling, etc.):
- **Exportação Canônica:** Clientes, Fornecedores, Peças/SKUs, Ordens de Serviço faturadas, Pedidos de Compra e Títulos a pagar/receber.
- **Identificadores Estáveis e Idempotência:** Versionamento `schemaVersion: 1.0.0`, suporte a cursores de paginação e confirmação de sincronismo via `POST /api/integracao/erp/sincronizar`.
- Consulte o manual completo em [docs/INTEGRACAO_ERP.md](docs/INTEGRACAO_ERP.md).

---

## 5. Rotina de Backup WAL e Continuidade de Negócio

- **Backup Atômico SQLite WAL:** Executado via comando nativo `VACUUM INTO`, capturando o estado íntegro do banco de dados e do WAL sem travar leituras.
- **Integridade Criptográfica:** Geração de checksum SHA-256 e validação por `PRAGMA integrity_check`.
- **RPO:** Máximo de 1 hora.
- **RTO:** Menos de 5 segundos para validação e restauração de base típica de oficina.
- Consulte o guia operacional em [docs/OPERACAO_E_SUPORTE.md](docs/OPERACAO_E_SUPORTE.md).

---

## 6. Conformidade com a LGPD

- **Termos de Uso e Política de Privacidade:** Versionados e disponíveis em `/termos.html` e `/privacidade.html`, com aceite formal gravado no banco de dados (`terms_consents`).
- **Retenção Fiscal de 5 Anos:** Esclarecimento transparente sobre a obrigação legal de guarda de ordens de serviço e notas de peças (CTN Art. 173 e CC Art. 206), associada à anonimização seletiva de contatos comerciais.
- **Protocolo de Incidentes:** Processo estruturado em conformidade com as diretrizes da ANPD em [docs/RESPOSTA_A_INCIDENTES.md](docs/RESPOSTA_A_INCIDENTES.md).

---

## 7. Testes Automatizados

Execute a suíte de testes:
```bash
npm test
```
A cobertura inclui testes unitários e de integração de autenticação persistente, RBAC, cobrança durável, concorrência, backups WAL e camada de integração ERP.
