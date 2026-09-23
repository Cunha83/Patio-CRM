# Configuração e Perfil do Piloto Controlado — Pátio CRM

## 1. Parâmetros de Instalação e Topologia

| Parâmetro | Configuração do Piloto | Justificativa / Governança |
|---|---|---|
| **Escopo de Oficinas** | 1 Oficina (`tenantId: default`) | Unidade piloto inicial com processos controlados. |
| **Instância de Processo** | 1 Processo Node.js v24 supervisionado | Elimina concorrência de múltiplos nós sobre `patio.db`. |
| **Porta HTTP** | `3000` (`HOST: 127.0.0.1` ou IP LAN) | Acesso local ou via intranet privada da oficina. |
| **Banco de Dados** | `DB_PATH: patio.db` (SQLite modo WAL) | Persistência transacional atômica ACID local. |
| **Diretório de Anexos** | `UPLOAD_DIR: public/uploads` | Anexos de vistorias e fotos de OS. |
| **Diretório de Backups** | `BACKUP_DIR: backups` | Destino local dos snapshots atômicos WAL. |
| **Destino Externo (Secundário)**| `BACKUP_EXTERNAL_DIR` (opcional / pendente) | Pendência operacional: pendrive / NAS na rede local. |

---

## 2. Perfis de Usuário Operacionais

Para o período de 5 dias úteis de observação, o piloto inicia com 3 usuários individuais definidos:

### 2.1 Gestor / Administrador da Oficina
- **Papel RBAC (Código):** `tenant_admin` (ou `admin`)
- **Permissões:** `ROLE_PERMISSIONS.tenant_admin` (`['os:*', 'financial:*', 'admin:*', 'reports:*', 'inventory:*', 'purchase:*', 'supplier:*', 'labor:*', 'pricing:*', 'backup:manage', '*']`)
- **Atribuições no Piloto:**
  - Acompanhamento do pátio e tempos de atendimento.
  - Alocação e remanejamento de boxes.
  - Visualização de custos, margens e faturamento de OS.
  - Conferência de caixa gerencial e DRE.
  - Fechamento de ordens de serviço e governança de backup.

### 2.2 Atendimento / Consultor de Pátio
- **Papel RBAC (Código):** `atendente` (ou `consultor`)
- **Permissões:** `ROLE_PERMISSIONS.atendente` (`['os:read', 'os:write', 'operation:read', 'crm:read', 'crm:write', 'crm:contact', 'appointments:read', 'appointments:write', 'quotation:read', 'quotation:write', 'quotation:send']`)
- **Atribuições no Piloto:**
  - Cadastro de novos clientes e frotistas (dados cadastrais e contatos via CRM).
  - Cadastro veicular (placa Mercosul/antiga, modelo, KM de entrada).
  - Abertura de Ordem de Serviço (queixa do motorista).
  - Alocação inicial de box no pátio e agendamentos.
  - Elaboração e envio de orçamentos preliminares (`quotation:write`, `quotation:send`).

### 2.3 Mecânico / Técnico de Box
- **Papel RBAC (Código):** `mecanico`
- **Permissões:** `ROLE_PERMISSIONS.mecanico` (`['os:read', 'inspection:read', 'inspection:write', 'labor:read', 'labor:write', 'inventory:read']`)
- **Blindagem Financeira Ativa:**
  - Valores monetários (R$), custos, preços de venda, margens de lucro e botões de fechamento/faturamento são **estritamente ocultados** no DOM e no payload JSON transmitido ao mecânico.
- **Atribuições no Piloto:**
  - Visualização das OSs alocadas ao seu box (`os:read`).
  - Apontamento de horas e tempo de execução (`labor:read`, `labor:write`).
  - Preenchimento de checklist e laudos de vistoria (`inspection:read`, `inspection:write`).
  - Consulta de peças no almoxarifado para requisição (`inventory:read`).
  - Transição de status operacional da OS (`aguardando` -> `executando` -> `concluído`).

---

## 3. Delimitação Estrita de Funções Habilitadas vs Desabilitadas

### 3.1 Funções Habilitadas no Piloto
- ✅ **Pátio & Boxes:** Visualização visual dos boxes, alocação de veículos e status em tempo real.
- ✅ **Fluxo de OS:** Cadastro de veículo/cliente, triagem, checklist de entrada, apontamentos de peças e serviços.
- ✅ **Almoxarifado & Estoque:** Consulta de estoque mínimo, saldo físico e reserva para OS.
- ✅ **Assistente de Voz no Navegador:** Comandos por microfone no navegador para abertura de OS, apontamento de KM e consultas semânticas de estoque/saldo. Ações críticas (excluir OS, faturar OS) geram token criptográfico de alto risco e exigem confirmação explícita.
- ✅ **Financeiro Gerencial:** Títulos a pagar e a receber, saldo de caixa e fluxo previsto.

### 3.2 Funções Estritamente Fora do Escopo Inicial
- ❌ **WhatsApp Web (WWebJS):** Desativado no ambiente de piloto (`DISABLE_WHATSAPP=true`). Nenhuma automação de mensagens de texto ou comando autônomo será aceito pelo bot durante os primeiros 5 dias.
- ❌ **Emissão Fiscal SEFAZ de Produção:** Desativada (`DISABLE_INTEGRATIONS=true`). A oficina piloto continua emitindo NF-e e NFS-e reais no seu sistema fiscal legado já credenciado.
- ❌ **Cobrança Automatizada via Cartão/Boleto:** Desativada (`billing: disabled`).
