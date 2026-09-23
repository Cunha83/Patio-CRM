# Protocolo de Resposta a Incidentes de Segurança da Informação (LGPD)

Documento normativo de governança e segurança da informação do **Pátio CRM** (desenvolvido por Real Soluções), alinhado ao Artigo 48 da Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e às Resoluções da Autoridade Nacional de Proteção de Dados (ANPD).

---

## 1. Princípios e Matriz de Responsabilidades

- **Controlador dos Dados:** A Oficina Mecânica contratante, responsável primária perante seus clientes e a ANPD.
- **Operador dos Dados:** A plataforma Pátio CRM (Real Soluções), responsável por fornecer a infraestrutura tecnológica segura, monitoramento e comunicação célere ao controlador em caso de incidente que envolva o banco de dados da aplicação.

---

## 2. Níveis de Severidade e Prazos de Resposta

| Severidade | Descrição do Evento | Prazo para Notificação à Oficina | Comunicação à ANPD |
| :--- | :--- | :--- | :--- |
| **BAIXA** | Bloqueio de IP por brute-force, falha de login isolada ou indisponibilidade operacional momentânea sem violação de dados. | Registro interno no sistema. | Não aplicável. |
| **MÉDIA** | Tentativa de acesso anômalo contida pelas defesas de RBAC, sem evidência de leitura ou cópia de dados confidenciais. | Até 72 horas (relatório gerencial). | Não obrigatória, salvo agravamento. |
| **ALTA** | Suspeita fundada de acesso indevido ou credencial administrativa comprometida. | Até 24 horas. | Avaliada conjuntamente pelo DPO. |
| **CRÍTICA** | Confirmação de acesso não autorizado, exfiltração ou alteração de dados pessoais com risco relevante aos direitos dos titulares. | **Imediato (até 12 horas)**. | **Obrigatória em prazo razoável (até 3 dias úteis)** conforme instrução da ANPD. |

---

## 3. Fases do Fluxo de Resposta a Incidentes

1. **Detecção e Registro:** Identificação via telemetria, logs sanitizados com Correlation ID ou relato humano. O incidente é registrado via `services/incidentResponseService.js`.
2. **Contenção Imediata:** Revogação de sessões ativas (`user_sessions`), reset forçado de credenciais comprometidas, bloqueio de IP ou isolamento do tenant.
3. **Erradicação:** Correção de vulnerabilidade ou encerramento de brecha de configuração.
4. **Recuperação e Validação:** Restauração de integridade a partir de backups WAL certificados via SHA-256 se houver perda ou adulteração.
5. **Comunicação Oficial:**
   - Elaboração do Relatório de Impacto à Proteção de Dados Pessoais (RIPD).
   - Notificação formal aos controladores contendo: descrição da natureza dos dados, titulares afetados, medidas técnicas de mitigação e orientações.
   - Comunicação à ANPD através do formulário eletrônico do canal oficial Gov.br.
6. **Lições Aprendidas:** Atualização de regras de auditoria e revisão de procedimentos operacionais.

---

## 4. Contatos de Emergência
- **Encarregado de Dados (DPO):** `dpo@realsolucoes.com.br`
- **Equipe de Segurança & Suporte:** `suporte@realsolucoes.com.br`
