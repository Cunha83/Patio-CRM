# Registro Padronizado de Incidentes e Anomalias — Pátio CRM

Este formulário deve ser utilizado pelo Gestor ou pela equipe de suporte para documentar qualquer erro, comportamento inesperado ou conflito durante os 5 dias do piloto controlado.

> [!CAUTION]
> **Política de Privacidade e Segurança:** Nunca anote senhas, chaves de API, tokens secretos, números completos de cartão de crédito ou dados pessoais protegidos por sigilo (LGPD) neste registro.

---

## Formulário de Registro de Incidente

| Campo | Preenchimento Obrigatório | Exemplo |
|---|---|---|
| **ID do Incidente** | `INC-YYYYMMDD-XX` | `INC-20260922-01` |
| **Data e Hora Exata** | `YYYY-MM-DD HH:MM:SS` (Horário de Brasília) | `2026-09-22 14:35:10` |
| **Canal Utilizado** | `Web UI` / `Voz Navegador` / `API` | `Web UI` |
| **Perfil / Operador** | `Gestor` / `Atendimento` / `Mecânico` | `Atendimento` |
| **Módulo / Tela** | `Pátio` / `Nova OS` / `Peças` / `Financeiro` | `Nova OS` |
| **Operação Tentada** | Descrição suscinta da ação | *Tentativa de salvar OS com placa BRA2E19 no Box 02* |
| **Mensagem na Tela / Erro** | Texto exato exibido em alerta ou console | *"Conflito de versão (409): O estado foi modificado por outro operador"* |
| **Identificadores Envolvidos** | IDs técnicos (sem dados pessoais) | `osId: os_1001`, `boxId: box_2`, `versao: 14` |
| **Impacto Operacional** | `Baixo` (repetiu com sucesso) / `Médio` / `Bloqueante` | `Baixo (clicou novamente e salvou na versão 15)` |
| **Ação Imediata Tomada** | O que o operador fez no momento | *Preservou os dados digitados na tela e confirmou a atualização.* |

---

## Log Histórico de Incidentes do Piloto

| ID | Data/Hora | Canal | Módulo | Erro / Sintoma | Impacto | Resolução / Status |
|---|---|---|---|---|---|---|
| *INC-20260921-00* | *2026-09-21 16:30* | *Ambiente* | *Setup* | *Nenhum incidente bloqueante registrado na homologação.* | *Nenhum* | *Concluído* |
